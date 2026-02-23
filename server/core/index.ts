import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initKafkaMetricsWebSocket } from "../api/ws/kafkaMetrics.ws";

// ============================================================
// 平台中间件导入
// ============================================================
import { createSecurityHeaders, createCorsMiddleware, createRequestIdMiddleware } from "../platform/middleware/securityHeaders";
import { createGlobalLimiter, createApiLimiter } from "../platform/middleware/rateLimiter";
import { metricsCollector } from "../platform/middleware/metricsCollector";
import { gracefulShutdown, registerBuiltinShutdownHooks } from "../platform/middleware/gracefulShutdown";
import { initOpenTelemetry, shutdownOpenTelemetry } from "../platform/middleware/opentelemetry";
import { configCenter } from "../platform/services/configCenter";
import { createModuleLogger } from './logger';
import { config } from './config';
import { validateConfigWithSchema } from './config-schema';
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
// v1.9 性能优化服务初始化
// ============================================================

/**
 * 初始化 v1.9 性能优化服务
 * 统一管理所有新增服务的启动和生命周期
 * 路径已更新为三层架构迁移后的新位置
 */
async function initPerformanceServices(): Promise<void> {
  log.debug('[v1.9] Initializing performance optimization services...');

  try {
    // 1. Outbox 混合发布器
    const { outboxPublisher } = await import('../services/outbox.publisher');
    await outboxPublisher.start();
    log.debug('[v1.9] ✓ Outbox Publisher started');
  } catch (err) {
    log.error('[v1.9] ✗ Outbox Publisher failed to start:', err);
  }

  try {
    // 2. Saga 编排器
    const { sagaOrchestrator } = await import('../services/saga.orchestrator');
    const { registerRollbackSaga } = await import('../services/saga.rollback');
    await sagaOrchestrator.start();
    registerRollbackSaga(); // 注册内置 Saga 定义
    log.debug('[v1.9] ✓ Saga Orchestrator started');
  } catch (err) {
    log.error('[v1.9] ✗ Saga Orchestrator failed to start:', err);
  }

  try {
    // 3. 自适应采样服务
    const { adaptiveSamplingService } = await import('../services/adaptiveSampling.service');
    await adaptiveSamplingService.start();
    log.debug('[v1.9] ✓ Adaptive Sampling Service started');
  } catch (err) {
    log.error('[v1.9] ✗ Adaptive Sampling Service failed to start:', err);
  }

  try {
    // 4. 读写分离服务
    const { readReplicaService } = await import('../services/readReplica.service');
    await readReplicaService.start();
    log.debug('[v1.9] ✓ Read Replica Service started');
  } catch (err) {
    log.error('[v1.9] ✗ Read Replica Service failed to start:', err);
  }

  try {
    // 5. 图查询优化器
    const { graphQueryOptimizer } = await import('../services/graphQuery.optimizer');
    await graphQueryOptimizer.start();
    log.debug('[v1.9] ✓ Graph Query Optimizer started');
  } catch (err) {
    log.error('[v1.9] ✗ Graph Query Optimizer failed to start:', err);
  }

  log.debug('[v1.9] Performance optimization services initialized');
}

// ============================================================
// 事件总线集成
// ============================================================

/**
 * 注册 v1.9 服务到事件总线
 * 实现模块间的事件驱动通信
 */
async function registerEventBusIntegration(): Promise<void> {
  try {
    const { eventBus, TOPICS } = await import('../services/eventBus.service');
    const { deduplicationService } = await import('../services/deduplication.service');

    // 所有事件经过去重服务
    eventBus.subscribeAll(async (event) => {
      try {
        const result = await deduplicationService.isDuplicate(event.eventId || '', 'global');
        if (result.isDuplicate) {
          log.debug(`[v1.9] Duplicate event filtered: ${event.eventId}`);
          return;
        }
        await deduplicationService.markProcessed(event.eventId || '', event.eventType || 'unknown', 'global');
      } catch (err) {
        // 去重服务失败不应阻塞事件处理
        log.warn('[v1.9] Deduplication check failed:', err);
      }
    });

    // Outbox 发布器监听关键事件
    eventBus.subscribe(TOPICS.DEVICE_STATUS, async (event) => {
      try {
        const { outboxPublisher } = await import('../services/outbox.publisher');
        await outboxPublisher.addEvent({
          eventType: 'DeviceUpdated',
          aggregateType: 'Device',
          aggregateId: event.deviceId || 'unknown',
          payload: event.payload as Record<string, unknown>,
          metadata: { source: 'eventBus', correlationId: event.eventId },
        });
      } catch (err) {
        log.warn('[v1.9] Outbox event forwarding failed:', err);
      }
    });

    // 异常事件触发自适应采样调整
    eventBus.subscribe(TOPICS.ANOMALY_DETECTED, async (event) => {
      try {
        const { adaptiveSamplingService } = await import('../services/adaptiveSampling.service');
        // 异常检测到时，可能需要提高采样率
        log.debug(`[v1.9] Anomaly detected, adaptive sampling may adjust: ${event.eventId}`);
      } catch (err) {
        log.warn('[v1.9] Adaptive sampling notification failed:', err);
      }
    });

    log.debug('[v1.9] ✓ Event bus integration registered');
  } catch (err) {
    log.error('[v1.9] ✗ Event bus integration failed:', err);
  }
}

// ============================================================
// 启动 Banner
// ============================================================

function printStartupBanner(port: number, startupTime: string): void {
  const mode = process.env.NODE_ENV || 'development';
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
  log.info(`[Startup] Initializing... (NODE_ENV=${process.env.NODE_ENV})`);

  // ── 阶段 0a: 配置验证（最早执行，快速失败） ──
  const configResult = validateConfigWithSchema(config);
  if (!configResult.success) {
    log.fatal({ errors: configResult.errors }, 'Configuration validation failed — aborting startup');
    process.exit(1);
  }

  // ── 阶段 0b: 预初始化（在 Express 之前） ──
  // OTel 必须在 require express 之前初始化才能自动插桩 HTTP
  // 但由于我们使用 ESM import，这里是最早的可行时机
  await initOpenTelemetry().catch(err => {
    log.warn('[OTel] Initialization failed (continuing without tracing):', err);
  });

  // 配置中心初始化
  await configCenter.initialize().catch(err => {
    log.warn('[ConfigCenter] Initialization failed (using env defaults):', err);
  });

  const app = express();
  const server = createServer(app);

  // ── 阶段 1: 安全与基础中间件（最先注册） ──
  
  // 请求 ID（用于日志关联和分布式追踪）
  app.use(createRequestIdMiddleware());

  // 安全头（helmet）
  app.use(createSecurityHeaders());

  // CORS（替代之前的 cors: '*'）
  app.use(createCorsMiddleware());

  // 全局限流
  app.use(createGlobalLimiter());

  // Prometheus HTTP 指标收集
  app.use(metricsCollector.httpMiddleware());

  // ── 阶段 2: Body 解析 ──
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── 阶段 3: Prometheus 指标端点 ──
  // 路径: /api/metrics（与 docker/prometheus/prometheus.yml 配置对齐）
  app.use('/api', metricsCollector.metricsRouter());
  metricsCollector.initialize();

  // ── 阶段 4: OAuth 回调 ──
  registerOAuthRoutes(app);

  // ── 阶段 5: REST API 桥接层 ──
  try {
    const { restRouter } = await import('../services/database/restBridge');
    // API 限流应用于 REST 端点
    app.use('/api/rest', createApiLimiter(), restRouter);
    log.info('[REST Bridge] ✓ REST API registered at /api/rest');
  } catch (err) {
    log.error('[REST Bridge] ✗ Failed to register REST API:', err);
  }

  // ── 阶段 6: tRPC API ──
  app.use(
    "/api/trpc",
    createApiLimiter(),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── 阶段 7: 端口发现与 Vite/静态文件 ──
  // A-05: 端口从 config.app.port 读取（单一权威来源）
  const preferredPort = config.app.port;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log.warn(`[Startup] Port ${preferredPort} is occupied, using port ${port} instead`);
  }

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server, port);
  } else {
    serveStatic(app);
  }

  // ── 阶段 8: WebSocket ──
  initKafkaMetricsWebSocket(server);

  // ── 阶段 9: 优雅关闭注册 ──
  gracefulShutdown.registerServer(server);
  gracefulShutdown.registerSignalHandlers();
  await registerBuiltinShutdownHooks();

  // OTel 关闭钩子
  gracefulShutdown.addHook('opentelemetry', shutdownOpenTelemetry, 5);

  // 配置中心关闭钩子
  gracefulShutdown.addHook('config-center', async () => {
    configCenter.shutdown();
  }, 85);

  // ── 阶段 10: 启动监听 ──
  server.listen(port, () => {
    // ★ 关键修复：使用 info 级别 + banner，确保用户看到启动成功消息
    const startupTime = elapsed();
    printStartupBanner(port, startupTime);

    log.info(`[Startup] Server listening on http://localhost:${port}/ (${startupTime})`);
    log.info('[Platform] ✓ Security headers (helmet) enabled');
    log.info('[Platform] ✓ CORS middleware enabled');
    log.info('[Platform] ✓ Rate limiting enabled');
    log.info('[Platform] ✓ Prometheus metrics at /api/metrics');
    log.info('[Platform] ✓ Request ID middleware enabled');
    log.info('[Platform] ✓ Graceful shutdown handlers registered');
    
    // ── 后台服务初始化（不阻塞主启动流程） ──
    // 启动定时健康检查（每30秒检查一次）
    import('../jobs/healthCheck.job').then(({ startPeriodicHealthCheck }) => {
      startPeriodicHealthCheck(30000);
    }).catch(err => {
      log.error('[Server] Failed to start health check:', err);
    });

    // 初始化 v1.9 性能优化服务
    initPerformanceServices().catch(err => {
      log.error('[Server] Failed to initialize v1.9 services:', err);
    });

    // 注册事件总线集成
    registerEventBusIntegration().catch(err => {
      log.error('[Server] Failed to register event bus integration:', err);
    });

    // v3.1 初始化数据流追踪器（L2 自省层）
    import('../platform/services/dataFlowTracer').then(({ dataFlowTracer }) => {
      dataFlowTracer.initialize().then(() => {
        log.info('[Platform] ✓ DataFlowTracer initialized (L2 Self-Introspection)');
      }).catch(err => {
        log.error('[Platform] Failed to initialize DataFlowTracer:', err.message);
      });
    }).catch(err => {
      log.error('[Platform] Failed to load DataFlowTracer:', err.message);
    });

    // B-07: Agent Registry 统一注册
    import('./agent-registry.bootstrap').then(({ bootstrapAgentRegistry }) => {
      bootstrapAgentRegistry().catch(err => {
        log.warn('[AgentRegistry] Bootstrap failed (non-blocking):', err.message);
      });
    }).catch(err => {
      log.warn('[AgentRegistry] Failed to load agent-registry.bootstrap:', err.message);
    });

    // 同步内置算法到数据库
    import('../services/algorithm.service').then(({ algorithmService }) => {
      algorithmService.syncBuiltinAlgorithms().then((result) => {
        log.info(`[Algorithm] ✓ Synced builtin algorithms: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      }).catch(err => {
        log.error('[Algorithm] Failed to sync builtin algorithms:', err.message);
      });
    }).catch(err => {
      log.error('[Algorithm] Failed to load algorithm service:', err.message);
    });

    // v4.0 启动数据动脉全链路
    // 边缘网关 → Kafka(telemetry.raw) → 特征提取 → Kafka(telemetry.feature) → ClickHouse
    import('../services/data-artery.bootstrap').then(({ startDataArtery }) => {
      startDataArtery().catch(err => {
        log.error('[DataArtery] Failed to start data artery:', err.message);
      });
    }).catch(err => {
      log.error('[DataArtery] Failed to load data artery bootstrap:', err.message);
    });
  });
}

startServer().catch((err) => {
  log.fatal({ err }, "Server startup failed — process will exit");
  process.exit(1);
});
