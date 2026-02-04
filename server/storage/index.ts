/**
 * 存储层统一导出
 * 
 * PortAI Nexus存储层架构：
 * - ClickHouse: 时序数据存储（3节点2副本）
 * - PostgreSQL: 关系数据存储（Patroni HA）
 * - Neo4j: 图数据存储（Causal Cluster）
 * - Qdrant: 向量数据存储（2节点1副本）
 * - MinIO: 对象存储（S3兼容）
 * - Redis: 缓存集群（6节点）
 */

// 统一管理器
export { storageManager, StorageManager } from './storageManager';
export type { StorageHealth, StorageManagerStatus, StorageConfig } from './storageManager';

// ClickHouse 时序存储
export { clickhouseStorage, ClickHouseStorage } from './clickhouse/clickhouseStorage';
export type {
  ClickHouseClusterConfig,
  SensorReadingRaw,
  SensorReadingAggregated,
  FaultEvent,
  QueryFilter,
  TimeRange,
} from './clickhouse/clickhouseStorage';

// PostgreSQL 关系存储
export { postgresStorage, PostgresStorage } from './postgres/postgresStorage';
export type {
  DeviceRecord,
  UserRecord,
  ConversationRecord,
  MaintenanceLogRecord,
  SparePartRecord,
  AlertRecord,
  KpiRecord,
  QueryOptions,
  PaginatedResult,
} from './postgres/postgresStorage';

// Neo4j 图存储
export { neo4jStorage, Neo4jStorage } from './neo4j/neo4jStorage';
export type {
  Neo4jClusterConfig,
  EquipmentNode,
  ComponentNode,
  FaultNode,
  SolutionNode,
  VesselNode,
  BerthNode,
  GraphPath,
} from './neo4j/neo4jStorage';

// Qdrant 向量存储
export { qdrantStorage, QdrantStorage } from './qdrant/qdrantStorage';
export type {
  QdrantClusterConfig,
  CollectionConfig,
  VectorPoint,
  SearchResult,
  SearchFilter,
} from './qdrant/qdrantStorage';

// MinIO 对象存储
export { minioStorage, MinioStorage } from './minio/minioStorage';
export type {
  MinioConfig,
  BucketConfig,
  LifecycleRule,
  FileMetadata,
  UploadResult,
  ListResult,
  MultipartUploadSession,
} from './minio/minioStorage';

// Redis 缓存集群
export { redisStorage, RedisStorage } from './redis/redisStorage';
export type {
  RedisClusterConfig,
  CacheConfig,
  RateLimitConfig,
  EventChannel,
  EventMessage,
} from './redis/redisStorage';
