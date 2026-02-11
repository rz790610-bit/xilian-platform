/**
 * V4.0 Kafka Topics 定义 — 5类7个Topic
 * 参考：xilian_v4_production.md §22
 */
export const KAFKA_TOPICS = {
  // ===== 类别 1：遥测数据 =====
  TELEMETRY_FEATURE: 'telemetry.feature',
  TELEMETRY_RAW: 'telemetry.raw',

  // ===== 类别 2：事件通知 =====
  EVENT_ALERT: 'event.alert',
  EVENT_SLICE_TRIGGER: 'event.slice.trigger',

  // ===== 类别 3：数据治理 =====
  GOVERNANCE_CLEAN_RESULT: 'governance.clean.result',

  // ===== 类别 4：文件事件 =====
  FILE_UPLOADED: 'event.file.uploaded',

  // ===== 类别 5：系统事件 =====
  SYSTEM_PLUGIN_EVENT: 'system.plugin.event',

  // === 兼容旧版 ===
  SENSOR_READINGS: 'xilian.sensor.readings',
  TELEMETRY: 'xilian.telemetry',
  DEVICE_EVENTS: 'xilian.device.events',
  ANOMALY_ALERTS: 'xilian.anomaly.alerts',
  ANOMALIES: 'xilian.anomalies',
  AGGREGATIONS: 'xilian.aggregations',
  DIAGNOSIS_TASKS: 'xilian.diagnosis.tasks',
  WORKFLOW_EVENTS: 'xilian.workflow.events',
  SYSTEM_LOGS: 'xilian.system.logs',
} as const;

/**
 * V4.0 Topic Schema 定义
 * 用于消息验证和文档
 */
export const KAFKA_TOPIC_SCHEMAS = {
  TELEMETRY_FEATURE: {
    pattern: 'telemetry.feature.{gateway_id}',
    partitionKey: 'device_code',
    retentionMs: 604800000, // 7天
    fields: ['timestamp', 'device_code', 'mp_code', 'features.rms', 'features.peak', 'features.kurtosis', 'features.crest_factor', 'features.skewness', 'work_condition', 'rpm', 'load_pct', 'quality_score'],
  },
  TELEMETRY_RAW: {
    pattern: 'telemetry.raw.{gateway_id}',
    partitionKey: 'device_code',
    retentionMs: 86400000, // 1天
    fields: ['timestamp', 'device_code', 'mp_code', 'values', 'sample_rate', 'quality'],
  },
  EVENT_ALERT: {
    pattern: 'event.alert.{severity}',
    partitionKey: 'device_code',
    retentionMs: 2592000000, // 30天
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
