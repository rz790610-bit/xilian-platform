/**
 * 算法服务 Strangler Fig 代理
 *
 * 根据 DEPLOYMENT_MODE 路由算法执行请求：
 * - monolith → 本地 AlgorithmEngine.execute()
 * - microservices → gRPC AlgorithmServiceClient（opossum 断路器包裹）
 *   → 断路器熔断时自动降级回本地 AlgorithmEngine
 *
 * 断路器参数:
 *   timeout: 120s（算法执行可能很慢）
 *   errorThresholdPercentage: 50%
 *   resetTimeout: 60s
 *   volumeThreshold: 3
 *
 * 单例工厂: getAlgorithmProxy() / resetAlgorithmProxy()
 */

import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';
import type { AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import type { ExecutionContext } from '../../algorithms/_core/engine';

const log = createModuleLogger('algorithm-proxy');

// ============================================================
// AlgorithmProxy 接口
// ============================================================

export interface IAlgorithmProxy {
  execute(
    algorithmId: string,
    input: AlgorithmInput,
    config?: Record<string, any>,
    context?: Partial<ExecutionContext>,
  ): Promise<AlgorithmOutput>;

  executeComposition(
    steps: Array<{
      algorithmId: string;
      config?: Record<string, any>;
      inputMapping?: Record<string, string>;
    }>,
    initialInput: AlgorithmInput,
    context?: Partial<ExecutionContext>,
  ): Promise<{ steps: AlgorithmOutput[]; finalOutput: AlgorithmOutput }>;

  listAlgorithms(filter?: {
    category?: string;
    tag?: string;
    deviceType?: string;
  }): Promise<AlgorithmRegistration[]>;

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

// ============================================================
// 本地代理（monolith 模式）
// ============================================================

class LocalAlgorithmProxy implements IAlgorithmProxy {
  private engine: Awaited<ReturnType<typeof import('../../algorithms/index').getAlgorithmEngine>> | null = null;

  private async getEngine() {
    if (!this.engine) {
      const { getAlgorithmEngine } = await import('../../algorithms/index');
      this.engine = getAlgorithmEngine();
    }
    return this.engine;
  }

  async execute(
    algorithmId: string,
    input: AlgorithmInput,
    cfg?: Record<string, any>,
    context?: Partial<ExecutionContext>,
  ): Promise<AlgorithmOutput> {
    const engine = await this.getEngine();
    return engine.execute(algorithmId, input, cfg || {}, context);
  }

  async executeComposition(
    steps: Array<{
      algorithmId: string;
      config?: Record<string, any>;
      inputMapping?: Record<string, string>;
    }>,
    initialInput: AlgorithmInput,
    context?: Partial<ExecutionContext>,
  ): Promise<{ steps: AlgorithmOutput[]; finalOutput: AlgorithmOutput }> {
    const engine = await this.getEngine();
    return engine.executeComposition(steps, initialInput, context);
  }

  async listAlgorithms(filter?: {
    category?: string;
    tag?: string;
    deviceType?: string;
  }): Promise<AlgorithmRegistration[]> {
    const engine = await this.getEngine();
    return engine.listAlgorithms(filter);
  }

  async initialize(): Promise<void> {
    await this.getEngine();
    log.info('LocalAlgorithmProxy initialized');
  }

  async shutdown(): Promise<void> {
    if (this.engine) {
      await this.engine.shutdown();
      this.engine = null;
    }
  }
}

// ============================================================
// 远程代理（microservices 模式 + 断路器 + 降级）
// ============================================================

class RemoteAlgorithmProxy implements IAlgorithmProxy {
  private localFallback = new LocalAlgorithmProxy();
  private grpcClient: any = null;
  private circuitBreaker: any = null;

  async initialize(): Promise<void> {
    // 初始化本地回退引擎（始终需要，用于降级）
    await this.localFallback.initialize();

    try {
      // 延迟加载 gRPC 客户端
      const { getAlgorithmServiceClient } = await import('../../lib/clients/grpcClients');
      this.grpcClient = getAlgorithmServiceClient();

      // 初始化断路器
      const { circuitBreakerRegistry } = await import('../middleware/circuitBreaker');

      // 为算法 gRPC 服务创建专用断路器
      this.circuitBreaker = circuitBreakerRegistry.getBreaker(
        'algorithm-grpc',
        async (...args: any[]) => {
          // 由外部调用者传入具体方法
          const [method, ...methodArgs] = args;
          if (!this.grpcClient) throw new Error('gRPC client not available');
          return (this.grpcClient as any)[method](...methodArgs);
        },
        {
          timeout: 120000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
          volumeThreshold: 3,
          rollingCountTimeout: 60000,
          rollingCountBuckets: 6,
          enabled: true,
        },
      );

      log.info('RemoteAlgorithmProxy initialized with gRPC + circuit breaker');
    } catch (err: any) {
      log.warn(`RemoteAlgorithmProxy: gRPC init failed, using local only: ${err.message}`);
    }
  }

  async execute(
    algorithmId: string,
    input: AlgorithmInput,
    cfg?: Record<string, any>,
    context?: Partial<ExecutionContext>,
  ): Promise<AlgorithmOutput> {
    if (!this.grpcClient || !this.circuitBreaker) {
      return this.localFallback.execute(algorithmId, input, cfg, context);
    }

    try {
      const request = {
        algorithm_id: algorithmId,
        parameters: { ...cfg, sampleRate: input.sampleRate, equipment: input.equipment },
        input_data: Buffer.from(JSON.stringify(input.data)),
        input_format: 'json',
        correlation_id: context?.executionId || `proxy_${Date.now()}`,
        device_id: context?.equipmentId || '',
        timeout_ms: context?.timeout || 120000,
      };

      const response = await this.circuitBreaker.fire('executeAlgorithm', request);

      // 将 gRPC 响应转换回 AlgorithmOutput
      return this.grpcResponseToOutput(response, algorithmId);
    } catch (err: any) {
      log.warn(`[algorithm-proxy] gRPC execute failed, falling back to local: ${err.message}`);
      return this.localFallback.execute(algorithmId, input, cfg, context);
    }
  }

  async executeComposition(
    steps: Array<{
      algorithmId: string;
      config?: Record<string, any>;
      inputMapping?: Record<string, string>;
    }>,
    initialInput: AlgorithmInput,
    context?: Partial<ExecutionContext>,
  ): Promise<{ steps: AlgorithmOutput[]; finalOutput: AlgorithmOutput }> {
    if (!this.grpcClient || !this.circuitBreaker) {
      return this.localFallback.executeComposition(steps, initialInput, context);
    }

    try {
      const request = {
        steps: steps.map(s => ({
          algorithm_id: s.algorithmId,
          config: s.config || {},
          input_mapping: s.inputMapping || {},
        })),
        initial_input_data: Buffer.from(JSON.stringify(initialInput.data)),
        input_format: 'json',
        initial_parameters: {
          sampleRate: initialInput.sampleRate,
          equipment: initialInput.equipment,
        },
        correlation_id: context?.executionId || `comp_proxy_${Date.now()}`,
        device_id: context?.equipmentId || '',
        timeout_ms: context?.timeout || 300000,
      };

      const response = await this.circuitBreaker.fire('executeComposition', request);

      const stepResults = (response.step_results || []).map((s: any, i: number) =>
        this.grpcResponseToOutput(s, steps[i]?.algorithmId || 'unknown'),
      );
      const finalOutput = response.final_output
        ? this.grpcResponseToOutput(response.final_output, steps[steps.length - 1]?.algorithmId || 'unknown')
        : stepResults[stepResults.length - 1];

      return { steps: stepResults, finalOutput };
    } catch (err: any) {
      log.warn(`[algorithm-proxy] gRPC executeComposition failed, falling back to local: ${err.message}`);
      return this.localFallback.executeComposition(steps, initialInput, context);
    }
  }

  async listAlgorithms(filter?: {
    category?: string;
    tag?: string;
    deviceType?: string;
  }): Promise<AlgorithmRegistration[]> {
    // 算法列表始终从本地引擎读取（注册表是静态的）
    return this.localFallback.listAlgorithms(filter);
  }

  async shutdown(): Promise<void> {
    await this.localFallback.shutdown();
    this.grpcClient = null;
    this.circuitBreaker = null;
  }

  /**
   * 将 gRPC ExecuteResponse 转回 AlgorithmOutput
   */
  private grpcResponseToOutput(response: any, algorithmId: string): AlgorithmOutput {
    const statusMap: Record<string, string> = {
      success: 'completed',
      error: 'failed',
      timeout: 'failed',
      partial: 'running',
    };

    let results: Record<string, any> = {};
    if (response.output_data) {
      try {
        results = JSON.parse(Buffer.from(response.output_data).toString('utf-8'));
      } catch { /* use empty */ }
    }
    if (response.result && typeof response.result === 'object') {
      results = { ...results, ...response.result };
    }

    const diag = response.diagnostics?.[0];

    return {
      algorithmId: response.algorithm_id || algorithmId,
      status: (statusMap[response.status] || 'failed') as any,
      diagnosis: {
        summary: diag?.description || '',
        severity: (diag?.severity || 'normal') as any,
        urgency: 'monitoring' as any,
        confidence: diag?.confidence || 0,
        faultType: diag?.fault_type,
      },
      results,
      metadata: {
        executionTimeMs: Number(response.execution_time_ms) || 0,
        inputDataPoints: 0,
        algorithmVersion: response.metadata?.algorithmVersion || '1.0.0',
        parameters: {},
      },
      error: response.error_message || undefined,
    };
  }
}

// ============================================================
// 单例工厂
// ============================================================

let proxy: IAlgorithmProxy | null = null;

/**
 * 获取算法代理
 *
 * - monolith → LocalAlgorithmProxy（直接调用引擎）
 * - microservices → RemoteAlgorithmProxy（gRPC + 断路器 + 降级）
 */
export function getAlgorithmProxy(): IAlgorithmProxy {
  if (proxy) return proxy;

  const mode = config.grpc.deploymentMode;

  if (mode === 'microservices') {
    proxy = new RemoteAlgorithmProxy();
    log.info('AlgorithmProxy: using remote gRPC (microservices mode)');
  } else {
    proxy = new LocalAlgorithmProxy();
    log.info('AlgorithmProxy: using local engine (monolith mode)');
  }

  return proxy;
}

/** 重置单例（测试用） */
export function resetAlgorithmProxy(): void {
  if (proxy) {
    proxy.shutdown().catch(() => {});
    proxy = null;
  }
}
