/**
 * 传感器管理 CRUD API tRPC 路由
 * PortAI Nexus - 传感器生命周期管理
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { getDb } from '../lib/db';
import { assetSensors } from '../../drizzle/schema';
import { eq, desc, and, or, like, inArray, sql, count, gte, lte } from 'drizzle-orm';

const sensorTypeSchema = z.enum([
  'vibration', 'temperature', 'pressure', 'current', 'voltage',
  'speed', 'position', 'humidity', 'flow', 'level', 'other'
]);

const sensorStatusSchema = z.enum(['active', 'inactive', 'error']);

export const sensorCrudRouter = router({
  /**
   * 获取传感器列表
   */
  list: publicProcedure
    .input(z.object({
      deviceId: z.string().optional(),
      type: z.union([sensorTypeSchema, z.array(sensorTypeSchema)]).optional(),
      status: z.union([sensorStatusSchema, z.array(sensorStatusSchema)]).optional(),
      search: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: 1, pageSize: 20 };

      const params: { deviceId?: string; type?: string | string[]; status?: string | string[]; search?: string; page?: number; pageSize?: number } = input || {};
      const conditions: any[] = [];

      if (params.deviceId) {
        conditions.push(eq(assetSensors.deviceCode, params.deviceId));
      }
      if (params.type) {
        const types = Array.isArray(params.type) ? params.type : [params.type];
        conditions.push(inArray(assetSensors.physicalQuantity, types));
      }
      if (params.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        conditions.push(inArray(assetSensors.status, statuses));
      }
      if (params.search) {
        conditions.push(
          or(
            like(assetSensors.name, `%${params.search}%`),
            like(assetSensors.sensorId, `%${params.search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;

      const [items, totalResult] = await Promise.all([
        db.select().from(assetSensors)
          .where(where)
          .orderBy(desc(assetSensors.updatedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ count: count() }).from(assetSensors).where(where),
      ]);

      return {
        items,
        total: totalResult[0]?.count || 0,
        page,
        pageSize,
      };
    }),

  /**
   * 获取传感器详情
   */
  getById: publicProcedure
    .input(z.object({ sensorId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(assetSensors)
        .where(eq(assetSensors.sensorId, input.sensorId))
        .limit(1);
      return result[0] || null;
    }),

  /**
   * 创建传感器
   */
  create: protectedProcedure
    .input(z.object({
      sensorId: z.string().min(1).max(64),
      deviceId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      type: sensorTypeSchema,
      unit: z.string().max(20).optional(),
      minValue: z.number().int().optional(),
      maxValue: z.number().int().optional(),
      warningThreshold: z.number().int().optional(),
      criticalThreshold: z.number().int().optional(),
      samplingRate: z.number().int().default(1000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.insert(assetSensors).values({
        sensorId: input.sensorId,
        deviceCode: input.deviceId,
        mpId: input.sensorId,
        name: input.name,
        physicalQuantity: input.type,
        unit: input.unit,
        warningThreshold: input.warningThreshold,
        criticalThreshold: input.criticalThreshold,
        sampleRate: input.samplingRate,
        status: 'active',
        metadata: (input.minValue !== undefined || input.maxValue !== undefined)
          ? JSON.stringify({ minValue: input.minValue, maxValue: input.maxValue })
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await db.select().from(assetSensors)
        .where(eq(assetSensors.sensorId, input.sensorId))
        .limit(1);
      return result[0];
    }),

  /**
   * 更新传感器
   */
  update: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      data: z.object({
        name: z.string().min(1).max(100).optional(),
        type: sensorTypeSchema.optional(),
        unit: z.string().max(20).optional().nullable(),
        minValue: z.number().int().optional().nullable(),
        maxValue: z.number().int().optional().nullable(),
        warningThreshold: z.number().int().optional().nullable(),
        criticalThreshold: z.number().int().optional().nullable(),
        samplingRate: z.number().int().optional(),
        status: sensorStatusSchema.optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(assetSensors)
        .set(input.data as any)
        .where(eq(assetSensors.sensorId, input.sensorId));

      const result = await db.select().from(assetSensors)
        .where(eq(assetSensors.sensorId, input.sensorId))
        .limit(1);
      return result[0];
    }),

  /**
   * 删除传感器
   */
  delete: protectedProcedure
    .input(z.object({ sensorId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.delete(assetSensors).where(eq(assetSensors.sensorId, input.sensorId));
      return { success: true };
    }),

  /**
   * 获取传感器统计
   */
  getStatistics: publicProcedure
    .input(z.object({ deviceId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, byType: {}, byStatus: {} };

      const where = input?.deviceId ? eq(assetSensors.deviceCode, input.deviceId) : undefined;

      const [totalResult, byStatusResult, byTypeResult] = await Promise.all([
        db.select({ count: count() }).from(assetSensors).where(where),
        db.select({
          status: assetSensors.status,
          count: count(),
        }).from(assetSensors).where(where).groupBy(assetSensors.status),
        db.select({
          type: assetSensors.physicalQuantity,
          count: count(),
        }).from(assetSensors).where(where).groupBy(assetSensors.physicalQuantity),
      ]);

      const byStatus: Record<string, number> = {};
      byStatusResult.forEach(r => { byStatus[r.status] = r.count; });

      const byType: Record<string, number> = {};
      byTypeResult.forEach(r => { if (r.type) byType[r.type] = r.count; });

      return {
        total: totalResult[0]?.count || 0,
        byStatus,
        byType,
      };
    }),
});

export type SensorCrudRouter = typeof sensorCrudRouter;
