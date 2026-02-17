/**
 * 工况归一化 tRPC 路由
 *
 * 端点：
 * 1. processSlice   — 处理单个数据片段（识别→归一化→状态判定）
 * 2. processBatch   — 批量处理
 * 3. learnBaseline  — 从历史数据学习基线
 * 4. getBaselines   — 获取当前基线
 * 5. loadBaselines  — 导入基线
 * 6. getConfig      — 获取配置
 * 7. updateConfig   — 更新配置
 * 8. updateThreshold — 更新自适应阈值
 * 9. getConditions  — 获取工况定义
 * 10. addCondition  — 添加工况
 * 11. removeCondition — 删除工况
 * 12. getHistory    — 获取处理历史
 */

import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
import { getEngine } from '../services/conditionNormalizer.service';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('conditionNormalizerRouter');

export const conditionNormalizerRouter = router({
  /**
   * 处理单个数据片段
   */
  processSlice: publicProcedure
    .input(z.object({
      dataSlice: z.record(z.string(), z.any()),
      method: z.enum(['ratio', 'zscore']).optional().default('ratio'),
      overrides: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      log.info({ method: input.method }, 'Processing data slice');
      const engine = getEngine();
      const result = engine.processSlice(input.dataSlice, input.method, input.overrides);
      return { success: true, data: result };
    }),

  /**
   * 批量处理
   */
  processBatch: publicProcedure
    .input(z.object({
      dataSlices: z.array(z.record(z.string(), z.any())),
      method: z.enum(['ratio', 'zscore']).optional().default('ratio'),
    }))
    .mutation(async ({ input }) => {
      log.info({ count: input.dataSlices.length }, 'Batch processing slices');
      const engine = getEngine();
      const results = engine.processBatch(input.dataSlices, input.method);
      return { success: true, data: results, count: results.length };
    }),

  /**
   * 从历史数据学习基线
   */
  learnBaseline: publicProcedure
    .input(z.object({
      historicalData: z.array(z.record(z.string(), z.any())),
      targetCondition: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      log.info({ count: input.historicalData.length }, 'Learning baseline from samples');
      const engine = getEngine();
      const results = engine.learnFromHistoricalData(input.historicalData, input.targetCondition);
      return { success: true, data: results, count: results.length };
    }),

  /**
   * 获取当前基线
   */
  getBaselines: publicProcedure.query(() => {
    const engine = getEngine();
    return { success: true, data: engine.getBaselines() };
  }),

  /**
   * 导入基线
   */
  loadBaselines: publicProcedure
    .input(z.object({
      baselines: z.record(z.string(), z.record(z.string(), z.object({
        mean: z.number(),
        std: z.number(),
        p5: z.number(),
        p95: z.number(),
      }))),
    }))
    .mutation(async ({ input }) => {
      log.info('Loading baselines');
      const engine = getEngine();
      engine.loadBaselines(input.baselines);
      return { success: true, message: 'Baselines loaded' };
    }),

  /**
   * 导出基线
   */
  exportBaselines: publicProcedure.query(() => {
    const engine = getEngine();
    return { success: true, data: engine.exportBaselines() };
  }),

  /**
   * 获取配置
   */
  getConfig: publicProcedure.query(() => {
    const engine = getEngine();
    return { success: true, data: engine.getConfigSnapshot() };
  }),

  /**
   * 更新配置
   */
  updateConfig: publicProcedure
    .input(z.object({
      overrides: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      log.info('Updating config');
      const engine = getEngine();
      const config = engine.updateConfig(input.overrides);
      return { success: true, data: config };
    }),

  /**
   * 更新自适应阈值
   */
  updateThreshold: publicProcedure
    .input(z.object({
      condition: z.string(),
      featureName: z.string(),
      thresholds: z.object({
        normal: z.tuple([z.number(), z.number()]),
        warning: z.tuple([z.number(), z.number()]),
        danger: z.tuple([z.number(), z.number()]),
      }),
    }))
    .mutation(async ({ input }) => {
      log.info({ condition: input.condition, feature: input.featureName }, 'Updating threshold');
      const engine = getEngine();
      engine.updateThreshold(input.condition, input.featureName, input.thresholds);
      return { success: true, message: 'Threshold updated' };
    }),

  /**
   * 获取工况定义
   */
  getConditions: publicProcedure.query(() => {
    const engine = getEngine();
    return { success: true, data: engine.getConditions() };
  }),

  /**
   * 添加工况
   */
  addCondition: publicProcedure
    .input(z.object({
      id: z.string().min(1),
      description: z.string(),
      keyFeatures: z.string(),
      typicalDuration: z.string(),
      plcCode: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      log.info({ id: input.id }, 'Adding condition');
      const engine = getEngine();
      engine.addCondition(
        input.id,
        { description: input.description, keyFeatures: input.keyFeatures, typicalDuration: input.typicalDuration },
        input.plcCode
      );
      return { success: true, message: `Condition ${input.id} added` };
    }),

  /**
   * 删除工况
   */
  removeCondition: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      log.info({ id: input.id }, 'Removing condition');
      const engine = getEngine();
      const removed = engine.removeCondition(input.id);
      return { success: removed, message: removed ? `Condition ${input.id} removed` : 'Condition not found' };
    }),

  /**
   * 获取处理历史
   */
  getHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional().default(50) }))
    .query(({ input }) => {
      const engine = getEngine();
      return { success: true, data: engine.getHistory(input.limit) };
    }),

  /**
   * 清除历史
   */
  clearHistory: publicProcedure.mutation(async () => {
    const engine = getEngine();
    engine.clearHistory();
    return { success: true, message: 'History cleared' };
  }),

  /**
   * 获取阈值配置
   */
  getThresholds: publicProcedure.query(() => {
    const engine = getEngine();
    return { success: true, data: engine.getThresholds() };
  }),
});
