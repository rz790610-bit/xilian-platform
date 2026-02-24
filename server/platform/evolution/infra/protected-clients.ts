/**
 * 进化引擎基础设施保护层
 *
 * 为进化引擎的所有外部依赖（MySQL、Redis、Prometheus）提供统一的熔断器保护。
 * 模块无需逐个调用 withCircuitBreaker，只需使用本文件导出的保护版客户端。
 *
 * 架构位置: server/platform/evolution/infra/
 * 依赖: circuitBreaker 中间件、getDb、RedisClient、PrometheusClient
 */

import { withCircuitBreaker, circuitBreakerRegistry } from '../../middleware/circuitBreaker';
import { getDb } from '../../../lib/db';
import { RedisClient } from '../../../lib/clients/redis.client';
import { PrometheusClient } from '../../../lib/clients/prometheus.client';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('evo-infra');

// ============================================================
// 1. MySQL 保护层
// ============================================================

/**
 * 获取受熔断器保护的数据库连接。
 * 当 MySQL 连续失败超过阈值时，快速拒绝请求而不是阻塞等待。
 *
 * @throws 当熔断器打开时抛出 CircuitBreakerError
 */
const protectedGetDb = withCircuitBreaker(
  'mysql',
  async () => {
    const db = await getDb();
    if (!db) throw new Error('数据库连接不可用');
    return db;
  },
  {
    timeout: 10000,
    errorThresholdPercentage: 60,
    resetTimeout: 30000,
    volumeThreshold: 5,
  },
);

/**
 * 进化引擎专用 DB 获取函数。
 * 优先使用熔断器保护版本，降级时返回 null（与原 getDb 行为一致）。
 */
export async function getProtectedDb() {
  try {
    return await protectedGetDb();
  } catch (err: any) {
    // 熔断器打开时降级为 null，让调用方走已有的 null 检查逻辑
    if (err?.code === 'EOPENBREAKER' || err?.message?.includes('Breaker is open')) {
      log.warn('MySQL 熔断器已打开，进化引擎 DB 操作被快速拒绝');
      return null;
    }
    // 其他错误（如连接超时）也降级
    log.error('获取 DB 连接失败', err);
    return null;
  }
}

// ============================================================
// 2. Redis 保护层
// ============================================================

/**
 * 创建受熔断器保护的 Redis 客户端代理。
 * 对 acquireLock、releaseLock、incrementCounter、decrementCounter 等关键方法
 * 套上熔断器保护。
 */
export class ProtectedRedisClient {
  private redis: RedisClient;

  constructor(redis?: RedisClient) {
    this.redis = redis || new RedisClient();
  }

  /**
   * 受保护的分布式锁获取
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    try {
      return await withCircuitBreaker(
        'redis',
        async () => this.redis.acquireLock(key, ttlMs),
      )();
    } catch {
      log.warn(`Redis 熔断器保护：acquireLock(${key}) 降级为 true（允许操作）`);
      return true; // 降级策略：Redis 不可用时允许操作，避免阻塞业务
    }
  }

  /**
   * 受保护的锁释放
   */
  async releaseLock(key: string): Promise<void> {
    try {
      await withCircuitBreaker(
        'redis',
        async () => this.redis.releaseLock(key),
      )();
    } catch {
      log.warn(`Redis 熔断器保护：releaseLock(${key}) 降级忽略`);
    }
  }

  /**
   * 受保护的计数器递增
   */
  async incrementCounter(key: string, ttlSeconds?: number): Promise<number> {
    try {
      return await withCircuitBreaker(
        'redis',
        async () => this.redis.incrementCounter(key, ttlSeconds),
      )();
    } catch {
      log.warn(`Redis 熔断器保护：incrementCounter(${key}) 降级返回 0`);
      return 0;
    }
  }

  /**
   * 受保护的计数器递减
   */
  async decrementCounter(key: string): Promise<number> {
    try {
      return await withCircuitBreaker(
        'redis',
        async () => this.redis.decrementCounter(key),
      )();
    } catch {
      log.warn(`Redis 熔断器保护：decrementCounter(${key}) 降级返回 0`);
      return 0;
    }
  }

  /** 直接访问底层 Redis 客户端（用于非关键路径） */
  get raw(): RedisClient {
    return this.redis;
  }
}

// ============================================================
// 3. Prometheus 保护层
// ============================================================

/**
 * 受保护的 Prometheus PromQL 查询。
 * Prometheus 查询失败不应阻塞进化引擎的核心流程。
 */
export async function protectedPromQuery(query: string): Promise<any> {
  try {
    const client = new PrometheusClient();
    return await withCircuitBreaker(
      'prometheus',
      async () => client.query(query),
      {
        timeout: 15000,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 3,
      },
    )();
  } catch {
    log.warn(`Prometheus 熔断器保护：query 降级返回空结果`);
    return { status: 'error', data: { result: [] } };
  }
}

// ============================================================
// 4. 注册进化引擎专用降级回调
// ============================================================

circuitBreakerRegistry.registerFallback('prometheus', () => ({
  status: 'error',
  message: 'Prometheus 服务暂时不可用，进化引擎指标查询降级',
  data: { result: [] },
}));

// ============================================================
// 5. 导出
// ============================================================

export { circuitBreakerRegistry };
