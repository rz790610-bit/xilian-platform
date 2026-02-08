/**
 * 存储层统一管理服务测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from './storageManager';

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    // 创建新的 StorageManager 实例，禁用所有外部服务
    storageManager = new StorageManager({
      clickhouse: { enabled: false },
      postgres: { enabled: false },
      neo4j: { enabled: false },
      qdrant: { enabled: false },
      minio: { enabled: false },
      redis: { enabled: false },
    });
  });

  afterEach(async () => {
    await storageManager.shutdown();
  });

  describe('getConfigSummary', () => {
    it('should return correct service configuration summary', () => {
      const summary = storageManager.getConfigSummary();

      expect(summary.services).toHaveLength(6);

      // 验证 ClickHouse 配置
      const clickhouse = summary.services.find(s => s.name === 'ClickHouse');
      expect(clickhouse).toBeDefined();
      expect(clickhouse?.type).toBe('时序数据库');
      expect(clickhouse?.features).toContain('3节点2副本集群');
      expect(clickhouse?.features).toContain('Gorilla压缩');
      expect(clickhouse?.features).toContain('7天/2年/5年TTL分层');
      expect(clickhouse?.features).toContain('物化视图自动下采样');

      // 验证 PostgreSQL 配置
      const postgres = summary.services.find(s => s.name === 'PostgreSQL');
      expect(postgres).toBeDefined();
      expect(postgres?.type).toBe('关系数据库');
      expect(postgres?.features).toContain('Patroni HA');
      expect(postgres?.features).toContain('PgBouncer连接池');
      expect(postgres?.features).toContain('BRIN/GiST索引');
      expect(postgres?.features).toContain('按年分区');

      // 验证 Neo4j 配置
      const neo4j = summary.services.find(s => s.name === 'Neo4j');
      expect(neo4j).toBeDefined();
      expect(neo4j?.type).toBe('图数据库');
      expect(neo4j?.features).toContain('Causal Cluster');
      expect(neo4j?.features).toContain('GDS插件');
      expect(neo4j?.features).toContain('Louvain社区检测');
      expect(neo4j?.features).toContain('PageRank故障影响');

      // 验证 Qdrant 配置
      const qdrant = summary.services.find(s => s.name === 'Qdrant');
      expect(qdrant).toBeDefined();
      expect(qdrant?.type).toBe('向量数据库');
      expect(qdrant?.features).toContain('2节点1副本');
      expect(qdrant?.features).toContain('HNSW索引(M=16,ef=100)');
      expect(qdrant?.features).toContain('Scalar量化98%召回');
      expect(qdrant?.features).toContain('3个Collection');

      // 验证 MinIO 配置
      const minio = summary.services.find(s => s.name === 'MinIO');
      expect(minio).toBeDefined();
      expect(minio?.type).toBe('对象存储');
      expect(minio?.features).toContain('S3兼容');
      expect(minio?.features).toContain('4个Bucket');
      expect(minio?.features).toContain('热/温/冷分层');
      expect(minio?.features).toContain('生命周期管理');

      // 验证 Redis 配置
      const redis = summary.services.find(s => s.name === 'Redis');
      expect(redis).toBeDefined();
      expect(redis?.type).toBe('缓存集群');
      expect(redis?.features).toContain('6节点集群');
      expect(redis?.features).toContain('Redlock分布式锁');
      expect(redis?.features).toContain('Sliding Window限流');
      expect(redis?.features).toContain('Pub/Sub事件总线');
    });

    it('should correctly reflect enabled/disabled status', () => {
      // 创建一个只启用部分服务的管理器
      const partialManager = new StorageManager({
        clickhouse: { enabled: true },
        postgres: { enabled: true },
        neo4j: { enabled: false },
        qdrant: { enabled: false },
        minio: { enabled: true },
        redis: { enabled: false },
      });

      const summary = partialManager.getConfigSummary();

      const clickhouse = summary.services.find(s => s.name === 'ClickHouse');
      expect(clickhouse?.enabled).toBe(true);

      const postgres = summary.services.find(s => s.name === 'PostgreSQL');
      expect(postgres?.enabled).toBe(true);

      const neo4j = summary.services.find(s => s.name === 'Neo4j');
      expect(neo4j?.enabled).toBe(false);

      const qdrant = summary.services.find(s => s.name === 'Qdrant');
      expect(qdrant?.enabled).toBe(false);

      const minio = summary.services.find(s => s.name === 'MinIO');
      expect(minio?.enabled).toBe(true);

      const redis = summary.services.find(s => s.name === 'Redis');
      expect(redis?.enabled).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return status with all services disabled', async () => {
      const status = await storageManager.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.services).toHaveLength(0);
      expect(status.overallStatus).toBe('healthy');
    });
  });

  describe('initialize', () => {
    it('should initialize without errors when all services disabled', async () => {
      await expect(storageManager.initialize()).resolves.not.toThrow();
    });

    it('should not initialize twice', async () => {
      await storageManager.initialize();
      await storageManager.initialize(); // 第二次调用应该直接返回

      // 验证只初始化一次
      const status = await storageManager.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await storageManager.initialize();
      await expect(storageManager.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('Storage Layer Architecture', () => {
  it('should have correct storage layer structure', () => {
    const manager = new StorageManager();
    const summary = manager.getConfigSummary();

    // 验证存储层架构完整性
    const serviceNames = summary.services.map(s => s.name);
    expect(serviceNames).toContain('ClickHouse');
    expect(serviceNames).toContain('PostgreSQL');
    expect(serviceNames).toContain('Neo4j');
    expect(serviceNames).toContain('Qdrant');
    expect(serviceNames).toContain('MinIO');
    expect(serviceNames).toContain('Redis');
  });

  it('should have correct storage types', () => {
    const manager = new StorageManager();
    const summary = manager.getConfigSummary();

    const typeMap: Record<string, string> = {};
    summary.services.forEach(s => {
      typeMap[s.name] = s.type;
    });

    expect(typeMap['ClickHouse']).toBe('时序数据库');
    expect(typeMap['PostgreSQL']).toBe('关系数据库');
    expect(typeMap['Neo4j']).toBe('图数据库');
    expect(typeMap['Qdrant']).toBe('向量数据库');
    expect(typeMap['MinIO']).toBe('对象存储');
    expect(typeMap['Redis']).toBe('缓存集群');
  });
});
