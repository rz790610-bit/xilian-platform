/**
 * 图查询优化路由器 - 提供图查询管理 API
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { graphQueryOptimizer } from './graphQueryOptimizer';

export const graphQueryRouter = router({
  // 获取图查询优化器状态
  getStats: protectedProcedure.query(() => {
    return graphQueryOptimizer.getStats();
  }),

  // 获取索引列表
  listIndexes: protectedProcedure.query(() => {
    return graphQueryOptimizer.getIndexes();
  }),

  // 创建索引
  createIndex: protectedProcedure
    .input(z.object({
      tagName: z.string(),
      indexName: z.string(),
      fields: z.array(z.string()),
      indexType: z.enum(['tag', 'edge']),
    }))
    .mutation(async ({ input }) => {
      return await graphQueryOptimizer.createIndex(input);
    }),

  // 删除索引
  dropIndex: protectedProcedure
    .input(z.object({ indexName: z.string() }))
    .mutation(async ({ input }) => {
      const success = await graphQueryOptimizer.dropIndex(input.indexName);
      return { success };
    }),

  // 分析查询
  analyzeQuery: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ input }) => {
      return graphQueryOptimizer.optimizeQuery(input.query);
    }),

  // 执行优化查询
  executeQuery: protectedProcedure
    .input(z.object({
      query: z.string(),
      useCache: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return await graphQueryOptimizer.executeOptimized(input.query, input.useCache);
    }),
});

export type GraphQueryRouter = typeof graphQueryRouter;
