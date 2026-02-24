/**
 * ============================================================================
 * 进化领域路由聚合 v2.0 — ④进化闭环
 * ============================================================================
 * 职责边界：影子评估 + 冠军挑战 + 金丝雀发布 + 数据引擎 + 进化周期 + 知识结晶
 *          + FSD 干预记录 + 仿真场景 + 飞轮调度 + 趋势分析
 *
 * v2.0 升级：
 *   - 所有 mutation 填充真实 DB 持久化逻辑
 *   - 新增 fsd 子路由（干预记录 + 仿真场景 + 视频轨迹）
 *   - 新增 schedule 子路由（飞轮调度配置）
 *   - 增强 cycle 子路由（趋势分析 + 步骤日志）
 *   - 增强 canary 子路由（阶段详情 + 健康检查记录）
 */
import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { TRPCError } from '@trpc/server';
import { getOrchestrator, EVOLUTION_TOPICS } from './evolution-orchestrator';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count, gte, and, lte, asc, sql, or } from 'drizzle-orm';
import {
  shadowEvalRecords,
  shadowEvalMetrics,
  championChallengerExperiments,
  canaryDeployments,
  canaryDeploymentStages,
  canaryHealthChecks,
  edgeCases,
  evolutionCycles,
  evolutionStepLogs,
  knowledgeCrystals,
  evolutionInterventions,
  evolutionSimulations,
  evolutionVideoTrajectories,
  evolutionFlywheelSchedules,
  engineConfigRegistry,
  evolutionAuditLogs,
  dojoTrainingJobs,
  evolutionTraces,
  evolutionSpans,
  evolutionMetricSnapshots,
  evolutionAlertRules,
  evolutionAlerts,
} from '../../../drizzle/evolution-schema';
import { InterventionRateEngine } from '../../platform/evolution/shadow/intervention-rate-engine';
import { observabilityRouter } from './observability.router';
import { selfHealingRouter } from './self-healing.router';
import { deepAIRouter } from './deep-ai.router';

// 单例干预率引擎
const interventionRateEngine = new InterventionRateEngine();

// ============================================================================
// 影子评估路由
// ============================================================================
const shadowEvalRouter = router({
  /** 创建影子评估实验 */
  create: protectedProcedure
    .input(z.object({
      experimentName: z.string(),
      baselineModelId: z.string(),
      challengerModelId: z.string(),
      dataRangeStart: z.string(),
      dataRangeEnd: z.string(),
      config: z.object({
        sliceCount: z.number().default(100),
        timeoutMs: z.number().default(30000),
        mcNemarAlpha: z.number().default(0.05),
        monteCarloRuns: z.number().default(1000),
        perturbationMagnitude: z.number().default(0.1),
        tasWeights: z.object({
          mcNemar: z.number().default(0.4),
          dsFusion: z.number().default(0.3),
          monteCarlo: z.number().default(0.3),
        }).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const configVal = input.config ? {
          sliceCount: input.config.sliceCount,
          timeoutMs: input.config.timeoutMs,
          mcNemarAlpha: input.config.mcNemarAlpha,
          monteCarloRuns: input.config.monteCarloRuns,
          perturbationMagnitude: input.config.perturbationMagnitude,
          tasWeights: input.config.tasWeights ?? { mcNemar: 0.4, dsFusion: 0.3, monteCarlo: 0.3 },
        } : null;
        const result = await db.insert(shadowEvalRecords).values({
          experimentName: input.experimentName,
          baselineModelId: input.baselineModelId,
          challengerModelId: input.challengerModelId,
          dataRangeStart: new Date(input.dataRangeStart),
          dataRangeEnd: new Date(input.dataRangeEnd),
          status: 'pending',
          config: configVal,
        });
        return { recordId: Number(result[0].insertId), status: 'pending' };
      } catch (err) {
        return { recordId: 0, status: 'failed', error: String(err) };
      }
    }),

  /** 列出影子评估 */
  list: publicProcedure
    .input(z.object({
      status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(shadowEvalRecords)
          .orderBy(desc(shadowEvalRecords.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(shadowEvalRecords);
        return { records: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { records: [], total: 0 }; }
    }),

  /** 获取评估详情 */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const records = await db.select().from(shadowEvalRecords)
          .where(eq(shadowEvalRecords.id, input.id)).limit(1);
        const metrics = await db.select().from(shadowEvalMetrics)
          .where(eq(shadowEvalMetrics.recordId, input.id));
        return { record: records[0] ?? null, metrics };
      } catch { return { record: null, metrics: [] }; }
    }),

  /** 启动评估 */
  start: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(shadowEvalRecords)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(shadowEvalRecords.id, input.id));
        // EventBus: 进化周期启动
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.CYCLE_STARTED, { trigger: 'manual', scope: 'shadow_eval', recordId: input.id });
      getOrchestrator().recordMetric('evolution.cycle.started', 1);

      return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),
});

// ============================================================================
// 冠军挑战者路由
// ============================================================================
const championChallengerRouter = router({
  /** 创建挑战实验 */
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      championId: z.string(),
      challengerId: z.string(),
      shadowEvalId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const result = await db.insert(championChallengerExperiments).values({
          name: input.name,
          championId: input.championId,
          challengerId: input.challengerId,
          verdict: 'PENDING',
          shadowEvalId: input.shadowEvalId ?? null,
        });
        return { experimentId: Number(result[0].insertId) };
      } catch (err) {
        return { experimentId: 0, error: String(err) };
      }
    }),

  /** 列出实验 */
  list: publicProcedure
    .input(z.object({
      verdict: z.enum(['PROMOTE', 'CANARY_EXTENDED', 'REJECT', 'PENDING']).optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(championChallengerExperiments)
          .orderBy(desc(championChallengerExperiments.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(championChallengerExperiments);
        return { experiments: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { experiments: [], total: 0 }; }
    }),

  /** 获取实验详情 */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(championChallengerExperiments)
          .where(eq(championChallengerExperiments.id, input.id)).limit(1);
        return { experiment: rows[0] ?? null };
      } catch { return { experiment: null }; }
    }),

  /** 手动裁决 */
  verdict: protectedProcedure
    .input(z.object({
      id: z.number(),
      verdict: z.enum(['PROMOTE', 'REJECT']),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(championChallengerExperiments)
          .set({
            verdict: input.verdict,
            updatedAt: new Date(),
          })
          .where(eq(championChallengerExperiments.id, input.id));
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),
});

// ============================================================================
// 金丝雀发布路由（v2.0 增强：阶段详情 + 健康检查记录）
// ============================================================================
const canaryRouter = router({
  /** 创建金丝雀发布 */
  create: protectedProcedure
    .input(z.object({
      experimentId: z.number(),
      modelId: z.string(),
      trafficPercent: z.number().min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const result = await db.insert(canaryDeployments).values({
          experimentId: input.experimentId,
          modelId: input.modelId,
          trafficPercent: input.trafficPercent,
          status: 'active',
          startedAt: new Date(),
        });
        return { deploymentId: Number(result[0].insertId) };
      } catch (err) {
        return { deploymentId: 0, error: String(err) };
      }
    }),

  /** 列出金丝雀发布 */
  list: publicProcedure
    .input(z.object({
      status: z.enum(['active', 'completed', 'rolled_back', 'failed']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(canaryDeployments)
          .orderBy(desc(canaryDeployments.createdAt));
        return { deployments: rows, total: rows.length };
      } catch { return { deployments: [], total: 0 }; }
    }),

  /** 获取金丝雀详情（v2.0: 含阶段 + 健康检查） */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const deployments = await db.select().from(canaryDeployments)
          .where(eq(canaryDeployments.id, input.id)).limit(1);
        const stages = await db.select().from(canaryDeploymentStages)
          .where(eq(canaryDeploymentStages.deploymentId, input.id))
          .orderBy(canaryDeploymentStages.stageIndex);
        const healthChecks = await db.select().from(canaryHealthChecks)
          .where(eq(canaryHealthChecks.deploymentId, input.id))
          .orderBy(desc(canaryHealthChecks.checkedAt))
          .limit(50);
        return {
          deployment: deployments[0] ?? null,
          stages,
          healthChecks,
        };
      } catch { return { deployment: null, stages: [], healthChecks: [] }; }
    }),

  /** 回滚金丝雀 */
  rollback: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(canaryDeployments)
          .set({
            status: 'rolled_back',
            rollbackReason: input.reason,
            trafficPercent: 0,
            endedAt: new Date(),
          })
          .where(eq(canaryDeployments.id, input.id));
        // 标记活跃阶段为 rolled_back
        const activeStages = await db.select().from(canaryDeploymentStages)
          .where(and(
            eq(canaryDeploymentStages.deploymentId, input.id),
            eq(canaryDeploymentStages.status, 'active'),
          ));
        for (const stage of activeStages) {
          await db.update(canaryDeploymentStages)
            .set({ status: 'rolled_back', rollbackReason: input.reason, completedAt: new Date() })
            .where(eq(canaryDeploymentStages.id, stage.id));
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),

  /** 提升为全量 */
  promote: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(canaryDeployments)
          .set({ status: 'completed', trafficPercent: 100, endedAt: new Date() })
          .where(eq(canaryDeployments.id, input.id));
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),
});

// ============================================================================
// 数据引擎路由
// ============================================================================
const dataEngineRouter = router({
  /** 触发数据引擎分析 */
  triggerAnalysis: protectedProcedure
    .input(z.object({
      dataRangeStart: z.string(),
      dataRangeEnd: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        // 创建新的进化周期
        const cycleRows = await db.select({ cnt: count() }).from(evolutionCycles);
        const nextCycleNumber = (cycleRows[0]?.cnt ?? 0) + 1;
        const result = await db.insert(evolutionCycles).values({
          cycleNumber: nextCycleNumber,
          startedAt: new Date(),
          status: 'running',
        });
        const cycleId = Number(result[0].insertId);
        return { cycleId, edgeCasesFound: 0 };
      } catch (err) {
        return { cycleId: 0, edgeCasesFound: 0, error: String(err) };
      }
    }),

  /** 获取边缘案例列表 */
  getEdgeCases: publicProcedure
    .input(z.object({
      cycleId: z.number().optional(),
      status: z.enum(['discovered', 'analyzing', 'labeled', 'integrated', 'dismissed']).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(edgeCases)
          .orderBy(desc(edgeCases.discoveredAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(edgeCases);
        return { edgeCases: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { edgeCases: [], total: 0 }; }
    }),

  /** 标注边缘案例 */
  labelEdgeCase: protectedProcedure
    .input(z.object({
      id: z.number(),
      labelResult: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(edgeCases)
          .set({
            status: 'labeled',
            labelResult: input.labelResult,
          })
          .where(eq(edgeCases.id, input.id));
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),
});

// ============================================================================
// 进化周期路由（v2.0 增强：步骤日志 + 趋势分析）
// ============================================================================
const cycleRouter = router({
  /** 获取进化周期列表 */
  list: publicProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionCycles)
          .orderBy(desc(evolutionCycles.startedAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(evolutionCycles);
        return { cycles: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { cycles: [], total: 0 }; }
    }),

  /** 获取进化趋势（v2.0: 真实数据） */
  getTrend: publicProcedure
    .input(z.object({ weeks: z.number().default(12) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const cycles = await db.select().from(evolutionCycles)
          .orderBy(desc(evolutionCycles.startedAt))
          .limit(input.weeks);

        const trend = cycles.reverse().map(c => ({
          cycleNumber: c.cycleNumber,
          accuracyBefore: c.accuracyBefore,
          accuracyAfter: c.accuracyAfter,
          improvementPercent: c.improvementPercent,
          edgeCasesFound: c.edgeCasesFound,
          knowledgeCrystallized: c.knowledgeCrystallized,
          startedAt: c.startedAt?.toISOString(),
        }));

        // 计算趋势方向
        const scores = trend.map(t => t.accuracyAfter ?? t.accuracyBefore ?? 0);
        let slope = 0;
        if (scores.length >= 2) {
          const n = scores.length;
          const sumX = (n * (n - 1)) / 2;
          const sumY = scores.reduce((a, b) => a + b, 0);
          const sumXY = scores.reduce((acc, y, i) => acc + i * y, 0);
          const sumX2 = scores.reduce((acc, _, i) => acc + i * i, 0);
          slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        }

        const direction = slope > 0.01 ? 'improving' : slope < -0.01 ? 'degrading' : 'stable';

        return { trend, direction, slope };
      } catch { return { trend: [], direction: 'stable', slope: 0 }; }
    }),

  /** 获取当前周期状态 */
  getCurrent: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionCycles)
          .orderBy(desc(evolutionCycles.startedAt))
          .limit(1);
        return { cycle: rows[0] ?? null };
      } catch { return { cycle: null }; }
    }),

  /** 获取周期步骤日志（v2.0 新增） */
  getStepLogs: publicProcedure
    .input(z.object({ cycleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const logs = await db.select().from(evolutionStepLogs)
          .where(eq(evolutionStepLogs.cycleId, input.cycleId))
          .orderBy(evolutionStepLogs.stepNumber);
        return { stepLogs: logs };
      } catch { return { stepLogs: [] }; }
    }),

  /** 一键启动进化周期 */
  startCycle: protectedProcedure
    .input(z.object({
      trigger: z.enum(['manual', 'auto', 'scheduled', 'event']).default('manual'),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        // 检查是否有正在运行的周期
        const running = await db.select().from(evolutionCycles)
          .where(eq(evolutionCycles.status, 'running'))
          .limit(1);
        if (running.length > 0) {
          return { cycleId: 0, error: '已有正在运行的进化周期 #' + running[0].cycleNumber };
        }
        // 获取下一个周期号
        const latest = await db.select().from(evolutionCycles)
          .orderBy(desc(evolutionCycles.cycleNumber))
          .limit(1);
        const nextCycleNumber = (latest[0]?.cycleNumber ?? 0) + 1;
        // 创建周期记录
        const result = await db.insert(evolutionCycles).values({
          cycleNumber: nextCycleNumber,
          startedAt: new Date(),
          status: 'running',
          edgeCasesFound: 0,
          hypothesesGenerated: 0,
          modelsEvaluated: 0,
          deployed: 0,
          knowledgeCrystallized: 0,
        });
        const cycleId = Number(result[0].insertId);
        // 创建 5 个步骤日志
        const steps = [
          { stepNumber: 1, stepName: '数据发现' },
          { stepNumber: 2, stepName: '假设生成' },
          { stepNumber: 3, stepName: '影子验证' },
          { stepNumber: 4, stepName: '金丝雀部署' },
          { stepNumber: 5, stepName: '反馈结晶' },
        ];
        for (const step of steps) {
          await db.insert(evolutionStepLogs).values({
            cycleId,
            stepNumber: step.stepNumber,
            stepName: step.stepName,
            status: step.stepNumber === 1 ? 'running' : 'pending',
            startedAt: step.stepNumber === 1 ? new Date() : undefined,
          });
        }
        // 写入审计日志
        await db.insert(evolutionAuditLogs).values({
          eventType: 'cycle.started',
          eventSource: 'evolution-flywheel',
          eventData: { cycleId, cycleNumber: nextCycleNumber, trigger: input.trigger, config: input.config },
          severity: 'info',
        });
        return { cycleId, cycleNumber: nextCycleNumber };
      } catch (err) {
        return { cycleId: 0, error: String(err) };
      }
    }),

  /** 推进步骤状态 */
  advanceStep: protectedProcedure
    .input(z.object({
      cycleId: z.number(),
      stepNumber: z.number().min(1).max(5),
      status: z.enum(['running', 'completed', 'failed', 'skipped']),
      metrics: z.record(z.string(), z.number()).optional(),
      outputSummary: z.record(z.string(), z.unknown()).optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const updates: Record<string, unknown> = { status: input.status };
        if (input.status === 'running') {
          updates.startedAt = new Date();
        }
        if (input.status === 'completed' || input.status === 'failed') {
          updates.completedAt = new Date();
          if (input.metrics) updates.metrics = input.metrics;
          if (input.outputSummary) updates.outputSummary = input.outputSummary;
          if (input.errorMessage) updates.errorMessage = input.errorMessage;
          // 计算耗时
          const stepRow = await db.select().from(evolutionStepLogs)
            .where(and(eq(evolutionStepLogs.cycleId, input.cycleId), eq(evolutionStepLogs.stepNumber, input.stepNumber)))
            .limit(1);
          if (stepRow[0]?.startedAt) {
            updates.durationMs = Date.now() - stepRow[0].startedAt.getTime();
          }
        }
        await db.update(evolutionStepLogs)
          .set(updates)
          .where(and(eq(evolutionStepLogs.cycleId, input.cycleId), eq(evolutionStepLogs.stepNumber, input.stepNumber)));
        // 如果当前步骤完成且不是最后一步，自动将下一步设为 running
        if (input.status === 'completed' && input.stepNumber < 5) {
          await db.update(evolutionStepLogs)
            .set({ status: 'running', startedAt: new Date() })
            .where(and(eq(evolutionStepLogs.cycleId, input.cycleId), eq(evolutionStepLogs.stepNumber, input.stepNumber + 1)));
        }
        // 如果最后一步完成，标记周期完成
        if (input.status === 'completed' && input.stepNumber === 5) {
          await db.update(evolutionCycles)
            .set({ status: 'completed', completedAt: new Date() })
            .where(eq(evolutionCycles.id, input.cycleId));
          // 审计日志
          await db.insert(evolutionAuditLogs).values({
            eventType: 'cycle.completed',
            eventSource: 'evolution-flywheel',
            eventData: { cycleId: input.cycleId },
            severity: 'info',
          });
        }
        // 如果任何步骤失败，标记周期失败
        if (input.status === 'failed') {
          await db.update(evolutionCycles)
            .set({ status: 'failed', completedAt: new Date() })
            .where(eq(evolutionCycles.id, input.cycleId));
          await db.insert(evolutionAuditLogs).values({
            eventType: 'cycle.failed',
            eventSource: 'evolution-flywheel',
            eventData: { cycleId: input.cycleId, failedStep: input.stepNumber, error: input.errorMessage },
            severity: 'error',
          });
        }
        // EventBus: 步骤推进
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.CYCLE_STEP_COMPLETED, { cycleId: input.cycleId, stepNumber: input.stepNumber });

      return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),

  /** 暂停进化周期 */
  pauseCycle: protectedProcedure
    .input(z.object({ cycleId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(evolutionCycles)
          .set({ status: 'paused' })
          .where(eq(evolutionCycles.id, input.cycleId));
        await db.insert(evolutionAuditLogs).values({
          eventType: 'cycle.paused',
          eventSource: 'evolution-flywheel',
          eventData: { cycleId: input.cycleId },
          severity: 'warn',
        });
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** 恢复进化周期 */
  resumeCycle: protectedProcedure
    .input(z.object({ cycleId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(evolutionCycles)
          .set({ status: 'running' })
          .where(eq(evolutionCycles.id, input.cycleId));
        await db.insert(evolutionAuditLogs).values({
          eventType: 'cycle.resumed',
          eventSource: 'evolution-flywheel',
          eventData: { cycleId: input.cycleId },
          severity: 'info',
        });
        return { success: true };
      } catch { return { success: false }; }
    }),

});

// ============================================================================
// 知识结晶路由
// ============================================================================
const crystalRouter = router({
  /** 列出知识结晶 */
  list: publicProcedure
    .input(z.object({
      minConfidence: z.number().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(knowledgeCrystals)
          .orderBy(desc(knowledgeCrystals.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(knowledgeCrystals);
        return { crystals: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { crystals: [], total: 0 }; }
    }),

  /** 获取结晶详情 */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(knowledgeCrystals)
          .where(eq(knowledgeCrystals.id, input.id)).limit(1);
        return { crystal: rows[0] ?? null };
      } catch { return { crystal: null }; }
    }),

  /** 验证结晶 */
  verify: protectedProcedure
    .input(z.object({
      id: z.number(),
      verified: z.boolean(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        if (input.verified) {
          const rows = await db.select().from(knowledgeCrystals).where(eq(knowledgeCrystals.id, input.id)).limit(1);
          if (rows[0]) {
            await db.update(knowledgeCrystals)
              .set({ verificationCount: rows[0].verificationCount + 1, lastVerifiedAt: new Date() })
              .where(eq(knowledgeCrystals.id, input.id));
          }
        }
        return { success: true };
      } catch { return { success: false }; }
    }),
});

// ============================================================================
// FSD 干预/仿真/视频路由（v2.0 新增）
// ============================================================================
const fsdRouter = router({
  /** 列出干预记录 */
  listInterventions: publicProcedure
    .input(z.object({
      modelId: z.string().optional(),
      interventionType: z.enum(['decision_diverge', 'threshold_breach', 'safety_override', 'manual']).optional(),
      minDivergence: z.number().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        // P0 修复：构建动态过滤条件（不再静默忽略输入参数）
        const conditions: any[] = [];
        if (input.modelId) {
          conditions.push(eq(evolutionInterventions.modelId, input.modelId));
        }
        if (input.interventionType) {
          conditions.push(eq(evolutionInterventions.interventionType, input.interventionType));
        }
        if (input.minDivergence !== undefined) {
          conditions.push(gte(evolutionInterventions.divergenceScore, input.minDivergence));
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await db.select().from(evolutionInterventions)
          .where(whereClause)
          .orderBy(desc(evolutionInterventions.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(evolutionInterventions)
          .where(whereClause);
        return { interventions: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { interventions: [], total: 0 }; }
    }),

  /** 获取干预详情 */
  getIntervention: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionInterventions)
          .where(eq(evolutionInterventions.id, input.id)).limit(1);
        // 关联视频轨迹
        let video = null;
        if (rows[0]) {
          const videos = await db.select().from(evolutionVideoTrajectories)
            .where(eq(evolutionVideoTrajectories.interventionId, input.id)).limit(1);
          video = videos[0] ?? null;
        }
        return { intervention: rows[0] ?? null, videoTrajectory: video };
      } catch { return { intervention: null, videoTrajectory: null }; }
    }),

  /** 获取干预率统计 */
  getInterventionRate: publicProcedure
    .input(z.object({
      modelId: z.string().optional(),
      windowHours: z.number().default(24),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const windowStart = new Date(Date.now() - input.windowHours * 3600000);
        const allRows = await db.select().from(evolutionInterventions)
          .where(gte(evolutionInterventions.createdAt, windowStart));

        const totalDecisions = allRows.length;
        const interventions = allRows.filter(r => r.isIntervention === 1).length;
        const rate = totalDecisions > 0 ? interventions / totalDecisions : 0;
        const inverseMileage = totalDecisions > 0 ? Math.round(totalDecisions / Math.max(interventions, 1)) : 9999;

        return {
          rate,
          inverseMileage,
          trend: interventionRateEngine.computeRate(input.windowHours * 3600000).trend,
          trendSlope: interventionRateEngine.computeRate(input.windowHours * 3600000).trendSlope,
          fsdStyle: `1/${inverseMileage}`,
          totalDecisions,
          interventionCount: interventions,
          windowHours: input.windowHours,
        };
      } catch { return { rate: 0, inverseMileage: 9999, trend: 'stable', fsdStyle: '1/9999' }; }
    }),

  /** 列出仿真场景 */
  listSimulations: publicProcedure
    .input(z.object({
      scenarioType: z.enum(['regression', 'stress', 'edge_case', 'adversarial', 'replay']).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard', 'extreme']).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionSimulations)
          .orderBy(desc(evolutionSimulations.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(evolutionSimulations);
        return { simulations: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { simulations: [], total: 0 }; }
    }),

  /** 获取仿真场景详情 */
  getSimulation: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionSimulations)
          .where(eq(evolutionSimulations.id, input.id)).limit(1);
        return { simulation: rows[0] ?? null };
      } catch { return { simulation: null }; }
    }),

  /** 列出视频轨迹 */
  listVideoTrajectories: publicProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionVideoTrajectories)
          .orderBy(desc(evolutionVideoTrajectories.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(evolutionVideoTrajectories);
        return { trajectories: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { trajectories: [], total: 0 }; }
    }),
});

// ============================================================================
// 飞轮调度路由（v2.0 新增）
// ============================================================================
const scheduleRouter = router({
  /** 列出调度配置 */
  list: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionFlywheelSchedules)
          .orderBy(desc(evolutionFlywheelSchedules.createdAt));
        return { schedules: rows };
      } catch { return { schedules: [] }; }
    }),

  /** 创建调度 */
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      cronExpression: z.string(),
      config: z.record(z.string(), z.unknown()),
      minIntervalHours: z.number().default(24),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const result = await db.insert(evolutionFlywheelSchedules).values({
          name: input.name,
          cronExpression: input.cronExpression,
          config: input.config,
          enabled: 1,
          maxConcurrent: 1,
          minIntervalHours: input.minIntervalHours,
        });
        return { scheduleId: Number(result[0].insertId) };
      } catch (err) {
        return { scheduleId: 0, error: String(err) };
      }
    }),

  /** 启用/禁用调度 */
  toggle: protectedProcedure
    .input(z.object({
      id: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(evolutionFlywheelSchedules)
          .set({ enabled: input.enabled ? 1 : 0 })
          .where(eq(evolutionFlywheelSchedules.id, input.id));
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),

  /** 删除调度 */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        // Drizzle ORM 不直接支持 delete，使用 update 标记禁用
        await db.update(evolutionFlywheelSchedules)
          .set({ enabled: 0 })
          .where(eq(evolutionFlywheelSchedules.id, input.id));
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }),
});

// ============================================================================
// 进化领域聚合路由 v2.0
// ============================================================================


// ============================================================================
// 审计日志路由（Phase 2 新增）
// ============================================================================
const auditRouter = router({
  /** 查询审计日志 */
  list: publicProcedure
    .input(z.object({
      eventType: z.string().optional(),
      eventSource: z.string().optional(),
      severity: z.enum(['info', 'warn', 'error', 'critical']).optional(),
      sessionId: z.string().optional(),
      modelId: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const conditions = [];
        if (input.eventType) conditions.push(eq(evolutionAuditLogs.eventType, input.eventType));
        if (input.eventSource) conditions.push(eq(evolutionAuditLogs.eventSource, input.eventSource));
        if (input.severity) conditions.push(eq(evolutionAuditLogs.severity, input.severity));
        if (input.sessionId) conditions.push(eq(evolutionAuditLogs.sessionId, input.sessionId));
        if (input.modelId) conditions.push(eq(evolutionAuditLogs.modelId, input.modelId));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(evolutionAuditLogs)
          .where(where)
          .orderBy(desc(evolutionAuditLogs.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(evolutionAuditLogs).where(where);
        return { logs: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { logs: [], total: 0 }; }
    }),

  /** 按会话查询审计日志 */
  getBySession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionAuditLogs)
          .where(eq(evolutionAuditLogs.sessionId, input.sessionId))
          .orderBy(desc(evolutionAuditLogs.createdAt));
        return { logs: rows };
      } catch { return { logs: [] }; }
    }),
});

// ============================================================================
// Dojo 训练任务路由（Phase 2 新增）
// ============================================================================
const dojoRouter = router({
  /** 查询训练任务列表 */
  list: publicProcedure
    .input(z.object({
      status: z.enum(['pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled']).optional(),
      modelId: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const conditions = [];
        if (input.status) conditions.push(eq(dojoTrainingJobs.status, input.status));
        if (input.modelId) conditions.push(eq(dojoTrainingJobs.modelId, input.modelId));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(dojoTrainingJobs)
          .where(where)
          .orderBy(desc(dojoTrainingJobs.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(dojoTrainingJobs).where(where);
        return { jobs: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { jobs: [], total: 0 }; }
    }),

  /** 获取训练任务详情 */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(dojoTrainingJobs)
          .where(eq(dojoTrainingJobs.id, input.id)).limit(1);
        return { job: rows[0] ?? null };
      } catch { return { job: null }; }
    }),

  /** 取消训练任务 */
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(dojoTrainingJobs)
          .set({ status: 'cancelled', completedAt: new Date() })
          .where(eq(dojoTrainingJobs.id, input.id));
        await db.insert(evolutionAuditLogs).values({
          eventType: 'dojo.job.cancelled',
          eventSource: 'dojo-trainer',
          eventData: { jobId: input.id },
          severity: 'warn',
        });
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** 创建训练任务 */
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      modelId: z.string(),
      priority: z.number().default(5),
      gpuCount: z.number().default(8),
      useSpot: z.boolean().default(true),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const jobId = `dojo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await db.insert(dojoTrainingJobs).values({
          jobId,
          name: input.name,
          modelId: input.modelId,
          status: 'pending',
          priority: input.priority,
          gpuCount: input.gpuCount,
          useSpot: input.useSpot ? 1 : 0,
          config: input.config ?? null,
          idempotencyKey: `idem-${jobId}`,
        });
        await db.insert(evolutionAuditLogs).values({
          eventType: 'dojo.job.created',
          eventSource: 'dojo-trainer',
          eventData: { jobId: Number(result[0].insertId), name: input.name, modelId: input.modelId },
          severity: 'info',
        });
        return { jobId: Number(result[0].insertId) };
      } catch (err) {
        return { jobId: 0, error: String(err) };
      }
    }),

  /** 获取 Dojo 统计概览 */
  getStats: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const [total, running, completed, failed, pending] = await Promise.all([
          db.select({ cnt: count() }).from(dojoTrainingJobs),
          db.select({ cnt: count() }).from(dojoTrainingJobs).where(eq(dojoTrainingJobs.status, 'running')),
          db.select({ cnt: count() }).from(dojoTrainingJobs).where(eq(dojoTrainingJobs.status, 'completed')),
          db.select({ cnt: count() }).from(dojoTrainingJobs).where(eq(dojoTrainingJobs.status, 'failed')),
          db.select({ cnt: count() }).from(dojoTrainingJobs).where(eq(dojoTrainingJobs.status, 'pending')),
        ]);
        return {
          total: total[0]?.cnt ?? 0,
          running: running[0]?.cnt ?? 0,
          completed: completed[0]?.cnt ?? 0,
          failed: failed[0]?.cnt ?? 0,
          pending: pending[0]?.cnt ?? 0,
          totalGpuHours: 0,
        };
      } catch {
        return { total: 0, running: 0, completed: 0, failed: 0, pending: 0, totalGpuHours: 0 };
      }
    }),
});

// ============================================================================
// 引擎配置路由 — 复用 engine_config_registry 表
// ============================================================================
const EVOLUTION_MODULES = [
  'shadowEvaluator', 'interventionRate', 'dualFlywheel', 'e2eAgent',
  'modelMerge', 'autoLabeling', 'dojoScheduler', 'fleetPlanner',
  'otaCanary', 'simulationEngine', 'metaLearner',
] as const;

const configRouter = router({
  /** 列出进化引擎配置项（可按 module 过滤） */
  list: publicProcedure
    .input(z.object({ module: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(engineConfigRegistry)
        .orderBy(asc(engineConfigRegistry.module), asc(engineConfigRegistry.sortOrder));
      const filtered = input?.module
        ? rows.filter(r => r.module === input.module)
        : rows.filter(r => (EVOLUTION_MODULES as readonly string[]).includes(r.module));
      return { items: filtered, source: 'database' };
    }),

  /** 更新配置项值 */
  update: protectedProcedure
    .input(z.object({ id: z.number(), configValue: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(engineConfigRegistry)
          .set({ configValue: input.configValue, updatedAt: new Date() })
          .where(eq(engineConfigRegistry.id, input.id));
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 新增配置项 */
  add: protectedProcedure
    .input(z.object({
      module: z.string(), configGroup: z.string().default('general'),
      configKey: z.string(), configValue: z.string(),
      valueType: z.enum(['number', 'string', 'boolean', 'json']).default('string'),
      label: z.string(), description: z.string().optional(),
      unit: z.string().optional(),
      constraints: z.object({
        min: z.number().optional(), max: z.number().optional(),
        step: z.number().optional(), options: z.array(z.string()).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.insert(engineConfigRegistry).values({
          module: input.module, configGroup: input.configGroup,
          configKey: input.configKey, configValue: input.configValue,
          defaultValue: input.configValue, valueType: input.valueType,
          label: input.label, description: input.description ?? null,
          unit: input.unit ?? null, constraints: input.constraints ?? null,
          isBuiltin: 0,
        });
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 删除配置项（仅非内置项） */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(engineConfigRegistry).where(eq(engineConfigRegistry.id, input.id)).limit(1);
        if (rows.length === 0) return { success: false, error: '配置项不存在' };
        if (rows[0].isBuiltin) return { success: false, error: '内置配置项不可删除' };
        await db.delete(engineConfigRegistry).where(eq(engineConfigRegistry.id, input.id));
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 重置配置项为默认值 */
  reset: protectedProcedure
    .input(z.object({ id: z.number().optional(), module: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        if (input.id) {
          const rows = await db.select().from(engineConfigRegistry).where(eq(engineConfigRegistry.id, input.id)).limit(1);
          if (rows[0]?.defaultValue) {
            await db.update(engineConfigRegistry).set({ configValue: rows[0].defaultValue, updatedAt: new Date() }).where(eq(engineConfigRegistry.id, input.id));
          }
        } else if (input.module) {
          const rows = await db.select().from(engineConfigRegistry).where(eq(engineConfigRegistry.module, input.module));
          for (const row of rows) {
            if (row.defaultValue) {
              await db.update(engineConfigRegistry).set({ configValue: row.defaultValue, updatedAt: new Date() }).where(eq(engineConfigRegistry.id, row.id));
            }
          }
        }
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 批量种子化进化引擎配置 */
  seed: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const existing = await db.select().from(engineConfigRegistry)
        .where(eq(engineConfigRegistry.module, 'shadowEvaluator')).limit(1);
      if (existing.length > 0) return { success: true, message: '种子数据已存在', seeded: 0 };

      const seeds = [
        // shadowEvaluator
        { module: 'shadowEvaluator', configGroup: '数据分片', configKey: 'sliceCount', configValue: '100', valueType: 'number' as const, label: '数据分片数', description: '影子评估数据分片数量', unit: '片', constraints: { min: 10, max: 1000, step: 10 }, sortOrder: 1 },
        { module: 'shadowEvaluator', configGroup: '超时控制', configKey: 'timeoutMs', configValue: '30000', valueType: 'number' as const, label: '超时限制', description: '单次评估超时时间', unit: 'ms', constraints: { min: 5000, max: 300000, step: 1000 }, sortOrder: 2 },
        { module: 'shadowEvaluator', configGroup: '统计检验', configKey: 'mcNemarAlpha', configValue: '0.05', valueType: 'number' as const, label: 'McNemar 显著性水平', description: 'McNemar 检验的 alpha 值', constraints: { min: 0.001, max: 0.2, step: 0.005 }, sortOrder: 3 },
        { module: 'shadowEvaluator', configGroup: '统计检验', configKey: 'monteCarloRuns', configValue: '1000', valueType: 'number' as const, label: '蒙特卡洛模拟次数', description: '蒙特卡洛置换检验运行次数', unit: '次', constraints: { min: 100, max: 10000, step: 100 }, sortOrder: 4 },
        { module: 'shadowEvaluator', configGroup: '统计检验', configKey: 'perturbationMagnitude', configValue: '0.1', valueType: 'number' as const, label: '扰动幅度', description: '鲁棒性测试扰动幅度', constraints: { min: 0.01, max: 1.0, step: 0.01 }, sortOrder: 5 },
        { module: 'shadowEvaluator', configGroup: 'TAS 融合权重', configKey: 'tasWeightMcNemar', configValue: '0.4', valueType: 'number' as const, label: 'McNemar 权重', description: 'TAS 融合中 McNemar 检验权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 6 },
        { module: 'shadowEvaluator', configGroup: 'TAS 融合权重', configKey: 'tasWeightDsFusion', configValue: '0.3', valueType: 'number' as const, label: 'DS 融合权重', description: 'TAS 融合中 DS 融合权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 7 },
        { module: 'shadowEvaluator', configGroup: 'TAS 融合权重', configKey: 'tasWeightMonteCarlo', configValue: '0.3', valueType: 'number' as const, label: '蒙特卡洛权重', description: 'TAS 融合中蒙特卡洛权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 8 },
        { module: 'shadowEvaluator', configGroup: '安全合规', configKey: 'enableSafetyCheck', configValue: 'true', valueType: 'boolean' as const, label: '启用安全合规检查', description: '是否在评估中启用安全合规检查', sortOrder: 9 },
        { module: 'shadowEvaluator', configGroup: '评估参数', configKey: 'datasetSize', configValue: '10000', valueType: 'number' as const, label: '评估数据集大小', description: '影子评估使用的数据集样本数', unit: '条', constraints: { min: 100, max: 1000000, step: 100 }, sortOrder: 10 },
        { module: 'shadowEvaluator', configGroup: '评估参数', configKey: 'evaluationRounds', configValue: '5', valueType: 'number' as const, label: '评估轮次', description: '重复评估轮次以提高统计可靠性', unit: '轮', constraints: { min: 1, max: 50, step: 1 }, sortOrder: 11 },
        { module: 'shadowEvaluator', configGroup: '评估参数', configKey: 'minImprovementPercent', configValue: '2', valueType: 'number' as const, label: '最小改进阈值', description: '挑战者需超过基线的最小改进百分比', unit: '%', constraints: { min: 0.1, max: 50, step: 0.1 }, sortOrder: 12 },
        // interventionRate
        { module: 'interventionRate', configGroup: '告警阈值', configKey: 'alertThreshold', configValue: '0.05', valueType: 'number' as const, label: '告警阈值', description: '干预率超过此值触发告警', constraints: { min: 0.001, max: 0.5, step: 0.001 }, sortOrder: 1 },
        { module: 'interventionRate', configGroup: '告警阈值', configKey: 'criticalThreshold', configValue: '0.1', valueType: 'number' as const, label: '严重告警阈值', description: '干预率超过此值触发严重告警', constraints: { min: 0.01, max: 1.0, step: 0.01 }, sortOrder: 2 },
        { module: 'interventionRate', configGroup: '趋势分析', configKey: 'trendWindowCount', configValue: '10', valueType: 'number' as const, label: '趋势窗口数', description: '趋势计算使用的窗口数量', unit: '个', constraints: { min: 3, max: 50, step: 1 }, sortOrder: 3 },
        { module: 'interventionRate', configGroup: '趋势分析', configKey: 'aggregationGranularityMs', configValue: '60000', valueType: 'number' as const, label: '聚合粒度', description: '干预率聚合计算的时间粒度', unit: 'ms', constraints: { min: 10000, max: 3600000, step: 10000 }, sortOrder: 4 },
        // dualFlywheel
        { module: 'dualFlywheel', configGroup: '执行策略', configKey: 'parallelExecution', configValue: 'true', valueType: 'boolean' as const, label: '并行执行', description: '是否并行执行 Real 和 Sim 飞轮', sortOrder: 1 },
        { module: 'dualFlywheel', configGroup: '阈值', configKey: 'consistencyThreshold', configValue: '0.85', valueType: 'number' as const, label: '一致性阈值', description: '交叉验证一致性阈值', constraints: { min: 0.5, max: 1.0, step: 0.01 }, sortOrder: 2 },
        { module: 'dualFlywheel', configGroup: '阈值', configKey: 'autoPromoteThreshold', configValue: '0.9', valueType: 'number' as const, label: '自动提升阈值', description: '超过此阈值自动提升模型', constraints: { min: 0.5, max: 1.0, step: 0.01 }, sortOrder: 3 },
        { module: 'dualFlywheel', configGroup: '标注', configKey: 'enableAutoLabeling', configValue: 'true', valueType: 'boolean' as const, label: '启用自动标注', description: '是否在飞轮中启用自动标注管线', sortOrder: 4 },
        // e2eAgent
        { module: 'e2eAgent', configGroup: '预测', configKey: 'futureSteps', configValue: '10', valueType: 'number' as const, label: '未来预测步数', description: 'E2E Agent 预测的未来时间步数', unit: '步', constraints: { min: 1, max: 100, step: 1 }, sortOrder: 1 },
        { module: 'e2eAgent', configGroup: '融合', configKey: 'fusionMethod', configValue: 'attention', valueType: 'string' as const, label: '特征融合方法', description: '多模态特征融合策略', constraints: { options: ['early', 'late', 'attention'] }, sortOrder: 2 },
        { module: 'e2eAgent', configGroup: '世界模型', configKey: 'enableWorldModel', configValue: 'true', valueType: 'boolean' as const, label: '启用世界模型', description: '是否启用内部世界模型进行预测', sortOrder: 3 },
        { module: 'e2eAgent', configGroup: '超时', configKey: 'decisionTimeoutMs', configValue: '5000', valueType: 'number' as const, label: '决策超时', description: '单次决策的最大等待时间', unit: 'ms', constraints: { min: 100, max: 60000, step: 100 }, sortOrder: 4 },
        { module: 'e2eAgent', configGroup: '历史', configKey: 'historyWindowSize', configValue: '50', valueType: 'number' as const, label: '历史窗口大小', description: '用于决策的历史数据窗口大小', unit: '帧', constraints: { min: 5, max: 500, step: 5 }, sortOrder: 5 },
        { module: 'e2eAgent', configGroup: '阈值', configKey: 'minConfidence', configValue: '0.7', valueType: 'number' as const, label: '最小置信度', description: '决策输出的最小置信度阈值', constraints: { min: 0.1, max: 1.0, step: 0.05 }, sortOrder: 6 },
        // modelMerge
        { module: 'modelMerge', configGroup: '合并策略', configKey: 'method', configValue: 'slerp', valueType: 'string' as const, label: '合并方法', description: '模型权重合并算法', constraints: { options: ['slerp', 'linear', 'task_arithmetic'] }, sortOrder: 1 },
        { module: 'modelMerge', configGroup: '合并策略', configKey: 'interpolationFactor', configValue: '0.5', valueType: 'number' as const, label: '插值系数', description: '0=完全使用 ModelA, 1=完全使用 ModelB', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 2 },
        // autoLabeling
        { module: 'autoLabeling', configGroup: '质量控制', configKey: 'confidenceThreshold', configValue: '0.85', valueType: 'number' as const, label: '置信度阈值', description: '自动标注结果的最低置信度要求', constraints: { min: 0.5, max: 1.0, step: 0.01 }, sortOrder: 1 },
        { module: 'autoLabeling', configGroup: '批处理', configKey: 'batchSize', configValue: '32', valueType: 'number' as const, label: '批大小', description: '自动标注的批处理大小', unit: '条', constraints: { min: 1, max: 512, step: 1 }, sortOrder: 2 },
        { module: 'autoLabeling', configGroup: '集成', configKey: 'enableEnsemble', configValue: 'true', valueType: 'boolean' as const, label: '启用集成标注', description: '是否使用多模型集成提高标注质量', sortOrder: 3 },
        { module: 'autoLabeling', configGroup: '超时', configKey: 'timeoutMs', configValue: '10000', valueType: 'number' as const, label: '标注超时', description: '单条数据标注的超时时间', unit: 'ms', constraints: { min: 1000, max: 60000, step: 1000 }, sortOrder: 4 },
        { module: 'autoLabeling', configGroup: '质量控制', configKey: 'dimensionConsistencyThreshold', configValue: '0.8', valueType: 'number' as const, label: '维度一致性阈值', description: '特征维度一致性低于此值标记为 uncertain', constraints: { min: 0.3, max: 1.0, step: 0.05 }, sortOrder: 5 },
        { module: 'autoLabeling', configGroup: '时间衰减', configKey: 'recencyHalfLifeMs', configValue: '86400000', valueType: 'number' as const, label: '时间衰减半衰期', description: '数据新鲜度的半衰期', unit: 'ms', constraints: { min: 3600000, max: 604800000, step: 3600000 }, sortOrder: 6 },
        // dojoScheduler
        { module: 'dojoScheduler', configGroup: '碳感知', configKey: 'enableCarbonAware', configValue: 'false', valueType: 'boolean' as const, label: '启用 Carbon-aware 调度', description: '是否根据碳排放强度调度训练任务', sortOrder: 1 },
        { module: 'dojoScheduler', configGroup: '碳感知', configKey: 'carbonThreshold', configValue: '200', valueType: 'number' as const, label: '碳强度阈值', description: '超过此阈值延迟训练任务', unit: 'gCO2/kWh', constraints: { min: 50, max: 1000, step: 10 }, sortOrder: 2 },
        { module: 'dojoScheduler', configGroup: '资源', configKey: 'preferSpot', configValue: 'true', valueType: 'boolean' as const, label: '优先 Spot 实例', description: '是否优先使用 Spot 实例降低成本', sortOrder: 3 },
        { module: 'dojoScheduler', configGroup: '资源', configKey: 'spotDiscount', configValue: '0.7', valueType: 'number' as const, label: 'Spot 折扣率', description: 'Spot 实例相对按需实例的折扣率', constraints: { min: 0.1, max: 1.0, step: 0.05 }, sortOrder: 4 },
        { module: 'dojoScheduler', configGroup: '资源', configKey: 'maxParallelJobs', configValue: '4', valueType: 'number' as const, label: '最大并行任务数', description: '同时运行的最大训练任务数', unit: '个', constraints: { min: 1, max: 32, step: 1 }, sortOrder: 5 },
        { module: 'dojoScheduler', configGroup: '优先级', configKey: 'videoPriorityBoost', configValue: '1.5', valueType: 'number' as const, label: '视频数据优先级加成', description: '视频数据训练任务的优先级倍数', unit: 'x', constraints: { min: 1.0, max: 5.0, step: 0.1 }, sortOrder: 6 },
        { module: 'dojoScheduler', configGroup: '成本', configKey: 'gpuHourlyRate', configValue: '2.5', valueType: 'number' as const, label: 'GPU 单价', description: 'GPU 实例每小时费用', unit: '$/h', constraints: { min: 0.1, max: 50, step: 0.1 }, sortOrder: 7 },
        // fleetPlanner
        { module: 'fleetPlanner', configGroup: '评分权重', configKey: 'accuracyWeight', configValue: '0.4', valueType: 'number' as const, label: '准确率权重', description: '车队评分中准确率的权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 1 },
        { module: 'fleetPlanner', configGroup: '评分权重', configKey: 'interventionWeight', configValue: '0.3', valueType: 'number' as const, label: '干预率权重', description: '车队评分中干预率的权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 2 },
        { module: 'fleetPlanner', configGroup: '评分权重', configKey: 'efficiencyWeight', configValue: '0.15', valueType: 'number' as const, label: '效率权重', description: '车队评分中效率的权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 3 },
        { module: 'fleetPlanner', configGroup: '评分权重', configKey: 'stabilityWeight', configValue: '0.15', valueType: 'number' as const, label: '稳定性权重', description: '车队评分中稳定性的权重', constraints: { min: 0, max: 1, step: 0.05 }, sortOrder: 4 },
        { module: 'fleetPlanner', configGroup: '阈值', configKey: 'minAccuracyThreshold', configValue: '0.85', valueType: 'number' as const, label: '最小准确率阈值', description: '车队最低准确率要求', constraints: { min: 0.5, max: 1.0, step: 0.01 }, sortOrder: 5 },
        { module: 'fleetPlanner', configGroup: '阈值', configKey: 'maxInterventionThreshold', configValue: '0.02', valueType: 'number' as const, label: '最大干预率阈值', description: '车队最大可接受干预率', constraints: { min: 0.001, max: 0.1, step: 0.001 }, sortOrder: 6 },
        { module: 'fleetPlanner', configGroup: '自适应', configKey: 'enableAdaptiveWeights', configValue: 'false', valueType: 'boolean' as const, label: '启用自适应权重', description: '是否根据历史数据自动调整评分权重', sortOrder: 7 },
        // otaCanary
        { module: 'otaCanary', configGroup: '告警', configKey: 'maxActiveAlerts', configValue: '0', valueType: 'number' as const, label: '最大活跃告警数', description: '允许的最大活跃告警数（0=零容忍）', unit: '个', constraints: { min: 0, max: 10, step: 1 }, sortOrder: 1 },
        { module: 'otaCanary', configGroup: 'Shadow 阶段', configKey: 'shadowTrafficPercent', configValue: '0', valueType: 'number' as const, label: 'Shadow 流量比例', description: 'Shadow 阶段的流量百分比', unit: '%', constraints: { min: 0, max: 100, step: 1 }, sortOrder: 2 },
        { module: 'otaCanary', configGroup: 'Shadow 阶段', configKey: 'shadowMinDurationH', configValue: '24', valueType: 'number' as const, label: 'Shadow 最小持续时间', description: 'Shadow 阶段最短运行时间', unit: 'h', constraints: { min: 1, max: 168, step: 1 }, sortOrder: 3 },
        { module: 'otaCanary', configGroup: 'Canary 阶段', configKey: 'canaryTrafficPercent', configValue: '5', valueType: 'number' as const, label: 'Canary 流量比例', description: 'Canary 阶段的流量百分比', unit: '%', constraints: { min: 1, max: 20, step: 1 }, sortOrder: 4 },
        { module: 'otaCanary', configGroup: 'Canary 阶段', configKey: 'canaryMinDurationH', configValue: '48', valueType: 'number' as const, label: 'Canary 最小持续时间', description: 'Canary 阶段最短运行时间', unit: 'h', constraints: { min: 1, max: 336, step: 1 }, sortOrder: 5 },
        { module: 'otaCanary', configGroup: 'Gray 阶段', configKey: 'grayTrafficPercent', configValue: '20', valueType: 'number' as const, label: 'Gray 流量比例', description: 'Gray 阶段的流量百分比', unit: '%', constraints: { min: 10, max: 50, step: 5 }, sortOrder: 6 },
        { module: 'otaCanary', configGroup: 'Gray 阶段', configKey: 'grayMinDurationH', configValue: '72', valueType: 'number' as const, label: 'Gray 最小持续时间', description: 'Gray 阶段最短运行时间', unit: 'h', constraints: { min: 1, max: 336, step: 1 }, sortOrder: 7 },
        { module: 'otaCanary', configGroup: 'Half 阶段', configKey: 'halfTrafficPercent', configValue: '50', valueType: 'number' as const, label: 'Half 流量比例', description: 'Half 阶段的流量百分比', unit: '%', constraints: { min: 30, max: 80, step: 5 }, sortOrder: 8 },
        { module: 'otaCanary', configGroup: 'Full 阶段', configKey: 'fullTrafficPercent', configValue: '100', valueType: 'number' as const, label: 'Full 流量比例', description: '全量发布的流量百分比', unit: '%', constraints: { min: 100, max: 100 }, sortOrder: 9 },
        { module: 'otaCanary', configGroup: '健康检查', configKey: 'healthCheckIntervalMs', configValue: '3600000', valueType: 'number' as const, label: '健康检查间隔', description: '默认健康检查间隔时间', unit: 'ms', constraints: { min: 60000, max: 86400000, step: 60000 }, sortOrder: 10 },
        // simulationEngine
        { module: 'simulationEngine', configGroup: '仿真参数', configKey: 'variationsPerIntervention', configValue: '5', valueType: 'number' as const, label: '每次干预变体数', description: '每次干预生成的仿真变体数量', unit: '个', constraints: { min: 1, max: 50, step: 1 }, sortOrder: 1 },
        { module: 'simulationEngine', configGroup: '仿真参数', configKey: 'maxNoiseLevel', configValue: '0.5', valueType: 'number' as const, label: '最大噪声水平', description: '仿真中注入的最大噪声水平', constraints: { min: 0.01, max: 2.0, step: 0.01 }, sortOrder: 2 },
        { module: 'simulationEngine', configGroup: '资源', configKey: 'parallelism', configValue: '4', valueType: 'number' as const, label: '并行度', description: '仿真引擎的并行执行数', unit: '线程', constraints: { min: 1, max: 32, step: 1 }, sortOrder: 3 },
        { module: 'simulationEngine', configGroup: '阈值', configKey: 'passThreshold', configValue: '0.1', valueType: 'number' as const, label: '通过阈值', description: '仿真结果与期望输出的最大允许偏差', constraints: { min: 0.01, max: 1.0, step: 0.01 }, sortOrder: 4 },
        // metaLearner
        { module: 'metaLearner', configGroup: '探索', configKey: 'explorationRate', configValue: '0.1', valueType: 'number' as const, label: '探索率', description: '元学习器的探索-利用平衡参数', constraints: { min: 0.01, max: 1.0, step: 0.01 }, sortOrder: 1 },
        { module: 'metaLearner', configGroup: '评估', configKey: 'evaluationWindowSize', configValue: '100', valueType: 'number' as const, label: '评估窗口大小', description: '用于评估策略效果的样本窗口大小', unit: '条', constraints: { min: 10, max: 1000, step: 10 }, sortOrder: 2 },
        { module: 'metaLearner', configGroup: '阈值', configKey: 'minImprovementThreshold', configValue: '0.02', valueType: 'number' as const, label: '最小改进阈值', description: '策略切换所需的最小改进幅度', constraints: { min: 0.001, max: 0.5, step: 0.001 }, sortOrder: 3 },
        { module: 'metaLearner', configGroup: '记忆', configKey: 'memoryCapacity', configValue: '10000', valueType: 'number' as const, label: '记忆容量', description: '元学习器经验回放缓冲区大小', unit: '条', constraints: { min: 100, max: 100000, step: 100 }, sortOrder: 4 },
      ];

      let seeded = 0;
      for (const s of seeds) {
        try {
          await db.insert(engineConfigRegistry).values({
            module: s.module, configGroup: s.configGroup,
            configKey: s.configKey, configValue: s.configValue,
            defaultValue: s.configValue, valueType: s.valueType,
            label: s.label, description: s.description,
            unit: s.unit ?? null, constraints: s.constraints ?? null,
            sortOrder: s.sortOrder, isBuiltin: 1,
          });
          seeded++;
        } catch { /* ignore duplicates */ }
      }
      return { success: true, message: `已种子化 ${seeded} 个配置项`, seeded };
    }),
});

export const evolutionDomainRouter = router({
  shadowEval: shadowEvalRouter,
  championChallenger: championChallengerRouter,
  canary: canaryRouter,
  dataEngine: dataEngineRouter,
  cycle: cycleRouter,
  crystal: crystalRouter,
  fsd: fsdRouter,
  schedule: scheduleRouter,
  config: configRouter,
  audit: auditRouter,
  dojo: dojoRouter,
  observability: observabilityRouter,
  selfHealing: selfHealingRouter,
  deepAI: deepAIRouter,

  // ========== 前端仪表盘 Facade 方法（CognitiveDashboard 页面使用） ==========

  /** 获取飞轮状态（进化循环概览） */
  getFlywheelStatus: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return {
          currentCycle: null as string | null,
          status: 'idle' as 'idle' | 'discovering' | 'hypothesizing' | 'evaluating' | 'deploying' | 'crystallizing',
          totalCycles: 0,
          totalImprovements: 0,
          lastCycleAt: null as string | null,
          crystalCount: 0,
        };
      }

      try {
        const latestCycle = await db.select().from(evolutionCycles)
          .orderBy(desc(evolutionCycles.startedAt))
          .limit(1);

        const totalCycleRows = await db.select({ cnt: count() }).from(evolutionCycles);
        const totalCycles = totalCycleRows[0]?.cnt ?? 0;

        const crystalRows = await db.select({ cnt: count() }).from(knowledgeCrystals);
        const crystalCount = crystalRows[0]?.cnt ?? 0;

        const appliedRows = await db.select({ cnt: count() }).from(knowledgeCrystals)
          .where(gte(knowledgeCrystals.verificationCount, 1));
        const totalImprovements = appliedRows[0]?.cnt ?? 0;

        const current = latestCycle[0];
        return {
          currentCycle: current ? String(current.id) : null,
          status: (current?.status === 'running' ? 'evaluating' : current?.status === 'completed' ? 'crystallizing' : 'idle') as 'idle' | 'discovering' | 'hypothesizing' | 'evaluating' | 'deploying' | 'crystallizing',
          totalCycles,
          totalImprovements,
          lastCycleAt: current?.startedAt?.toISOString() ?? null,
          crystalCount,
        };
      } catch {
        return {
          currentCycle: null,
          status: 'idle' as const,
          totalCycles: 0,
          totalImprovements: 0,
          lastCycleAt: null,
          crystalCount: 0,
        };
      }
    }),

  /** 获取进化引擎综合概览（v2.0 新增） */
  getOverview: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });

      try {
        const [cycles, experiments, deployments, interventions, simulations, crystals, schedules] = await Promise.all([
          db.select({ cnt: count() }).from(evolutionCycles),
          db.select({ cnt: count() }).from(championChallengerExperiments),
          db.select({ cnt: count() }).from(canaryDeployments).where(eq(canaryDeployments.status, 'active')),
          db.select({ cnt: count() }).from(evolutionInterventions),
          db.select({ cnt: count() }).from(evolutionSimulations),
          db.select({ cnt: count() }).from(knowledgeCrystals),
          db.select({ cnt: count() }).from(evolutionFlywheelSchedules).where(eq(evolutionFlywheelSchedules.enabled, 1)),
        ]);

        const totalInt = interventions[0]?.cnt ?? 0;
        const intRows = await db.select({ cnt: count() }).from(evolutionInterventions)
          .where(eq(evolutionInterventions.isIntervention, 1));
        const intCount = intRows[0]?.cnt ?? 0;

        return {
          totalCycles: cycles[0]?.cnt ?? 0,
          activeCycles: 0,
          totalExperiments: experiments[0]?.cnt ?? 0,
          activeDeployments: deployments[0]?.cnt ?? 0,
          totalInterventions: totalInt,
          interventionRate: totalInt > 0 ? intCount / totalInt : 0,
          totalSimulations: simulations[0]?.cnt ?? 0,
          totalCrystals: crystals[0]?.cnt ?? 0,
          activeSchedules: schedules[0]?.cnt ?? 0,
        };
      } catch {
        return {
          totalCycles: 0, activeCycles: 0,
          totalExperiments: 0, activeDeployments: 0,
          totalInterventions: 0, interventionRate: 0,
          totalSimulations: 0, totalCrystals: 0,
          activeSchedules: 0,
        };
      }
    }),
});
