import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

import { createModuleLogger } from './core/logger';
import { config } from './core/config';
const log = createModuleLogger('index');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── 中间件挂载 ──────────────────────────────────────────────
  // 生产环境应在此处挂载平台中间件（rateLimiter, securityHeaders, auditLog 等）
  // 当前为 Manus 托管的静态前端模式，tRPC 中间件由 core/trpc.ts 内置处理
  // 如需完整中间件栈，请参考 DEPLOYMENT.md 中的生产部署指南
  // ──────────────────────────────────────────────────────────────

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

  const port = config.app.port;

  server.listen(port, () => {
    log.debug(`Server running on http://localhost:${port}/`);
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
