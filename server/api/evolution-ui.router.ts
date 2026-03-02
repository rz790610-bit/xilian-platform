/**
 * ============================================================================
 * 进化 UI 路由 — FeedbackCenter / LabelingManager / ActiveLearning 页面后端
 * ============================================================================
 * 职责：为三个前端进化页面提供 CRUD + 统计 API
 *   - feedbackRouter  : 反馈中心（基于 evolutionAuditLogs 表存储反馈）
 *   - labelingRouter  : 标注管理（基于 dataSlices + dataSliceLabelHistory 表）
 *   - activeLearningRouter : 主动学习（基于 edgeCases + dataSlices 表）
 */
import { router, protectedProcedure } from '../core/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getDb } from '../lib/db';
import { eq, desc, count, and, sql, like, inArray, or } from 'drizzle-orm';
import {
  evolutionAuditLogs,
  edgeCases,
} from '../../drizzle/evolution-schema';
import {
  dataSlices,
  dataSliceLabelHistory,
} from '../../drizzle/schema';
import { datesToEpoch } from '../../shared/contracts/v1';

// ============================================================================
// 1. 反馈中心路由 — feedbackRouter
// ============================================================================
const feedbackRouter = router({
  /**
   * 列出反馈记录（从 evolutionAuditLogs 中筛选 eventType 以 'feedback.' 开头的条目）
   */
  list: protectedProcedure
    .input(z.object({
      eventType: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const filters = [like(evolutionAuditLogs.eventType, 'feedback.%')];
        if (input?.eventType) {
          filters.push(eq(evolutionAuditLogs.eventType, input.eventType));
        }
        const where = and(...filters);
        const lim = input?.limit ?? 50;
        const off = input?.offset ?? 0;

        const rawItems = await db.select().from(evolutionAuditLogs)
          .where(where)
          .orderBy(desc(evolutionAuditLogs.createdAt))
          .limit(lim)
          .offset(off);

        const totalRows = await db.select({ cnt: count() }).from(evolutionAuditLogs)
          .where(where);

        // FIX-036: Date→epoch ms 统一
        const items = rawItems.map(i => datesToEpoch(i));
        return { items, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { items: [], total: 0 }; }
    }),

  /**
   * 创建反馈条目
   * 映射到 evolutionAuditLogs: eventType='feedback.created', eventSource='feedback-center'
   * 所有输入字段存入 eventData JSON
   */
  create: protectedProcedure
    .input(z.object({
      type: z.string(),
      priority: z.string(),
      title: z.string(),
      description: z.string(),
      diagnosisId: z.string().optional(),
      deviceName: z.string().optional(),
      algorithmName: z.string().optional(),
      modelVersion: z.string().optional(),
      originalPrediction: z.string().optional(),
      correctedLabel: z.string().optional(),
      confidence: z.number().optional(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        // Map priority to severity
        const severityMap: Record<string, 'info' | 'warn' | 'error' | 'critical'> = {
          critical: 'critical',
          high: 'warn',
          medium: 'info',
          low: 'info',
        };
        const severity = severityMap[input.priority] ?? 'info';

        const eventData: Record<string, unknown> = {
          type: input.type,
          priority: input.priority,
          title: input.title,
          description: input.description,
          status: 'pending',
          tags: input.tags,
          createdAt: new Date().toISOString(),
        };
        if (input.diagnosisId) eventData.diagnosisId = input.diagnosisId;
        if (input.deviceName) eventData.deviceName = input.deviceName;
        if (input.algorithmName) eventData.algorithmName = input.algorithmName;
        if (input.modelVersion) eventData.modelVersion = input.modelVersion;
        if (input.originalPrediction) eventData.originalPrediction = input.originalPrediction;
        if (input.correctedLabel) eventData.correctedLabel = input.correctedLabel;
        if (input.confidence !== undefined) eventData.confidence = input.confidence;

        const result = await db.insert(evolutionAuditLogs).values({
          eventType: 'feedback.created',
          eventSource: 'feedback-center',
          eventData,
          severity,
        });
        return { id: Number(result[0].insertId), success: true };
      } catch (err) {
        return { id: 0, success: false, error: String(err) };
      }
    }),

  /**
   * 更新反馈状态（accepted / rejected / reviewing）
   * 读取现有 eventData JSON，合并 status + reviewedBy 后回写
   */
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['accepted', 'rejected', 'reviewing']),
      reviewedBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        // Read existing row
        const rows = await db.select().from(evolutionAuditLogs)
          .where(eq(evolutionAuditLogs.id, input.id))
          .limit(1);
        if (!rows[0]) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Feedback #${input.id} not found` });
        }

        const existingData = (rows[0].eventData ?? {}) as Record<string, unknown>;
        const updatedData: Record<string, unknown> = {
          ...existingData,
          status: input.status,
          reviewedAt: new Date().toISOString(),
        };
        if (input.reviewedBy) updatedData.reviewedBy = input.reviewedBy;

        // Update eventType to reflect the new status
        const eventType = `feedback.${input.status}`;

        await db.update(evolutionAuditLogs)
          .set({ eventData: updatedData, eventType })
          .where(eq(evolutionAuditLogs.id, input.id));

        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        return { success: false, error: String(err) };
      }
    }),

  /**
   * 反馈统计：总数 / 待处理 / 已接受 / 采纳率
   */
  getStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const allFeedback = await db.select().from(evolutionAuditLogs)
          .where(like(evolutionAuditLogs.eventType, 'feedback.%'));

        const total = allFeedback.length;
        let pending = 0;
        let accepted = 0;

        for (const row of allFeedback) {
          const data = (row.eventData ?? {}) as Record<string, unknown>;
          const status = data.status as string | undefined;
          if (!status || status === 'pending') pending++;
          else if (status === 'accepted') accepted++;
        }

        const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
        return { total, pending, accepted, rate };
      } catch { return { total: 0, pending: 0, accepted: 0, rate: 0 }; }
    }),
});

// ============================================================================
// 2. 标注管理路由 — labelingRouter
// ============================================================================
const labelingRouter = router({
  /**
   * 列出数据切片（支持 labelStatus / labelSource / search 筛选）
   */
  list: protectedProcedure
    .input(z.object({
      labelStatus: z.string().optional(),
      labelSource: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const filters: ReturnType<typeof eq>[] = [];
        if (input?.labelStatus) {
          filters.push(eq(dataSlices.labelStatus, input.labelStatus));
        }
        if (input?.search) {
          filters.push(like(dataSlices.deviceCode, `%${input.search}%`));
        }
        // labelSource filter: search within labels JSON field
        if (input?.labelSource) {
          filters.push(sql`JSON_CONTAINS(${dataSlices.labels}, '"${sql.raw(input.labelSource)}"', '$.source')`);
        }

        const where = filters.length > 0 ? and(...filters) : undefined;
        const lim = input?.limit ?? 50;
        const off = input?.offset ?? 0;

        const rawItems = await db.select().from(dataSlices)
          .where(where)
          .orderBy(desc(dataSlices.createdAt))
          .limit(lim)
          .offset(off);

        const totalRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(where);

        const items = rawItems.map(i => datesToEpoch(i));
        return { items, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { items: [], total: 0 }; }
    }),

  /**
   * 标注审计轨迹（来自 dataSliceLabelHistory）
   */
  auditTrail: protectedProcedure
    .input(z.object({
      sliceId: z.string().optional(),
      limit: z.number().default(100),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const where = input?.sliceId
          ? eq(dataSliceLabelHistory.sliceId, input.sliceId)
          : undefined;
        const lim = input?.limit ?? 100;

        const rawItems = await db.select().from(dataSliceLabelHistory)
          .where(where)
          .orderBy(desc(dataSliceLabelHistory.changedAt))
          .limit(lim);

        const totalRows = await db.select({ cnt: count() }).from(dataSliceLabelHistory)
          .where(where);

        const items = rawItems.map(i => datesToEpoch(i));
        return { items, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { items: [], total: 0 }; }
    }),

  /**
   * 审核标注：approve / reject
   * 更新 dataSlices.labelStatus，并在 dataSliceLabelHistory 中记录变更
   */
  review: protectedProcedure
    .input(z.object({
      sliceId: z.string(),
      action: z.enum(['approve', 'reject']),
      reason: z.string().optional(),
      correctedFaultType: z.string().optional(),
      reviewedBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        // Read existing slice
        const slices = await db.select().from(dataSlices)
          .where(eq(dataSlices.sliceId, input.sliceId))
          .limit(1);
        if (!slices[0]) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Slice ${input.sliceId} not found` });
        }
        const oldStatus = slices[0].labelStatus;
        const newStatus = input.action === 'approve' ? 'approved' : 'rejected';

        // Update slice labelStatus
        await db.update(dataSlices)
          .set({ labelStatus: newStatus, updatedAt: new Date() })
          .where(eq(dataSlices.sliceId, input.sliceId));

        // If correctedFaultType provided, also update faultTypeCode
        if (input.correctedFaultType) {
          await db.update(dataSlices)
            .set({ faultTypeCode: input.correctedFaultType })
            .where(eq(dataSlices.sliceId, input.sliceId));
        }

        // Insert audit trail record
        await db.insert(dataSliceLabelHistory).values({
          sliceId: input.sliceId,
          dimensionCode: 'root_cause',
          oldValue: oldStatus,
          newValue: newStatus,
          oldSource: oldStatus,
          newSource: newStatus,
          changedBy: input.reviewedBy ?? 'system',
          changedAt: new Date(),
          reason: input.reason ?? null,
          reviewStatus: newStatus,
        });

        return { success: true, newStatus };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        return { success: false, newStatus: null, error: String(err) };
      }
    }),

  /**
   * 标注统计：各状态数量 + 平均置信度
   */
  getStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const totalRows = await db.select({ cnt: count() }).from(dataSlices);
        const total = totalRows[0]?.cnt ?? 0;

        const approvedRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(eq(dataSlices.labelStatus, 'approved'));
        const approved = approvedRows[0]?.cnt ?? 0;

        const pendingRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(or(
            eq(dataSlices.labelStatus, 'auto_only'),
            eq(dataSlices.labelStatus, 'pending'),
          ));
        const pending = pendingRows[0]?.cnt ?? 0;

        const rejectedRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(eq(dataSlices.labelStatus, 'rejected'));
        const rejected = rejectedRows[0]?.cnt ?? 0;

        const manualRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(eq(dataSlices.labelStatus, 'manual_required'));
        const manualRequired = manualRows[0]?.cnt ?? 0;

        return { total, approved, pending, rejected, manualRequired, avgConfidence: 0 };
      } catch { return { total: 0, approved: 0, pending: 0, rejected: 0, manualRequired: 0, avgConfidence: 0 }; }
    }),
});

// ============================================================================
// 3. 主动学习路由 — activeLearningRouter
// ============================================================================
const activeLearningRouter = router({
  /**
   * 候选样本：状态为 discovered / analyzing 的边缘案例
   */
  candidates: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const lim = input?.limit ?? 50;
        const rawItems = await db.select().from(edgeCases)
          .where(or(
            eq(edgeCases.status, 'discovered'),
            eq(edgeCases.status, 'analyzing'),
          ))
          .orderBy(desc(edgeCases.createdAt))
          .limit(lim);

        const totalRows = await db.select({ cnt: count() }).from(edgeCases)
          .where(or(
            eq(edgeCases.status, 'discovered'),
            eq(edgeCases.status, 'analyzing'),
          ));

        const items = rawItems.map(i => datesToEpoch(i));
        return { items, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { items: [], total: 0 }; }
    }),

  /**
   * 主动学习任务列表：已被选为样本的数据切片
   */
  tasks: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        const lim = input?.limit ?? 50;
        const rawItems = await db.select().from(dataSlices)
          .where(eq(dataSlices.isSample, 1))
          .orderBy(desc(dataSlices.createdAt))
          .limit(lim);

        const totalRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(eq(dataSlices.isSample, 1));

        const items = rawItems.map(i => datesToEpoch(i));
        return { items, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { items: [], total: 0 }; }
    }),

  /**
   * 将边缘案例标记为 'analyzing' — 创建主动学习任务
   */
  createTask: protectedProcedure
    .input(z.object({
      caseIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        if (input.caseIds.length === 0) return { count: 0 };

        await db.update(edgeCases)
          .set({ status: 'analyzing' })
          .where(inArray(edgeCases.id, input.caseIds));

        return { count: input.caseIds.length };
      } catch (err) {
        return { count: 0, error: String(err) };
      }
    }),

  /**
   * 主动学习统计
   */
  getStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection unavailable' });
      try {
        // Candidate count: discovered + analyzing edge cases
        const candidateRows = await db.select({ cnt: count() }).from(edgeCases)
          .where(or(
            eq(edgeCases.status, 'discovered'),
            eq(edgeCases.status, 'analyzing'),
          ));
        const candidateCount = candidateRows[0]?.cnt ?? 0;

        // Active tasks: analyzing edge cases
        const activeRows = await db.select({ cnt: count() }).from(edgeCases)
          .where(eq(edgeCases.status, 'analyzing'));
        const activeTaskCount = activeRows[0]?.cnt ?? 0;

        // Completed samples: isSample=1 data slices
        const sampleRows = await db.select({ cnt: count() }).from(dataSlices)
          .where(eq(dataSlices.isSample, 1));
        const completedSamples = sampleRows[0]?.cnt ?? 0;

        return {
          candidateCount,
          activeTaskCount,
          completedSamples,
          improvement: '—',
        };
      } catch {
        return { candidateCount: 0, activeTaskCount: 0, completedSamples: 0, improvement: '—' };
      }
    }),
});

// ============================================================================
// 导出聚合路由
// ============================================================================
export const evolutionUIRouter = router({
  feedback: feedbackRouter,
  labeling: labelingRouter,
  activeLearning: activeLearningRouter,
});
