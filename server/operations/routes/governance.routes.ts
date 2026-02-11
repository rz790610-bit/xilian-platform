import { router, publicProcedure } from "../../core/trpc";
import { governanceJobService } from "../services/governance-job.service";
import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
import { eq, desc, and, like, count } from "drizzle-orm";
import { z } from "zod";

// ============ 数据导出任务 CRUD ============
const dataExportRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      status: z.string().optional(), exportType: z.string().optional(),
      keyword: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.status) conditions.push(eq(schema.dataExportTasks.status, p.status));
      if (p.exportType) conditions.push(eq(schema.dataExportTasks.exportType, p.exportType));
      if (p.keyword) conditions.push(like(schema.dataExportTasks.name, `%${p.keyword}%`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.dataExportTasks).where(where).orderBy(desc(schema.dataExportTasks.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.dataExportTasks).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: publicProcedure
    .input(z.object({
      taskCode: z.string(), name: z.string(), exportType: z.string(),
      format: z.string().default("csv"), queryParams: z.any(), createdBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.dataExportTasks).values(input as any);
    }),
  updateStatus: publicProcedure
    .input(z.object({
      id: z.number(), status: z.string(), progress: z.string().optional(),
      totalRows: z.number().optional(), fileSize: z.number().optional(),
      storagePath: z.string().optional(), downloadUrl: z.string().optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      return db.update(schema.dataExportTasks).set(data as any).where(eq(schema.dataExportTasks.id, id));
    }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.dataExportTasks).where(eq(schema.dataExportTasks.id, input.id));
  }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, pending, completed, failed] = await Promise.all([
      db.select({ count: count() }).from(schema.dataExportTasks),
      db.select({ count: count() }).from(schema.dataExportTasks).where(eq(schema.dataExportTasks.status, "pending")),
      db.select({ count: count() }).from(schema.dataExportTasks).where(eq(schema.dataExportTasks.status, "completed")),
      db.select({ count: count() }).from(schema.dataExportTasks).where(eq(schema.dataExportTasks.status, "failed")),
    ]);
    return { total: total[0]?.count || 0, pending: pending[0]?.count || 0, completed: completed[0]?.count || 0, failed: failed[0]?.count || 0 };
  }),
});

// ============ 数据血缘 ============
const lineageRouter = router({
  list: publicProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 50 };
      const rows = await db.select().from(schema.dataLineage).orderBy(desc(schema.dataLineage.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
      const total = await db.select({ count: count() }).from(schema.dataLineage);
      return { rows, total: total[0]?.count || 0 };
    }),
  create: publicProcedure
    .input(z.object({
      lineageId: z.string(), sourceType: z.string(), sourceId: z.string(),
      sourceDetail: z.any().optional(), targetType: z.string(), targetId: z.string(),
      targetDetail: z.any().optional(), transformType: z.string(),
      transformParams: z.any().optional(), operator: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.dataLineage).values(input as any);
    }),
});

// ============ 合成数据集 CRUD ============
const syntheticDatasetsRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [eq(schema.dataExportTasks.exportType, "synthetic")];
      if (p.status) conditions.push(eq(schema.dataExportTasks.status, p.status));
      const where = and(...conditions);
      const [rows, total] = await Promise.all([
        db.select().from(schema.dataExportTasks).where(where).orderBy(desc(schema.dataExportTasks.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.dataExportTasks).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: publicProcedure
    .input(z.object({
      taskCode: z.string(), name: z.string(), format: z.string().default("csv"),
      queryParams: z.any(), createdBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.dataExportTasks).values({ ...input, exportType: "synthetic" } as any);
    }),
  updateStatus: publicProcedure
    .input(z.object({
      id: z.number(), status: z.string(), progress: z.string().optional(),
      totalRows: z.number().optional(), errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      return db.update(schema.dataExportTasks).set(data as any).where(eq(schema.dataExportTasks.id, id));
    }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.dataExportTasks).where(eq(schema.dataExportTasks.id, input.id));
  }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const where = eq(schema.dataExportTasks.exportType, "synthetic");
    const [total, completed] = await Promise.all([
      db.select({ count: count() }).from(schema.dataExportTasks).where(where),
      db.select({ count: count() }).from(schema.dataExportTasks).where(and(where, eq(schema.dataExportTasks.status, "completed"))),
    ]);
    return { total: total[0]?.count || 0, completed: completed[0]?.count || 0 };
  }),
});

export const governanceRoutes = router({
  jobs: publicProcedure.query(() => governanceJobService.listJobs()),
  metrics: publicProcedure.query(() => governanceJobService.getCollectionMetrics()),
  dataExport: dataExportRouter,
  lineage: lineageRouter,
  syntheticDatasets: syntheticDatasetsRouter,
  policies: publicProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(schema.dataLifecyclePolicies);
  }),
});
