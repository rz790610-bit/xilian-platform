import { router, publicProcedure } from "../../core/trpc";
import { deviceConfigService } from "../services/device-config.service";
import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { z } from "zod";

// ============ 规则版本 CRUD ============
const ruleVersionsRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      ruleId: z.string().optional(), status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.ruleId) conditions.push(eq(schema.deviceRuleVersions.ruleId, p.ruleId));
      if (p.status) conditions.push(eq(schema.deviceRuleVersions.status, p.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.deviceRuleVersions).where(where).orderBy(desc(schema.deviceRuleVersions.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.deviceRuleVersions).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: publicProcedure
    .input(z.object({
      ruleId: z.string(), version: z.number(), ruleConfig: z.any(),
      changeReason: z.string().optional(), status: z.string().default("draft"),
      grayRatio: z.string().default("0.00"), grayDevices: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.deviceRuleVersions).values(input as any);
    }),
  publish: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await db.select().from(schema.deviceRuleVersions).where(eq(schema.deviceRuleVersions.id, input.id)).limit(1);
      if (!row[0]) throw new Error("Version not found");
      await db.update(schema.deviceRuleVersions).set({ isCurrent: 0 } as any).where(eq(schema.deviceRuleVersions.ruleId, row[0].ruleId));
      return db.update(schema.deviceRuleVersions).set({ status: "published", isCurrent: 1, publishedAt: new Date() } as any).where(eq(schema.deviceRuleVersions.id, input.id));
    }),
  rollback: publicProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.update(schema.deviceRuleVersions).set({ status: "rolled_back" } as any).where(eq(schema.deviceRuleVersions.id, input.id));
    }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, published, draft, gray] = await Promise.all([
      db.select({ count: count() }).from(schema.deviceRuleVersions),
      db.select({ count: count() }).from(schema.deviceRuleVersions).where(eq(schema.deviceRuleVersions.status, "published")),
      db.select({ count: count() }).from(schema.deviceRuleVersions).where(eq(schema.deviceRuleVersions.status, "draft")),
      db.select({ count: count() }).from(schema.deviceRuleVersions).where(eq(schema.deviceRuleVersions.status, "gray")),
    ]);
    return { total: total[0]?.count || 0, published: published[0]?.count || 0, draft: draft[0]?.count || 0, gray: gray[0]?.count || 0 };
  }),
});

// ============ 回滚触发器 CRUD ============
const rollbackTriggersRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().default(1), pageSize: z.number().default(20),
      isActive: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.isActive !== undefined) conditions.push(eq(schema.rollbackTriggers.isActive, p.isActive));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.rollbackTriggers).where(where).orderBy(desc(schema.rollbackTriggers.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.rollbackTriggers).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: publicProcedure
    .input(z.object({
      triggerCode: z.string(), name: z.string(), targetTable: z.string(),
      conditionType: z.string(), conditionParams: z.any(), rollbackAction: z.string(),
      actionParams: z.any().optional(), isActive: z.number().default(1),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.rollbackTriggers).values(input as any);
    }),
  update: publicProcedure
    .input(z.object({
      id: z.number(), name: z.string().optional(), conditionParams: z.any().optional(),
      rollbackAction: z.string().optional(), actionParams: z.any().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      return db.update(schema.rollbackTriggers).set({ ...data, updatedAt: new Date() } as any).where(eq(schema.rollbackTriggers.id, id));
    }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.rollbackTriggers).where(eq(schema.rollbackTriggers.id, input.id));
  }),
  toggleActive: publicProcedure.input(z.object({ id: z.number(), isActive: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.update(schema.rollbackTriggers).set({ isActive: input.isActive, updatedAt: new Date() } as any).where(eq(schema.rollbackTriggers.id, input.id));
  }),
  executions: publicProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: any[] = [];
      if (p.status) conditions.push(eq(schema.rollbackExecutions.status, p.status as any));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db.select().from(schema.rollbackExecutions).where(where).orderBy(desc(schema.rollbackExecutions.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
      const total = await db.select({ count: count() }).from(schema.rollbackExecutions).where(where);
      return { rows, total: total[0]?.count || 0 };
    }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, active, triggered] = await Promise.all([
      db.select({ count: count() }).from(schema.rollbackTriggers),
      db.select({ count: count() }).from(schema.rollbackTriggers).where(eq(schema.rollbackTriggers.isActive, 1)),
      db.select({ count: count() }).from(schema.rollbackExecutions),
    ]);
    return { total: total[0]?.count || 0, active: active[0]?.count || 0, totalExecutions: triggered[0]?.count || 0 };
  }),
});

export const deviceRoutes = router({
  samplingConfigs: publicProcedure.query(() => deviceConfigService.getSamplingConfigs()),
  protocolConfigs: publicProcedure.query(() => deviceConfigService.getProtocolConfigs()),
  kpis: publicProcedure.query(() => deviceConfigService.getKPIs()),
  ruleVersions: ruleVersionsRouter,
  rollbackTriggers: rollbackTriggersRouter,
});
