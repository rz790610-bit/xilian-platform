/**
 * 去重服务路由器 - 提供去重和幂等性管理 API
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { processedEvents, idempotentRecords } from '../../drizzle/schema';
import { desc, count, eq } from 'drizzle-orm';
import { deduplicationService } from './deduplicationService';

export const deduplicationRouter = router({
  // 获取去重服务状态
  getStatus: protectedProcedure.query(() => {
    return deduplicationService.getMetrics();
  }),

  // 检查事件是否重复
  checkDuplicate: protectedProcedure
    .input(z.object({
      eventId: z.string(),
      consumerGroup: z.string(),
    }))
    .query(async ({ input }) => {
      return await deduplicationService.isDuplicate(input.eventId, input.consumerGroup);
    }),

  // 获取已处理事件列表
  listProcessedEvents: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [], total: 0 };

      const events = await db.select()
        .from(processedEvents)
        .orderBy(desc(processedEvents.processedAt))
        .limit(input.limit)
        .offset(input.offset);

      const totalResult = await db.select({ count: count() })
        .from(processedEvents);

      return {
        events,
        total: totalResult[0]?.count || 0,
      };
    }),

  // 获取幂等记录列表
  listIdempotentRecords: protectedProcedure
    .input(z.object({
      status: z.enum(['processing', 'completed', 'failed']).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { records: [], total: 0 };

      const conditions = [];
      if (input.status) {
        conditions.push(eq(idempotentRecords.status, input.status));
      }

      const records = await db.select()
        .from(idempotentRecords)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(idempotentRecords.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const totalResult = await db.select({ count: count() })
        .from(idempotentRecords)
        .where(conditions.length > 0 ? conditions[0] : undefined);

      return {
        records,
        total: totalResult[0]?.count || 0,
      };
    }),

  // 手动清理过期记录
  cleanupExpired: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const now = new Date();

    const deletedEvents = await db.delete(processedEvents)
      .where(eq(processedEvents.expiresAt, now));

    const deletedRecords = await db.delete(idempotentRecords)
      .where(eq(idempotentRecords.expiresAt, now));

    return {
      deletedEvents: (deletedEvents as any).affectedRows || 0,
      deletedRecords: (deletedRecords as any).affectedRows || 0,
    };
  }),
});

export type DeduplicationRouter = typeof deduplicationRouter;
