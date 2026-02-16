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
} from './kafkaCluster';

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
} from './flinkProcessor';

// S3 归档
export {
  kafkaArchiver,
  KafkaArchiver,
  type ArchiveConfig,
  type ArchiveRecord,
  type ArchiveStats,
  type ArchiveFile,
} from './kafkaCluster';

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

// 统一异常检测引擎
export {
  anomalyEngine,
  UnifiedAnomalyEngine,
  detectZScore,
  detectIQR,
  detectMAD,
  determineSeverity,
  computeStats,
  type AnomalyDetectionResult,
  type AnomalyAlgorithm,
  type AnomalySeverity,
  type AnomalyEngineConfig,
  type DataPoint as AnomalyDataPoint,
  type SlidingWindowConfig,
} from './anomalyEngine';
