/**
 * Kafka 模块索引
 * 导出所有 Kafka 相关的服务和路由
 */

// 客户端
export { kafkaClient, KAFKA_TOPICS } from './kafkaClient';
export type { KafkaConfig, KafkaMessage, MessageHandler } from './kafkaClient';

// 事件总线
export { kafkaEventBus, publishEvent, publishSensorReading, publishAnomalyAlert } from './kafkaEventBus';
export type { EventPayload, EventHandler } from './kafkaEventBus';

// 流处理器
export { kafkaStreamProcessor } from './kafkaStreamProcessor';
export type { StreamProcessorConfig, DataPoint, AnomalyResult, AggregationResult } from './kafkaStreamProcessor';

// 路由
export { kafkaRouter } from './kafkaRouter';
export type { KafkaRouter } from './kafkaRouter';
