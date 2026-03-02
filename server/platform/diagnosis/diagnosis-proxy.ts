/**
 * HDE 诊断服务 Strangler Fig 代理
 *
 * 根据 DEPLOYMENT_MODE 路由 HDE 诊断请求：
 * - monolith → 本地 DiagnosticOrchestrator
 * - microservices → HTTP→DiagnosisService（断路器包裹）
 *   → 熔断时自动降级回本地
 *
 * 断路器参数:
 *   timeout: 120s（双轨诊断含 DS 融合，耗时较长）
 *   errorThresholdPercentage: 50%
 *   resetTimeout: 60s
 *   volumeThreshold: 3
 *
 * 单例工厂: getDiagnosisProxy() / resetDiagnosisProxy()
 */

import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';
import type {
  HDEDiagnosisRequest,
  HDEDiagnosisResult,
  HDEDiagnosisConfig,
} from '../hde/types';
import type {
  DiagnosticOrchestratorConfig,
} from '../hde/orchestrator/diagnostic-orchestrator';

const log = createModuleLogger('diagnosis-proxy');

// ============================================================
// IDiagnosisProxy 接口
// ============================================================

export interface IDiagnosisProxy {
  diagnose(request: HDEDiagnosisRequest): Promise<HDEDiagnosisResult>;

  getConfig(): DiagnosticOrchestratorConfig;

  initialize(): Promise<void>;
  shutdown(): void;
}

// ============================================================
// 本地代理（monolith 模式）
// ============================================================

class LocalDiagnosisProxy implements IDiagnosisProxy {
  private orchestrator: import('../hde/orchestrator/diagnostic-orchestrator').DiagnosticOrchestrator | null = null;

  async diagnose(request: HDEDiagnosisRequest): Promise<HDEDiagnosisResult> {
    if (!this.orchestrator) {
      await this.ensureOrchestrator();
    }
    return this.orchestrator!.diagnose(request);
  }

  getConfig(): DiagnosticOrchestratorConfig {
    if (!this.orchestrator) {
      // 同步获取——模块应已加载
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../hde/orchestrator/diagnostic-orchestrator');
        this.orchestrator = mod.createDiagnosticOrchestrator();
      } catch {
        return {
          enablePhysicsTrack: true,
          enableDataTrack: true,
          fusionStrategy: 'physics_veto',
          physicsWeight: 0.6,
          autoCrystallizeThreshold: 0.7,
        };
      }
    }
    return this.orchestrator!.getConfig();
  }

  async initialize(): Promise<void> {
    await this.ensureOrchestrator();
    log.info('LocalDiagnosisProxy initialized');
  }

  shutdown(): void {
    this.orchestrator = null;
  }

  private async ensureOrchestrator(): Promise<void> {
    if (this.orchestrator) return;
    const mod = await import('../hde/orchestrator/diagnostic-orchestrator');
    this.orchestrator = mod.createDiagnosticOrchestrator();
  }
}

// ============================================================
// 远程代理（microservices 模式 + 断路器 + 降级）
// ============================================================

class RemoteDiagnosisProxy implements IDiagnosisProxy {
  private localFallback = new LocalDiagnosisProxy();
  private protectedDiagnose: ((...args: any[]) => Promise<any>) | null = null;
  private protectedGetConfig: ((...args: any[]) => Promise<any>) | null = null;

  async initialize(): Promise<void> {
    await this.localFallback.initialize();

    try {
      const { circuitBreakerRegistry } = await import('../middleware/circuitBreaker');

      // 诊断断路器: 较长超时（双轨诊断含 DS 融合）
      const cbConfig = {
        timeout: 120000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 3,
        rollingCountTimeout: 60000,
        rollingCountBuckets: 6,
        enabled: true,
      };

      const diagnoseBreaker = circuitBreakerRegistry.getBreaker(
        'diagnosis-hde',
        async (request: any) => {
          const serviceUrl = config.grpc.diagnosisServiceUrl || 'http://localhost:3095';
          const res = await fetch(`${serviceUrl}/api/v1/diagnose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(115000),
          });
          if (!res.ok) throw new Error(`Diagnosis service HTTP ${res.status}`);
          return res.json();
        },
        cbConfig,
      );

      const getConfigBreaker = circuitBreakerRegistry.getBreaker(
        'diagnosis-config',
        async () => {
          const serviceUrl = config.grpc.diagnosisServiceUrl || 'http://localhost:3095';
          const res = await fetch(`${serviceUrl}/api/v1/config`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) throw new Error(`Diagnosis service HTTP ${res.status}`);
          return res.json();
        },
        { ...cbConfig, timeout: 15000 },
      );

      this.protectedDiagnose = (request: any) => diagnoseBreaker.fire(request);
      this.protectedGetConfig = () => getConfigBreaker.fire();

      log.info('RemoteDiagnosisProxy initialized with circuit breaker');
    } catch (err: any) {
      log.warn(`RemoteDiagnosisProxy: init failed, using local only: ${err.message}`);
    }
  }

  async diagnose(request: HDEDiagnosisRequest): Promise<HDEDiagnosisResult> {
    if (!this.protectedDiagnose) {
      return this.localFallback.diagnose(request);
    }

    try {
      return await this.protectedDiagnose(request);
    } catch (err: any) {
      log.warn(`[diagnosis-proxy] Remote diagnose failed, falling back to local: ${err.message}`);
      return this.localFallback.diagnose(request);
    }
  }

  getConfig(): DiagnosticOrchestratorConfig {
    // getConfig 同步调用——始终使用本地
    return this.localFallback.getConfig();
  }

  shutdown(): void {
    this.localFallback.shutdown();
    this.protectedDiagnose = null;
    this.protectedGetConfig = null;
  }
}

// ============================================================
// 单例工厂
// ============================================================

let proxy: IDiagnosisProxy | null = null;

export function getDiagnosisProxy(): IDiagnosisProxy {
  if (proxy) return proxy;

  const mode = config.grpc.deploymentMode;

  if (mode === 'microservices') {
    proxy = new RemoteDiagnosisProxy();
    log.info('DiagnosisProxy: using remote (microservices mode)');
  } else {
    proxy = new LocalDiagnosisProxy();
    log.info('DiagnosisProxy: using local (monolith mode)');
  }

  return proxy;
}

export function resetDiagnosisProxy(): void {
  if (proxy) {
    proxy.shutdown();
    proxy = null;
  }
}
