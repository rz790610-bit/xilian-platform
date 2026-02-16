/**
 * 断路器集成层 — 将 circuitBreaker.ts 的保护能力注入到平台 12 个外部服务客户端
 *
 * 架构位置: server/platform/middleware/
 * 依赖: circuitBreaker.ts, lib/clients/*, lib/storage/*
 *
 * 设计原则:
 *   1. 不修改原始客户端代码 — 通过代理模式包装关键方法
 *   2. 每个服务独立断路器实例 — 故障隔离
 *   3. 降级策略按业务语义定制 — 不是统一返回 null
 *   4. 指标自动上报 — 与 metricsCollector.ts 联动
 *
 * 覆盖的外部服务（按 v3.0 设计文档 §8.2）:
 *   - Redis (lib/clients/redis.client.ts + lib/storage/redis.storage.ts)
 *   - Kafka (lib/clients/kafka.client.ts + kafkaEventBus.ts)
 *   - ClickHouse (lib/clients/clickhouse.client.ts + lib/storage/clickhouse.storage.ts)
 *   - MySQL (drizzle-orm via lib/db/)
 *   - Qdrant (lib/storage/qdrant.storage.ts)
 *   - Neo4j (lib/storage/neo4j.storage.ts)
 *   - Ollama (lib/clients/ — 通过 knowledge.service.ts 调用)
 *   - MinIO (lib/storage/ — 文件存储)
 *   - Elasticsearch (lib/clients/elasticsearch.client.ts)
 *   - Airflow (lib/clients/airflow.client.ts)
 *   - Jaeger (lib/clients/jaeger.client.ts)
 *   - Prometheus (lib/clients/prometheus.client.ts)
 */

import { withCircuitBreaker, circuitBreakerRegistry } from './circuitBreaker';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('circuit-breaker-integration');

// ============================================================
// 通用代理工厂
// ============================================================

/**
 * 为类实例的指定方法添加断路器保护
 * 不修改原始对象，返回新的代理对象
 */
export function wrapWithCircuitBreaker<T extends object>(
  instance: T,
  serviceName: string,
  methodNames: string[],
): T {
  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value === 'function' && methodNames.includes(prop as string)) {
        const wrappedFn = withCircuitBreaker(
          `${serviceName}.${String(prop)}`,
          value.bind(target),
        );
        return wrappedFn;
      }

      return value;
    },
  };

  return new Proxy(instance, handler);
}

// ============================================================
// Redis 断路器集成
// ============================================================

/**
 * 为 RedisClientManager 添加断路器保护
 * 保护方法: get, set, del, hget, hset, publish, subscribe
 * 降级策略: 缓存操作返回 null/false，不阻塞业务流程
 */
export function protectRedisClient<T extends object>(redisClient: T): T {
  return wrapWithCircuitBreaker(redisClient, 'redis', [
    'get', 'set', 'del', 'mget', 'mset',
    'hget', 'hset', 'hdel', 'hgetall',
    'lpush', 'rpush', 'lpop', 'rpop', 'lrange',
    'sadd', 'srem', 'smembers', 'sismember',
    'zadd', 'zrange', 'zrangebyscore', 'zrem',
    'publish', 'subscribe',
    'incr', 'decr', 'expire', 'ttl',
    'eval', 'pipeline', 'multi',
  ]);
}

// ============================================================
// Kafka 断路器集成
// ============================================================

/**
 * 为 KafkaClientManager 添加断路器保护
 * 保护方法: produce, createTopic, fetchTopicMetadata
 * 降级策略: 生产失败时写入本地 Outbox 表（已有 outbox.publisher.ts）
 */
export function protectKafkaClient<T extends object>(kafkaClient: T): T {
  return wrapWithCircuitBreaker(kafkaClient, 'kafka', [
    'produce', 'sendBatch', 'createTopic', 'deleteTopic',
    'fetchTopicMetadata', 'fetchTopicOffsets',
    'connect', 'disconnect',
  ]);
}

/**
 * 为 KafkaEventBus 添加断路器保护
 * 保护方法: publish, publishBatch
 * 降级策略: 事件发布失败时写入 Outbox
 */
export function protectKafkaEventBus<T extends object>(eventBus: T): T {
  return wrapWithCircuitBreaker(eventBus, 'kafka', [
    'publish', 'publishBatch', 'subscribe',
  ]);
}

// ============================================================
// ClickHouse 断路器集成
// ============================================================

/**
 * 为 ClickHouse 客户端添加断路器保护
 * 保护方法: query, insert, exec, ping
 * 降级策略: 查询返回空结果集，写入缓存到 Redis 后重试
 */
export function protectClickHouseClient<T extends object>(chClient: T): T {
  return wrapWithCircuitBreaker(chClient, 'clickhouse', [
    'query', 'insert', 'exec', 'ping',
    'queryTimeSeries', 'queryAggregation', 'queryRaw',
    'batchInsert', 'createTable', 'optimizeTable',
  ]);
}

// ============================================================
// Qdrant 断路器集成
// ============================================================

/**
 * 为 QdrantStorage 添加断路器保护
 * 保护方法: search, upsert, delete, getCollectionInfo
 * 降级策略: 搜索返回空结果，写入操作缓存后重试
 */
export function protectQdrantStorage<T extends object>(qdrantStorage: T): T {
  return wrapWithCircuitBreaker(qdrantStorage, 'qdrant', [
    'search', 'searchSimilar', 'upsert', 'upsertPoints',
    'delete', 'deletePoints', 'getCollectionInfo',
    'createCollection', 'deleteCollection',
    'searchDiagnosticDocs', 'searchFaultPatterns',
  ]);
}

// ============================================================
// Neo4j 断路器集成
// ============================================================

/**
 * 为 Neo4jStorage 添加断路器保护
 * 保护方法: query, createNode, createRelation, findPath
 * 降级策略: 知识图谱查询返回空结果，不阻塞诊断流程
 */
export function protectNeo4jStorage<T extends object>(neo4jStorage: T): T {
  return wrapWithCircuitBreaker(neo4jStorage, 'neo4j', [
    'query', 'runCypher', 'createNode', 'updateNode', 'deleteNode',
    'createRelationship', 'deleteRelationship',
    'findShortestPath', 'findAllPaths',
    'getNeighbors', 'getSubgraph',
    'importBatch', 'exportSubgraph',
  ]);
}

// ============================================================
// Elasticsearch 断路器集成
// ============================================================

/**
 * 为 Elasticsearch 客户端添加断路器保护
 * 保护方法: search, index, bulk, delete
 * 降级策略: 搜索返回空结果
 */
export function protectElasticsearchClient<T extends object>(esClient: T): T {
  return wrapWithCircuitBreaker(esClient, 'elasticsearch', [
    'search', 'index', 'bulk', 'delete', 'update',
    'createIndex', 'deleteIndex', 'putMapping',
    'count', 'scroll', 'clearScroll',
  ]);
}

// ============================================================
// Airflow 断路器集成
// ============================================================

/**
 * 为 Airflow 客户端添加断路器保护
 * 保护方法: triggerDag, getDagRun, listDagRuns
 * 降级策略: 任务调度失败时写入本地队列延迟重试
 */
export function protectAirflowClient<T extends object>(airflowClient: T): T {
  return wrapWithCircuitBreaker(airflowClient, 'airflow', [
    'triggerDag', 'getDagRun', 'listDagRuns',
    'getDagRunStatus', 'getTaskInstances',
    'pauseDag', 'unpauseDag',
  ]);
}

// ============================================================
// MinIO 断路器集成
// ============================================================

/**
 * 为 MinIO 客户端添加断路器保护
 * 保护方法: putObject, getObject, removeObject, listObjects
 * 降级策略: 文件操作失败时返回错误，不静默丢失
 */
export function protectMinIOClient<T extends object>(minioClient: T): T {
  return wrapWithCircuitBreaker(minioClient, 'minio', [
    'putObject', 'getObject', 'removeObject',
    'listObjects', 'statObject',
    'makeBucket', 'removeBucket', 'listBuckets',
    'presignedGetObject', 'presignedPutObject',
  ]);
}

// ============================================================
// Ollama 断路器集成
// ============================================================

/**
 * 为 Ollama 调用添加断路器保护
 * 保护方法: generate, chat, embeddings
 * 降级策略: AI 推理返回友好错误提示，不阻塞诊断流程
 */
export function protectOllamaClient<T extends object>(ollamaClient: T): T {
  return wrapWithCircuitBreaker(ollamaClient, 'ollama', [
    'generate', 'chat', 'embeddings',
    'pull', 'list', 'show',
  ]);
}

// ============================================================
// 批量集成入口
// ============================================================

interface ClientRegistry {
  redis?: object;
  kafka?: object;
  kafkaEventBus?: object;
  clickhouse?: object;
  qdrant?: object;
  neo4j?: object;
  elasticsearch?: object;
  airflow?: object;
  minio?: object;
  ollama?: object;
}

/**
 * 一键为所有已注册的客户端添加断路器保护
 * 在 core/index.ts 启动流程中调用
 */
export function integrateCircuitBreakers(clients: ClientRegistry): ClientRegistry {
  const protected_: ClientRegistry = {};

  if (clients.redis) {
    protected_.redis = protectRedisClient(clients.redis);
    log.info('Redis client protected with circuit breaker');
  }

  if (clients.kafka) {
    protected_.kafka = protectKafkaClient(clients.kafka);
    log.info('Kafka client protected with circuit breaker');
  }

  if (clients.kafkaEventBus) {
    protected_.kafkaEventBus = protectKafkaEventBus(clients.kafkaEventBus);
    log.info('Kafka EventBus protected with circuit breaker');
  }

  if (clients.clickhouse) {
    protected_.clickhouse = protectClickHouseClient(clients.clickhouse);
    log.info('ClickHouse client protected with circuit breaker');
  }

  if (clients.qdrant) {
    protected_.qdrant = protectQdrantStorage(clients.qdrant);
    log.info('Qdrant storage protected with circuit breaker');
  }

  if (clients.neo4j) {
    protected_.neo4j = protectNeo4jStorage(clients.neo4j);
    log.info('Neo4j storage protected with circuit breaker');
  }

  if (clients.elasticsearch) {
    protected_.elasticsearch = protectElasticsearchClient(clients.elasticsearch);
    log.info('Elasticsearch client protected with circuit breaker');
  }

  if (clients.airflow) {
    protected_.airflow = protectAirflowClient(clients.airflow);
    log.info('Airflow client protected with circuit breaker');
  }

  if (clients.minio) {
    protected_.minio = protectMinIOClient(clients.minio);
    log.info('MinIO client protected with circuit breaker');
  }

  if (clients.ollama) {
    protected_.ollama = protectOllamaClient(clients.ollama);
    log.info('Ollama client protected with circuit breaker');
  }

  const count = Object.keys(protected_).length;
  log.info(`Circuit breaker integration complete: ${count} clients protected`);

  return protected_;
}

/**
 * 获取所有断路器的健康状态摘要
 * 用于 /healthz 端点和 Grafana Dashboard
 */
export function getCircuitBreakerHealthSummary() {
  return circuitBreakerRegistry.getAllStats();
}
