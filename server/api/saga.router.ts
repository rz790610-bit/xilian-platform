/**
 * Saga 路由器 - 提供 Saga 管理 API
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../core/trpc';
import { getDb } from '../lib/db';
import { sagaInstances, sagaSteps, sagaDeadLetters, rollbackExecutions } from '../../drizzle/schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { sagaOrchestrator } from '../services/saga.orchestrator';

export const sagaRouter = router({
  // 获取 Saga 统计
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        total: 0,
        running: 0,
        completed: 0,
        failed: 0,
        compensated: 0,
        partial: 0,
        deadLetters: 0,
        orchestratorMetrics: sagaOrchestrator.getMetrics(),
      };
    }

    const result = {
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      compensated: 0,
      partial: 0,
      deadLetters: 0,
      orchestratorMetrics: sagaOrchestrator.getMetrics(),
    };

    try {
      const sagaStats = await db.select({
        status: sagaInstances.status,
        count: count(),
      })
        .from(sagaInstances)
        .groupBy(sagaInstances.status);

      const deadLetterCount = await db.select({ count: count() })
        .from(sagaDeadLetters);

      result.deadLetters = deadLetterCount[0]?.count || 0;

      for (const stat of sagaStats) {
        result.total += stat.count;
        if (stat.status === 'running') result.running = stat.count;
        if (stat.status === 'completed') result.completed = stat.count;
        if (stat.status === 'failed') result.failed = stat.count;
        if (stat.status === 'compensated') result.compensated = stat.count;
        if (stat.status === 'partial') result.partial = stat.count;
      }
    } catch {
      // 表还未创建，返回默认值
    }

    return result;
  }),

  // 获取 Saga 列表
  listSagas: protectedProcedure
    .input(z.object({
      status: z.enum(['running', 'completed', 'failed', 'compensating', 'compensated', 'partial']).optional(),
      sagaType: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { sagas: [], total: 0 };

      try {
        const conditions = [];
        if (input.status) {
          conditions.push(eq(sagaInstances.status, input.status));
        }
        if (input.sagaType) {
          conditions.push(eq(sagaInstances.sagaType, input.sagaType));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const sagas = await db.select()
          .from(sagaInstances)
          .where(whereClause)
          .orderBy(desc(sagaInstances.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const totalResult = await db.select({ count: count() })
          .from(sagaInstances)
          .where(whereClause);

        return {
          sagas,
          total: totalResult[0]?.count || 0,
        };
      } catch {
        return { sagas: [], total: 0 };
      }
    }),

  // 获取 Saga 详情（含步骤）
  getSagaDetail: protectedProcedure
    .input(z.object({ sagaId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        const saga = await db.select()
          .from(sagaInstances)
          .where(eq(sagaInstances.sagaId, input.sagaId))
          .limit(1);

        if (saga.length === 0) return null;

        const steps = await db.select()
          .from(sagaSteps)
          .where(eq(sagaSteps.sagaId, input.sagaId))
          .orderBy(sagaSteps.stepIndex);

        return {
          ...saga[0],
          steps,
        };
      } catch {
        return null;
      }
    }),

  // 从检查点恢复 Saga
  resumeSaga: protectedProcedure
    .input(z.object({ sagaId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await sagaOrchestrator.resumeFromCheckpoint(input.sagaId);
      return result;
    }),

  // 执行回滚 Saga
  executeRollback: protectedProcedure
    .input(z.object({
      triggerId: z.string(),
      targetType: z.enum(['rule', 'model', 'config', 'firmware']),
      targetId: z.string(),
      fromVersion: z.string(),
      toVersion: z.string(),
      reason: z.string().optional(),
      deviceCodes: z.array(z.string()).optional(),
      stopOnError: z.boolean().optional(),
      batchSize: z.number().min(1).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await sagaOrchestrator.execute('rule_rollback', input);
      return result;
    }),

  // 获取回滚执行列表
  listRollbacks: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'executing', 'completed', 'failed', 'partial', 'cancelled']).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rollbacks: [], total: 0 };

      try {
        const conditions = [];
        if (input.status) {
          conditions.push(eq(rollbackExecutions.status, input.status));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const rollbacks = await db.select()
          .from(rollbackExecutions)
          .where(whereClause)
          .orderBy(desc(rollbackExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const totalResult = await db.select({ count: count() })
          .from(rollbackExecutions)
          .where(whereClause);

        return {
          rollbacks,
          total: totalResult[0]?.count || 0,
        };
      } catch {
        return { rollbacks: [], total: 0 };
      }
    }),

  // 获取死信队列
  listDeadLetters: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { deadLetters: [], total: 0 };

      try {
        const deadLetters = await db.select()
          .from(sagaDeadLetters)
          .orderBy(desc(sagaDeadLetters.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const totalResult = await db.select({ count: count() })
          .from(sagaDeadLetters);

        return {
          deadLetters,
          total: totalResult[0]?.count || 0,
        };
      } catch {
        return { deadLetters: [], total: 0 };
      }
    }),

  // 重试死信
  retryDeadLetter: protectedProcedure
    .input(z.object({ deadLetterId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const dl = await db.select()
        .from(sagaDeadLetters)
        .where(eq(sagaDeadLetters.deadLetterId, input.deadLetterId))
        .limit(1);

      if (dl.length === 0) throw new Error('Dead letter not found');

      const deadLetter = dl[0];
      if (!deadLetter.retryable) throw new Error('Dead letter is not retryable');

      // 重新执行 Saga
      const result = await sagaOrchestrator.execute(
        deadLetter.sagaType,
        deadLetter.originalInput
      );

      // 更新死信记录
      await db.update(sagaDeadLetters)
        .set({
          retryCount: deadLetter.retryCount + 1,
          lastRetryAt: new Date(),
          resolvedAt: result.status === 'completed' ? new Date() : undefined,
          resolution: result.status === 'completed' ? 'Retried successfully' : undefined,
        })
        .where(eq(sagaDeadLetters.deadLetterId, input.deadLetterId));

      return result;
    }),

  // 获取编排器状态
  getOrchestratorStatus: protectedProcedure.query(() => {
    return sagaOrchestrator.getMetrics();
  }),
});

export type SagaRouter = typeof sagaRouter;
