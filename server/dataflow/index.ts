/**
 * 数据流层统一导出
 */

// Kafka Cluster
export {
  kafkaCluster,
  KafkaClusterService,
  XILIAN_TOPICS,
  type KafkaClusterConfig,
  type BrokerConfig,
  type TopicConfig,
} from './kafka/kafkaCluster';

// Flink 风格处理器
export {
  anomalyDetector,
  metricsAggregator,
  kgBuilder,
  AnomalyDetector,
  MetricsAggregator,
  KGBuilder,
  type WindowConfig,
  type AnomalyDetectorConfig,
  type MetricsAggregatorConfig,
  type CDCConfig,
  type SensorReading,
  type AnomalyResult,
  type AggregationResult,
  type CDCEvent,
  type KGEntity,
  type KGRelation,
} from './flink/flinkProcessor';

// S3 归档
export {
  kafkaArchiver,
  KafkaArchiver,
  type ArchiveConfig,
  type ArchiveRecord,
  type ArchiveStats,
  type ArchiveFile,
} from './archive/kafkaArchiver';

// 数据流管理器
export {
  dataflowManager,
  DataflowManager,
  type DataflowStatus,
  type DataflowMetrics,
  type DataflowConfig,
  type DataflowEventType,
  type DataflowEvent,
} from './dataflowManager';
