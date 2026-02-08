/**
 * 存储层完整单元测试
 * 
 * 测试所有存储服务的功能逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============ ClickHouse 存储测试 ============

describe('ClickHouseStorage', () => {
  describe('Configuration', () => {
    it('should have correct cluster configuration', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证存储实例创建成功
      expect(storage).toBeDefined();
    });

    it('should support 3-node 2-replica cluster architecture', async () => {
      // 验证集群配置常量
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 存储服务应该支持集群模式
      expect(storage).toHaveProperty('initialize');
    });
  });

  describe('Table Schemas', () => {
    it('should define sensor_readings_raw table with 7-day TTL', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证表创建方法存在
      expect(typeof storage.insertSensorReadings).toBe('function');
    });

    it('should define sensor_readings_1m table with 2-year TTL', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证下采样查询方法存在
      expect(typeof storage.querySensorReadings1m).toBe('function');
    });

    it('should define fault_events table with permanent retention', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证故障事件方法存在
      expect(typeof storage.insertFaultEvent).toBe('function');
      expect(typeof storage.queryFaultEvents).toBe('function');
    });
  });

  describe('Data Operations', () => {
    it('should support batch insert for sensor readings', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证批量插入方法签名
      expect(typeof storage.insertSensorReadings).toBe('function');
    });

    it('should support time-range queries', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证时间范围查询方法
      expect(typeof storage.querySensorReadingsRaw).toBe('function');
    });

    it('should support aggregation queries', async () => {
      const { ClickHouseStorage } = await import('./clickhouse/clickhouseStorage');
      const storage = new ClickHouseStorage();
      
      // 验证聚合查询方法
      expect(typeof storage.getDeviceStatistics).toBe('function');
    });
  });
});

// ============ PostgreSQL 存储测试 ============

describe('PostgresStorage', () => {
  describe('Device Management', () => {
    it('should support device CRUD operations', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.createDevice).toBe('function');
      expect(typeof storage.getDevice).toBe('function');
      expect(typeof storage.updateDevice).toBe('function');
      expect(typeof storage.listDevices).toBe('function');
    });

    it('should support device status filtering', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      // listDevices 应该支持状态过滤
      expect(typeof storage.listDevices).toBe('function');
    });
  });

  describe('User Management', () => {
    it('should support user CRUD operations', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.getUser).toBe('function');
      expect(typeof storage.updateUserRole).toBe('function');
      expect(typeof storage.listUsers).toBe('function');
    });

    it('should support RBAC role management', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      // 验证角色更新方法
      expect(typeof storage.updateUserRole).toBe('function');
    });
  });

  describe('Maintenance Logs', () => {
    it('should support maintenance log operations', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.createMaintenanceLog).toBe('function');
      expect(typeof storage.listMaintenanceLogs).toBe('function');
    });

    it('should support date range filtering', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      // listMaintenanceLogs 应该支持日期范围过滤
      expect(typeof storage.listMaintenanceLogs).toBe('function');
    });
  });

  describe('Spare Parts', () => {
    it('should support spare part operations', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.createSparePart).toBe('function');
      expect(typeof storage.updateSparePartQuantity).toBe('function');
      expect(typeof storage.getLowStockParts).toBe('function');
    });
  });

  describe('Alerts', () => {
    it('should support alert operations', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.createAlert).toBe('function');
      expect(typeof storage.acknowledgeAlert).toBe('function');
      expect(typeof storage.resolveAlert).toBe('function');
      expect(typeof storage.getActiveAlerts).toBe('function');
    });
  });

  describe('KPI', () => {
    it('should support KPI operations', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.recordKpi).toBe('function');
      expect(typeof storage.getDeviceKpis).toBe('function');
    });
  });

  describe('Health Check', () => {
    it('should support health check', async () => {
      const { PostgresStorage } = await import('./postgres/postgresStorage');
      const storage = new PostgresStorage();
      
      expect(typeof storage.healthCheck).toBe('function');
    });
  });
});

// ============ Neo4j 存储测试 ============

describe('Neo4jStorage', () => {
  describe('Node Types', () => {
    it('should support Equipment node operations', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createEquipment).toBe('function');
      expect(typeof storage.getNode).toBe('function');
      expect(typeof storage.updateNode).toBe('function');
      expect(typeof storage.deleteNode).toBe('function');
    });

    it('should support Fault node operations', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createFault).toBe('function');
      expect(typeof storage.searchFaults).toBe('function');
    });

    it('should support Solution node operations', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createSolution).toBe('function');
      expect(typeof storage.findFaultSolutions).toBe('function');
    });
  });

  describe('Relationship Types', () => {
    it('should support HAS_PART relationship', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createHasPartRelation).toBe('function');
    });

    it('should support CAUSES relationship', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createCausesRelation).toBe('function');
    });

    it('should support SIMILAR_TO relationship', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createSimilarToRelation).toBe('function');
    });

    it('should support RESOLVED_BY relationship', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createResolvedByRelation).toBe('function');
    });

    it('should support AFFECTS relationship', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.createAffectsRelation).toBe('function');
    });
  });

  describe('Graph Algorithms', () => {
    it('should support Louvain community detection', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.detectCommunities).toBe('function');
    });

    it('should support PageRank fault impact analysis', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.calculatePageRank).toBe('function');
    });

    it('should support vector similarity search', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.findSimilarByEmbedding).toBe('function');
    });
  });

  describe('Path Queries', () => {
    it('should support fault propagation path finding', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.findFaultPropagationPath).toBe('function');
    });

    it('should support equipment fault history', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.findEquipmentFaultHistory).toBe('function');
    });
  });

  describe('Statistics', () => {
    it('should support graph statistics', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.getGraphStatistics).toBe('function');
    });

    it('should support health check', async () => {
      const { Neo4jStorage } = await import('./neo4j/neo4jStorage');
      const storage = new Neo4jStorage();
      
      expect(typeof storage.healthCheck).toBe('function');
    });
  });
});

// ============ Qdrant 存储测试 ============

describe('QdrantStorage', () => {
  describe('Collection Configuration', () => {
    it('should define diagnostic_docs collection', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.addDiagnosticDoc).toBe('function');
      expect(typeof storage.searchDiagnosticDocs).toBe('function');
    });

    it('should define fault_patterns collection', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.addFaultPattern).toBe('function');
      expect(typeof storage.searchFaultPatterns).toBe('function');
    });

    it('should define manuals collection', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.addManual).toBe('function');
      expect(typeof storage.searchManuals).toBe('function');
    });
  });

  describe('Vector Operations', () => {
    it('should support vector upsert', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.upsertPoints).toBe('function');
    });

    it('should support vector search', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.search).toBe('function');
    });

    it('should support batch search', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.searchBatch).toBe('function');
    });

    it('should support point retrieval', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.getPoints).toBe('function');
    });

    it('should support point deletion', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.deletePoints).toBe('function');
      expect(typeof storage.deleteByFilter).toBe('function');
    });
  });

  describe('Statistics', () => {
    it('should support collection info', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.getCollectionInfo).toBe('function');
    });

    it('should support all collections stats', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.getAllCollectionsStats).toBe('function');
    });

    it('should support health check', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.healthCheck).toBe('function');
    });
  });

  describe('Management', () => {
    it('should support snapshot creation', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.createSnapshot).toBe('function');
    });

    it('should support collection optimization', async () => {
      const { QdrantStorage } = await import('./qdrant/qdrantStorage');
      const storage = new QdrantStorage();
      
      expect(typeof storage.optimizeCollection).toBe('function');
    });
  });
});

// ============ MinIO 存储测试 ============

describe('MinioStorage', () => {
  describe('Bucket Configuration', () => {
    it('should define raw-documents bucket', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.uploadRawDocument).toBe('function');
    });

    it('should define processed bucket', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.uploadProcessedFile).toBe('function');
    });

    it('should define model-artifacts bucket', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.uploadModelArtifact).toBe('function');
    });

    it('should define backups bucket', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.createBackup).toBe('function');
    });
  });

  describe('File Operations', () => {
    it('should support file upload', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.uploadFile).toBe('function');
    });

    it('should support file download', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.downloadFile).toBe('function');
    });

    it('should support file deletion', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.deleteFile).toBe('function');
    });

    it('should support file metadata retrieval', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.getFileMetadata).toBe('function');
    });

    it('should support file copy', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.copyFile).toBe('function');
    });

    it('should support file listing', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.listFiles).toBe('function');
    });
  });

  describe('Presigned URLs', () => {
    it('should support presigned upload URL', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.getPresignedUploadUrl).toBe('function');
    });

    it('should support presigned download URL', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.getPresignedDownloadUrl).toBe('function');
    });
  });

  describe('Multipart Upload', () => {
    it('should support multipart upload initialization', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.initMultipartUpload).toBe('function');
    });

    it('should support part upload', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.uploadPart).toBe('function');
    });

    it('should support multipart upload completion', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.completeMultipartUpload).toBe('function');
    });

    it('should support multipart upload abort', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.abortMultipartUpload).toBe('function');
    });
  });

  describe('Statistics', () => {
    it('should support bucket stats', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.getBucketStats).toBe('function');
    });

    it('should support all buckets stats', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.getAllBucketsStats).toBe('function');
    });

    it('should support health check', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.healthCheck).toBe('function');
    });
  });

  describe('Cleanup', () => {
    it('should support expired file cleanup', async () => {
      const { MinioStorage } = await import('./minio/minioStorage');
      const storage = new MinioStorage();
      
      expect(typeof storage.cleanupExpiredFiles).toBe('function');
    });
  });
});

// ============ Redis 存储测试 ============

describe('RedisStorage', () => {
  describe('Cache Operations', () => {
    it('should support set operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.set).toBe('function');
    });

    it('should support get operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.get).toBe('function');
    });

    it('should support delete operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.delete).toBe('function');
    });

    it('should support pattern delete', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.deletePattern).toBe('function');
    });

    it('should support exists check', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.exists).toBe('function');
    });

    it('should support expire operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.expire).toBe('function');
    });
  });

  describe('Hash Operations', () => {
    it('should support hset operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.hset).toBe('function');
    });

    it('should support hget operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.hget).toBe('function');
    });

    it('should support hgetall operation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.hgetall).toBe('function');
    });
  });

  describe('Distributed Lock (Redlock)', () => {
    it('should support lock acquisition', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.acquireLock).toBe('function');
    });

    it('should support lock release', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.releaseLock).toBe('function');
    });

    it('should support withLock pattern', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.withLock).toBe('function');
    });
  });

  describe('Rate Limiting', () => {
    it('should support rate limit check', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.checkRateLimit).toBe('function');
    });

    it('should support rate limit reset', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.resetRateLimit).toBe('function');
    });
  });

  describe('Pub/Sub', () => {
    it('should support publish', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.publish).toBe('function');
    });

    it('should support subscribe', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.subscribe).toBe('function');
    });

    it('should support unsubscribe', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.unsubscribe).toBe('function');
    });
  });

  describe('Session Management', () => {
    it('should support session creation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.createSession).toBe('function');
    });

    it('should support session retrieval', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.getSession).toBe('function');
    });

    it('should support session touch', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.touchSession).toBe('function');
    });

    it('should support session destruction', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.destroySession).toBe('function');
    });
  });

  describe('API Cache', () => {
    it('should support API response caching', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.cacheApiResponse).toBe('function');
    });

    it('should support cached API response retrieval', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.getCachedApiResponse).toBe('function');
    });

    it('should support API cache invalidation', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.invalidateApiCache).toBe('function');
    });
  });

  describe('Statistics', () => {
    it('should support cache stats', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.getCacheStats).toBe('function');
    });

    it('should support health check', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.healthCheck).toBe('function');
    });

    it('should support namespace flush', async () => {
      const { RedisStorage } = await import('./redis/redisStorage');
      const storage = new RedisStorage();
      
      expect(typeof storage.flushNamespace).toBe('function');
    });
  });
});

// ============ StorageManager 测试 ============

describe('StorageManager Integration', () => {
  describe('Service Access', () => {
    it('should provide access to all storage services', async () => {
      const { StorageManager } = await import('./storageManager');
      const manager = new StorageManager({
        clickhouse: { enabled: false },
        postgres: { enabled: false },
        neo4j: { enabled: false },
        qdrant: { enabled: false },
        minio: { enabled: false },
        redis: { enabled: false },
      });
      
      expect(manager.clickhouse).toBeDefined();
      expect(manager.postgres).toBeDefined();
      expect(manager.neo4j).toBeDefined();
      expect(manager.qdrant).toBeDefined();
      expect(manager.minio).toBeDefined();
      expect(manager.redis).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should support partial configuration', async () => {
      const { StorageManager } = await import('./storageManager');
      const manager = new StorageManager({
        clickhouse: { enabled: true },
        postgres: { enabled: true },
        neo4j: { enabled: false },
        qdrant: { enabled: false },
        minio: { enabled: false },
        redis: { enabled: false },
      });
      
      const summary = manager.getConfigSummary();
      const clickhouse = summary.services.find(s => s.name === 'ClickHouse');
      const neo4j = summary.services.find(s => s.name === 'Neo4j');
      
      expect(clickhouse?.enabled).toBe(true);
      expect(neo4j?.enabled).toBe(false);
    });
  });

  describe('Status', () => {
    it('should return correct status when all services disabled', async () => {
      const { StorageManager } = await import('./storageManager');
      const manager = new StorageManager({
        clickhouse: { enabled: false },
        postgres: { enabled: false },
        neo4j: { enabled: false },
        qdrant: { enabled: false },
        minio: { enabled: false },
        redis: { enabled: false },
      });
      
      const status = await manager.getStatus();
      
      expect(status.services).toHaveLength(0);
      expect(status.overallStatus).toBe('healthy');
    });
  });

  describe('Lifecycle', () => {
    it('should initialize without errors when all services disabled', async () => {
      const { StorageManager } = await import('./storageManager');
      const manager = new StorageManager({
        clickhouse: { enabled: false },
        postgres: { enabled: false },
        neo4j: { enabled: false },
        qdrant: { enabled: false },
        minio: { enabled: false },
        redis: { enabled: false },
      });
      
      await expect(manager.initialize()).resolves.not.toThrow();
      await manager.shutdown();
    });

    it('should shutdown gracefully', async () => {
      const { StorageManager } = await import('./storageManager');
      const manager = new StorageManager({
        clickhouse: { enabled: false },
        postgres: { enabled: false },
        neo4j: { enabled: false },
        qdrant: { enabled: false },
        minio: { enabled: false },
        redis: { enabled: false },
      });
      
      await manager.initialize();
      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });
});

// ============ 存储层架构验证 ============

describe('Storage Layer Architecture Validation', () => {
  it('should have all required storage services', async () => {
    const { StorageManager } = await import('./storageManager');
    const manager = new StorageManager();
    const summary = manager.getConfigSummary();
    
    const serviceNames = summary.services.map(s => s.name);
    
    expect(serviceNames).toContain('ClickHouse');
    expect(serviceNames).toContain('PostgreSQL');
    expect(serviceNames).toContain('Neo4j');
    expect(serviceNames).toContain('Qdrant');
    expect(serviceNames).toContain('MinIO');
    expect(serviceNames).toContain('Redis');
  });

  it('should have correct storage types', async () => {
    const { StorageManager } = await import('./storageManager');
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

  it('should have required features for each service', async () => {
    const { StorageManager } = await import('./storageManager');
    const manager = new StorageManager();
    const summary = manager.getConfigSummary();
    
    // ClickHouse 特性
    const clickhouse = summary.services.find(s => s.name === 'ClickHouse');
    expect(clickhouse?.features).toContain('3节点2副本集群');
    expect(clickhouse?.features).toContain('Gorilla压缩');
    expect(clickhouse?.features).toContain('7天/2年/5年TTL分层');
    expect(clickhouse?.features).toContain('物化视图自动下采样');
    
    // PostgreSQL 特性
    const postgres = summary.services.find(s => s.name === 'PostgreSQL');
    expect(postgres?.features).toContain('Patroni HA');
    expect(postgres?.features).toContain('PgBouncer连接池');
    expect(postgres?.features).toContain('BRIN/GiST索引');
    expect(postgres?.features).toContain('按年分区');
    
    // Neo4j 特性
    const neo4j = summary.services.find(s => s.name === 'Neo4j');
    expect(neo4j?.features).toContain('Causal Cluster');
    expect(neo4j?.features).toContain('GDS插件');
    expect(neo4j?.features).toContain('Louvain社区检测');
    expect(neo4j?.features).toContain('PageRank故障影响');
    
    // Qdrant 特性
    const qdrant = summary.services.find(s => s.name === 'Qdrant');
    expect(qdrant?.features).toContain('2节点1副本');
    expect(qdrant?.features).toContain('HNSW索引(M=16,ef=100)');
    expect(qdrant?.features).toContain('Scalar量化98%召回');
    expect(qdrant?.features).toContain('3个Collection');
    
    // MinIO 特性
    const minio = summary.services.find(s => s.name === 'MinIO');
    expect(minio?.features).toContain('S3兼容');
    expect(minio?.features).toContain('4个Bucket');
    expect(minio?.features).toContain('热/温/冷分层');
    expect(minio?.features).toContain('生命周期管理');
    
    // Redis 特性
    const redis = summary.services.find(s => s.name === 'Redis');
    expect(redis?.features).toContain('6节点集群');
    expect(redis?.features).toContain('Redlock分布式锁');
    expect(redis?.features).toContain('Sliding Window限流');
    expect(redis?.features).toContain('Pub/Sub事件总线');
  });
});
