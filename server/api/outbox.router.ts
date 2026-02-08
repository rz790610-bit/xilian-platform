/**
 * Outbox 路由器 - 提供 Outbox 管理 API
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../core/trpc';
import { getDb } from '../lib/db';
import { outboxEvents, outboxRoutingConfig } from '../../drizzle/schema';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import { outboxPublisher } from '../services/outbox.publisher';

export const outboxRouter = router({
  // 获取 Outbox 统计信息
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        total: 0,
        pending: 0,
        processing: 0,
        published: 0,
        failed: 0,
        publisherMetrics: outboxPublisher.getMetrics(),
      };
    }

    const result = {
      total: 0,
      pending: 0,
      processing: 0,
      published: 0,
      failed: 0,
      publisherMetrics: outboxPublisher.getMetrics(),
    };

    try {
      const stats = await db.select({
        status: outboxEvents.status,
        count: count(),
      })
        .from(outboxEvents)
        .groupBy(outboxEvents.status);

      for (const stat of stats) {
        result.total += stat.count;
        if (stat.status === 'pending') result.pending = stat.count;
        if (stat.status === 'processing') result.processing = stat.count;
        if (stat.status === 'published') result.published = stat.count;
        if (stat.status === 'failed') result.failed = stat.count;
      }
    } catch {
      // 表还未创建，返回默认值
    }

    return result;
  }),

  // 获取事件列表
  listEvents: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'processing', 'published', 'failed']).optional(),
      eventType: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [], total: 0 };

      try {
        const conditions = [];
        if (input.status) {
          conditions.push(eq(outboxEvents.status, input.status));
        }
        if (input.eventType) {
          conditions.push(eq(outboxEvents.eventType, input.eventType));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const events = await db.select()
          .from(outboxEvents)
          .where(whereClause)
          .orderBy(desc(outboxEvents.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const totalResult = await db.select({ count: count() })
          .from(outboxEvents)
          .where(whereClause);

        return {
          events,
          total: totalResult[0]?.count || 0,
        };
      } catch {
        return { events: [], total: 0 };
      }
    }),

  // 重试失败的事件
  retryEvent: protectedProcedure
    .input(z.object({
      eventId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(outboxEvents)
        .set({
          status: 'pending',
          retryCount: 0,
          lastError: null,
        })
        .where(eq(outboxEvents.eventId, input.eventId));

      return { success: true };
    }),

  // 批量重试失败的事件
  retryAllFailed: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.update(outboxEvents)
      .set({
        status: 'pending',
        retryCount: 0,
        lastError: null,
      })
      .where(eq(outboxEvents.status, 'failed'));

    return { success: true, affected: (result as any).affectedRows || 0 };
  }),

  // 获取路由配置列表
  listRoutingConfigs: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    try {
      return await db.select().from(outboxRoutingConfig).orderBy(outboxRoutingConfig.eventType);
    } catch {
      return [];
    }
  }),

  // 更新路由配置
  updateRoutingConfig: protectedProcedure
    .input(z.object({
      eventType: z.string(),
      publishMode: z.enum(['cdc', 'polling']),
      cdcEnabled: z.boolean().optional(),
      pollingIntervalMs: z.number().optional(),
      pollingBatchSize: z.number().optional(),
      requiresProcessing: z.boolean().optional(),
      processorClass: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.insert(outboxRoutingConfig)
        .values({
          eventType: input.eventType,
          publishMode: input.publishMode,
          cdcEnabled: input.cdcEnabled ?? true,
          pollingIntervalMs: input.pollingIntervalMs,
          pollingBatchSize: input.pollingBatchSize,
          requiresProcessing: input.requiresProcessing ?? false,
          processorClass: input.processorClass,
          isActive: input.isActive ?? true,
        })
        .onDuplicateKeyUpdate({
          set: {
            publishMode: input.publishMode,
            cdcEnabled: input.cdcEnabled,
            pollingIntervalMs: input.pollingIntervalMs,
            pollingBatchSize: input.pollingBatchSize,
            requiresProcessing: input.requiresProcessing,
            processorClass: input.processorClass,
            isActive: input.isActive,
            updatedAt: new Date(),
          },
        });

      // 重新加载配置
      await outboxPublisher.reloadConfig();

      return { success: true };
    }),

  // 添加事件到 Outbox
  addEvent: protectedProcedure
    .input(z.object({
      eventType: z.string(),
      aggregateType: z.string(),
      aggregateId: z.string(),
      payload: z.record(z.string(), z.unknown()),
      metadata: z.object({
        correlationId: z.string().optional(),
        causationId: z.string().optional(),
        userId: z.string().optional(),
        source: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const eventId = await outboxPublisher.addEvent(input);
      return { eventId };
    }),

  // 清理已发布的旧事件
  cleanupPublished: protectedProcedure
    .input(z.object({
      retentionDays: z.number().min(1).max(365).default(30),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - input.retentionDays);

      const result = await db.delete(outboxEvents)
        .where(and(
          eq(outboxEvents.status, 'published'),
          sql`${outboxEvents.createdAt} < ${cutoffDate}`
        ));

      return { deleted: (result as any).affectedRows || 0 };
    }),

  // 获取发布器状态
  getPublisherStatus: protectedProcedure.query(() => {
    return outboxPublisher.getMetrics();
  }),
});

export type OutboxRouter = typeof outboxRouter;
