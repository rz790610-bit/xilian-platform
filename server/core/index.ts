// B-05: dotenv 分层加载器（替代简单的 dotenv/config）
// 加载优先级：.env.{NODE_ENV} → .env.local → .env → 环境变量
import './env-loader';
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

// ============================================================
// 平台中间件导入
// ============================================================
import { createSecurityHeaders, createCorsMiddleware, createRequestIdMiddleware } from "../platform/middleware/securityHeaders";
import { createGlobalLimiter, createApiLimiter } from "../platform/middleware/rateLimiter";
import { metricsCollector } from "../platform/middleware/metricsCollector";
import { gracefulShutdown, registerBuiltinShutdownHooks } from "../platform/middleware/gracefulShutdown";
import { shutdownOpenTelemetry } from "../platform/middleware/opentelemetry";
import { configCenter } from "../platform/services/configCenter";
import { createModuleLogger } from './logger';
import { config } from './config';
import { validateConfigWithSchema } from './config-schema';

// B-02: 启动编排器
import { executeStartupSequence, setStartupResult } from './startup';
import { buildStartupTasks } from './startup-tasks';

const log = createModuleLogger('index');

// ============================================================
// 启动计时器
// ============================================================
const STARTUP_BEGIN = Date.now();

function elapsed(): string {
  return `${((Date.now() - STARTUP_BEGIN) / 1000).toFixed(1)}s`;
}

// ============================================================
// 端口发现
// ============================================================

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.listen(port, () => {
      srv.close(() => resolve(true));
    });
    srv.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ============================================================
// 启动 Banner
// ============================================================

function printStartupBanner(port: number, startupTime: string): void {
  const mode = config.app.env;
  const version = config.app.version;
  const url = `http://localhost:${port}/`;

  // 使用 process.stdout.write 确保 banner 始终可见，不受日志级别限制
  const CYAN = '\x1b[36m';
  const GREEN = '\x1b[32m';
  const YELLOW = '\x1b[33m';
  const BOLD = '\x1b[1m';
  const RESET = '\x1b[0m';

  process.stdout.write(`
${CYAN}═══════════════════════════════════════════════════${RESET}
${CYAN}  ${BOLD}西联智能平台 (PortAI Nexus)${RESET} ${YELLOW}v${version}${RESET}
${CYAN}───────────────────────────────────────────────────${RESET}
  ${GREEN}➜${RESET}  Local:   ${BOLD}${url}${RESET}
  ${GREEN}➜${RESET}  Mode:    ${mode}
  ${GREEN}➜${RESET}  Startup: ${startupTime}
${CYAN}═══════════════════════════════════════════════════${RESET}
`);
}

// ============================================================
// 主启动函数
// ============================================================

async function startServer() {
  log.info(`[Startup] Initializing... (NODE_ENV=${config.app.env})`);

  // ── 阶段 0a: 配置验证（最早执行，快速失败） ──
  const configResult = validateConfigWithSchema(config);
  if (!configResult.success) {
    log.fatal({ errors: configResult.errors }, 'Configuration validation failed — aborting startup');
    process.exit(1);
  }

  // ── 阶段 0b: Express 应用创建与同步中间件注册 ──
  // 这些是同步操作，不需要通过启动编排器管理
  const app = express();
  const server = createServer(app);

  // 安全与基础中间件（顺序敏感，必须同步注册）
  app.use(createRequestIdMiddleware());
  app.use(createSecurityHeaders());
  app.use(createCorsMiddleware());
  app.use(createGlobalLimiter());
  app.use(metricsCollector.httpMiddleware());

  // Body 解析
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Prometheus 指标端点
  app.use('/api', metricsCollector.metricsRouter());
  metricsCollector.initialize();

  // OAuth 回调
  registerOAuthRoutes(app);

  // REST API 桥接层
  try {
    const { restRouter } = await import('../services/database/restBridge');
    app.use('/api/rest', createApiLimiter(), restRouter);
    log.info('[REST Bridge] ✓ REST API registered at /api/rest');
  } catch (err) {
    log.warn('[REST Bridge] Failed to register REST API (non-blocking):', err);
  }

  // tRPC API
  app.use(
    "/api/trpc",
    createApiLimiter(),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── 阶段 0c: 端口发现与 Vite/静态文件 ──
  const preferredPort = config.app.port;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log.warn(`[Startup] Port ${preferredPort} is occupied, using port ${port} instead`);
  }

  if (config.app.env === "development") {
    await setupVite(app, server, port);
  } else {
    serveStatic(app);
  }


  // ── 阶段 0d: 优雅关闭注册 ──
  gracefulShutdown.registerServer(server);
  gracefulShutdown.registerSignalHandlers();
  await registerBuiltinShutdownHooks();
  gracefulShutdown.addHook('opentelemetry', shutdownOpenTelemetry, 5);
  gracefulShutdown.addHook('config-center', async () => {
    configCenter.shutdown();
  }, 85);

  // ── 阶段 1: 启动监听 ──
  server.listen(port, () => {
    const startupTime = elapsed();
    printStartupBanner(port, startupTime);

    log.info(`[Startup] Server listening on http://localhost:${port}/ (${startupTime})`);
    log.info('[Platform] ✓ Security headers (helmet) enabled');
    log.info('[Platform] ✓ CORS middleware enabled');
    log.info('[Platform] ✓ Rate limiting enabled');
    log.info('[Platform] ✓ Prometheus metrics at /api/metrics');
    log.info('[Platform] ✓ Request ID middleware enabled');
    log.info('[Platform] ✓ Graceful shutdown handlers registered');

    // ── B-02: 后台服务通过启动编排器统一管理 ──
    // 拓扑排序 → 并行初始化 → 分级容错
    const tasks = buildStartupTasks();
    executeStartupSequence(tasks).then(result => {
      setStartupResult(result);

      // 打印启动摘要
      const { completed, degraded, skipped, totalDuration } = result;
      if (degraded.length > 0 || skipped.length > 0) {
        log.warn(
          `[Startup] Background services: ${completed.size} ok, ` +
          `${degraded.length} degraded [${degraded.join(', ')}], ` +
          `${skipped.length} skipped [${skipped.join(', ')}] — ${totalDuration}ms`
        );
      } else {
        log.info(
          `[Startup] Background services: ${completed.size}/${tasks.length} all ok — ${totalDuration}ms`
        );
      }
    }).catch(err => {
      log.warn('[Startup] Background service orchestration failed:', err);
    });
  });
}

startServer().catch((err) => {
  log.fatal({ err }, "Server startup failed — process will exit");
  process.exit(1);
});
