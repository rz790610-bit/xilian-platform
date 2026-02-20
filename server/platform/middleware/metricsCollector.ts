/**
 * Prometheus 指标收集器 - 平台基础设施层
 * 
 * 基于 prom-client 实现应用级指标暴露，供 Prometheus 抓取。
 * 暴露 /api/metrics 端点（与 docker/prometheus/prometheus.yml 配置对齐）。
 * 
 * 指标覆盖：
 * - HTTP 请求延迟/计数/状态码分布
 * - WebSocket 连接数
 * - 算法执行耗时
 * - 管道执行计数
 * - 断路器状态
 * - EventBus 事件计数
 * - 系统资源（Node.js 默认指标）
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: prom-client, express, server/core/logger
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('metrics-collector');

import client, {
  Registry,
  Counter,
  Histogram,
  Gauge,
  Summary,
  collectDefaultMetrics,
} from 'prom-client';


// ============================================================
// 指标注册表
// ============================================================

const register = new Registry();

// 设置默认标签
register.setDefaultLabels({
  app: 'portai-nexus',
  env: process.env.NODE_ENV || 'development',
});

// 收集 Node.js 默认指标（CPU、内存、事件循环延迟、GC 等）
collectDefaultMetrics({ register, prefix: 'nexus_' });

// ============================================================
// 自定义指标定义
// ============================================================

/** HTTP 请求总数 */
const httpRequestsTotal = new Counter({
  name: 'nexus_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

/** HTTP 请求延迟分布 */
const httpRequestDuration = new Histogram({
  name: 'nexus_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** HTTP 请求体大小 */
const httpRequestSize = new Summary({
  name: 'nexus_http_request_size_bytes',
  help: 'HTTP request body size in bytes',
  labelNames: ['method', 'route'] as const,
  registers: [register],
});

/** 活跃 WebSocket 连接数 */
const wsConnectionsActive = new Gauge({
  name: 'nexus_websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

/** 算法执行耗时 */
const algorithmExecutionDuration = new Histogram({
  name: 'nexus_algorithm_execution_duration_seconds',
  help: 'Algorithm execution duration in seconds',
  labelNames: ['algorithm_name', 'status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

/** 管道执行计数 */
const pipelineExecutionsTotal = new Counter({
  name: 'nexus_pipeline_executions_total',
  help: 'Total number of pipeline executions',
  labelNames: ['pipeline_name', 'status'] as const,
  registers: [register],
});

/** P2-A05: 管道执行耗时分布（Histogram） */
const pipelineExecutionDuration = new Histogram({
  name: 'nexus_pipeline_execution_duration_seconds',
  help: 'Pipeline execution duration in seconds',
  labelNames: ['pipeline_name', 'status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

/** EventBus 事件计数 */
const eventBusEventsTotal = new Counter({
  name: 'nexus_eventbus_events_total',
  help: 'Total number of events published to EventBus',
  labelNames: ['topic', 'source'] as const,
  registers: [register],
});

/** 断路器状态 */
const circuitBreakerState = new Gauge({
  name: 'nexus_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=halfOpen, 2=open)',
  labelNames: ['service'] as const,
  registers: [register],
});

/** 断路器请求计数 */
const circuitBreakerRequestsTotal = new Counter({
  name: 'nexus_circuit_breaker_requests_total',
  help: 'Total requests through circuit breakers',
  labelNames: ['service', 'result'] as const,
  registers: [register],
});

/** Kafka consumer lag */
const kafkaConsumerLag = new Gauge({
  name: 'nexus_kafka_consumer_lag',
  help: 'Kafka consumer group lag',
  labelNames: ['group', 'topic', 'partition'] as const,
  registers: [register],
});

/** 数据库连接池状态 */
const dbPoolActive = new Gauge({
  name: 'nexus_db_pool_active_connections',
  help: 'Number of active database connections',
  labelNames: ['database'] as const,
  registers: [register],
});

/** Saga 执行计数 */
const sagaExecutionsTotal = new Counter({
  name: 'nexus_saga_executions_total',
  help: 'Total number of Saga executions',
  labelNames: ['saga_name', 'status'] as const,
  registers: [register],
});

/** Outbox 事件计数 */
const outboxEventsTotal = new Counter({
  name: 'nexus_outbox_events_total',
  help: 'Total number of outbox events',
  labelNames: ['event_type', 'status'] as const,
  registers: [register],
});

// ============================================================
// 指标收集器类
// ============================================================

class MetricsCollector {
  private isInitialized = false;

  /**
   * 获取 Express 中间件，用于自动收集 HTTP 指标
   */
  httpMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();

      // 请求体大小
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      if (contentLength > 0) {
        const route = this.normalizeRoute(req.path);
        httpRequestSize.observe({ method: req.method, route }, contentLength);
      }

      // 响应完成时记录指标
      const onFinish = () => {
        res.removeListener('finish', onFinish);
        const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
        const route = this.normalizeRoute(req.path);
        const statusCode = res.statusCode.toString();

        httpRequestsTotal.inc({ method: req.method, route, status_code: statusCode });
        httpRequestDuration.observe({ method: req.method, route, status_code: statusCode }, elapsed);
      };

      res.on('finish', onFinish);
      next();
    };
  }

  /**
   * 获取 /api/metrics 路由
   */
  metricsRouter(): Router {
    const router = Router();

    router.get('/metrics', async (_req: Request, res: Response) => {
      try {
        // 在返回前更新断路器状态指标
        await this.updateCircuitBreakerMetrics();

        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        log.error('Failed to collect metrics:', String(err));
        res.status(500).end('Error collecting metrics');
      }
    });

    return router;
  }

  // ============================================================
  // 业务指标记录方法（供其他模块调用）
  // ============================================================

  /** 记录 WebSocket 连接变化 */
  wsConnectionChange(delta: number): void {
    wsConnectionsActive.inc(delta);
  }

  /** 记录算法执行 */
  recordAlgorithmExecution(name: string, durationSeconds: number, status: 'success' | 'failure' | 'timeout'): void {
    algorithmExecutionDuration.observe({ algorithm_name: name, status }, durationSeconds);
  }

  /** 记录管道执行（P2-A05: 同时记录 Counter + Histogram） */
  recordPipelineExecution(name: string, status: 'success' | 'failure' | 'timeout', durationSeconds?: number): void {
    pipelineExecutionsTotal.inc({ pipeline_name: name, status });
    if (durationSeconds !== undefined) {
      pipelineExecutionDuration.observe({ pipeline_name: name, status }, durationSeconds);
    }
  }

  /** 记录 EventBus 事件 */
  recordEventBusEvent(topic: string, source: string = 'internal'): void {
    eventBusEventsTotal.inc({ topic, source });
  }

  /** 记录 Kafka consumer lag */
  recordKafkaLag(group: string, topic: string, partition: number, lag: number): void {
    kafkaConsumerLag.set({ group, topic, partition: partition.toString() }, lag);
  }

  /** 记录数据库连接池状态 */
  recordDbPoolStatus(database: string, activeCount: number): void {
    dbPoolActive.set({ database }, activeCount);
  }

  /** 记录 Saga 执行 */
  recordSagaExecution(name: string, status: 'completed' | 'failed' | 'compensated'): void {
    sagaExecutionsTotal.inc({ saga_name: name, status });
  }

  /** 记录 Outbox 事件 */
  recordOutboxEvent(eventType: string, status: 'published' | 'failed' | 'retried'): void {
    outboxEventsTotal.inc({ event_type: eventType, status });
  }

  /** 记录断路器请求 */
  recordCircuitBreakerRequest(service: string, result: 'success' | 'failure' | 'timeout' | 'reject' | 'fallback'): void {
    circuitBreakerRequestsTotal.inc({ service, result });
  }

  /**
   * 初始化指标收集
   */
  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    log.info(`Metrics collector initialized (${register.getMetricsAsArray().length} metrics registered)`);
  }

  /**
   * 关闭指标收集
   */
  shutdown(): void {
    register.clear();
    this.isInitialized = false;
    log.info('Metrics collector shutdown');
  }

  /**
   * 获取注册表（用于测试）
   */
  getRegistry(): Registry {
    return register;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 规范化路由路径，避免高基数标签
   * /api/trpc/device.getById → /api/trpc/:procedure
   * /api/rest/devices/123 → /api/rest/devices/:id
   */
  private normalizeRoute(path: string): string {
    if (path.startsWith('/api/trpc/')) {
      const procedure = path.replace('/api/trpc/', '').split('?')[0];
      return `/api/trpc/${procedure}`;
    }
    if (path.startsWith('/api/rest/')) {
      return path.replace(/\/\d+/g, '/:id').replace(/\/[a-f0-9-]{36}/g, '/:uuid');
    }
    if (path === '/api/metrics') return '/api/metrics';
    if (path.startsWith('/api/')) return path.replace(/\/\d+/g, '/:id');
    // 静态资源
    if (path.match(/\.(js|css|png|jpg|svg|ico|woff|woff2|ttf)$/)) return '/static';
    return path;
  }

  /**
   * 更新断路器状态指标
   */
  private async updateCircuitBreakerMetrics(): Promise<void> {
    try {
      const { circuitBreakerRegistry } = await import('./circuitBreaker');
      const stats = circuitBreakerRegistry.getAllStats();
      for (const stat of stats) {
        const stateValue = stat.state === 'closed' ? 0 : stat.state === 'halfOpen' ? 1 : 2;
        circuitBreakerState.set({ service: stat.name }, stateValue);
      }
    } catch {
      // 断路器模块可能未初始化
    }
  }
}

// ============================================================
// 单例导出
// ============================================================

export const metricsCollector = new MetricsCollector();
