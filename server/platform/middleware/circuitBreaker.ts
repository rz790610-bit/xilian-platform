/**
 * 断路器中间件 - 平台基础设施层
 * 
 * 基于 opossum 实现断路器模式，保护平台免受外部服务故障的级联影响。
 * 为每个外部服务（Redis/Kafka/ClickHouse/Qdrant/Ollama/Neo4j/MinIO/ES）
 * 提供独立的断路器实例，支持三态模型（Closed → Open → Half-Open）。
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: opossum, server/core/logger, server/core/config
 */

import CircuitBreaker from 'opossum';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('circuit-breaker');

// ============================================================
// 断路器配置
// ============================================================

export interface CircuitBreakerConfig {
  /** 超时时间(ms)，超过则视为失败 */
  timeout: number;
  /** 失败率阈值(%)，超过则触发熔断 */
  errorThresholdPercentage: number;
  /** 熔断恢复窗口(ms)，Open 态持续此时间后进入 Half-Open */
  resetTimeout: number;
  /** 最小请求量，低于此值不评估失败率 */
  volumeThreshold: number;
  /** 滚动窗口时间(ms) */
  rollingCountTimeout: number;
  /** 滚动窗口桶数 */
  rollingCountBuckets: number;
  /** 是否启用 */
  enabled: boolean;
}

/** 各服务的默认断路器配置 */
const DEFAULT_CONFIGS: Record<string, CircuitBreakerConfig> = {
  redis: {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  kafka: {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  clickhouse: {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 45000,
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  mysql: {
    timeout: 10000,
    errorThresholdPercentage: 60,
    resetTimeout: 30000,
    volumeThreshold: 5,
    rollingCountTimeout: 20000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  qdrant: {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 45000,
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  ollama: {
    timeout: 60000,  // AI 推理可能很慢
    errorThresholdPercentage: 40,
    resetTimeout: 120000,  // 2分钟恢复窗口
    volumeThreshold: 2,
    rollingCountTimeout: 60000,
    rollingCountBuckets: 6,
    enabled: true,
  },
  neo4j: {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 45000,
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  minio: {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 45000,
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    enabled: true,
  },
  elasticsearch: {
    timeout: 15000,
    errorThresholdPercentage: 50,
    resetTimeout: 45000,
    volumeThreshold: 3,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    enabled: true,
  },
};

// ============================================================
// 断路器注册表
// ============================================================

export type CircuitBreakerState = 'closed' | 'open' | 'halfOpen';

export interface CircuitBreakerStats {
  name: string;
  state: CircuitBreakerState;
  enabled: boolean;
  stats: {
    fires: number;
    successes: number;
    failures: number;
    rejects: number;
    timeouts: number;
    fallbacks: number;
    latencyMean: number;
    percentiles: Record<string, number>;
  };
}

class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private configs = new Map<string, CircuitBreakerConfig>();
  private fallbacks = new Map<string, (...args: unknown[]) => unknown>();
  private stateChangeListeners: Array<(name: string, state: CircuitBreakerState) => void> = [];

  /**
   * 获取或创建指定服务的断路器
   */
  getBreaker<TArgs extends unknown[], TResult>(
    serviceName: string,
    fn: (...args: TArgs) => Promise<TResult>,
    customConfig?: Partial<CircuitBreakerConfig>,
  ): CircuitBreaker<TArgs, TResult> {
    const existing = this.breakers.get(serviceName);
    if (existing) return existing as CircuitBreaker<TArgs, TResult>;

    const baseConfig = DEFAULT_CONFIGS[serviceName] || DEFAULT_CONFIGS.redis;
    const config: CircuitBreakerConfig = { ...baseConfig, ...customConfig };
    this.configs.set(serviceName, config);

    if (!config.enabled) {
      // 禁用时创建一个直通断路器（永不熔断）
      const passthrough = new CircuitBreaker(fn, {
        timeout: false,
        errorThresholdPercentage: 100,
        volumeThreshold: Number.MAX_SAFE_INTEGER,
      });
      this.breakers.set(serviceName, passthrough);
      return passthrough as CircuitBreaker<TArgs, TResult>;
    }

    const breaker = new CircuitBreaker(fn, {
      timeout: config.timeout,
      errorThresholdPercentage: config.errorThresholdPercentage,
      resetTimeout: config.resetTimeout,
      volumeThreshold: config.volumeThreshold,
      rollingCountTimeout: config.rollingCountTimeout,
      rollingCountBuckets: config.rollingCountBuckets,
      name: serviceName,
    });

    // 注册事件监听
    breaker.on('open', () => {
      log.warn(`[${serviceName}] Circuit OPENED — 服务熔断，请求将被快速拒绝`);
      this.notifyStateChange(serviceName, 'open');
    });

    breaker.on('halfOpen', () => {
      log.info(`[${serviceName}] Circuit HALF-OPEN — 尝试恢复探测`);
      this.notifyStateChange(serviceName, 'halfOpen');
    });

    breaker.on('close', () => {
      log.info(`[${serviceName}] Circuit CLOSED — 服务恢复正常`);
      this.notifyStateChange(serviceName, 'closed');
    });

    breaker.on('timeout', () => {
      log.warn(`[${serviceName}] Request timed out after ${config.timeout}ms`);
    });

    breaker.on('reject', () => {
      log.warn(`[${serviceName}] Request rejected — circuit is open`);
    });

    breaker.on('fallback', () => {
      log.debug(`[${serviceName}] Fallback executed`);
    });

    // 注册 fallback
    const fallbackFn = this.fallbacks.get(serviceName);
    if (fallbackFn) {
      breaker.fallback(fallbackFn as (...args: TArgs) => TResult);
    }

    this.breakers.set(serviceName, breaker);
    log.info(`[${serviceName}] Circuit breaker registered (timeout=${config.timeout}ms, threshold=${config.errorThresholdPercentage}%)`);
    return breaker as CircuitBreaker<TArgs, TResult>;
  }

  /**
   * 注册降级回调
   */
  registerFallback<T>(serviceName: string, fallbackFn: (...args: unknown[]) => T): void {
    this.fallbacks.set(serviceName, fallbackFn as (...args: unknown[]) => unknown);
    const existing = this.breakers.get(serviceName);
    if (existing) {
      existing.fallback(fallbackFn);
    }
  }

  /**
   * 包装一个异步函数，使其受断路器保护
   */
  wrap<TArgs extends unknown[], TResult>(
    serviceName: string,
    fn: (...args: TArgs) => Promise<TResult>,
    customConfig?: Partial<CircuitBreakerConfig>,
  ): (...args: TArgs) => Promise<TResult> {
    const breaker = this.getBreaker(serviceName, fn, customConfig);
    return (...args: TArgs) => breaker.fire(...args);
  }

  /**
   * 获取所有断路器的状态
   */
  getAllStats(): CircuitBreakerStats[] {
    const results: CircuitBreakerStats[] = [];
    this.breakers.forEach((breaker, name) => {
      const config = this.configs.get(name);
      const stats = breaker.stats;
      results.push({
        name,
        state: this.getBreakerState(breaker),
        enabled: config?.enabled ?? true,
        stats: {
          fires: stats.fires,
          successes: stats.successes,
          failures: stats.failures,
          rejects: stats.rejects,
          timeouts: stats.timeouts,
          fallbacks: stats.fallbacks,
          latencyMean: stats.latencyMean,
          percentiles: stats.percentiles as Record<string, number>,
        },
      });
    });
    return results;
  }

  /**
   * 获取单个断路器状态
   */
  getStats(serviceName: string): CircuitBreakerStats | null {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) return null;
    const config = this.configs.get(serviceName);
    const stats = breaker.stats;
    return {
      name: serviceName,
      state: this.getBreakerState(breaker),
      enabled: config?.enabled ?? true,
      stats: {
        fires: stats.fires,
        successes: stats.successes,
        failures: stats.failures,
        rejects: stats.rejects,
        timeouts: stats.timeouts,
        fallbacks: stats.fallbacks,
        latencyMean: stats.latencyMean,
        percentiles: stats.percentiles as Record<string, number>,
      },
    };
  }

  /**
   * 手动打开断路器（用于维护模式）
   */
  forceOpen(serviceName: string): boolean {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) return false;
    breaker.open();
    log.warn(`[${serviceName}] Circuit force-opened by admin`);
    return true;
  }

  /**
   * 手动关闭断路器
   */
  forceClose(serviceName: string): boolean {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) return false;
    breaker.close();
    log.info(`[${serviceName}] Circuit force-closed by admin`);
    return true;
  }

  /**
   * 监听状态变化
   */
  onStateChange(listener: (name: string, state: CircuitBreakerState) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener);
    };
  }

  /**
   * 关闭所有断路器
   */
  async shutdown(): Promise<void> {
    this.breakers.forEach((breaker, name) => {
      breaker.shutdown();
      log.info(`[${name}] Circuit breaker shutdown`);
    });
    this.breakers.clear();
  }

  private getBreakerState(breaker: CircuitBreaker): CircuitBreakerState {
    if (breaker.opened) return 'open';
    if (breaker.halfOpen) return 'halfOpen';
    return 'closed';
  }

  private notifyStateChange(name: string, state: CircuitBreakerState): void {
    for (const listener of this.stateChangeListeners) {
      try {
        listener(name, state);
      } catch (err) {
        log.error(`State change listener error:`, String(err));
      }
    }
  }
}

// ============================================================
// 单例导出
// ============================================================

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * 便捷函数：包装异步调用使其受断路器保护
 * 
 * @example
 * const protectedQuery = withCircuitBreaker('clickhouse', clickhouseClient.query);
 * const result = await protectedQuery('SELECT 1');
 */
export function withCircuitBreaker<TArgs extends unknown[], TResult>(
  serviceName: string,
  fn: (...args: TArgs) => Promise<TResult>,
  customConfig?: Partial<CircuitBreakerConfig>,
): (...args: TArgs) => Promise<TResult> {
  return circuitBreakerRegistry.wrap(serviceName, fn, customConfig);
}

// 注册默认降级回调
circuitBreakerRegistry.registerFallback('ollama', () => ({
  error: true,
  message: 'AI 推理服务暂时不可用，断路器已熔断，请稍后重试',
  fallback: true,
}));

circuitBreakerRegistry.registerFallback('qdrant', () => ({
  error: true,
  message: '向量数据库服务暂时不可用，断路器已熔断',
  fallback: true,
  results: [],
}));

circuitBreakerRegistry.registerFallback('elasticsearch', () => ({
  error: true,
  message: '搜索服务暂时不可用，断路器已熔断',
  fallback: true,
  hits: [],
}));
