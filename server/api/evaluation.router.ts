/**
 * ============================================================================
 * P2-10 评估与组合优化体系 — tRPC 路由
 * ============================================================================
 *
 * 子路由：
 *   - dashboard: 仪表盘聚合数据
 *   - modules:   模块四维评分
 *   - business:  业务 KPI
 *   - combination: 算法组合推荐
 *   - config:    评估配置
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { createModuleLogger } from '../core/logger';
import {
  getEvaluationDashboard,
  getModuleEvaluator,
  getBusinessEvaluator,
  getCombinationOptimizer,
  getEvaluationConfig,
} from '../platform/evaluation';
import { portEquipmentTypeSchema } from '../../shared/contracts/schemas';

const log = createModuleLogger('evaluationRouter');

// ============================================================
// Zod Schemas
// ============================================================

const combinationConstraintsSchema = z.object({
  deviceType: portEquipmentTypeSchema,
  dataQualityGrade: z.enum(['A', 'B', 'C', 'D', 'F']),
  latencyRequirement: z.enum(['realtime', 'near-realtime', 'batch']),
  allowedCategories: z.array(z.string()).optional(),
  requiredAlgorithms: z.array(z.string()).optional(),
  maxAlgorithmsPerCombination: z.number().min(2).max(10).optional(),
});

const evaluationTriggerSchema = z.enum(['scheduled', 'event_driven', 'manual']);

const businessOptionsSchema = z.object({
  deviceType: portEquipmentTypeSchema.optional(),
  deviceCode: z.string().optional(),
  windowMs: z.number().positive().optional(),
});

// ============================================================
// 子路由：仪表盘
// ============================================================

const dashboardRouter = router({
  /** 获取完整仪表盘数据（含趋势/排行/组合推荐/退步告警/KPI） */
  getData: publicProcedure.query(async () => {
    log.info('获取评估仪表盘数据');
    const dashboard = getEvaluationDashboard();
    return dashboard.getDashboardData();
  }),
});

// ============================================================
// 子路由：模块评估
// ============================================================

const modulesRouter = router({
  /** 触发全量评估 */
  evaluateAll: protectedProcedure
    .input(z.object({ trigger: evaluationTriggerSchema.default('manual') }))
    .mutation(async ({ input }) => {
      log.info({ trigger: input.trigger }, '触发全量模块评估');
      const evaluator = getModuleEvaluator();
      return evaluator.evaluateAll(input.trigger);
    }),

  /** 获取最新评分卡 */
  getLatest: publicProcedure.query(() => {
    const evaluator = getModuleEvaluator();
    return evaluator.getLatestScorecards();
  }),

  /** 获取退步模块 */
  getRegressing: publicProcedure.query(() => {
    const evaluator = getModuleEvaluator();
    return evaluator.getRegressingModules();
  }),

  /** 获取单模块评分历史 */
  getHistory: publicProcedure
    .input(z.object({ moduleId: z.string().optional() }))
    .query(({ input }) => {
      const evaluator = getModuleEvaluator();
      const historyMap = evaluator.getScorecardHistory(input.moduleId);
      // Map → 普通对象，方便序列化
      const result: Record<string, any[]> = {};
      for (const [k, v] of historyMap) {
        result[k] = v;
      }
      return result;
    }),
});

// ============================================================
// 子路由：业务 KPI
// ============================================================

const businessRouter = router({
  /** 计算业务 KPI */
  computeKPIs: publicProcedure
    .input(businessOptionsSchema.optional())
    .query(async ({ input }) => {
      log.info('计算业务 KPI');
      const evaluator = getBusinessEvaluator();
      return evaluator.computeKPIs(input ?? undefined);
    }),
});

// ============================================================
// 子路由：组合优化
// ============================================================

const combinationRouter = router({
  /** 推荐最优算法组合 */
  optimize: protectedProcedure
    .input(combinationConstraintsSchema)
    .mutation(async ({ input }) => {
      log.info({ deviceType: input.deviceType, grade: input.dataQualityGrade }, '算法组合优化');
      const optimizer = getCombinationOptimizer();
      return optimizer.optimize(input);
    }),
});

// ============================================================
// 主路由
// ============================================================

export const evaluationRouter = router({
  dashboard: dashboardRouter,
  modules: modulesRouter,
  business: businessRouter,
  combination: combinationRouter,

  /** 获取评估配置 */
  getConfig: publicProcedure.query(() => {
    return getEvaluationConfig();
  }),
});
