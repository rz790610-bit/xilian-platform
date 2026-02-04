/**
 * 数据管道层类型定义
 * 包含 Airflow DAGs 和 Kafka Connect 的完整类型系统
 */

// ==================== Airflow DAGs ====================

/**
 * DAG 状态枚举
 */
export type DagState = 'running' | 'success' | 'failed' | 'queued' | 'paused' | 'scheduled';

/**
 * DAG 运行状态
 */
export type DagRunState = 'running' | 'success' | 'failed' | 'queued';

/**
 * 任务状态
 */
export type TaskState = 
  | 'pending' 
  | 'running' 
  | 'success' 
  | 'failed' 
  | 'skipped' 
  | 'upstream_failed'
  | 'retry';

/**
 * 调度间隔类型
 */
export type ScheduleInterval = 
  | '@once'
  | '@hourly'
  | '@daily'
  | '@weekly'
  | '@monthly'
  | '@yearly'
  | string; // cron 表达式

/**
 * DAG 任务定义
 */
export interface DagTask {
  taskId: string;
  taskType: 'python' | 'bash' | 'sql' | 'http' | 'branch' | 'sensor';
  operator: string;
  dependencies: string[];
  config: Record<string, unknown>;
  retries: number;
  retryDelay: number; // 秒
  timeout: number; // 秒
  pool?: string;
  queue?: string;
}

/**
 * DAG 任务实例
 */
export interface TaskInstance {
  taskId: string;
  dagId: string;
  runId: string;
  state: TaskState;
  startDate?: string;
  endDate?: string;
  duration?: number;
  tryNumber: number;
  maxTries: number;
  logs?: string;
  xcomValue?: unknown;
}

/**
 * DAG 定义
 */
export interface DagDefinition {
  dagId: string;
  description: string;
  scheduleInterval: ScheduleInterval;
  startDate: string;
  endDate?: string;
  catchup: boolean;
  maxActiveRuns: number;
  concurrency: number;
  defaultArgs: {
    owner: string;
    retries: number;
    retryDelay: number;
    email?: string[];
    emailOnFailure: boolean;
    emailOnRetry: boolean;
  };
  tasks: DagTask[];
  tags: string[];
  isPaused: boolean;
}

/**
 * DAG 运行记录
 */
export interface DagRun {
  runId: string;
  dagId: string;
  state: DagRunState;
  executionDate: string;
  startDate: string;
  endDate?: string;
  externalTrigger: boolean;
  conf?: Record<string, unknown>;
  taskInstances: TaskInstance[];
}

/**
 * DAG 统计信息
 */
export interface DagStats {
  dagId: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  avgDuration: number;
  lastRunState: DagRunState;
  lastRunDate: string;
  nextRunDate?: string;
}

// ==================== 预定义 DAGs ====================

/**
 * 知识图谱优化 DAG 配置
 */
export interface KgOptimizationConfig {
  deduplicationThreshold: number; // 相似度阈值
  communityDetectionAlgorithm: 'louvain' | 'label_propagation' | 'girvan_newman';
  summaryMaxLength: number;
  batchSize: number;
}

/**
 * 向量重建 DAG 配置
 */
export interface VectorRebuildConfig {
  embeddingModel: string;
  batchSize: number;
  dimensions: number;
  collections: string[];
  recreateIndex: boolean;
}

/**
 * 模型重训练 DAG 配置
 */
export interface ModelRetrainingConfig {
  feedbackMinCount: number;
  validationSplit: number;
  epochs: number;
  learningRate: number;
  earlyStoppingPatience: number;
  modelRegistry: string;
}

/**
 * 备份 DAG 配置
 */
export interface BackupConfig {
  s3Bucket: string;
  s3Prefix: string;
  incrementalMode: boolean;
  retentionDays: number;
  encryptionEnabled: boolean;
  verifyAfterUpload: boolean;
  databases: string[];
  collections: string[];
}

// ==================== Kafka Connect ====================

/**
 * Connector 类型
 */
export type ConnectorType = 'source' | 'sink';

/**
 * Connector 状态
 */
export type ConnectorState = 'RUNNING' | 'PAUSED' | 'FAILED' | 'UNASSIGNED';

/**
 * Task 状态
 */
export type ConnectorTaskState = 'RUNNING' | 'FAILED' | 'PAUSED' | 'UNASSIGNED';

/**
 * Connector 任务
 */
export interface ConnectorTask {
  id: number;
  state: ConnectorTaskState;
  workerId: string;
  trace?: string;
}

/**
 * Connector 状态信息
 */
export interface ConnectorStatus {
  name: string;
  connector: {
    state: ConnectorState;
    workerId: string;
  };
  tasks: ConnectorTask[];
  type: ConnectorType;
}

/**
 * Connector 配置基类
 */
export interface ConnectorConfigBase {
  name: string;
  'connector.class': string;
  'tasks.max': number;
  'key.converter'?: string;
  'value.converter'?: string;
  'key.converter.schemas.enable'?: boolean;
  'value.converter.schemas.enable'?: boolean;
  'errors.tolerance'?: 'none' | 'all';
  'errors.log.enable'?: boolean;
  'errors.deadletterqueue.topic.name'?: string;
}

/**
 * Debezium PostgreSQL CDC Source Connector 配置
 */
export interface DebeziumPostgresConfig extends ConnectorConfigBase {
  'connector.class': 'io.debezium.connector.postgresql.PostgresConnector';
  'database.hostname': string;
  'database.port': number;
  'database.user': string;
  'database.password': string;
  'database.dbname': string;
  'database.server.name': string;
  'table.include.list'?: string;
  'table.exclude.list'?: string;
  'column.include.list'?: string;
  'column.exclude.list'?: string;
  'slot.name': string;
  'publication.name': string;
  'plugin.name': 'pgoutput' | 'decoderbufs' | 'wal2json';
  'snapshot.mode': 'initial' | 'never' | 'always' | 'initial_only' | 'exported';
  'tombstones.on.delete'?: boolean;
  'decimal.handling.mode'?: 'precise' | 'double' | 'string';
  'time.precision.mode'?: 'adaptive' | 'adaptive_time_microseconds' | 'connect';
  'heartbeat.interval.ms'?: number;
}

/**
 * Neo4j Sink Connector 配置
 */
export interface Neo4jSinkConfig extends ConnectorConfigBase {
  'connector.class': 'streams.kafka.connect.sink.Neo4jSinkConnector';
  'neo4j.server.uri': string;
  'neo4j.authentication.basic.username': string;
  'neo4j.authentication.basic.password': string;
  'neo4j.database'?: string;
  'neo4j.batch.size'?: number;
  'neo4j.batch.timeout.msecs'?: number;
  'neo4j.retry.backoff.msecs'?: number;
  'neo4j.retry.max.attemps'?: number;
  'topics': string;
  'neo4j.topic.cypher.*'?: string; // 动态属性
}

/**
 * ClickHouse Sink Connector 配置
 */
export interface ClickHouseSinkConfig extends ConnectorConfigBase {
  'connector.class': 'com.clickhouse.kafka.connect.ClickHouseSinkConnector';
  'hostname': string;
  'port': number;
  'database': string;
  'username'?: string;
  'password'?: string;
  'ssl': boolean;
  'topics': string;
  'table': string;
  'exactlyOnce': boolean;
  'batch.size'?: number;
  'flush.interval.ms'?: number;
  'retry.count'?: number;
  'retry.interval.ms'?: number;
  'deduplication.window.seconds'?: number;
}

/**
 * Kafka Streams 处理配置
 */
export interface KafkaStreamsConfig {
  applicationId: string;
  bootstrapServers: string;
  inputTopics: string[];
  outputTopic: string;
  processingGuarantee: 'at_least_once' | 'exactly_once' | 'exactly_once_v2';
  stateDir?: string;
  numStreamThreads: number;
  commitIntervalMs: number;
  cacheMaxBytesBuffering: number;
}

/**
 * Streams 处理器类型
 */
export type StreamProcessorType = 
  | 'filter'
  | 'map'
  | 'flatMap'
  | 'aggregate'
  | 'join'
  | 'window'
  | 'branch';

/**
 * Streams 处理器定义
 */
export interface StreamProcessor {
  id: string;
  type: StreamProcessorType;
  config: Record<string, unknown>;
  inputStream: string;
  outputStream: string;
}

/**
 * Streams 拓扑定义
 */
export interface StreamsTopology {
  id: string;
  name: string;
  description: string;
  config: KafkaStreamsConfig;
  processors: StreamProcessor[];
  state: 'RUNNING' | 'STOPPED' | 'ERROR';
  metrics?: StreamsMetrics;
}

/**
 * Streams 指标
 */
export interface StreamsMetrics {
  processRate: number;
  processLatencyAvg: number;
  processLatencyMax: number;
  commitRate: number;
  recordsConsumedRate: number;
  recordsProducedRate: number;
  stateStoreSize: number;
}

// ==================== 数据管道管理 ====================

/**
 * 数据管道概览
 */
export interface DataPipelineSummary {
  airflow: {
    status: 'healthy' | 'degraded' | 'down';
    totalDags: number;
    activeDags: number;
    runningTasks: number;
    failedTasksLast24h: number;
    schedulerHeartbeat: string;
  };
  kafkaConnect: {
    status: 'healthy' | 'degraded' | 'down';
    totalConnectors: number;
    runningConnectors: number;
    failedConnectors: number;
    totalTasks: number;
    runningTasks: number;
  };
  kafkaStreams: {
    status: 'healthy' | 'degraded' | 'down';
    totalTopologies: number;
    runningTopologies: number;
    processRate: number;
    lagTotal: number;
  };
}

// ==================== 预定义 DAG 模板 ====================

/**
 * 预定义的 DAG 模板
 */
export const PREDEFINED_DAGS: Record<string, DagDefinition> = {
  daily_kg_optimization: {
    dagId: 'daily_kg_optimization',
    description: '每日知识图谱优化：去重、合并、社区检测、摘要生成',
    scheduleInterval: '0 2 * * *', // 每天凌晨 2 点
    startDate: '2024-01-01',
    catchup: false,
    maxActiveRuns: 1,
    concurrency: 4,
    defaultArgs: {
      owner: 'xilian-platform',
      retries: 3,
      retryDelay: 300,
      emailOnFailure: true,
      emailOnRetry: false,
    },
    tasks: [
      {
        taskId: 'extract_entities',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: [],
        config: {
          python_callable: 'extract_new_entities',
          op_kwargs: { batch_size: 1000 },
        },
        retries: 2,
        retryDelay: 60,
        timeout: 3600,
      },
      {
        taskId: 'deduplicate_entities',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['extract_entities'],
        config: {
          python_callable: 'deduplicate_entities',
          op_kwargs: { similarity_threshold: 0.85 },
        },
        retries: 2,
        retryDelay: 60,
        timeout: 1800,
      },
      {
        taskId: 'merge_similar_nodes',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['deduplicate_entities'],
        config: {
          python_callable: 'merge_similar_nodes',
        },
        retries: 2,
        retryDelay: 60,
        timeout: 1800,
      },
      {
        taskId: 'detect_communities',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['merge_similar_nodes'],
        config: {
          python_callable: 'detect_communities',
          op_kwargs: { algorithm: 'louvain' },
        },
        retries: 2,
        retryDelay: 60,
        timeout: 3600,
      },
      {
        taskId: 'generate_summaries',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['detect_communities'],
        config: {
          python_callable: 'generate_community_summaries',
          op_kwargs: { max_length: 500 },
        },
        retries: 2,
        retryDelay: 60,
        timeout: 7200,
      },
      {
        taskId: 'update_graph_stats',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['generate_summaries'],
        config: {
          python_callable: 'update_graph_statistics',
        },
        retries: 1,
        retryDelay: 60,
        timeout: 600,
      },
    ],
    tags: ['knowledge-graph', 'daily', 'optimization'],
    isPaused: false,
  },

  weekly_vector_rebuild: {
    dagId: 'weekly_vector_rebuild',
    description: '每周向量全量重建：重新计算所有嵌入向量',
    scheduleInterval: '0 3 * * 0', // 每周日凌晨 3 点
    startDate: '2024-01-01',
    catchup: false,
    maxActiveRuns: 1,
    concurrency: 2,
    defaultArgs: {
      owner: 'xilian-platform',
      retries: 2,
      retryDelay: 600,
      emailOnFailure: true,
      emailOnRetry: false,
    },
    tasks: [
      {
        taskId: 'backup_current_vectors',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: [],
        config: {
          python_callable: 'backup_vector_collections',
        },
        retries: 2,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'fetch_all_documents',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['backup_current_vectors'],
        config: {
          python_callable: 'fetch_all_documents',
          op_kwargs: { batch_size: 500 },
        },
        retries: 2,
        retryDelay: 120,
        timeout: 7200,
      },
      {
        taskId: 'generate_embeddings',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['fetch_all_documents'],
        config: {
          python_callable: 'generate_embeddings',
          op_kwargs: {
            model: 'nomic-embed-text',
            batch_size: 100,
            dimensions: 768,
          },
        },
        retries: 3,
        retryDelay: 300,
        timeout: 14400,
        pool: 'gpu_pool',
      },
      {
        taskId: 'recreate_collections',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['generate_embeddings'],
        config: {
          python_callable: 'recreate_vector_collections',
        },
        retries: 2,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'insert_vectors',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['recreate_collections'],
        config: {
          python_callable: 'insert_vectors_batch',
          op_kwargs: { batch_size: 1000 },
        },
        retries: 3,
        retryDelay: 300,
        timeout: 7200,
      },
      {
        taskId: 'verify_rebuild',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['insert_vectors'],
        config: {
          python_callable: 'verify_vector_rebuild',
          op_kwargs: { sample_size: 100 },
        },
        retries: 1,
        retryDelay: 60,
        timeout: 1800,
      },
      {
        taskId: 'cleanup_backup',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['verify_rebuild'],
        config: {
          python_callable: 'cleanup_old_backups',
          op_kwargs: { keep_days: 7 },
        },
        retries: 1,
        retryDelay: 60,
        timeout: 600,
      },
    ],
    tags: ['vector', 'weekly', 'rebuild', 'embedding'],
    isPaused: false,
  },

  model_retraining: {
    dagId: 'model_retraining',
    description: '模型重训练：收集反馈、清洗数据、微调模型、验证效果',
    scheduleInterval: '0 4 * * 1', // 每周一凌晨 4 点
    startDate: '2024-01-01',
    catchup: false,
    maxActiveRuns: 1,
    concurrency: 2,
    defaultArgs: {
      owner: 'xilian-platform',
      retries: 2,
      retryDelay: 600,
      emailOnFailure: true,
      emailOnRetry: true,
    },
    tasks: [
      {
        taskId: 'collect_feedback',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: [],
        config: {
          python_callable: 'collect_user_feedback',
          op_kwargs: { min_count: 100 },
        },
        retries: 2,
        retryDelay: 120,
        timeout: 1800,
      },
      {
        taskId: 'check_feedback_count',
        taskType: 'branch',
        operator: 'BranchPythonOperator',
        dependencies: ['collect_feedback'],
        config: {
          python_callable: 'check_feedback_threshold',
          op_kwargs: { threshold: 100 },
        },
        retries: 1,
        retryDelay: 60,
        timeout: 300,
      },
      {
        taskId: 'clean_feedback_data',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['check_feedback_count'],
        config: {
          python_callable: 'clean_feedback_data',
        },
        retries: 2,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'prepare_training_data',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['clean_feedback_data'],
        config: {
          python_callable: 'prepare_training_dataset',
          op_kwargs: { validation_split: 0.2 },
        },
        retries: 2,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'finetune_model',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['prepare_training_data'],
        config: {
          python_callable: 'finetune_model',
          op_kwargs: {
            epochs: 3,
            learning_rate: 2e-5,
            early_stopping_patience: 2,
          },
        },
        retries: 2,
        retryDelay: 600,
        timeout: 28800,
        pool: 'gpu_pool',
      },
      {
        taskId: 'validate_model',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['finetune_model'],
        config: {
          python_callable: 'validate_model_performance',
          op_kwargs: { min_improvement: 0.02 },
        },
        retries: 1,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'register_model',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['validate_model'],
        config: {
          python_callable: 'register_model_to_registry',
        },
        retries: 2,
        retryDelay: 120,
        timeout: 1800,
      },
      {
        taskId: 'skip_training',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['check_feedback_count'],
        config: {
          python_callable: 'log_skip_reason',
        },
        retries: 1,
        retryDelay: 60,
        timeout: 300,
      },
    ],
    tags: ['model', 'training', 'feedback', 'weekly'],
    isPaused: false,
  },

  backup: {
    dagId: 'backup',
    description: '增量备份：数据库、向量库、配置文件备份到 S3',
    scheduleInterval: '0 1 * * *', // 每天凌晨 1 点
    startDate: '2024-01-01',
    catchup: false,
    maxActiveRuns: 1,
    concurrency: 3,
    defaultArgs: {
      owner: 'xilian-platform',
      retries: 3,
      retryDelay: 300,
      emailOnFailure: true,
      emailOnRetry: false,
    },
    tasks: [
      {
        taskId: 'backup_mysql',
        taskType: 'bash',
        operator: 'BashOperator',
        dependencies: [],
        config: {
          bash_command: 'mysqldump --single-transaction --quick',
        },
        retries: 3,
        retryDelay: 120,
        timeout: 7200,
      },
      {
        taskId: 'backup_clickhouse',
        taskType: 'bash',
        operator: 'BashOperator',
        dependencies: [],
        config: {
          bash_command: 'clickhouse-backup create',
        },
        retries: 3,
        retryDelay: 120,
        timeout: 7200,
      },
      {
        taskId: 'backup_qdrant',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: [],
        config: {
          python_callable: 'backup_qdrant_snapshots',
        },
        retries: 3,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'backup_redis',
        taskType: 'bash',
        operator: 'BashOperator',
        dependencies: [],
        config: {
          bash_command: 'redis-cli BGSAVE',
        },
        retries: 2,
        retryDelay: 60,
        timeout: 1800,
      },
      {
        taskId: 'upload_to_s3',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['backup_mysql', 'backup_clickhouse', 'backup_qdrant', 'backup_redis'],
        config: {
          python_callable: 'upload_backups_to_s3',
          op_kwargs: {
            bucket: 'xilian-backups',
            prefix: 'daily',
            incremental: true,
          },
        },
        retries: 3,
        retryDelay: 300,
        timeout: 7200,
      },
      {
        taskId: 'verify_backup',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['upload_to_s3'],
        config: {
          python_callable: 'verify_s3_backup',
          op_kwargs: { checksum: true },
        },
        retries: 2,
        retryDelay: 120,
        timeout: 3600,
      },
      {
        taskId: 'cleanup_old_backups',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['verify_backup'],
        config: {
          python_callable: 'cleanup_old_s3_backups',
          op_kwargs: { retention_days: 30 },
        },
        retries: 1,
        retryDelay: 60,
        timeout: 1800,
      },
      {
        taskId: 'send_notification',
        taskType: 'python',
        operator: 'PythonOperator',
        dependencies: ['cleanup_old_backups'],
        config: {
          python_callable: 'send_backup_notification',
        },
        retries: 1,
        retryDelay: 60,
        timeout: 300,
      },
    ],
    tags: ['backup', 'daily', 's3'],
    isPaused: false,
  },
};

// ==================== 预定义 Connector 模板 ====================

/**
 * 预定义的 Connector 配置模板
 */
export const PREDEFINED_CONNECTORS = {
  debezium_postgres_cdc: {
    name: 'debezium-postgres-cdc',
    'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
    'tasks.max': 1,
    'database.hostname': 'postgres',
    'database.port': 5432,
    'database.user': 'debezium',
    'database.password': '${POSTGRES_PASSWORD}',
    'database.dbname': 'xilian',
    'database.server.name': 'xilian-db',
    'table.include.list': 'public.devices,public.sensors,public.knowledge_entities,public.knowledge_relations',
    'slot.name': 'debezium_slot',
    'publication.name': 'debezium_publication',
    'plugin.name': 'pgoutput',
    'snapshot.mode': 'initial',
    'tombstones.on.delete': true,
    'decimal.handling.mode': 'double',
    'time.precision.mode': 'adaptive_time_microseconds',
    'heartbeat.interval.ms': 10000,
    'key.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'value.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'key.converter.schemas.enable': false,
    'value.converter.schemas.enable': false,
  } as DebeziumPostgresConfig,

  neo4j_sink: {
    name: 'neo4j-knowledge-graph-sink',
    'connector.class': 'streams.kafka.connect.sink.Neo4jSinkConnector',
    'tasks.max': 2,
    'neo4j.server.uri': 'bolt://neo4j:7687',
    'neo4j.authentication.basic.username': 'neo4j',
    'neo4j.authentication.basic.password': '${NEO4J_PASSWORD}',
    'neo4j.database': 'neo4j',
    'neo4j.batch.size': 1000,
    'neo4j.batch.timeout.msecs': 5000,
    'neo4j.retry.backoff.msecs': 1000,
    'neo4j.retry.max.attemps': 5,
    'topics': 'xilian-db.public.knowledge_entities,xilian-db.public.knowledge_relations',
    'key.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'value.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'key.converter.schemas.enable': false,
    'value.converter.schemas.enable': false,
    'errors.tolerance': 'all',
    'errors.log.enable': true,
    'errors.deadletterqueue.topic.name': 'neo4j-sink-dlq',
  } as Neo4jSinkConfig,

  clickhouse_sensor_sink: {
    name: 'clickhouse-sensor-data-sink',
    'connector.class': 'com.clickhouse.kafka.connect.ClickHouseSinkConnector',
    'tasks.max': 4,
    'hostname': 'clickhouse',
    'port': 8123,
    'database': 'xilian',
    'username': 'default',
    'password': '${CLICKHOUSE_PASSWORD}',
    'ssl': false,
    'topics': 'sensor-readings,device-telemetry',
    'table': 'sensor_readings',
    'exactlyOnce': true,
    'batch.size': 10000,
    'flush.interval.ms': 1000,
    'retry.count': 3,
    'retry.interval.ms': 1000,
    'deduplication.window.seconds': 60,
    'key.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'value.converter': 'org.apache.kafka.connect.json.JsonConverter',
    'key.converter.schemas.enable': false,
    'value.converter.schemas.enable': false,
    'errors.tolerance': 'all',
    'errors.log.enable': true,
  } as ClickHouseSinkConfig,
};

/**
 * 预定义的 Kafka Streams 拓扑
 */
export const PREDEFINED_STREAMS_TOPOLOGIES: StreamsTopology[] = [
  {
    id: 'sensor-data-cleansing',
    name: '传感器数据清洗',
    description: '过滤异常值、补充缺失数据、标准化格式',
    config: {
      applicationId: 'sensor-data-cleansing',
      bootstrapServers: 'kafka:9092',
      inputTopics: ['raw-sensor-readings'],
      outputTopic: 'cleaned-sensor-readings',
      processingGuarantee: 'exactly_once_v2',
      numStreamThreads: 4,
      commitIntervalMs: 1000,
      cacheMaxBytesBuffering: 10485760,
    },
    processors: [
      {
        id: 'filter-null-values',
        type: 'filter',
        config: {
          predicate: 'value != null && value.reading != null',
        },
        inputStream: 'raw-sensor-readings',
        outputStream: 'non-null-readings',
      },
      {
        id: 'filter-outliers',
        type: 'filter',
        config: {
          predicate: 'value.reading >= -1000 && value.reading <= 10000',
        },
        inputStream: 'non-null-readings',
        outputStream: 'valid-readings',
      },
      {
        id: 'normalize-units',
        type: 'map',
        config: {
          mapper: 'normalizeUnits',
        },
        inputStream: 'valid-readings',
        outputStream: 'normalized-readings',
      },
      {
        id: 'add-metadata',
        type: 'map',
        config: {
          mapper: 'addProcessingMetadata',
        },
        inputStream: 'normalized-readings',
        outputStream: 'cleaned-sensor-readings',
      },
    ],
    state: 'RUNNING',
  },
  {
    id: 'sensor-data-aggregation',
    name: '传感器数据聚合',
    description: '按设备和时间窗口聚合传感器数据',
    config: {
      applicationId: 'sensor-data-aggregation',
      bootstrapServers: 'kafka:9092',
      inputTopics: ['cleaned-sensor-readings'],
      outputTopic: 'aggregated-sensor-data',
      processingGuarantee: 'exactly_once_v2',
      numStreamThreads: 2,
      commitIntervalMs: 5000,
      cacheMaxBytesBuffering: 52428800,
    },
    processors: [
      {
        id: 'group-by-device',
        type: 'aggregate',
        config: {
          groupBy: 'deviceId',
          windowType: 'tumbling',
          windowSize: 60000, // 1 分钟
          aggregations: {
            avgReading: 'avg(reading)',
            maxReading: 'max(reading)',
            minReading: 'min(reading)',
            count: 'count(*)',
          },
        },
        inputStream: 'cleaned-sensor-readings',
        outputStream: 'minute-aggregates',
      },
      {
        id: 'hourly-aggregation',
        type: 'aggregate',
        config: {
          groupBy: 'deviceId',
          windowType: 'tumbling',
          windowSize: 3600000, // 1 小时
          aggregations: {
            avgReading: 'avg(avgReading)',
            maxReading: 'max(maxReading)',
            minReading: 'min(minReading)',
            totalCount: 'sum(count)',
          },
        },
        inputStream: 'minute-aggregates',
        outputStream: 'aggregated-sensor-data',
      },
    ],
    state: 'RUNNING',
  },
  {
    id: 'anomaly-detection-stream',
    name: '异常检测流',
    description: '实时检测传感器数据异常',
    config: {
      applicationId: 'anomaly-detection-stream',
      bootstrapServers: 'kafka:9092',
      inputTopics: ['cleaned-sensor-readings'],
      outputTopic: 'anomaly-alerts',
      processingGuarantee: 'at_least_once',
      numStreamThreads: 2,
      commitIntervalMs: 1000,
      cacheMaxBytesBuffering: 10485760,
    },
    processors: [
      {
        id: 'sliding-window-stats',
        type: 'window',
        config: {
          windowType: 'sliding',
          windowSize: 300000, // 5 分钟
          advanceBy: 60000, // 1 分钟
          computations: {
            mean: 'avg(reading)',
            stddev: 'stddev(reading)',
          },
        },
        inputStream: 'cleaned-sensor-readings',
        outputStream: 'windowed-stats',
      },
      {
        id: 'detect-anomalies',
        type: 'filter',
        config: {
          predicate: 'abs(reading - mean) > 3 * stddev',
        },
        inputStream: 'windowed-stats',
        outputStream: 'detected-anomalies',
      },
      {
        id: 'enrich-anomaly',
        type: 'map',
        config: {
          mapper: 'enrichAnomalyWithContext',
        },
        inputStream: 'detected-anomalies',
        outputStream: 'anomaly-alerts',
      },
    ],
    state: 'RUNNING',
  },
];
