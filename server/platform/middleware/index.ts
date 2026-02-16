/**
 * 平台中间件层 - 统一导出
 * 
 * 架构位置: server/platform/middleware/
 * 
 * 包含：
 * - 断路器 (circuitBreaker)
 * - 优雅关闭 (gracefulShutdown)
 * - Prometheus 指标 (metricsCollector)
 * - OpenTelemetry 追踪 (opentelemetry)
 * - API 限流 (rateLimiter)
 * - 安全头 (securityHeaders)
 * - 背压控制 (backpressure)
 */

// 断路器
export { circuitBreakerRegistry, withCircuitBreaker } from './circuitBreaker';
export type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStats } from './circuitBreaker';

// 优雅关闭
export { gracefulShutdown, registerBuiltinShutdownHooks } from './gracefulShutdown';
export type { ShutdownHook } from './gracefulShutdown';

// Prometheus 指标
export { metricsCollector } from './metricsCollector';

// OpenTelemetry
export {
  initOpenTelemetry,
  shutdownOpenTelemetry,
  getTracer,
  withSpan,
  traceKafkaMessage,
  traceDbQuery,
  traceAlgorithm,
  traceRedis,
  traceHttpCall,
  tracePipeline,
  createTrpcTracingMiddleware,
} from './opentelemetry';

// 限流
export {
  createGlobalLimiter,
  createApiLimiter,
  createAuthLimiter,
  createUploadLimiter,
  createAlgorithmLimiter,
  getRateLimitStatus,
} from './rateLimiter';

// 安全头
export {
  createSecurityHeaders,
  createCorsMiddleware,
  createRequestIdMiddleware,
} from './securityHeaders';

// 断路器集成层
export {
  wrapWithCircuitBreaker,
  protectRedisClient,
  protectKafkaClient,
  protectKafkaEventBus,
  protectClickHouseClient,
  protectQdrantStorage,
  protectNeo4jStorage,
  protectElasticsearchClient,
  protectAirflowClient,
  protectMinIOClient,
  protectOllamaClient,
  integrateCircuitBreakers,
  getCircuitBreakerHealthSummary,
} from './circuitBreakerIntegration';

// 背压控制
export {
  TokenBucket,
  AdaptiveBackpressureController,
  KafkaConsumerBackpressure,
} from './backpressure';
export type {
  TokenBucketConfig,
  AdaptiveBackpressureConfig,
  KafkaBackpressureConfig,
} from './backpressure';

// 审计日志
export {
  createAuditLogMiddleware,
  flushAuditLogs,
  shutdownAuditLog,
  writeAuditLog,
} from './auditLog';
