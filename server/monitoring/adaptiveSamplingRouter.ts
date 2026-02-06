/**
 * 自适应采样路由器 - 提供采样配置管理 API
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { deviceSamplingConfig, systemCapacityMetrics } from '../../drizzle/schema';
import { eq, desc, count } from 'drizzle-orm';
import { adaptiveSamplingService } from './adaptiveSamplingService';

export const adaptiveSamplingRouter = router({
  // 获取采样服务状态
  getStatus: protectedProcedure.query(() => {
    return adaptiveSamplingService.getMetrics();
  }),

  // 获取采样配置列表
  listConfigs: protectedProcedure.query(async () => {
    return await adaptiveSamplingService.getSamplingConfigs();
  }),

  // 更新采样配置
  updateConfig: protectedProcedure
    .input(z.object({
      id: z.number(),
      baseSamplingRateMs: z.number().optional(),
      minSamplingRateMs: z.number().optional(),
      maxSamplingRateMs: z.number().optional(),
      adaptiveEnabled: z.boolean().optional(),
      priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const { id, ...updates } = input;
      await db.update(deviceSamplingConfig)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(deviceSamplingConfig.id, id));

      return { success: true };
    }),

  // 获取容量指标历史
  getCapacityHistory: protectedProcedure
    .input(z.object({
      metricType: z.enum(['kafka_lag', 'db_connections', 'memory_usage', 'cpu_usage', 'queue_depth']).optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.metricType) {
        conditions.push(eq(systemCapacityMetrics.metricType, input.metricType));
      }

      return await db.select()
        .from(systemCapacityMetrics)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(systemCapacityMetrics.createdAt))
        .limit(input.limit);
    }),

  // 获取阈值配置
  getThresholds: protectedProcedure.query(() => {
    return adaptiveSamplingService.getThresholds();
  }),

  // 更新阈值配置
  updateThreshold: protectedProcedure
    .input(z.object({
      key: z.string(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
      scaleUpFactor: z.number().optional(),
      scaleDownFactor: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { key, ...config } = input;
      adaptiveSamplingService.updateThresholds(key, config);
      return { success: true };
    }),
});

export type AdaptiveSamplingRouter = typeof adaptiveSamplingRouter;
