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

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
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

/**
 * 初始化 v1.9 性能优化服务
 * 统一管理所有新增服务的启动和生命周期
 * 路径已更新为三层架构迁移后的新位置
 */
async function initPerformanceServices(): Promise<void> {
  console.log('[v1.9] Initializing performance optimization services...');

  try {
    // 1. Outbox 混合发布器
    const { outboxPublisher } = await import('../services/outbox.publisher');
    await outboxPublisher.start();
    console.log('[v1.9] ✓ Outbox Publisher started');
  } catch (err) {
    console.error('[v1.9] ✗ Outbox Publisher failed to start:', err);
  }

  try {
    // 2. Saga 编排器
    const { sagaOrchestrator } = await import('../services/saga.orchestrator');
    const { registerRollbackSaga } = await import('../services/saga.rollback');
    await sagaOrchestrator.start();
    registerRollbackSaga(); // 注册内置 Saga 定义
    console.log('[v1.9] ✓ Saga Orchestrator started');
  } catch (err) {
    console.error('[v1.9] ✗ Saga Orchestrator failed to start:', err);
  }

  try {
    // 3. 自适应采样服务
    const { adaptiveSamplingService } = await import('../services/adaptiveSampling.service');
    await adaptiveSamplingService.start();
    console.log('[v1.9] ✓ Adaptive Sampling Service started');
  } catch (err) {
    console.error('[v1.9] ✗ Adaptive Sampling Service failed to start:', err);
  }

  try {
    // 4. 读写分离服务
    const { readReplicaService } = await import('../services/readReplica.service');
    await readReplicaService.start();
    console.log('[v1.9] ✓ Read Replica Service started');
  } catch (err) {
    console.error('[v1.9] ✗ Read Replica Service failed to start:', err);
  }

  try {
    // 5. 图查询优化器
    const { graphQueryOptimizer } = await import('../services/graphQuery.optimizer');
    await graphQueryOptimizer.start();
    console.log('[v1.9] ✓ Graph Query Optimizer started');
  } catch (err) {
    console.error('[v1.9] ✗ Graph Query Optimizer failed to start:', err);
  }

  console.log('[v1.9] Performance optimization services initialized');
}

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
        const result = await deduplicationService.isDuplicate(event.eventId, 'global');
        if (result.isDuplicate) {
          console.log(`[v1.9] Duplicate event filtered: ${event.eventId}`);
          return;
        }
        await deduplicationService.markProcessed(event.eventId, event.eventType || 'unknown', 'global');
      } catch (err) {
        // 去重服务失败不应阻塞事件处理
        console.warn('[v1.9] Deduplication check failed:', err);
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
          payload: event.payload,
          metadata: { source: 'eventBus', correlationId: event.eventId },
        });
      } catch (err) {
        console.warn('[v1.9] Outbox event forwarding failed:', err);
      }
    });

    // 异常事件触发自适应采样调整
    eventBus.subscribe(TOPICS.ANOMALY_DETECTED, async (event) => {
      try {
        const { adaptiveSamplingService } = await import('../services/adaptiveSampling.service');
        // 异常检测到时，可能需要提高采样率
        console.log(`[v1.9] Anomaly detected, adaptive sampling may adjust: ${event.eventId}`);
      } catch (err) {
        console.warn('[v1.9] Adaptive sampling notification failed:', err);
      }
    });

    console.log('[v1.9] ✓ Event bus integration registered');
  } catch (err) {
    console.error('[v1.9] ✗ Event bus integration failed:', err);
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // REST API 桥接层 — 数据库工作台自动生成的 RESTful 端点
  try {
    const { restRouter } = await import('../services/database/restBridge');
    app.use('/api/rest', restRouter);
    console.log('[REST Bridge] ✓ Auto-generated REST API registered at /api/rest');
  } catch (err) {
    console.error('[REST Bridge] ✗ Failed to register REST API:', err);
  }

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // 先确定实际端口，再初始化 Vite（Vite HMR 客户端需要知道正确的端口）
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server, port);
  } else {
    serveStatic(app);
  }

  // 初始化 Kafka 指标 WebSocket
  initKafkaMetricsWebSocket(server);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // 启动定时健康检查（每30秒检查一次）
    import('../jobs/healthCheck.job').then(({ startPeriodicHealthCheck }) => {
      startPeriodicHealthCheck(30000);
    }).catch(err => {
      console.error('[Server] Failed to start health check:', err);
    });

    // 初始化 v1.9 性能优化服务
    initPerformanceServices().catch(err => {
      console.error('[Server] Failed to initialize v1.9 services:', err);
    });

    // 注册事件总线集成
    registerEventBusIntegration().catch(err => {
      console.error('[Server] Failed to register event bus integration:', err);
    });
  });
}

startServer().catch(console.error);
