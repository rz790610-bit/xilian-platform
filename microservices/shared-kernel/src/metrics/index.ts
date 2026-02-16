/**
 * @xilian/shared-kernel - Prometheus 指标收集
 *
 * 为所有微服务提供统一的指标注册和暴露。
 * 映射: server/platform/middleware/metricsCollector.ts
 */
import client, {
  Counter,
  Histogram,
  Gauge,
  Summary,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

let _registry: Registry | null = null;

export interface MetricsConfig {
  serviceName: string;
  enabled?: boolean;
  prefix?: string;
  defaultLabels?: Record<string, string>;
}

/**
 * 初始化 Prometheus 指标注册表
 */
export function initMetrics(config: MetricsConfig): Registry {
  _registry = new Registry();

  _registry.setDefaultLabels({
    service: config.serviceName,
    ...config.defaultLabels,
  });

  if (config.enabled !== false) {
    collectDefaultMetrics({ register: _registry, prefix: config.prefix });
  }

  return _registry;
}

/**
 * 获取注册表
 */
export function getRegistry(): Registry {
  if (!_registry) {
    _registry = new Registry();
    collectDefaultMetrics({ register: _registry });
  }
  return _registry;
}

// ============================================================
// 预定义指标（所有微服务共享）
// ============================================================

/** HTTP 请求总数 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status', 'service'] as const,
});

/** HTTP 请求延迟 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status', 'service'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** gRPC 请求总数 */
export const grpcRequestsTotal = new Counter({
  name: 'grpc_requests_total',
  help: 'Total number of gRPC requests',
  labelNames: ['method', 'service', 'status'] as const,
});

/** gRPC 请求延迟 */
export const grpcRequestDuration = new Histogram({
  name: 'grpc_request_duration_seconds',
  help: 'gRPC request duration in seconds',
  labelNames: ['method', 'service', 'status'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

/** 断路器状态 */
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service', 'target'] as const,
});

/** Kafka 事件发送总数 */
export const kafkaEventsProduced = new Counter({
  name: 'kafka_events_produced_total',
  help: 'Total Kafka events produced',
  labelNames: ['topic', 'service', 'status'] as const,
});

/** Kafka 事件消费总数 */
export const kafkaEventsConsumed = new Counter({
  name: 'kafka_events_consumed_total',
  help: 'Total Kafka events consumed',
  labelNames: ['topic', 'service', 'status'] as const,
});

/** Kafka Consumer Lag */
export const kafkaConsumerLag = new Gauge({
  name: 'kafka_consumer_lag',
  help: 'Kafka consumer lag (messages behind)',
  labelNames: ['topic', 'partition', 'group'] as const,
});

/** Saga 执行指标 */
export const sagaExecutionsTotal = new Counter({
  name: 'saga_executions_total',
  help: 'Total Saga executions',
  labelNames: ['saga_type', 'status'] as const,
});

export const sagaCompensationsTotal = new Counter({
  name: 'saga_compensations_total',
  help: 'Total Saga compensations triggered',
  labelNames: ['saga_type', 'step'] as const,
});

export const sagaDuration = new Histogram({
  name: 'saga_duration_seconds',
  help: 'Saga execution duration in seconds',
  labelNames: ['saga_type', 'status'] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
});

/** Outbox 指标 */
export const outboxEventsPublished = new Counter({
  name: 'outbox_events_published_total',
  help: 'Total Outbox events published',
  labelNames: ['status'] as const,
});

export const outboxPublishLatency = new Histogram({
  name: 'outbox_publish_latency_seconds',
  help: 'Outbox event publish latency',
  labelNames: ['topic'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

/** 背压指标 */
export const backpressureActive = new Gauge({
  name: 'backpressure_active',
  help: 'Whether backpressure is currently active (0/1)',
  labelNames: ['service', 'consumer'] as const,
});

export const backpressureDropped = new Counter({
  name: 'backpressure_dropped_total',
  help: 'Total messages dropped due to backpressure',
  labelNames: ['service', 'consumer'] as const,
});

/** 算法执行指标 */
export const algorithmExecutionDuration = new Histogram({
  name: 'algorithm_execution_duration_seconds',
  help: 'Algorithm execution duration',
  labelNames: ['algorithm_id', 'status'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
});

/** Pipeline 指标 */
export const pipelineStageDuration = new Histogram({
  name: 'pipeline_stage_duration_seconds',
  help: 'Pipeline stage execution duration',
  labelNames: ['pipeline_id', 'stage', 'status'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});

/** 数据库连接池指标 */
export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['service', 'db_type', 'state'] as const,
});

/** Strangler Fig 指标（审核意见5 优化2） */
export const stranglerComparisonTotal = new Counter({
  name: 'strangler_comparison_total',
  help: 'Total Strangler Fig response comparisons',
  labelNames: ['service'] as const,
});

export const stranglerMismatchTotal = new Counter({
  name: 'strangler_mismatch_total',
  help: 'Total Strangler Fig response mismatches',
  labelNames: ['service', 'type'] as const,
});

/** 成本指标（审核意见5 优化4） */
export const cloudCostTotal = new Gauge({
  name: 'cloud_cost_total',
  help: 'Total cloud infrastructure cost (USD/month)',
  labelNames: ['service'] as const,
});

export const cloudCostByCategory = new Gauge({
  name: 'cloud_cost_by_category',
  help: 'Cloud cost breakdown by category',
  labelNames: ['category'] as const,
});

// 重新导出 prom-client 类型
export { Counter, Histogram, Gauge, Summary, Registry, client };
