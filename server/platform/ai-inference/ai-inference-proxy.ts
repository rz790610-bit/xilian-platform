/**
 * AI 推理服务 Strangler Fig 代理
 *
 * 根据 DEPLOYMENT_MODE 路由 AI 推理请求：
 * - monolith → 本地 invokeLLM() + diagnose()
 * - microservices → gRPC AIInferenceService（断路器包裹）
 *   → 熔断时自动降级回本地
 *
 * 断路器参数:
 *   timeout: 60s（AI 推理可能很慢）
 *   errorThresholdPercentage: 40%
 *   resetTimeout: 120s（AI 服务恢复较慢）
 *   volumeThreshold: 2
 *
 * 单例工厂: getAIInferenceProxy() / resetAIInferenceProxy()
 */

import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';
import type { InvokeParams, InvokeResult } from '../../core/llm';
import type {
  DiagnosticRequest,
  DiagnosticResult,
} from '../../services/grokDiagnosticAgent.service';

const log = createModuleLogger('ai-inference-proxy');

// ============================================================
// IAIInferenceProxy 接口
// ============================================================

export interface IAIInferenceProxy {
  invokeLLM(params: InvokeParams): Promise<InvokeResult>;

  diagnose(request: DiagnosticRequest): Promise<DiagnosticResult>;

  batchDiagnose(
    devices: DiagnosticRequest[],
    mode?: string,
  ): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<{
      deviceCode: string;
      status: string;
      data?: DiagnosticResult;
      error?: string;
    }>;
  }>;

  getAgentStatus(): {
    enabled: boolean;
    provider: string;
    model: string;
    activeSessions: number;
    config: Record<string, any>;
  };

  initialize(): Promise<void>;
  shutdown(): void;
}

// ============================================================
// 本地代理（monolith 模式）
// ============================================================

class LocalAIInferenceProxy implements IAIInferenceProxy {
  private llmFn: typeof import('../../core/llm').invokeLLM | null = null;
  private diagnoseFn: typeof import('../../services/grokDiagnosticAgent.service').diagnose | null = null;
  private getStatusFn: typeof import('../../services/grokDiagnosticAgent.service').getAgentStatus | null = null;

  async invokeLLM(params: InvokeParams): Promise<InvokeResult> {
    if (!this.llmFn) {
      const mod = await import('../../core/llm');
      this.llmFn = mod.invokeLLM;
    }
    return this.llmFn(params);
  }

  async diagnose(request: DiagnosticRequest): Promise<DiagnosticResult> {
    if (!this.diagnoseFn) {
      const mod = await import('../../services/grokDiagnosticAgent.service');
      this.diagnoseFn = mod.diagnose;
    }
    return this.diagnoseFn(request);
  }

  async batchDiagnose(
    devices: DiagnosticRequest[],
    _mode?: string,
  ) {
    const results = await Promise.allSettled(
      devices.map(d => this.diagnose(d)),
    );

    return {
      total: results.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        deviceCode: devices[i].deviceCode,
        status: r.status,
        data: r.status === 'fulfilled' ? r.value : undefined,
        error: r.status === 'rejected' ? String((r as PromiseRejectedResult).reason) : undefined,
      })),
    };
  }

  getAgentStatus() {
    if (!this.getStatusFn) {
      // 同步获取——模块应已加载
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../../services/grokDiagnosticAgent.service');
        this.getStatusFn = mod.getAgentStatus;
      } catch {
        return { enabled: false, provider: 'none', model: '', activeSessions: 0, config: {} };
      }
    }
    return this.getStatusFn!();
  }

  async initialize(): Promise<void> {
    // 预加载模块
    const [llmMod, diagMod] = await Promise.all([
      import('../../core/llm'),
      import('../../services/grokDiagnosticAgent.service'),
    ]);
    this.llmFn = llmMod.invokeLLM;
    this.diagnoseFn = diagMod.diagnose;
    this.getStatusFn = diagMod.getAgentStatus;
    log.info('LocalAIInferenceProxy initialized');
  }

  shutdown(): void {
    this.llmFn = null;
    this.diagnoseFn = null;
    this.getStatusFn = null;
  }
}

// ============================================================
// 远程代理（microservices 模式 + 断路器 + 降级）
// ============================================================

class RemoteAIInferenceProxy implements IAIInferenceProxy {
  private localFallback = new LocalAIInferenceProxy();
  private grpcClient: any = null;
  private protectedInvoke: ((...args: any[]) => Promise<any>) | null = null;
  private protectedDiagnose: ((...args: any[]) => Promise<any>) | null = null;

  async initialize(): Promise<void> {
    await this.localFallback.initialize();

    try {
      const { circuitBreakerRegistry } = await import('../middleware/circuitBreaker');

      // AI 推理断路器: 更宽松的超时，更低的阈值
      const cbConfig = {
        timeout: 60000,
        errorThresholdPercentage: 40,
        resetTimeout: 120000,
        volumeThreshold: 2,
        rollingCountTimeout: 60000,
        rollingCountBuckets: 6,
        enabled: true,
      };

      // 为 invokeLLM 和 diagnose 分别创建断路器
      // 因为它们的超时特性不同
      const invokeLLMBreaker = circuitBreakerRegistry.getBreaker(
        'ai-inference-llm',
        async (request: any) => {
          const serviceUrl = config.grpc.aiInferenceServiceUrl || 'http://localhost:3090';
          const res = await fetch(`${serviceUrl}/api/v1/llm/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(55000),
          });
          if (!res.ok) throw new Error(`AI service HTTP ${res.status}`);
          return res.json();
        },
        cbConfig,
      );

      const diagnoseBreaker = circuitBreakerRegistry.getBreaker(
        'ai-inference-diagnose',
        async (request: any) => {
          const serviceUrl = config.grpc.aiInferenceServiceUrl || 'http://localhost:3090';
          const res = await fetch(`${serviceUrl}/api/v1/diagnose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(55000),
          });
          if (!res.ok) throw new Error(`AI service HTTP ${res.status}`);
          return res.json();
        },
        cbConfig,
      );

      this.protectedInvoke = (request: any) => invokeLLMBreaker.fire(request);
      this.protectedDiagnose = (request: any) => diagnoseBreaker.fire(request);

      log.info('RemoteAIInferenceProxy initialized with circuit breaker');
    } catch (err: any) {
      log.warn(`RemoteAIInferenceProxy: init failed, using local only: ${err.message}`);
    }
  }

  async invokeLLM(params: InvokeParams): Promise<InvokeResult> {
    if (!this.protectedInvoke) {
      return this.localFallback.invokeLLM(params);
    }

    try {
      return await this.protectedInvoke(params);
    } catch (err: any) {
      log.warn(`[ai-proxy] Remote invokeLLM failed, falling back to local: ${err.message}`);
      return this.localFallback.invokeLLM(params);
    }
  }

  async diagnose(request: DiagnosticRequest): Promise<DiagnosticResult> {
    if (!this.protectedDiagnose) {
      return this.localFallback.diagnose(request);
    }

    try {
      return await this.protectedDiagnose(request);
    } catch (err: any) {
      log.warn(`[ai-proxy] Remote diagnose failed, falling back to local: ${err.message}`);
      return this.localFallback.diagnose(request);
    }
  }

  async batchDiagnose(devices: DiagnosticRequest[], mode?: string) {
    // 批量诊断始终使用单独的 diagnose 调用（通过代理）
    const results = await Promise.allSettled(
      devices.map(d => this.diagnose({ ...d, mode: (mode || d.mode || 'quick') as any })),
    );

    return {
      total: results.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        deviceCode: devices[i].deviceCode,
        status: r.status,
        data: r.status === 'fulfilled' ? r.value : undefined,
        error: r.status === 'rejected' ? String((r as PromiseRejectedResult).reason) : undefined,
      })),
    };
  }

  getAgentStatus() {
    return this.localFallback.getAgentStatus();
  }

  shutdown(): void {
    this.localFallback.shutdown();
    this.protectedInvoke = null;
    this.protectedDiagnose = null;
  }
}

// ============================================================
// 单例工厂
// ============================================================

let proxy: IAIInferenceProxy | null = null;

export function getAIInferenceProxy(): IAIInferenceProxy {
  if (proxy) return proxy;

  const mode = config.grpc.deploymentMode;

  if (mode === 'microservices') {
    proxy = new RemoteAIInferenceProxy();
    log.info('AIInferenceProxy: using remote (microservices mode)');
  } else {
    proxy = new LocalAIInferenceProxy();
    log.info('AIInferenceProxy: using local (monolith mode)');
  }

  return proxy;
}

export function resetAIInferenceProxy(): void {
  if (proxy) {
    proxy.shutdown();
    proxy = null;
  }
}
