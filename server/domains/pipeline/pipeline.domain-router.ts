/**
 * ============================================================================
 * 管线领域路由聚合 — 横向数据管线 + 数字孪生
 * ============================================================================
 *
 * Phase 3 v1.3 — 世界模型增强 / 数字孪生系统工程重建
 *
 * 职责边界：
 *   - 数据管线 + 流处理 + DAG 引擎 + Pipeline 运行（原有）
 *   - 数字孪生 14 个 tRPC 端点 + 2 个 tRPC Subscription（Phase 3 新增）
 *
 * 端点清单（Phase 3）：
 *   Query:
 *     1. listEquipmentTwins     — 设备孪生概览列表
 *     2. getEquipmentTwinState  — 完整孪生状态
 *     3. simulation.list        — 仿真场景列表
 *     4. simulation.compare     — 多场景对比
 *     5. replay.getTimeRange    — 可回放时间范围
 *     6. replay.getData         — 多通道回放数据
 *     7. worldmodel.getConfig   — 世界模型配置
 *     8. worldmodel.getEquations — 物理方程列表
 *   Mutation:
 *     9.  simulation.create      — 创建仿真场景
 *     10. simulation.execute     — 异步执行仿真（BullMQ）
 *     11. simulation.batchExecute — 批量执行仿真
 *     12. simulation.delete      — 删除仿真场景
 *     13. worldmodel.predict     — 带不确定性预测
 *     14. ai.generateScenarioParams — Grok 生成仿真参数
 *   Subscription:
 *     S1. twin.stateUpdated      — 设备状态实时推送
 *     S2. simulation.progress    — 仿真进度实时推送
 *
 * 架构位置：server/domains/pipeline/ → evoPipeline.*
 */
import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, and, gte, lte, inArray, sql, asc } from 'drizzle-orm';
import { observable } from '@trpc/server/observable';
import {
  equipmentProfiles,
  cognitionSessions,
  worldModelSnapshots,
  worldModelPredictions,
  diagnosisPhysicsFormulas,
  simulationScenarios,
  simulationResults,
  twinSyncLogs,
  twinEvents,
  twinOutbox,
} from '../../../drizzle/evolution-schema';
import { realtimeTelemetry } from '../../../drizzle/schema';
import { deviceAlerts } from '../../../drizzle/schema';
// Phase 3 模块导入
import {
  worldModelRegistry,
  stateSyncEngine,
  uncertaintyQuantifier,
  rulPredictor,
  physicsValidator,
} from '../../platform/cognition/worldmodel/world-model-enhanced';
import { grokEnhancer } from '../../platform/cognition/worldmodel/grok-enhancer';
import {
  TwinEventBus,
  twinEventBus,
  TwinEventType,
  type TwinEvent,
  type TwinEventMap,
} from '../../platform/cognition/worldmodel/twin-event-bus';
import { outboxRelay, createOutboxEntry } from '../../platform/cognition/worldmodel/outbox-relay';
import { worldModelMetrics } from '../../platform/cognition/worldmodel/otel-metrics';
import { auditLogger } from '../../platform/cognition/worldmodel/audit-logger';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('pipeline');
import { DBSCANEngine } from '../../platform/cognition/worldmodel/dbscan-engine';
import { worldModelToolManager } from '../../platform/cognition/worldmodel/grok-tools';
import { twinConfigRouter } from './twinConfig.domain-router';
import type { StateVector } from '../../platform/cognition/worldmodel/world-model';
// 复用现有路由
import { pipelineRouter } from '../../api/pipeline.router';
import { dataPipelineRouter } from '../../api/dataPipeline.router';
import { streamProcessorRouter } from '../../services/streamProcessor.service';

// ============================================================================
// Zod 校验 Schema
// ============================================================================
const equipmentIdSchema = z.string().min(1).max(100);
const simulationCreateInput = z.object({
  machineId: equipmentIdSchema,
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  parameterOverrides: z.record(z.string(), z.number()).optional(),
  horizonSteps: z.number().int().min(1).max(1000).default(30),
  monteCarloRuns: z.number().int().min(1).max(500).default(50),
  method: z.enum(['sobol_qmc', 'random', 'latin_hypercube']).default('sobol_qmc'),
});
const simulationExecuteInput = z.object({
  scenarioId: z.number().int().positive(),
});
const simulationBatchExecuteInput = z.object({
  scenarioIds: z.array(z.number().int().positive()).min(1).max(10),
});
const simulationCompareInput = z.object({
  scenarioIds: z.array(z.number().int().positive()).min(2).max(5),
});
const replayTimeRangeInput = z.object({
  equipmentId: equipmentIdSchema,
});
const replayDataInput = z.object({
  equipmentId: equipmentIdSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  channels: z.array(z.string()).min(1).max(20).optional(),
  maxPoints: z.number().int().min(100).max(10000).default(2000),
  includeEvents: z.boolean().default(true),
});
const predictInput = z.object({
  equipmentId: equipmentIdSchema,
  horizonMinutes: z.number().int().min(1).max(1440).default(60),
  includeUncertainty: z.boolean().default(true),
  monteCarloRuns: z.number().int().min(10).max(500).default(50),
});
const aiGenerateInput = z.object({
  equipmentId: equipmentIdSchema,
  description: z.string().min(1).max(1000),
});
const subscriptionProgressInput = z.object({
  taskId: z.string().min(1),
});

// ============================================================================
// 仿真子路由
// ============================================================================

const simulationRouter = router({
  /** 3. 仿真场景列表 */
  list: publicProcedure
    .input(z.object({ machineId: equipmentIdSchema.optional(), limit: z.number().int().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input?.machineId) {
          conditions.push(eq(simulationScenarios.machineId, input.machineId));
        }
        const scenarios = await db.select().from(simulationScenarios)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(simulationScenarios.createdAt))
          .limit(input?.limit ?? 20);

        // 附加最新结果
        const result = await Promise.all(scenarios.map(async (s) => {
          const [latestResult] = await db.select().from(simulationResults)
            .where(eq(simulationResults.scenarioId, s.id))
            .orderBy(desc(simulationResults.createdAt))
            .limit(1);
          return {
            ...s,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
            latestResult: latestResult ? {
              id: latestResult.id,
              riskLevel: latestResult.riskLevel,
              monteCarloRuns: latestResult.monteCarloRuns,
              durationMs: latestResult.durationMs,
              createdAt: latestResult.createdAt.toISOString(),
            } : null,
          };
        }));
        return result;
      } catch (err) {
        log.warn({ err }, '[simulation.list] query failed');
        return [];
      }
    }),

  /** 4. 多场景对比 */
  compare: publicProcedure
    .input(simulationCompareInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const results = await db.select().from(simulationResults)
          .where(inArray(simulationResults.scenarioId, input.scenarioIds));

        const scenarios = await db.select().from(simulationScenarios)
          .where(inArray(simulationScenarios.id, input.scenarioIds));

        const scenarioMap = new Map(scenarios.map(s => [s.id, s]));

        return results.map(r => ({
          scenarioId: r.scenarioId,
          scenarioName: scenarioMap.get(r.scenarioId)?.name ?? `Scenario ${r.scenarioId}`,
          riskLevel: r.riskLevel,
          meanTrajectory: r.meanTrajectory,
          p5Trajectory: r.p5Trajectory,
          p50Trajectory: r.p50Trajectory,
          p95Trajectory: r.p95Trajectory,
          stdDevByDimension: r.stdDevByDimension,
          monteCarloRuns: r.monteCarloRuns,
          durationMs: r.durationMs,
          createdAt: r.createdAt.toISOString(),
        }));
      } catch (err) {
        log.warn({ err }, '[simulation.compare] query failed');
        return [];
      }
    }),

  /** 9. 创建仿真场景 */
  create: protectedProcedure
    .input(simulationCreateInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [result] = await db.insert(simulationScenarios).values({
        machineId: input.machineId,
        name: input.name,
        description: input.description,
        parameterOverrides: input.parameterOverrides ?? null,
        horizonSteps: input.horizonSteps,
        monteCarloRuns: input.monteCarloRuns,
        method: input.method,
        status: 'draft',
        version: 1,
      });

      // 审计日志
      await auditLogger.log({
        userId: (ctx as any).user?.id ?? 'system',
        action: 'simulation.create',
        resourceType: 'simulation_scenario',
        resourceId: String(result.insertId),
        payload: { name: input.name, machineId: input.machineId, horizonSteps: input.horizonSteps, monteCarloRuns: input.monteCarloRuns },
      });

      return {
        id: result.insertId,
        machineId: input.machineId,
        name: input.name,
        status: 'draft',
      };
    }),

  /** 10. 执行仿真（异步） */
  execute: protectedProcedure
    .input(simulationExecuteInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [scenario] = await db.select().from(simulationScenarios)
        .where(eq(simulationScenarios.id, input.scenarioId));

      if (!scenario) throw new Error(`Scenario ${input.scenarioId} not found`);
      if (scenario.status === 'running') throw new Error('Scenario is already running');

      // 更新状态为 running
      await db.update(simulationScenarios)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(simulationScenarios.id, input.scenarioId));

      const taskId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 异步执行（生产环境应改为 BullMQ）
      setImmediate(() => {
        executeSimulationTask(scenario, taskId).catch(err => {
          log.warn({ err, taskId }, '[simulation.execute] task failed');
        });
      });

      // 审计日志
      await auditLogger.log({
        userId: (ctx as any).user?.id ?? 'system',
        action: 'simulation.execute',
        resourceType: 'simulation_scenario',
        resourceId: String(input.scenarioId),
        payload: { taskId, scenarioId: input.scenarioId },
      });

      return { taskId, scenarioId: input.scenarioId, status: 'queued' };
    }),

  /** 11. 批量执行仿真 */
  batchExecute: protectedProcedure
    .input(simulationBatchExecuteInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const scenarios = await db.select().from(simulationScenarios)
        .where(inArray(simulationScenarios.id, input.scenarioIds));

      const tasks = scenarios.map(scenario => {
        const taskId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setImmediate(() => {
          executeSimulationTask(scenario, taskId).catch(err => {
            log.warn({ err, taskId }, '[simulation.batchExecute] task failed');
          });
        });
        return { taskId, scenarioId: scenario.id, status: 'queued' as const };
      });

      return { tasks, totalQueued: tasks.length };
    }),

  /** 12. 删除仿真场景 */
  delete: protectedProcedure
    .input(z.object({ scenarioId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 先删除关联结果
      await db.delete(simulationResults)
        .where(eq(simulationResults.scenarioId, input.scenarioId));
      // 再删除场景
      await db.delete(simulationScenarios)
        .where(eq(simulationScenarios.id, input.scenarioId));

      // 审计日志
      await auditLogger.log({
        userId: (ctx as any).user?.id ?? 'system',
        action: 'simulation.delete',
        resourceType: 'simulation_scenario',
        resourceId: String(input.scenarioId),
      });

      return { deleted: true, scenarioId: input.scenarioId };
    }),

  /** S2. 仿真进度实时推送 tRPC Subscription */
  progress: protectedProcedure
    .input(subscriptionProgressInput)
    .subscription(({ input }) => {
      return observable<{
        taskId: string;
        progress: number;
        status: 'queued' | 'running' | 'completed' | 'failed';
        partialResult?: unknown;
        message?: string;
      }>((emit) => {
        // 订阅进度事件
        const unsubProgress = twinEventBus.on(TwinEventType.SIMULATION_PROGRESS, (event) => {
          const p = event.payload;
          // 通过 scenarioId 匹配（taskId 在 progress 事件中不直接存在）
          emit.next({
            taskId: input.taskId,
            progress: p.progressPercent,
            status: 'running',
            message: `已完成 ${p.completedRuns}/${p.totalRuns} 次蒙特卡洛采样`,
          });
        });

        // 订阅完成事件
        const unsubCompleted = twinEventBus.on(TwinEventType.SIMULATION_COMPLETED, (event) => {
          emit.next({
            taskId: input.taskId,
            progress: 100,
            status: 'completed',
            message: `仿真完成，风险等级: ${event.payload.riskLevel}`,
          });
          emit.complete();
        });

        // 订阅失败事件
        const unsubFailed = twinEventBus.on(TwinEventType.SIMULATION_FAILED, (event) => {
          emit.next({
            taskId: input.taskId,
            progress: 0,
            status: 'failed',
            message: event.payload.error,
          });
          emit.complete();
        });

        return () => {
          unsubProgress();
          unsubCompleted();
          unsubFailed();
        };
      });
    }),
});

// ============================================================================
// 回放子路由
// ============================================================================

const replayRouter = router({
  /** 5. 可回放时间范围 */
  getTimeRange: publicProcedure
    .input(replayTimeRangeInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const [result] = await db.select({
          minTime: sql<Date>`MIN(${worldModelSnapshots.timestamp})`,
          maxTime: sql<Date>`MAX(${worldModelSnapshots.timestamp})`,
          totalSnapshots: sql<number>`COUNT(*)`,
        }).from(worldModelSnapshots)
          .where(eq(worldModelSnapshots.machineId, input.equipmentId));

        if (!result?.minTime || !result?.maxTime) return null;

        return {
          equipmentId: input.equipmentId,
          startTime: result.minTime.toISOString(),
          endTime: result.maxTime.toISOString(),
          totalSnapshots: result.totalSnapshots,
          availableChannels: ['temperature', 'vibration', 'pressure', 'load', 'windSpeed', 'healthIndex'],
        };
      } catch (err) {
        log.warn({ err }, '[replay.getTimeRange] query failed');
        return null;
      }
    }),

  /** 6. 多通道回放数据 */
  getData: publicProcedure
    .input(replayDataInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { channels: [], events: [] };
      try {
        const startDate = new Date(input.startTime);
        const endDate = new Date(input.endTime);

        // 获取时间范围内的快照
        const snapshots = await db.select().from(worldModelSnapshots)
          .where(and(
            eq(worldModelSnapshots.machineId, input.equipmentId),
            gte(worldModelSnapshots.timestamp, startDate),
            lte(worldModelSnapshots.timestamp, endDate),
          ))
          .orderBy(asc(worldModelSnapshots.timestamp))
          .limit(5000);

        // LTTB 降采样
        const downsampled = lttbDownsample(snapshots, input.maxPoints);

        // 构建通道数据
        const channelNames = input.channels ?? ['temperature', 'vibration', 'pressure', 'healthIndex'];
        const channels = channelNames.map(channel => ({
          name: channel,
          data: downsampled.map(s => {
            const sv = s.stateVector as Record<string, number>;
            return {
              timestamp: s.timestamp.toISOString(),
              value: channel === 'healthIndex' ? s.healthIndex : (sv[channel] ?? null),
            };
          }),
        }));

        // 事件叠加（告警 + 诊断）
        let events: Array<{ timestamp: string; type: string; severity: string; title: string; message: string | null }> = [];
        if (input.includeEvents) {
          const alerts = await db.select().from(deviceAlerts)
            .where(and(
              eq(deviceAlerts.nodeId, input.equipmentId),
              gte(deviceAlerts.createdAt, startDate),
              lte(deviceAlerts.createdAt, endDate),
            ))
            .orderBy(asc(deviceAlerts.createdAt))
            .limit(100);

          events = alerts.map(a => ({
            timestamp: a.createdAt.toISOString(),
            type: a.alertType,
            severity: a.severity,
            title: a.title,
            message: a.message,
          }));
        }

        // OTel 指标
        worldModelMetrics.recordReplayQueryDuration(String(input.maxPoints), Date.now() - startDate.getTime());

        return { channels, events };
      } catch (err) {
        log.warn({ err }, '[replay.getData] query failed');
        return { channels: [], events: [] };
      }
    }),

  /** 6b. DBSCAN 异常聚类分析 */
  dbscanAnalysis: publicProcedure
    .input(z.object({
      equipmentId: equipmentIdSchema,
      startTime: z.string(),
      endTime: z.string(),
      channels: z.array(z.string()).optional(),
      eps: z.number().min(0.01).max(2).default(0.3),
      minPts: z.number().int().min(2).max(50).default(5),
      maxPoints: z.number().int().min(10).max(5000).default(500),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { points: [], clusters: [], anomalyCount: 0, anomalyRate: 0, totalPoints: 0, params: { eps: input.eps, minPts: input.minPts } };
      try {
        const startDate = new Date(input.startTime);
        const endDate = new Date(input.endTime);

        const snapshots = await db.select().from(worldModelSnapshots)
          .where(and(
            eq(worldModelSnapshots.machineId, input.equipmentId),
            gte(worldModelSnapshots.timestamp, startDate),
            lte(worldModelSnapshots.timestamp, endDate),
          ))
          .orderBy(asc(worldModelSnapshots.timestamp))
          .limit(input.maxPoints);

        if (snapshots.length === 0) {
          return { points: [], clusters: [], anomalyCount: 0, anomalyRate: 0, totalPoints: 0, params: { eps: input.eps, minPts: input.minPts } };
        }

        const channelNames = input.channels ?? ['temperature', 'vibrationRMS', 'loadRatio', 'speed'];
        const data = snapshots.map(s => {
          const sv = s.stateVector as Record<string, number>;
          const values: Record<string, number> = {};
          for (const ch of channelNames) {
            values[ch] = ch === 'healthIndex' ? (s.healthIndex ?? 0) : (sv[ch] ?? 0);
          }
          return { timestamp: s.timestamp.toISOString(), values };
        });

        return DBSCANEngine.cluster(data, channelNames, input.eps, input.minPts);
      } catch (err) {
        log.warn({ err }, '[replay.dbscanAnalysis] query failed');
        return { points: [], clusters: [], anomalyCount: 0, anomalyRate: 0, totalPoints: 0, params: { eps: input.eps, minPts: input.minPts } };
      }
    }),
});

// ============================================================================
// 世界模型子路由
// ============================================================================

const worldmodelRouter = router({
  /** 7. 世界模型配置 */
  getConfig: publicProcedure
    .input(z.object({ equipmentId: equipmentIdSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const profiles = await db.select().from(equipmentProfiles).limit(50);
        const machineId = input.equipmentId;
        const profile = profiles.find(p => {
          const eqId = `EQ-${String(p.id).padStart(3, '0')}`;
          return eqId === machineId;
        });

        if (!profile) return null;

        // 获取 Registry 中的实例信息
        const instance = worldModelRegistry.getInstanceMeta(machineId);

        return {
          equipmentId: machineId,
          equipmentType: profile.type,
          manufacturer: profile.manufacturer,
          model: profile.model,
          worldModelConfig: profile.worldModelConfig,
          registryStatus: instance ? {
            registered: true,
            healthIndex: instance.healthIndex,
            lastSyncAt: instance.lastSyncAt ? new Date(instance.lastSyncAt).toISOString() : null,
            syncMode: instance.syncMode,
            stateVectorDimensions: instance.stateVector ? Object.keys(instance.stateVector.values).length : 0,
          } : {
            registered: false,
            healthIndex: null,
            lastSyncAt: null,
            syncMode: null,
            stateVectorDimensions: 0,
          },
          syncEngineStats: stateSyncEngine.getStats(),
        };
      } catch (err) {
        log.warn({ err }, '[worldmodel.getConfig] query failed');
        return null;
      }
    }),

  /** 8. 物理方程列表 */
  getEquations: publicProcedure
    .input(z.object({ equipmentId: equipmentIdSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const formulas = await db.select().from(diagnosisPhysicsFormulas)
          .where(eq(diagnosisPhysicsFormulas.enabled, true))
          .orderBy(asc(diagnosisPhysicsFormulas.category));

        return formulas.map(f => ({
          id: f.id,
          name: f.name,
          category: f.category,
          formula: f.formula,
          variables: f.variables,
          applicableEquipment: f.applicableEquipment,
          source: f.source,
          version: f.version,
        }));
      } catch (err) {
        log.warn({ err }, '[worldmodel.getEquations] query failed');
        return [];
      }
    }),

  /** 13. 带不确定性预测 */
  predict: protectedProcedure
    .input(predictInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const startTime = Date.now();

      // 获取最新快照
      const [latestSnapshot] = await db.select().from(worldModelSnapshots)
        .where(eq(worldModelSnapshots.machineId, input.equipmentId))
        .orderBy(desc(worldModelSnapshots.timestamp))
        .limit(1);

      if (!latestSnapshot) {
        throw new Error(`No snapshot found for equipment ${input.equipmentId}`);
      }

      const rawStateVector = latestSnapshot.stateVector as Record<string, number>;

      // 构建 StateVector 对象
      const currentState: StateVector = {
        timestamp: latestSnapshot.timestamp.getTime(),
        values: rawStateVector,
      };

      // 1. 基础预测（WorldModel）
      const model = await worldModelRegistry.getOrCreate(input.equipmentId);
      const basePrediction = model.predict(currentState, Math.ceil(input.horizonMinutes / 5));

      // 2. 不确定性量化（蒙特卡洛）
      let uncertaintyResult = null;
      if (input.includeUncertainty) {
        uncertaintyResult = uncertaintyQuantifier.quantify(
          model,
          currentState,
          Math.ceil(input.horizonMinutes / 5),
          input.monteCarloRuns,
        );
      }

      // 3. RUL 预测
      const stateHistory = model.getStateHistory();
      const rulResult = stateHistory.length > 0
        ? rulPredictor.predict(currentState, stateHistory)
        : null;

      // 4. 物理校验
      const previousState = stateHistory.length > 0 ? stateHistory[stateHistory.length - 1] : null;
      const validationResult = physicsValidator.validate(currentState, previousState);

      // 5. Grok AI 增强（如果启用）
      let aiExplanation: string | null = null;
      try {
        const enhanceResult = await grokEnhancer.enhancePredictionExplanation(
          input.equipmentId,
          {
            currentState: rawStateVector,
            prediction: basePrediction.trajectory.map(t => t.values),
            uncertainty: uncertaintyResult ? {
              meanTrajectory: uncertaintyResult.meanTrajectory.map(t => t.values),
              p5: uncertaintyResult.p5Trajectory.map(t => t.values),
              p95: uncertaintyResult.p95Trajectory.map(t => t.values),
            } : null,
            rul: rulResult,
          },
        );
        if (enhanceResult.source !== 'silent') {
          aiExplanation = enhanceResult.content;
        }
      } catch {
        // Grok 增强失败不影响核心预测
      }

      const durationMs = Date.now() - startTime;

      // 持久化预测结果
      await db.insert(worldModelPredictions).values({
        snapshotId: latestSnapshot.id,
        horizonMinutes: input.horizonMinutes,
        predictedState: basePrediction.trajectory[basePrediction.trajectory.length - 1]?.values ?? rawStateVector,
      });

      // OTel 指标
      worldModelMetrics.recordSimulationDuration('prediction', !!input.includeUncertainty, durationMs);
      if (input.includeUncertainty && input.monteCarloRuns) {
        worldModelMetrics.recordMonteCarloSamples(input.method ?? 'sobol_qmc', input.monteCarloRuns);
      }
      if (validationResult && !validationResult.isValid) {
        worldModelMetrics.incrementPhysicsValidationFailures('prediction');
      }

      // 审计日志
      await auditLogger.log({
        userId: (ctx as any).user?.id ?? 'system',
        action: 'worldmodel.predict',
        resourceType: 'world_model_prediction',
        resourceId: input.equipmentId,
        payload: { horizonMinutes: input.horizonMinutes, includeUncertainty: input.includeUncertainty, durationMs },
      });

      return {
        equipmentId: input.equipmentId,
        horizonMinutes: input.horizonMinutes,
        basePrediction: {
          trajectory: basePrediction.trajectory.map(t => ({ timestamp: t.timestamp, values: t.values })),
          confidences: basePrediction.confidences,
          method: basePrediction.method,
        },
        uncertainty: uncertaintyResult ? {
          meanTrajectory: uncertaintyResult.meanTrajectory.map(t => t.values),
          p5Trajectory: uncertaintyResult.p5Trajectory.map(t => t.values),
          p50Trajectory: uncertaintyResult.p50Trajectory.map(t => t.values),
          p95Trajectory: uncertaintyResult.p95Trajectory.map(t => t.values),
          stdDevByDimension: uncertaintyResult.stdDevByDimension,
          monteCarloRuns: uncertaintyResult.monteCarloRuns,
          sequenceType: uncertaintyResult.sequenceType,
          durationMs: uncertaintyResult.durationMs,
        } : null,
        rul: rulResult,
        physicsValidation: validationResult,
        aiExplanation,
        durationMs,
        timestamp: new Date().toISOString(),
      };
    }),
});

// ============================================================================
// AI 子路由
// ============================================================================

const aiRouter = router({
  /** 14. Grok 生成仿真参数 */
  generateScenarioParams: protectedProcedure
    .input(aiGenerateInput)
    .mutation(async ({ input }) => {
      const result = await grokEnhancer.enhanceSimulationScenario(
        input.equipmentId,
        {
          description: input.description,
          equipmentId: input.equipmentId,
        },
      );

      if (result.source === 'silent') {
        return {
          success: false,
          params: null,
          source: result.source,
          message: '参数生成失败，请手动配置',
        };
      }

      // 尝试解析 Grok 返回的 JSON 参数
      let parsedParams: Record<string, number> | null = null;
      try {
        parsedParams = JSON.parse(result.content);
      } catch {
        // 如果不是 JSON，返回原始文本
      }

      return {
        success: true,
        params: parsedParams,
        rawContent: parsedParams ? undefined : result.content,
        source: result.source,
        tokensUsed: result.tokensUsed,
        message: '参数生成成功',
      };
    }),
});

// ============================================================================
// 孪生状态子路由（含 Subscription）
// ============================================================================

const twinRouter = router({
  /** S1. 设备状态实时推送 tRPC Subscription */
  stateUpdated: publicProcedure
    .input(z.object({ equipmentId: equipmentIdSchema.optional() }).optional())
    .subscription(({ input }) => {
      return observable<{
        machineId: string;
        stateVector: Record<string, number>;
        healthIndex: number;
        timestamp: string;
      }>((emit) => {
        const unsub = twinEventBus.on(TwinEventType.TELEMETRY_UPDATED, (event) => {
          // 如果指定了 equipmentId，只推送该设备的更新
          if (input?.equipmentId && event.machineId !== input.equipmentId) {
            return;
          }
          const payload = event.payload;
          emit.next({
            machineId: event.machineId,
            stateVector: payload.stateVector,
            healthIndex: 0, // healthIndex 在 TelemetryUpdatedEvent 中不直接存在
            timestamp: new Date(event.timestamp).toISOString(),
          });
        });

        return () => {
          unsub();
        };
      });
    }),
});

// ============================================================================
// 仿真任务执行器（异步）
// ============================================================================

/**
 * 执行仿真任务
 *
 * 在生产环境中，此函数应由 BullMQ Worker 调用。
 * 当前实现通过 setImmediate 异步执行。
 */
async function executeSimulationTask(
  scenario: typeof simulationScenarios.$inferSelect,
  taskId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const startTime = Date.now();

  // 发布开始事件
  await twinEventBus.publish(TwinEventBus.createEvent(
    TwinEventType.SIMULATION_STARTED,
    scenario.machineId,
    {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      monteCarloRuns: scenario.monteCarloRuns,
    },
  ));

  try {
    // 获取设备最新状态
    const [latestSnapshot] = await db.select().from(worldModelSnapshots)
      .where(eq(worldModelSnapshots.machineId, scenario.machineId))
      .orderBy(desc(worldModelSnapshots.timestamp))
      .limit(1);

    const rawState = (latestSnapshot?.stateVector ?? {}) as Record<string, number>;
    const overrides = scenario.parameterOverrides ?? {};

    // 合并参数覆盖到状态
    const mergedValues = { ...rawState, ...overrides };
    const baseState: StateVector = {
      timestamp: Date.now(),
      values: mergedValues,
    };

    // 获取或创建 WorldModel 实例
    const model = await worldModelRegistry.getOrCreate(scenario.machineId);

    // 执行蒙特卡洛仿真
    const horizonSteps = scenario.horizonSteps;
    const numRuns = scenario.monteCarloRuns;

    const qmcResult = uncertaintyQuantifier.quantify(
      model,
      baseState,
      horizonSteps,
      numRuns,
    );

    // 发布进度事件
    await twinEventBus.publish(TwinEventBus.createEvent(
      TwinEventType.SIMULATION_PROGRESS,
      scenario.machineId,
      {
        scenarioId: scenario.id,
        completedRuns: numRuns,
        totalRuns: numRuns,
        progressPercent: 80,
        elapsedMs: Date.now() - startTime,
      },
    ));

    // 风险评估 — 基于 stdDevByDimension
    const allStdDevs: number[] = [];
    for (const values of Object.values(qmcResult.stdDevByDimension)) {
      allStdDevs.push(...values);
    }
    const maxStdDev = allStdDevs.length > 0 ? Math.max(...allStdDevs) : 0;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (maxStdDev > 0.5) riskLevel = 'critical';
    else if (maxStdDev > 0.3) riskLevel = 'high';
    else if (maxStdDev > 0.15) riskLevel = 'medium';

    // Grok AI 增强解释
    let aiExplanation: string | null = null;
    let aiMaintenanceAdvice: string | null = null;
    try {
      const explainResult = await grokEnhancer.enhancePredictionExplanation(
        scenario.machineId,
        {
          scenarioName: scenario.name,
          riskLevel,
          meanTrajectory: qmcResult.meanTrajectory.map(t => t.values),
          stdDevByDimension: qmcResult.stdDevByDimension,
        },
      );
      if (explainResult.source !== 'silent') {
        aiExplanation = explainResult.content;
      }

      const adviceResult = await grokEnhancer.enhanceMaintenanceAdvice(
        scenario.machineId,
        {
          riskLevel,
          prediction: qmcResult.meanTrajectory[qmcResult.meanTrajectory.length - 1]?.values ?? {},
        },
      );
      if (adviceResult.source !== 'silent') {
        aiMaintenanceAdvice = adviceResult.content;
      }
    } catch {
      // AI 增强失败不影响核心结果
    }

    const durationMs = Date.now() - startTime;

    // 构建轨迹数据（转换为 DB 存储格式）
    const meanTraj = qmcResult.meanTrajectory.map(t => ({ timestamp: t.timestamp, values: t.values }));
    const p5Traj = qmcResult.p5Trajectory.map(t => ({ timestamp: t.timestamp, values: t.values }));
    const p50Traj = qmcResult.p50Trajectory.map(t => ({ timestamp: t.timestamp, values: t.values }));
    const p95Traj = qmcResult.p95Trajectory.map(t => ({ timestamp: t.timestamp, values: t.values }));

    // 事务内双写：结果 + Outbox（ADR-007）
    await db.transaction(async (tx) => {
      // 写入仿真结果
      const [insertResult] = await tx.insert(simulationResults).values({
        scenarioId: scenario.id,
        machineId: scenario.machineId,
        meanTrajectory: meanTraj,
        p5Trajectory: p5Traj,
        p50Trajectory: p50Traj,
        p95Trajectory: p95Traj,
        stdDevByDimension: qmcResult.stdDevByDimension,
        riskLevel,
        monteCarloRuns: numRuns,
        sequenceType: qmcResult.sequenceType,
        durationMs,
        aiExplanation,
        aiMaintenanceAdvice,
      });

      const resultId = insertResult.insertId;

      // 写入 Outbox（同一事务）
      await tx.insert(twinOutbox).values(
        createOutboxEntry('simulation', scenario.id, TwinEventType.SIMULATION_COMPLETED, {
          scenarioId: scenario.id,
          resultId,
          durationMs,
          monteCarloRuns: numRuns,
          riskLevel,
        }),
      );

      // 更新场景状态
      await tx.update(simulationScenarios)
        .set({ status: 'completed', version: scenario.version + 1, updatedAt: new Date() })
        .where(eq(simulationScenarios.id, scenario.id));
    });

    // 发布完成事件（Outbox Relay 也会发布，这里是即时通知）
    await twinEventBus.publish(TwinEventBus.createEvent(
      TwinEventType.SIMULATION_COMPLETED,
      scenario.machineId,
      {
        scenarioId: scenario.id,
        resultId: 0, // 实际 resultId 在事务中获取
        durationMs,
        monteCarloRuns: numRuns,
        riskLevel,
      },
    ));

  } catch (err) {
    // 发布失败事件
    await twinEventBus.publish(TwinEventBus.createEvent(
      TwinEventType.SIMULATION_FAILED,
      scenario.machineId,
      {
        scenarioId: scenario.id,
        error: err instanceof Error ? err.message : String(err),
        attemptCount: 1,
      },
    ));

    // 更新场景状态为 failed
    await db.update(simulationScenarios)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(simulationScenarios.id, scenario.id));

    throw err;
  }
}

// ============================================================================
// LTTB 降采样算法
// ============================================================================

/**
 * Largest Triangle Three Buckets (LTTB) 降采样
 *
 * 保留数据的视觉特征，适用于时序数据可视化
 */
function lttbDownsample<T extends { timestamp: Date; healthIndex: number | null }>(
  data: T[],
  targetCount: number,
): T[] {
  if (data.length <= targetCount) return data;

  const result: T[] = [];
  const bucketSize = (data.length - 2) / (targetCount - 2);

  result.push(data[0]); // 保留第一个点

  for (let i = 0; i < targetCount - 2; i++) {
    const bucketStart = Math.floor((i) * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);

    // 计算下一个桶的平均值
    let avgX = 0, avgY = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += j;
      avgY += data[j].healthIndex ?? 0;
    }
    avgX /= (nextBucketEnd - nextBucketStart);
    avgY /= (nextBucketEnd - nextBucketStart);

    // 在当前桶中找到与上一个选中点和下一个桶平均值形成最大三角形的点
    const prevPoint = result[result.length - 1];
    const prevX = data.indexOf(prevPoint);
    const prevY = prevPoint.healthIndex ?? 0;

    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd && j < data.length; j++) {
      const area = Math.abs(
        (prevX - avgX) * ((data[j].healthIndex ?? 0) - prevY) -
        (prevX - j) * (avgY - prevY),
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    result.push(data[maxIdx]);
  }

  result.push(data[data.length - 1]); // 保留最后一个点

  return result;
}

// ============================================================================
// 主路由聚合
// ============================================================================

export const pipelineDomainRouter = router({
  /** 原有管线路由 */
  pipeline: pipelineRouter,
  dataPipeline: dataPipelineRouter,
  streamProcessor: streamProcessorRouter,

  // ========================================================================
  // Phase 3: 数字孪生路由
  // ========================================================================

  /** 1. 列出数字孪生体 */
  listEquipmentTwins: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const equipment = await db.select().from(equipmentProfiles);

        const result = await Promise.all(equipment.map(async (eq_item) => {
          const machineId = `EQ-${String(eq_item.id).padStart(3, '0')}`;

          // 从 Registry 获取实时状态（如果已注册）
          const instance = worldModelRegistry.getInstanceMeta(machineId);

          // 从 cognitionSessions 获取最新评分
          const sessions = await db.select().from(cognitionSessions)
            .where(eq(cognitionSessions.machineId, machineId))
            .orderBy(desc(cognitionSessions.startedAt))
            .limit(1);

          const lastSession = sessions[0];
          const lastSyncAt = instance?.lastSyncAt
            ?? lastSession?.completedAt
            ?? lastSession?.startedAt
            ?? new Date();
          const timeSinceSync = Date.now() - new Date(lastSyncAt).getTime();

          let syncStatus: 'synced' | 'stale' | 'disconnected' = 'synced';
          if (timeSinceSync > 3600000) syncStatus = 'disconnected';
          else if (timeSinceSync > 300000) syncStatus = 'stale';

          // 状态向量：优先从 Registry 获取，否则从最新快照获取
          let stateVector: Record<string, number> = {};
          if (instance?.stateVector) {
            stateVector = instance.stateVector.values;
          } else {
            const [snapshot] = await db.select().from(worldModelSnapshots)
              .where(eq(worldModelSnapshots.machineId, machineId))
              .orderBy(desc(worldModelSnapshots.timestamp))
              .limit(1);
            if (snapshot?.stateVector) {
              stateVector = snapshot.stateVector as Record<string, number>;
            }
          }

          // 健康评分
          const healthScore = instance?.healthIndex
            ?? (lastSession?.healthScore ? Number(lastSession.healthScore) : null);
          const safetyScore = lastSession?.safetyScore ? Number(lastSession.safetyScore) : null;
          const efficiencyScore = lastSession?.efficiencyScore ? Number(lastSession.efficiencyScore) : null;

          return {
            equipmentId: machineId,
            equipmentName: `${eq_item.manufacturer ?? ''} ${eq_item.model ?? eq_item.type}`.trim(),
            equipmentType: eq_item.type,
            syncStatus,
            syncMode: instance?.syncMode ?? 'polling',
            lastSyncAt: new Date(lastSyncAt).toISOString(),
            stateVector,
            healthScore: healthScore != null ? Math.round(healthScore * 10) / 10 : null,
            safetyScore: safetyScore != null ? Math.round(safetyScore * 10) / 10 : null,
            efficiencyScore: efficiencyScore != null ? Math.round(efficiencyScore * 10) / 10 : null,
            registryStatus: instance ? 'active' : 'unregistered',
          };
        }));

        return result;
      } catch (err) {
        log.warn({ err }, '[listEquipmentTwins] query failed');
        return [];
      }
    }),

  /** 2. 获取完整孪生状态 */
  getEquipmentTwinState: publicProcedure
    .input(z.object({ equipmentId: equipmentIdSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const machineId = input.equipmentId;

        // 设备基础信息
        const profiles = await db.select().from(equipmentProfiles).limit(50);
        const profile = profiles.find(p => `EQ-${String(p.id).padStart(3, '0')}` === machineId);
        if (!profile) return null;

        // Registry 实例
        const instance = worldModelRegistry.getInstanceMeta(machineId);

        // 最新认知会话
        const [lastSession] = await db.select().from(cognitionSessions)
          .where(eq(cognitionSessions.machineId, machineId))
          .orderBy(desc(cognitionSessions.startedAt))
          .limit(1);

        // 最新快照
        const [latestSnapshot] = await db.select().from(worldModelSnapshots)
          .where(eq(worldModelSnapshots.machineId, machineId))
          .orderBy(desc(worldModelSnapshots.timestamp))
          .limit(1);

        // 最近 24 小时的快照趋势
        const dayAgo = new Date(Date.now() - 86400000);
        const recentSnapshots = await db.select().from(worldModelSnapshots)
          .where(and(
            eq(worldModelSnapshots.machineId, machineId),
            gte(worldModelSnapshots.timestamp, dayAgo),
          ))
          .orderBy(asc(worldModelSnapshots.timestamp))
          .limit(288);

        // 最近告警
        const recentAlerts = await db.select().from(deviceAlerts)
          .where(and(
            eq(deviceAlerts.nodeId, machineId),
            eq(deviceAlerts.status, 'active'),
          ))
          .orderBy(desc(deviceAlerts.createdAt))
          .limit(10);

        // 同步日志
        const recentSyncLogs = await db.select().from(twinSyncLogs)
          .where(eq(twinSyncLogs.machineId, machineId))
          .orderBy(desc(twinSyncLogs.createdAt))
          .limit(20);

        // RUL 预测
        let stateVector: Record<string, number> = {};
        if (instance?.stateVector) {
          stateVector = instance.stateVector.values;
        } else if (latestSnapshot?.stateVector) {
          stateVector = latestSnapshot.stateVector as Record<string, number>;
        }

        let rul = null;
        if (Object.keys(stateVector).length > 0) {
          const currentState: StateVector = { timestamp: Date.now(), values: stateVector };
          // 从快照构建历史
          const stateHistory: StateVector[] = recentSnapshots.map(s => ({
            timestamp: s.timestamp.getTime(),
            values: s.stateVector as Record<string, number>,
          }));
          if (stateHistory.length > 0) {
            rul = rulPredictor.predict(currentState, stateHistory);
          }
        }

        const lastSyncAt = instance?.lastSyncAt
          ?? lastSession?.completedAt
          ?? lastSession?.startedAt
          ?? new Date();
        const timeSinceSync = Date.now() - new Date(lastSyncAt).getTime();
        let syncStatus: 'synced' | 'stale' | 'disconnected' = 'synced';
        if (timeSinceSync > 3600000) syncStatus = 'disconnected';
        else if (timeSinceSync > 300000) syncStatus = 'stale';

        return {
          equipment: {
            id: machineId,
            name: `${profile.manufacturer ?? ''} ${profile.model ?? profile.type}`.trim(),
            type: profile.type,
            manufacturer: profile.manufacturer,
            model: profile.model,
          },
          stateVector,
          health: {
            overallScore: instance?.healthIndex
              ?? (lastSession?.healthScore ? Number(lastSession.healthScore) : null),
            safetyScore: lastSession?.safetyScore ? Number(lastSession.safetyScore) : null,
            healthScore: lastSession?.healthScore ? Number(lastSession.healthScore) : null,
            efficiencyScore: lastSession?.efficiencyScore ? Number(lastSession.efficiencyScore) : null,
          },
          syncStatus,
          syncMode: instance?.syncMode ?? 'polling',
          lastSyncAt: new Date(lastSyncAt).toISOString(),
          predictions: latestSnapshot?.predictions ?? null,
          rul,
          trend: recentSnapshots.map(s => ({
            timestamp: s.timestamp.toISOString(),
            healthIndex: s.healthIndex,
            stateVector: s.stateVector,
          })),
          activeAlerts: recentAlerts.map(a => ({
            id: a.alertId,
            type: a.alertType,
            severity: a.severity,
            title: a.title,
            message: a.message,
            createdAt: a.createdAt.toISOString(),
          })),
          syncLogs: recentSyncLogs.map(l => ({
            syncMode: l.syncMode,
            eventType: l.eventType,
            latencyMs: l.latencyMs,
            createdAt: l.createdAt.toISOString(),
          })),
          diagnostics: lastSession ? {
            sessionId: lastSession.id,
            triggerType: lastSession.triggerType,
            status: lastSession.status,
            diagnosticsJson: lastSession.diagnosticsJson,
            predictionsJson: lastSession.predictionsJson,
            grokExplanation: lastSession.grokExplanation,
            processingTimeMs: lastSession.totalProcessingTimeMs,
          } : null,
        };
      } catch (err) {
        log.warn({ err }, '[getEquipmentTwinState] query failed');
        return null;
      }
    }),

  /** 数字孪生运行配置 */
  twinConfig: twinConfigRouter,
  /** 仿真子路由 */
  simulation: simulationRouter,
  /** 回放子路由 */
  replay: replayRouter,
  /** 世界模型子路由 */
  worldmodel: worldmodelRouter,
  /** AI 子路由 */
  ai: aiRouter,
  /** 孝体状态子路由（含 Subscription） */
  twin: twinRouter,

  // ========================================================================
  // Phase 3: OTel 指标 + Grok 工具
  // ========================================================================

  /** OTel 指标导出端点 */
  metrics: publicProcedure.query(() => {
    return worldModelMetrics.exportMetrics();
  }),

  /** OTel 指标摘要 */
  metricsSummary: publicProcedure.query(() => {
    return worldModelMetrics.getSummary();
  }),

  /** Grok 工具列表 */
  grokTools: publicProcedure.query(() => {
    return worldModelToolManager.getToolDefinitions();
  }),

  /** Grok 工具调用 */
  invokeGrokTool: protectedProcedure
    .input(z.object({
      toolName: z.string(),
      input: z.record(z.unknown()),
      context: z.object({
        sessionId: z.string().optional(),
        machineId: z.string().optional(),
        traceId: z.string(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await worldModelToolManager.invoke(input);

      // 审计日志
      await auditLogger.log({
        userId: (ctx as any).user?.id ?? 'system',
        action: `grok.tool.${input.toolName}`,
        resourceType: 'grok_tool',
        resourceId: input.toolName,
        payload: { traceId: input.context.traceId, durationMs: result.durationMs },
      });

      return result;
    }),

  /** 审计日志查询 */
  auditLogs: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      action: z.string().optional(),
      resourceType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const rows = await db.execute({
          sql: `SELECT id, user_id, action, resource_type, resource_id, payload, created_at
                FROM audit_logs
                ${input.action ? 'WHERE action = ?' : ''}
                ${input.resourceType ? (input.action ? 'AND' : 'WHERE') + ' resource_type = ?' : ''}
                ORDER BY created_at DESC LIMIT ?`,
          params: [
            ...(input.action ? [input.action] : []),
            ...(input.resourceType ? [input.resourceType] : []),
            input.limit,
          ],
        });
        return rows.rows ?? [];
      } catch {
        return [];
      }
    }),
});
