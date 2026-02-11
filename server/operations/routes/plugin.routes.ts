import { router, publicProcedure } from "../../core/trpc";
import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { z } from "zod";

// ============ 插件注册表 CRUD ============
const registryRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      pluginType: z.string().optional(), status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.pluginType) conditions.push(eq(schema.pluginRegistry.pluginType, p.pluginType));
      if (p.status) conditions.push(eq(schema.pluginRegistry.status, p.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.pluginRegistry).where(where).orderBy(desc(schema.pluginRegistry.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.pluginRegistry).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: publicProcedure
    .input(z.object({
      pluginCode: z.string(), name: z.string(), pluginType: z.string(),
      version: z.string(), entryPoint: z.string(), description: z.string().optional(),
      configSchema: z.any().optional(), defaultConfig: z.any().optional(),
      capabilities: z.any().optional(), dependencies: z.any().optional(),
      author: z.string().optional(), license: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.pluginRegistry).values(input as any);
    }),
  update: publicProcedure
    .input(z.object({
      id: z.number(), name: z.string().optional(), version: z.string().optional(),
      description: z.string().optional(), configSchema: z.any().optional(),
      defaultConfig: z.any().optional(), status: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      return db.update(schema.pluginRegistry).set({ ...data, updatedAt: new Date() } as any).where(eq(schema.pluginRegistry.id, id));
    }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.pluginRegistry).where(eq(schema.pluginRegistry.id, input.id));
  }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, active, draft] = await Promise.all([
      db.select({ count: count() }).from(schema.pluginRegistry),
      db.select({ count: count() }).from(schema.pluginRegistry).where(eq(schema.pluginRegistry.status, "active")),
      db.select({ count: count() }).from(schema.pluginRegistry).where(eq(schema.pluginRegistry.status, "draft")),
    ]);
    return { total: total[0]?.count || 0, active: active[0]?.count || 0, draft: draft[0]?.count || 0 };
  }),
});

// ============ 插件实例 CRUD ============
const instancesRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      pluginId: z.number().optional(), status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.pluginId) conditions.push(eq(schema.pluginInstances.pluginId, p.pluginId));
      if (p.status) conditions.push(eq(schema.pluginInstances.status, p.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.pluginInstances).where(where).orderBy(desc(schema.pluginInstances.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.pluginInstances).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: publicProcedure
    .input(z.object({
      instanceCode: z.string(), pluginId: z.number(), name: z.string(),
      boundEntityType: z.string().optional(), boundEntityId: z.number().optional(),
      config: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.pluginInstances).values(input as any);
    }),
  start: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.update(schema.pluginInstances).set({ status: "running", startedAt: new Date(), lastHeartbeatAt: new Date() } as any).where(eq(schema.pluginInstances.id, input.id));
  }),
  stop: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.update(schema.pluginInstances).set({ status: "stopped" } as any).where(eq(schema.pluginInstances.id, input.id));
  }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.pluginInstances).where(eq(schema.pluginInstances.id, input.id));
  }),
});

// ============ 插件事件查询 ============
const eventsRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      instanceId: z.number().optional(), eventType: z.string().optional(),
      severity: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.instanceId) conditions.push(eq(schema.pluginEvents.instanceId, p.instanceId));
      if (p.eventType) conditions.push(eq(schema.pluginEvents.eventType, p.eventType));
      if (p.severity) conditions.push(eq(schema.pluginEvents.severity, p.severity));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.pluginEvents).where(where).orderBy(desc(schema.pluginEvents.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.pluginEvents).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, info, warning, error] = await Promise.all([
      db.select({ count: count() }).from(schema.pluginEvents),
      db.select({ count: count() }).from(schema.pluginEvents).where(eq(schema.pluginEvents.severity, "info")),
      db.select({ count: count() }).from(schema.pluginEvents).where(eq(schema.pluginEvents.severity, "warning")),
      db.select({ count: count() }).from(schema.pluginEvents).where(eq(schema.pluginEvents.severity, "error")),
    ]);
    return { total: total[0]?.count || 0, info: info[0]?.count || 0, warning: warning[0]?.count || 0, error: error[0]?.count || 0 };
  }),
});

export const pluginRoutes = router({
  registry: registryRouter,
  instances: instancesRouter,
  events: eventsRouter,
});
