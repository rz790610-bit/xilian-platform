/**
 * 资源自动发现服务
 * 
 * 扫描平台已注册的各类资源（数据库表、Kafka Topic、向量集合、模型、
 * 边缘节点、对象存储桶等），自动生成对应的 Pipeline 组件定义。
 * 
 * 设计原则：
 *   1. 每个 ResourceScanner 独立负责一类资源的扫描
 *   2. 扫描结果统一转换为 DiscoveredComponent 格式
 *   3. 支持增量刷新和缓存，避免频繁扫描
 *   4. 扫描失败不影响其他资源类型
 */

import type { EditorNodeType } from '../../../shared/pipelineTypes';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('resource-discovery');

// ============ 类型定义 ============

/** 发现的组件参数定义 */
export interface DiscoveredParam {

  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json';
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  description?: string;
}

/** 自动发现的组件 */
export interface DiscoveredComponent {
  /** 唯一标识：{resourceType}:{resourceId} */
  id: string;
  /** 组件显示名称 */
  name: string;
  /** 组件描述 */
  description: string;
  /** 节点类型：source / processor / sink */
  nodeType: EditorNodeType;
  /** 资源类型标识 */
  resourceType: string;
  /** 资源来源（如数据库名、集群名） */
  resourceOrigin: string;
  /** 图标（emoji 或 icon name） */
  icon: string;
  /** 标签 */
  tags: string[];
  /** 可配置参数 */
  params: DiscoveredParam[];
  /** 预填充的默认配置 */
  defaultConfig: Record<string, unknown>;
  /** 资源健康状态 */
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  /** 最后发现时间 */
  discoveredAt: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/** 资源扫描器接口 */
interface ResourceScanner {
  /** 扫描器名称 */
  name: string;
  /** 扫描器描述 */
  description: string;
  /** 执行扫描 */
  scan(): Promise<DiscoveredComponent[]>;
}

/** 发现结果摘要 */
export interface DiscoverySummary {
  totalComponents: number;
  byResourceType: Record<string, number>;
  byNodeType: Record<string, number>;
  lastScanAt: string;
  scanDurationMs: number;
  errors: Array<{ scanner: string; error: string }>;
}

// ============ 资源扫描器实现 ============

/** MySQL 表扫描器 — 扫描数据库中的表，生成读取/写入组件 */
class MySQLTableScanner implements ResourceScanner {
  name = 'mysql-tables';
  description = '扫描 MySQL 数据库表，生成数据源和写入组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const { schemaRegistry } = await import('./schema-registry.service');
      const tables = await schemaRegistry.listTables();

      for (const tableName of tables) {
        let columns: any[] = [];
        try {
          columns = await schemaRegistry.getTableSchema(tableName);
        } catch { /* ignore */ }

        const columnNames = columns.map((c: any) => c.COLUMN_NAME || c.column_name).filter(Boolean);

        // 生成数据源组件（读取）
        components.push({
          id: `mysql-read:${tableName}`,
          name: `MySQL: ${tableName}`,
          description: `从 MySQL 表 ${tableName} 读取数据（${columnNames.length} 列）`,
          nodeType: 'source',
          resourceType: 'mysql-table',
          resourceOrigin: 'MySQL 主库',
          icon: '🐬',
          tags: ['MySQL', '关系型', tableName],
          params: [
            { key: 'table', label: '表名', type: 'string', defaultValue: tableName, required: true },
            { key: 'columns', label: '查询列', type: 'string', defaultValue: columnNames.join(', '), description: '逗号分隔的列名，* 表示全部' },
            { key: 'where', label: '过滤条件', type: 'string', description: 'SQL WHERE 子句' },
            { key: 'limit', label: '行数限制', type: 'number', defaultValue: 1000 },
            { key: 'orderBy', label: '排序', type: 'string', description: '排序字段和方向' },
          ],
          defaultConfig: { table: tableName, columns: '*', limit: 1000 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
          metadata: { columnCount: columnNames.length, columns: columnNames },
        });

        // 生成目标组件（写入）
        components.push({
          id: `mysql-write:${tableName}`,
          name: `MySQL 写入: ${tableName}`,
          description: `将数据写入 MySQL 表 ${tableName}`,
          nodeType: 'sink',
          resourceType: 'mysql-table',
          resourceOrigin: 'MySQL 主库',
          icon: '🐬',
          tags: ['MySQL', '写入', tableName],
          params: [
            { key: 'table', label: '目标表', type: 'string', defaultValue: tableName, required: true },
            { key: 'mode', label: '写入模式', type: 'select', defaultValue: 'insert', options: [
              { label: '插入', value: 'insert' },
              { label: '更新或插入', value: 'upsert' },
              { label: '替换', value: 'replace' },
            ]},
            { key: 'batchSize', label: '批量大小', type: 'number', defaultValue: 100 },
          ],
          defaultConfig: { table: tableName, mode: 'insert', batchSize: 100 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
          metadata: { columnCount: columnNames.length, columns: columnNames },
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] MySQL scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** Kafka Topic 扫描器 */
class KafkaTopicScanner implements ResourceScanner {
  name = 'kafka-topics';
  description = '扫描 Kafka 集群的 Topic，生成消费/生产组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const { kafkaCluster } = await import('../../lib/dataflow/kafkaCluster');
      if (!kafkaCluster) return components;

      const topics = await kafkaCluster.listTopics();

      for (const topic of topics) {
        // 消费者组件
        components.push({
          id: `kafka-consume:${topic}`,
          name: `Kafka: ${topic}`,
          description: `从 Kafka Topic "${topic}" 消费消息`,
          nodeType: 'source',
          resourceType: 'kafka-topic',
          resourceOrigin: 'Kafka 集群',
          icon: '📨',
          tags: ['Kafka', '流式', topic],
          params: [
            { key: 'topic', label: 'Topic', type: 'string', defaultValue: topic, required: true },
            { key: 'groupId', label: '消费者组', type: 'string', defaultValue: `pipeline-${topic}` },
            { key: 'fromBeginning', label: '从头消费', type: 'boolean', defaultValue: false },
            { key: 'maxBatchSize', label: '批次大小', type: 'number', defaultValue: 100 },
          ],
          defaultConfig: { topic, groupId: `pipeline-${topic}`, fromBeginning: false, maxBatchSize: 100 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });

        // 生产者组件
        components.push({
          id: `kafka-produce:${topic}`,
          name: `Kafka 发送: ${topic}`,
          description: `将数据发送到 Kafka Topic "${topic}"`,
          nodeType: 'sink',
          resourceType: 'kafka-topic',
          resourceOrigin: 'Kafka 集群',
          icon: '📨',
          tags: ['Kafka', '写入', topic],
          params: [
            { key: 'topic', label: 'Topic', type: 'string', defaultValue: topic, required: true },
            { key: 'keyField', label: '消息 Key 字段', type: 'string', description: '用作 Kafka 消息 Key 的数据字段' },
            { key: 'compression', label: '压缩', type: 'select', defaultValue: 'none', options: [
              { label: '无', value: 'none' },
              { label: 'GZIP', value: 'gzip' },
              { label: 'Snappy', value: 'snappy' },
              { label: 'LZ4', value: 'lz4' },
            ]},
          ],
          defaultConfig: { topic, compression: 'none' },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] Kafka scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** Qdrant 向量集合扫描器 */
class QdrantCollectionScanner implements ResourceScanner {
  name = 'qdrant-collections';
  description = '扫描 Qdrant 向量数据库的集合，生成写入/检索组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const { qdrantStorage } = await import('../../lib/storage/qdrant.storage');
      if (!qdrantStorage) return components;

      const collectionsStats = await qdrantStorage.getAllCollectionsStats();
      const collections = collectionsStats.map(c => ({ name: c.name }));

      for (const col of collections) {
        const colName = typeof col === 'string' ? col : col.name;

        // 向量写入组件
        components.push({
          id: `qdrant-write:${colName}`,
          name: `Qdrant 写入: ${colName}`,
          description: `将向量数据写入 Qdrant 集合 "${colName}"`,
          nodeType: 'sink',
          resourceType: 'qdrant-collection',
          resourceOrigin: 'Qdrant 向量库',
          icon: '🧮',
          tags: ['Qdrant', '向量', colName],
          params: [
            { key: 'collection', label: '集合名', type: 'string', defaultValue: colName, required: true },
            { key: 'vectorField', label: '向量字段', type: 'string', defaultValue: 'embedding' },
            { key: 'batchSize', label: '批量大小', type: 'number', defaultValue: 50 },
          ],
          defaultConfig: { collection: colName, vectorField: 'embedding', batchSize: 50 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
          metadata: typeof col === 'object' ? col : undefined,
        });

        // 向量检索组件
        components.push({
          id: `qdrant-search:${colName}`,
          name: `Qdrant 检索: ${colName}`,
          description: `从 Qdrant 集合 "${colName}" 检索相似向量`,
          nodeType: 'source',
          resourceType: 'qdrant-collection',
          resourceOrigin: 'Qdrant 向量库',
          icon: '🔎',
          tags: ['Qdrant', '检索', colName],
          params: [
            { key: 'collection', label: '集合名', type: 'string', defaultValue: colName, required: true },
            { key: 'topK', label: 'Top K', type: 'number', defaultValue: 10 },
            { key: 'scoreThreshold', label: '分数阈值', type: 'number', defaultValue: 0.7 },
          ],
          defaultConfig: { collection: colName, topK: 10, scoreThreshold: 0.7 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] Qdrant scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** ClickHouse 表扫描器 */
class ClickHouseTableScanner implements ResourceScanner {
  name = 'clickhouse-tables';
  description = '扫描 ClickHouse 时序/分析表，生成查询/写入组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const { clickhouseStorage } = await import('../../lib/storage/clickhouse.storage');
      if (!clickhouseStorage) return components;

      // ClickHouse 常见的业务表
      const knownTables = [
        { name: 'sensor_data', desc: '传感器时序数据' },
        { name: 'device_events', desc: '设备事件日志' },
        { name: 'metrics', desc: '系统指标数据' },
        { name: 'audit_logs', desc: '审计日志' },
      ];

      for (const table of knownTables) {
        components.push({
          id: `clickhouse-read:${table.name}`,
          name: `ClickHouse: ${table.name}`,
          description: `从 ClickHouse 查询 ${table.desc}`,
          nodeType: 'source',
          resourceType: 'clickhouse-table',
          resourceOrigin: 'ClickHouse 集群',
          icon: '⚡',
          tags: ['ClickHouse', '时序', table.name],
          params: [
            { key: 'table', label: '表名', type: 'string', defaultValue: table.name, required: true },
            { key: 'query', label: '查询SQL', type: 'string', description: '自定义 ClickHouse SQL' },
            { key: 'timeRange', label: '时间范围', type: 'string', defaultValue: '1h', description: '如 1h, 24h, 7d' },
            { key: 'limit', label: '行数限制', type: 'number', defaultValue: 10000 },
          ],
          defaultConfig: { table: table.name, timeRange: '1h', limit: 10000 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });

        components.push({
          id: `clickhouse-write:${table.name}`,
          name: `ClickHouse 写入: ${table.name}`,
          description: `将数据写入 ClickHouse 表 ${table.name}`,
          nodeType: 'sink',
          resourceType: 'clickhouse-table',
          resourceOrigin: 'ClickHouse 集群',
          icon: '⚡',
          tags: ['ClickHouse', '写入', table.name],
          params: [
            { key: 'table', label: '目标表', type: 'string', defaultValue: table.name, required: true },
            { key: 'batchSize', label: '批量大小', type: 'number', defaultValue: 1000 },
            { key: 'flushInterval', label: '刷新间隔(ms)', type: 'number', defaultValue: 5000 },
          ],
          defaultConfig: { table: table.name, batchSize: 1000, flushInterval: 5000 },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] ClickHouse scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** 模型注册表扫描器 */
class ModelRegistryScanner implements ResourceScanner {
  name = 'model-registry';
  description = '扫描已注册的 ML/LLM 模型，生成推理组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      // 平台内置模型列表
      const builtinModels = [
        { id: 'vibration-anomaly', name: '振动异常检测', type: 'anomaly_detection', framework: 'PyTorch' },
        { id: 'bearing-rul', name: '轴承剩余寿命预测', type: 'regression', framework: 'TensorFlow' },
        { id: 'fault-classifier', name: '故障分类模型', type: 'classification', framework: 'ONNX' },
        { id: 'llama-3.1-70b', name: 'Llama 3.1 70B', type: 'llm', framework: 'Ollama' },
        { id: 'text-embedding', name: '文本向量化模型', type: 'embedding', framework: 'SentenceTransformers' },
        { id: 'whisper-large', name: 'Whisper 语音识别', type: 'speech_to_text', framework: 'OpenAI' },
        { id: 'ocr-paddle', name: 'PaddleOCR 文字识别', type: 'ocr', framework: 'PaddlePaddle' },
      ];

      for (const model of builtinModels) {
        components.push({
          id: `model-inference:${model.id}`,
          name: `模型: ${model.name}`,
          description: `调用 ${model.name}（${model.framework}）进行推理`,
          nodeType: 'processor',
          resourceType: 'model',
          resourceOrigin: '模型仓库',
          icon: model.type === 'llm' ? '🧠' : model.type === 'embedding' ? '🔢' : '🤖',
          tags: [model.framework, model.type, model.name],
          params: [
            { key: 'modelId', label: '模型ID', type: 'string', defaultValue: model.id, required: true },
            { key: 'batchSize', label: '推理批次', type: 'number', defaultValue: model.type === 'llm' ? 1 : 32 },
            { key: 'timeout', label: '超时(ms)', type: 'number', defaultValue: model.type === 'llm' ? 30000 : 5000 },
            ...(model.type === 'llm' ? [
              { key: 'temperature', label: '温度', type: 'number' as const, defaultValue: 0.7 },
              { key: 'maxTokens', label: '最大Token', type: 'number' as const, defaultValue: 2048 },
            ] : []),
          ],
          defaultConfig: {
            modelId: model.id,
            batchSize: model.type === 'llm' ? 1 : 32,
            timeout: model.type === 'llm' ? 30000 : 5000,
          },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
          metadata: { framework: model.framework, type: model.type },
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] Model scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** Redis 扫描器 */
class RedisScanner implements ResourceScanner {
  name = 'redis';
  description = '扫描 Redis 连接，生成缓存读写组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      // Redis 读取
      components.push({
        id: 'redis-read:default',
        name: 'Redis 缓存读取',
        description: '从 Redis 读取缓存数据或订阅频道',
        nodeType: 'source',
        resourceType: 'redis',
        resourceOrigin: 'Redis 集群',
        icon: '💾',
        tags: ['Redis', '缓存'],
        params: [
          { key: 'pattern', label: 'Key 模式', type: 'string', defaultValue: '*', description: 'Redis Key 匹配模式' },
          { key: 'mode', label: '读取模式', type: 'select', defaultValue: 'scan', options: [
            { label: '扫描 Keys', value: 'scan' },
            { label: '订阅频道', value: 'subscribe' },
            { label: '读取 Stream', value: 'stream' },
          ]},
          { key: 'count', label: '扫描数量', type: 'number', defaultValue: 100 },
        ],
        defaultConfig: { pattern: '*', mode: 'scan', count: 100 },
        status: 'healthy',
        discoveredAt: new Date().toISOString(),
      });

      // Redis 写入
      components.push({
        id: 'redis-write:default',
        name: 'Redis 缓存写入',
        description: '将数据写入 Redis 缓存',
        nodeType: 'sink',
        resourceType: 'redis',
        resourceOrigin: 'Redis 集群',
        icon: '💾',
        tags: ['Redis', '写入'],
        params: [
          { key: 'keyTemplate', label: 'Key 模板', type: 'string', defaultValue: 'pipeline:{id}', description: '支持 {field} 变量替换' },
          { key: 'ttl', label: 'TTL(秒)', type: 'number', defaultValue: 3600 },
          { key: 'mode', label: '写入模式', type: 'select', defaultValue: 'set', options: [
            { label: 'SET', value: 'set' },
            { label: 'HSET', value: 'hset' },
            { label: 'LPUSH', value: 'lpush' },
            { label: 'XADD (Stream)', value: 'xadd' },
          ]},
        ],
        defaultConfig: { keyTemplate: 'pipeline:{id}', ttl: 3600, mode: 'set' },
        status: 'healthy',
        discoveredAt: new Date().toISOString(),
      });
    } catch (err) {
      log.warn('[ResourceDiscovery] Redis scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** Neo4j 图数据库扫描器 */
class Neo4jScanner implements ResourceScanner {
  name = 'neo4j';
  description = '扫描 Neo4j 图数据库，生成图查询/写入组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      components.push({
        id: 'neo4j-read:default',
        name: 'Neo4j 图查询',
        description: '从 Neo4j 图数据库查询节点和关系',
        nodeType: 'source',
        resourceType: 'neo4j',
        resourceOrigin: 'Neo4j 图数据库',
        icon: '🕸️',
        tags: ['Neo4j', '图数据库'],
        params: [
          { key: 'cypher', label: 'Cypher 查询', type: 'string', required: true, description: 'Neo4j Cypher 查询语句' },
          { key: 'limit', label: '结果限制', type: 'number', defaultValue: 100 },
        ],
        defaultConfig: { cypher: 'MATCH (n) RETURN n LIMIT 100', limit: 100 },
        status: 'healthy',
        discoveredAt: new Date().toISOString(),
      });

      components.push({
        id: 'neo4j-write:default',
        name: 'Neo4j 图写入',
        description: '将数据写入 Neo4j（创建节点和关系）',
        nodeType: 'sink',
        resourceType: 'neo4j',
        resourceOrigin: 'Neo4j 图数据库',
        icon: '🕸️',
        tags: ['Neo4j', '写入'],
        params: [
          { key: 'mode', label: '写入模式', type: 'select', defaultValue: 'merge', options: [
            { label: '合并 (MERGE)', value: 'merge' },
            { label: '创建 (CREATE)', value: 'create' },
          ]},
          { key: 'nodeLabel', label: '节点标签', type: 'string', required: true },
          { key: 'batchSize', label: '批量大小', type: 'number', defaultValue: 100 },
        ],
        defaultConfig: { mode: 'merge', batchSize: 100 },
        status: 'healthy',
        discoveredAt: new Date().toISOString(),
      });
    } catch (err) {
      log.warn('[ResourceDiscovery] Neo4j scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** MinIO/S3 对象存储扫描器 */
class MinIOScanner implements ResourceScanner {
  name = 'minio-s3';
  description = '扫描 MinIO/S3 存储桶，生成文件读写组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const knownBuckets = ['raw-data', 'processed-data', 'models', 'exports', 'uploads'];

      for (const bucket of knownBuckets) {
        components.push({
          id: `minio-read:${bucket}`,
          name: `S3: ${bucket}`,
          description: `从对象存储桶 "${bucket}" 读取文件`,
          nodeType: 'source',
          resourceType: 'minio-bucket',
          resourceOrigin: 'MinIO/S3',
          icon: '📦',
          tags: ['MinIO', 'S3', bucket],
          params: [
            { key: 'bucket', label: '存储桶', type: 'string', defaultValue: bucket, required: true },
            { key: 'prefix', label: '路径前缀', type: 'string', defaultValue: '' },
            { key: 'filePattern', label: '文件匹配', type: 'string', defaultValue: '*.csv', description: 'glob 模式' },
          ],
          defaultConfig: { bucket, prefix: '', filePattern: '*' },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });

        components.push({
          id: `minio-write:${bucket}`,
          name: `S3 上传: ${bucket}`,
          description: `将文件上传到对象存储桶 "${bucket}"`,
          nodeType: 'sink',
          resourceType: 'minio-bucket',
          resourceOrigin: 'MinIO/S3',
          icon: '📦',
          tags: ['MinIO', '上传', bucket],
          params: [
            { key: 'bucket', label: '存储桶', type: 'string', defaultValue: bucket, required: true },
            { key: 'pathTemplate', label: '路径模板', type: 'string', defaultValue: '{date}/{filename}' },
            { key: 'format', label: '输出格式', type: 'select', defaultValue: 'json', options: [
              { label: 'JSON', value: 'json' },
              { label: 'CSV', value: 'csv' },
              { label: 'Parquet', value: 'parquet' },
            ]},
          ],
          defaultConfig: { bucket, pathTemplate: '{date}/{filename}', format: 'json' },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] MinIO scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** MQTT 扫描器 */
class MQTTScanner implements ResourceScanner {
  name = 'mqtt';
  description = '扫描 MQTT Broker，生成工业传感器数据采集组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const knownTopics = [
        { topic: 'factory/+/vibration', desc: '振动传感器数据' },
        { topic: 'factory/+/temperature', desc: '温度传感器数据' },
        { topic: 'factory/+/pressure', desc: '压力传感器数据' },
        { topic: 'factory/+/current', desc: '电流传感器数据' },
        { topic: 'factory/+/status', desc: '设备状态数据' },
      ];

      for (const { topic, desc } of knownTopics) {
        components.push({
          id: `mqtt-subscribe:${topic.replace(/[/+#]/g, '_')}`,
          name: `MQTT: ${desc}`,
          description: `订阅 MQTT 主题 "${topic}" 采集${desc}`,
          nodeType: 'source',
          resourceType: 'mqtt-topic',
          resourceOrigin: 'MQTT Broker',
          icon: '🔌',
          tags: ['MQTT', 'IoT', desc],
          params: [
            { key: 'topic', label: '主题', type: 'string', defaultValue: topic, required: true },
            { key: 'qos', label: 'QoS', type: 'select', defaultValue: '1', options: [
              { label: 'QoS 0 (最多一次)', value: '0' },
              { label: 'QoS 1 (至少一次)', value: '1' },
              { label: 'QoS 2 (恰好一次)', value: '2' },
            ]},
          ],
          defaultConfig: { topic, qos: '1' },
          status: 'healthy',
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] MQTT scan failed:', (err as Error).message);
    }
    return components;
  }
}

/** 插件引擎扫描器 — 已安装的插件可作为处理器组件 */
class PluginScanner implements ResourceScanner {
  name = 'plugins';
  description = '扫描已安装的插件，生成处理器组件';

  async scan(): Promise<DiscoveredComponent[]> {
    const components: DiscoveredComponent[] = [];
    try {
      const { pluginEngine } = await import('../../services/plugin.engine');
      if (!pluginEngine) return components;

      const plugins = pluginEngine.getAllPlugins();

      for (const plugin of plugins) {
        if (plugin.status === 'enabled' || plugin.status === 'installed') {
          components.push({
            id: `plugin:${plugin.id}`,
            name: `插件: ${plugin.name}`,
            description: `${plugin.description}（v${plugin.version}）`,
            nodeType: 'processor',
            resourceType: 'plugin',
            resourceOrigin: '插件引擎',
            icon: '🧩',
            tags: ['插件', plugin.name],
            params: [
              { key: 'pluginId', label: '插件ID', type: 'string', defaultValue: plugin.id, required: true },
              { key: 'config', label: '插件配置', type: 'json', defaultValue: {} },
            ],
            defaultConfig: { pluginId: plugin.id },
            status: plugin.status === 'enabled' ? 'healthy' : 'degraded',
            discoveredAt: new Date().toISOString(),
            metadata: { version: plugin.version, status: plugin.status },
          });
        }
      }
    } catch (err) {
      log.warn('[ResourceDiscovery] Plugin scan failed:', (err as Error).message);
    }
    return components;
  }
}

// ============ 资源发现服务主类 ============

export class ResourceDiscoveryService {
  private scanners: ResourceScanner[] = [];
  private cache: DiscoveredComponent[] = [];
  private lastScanAt: string = '';
  private lastScanDurationMs: number = 0;
  private lastErrors: Array<{ scanner: string; error: string }> = [];

  constructor() {
    this.scanners = [
      new MySQLTableScanner(),
      new KafkaTopicScanner(),
      new QdrantCollectionScanner(),
      new ClickHouseTableScanner(),
      new ModelRegistryScanner(),
      new RedisScanner(),
      new Neo4jScanner(),
      new MinIOScanner(),
      new MQTTScanner(),
      new PluginScanner(),
    ];
    log.debug(`[ResourceDiscovery] 初始化完成，注册 ${this.scanners.length} 个扫描器`);
  }

  /** 执行全量扫描 */
  async scan(): Promise<DiscoveredComponent[]> {
    const startTime = Date.now();
    const allComponents: DiscoveredComponent[] = [];
    const errors: Array<{ scanner: string; error: string }> = [];

    // 并行执行所有扫描器
    const results = await Promise.allSettled(
      this.scanners.map(async (scanner) => {
        try {
          const components = await scanner.scan();
          return { scanner: scanner.name, components };
        } catch (err) {
          throw { scanner: scanner.name, error: (err as Error).message };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allComponents.push(...result.value.components);
      } else {
        const reason = result.reason as { scanner: string; error: string };
        errors.push(reason);
      }
    }

    this.cache = allComponents;
    this.lastScanAt = new Date().toISOString();
    this.lastScanDurationMs = Date.now() - startTime;
    this.lastErrors = errors;

    log.debug(`[ResourceDiscovery] 扫描完成: ${allComponents.length} 个组件, ${errors.length} 个错误, 耗时 ${this.lastScanDurationMs}ms`);

    return allComponents;
  }

  /** 获取缓存的组件列表（如果没有缓存则触发扫描） */
  async getComponents(): Promise<DiscoveredComponent[]> {
    if (this.cache.length === 0) {
      await this.scan();
    }
    return this.cache;
  }

  /** 按资源类型过滤 */
  async getByResourceType(resourceType: string): Promise<DiscoveredComponent[]> {
    const all = await this.getComponents();
    return all.filter(c => c.resourceType === resourceType);
  }

  /** 按节点类型过滤 */
  async getByNodeType(nodeType: EditorNodeType): Promise<DiscoveredComponent[]> {
    const all = await this.getComponents();
    return all.filter(c => c.nodeType === nodeType);
  }

  /** 搜索组件 */
  async search(query: string): Promise<DiscoveredComponent[]> {
    const all = await this.getComponents();
    const q = query.toLowerCase();
    return all.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q)) ||
      c.resourceType.toLowerCase().includes(q)
    );
  }

  /** 获取发现摘要 */
  getSummary(): DiscoverySummary {
    const byResourceType: Record<string, number> = {};
    const byNodeType: Record<string, number> = {};

    for (const c of this.cache) {
      byResourceType[c.resourceType] = (byResourceType[c.resourceType] || 0) + 1;
      byNodeType[c.nodeType] = (byNodeType[c.nodeType] || 0) + 1;
    }

    return {
      totalComponents: this.cache.length,
      byResourceType,
      byNodeType,
      lastScanAt: this.lastScanAt,
      scanDurationMs: this.lastScanDurationMs,
      errors: this.lastErrors,
    };
  }
}

export const resourceDiscovery = new ResourceDiscoveryService();
