/**
 * 设备管理服务 — 设备/传感器 CRUD、拓扑、协议适配
 *
 * 独立微服务入口点
 * HTTP: 3001 | gRPC: 50051
 *
 * 源文件映射（从单体迁移）:
 *   - server/services/device.service.ts
 *   - server/services/topology.service.ts
 *   - server/api/device.api.ts
 *   - server/api/sensor.api.ts
 */

import express, { Request, Response, NextFunction } from 'express';
import {
  createServiceConfig,
  createLogger,
  initTracing,
  initMetrics,
  getRegistry,
  HealthChecker,
  httpRequestsTotal,
  httpRequestDuration,
} from '@xilian/shared-kernel';

const SERVICE_NAME = 'device';
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? '3001', 10);
const GRPC_PORT = parseInt(process.env.GRPC_PORT ?? '50051', 10);

// ── 初始化基础设施 ──

const config = createServiceConfig(SERVICE_NAME);
const logger = createLogger({ serviceName: SERVICE_NAME, level: config.logLevel });
const metricsRegistry = initMetrics({ serviceName: SERVICE_NAME });

if (config.tracingEnabled) {
  initTracing({ serviceName: SERVICE_NAME, otlpEndpoint: config.otlpEndpoint });
}

// ── 健康检查 ──

const healthChecker = new HealthChecker(SERVICE_NAME, '1.0.0');
  // MySQL (drizzle-orm)
  // healthChecker.register('mysql', mysqlHealthCheck(pool));
  // Redis
  // healthChecker.register('redis', redisHealthCheck(redisClient));
  // Kafka
  // healthChecker.register('kafka', kafkaHealthCheck(kafkaAdmin));

// ── Express 应用 ──

const app = express();

// 请求追踪中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, path: req.route?.path ?? req.path, status: String(res.statusCode), service: SERVICE_NAME });
    httpRequestDuration.observe({ method: req.method, path: req.route?.path ?? req.path, status: String(res.statusCode), service: SERVICE_NAME }, duration);
  });
  next();
});

app.use(express.json({ limit: '10mb' }));

// 健康检查端点
app.get('/healthz', async (_req, res) => {
  const health = await healthChecker.check();
  res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
});

app.get('/ready', async (_req, res) => {
  const ready = await healthChecker.ready();
  res.status(ready ? 200 : 503).json({ ready });
});

// Prometheus 指标端点
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// TODO: 注册业务路由（从单体迁移）

// ── 优雅关闭 ──

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── 启动 ──

const server = app.listen(HTTP_PORT, '0.0.0.0', () => {
  logger.info(`${SERVICE_NAME} service started on HTTP:${HTTP_PORT} gRPC:${GRPC_PORT}`);
});
