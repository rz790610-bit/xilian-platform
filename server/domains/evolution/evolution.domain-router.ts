/**
 * ============================================================================
 * 进化领域路由聚合 — ④进化闭环
 * ============================================================================
 * 职责边界：影子评估 + 冠军挑战 + 金丝雀发布 + 数据引擎 + 进化周期 + 知识结晶
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count, gte } from 'drizzle-orm';
import {
  shadowEvalRecords,
  shadowEvalMetrics,
  championChallengerExperiments,
  canaryDeployments,
  edgeCases,
  evolutionCycles,
  knowledgeCrystals,
} from '../../../drizzle/evolution-schema';

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
      return { recordId: 0, status: 'pending' };
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
  start: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return { success: true };
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
      return { experimentId: 0 };
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
  verdict: protectedProcedure
    .input(z.object({
      id: z.number(),
      verdict: z.enum(['PROMOTE', 'REJECT']),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      return { success: true };
    }),
});

// ============================================================================
// 金丝雀发布路由
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
      return { deploymentId: 0 };
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

  /** 回滚金丝雀 */
  rollback: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      return { success: true };
    }),

  /** 提升为全量 */
  promote: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return { success: true };
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
      return { cycleId: 0, edgeCasesFound: 0 };
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
  labelEdgeCase: protectedProcedure
    .input(z.object({
      id: z.number(),
      labelResult: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      return { success: true };
    }),
});

// ============================================================================
// 进化周期路由
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

  /** 获取进化趋势 */
  getTrend: publicProcedure
    .input(z.object({ weeks: z.number().default(12) }))
    .query(async ({ input }) => {
      return { trend: [] };
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
  verify: protectedProcedure
    .input(z.object({
      id: z.number(),
      verified: z.boolean(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        // knowledgeCrystals has no 'status' field; use verificationCount as proxy
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
// 进化领域聚合路由
// ============================================================================

export const evolutionDomainRouter = router({
  shadowEval: shadowEvalRouter,
  championChallenger: championChallengerRouter,
  canary: canaryRouter,
  dataEngine: dataEngineRouter,
  cycle: cycleRouter,
  crystal: crystalRouter,

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
        // 获取最新进化周期
        const latestCycle = await db.select().from(evolutionCycles)
          .orderBy(desc(evolutionCycles.startedAt))
          .limit(1);

        // 统计总周期数
        const totalCycleRows = await db.select({ cnt: count() }).from(evolutionCycles);
        const totalCycles = totalCycleRows[0]?.cnt ?? 0;

        // 统计知识结晶数
        const crystalRows = await db.select({ cnt: count() }).from(knowledgeCrystals);
        const crystalCount = crystalRows[0]?.cnt ?? 0;

        // 统计已应用的结晶数（= 改进数）
        // knowledgeCrystals has no 'status' field; use verificationCount > 0 as 'applied' proxy
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
});
