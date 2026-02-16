/**
 * 统一 Kafka Topics 定义 — 权威来源
 * 
 * 合并了三处重复定义：
 * 1. kafka-topics.const.ts（V4.0 生产 Topic）
 * 2. kafka.client.ts（旧版兼容 Topic）
 * 3. kafkaCluster.ts（XILIAN_TOPICS 集群级 Topic）
 * 
 * 所有模块应统一从此文件导入 Topic 名称。
 * 参考：xilian_v4_production.md §22
 */

// ============ V4.0 生产 Topics（5类7个） ============

export const KAFKA_TOPICS = {
  // ===== 类别 1：遥测数据 =====
  /** 特征值遥测（RMS/峰值/峭度等，按网关分区） */
  TELEMETRY_FEATURE: 'telemetry.feature',
  /** 原始波形遥测（高采样率，按网关分区） */
  TELEMETRY_RAW: 'telemetry.raw',

  // ===== 类别 2：事件通知 =====
  /** 告警事件（按严重程度分区） */
  EVENT_ALERT: 'event.alert',
  /** 切片触发事件 */
  EVENT_SLICE_TRIGGER: 'event.slice.trigger',

  // ===== 类别 3：数据治理 =====
  /** 清洗结果 */
  GOVERNANCE_CLEAN_RESULT: 'governance.clean.result',

  // ===== 类别 4：文件事件 =====
  /** 文件上传通知 */
  FILE_UPLOADED: 'event.file.uploaded',

  // ===== 类别 5：系统事件 =====
  /** 插件生命周期事件 */
  SYSTEM_PLUGIN_EVENT: 'system.plugin.event',

  // ===== 流处理内部 Topics =====
  /** 传感器原始读数（流处理入口） */
  SENSOR_DATA: 'xilian.sensor-data',
  /** 异常检测结果 */
  ANOMALY_RESULTS: 'xilian.anomaly-results',
  /** 1 分钟聚合数据 */
  AGGREGATIONS_1M: 'xilian.aggregations-1m',
  /** 1 小时聚合数据 */
  AGGREGATIONS_1H: 'xilian.aggregations-1h',
  /** CDC 变更数据捕获 */
  CDC_EVENTS: 'xilian.cdc-events',
  /** 知识图谱实体 */
  KG_ENTITIES: 'xilian.kg-entities',
  /** 故障事件 */
  FAULT_EVENTS: 'xilian.fault-events',
  /** AIS 船舶数据 */
  AIS_VESSEL: 'xilian.ais-vessel',
  /** TOS 作业数据 */
  TOS_JOB: 'xilian.tos-job',
  /** 归档通知 */
  ARCHIVE_NOTIFICATIONS: 'xilian.archive-notifications',

  // ===== 兼容旧版（映射到新 Topic） =====
  /** @deprecated 使用 SENSOR_DATA */
  SENSOR_READINGS: 'xilian.sensor.readings',
  /** @deprecated 使用 TELEMETRY_FEATURE */
  TELEMETRY: 'xilian.telemetry',
  /** @deprecated 使用 EVENT_ALERT */
  DEVICE_EVENTS: 'xilian.device.events',
  /** @deprecated 使用 ANOMALY_RESULTS */
  ANOMALY_ALERTS: 'xilian.anomaly.alerts',
  /** @deprecated 使用 ANOMALY_RESULTS */
  ANOMALIES: 'xilian.anomalies',
  /** @deprecated 使用 AGGREGATIONS_1M */
  AGGREGATIONS: 'xilian.aggregations',
  /** @deprecated */
  DIAGNOSIS_TASKS: 'xilian.diagnosis.tasks',
  /** @deprecated */
  WORKFLOW_EVENTS: 'xilian.workflow.events',
  /** @deprecated */
  SYSTEM_LOGS: 'xilian.system.logs',
} as const;

// ============ Topic 集群配置（分区、副本、保留策略） ============

export interface TopicClusterConfig {
  name: string;
  partitions: number;
  replicationFactor: number;
  retentionMs: number;
  compressionType?: 'gzip' | 'snappy' | 'lz4' | 'zstd';
  cleanupPolicy?: 'delete' | 'compact';
  minInsyncReplicas?: number;
  configs?: Record<string, string>;
}

export const KAFKA_TOPIC_CLUSTER_CONFIGS: Record<string, TopicClusterConfig> = {
  SENSOR_DATA: {
    name: KAFKA_TOPICS.SENSOR_DATA,
    partitions: 128,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'lz4',
    minInsyncReplicas: 1,
    configs: { 'segment.bytes': '1073741824', 'segment.ms': '3600000', 'max.message.bytes': '10485760' },
  },
  TELEMETRY_FEATURE: {
    name: KAFKA_TOPICS.TELEMETRY_FEATURE,
    partitions: 64,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'lz4',
    minInsyncReplicas: 1,
  },
  TELEMETRY_RAW: {
    name: KAFKA_TOPICS.TELEMETRY_RAW,
    partitions: 64,
    replicationFactor: 2,
    retentionMs: 1 * 24 * 60 * 60 * 1000,
    compressionType: 'lz4',
    minInsyncReplicas: 1,
  },
  EVENT_ALERT: {
    name: KAFKA_TOPICS.EVENT_ALERT,
    partitions: 8,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    compressionType: 'gzip',
    minInsyncReplicas: 2,
  },
  ANOMALY_RESULTS: {
    name: KAFKA_TOPICS.ANOMALY_RESULTS,
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'snappy',
    minInsyncReplicas: 1,
  },
  AGGREGATIONS_1M: {
    name: KAFKA_TOPICS.AGGREGATIONS_1M,
    partitions: 32,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    compressionType: 'lz4',
    minInsyncReplicas: 1,
  },
  AGGREGATIONS_1H: {
    name: KAFKA_TOPICS.AGGREGATIONS_1H,
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 365 * 24 * 60 * 60 * 1000,
    compressionType: 'gzip',
    minInsyncReplicas: 1,
  },
  FAULT_EVENTS: {
    name: KAFKA_TOPICS.FAULT_EVENTS,
    partitions: 8,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    compressionType: 'gzip',
    minInsyncReplicas: 2,
  },
  AIS_VESSEL: {
    name: KAFKA_TOPICS.AIS_VESSEL,
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'snappy',
    minInsyncReplicas: 1,
  },
  TOS_JOB: {
    name: KAFKA_TOPICS.TOS_JOB,
    partitions: 32,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'snappy',
    minInsyncReplicas: 1,
  },
  CDC_EVENTS: {
    name: KAFKA_TOPICS.CDC_EVENTS,
    partitions: 16,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    cleanupPolicy: 'compact',
    compressionType: 'snappy',
    minInsyncReplicas: 1,
  },
  KG_ENTITIES: {
    name: KAFKA_TOPICS.KG_ENTITIES,
    partitions: 8,
    replicationFactor: 2,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    cleanupPolicy: 'compact',
    compressionType: 'gzip',
    minInsyncReplicas: 1,
  },
  ARCHIVE_NOTIFICATIONS: {
    name: KAFKA_TOPICS.ARCHIVE_NOTIFICATIONS,
    partitions: 4,
    replicationFactor: 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    compressionType: 'gzip',
    minInsyncReplicas: 1,
  },
};

// ============ V4.0 Topic Schema 定义 ============

export const KAFKA_TOPIC_SCHEMAS = {
  TELEMETRY_FEATURE: {
    pattern: 'telemetry.feature.{gateway_id}',
    partitionKey: 'device_code',
    retentionMs: 604800000,
    fields: ['timestamp', 'device_code', 'mp_code', 'features.rms', 'features.peak', 'features.kurtosis', 'features.crest_factor', 'features.skewness', 'work_condition', 'rpm', 'load_pct', 'quality_score'],
  },
  TELEMETRY_RAW: {
    pattern: 'telemetry.raw.{gateway_id}',
    partitionKey: 'device_code',
    retentionMs: 86400000,
    fields: ['timestamp', 'device_code', 'mp_code', 'values', 'sample_rate', 'quality'],
  },
  EVENT_ALERT: {
    pattern: 'event.alert.{severity}',
    partitionKey: 'device_code',
    retentionMs: 2592000000,
    fields: ['alert_id', 'timestamp', 'device_code', 'node_id', 'alert_type', 'severity', 'value', 'threshold', 'message', 'context'],
  },
  EVENT_SLICE_TRIGGER: {
    pattern: 'event.slice.trigger',
    partitionKey: 'slice_id',
    retentionMs: 2592000000,
    fields: ['slice_id', 'timestamp', 'device_code', 'trigger_type', 'rule_id', 'rule_version', 'trigger_value', 'threshold', 'confidence'],
  },
  GOVERNANCE_CLEAN_RESULT: {
    pattern: 'governance.clean.result',
    partitionKey: 'task_id',
    retentionMs: 604800000,
    fields: ['task_id', 'slice_id', 'status', 'cleaned_count', 'error_count', 'duration_ms', 'rules_applied', 'quality_before', 'quality_after'],
  },
  FILE_UPLOADED: {
    pattern: 'event.file.uploaded',
    partitionKey: 'bucket_name',
    fields: ['file_id', 'bucket_name', 'object_key', 'file_size', 'content_type', 'uploaded_by', 'timestamp', 'metadata'],
  },
  SYSTEM_PLUGIN_EVENT: {
    pattern: 'system.plugin.event',
    partitionKey: 'instance_id',
    fields: ['instance_id', 'plugin_id', 'event_type', 'timestamp', 'payload'],
  },
} as const;

export type KafkaTopicKey = keyof typeof KAFKA_TOPICS;
