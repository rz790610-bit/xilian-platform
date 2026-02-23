/**
 * PortAI Nexus — 启动任务定义
 * 
 * 整改方案 v2.1 — B-02 启动序列显式化
 * 
 * 将 index.ts 中散布的初始化逻辑收敛为显式的 StartupTask 列表。
 * 每个任务声明自己的依赖、是否关键、超时时间。
 * 
 * 依赖图（简化）：
 * 
 *   config-validate ──┐
 *                     ├── otel ──┐
 *   env-loader ───────┘          │
 *                                ├── config-center ──┐
 *                                │                   ├── rest-bridge
 *                                │                   ├── performance-services
 *                                │                   ├── event-bus
 *                                │                   ├── data-flow-tracer
 *                                │                   ├── agent-registry
 *                                │                   ├── algorithm-sync
 *                                │                   └── data-artery
 *                                │
 *                                └── health-check
 */

import type { StartupTask } from './startup';
import { createModuleLogger } from './logger';

const log = createModuleLogger('startup-tasks');

/**
 * 构建后台服务启动任务列表。
 * 
 * 注意：Express 中间件注册（安全头、CORS、限流、body 解析、tRPC 等）
 * 仍然在 index.ts 中同步执行，因为它们是 Express app.use() 调用，
 * 不需要异步初始化。这里只管理需要异步初始化的后台服务。
 */
export function buildStartupTasks(): StartupTask[] {
  return [
    // ── 第 0 层：基础设施（无依赖） ──

    {
      id: 'otel',
      label: 'OpenTelemetry 初始化',
      dependencies: [],
      critical: false,  // OTel 不可用时降级运行
      timeout: 5000,
      init: async () => {
        const { initOpenTelemetry } = await import('../platform/middleware/opentelemetry');
        await initOpenTelemetry();
      },
    },

    {
      id: 'config-center',
      label: '配置中心',
      dependencies: [],
      critical: false,  // 配置中心不可用时使用 env 默认值
      timeout: 5000,
      init: async () => {
        const { configCenter } = await import('../platform/services/configCenter');
        await configCenter.initialize();
      },
    },

    // ── 第 1 层：核心服务（依赖基础设施） ──

    {
      id: 'health-check',
      label: '定时健康检查',
      dependencies: ['otel'],
      critical: false,
      timeout: 3000,
      init: async () => {
        const { startPeriodicHealthCheck } = await import('../jobs/healthCheck.job');
        startPeriodicHealthCheck(30000);
      },
    },

    {
      id: 'rest-bridge',
      label: 'REST API 桥接层',
      dependencies: ['config-center'],
      critical: false,
      timeout: 5000,
      init: async () => {
        // REST Bridge 的注册在 index.ts 中通过 app.use 完成
        // 这里只验证模块可加载
        await import('../services/database/restBridge');
      },
    },

    // ── 第 2 层：业务服务（依赖核心服务） ──

    {
      id: 'outbox-publisher',
      label: 'Outbox 混合发布器',
      dependencies: ['config-center'],
      critical: false,
      timeout: 5000,
      init: async () => {
        const { outboxPublisher } = await import('../services/outbox.publisher');
        await outboxPublisher.start();
      },
    },

    {
      id: 'saga-orchestrator',
      label: 'Saga 编排器',
      dependencies: ['config-center'],
      critical: false,
      timeout: 5000,
      init: async () => {
        const { sagaOrchestrator } = await import('../services/saga.orchestrator');
        const { registerRollbackSaga } = await import('../services/saga.rollback');
        await sagaOrchestrator.start();
        registerRollbackSaga();
      },
    },

    {
      id: 'adaptive-sampling',
      label: '自适应采样服务',
      dependencies: ['config-center'],
      critical: false,
      timeout: 3000,
      init: async () => {
        const { adaptiveSamplingService } = await import('../services/adaptiveSampling.service');
        await adaptiveSamplingService.start();
      },
    },

    {
      id: 'read-replica',
      label: '读写分离服务',
      dependencies: ['config-center'],
      critical: false,
      timeout: 3000,
      init: async () => {
        const { readReplicaService } = await import('../services/readReplica.service');
        await readReplicaService.start();
      },
    },

    {
      id: 'graph-query-optimizer',
      label: '图查询优化器',
      dependencies: ['config-center'],
      critical: false,
      timeout: 3000,
      init: async () => {
        const { graphQueryOptimizer } = await import('../services/graphQuery.optimizer');
        await graphQueryOptimizer.start();
      },
    },

    {
      id: 'event-bus',
      label: '事件总线集成',
      dependencies: ['outbox-publisher', 'adaptive-sampling'],
      critical: false,
      timeout: 5000,
      init: async () => {
        const { eventBus, TOPICS } = await import('../services/eventBus.service');
        const { deduplicationService } = await import('../services/deduplication.service');

        // 所有事件经过去重服务
        eventBus.subscribeAll(async (event) => {
          try {
            const result = await deduplicationService.isDuplicate(event.eventId || '', 'global');
            if (result.isDuplicate) {
              log.debug(`Duplicate event filtered: ${event.eventId}`);
              return;
            }
            await deduplicationService.markProcessed(event.eventId || '', event.eventType || 'unknown', 'global');
          } catch {
            // 去重服务失败不应阻塞事件处理
          }
        });

        // Outbox 发布器监听关键事件
        eventBus.subscribe(TOPICS.DEVICE_STATUS, async (event) => {
          try {
            const { outboxPublisher } = await import('../services/outbox.publisher');
            await outboxPublisher.addEvent({
              eventType: 'DeviceUpdated',
              aggregateType: 'Device',
              aggregateId: event.nodeId || 'unknown',
              payload: event.payload as Record<string, unknown>,
              metadata: { source: 'eventBus', correlationId: event.eventId },
            });
          } catch (err: any) {
            log.warn('Outbox event forwarding failed:', err?.message);
          }
        });

        // 异常事件触发自适应采样调整
        eventBus.subscribe(TOPICS.ANOMALY_DETECTED, async (_event) => {
          // 异常检测到时，可能需要提高采样率
          log.debug('Anomaly detected, adaptive sampling may adjust');
        });
      },
    },

    {
      id: 'data-flow-tracer',
      label: 'DataFlowTracer (L2 自省层)',
      dependencies: ['otel'],
      critical: false,
      timeout: 5000,
      init: async () => {
        const { dataFlowTracer } = await import('../platform/services/dataFlowTracer');
        await dataFlowTracer.initialize();
      },
    },

    {
      id: 'agent-registry',
      label: 'Agent Registry 统一注册',
      dependencies: ['config-center'],
      critical: false,
      timeout: 5000,
      init: async () => {
        const { bootstrapAgentRegistry } = await import('./agent-registry.bootstrap');
        await bootstrapAgentRegistry();
      },
    },

    {
      id: 'algorithm-sync',
      label: '内置算法同步',
      dependencies: ['config-center'],
      critical: false,
      timeout: 10000,
      init: async () => {
        const { algorithmService } = await import('../services/algorithm.service');
        const result = await algorithmService.syncBuiltinAlgorithms();
        log.info(`Synced builtin algorithms: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      },
    },

    {
      id: 'data-artery',
      label: '数据动脉全链路',
      dependencies: ['config-center', 'event-bus'],
      critical: false,
      timeout: 10000,
      init: async () => {
        const { startDataArtery } = await import('../services/data-artery.bootstrap');
        await startDataArtery();
      },
    },
  ];
}
