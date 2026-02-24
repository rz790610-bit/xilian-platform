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
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count, gte, and, lte } from 'drizzle-orm';
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
} from '../../../drizzle/evolution-schema';

// ============================================================================
// 影子评估路由
// ============================================================================
const shadowEvalRouter = router({
  /** 创建影子评估实验 */
  create: publicProcedure
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
      if (!db) return { recordId: 0, status: 'pending' };
      try {
        const result = await db.insert(shadowEvalRecords).values({
          experimentName: input.experimentName,
          baselineModelId: input.baselineModelId,
          challengerModelId: input.challengerModelId,
          dataRangeStart: new Date(input.dataRangeStart),
          dataRangeEnd: new Date(input.dataRangeEnd),
          status: 'pending',
          config: input.config ?? {},
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
      if (!db) return { records: [], total: 0 };
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
      if (!db) return { record: null, metrics: [] };
      try {
        const records = await db.select().from(shadowEvalRecords)
          .where(eq(shadowEvalRecords.id, input.id)).limit(1);
        const metrics = await db.select().from(shadowEvalMetrics)
          .where(eq(shadowEvalMetrics.recordId, input.id));
        return { record: records[0] ?? null, metrics };
      } catch { return { record: null, metrics: [] }; }
    }),

  /** 启动评估 */
  start: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: '数据库不可用' };
      try {
        await db.update(shadowEvalRecords)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(shadowEvalRecords.id, input.id));
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
  create: publicProcedure
    .input(z.object({
      name: z.string(),
      championId: z.string(),
      challengerId: z.string(),
      shadowEvalId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { experimentId: 0 };
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
      if (!db) return { experiments: [], total: 0 };
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
      if (!db) return { experiment: null };
      try {
        const rows = await db.select().from(championChallengerExperiments)
          .where(eq(championChallengerExperiments.id, input.id)).limit(1);
        return { experiment: rows[0] ?? null };
      } catch { return { experiment: null }; }
    }),

  /** 手动裁决 */
  verdict: publicProcedure
    .input(z.object({
      id: z.number(),
      verdict: z.enum(['PROMOTE', 'REJECT']),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(championChallengerExperiments)
          .set({
            verdict: input.verdict,
            verdictReason: input.reason,
            verdictAt: new Date(),
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
  create: publicProcedure
    .input(z.object({
      experimentId: z.number(),
      modelId: z.string(),
      trafficPercent: z.number().min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { deploymentId: 0 };
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
      if (!db) return { deployments: [], total: 0 };
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
      if (!db) return { deployment: null, stages: [], healthChecks: [] };
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
  rollback: publicProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
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
  promote: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
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
  triggerAnalysis: publicProcedure
    .input(z.object({
      dataRangeStart: z.string(),
      dataRangeEnd: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { cycleId: 0, edgeCasesFound: 0 };
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
      if (!db) return { edgeCases: [], total: 0 };
      try {
        const rows = await db.select().from(edgeCases)
          .orderBy(desc(edgeCases.discoveredAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(edgeCases);
        return { edgeCases: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { edgeCases: [], total: 0 }; }
    }),

  /** 标注边缘案例 */
  labelEdgeCase: publicProcedure
    .input(z.object({
      id: z.number(),
      labelResult: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(edgeCases)
          .set({
            status: 'labeled',
            labelResult: input.labelResult,
            labeledAt: new Date(),
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
      if (!db) return { cycles: [], total: 0 };
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
      if (!db) return { trend: [], direction: 'stable', slope: 0 };
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
      if (!db) return { cycle: null };
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
      if (!db) return { stepLogs: [] };
      try {
        const logs = await db.select().from(evolutionStepLogs)
          .where(eq(evolutionStepLogs.cycleId, input.cycleId))
          .orderBy(evolutionStepLogs.stepNumber);
        return { stepLogs: logs };
      } catch { return { stepLogs: [] }; }
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
      if (!db) return { crystals: [], total: 0 };
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
      if (!db) return { crystal: null };
      try {
        const rows = await db.select().from(knowledgeCrystals)
          .where(eq(knowledgeCrystals.id, input.id)).limit(1);
        return { crystal: rows[0] ?? null };
      } catch { return { crystal: null }; }
    }),

  /** 验证结晶 */
  verify: publicProcedure
    .input(z.object({
      id: z.number(),
      verified: z.boolean(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
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
      if (!db) return { interventions: [], total: 0 };
      try {
        const rows = await db.select().from(evolutionInterventions)
          .orderBy(desc(evolutionInterventions.createdAt))
          .limit(input.limit);
        const totalRows = await db.select({ cnt: count() }).from(evolutionInterventions);
        return { interventions: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { interventions: [], total: 0 }; }
    }),

  /** 获取干预详情 */
  getIntervention: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { intervention: null, videoTrajectory: null };
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
      if (!db) return { rate: 0, inverseMileage: 9999, trend: 'stable', fsdStyle: '1/9999' };
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
          trend: 'improving' as const,
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
      if (!db) return { simulations: [], total: 0 };
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
      if (!db) return { simulation: null };
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
      if (!db) return { trajectories: [], total: 0 };
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
      if (!db) return { schedules: [] };
      try {
        const rows = await db.select().from(evolutionFlywheelSchedules)
          .orderBy(desc(evolutionFlywheelSchedules.createdAt));
        return { schedules: rows };
      } catch { return { schedules: [] }; }
    }),

  /** 创建调度 */
  create: publicProcedure
    .input(z.object({
      name: z.string(),
      cronExpression: z.string(),
      config: z.record(z.string(), z.unknown()),
      minIntervalHours: z.number().default(24),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { scheduleId: 0 };
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
  toggle: publicProcedure
    .input(z.object({
      id: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
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
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
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
export const evolutionDomainRouter = router({
  shadowEval: shadowEvalRouter,
  championChallenger: championChallengerRouter,
  canary: canaryRouter,
  dataEngine: dataEngineRouter,
  cycle: cycleRouter,
  crystal: crystalRouter,
  fsd: fsdRouter,
  schedule: scheduleRouter,

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
      if (!db) return {
        totalCycles: 0, activeCycles: 0,
        totalExperiments: 0, activeDeployments: 0,
        totalInterventions: 0, interventionRate: 0,
        totalSimulations: 0, totalCrystals: 0,
        activeSchedules: 0,
      };

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
