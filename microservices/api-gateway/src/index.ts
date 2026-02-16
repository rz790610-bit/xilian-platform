/**
 * API Gateway 微服务
 *
 * 职责：tRPC 路由聚合、认证、限流、安全头、Strangler Fig 智能路由
 * 映射: server/routers.ts + server/core/trpc.ts + platform/middleware/*
 * HTTP: 3000 | gRPC: 50050
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
  stranglerComparisonTotal,
  stranglerMismatchTotal,
} from '@xilian/shared-kernel';

const SERVICE_NAME = 'api-gateway';
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? '3000', 10);

// ── 初始化 ──

const config = createServiceConfig(SERVICE_NAME);
const logger = createLogger({ serviceName: SERVICE_NAME, level: config.logLevel });
const metricsRegistry = initMetrics({ serviceName: SERVICE_NAME });

if (config.tracingEnabled) {
  initTracing({ serviceName: SERVICE_NAME, otlpEndpoint: config.otlpEndpoint });
}

const healthChecker = new HealthChecker(SERVICE_NAME, '1.0.0');

// ============================================================
// Strangler Fig 智能路由
// 审核意见5 优化2: shadow/canary/full 三阶段迁移
// ============================================================

type StranglerMode = 'legacy' | 'shadow' | 'canary' | 'full';

interface StranglerRouteConfig {
  path: string;
  mode: StranglerMode;
  legacyTarget: string;      // 单体服务地址
  newTarget: string;          // 新微服务地址
  canaryPercent?: number;     // canary 模式下的流量百分比
  shadowSampleRate?: number;  // shadow 模式下的采样率（审核意见6 优化2）
  timeout?: number;           // 超时 ms
}

const stranglerRoutes: StranglerRouteConfig[] = [
  // Phase 1: Algorithm Service 首批迁移
  {
    path: '/api/algorithms',
    mode: 'legacy',
    legacyTarget: 'http://localhost:3000',
    newTarget: 'http://algorithm-service:3002',
    canaryPercent: 0,
    shadowSampleRate: 0.1,
    timeout: 10000,
  },
  // Phase 2: Device Service
  {
    path: '/api/devices',
    mode: 'legacy',
    legacyTarget: 'http://localhost:3000',
    newTarget: 'http://device-service:3001',
    canaryPercent: 0,
    shadowSampleRate: 0.1,
    timeout: 5000,
  },
  // Phase 3: Data Pipeline
  {
    path: '/api/pipelines',
    mode: 'legacy',
    legacyTarget: 'http://localhost:3000',
    newTarget: 'http://data-pipeline-service:3003',
    canaryPercent: 0,
    shadowSampleRate: 0.1,
    timeout: 15000,
  },
  // Phase 4: Knowledge Service
  {
    path: '/api/knowledge',
    mode: 'legacy',
    legacyTarget: 'http://localhost:3000',
    newTarget: 'http://knowledge-service:3004',
    canaryPercent: 0,
    shadowSampleRate: 0.1,
    timeout: 10000,
  },
  // Phase 5: Monitoring Service
  {
    path: '/api/monitoring',
    mode: 'legacy',
    legacyTarget: 'http://localhost:3000',
    newTarget: 'http://monitoring-service:3005',
    canaryPercent: 0,
    shadowSampleRate: 0.1,
    timeout: 5000,
  },
];

/**
 * Strangler Fig 路由中间件
 *
 * - legacy: 100% 流量到单体
 * - shadow: 流量到单体，按采样率异步转发到新服务做对比（不影响响应）
 * - canary: 按百分比分流到新服务
 * - full: 100% 流量到新服务
 */
function stranglerRouter(routeConfig: StranglerRouteConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { mode, legacyTarget, newTarget, canaryPercent, shadowSampleRate, timeout } = routeConfig;

    switch (mode) {
      case 'legacy':
        // 直接转发到单体
        return proxyRequest(req, res, legacyTarget, timeout ?? 10000);

      case 'shadow': {
        // 主请求发到单体
        const legacyPromise = proxyRequest(req, res, legacyTarget, timeout ?? 10000);

        // 按采样率异步发到新服务（不阻塞响应）
        const sampleRate = shadowSampleRate ?? 0.1;
        if (Math.random() < sampleRate) {
          shadowRequest(req, newTarget, timeout ?? 10000, routeConfig.path).catch((err) => {
            logger.warn(`Shadow request failed for ${routeConfig.path}`, { error: (err as Error).message });
          });
        }

        return legacyPromise;
      }

      case 'canary': {
        // 按百分比分流
        const percent = canaryPercent ?? 10;
        const target = Math.random() * 100 < percent ? newTarget : legacyTarget;
        return proxyRequest(req, res, target, timeout ?? 10000);
      }

      case 'full':
        // 100% 到新服务
        return proxyRequest(req, res, newTarget, timeout ?? 10000);

      default:
        return next();
    }
  };
}

/**
 * 代理请求到目标服务
 */
async function proxyRequest(req: Request, res: Response, target: string, timeout: number) {
  const url = `${target}${req.originalUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] ?? 'application/json',
        'X-Forwarded-For': req.ip ?? '',
        'X-Request-Id': req.headers['x-request-id'] as string ?? '',
        'X-Correlation-Id': req.headers['x-correlation-id'] as string ?? '',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const body = await response.text();
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.send(body);
  } catch (error) {
    clearTimeout(timer);
    if ((error as Error).name === 'AbortError') {
      res.status(504).json({ error: 'Gateway Timeout', target });
    } else {
      res.status(502).json({ error: 'Bad Gateway', message: (error as Error).message });
    }
  }
}

/**
 * Shadow 请求 — 异步发送到新服务，对比响应
 */
async function shadowRequest(req: Request, target: string, timeout: number, routePath: string) {
  const url = `${target}${req.originalUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'X-Shadow': 'true' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });

    clearTimeout(timer);
    stranglerComparisonTotal.inc({ service: routePath });

    if (!response.ok) {
      stranglerMismatchTotal.inc({ service: routePath, type: 'status_code' });
      logger.warn(`Shadow mismatch: ${routePath} returned ${response.status}`);
    }
  } catch (error) {
    clearTimeout(timer);
    stranglerMismatchTotal.inc({ service: routePath, type: 'error' });
  }
}

// ============================================================
// Express 应用
// ============================================================

const app = express();

// 请求追踪中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] as string ?? crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, path: req.route?.path ?? req.path, status: String(res.statusCode), service: SERVICE_NAME });
    httpRequestDuration.observe({ method: req.method, path: req.route?.path ?? req.path, status: String(res.statusCode), service: SERVICE_NAME }, duration);
  });

  next();
});

app.use(express.json({ limit: '10mb' }));

// 健康检查
app.get('/healthz', async (_req, res) => {
  const health = await healthChecker.check();
  res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
});

app.get('/ready', async (_req, res) => {
  const ready = await healthChecker.ready();
  res.status(ready ? 200 : 503).json({ ready });
});

// Prometheus 指标
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// Strangler Fig 路由注册
for (const route of stranglerRoutes) {
  app.use(route.path, stranglerRouter(route));
  logger.info(`Strangler route registered: ${route.path} [${route.mode}]`);
}

// Strangler Fig 管理 API（运行时切换模式）
app.put('/admin/strangler/:path', express.json(), (req: Request, res: Response) => {
  const targetPath = `/api/${req.params.path}`;
  const route = stranglerRoutes.find((r) => r.path === targetPath);
  if (!route) {
    return res.status(404).json({ error: `Route not found: ${targetPath}` });
  }

  const { mode, canaryPercent, shadowSampleRate } = req.body;
  if (mode) route.mode = mode;
  if (canaryPercent !== undefined) route.canaryPercent = canaryPercent;
  if (shadowSampleRate !== undefined) route.shadowSampleRate = shadowSampleRate;

  logger.info(`Strangler route updated: ${targetPath}`, { mode: route.mode, canaryPercent: route.canaryPercent, shadowSampleRate: route.shadowSampleRate });
  res.json({ path: targetPath, mode: route.mode, canaryPercent: route.canaryPercent, shadowSampleRate: route.shadowSampleRate });
});

// Strangler Fig 状态查询
app.get('/admin/strangler', (_req: Request, res: Response) => {
  res.json(stranglerRoutes.map((r) => ({
    path: r.path,
    mode: r.mode,
    canaryPercent: r.canaryPercent,
    shadowSampleRate: r.shadowSampleRate,
  })));
});

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
  logger.info(`${SERVICE_NAME} started on port ${HTTP_PORT}`);
  logger.info(`Strangler routes: ${stranglerRoutes.length} configured`);
});
