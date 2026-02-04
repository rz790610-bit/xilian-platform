/**
 * 存储层统一管理服务
 * 
 * 统一管理所有存储服务的初始化、健康检查和生命周期
 * 
 * 存储层架构：
 * - ClickHouse: 时序数据存储（3节点2副本）
 * - PostgreSQL: 关系数据存储（Patroni HA）
 * - Neo4j: 图数据存储（Causal Cluster）
 * - Qdrant: 向量数据存储（2节点1副本）
 * - MinIO: 对象存储（S3兼容）
 * - Redis: 缓存集群（6节点）
 */

import { clickhouseStorage, ClickHouseStorage } from './clickhouse/clickhouseStorage';
import { postgresStorage, PostgresStorage } from './postgres/postgresStorage';
import { neo4jStorage, Neo4jStorage } from './neo4j/neo4jStorage';
import { qdrantStorage, QdrantStorage } from './qdrant/qdrantStorage';
import { minioStorage, MinioStorage } from './minio/minioStorage';
import { redisStorage, RedisStorage } from './redis/redisStorage';

// ============ 类型定义 ============

export interface StorageHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface StorageManagerStatus {
  initialized: boolean;
  initializationTime?: number;
  services: StorageHealth[];
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck?: Date;
}

export interface StorageConfig {
  clickhouse: { enabled: boolean };
  postgres: { enabled: boolean };
  neo4j: { enabled: boolean };
  qdrant: { enabled: boolean };
  minio: { enabled: boolean };
  redis: { enabled: boolean };
}

// 默认配置
const DEFAULT_CONFIG: StorageConfig = {
  clickhouse: { enabled: process.env.CLICKHOUSE_ENABLED !== 'false' },
  postgres: { enabled: true }, // 总是启用
  neo4j: { enabled: process.env.NEO4J_ENABLED !== 'false' },
  qdrant: { enabled: process.env.QDRANT_ENABLED !== 'false' },
  minio: { enabled: process.env.MINIO_ENABLED !== 'false' },
  redis: { enabled: process.env.REDIS_ENABLED !== 'false' },
};

// ============ 存储管理器类 ============

export class StorageManager {
  private config: StorageConfig;
  private isInitialized: boolean = false;
  private initializationTime: number = 0;
  private lastHealthCheck?: Date;
  private healthCheckInterval?: NodeJS.Timeout;

  // 存储服务实例
  readonly clickhouse: ClickHouseStorage;
  readonly postgres: PostgresStorage;
  readonly neo4j: Neo4jStorage;
  readonly qdrant: QdrantStorage;
  readonly minio: MinioStorage;
  readonly redis: RedisStorage;

  constructor(config?: Partial<StorageConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 使用单例实例
    this.clickhouse = clickhouseStorage;
    this.postgres = postgresStorage;
    this.neo4j = neo4jStorage;
    this.qdrant = qdrantStorage;
    this.minio = minioStorage;
    this.redis = redisStorage;
  }

  /**
   * 初始化所有存储服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[StorageManager] Already initialized');
      return;
    }

    console.log('[StorageManager] Initializing storage services...');
    const startTime = Date.now();

    const initPromises: Promise<void>[] = [];

    // 按优先级初始化服务
    // 1. Redis（缓存层，优先级最高）
    if (this.config.redis.enabled) {
      initPromises.push(
        this.initializeService('Redis', () => this.redis.initialize())
      );
    }

    // 2. PostgreSQL（主数据库）
    // PostgreSQL 使用 Drizzle ORM，不需要显式初始化
    if (this.config.postgres.enabled) {
      initPromises.push(
        this.initializeService('PostgreSQL', async () => {
          // 通过健康检查验证连接
          const health = await this.postgres.healthCheck();
          if (!health.connected) {
            throw new Error('PostgreSQL connection failed');
          }
        })
      );
    }

    // 3. ClickHouse（时序数据）
    if (this.config.clickhouse.enabled) {
      initPromises.push(
        this.initializeService('ClickHouse', () => this.clickhouse.initialize())
      );
    }

    // 4. Neo4j（图数据）
    if (this.config.neo4j.enabled) {
      initPromises.push(
        this.initializeService('Neo4j', () => this.neo4j.initialize())
      );
    }

    // 5. Qdrant（向量数据）
    if (this.config.qdrant.enabled) {
      initPromises.push(
        this.initializeService('Qdrant', () => this.qdrant.initialize())
      );
    }

    // 6. MinIO（对象存储）
    if (this.config.minio.enabled) {
      initPromises.push(
        this.initializeService('MinIO', () => this.minio.initialize())
      );
    }

    // 并行初始化所有服务
    await Promise.allSettled(initPromises);

    this.initializationTime = Date.now() - startTime;
    this.isInitialized = true;

    console.log(`[StorageManager] Initialization completed in ${this.initializationTime}ms`);

    // 启动定期健康检查
    this.startHealthCheckInterval();
  }

  /**
   * 初始化单个服务
   */
  private async initializeService(
    name: string,
    initFn: () => Promise<void>
  ): Promise<void> {
    try {
      await initFn();
      console.log(`[StorageManager] ${name} initialized successfully`);
    } catch (error) {
      console.error(`[StorageManager] ${name} initialization failed:`, error);
      // 不抛出错误，允许其他服务继续初始化
    }
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheckInterval(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);

    // 立即执行一次
    this.performHealthCheck();
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const status = await this.getStatus();
      this.lastHealthCheck = new Date();

      if (status.overallStatus === 'unhealthy') {
        console.warn('[StorageManager] Some services are unhealthy:', 
          status.services.filter(s => s.status === 'unhealthy').map(s => s.name)
        );
      }
    } catch (error) {
      console.error('[StorageManager] Health check failed:', error);
    }
  }

  /**
   * 获取所有服务状态
   */
  async getStatus(): Promise<StorageManagerStatus> {
    const services: StorageHealth[] = [];

    // 检查各服务健康状态
    if (this.config.redis.enabled) {
      services.push(await this.checkRedisHealth());
    }

    if (this.config.postgres.enabled) {
      services.push(await this.checkPostgresHealth());
    }

    if (this.config.clickhouse.enabled) {
      services.push(await this.checkClickHouseHealth());
    }

    if (this.config.neo4j.enabled) {
      services.push(await this.checkNeo4jHealth());
    }

    if (this.config.qdrant.enabled) {
      services.push(await this.checkQdrantHealth());
    }

    if (this.config.minio.enabled) {
      services.push(await this.checkMinioHealth());
    }

    // 计算整体状态
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) {
      overallStatus = unhealthyCount >= services.length / 2 ? 'unhealthy' : 'degraded';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return {
      initialized: this.isInitialized,
      initializationTime: this.initializationTime,
      services,
      overallStatus,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  /**
   * 检查 Redis 健康状态
   */
  private async checkRedisHealth(): Promise<StorageHealth> {
    try {
      const health = await this.redis.healthCheck();
      return {
        name: 'Redis',
        status: health.connected ? 'healthy' : 'unhealthy',
        latencyMs: health.latencyMs,
        details: {
          mode: health.mode,
          nodes: health.nodes,
        },
        error: health.error,
      };
    } catch (error) {
      return {
        name: 'Redis',
        status: 'unhealthy',
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查 PostgreSQL 健康状态
   */
  private async checkPostgresHealth(): Promise<StorageHealth> {
    try {
      const health = await this.postgres.healthCheck();
      return {
        name: 'PostgreSQL',
        status: health.connected ? 'healthy' : 'unhealthy',
        latencyMs: health.latencyMs,
        details: {
          poolStatus: health.poolStatus,
        },
        error: health.error,
      };
    } catch (error) {
      return {
        name: 'PostgreSQL',
        status: 'unhealthy',
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查 ClickHouse 健康状态
   */
  private async checkClickHouseHealth(): Promise<StorageHealth> {
    try {
      // ClickHouse 健康检查通过简单查询实现
      const start = Date.now();
      const connected = await this.clickhouse.ping();
      return {
        name: 'ClickHouse',
        status: connected ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - start,
        details: {},
      };
    } catch (error) {
      return {
        name: 'ClickHouse',
        status: 'unhealthy',
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查 Neo4j 健康状态
   */
  private async checkNeo4jHealth(): Promise<StorageHealth> {
    try {
      const health = await this.neo4j.healthCheck();
      return {
        name: 'Neo4j',
        status: health.connected ? 'healthy' : 'unhealthy',
        latencyMs: health.latencyMs,
        details: {
          clusterInfo: health.clusterInfo,
        },
        error: health.error,
      };
    } catch (error) {
      return {
        name: 'Neo4j',
        status: 'unhealthy',
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查 Qdrant 健康状态
   */
  private async checkQdrantHealth(): Promise<StorageHealth> {
    try {
      const health = await this.qdrant.healthCheck();
      return {
        name: 'Qdrant',
        status: health.connected ? 'healthy' : 'unhealthy',
        latencyMs: health.latencyMs,
        details: {
          nodes: health.nodes,
          collections: health.collections,
        },
        error: health.error,
      };
    } catch (error) {
      return {
        name: 'Qdrant',
        status: 'unhealthy',
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查 MinIO 健康状态
   */
  private async checkMinioHealth(): Promise<StorageHealth> {
    try {
      const health = await this.minio.healthCheck();
      return {
        name: 'MinIO',
        status: health.connected ? 'healthy' : 'unhealthy',
        latencyMs: health.latencyMs,
        details: {
          buckets: health.buckets,
        },
        error: health.error,
      };
    } catch (error) {
      return {
        name: 'MinIO',
        status: 'unhealthy',
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 获取存储层统计信息
   */
  async getStatistics(): Promise<{
    clickhouse?: Record<string, unknown>;
    postgres?: Record<string, unknown>;
    neo4j?: Record<string, unknown>;
    qdrant?: Record<string, unknown>;
    minio?: Record<string, unknown>;
    redis?: Record<string, unknown>;
  }> {
    const stats: Record<string, unknown> = {};

    try {
      if (this.config.clickhouse.enabled) {
        stats.clickhouse = { status: 'available' };
      }
    } catch (error) {
      stats.clickhouse = { error: 'Failed to get statistics' };
    }

    try {
      if (this.config.postgres.enabled) {
        stats.postgres = await this.postgres.getDatabaseStats();
      }
    } catch (error) {
      stats.postgres = { error: 'Failed to get statistics' };
    }

    try {
      if (this.config.neo4j.enabled) {
        stats.neo4j = await this.neo4j.getGraphStatistics();
      }
    } catch (error) {
      stats.neo4j = { error: 'Failed to get statistics' };
    }

    try {
      if (this.config.qdrant.enabled) {
        stats.qdrant = await this.qdrant.getAllCollectionsStats();
      }
    } catch (error) {
      stats.qdrant = { error: 'Failed to get statistics' };
    }

    try {
      if (this.config.minio.enabled) {
        stats.minio = await this.minio.getAllBucketsStats();
      }
    } catch (error) {
      stats.minio = { error: 'Failed to get statistics' };
    }

    try {
      if (this.config.redis.enabled) {
        stats.redis = await this.redis.getCacheStats();
      }
    } catch (error) {
      stats.redis = { error: 'Failed to get statistics' };
    }

    return stats;
  }

  /**
   * 获取存储层配置摘要
   */
  getConfigSummary(): {
    services: Array<{
      name: string;
      enabled: boolean;
      type: string;
      features: string[];
    }>;
  } {
    return {
      services: [
        {
          name: 'ClickHouse',
          enabled: this.config.clickhouse.enabled,
          type: '时序数据库',
          features: [
            '3节点2副本集群',
            'Gorilla压缩',
            '7天/2年/5年TTL分层',
            '物化视图自动下采样',
          ],
        },
        {
          name: 'PostgreSQL',
          enabled: this.config.postgres.enabled,
          type: '关系数据库',
          features: [
            'Patroni HA',
            'PgBouncer连接池',
            'BRIN/GiST索引',
            '按年分区',
          ],
        },
        {
          name: 'Neo4j',
          enabled: this.config.neo4j.enabled,
          type: '图数据库',
          features: [
            'Causal Cluster',
            'GDS插件',
            'Louvain社区检测',
            'PageRank故障影响',
          ],
        },
        {
          name: 'Qdrant',
          enabled: this.config.qdrant.enabled,
          type: '向量数据库',
          features: [
            '2节点1副本',
            'HNSW索引(M=16,ef=100)',
            'Scalar量化98%召回',
            '3个Collection',
          ],
        },
        {
          name: 'MinIO',
          enabled: this.config.minio.enabled,
          type: '对象存储',
          features: [
            'S3兼容',
            '4个Bucket',
            '热/温/冷分层',
            '生命周期管理',
          ],
        },
        {
          name: 'Redis',
          enabled: this.config.redis.enabled,
          type: '缓存集群',
          features: [
            '6节点集群',
            'Redlock分布式锁',
            'Sliding Window限流',
            'Pub/Sub事件总线',
          ],
        },
      ],
    };
  }

  /**
   * 关闭所有存储服务
   */
  async shutdown(): Promise<void> {
    console.log('[StorageManager] Shutting down storage services...');

    // 停止健康检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // 并行关闭所有服务
    const closePromises: Promise<void>[] = [];

    if (this.config.redis.enabled) {
      closePromises.push(this.redis.close().catch(console.error));
    }

    if (this.config.neo4j.enabled) {
      closePromises.push(this.neo4j.close().catch(console.error));
    }

    if (this.config.qdrant.enabled) {
      closePromises.push(this.qdrant.close().catch(console.error));
    }

    // ClickHouse, PostgreSQL, MinIO 使用连接池，不需要显式关闭

    await Promise.allSettled(closePromises);

    this.isInitialized = false;
    console.log('[StorageManager] All storage services shut down');
  }
}

// 导出单例
export const storageManager = new StorageManager();
export default storageManager;

// 导出所有存储服务
export {
  clickhouseStorage,
  postgresStorage,
  neo4jStorage,
  qdrantStorage,
  minioStorage,
  redisStorage,
};
