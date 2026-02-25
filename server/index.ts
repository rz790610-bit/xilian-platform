import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { gzip as gzipCb } from "zlib";

import { createModuleLogger } from './core/logger';
import { config } from './core/config';
import { getMetrics, getContentType } from './lib/metrics';
import { metricsCollector } from './platform/middleware/metricsCollector';
import { eventBus, TOPICS } from './services/eventBus.service';

const log = createModuleLogger('index');
const gzip = promisify(gzipCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── 中间件挂载 ──────────────────────────────────────────────
  // HTTP 指标收集中间件（记录请求延迟/计数/状态码）
  app.use(metricsCollector.httpMiddleware());

  // 生产环境应在此处挂载平台中间件（rateLimiter, securityHeaders, auditLog 等）
  // 当前为 Manus 托管的静态前端模式，tRPC 中间件由 core/trpc.ts 内置处理
  // 如需完整中间件栈，请参考 DEPLOYMENT.md 中的生产部署指南
  // ──────────────────────────────────────────────────────────────

  // ── Prometheus /api/metrics 端点 ─────────────────────────────
  // 合并 metricsCollector（nexus_*）+ fsd-metrics（evo_*）+ Node.js 默认指标
  // 生产环境启用 gzip 压缩；发布 EventBus 事件记录每次抓取
  app.get('/api/metrics', async (_req, res) => {
    try {
      const metricsText = await getMetrics();

      // EventBus: 记录 Prometheus 抓取事件
      eventBus.publish(TOPICS.SYSTEM_METRIC, 'metrics_scraped', {
        source: 'prometheus',
        timestamp: Date.now(),
      }).catch(() => { /* fire-and-forget */ });

      res.set('Content-Type', getContentType());

      // 生产环境启用 gzip 压缩（减少 ~70% 传输体积）
      const acceptEncoding = _req.headers['accept-encoding'] || '';
      if (config.app.env === 'production' && acceptEncoding.includes('gzip')) {
        const compressed = await gzip(Buffer.from(metricsText, 'utf-8'));
        res.set('Content-Encoding', 'gzip');
        res.end(compressed);
      } else {
        res.end(metricsText);
      }
    } catch (err) {
      log.warn({ err }, 'Failed to collect metrics');
      res.status(500).end('Error collecting metrics');
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    config.app.env === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // 初始化指标收集器
  metricsCollector.initialize();

  const port = config.app.port;

  server.listen(port, () => {
    log.debug(`Server running on http://localhost:${port}/`);
    log.info(`Prometheus metrics available at http://localhost:${port}/api/metrics`);
  });

  // P2-A: Graceful shutdown — 确保连接排空后再退出
  const shutdown = (signal: string) => {
    log.debug(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      log.debug('HTTP server closed');
      process.exit(0);
    });
    // 强制超时退出，防止连接永远不释放
    setTimeout(() => {
      log.fatal('Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => log.fatal({ err }, "Server startup failed"));
