import { router, publicProcedure, protectedProcedure, adminProcedure } from "../../core/trpc";
import { schemaRegistry } from "../services/schema-registry.service";
import { mysqlConnector } from "../connectors/mysql.connector";
import { clickhouseConnector } from "../connectors/clickhouse.connector";
import { redisConnector } from "../connectors/redis.connector";
import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
import { eq, desc, like, and, count, sql } from "drizzle-orm";
import { z } from "zod";

// ============ Zod Schemas（P2-A07: 消除 any 穿透） ============
const alertConditionSchema = z.object({
  operator: z.enum(["gt", "lt", "gte", "lte", "eq", "ne", "between", "outside"]),
  threshold: z.number(),
  thresholdHigh: z.number().optional(),
  duration: z.number().optional(),
  aggregation: z.enum(["avg", "max", "min", "sum", "count", "last"]).optional(),
});

const notificationChannelSchema = z.object({
  type: z.enum(["email", "webhook", "sms", "dingtalk", "wechat"]),
  target: z.string(),
  template: z.string().optional(),
});

// ============ 系统健康检查（公开端点） ============
const healthRouter = router({
  check: publicProcedure.query(async () => {
    const startTime = Date.now();
    const [mysql, ch, redis] = await Promise.all([
      mysqlConnector.healthCheck(),
      clickhouseConnector.healthCheck(),
      redisConnector.healthCheck(),
    ]);
    return {
      mysql,
      clickhouse: ch,
      redis,
      version: process.env.APP_VERSION || "0.0.0",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      responseMs: Date.now() - startTime,
    };
  }),
  // P0-AUTH-1: Schema 信息属于敏感元数据
  listTables: protectedProcedure.query(() => schemaRegistry.listTables()),
  tableSchema: protectedProcedure
    .input(z.object({ tableName: z.string() }))
    .query(({ input }) => schemaRegistry.getTableSchema(input.tableName)),
  tableCount: protectedProcedure.query(() => schemaRegistry.getTableCount()),
});

// ============ 告警规则 CRUD（读取公开，写操作需鉴权） ============
const alertRulesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      severity: z.string().optional(),
      deviceType: z.string().optional(),
      keyword: z.string().optional(),
      isActive: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions = [eq(schema.alertRules.isDeleted, 0)];
      if (p.severity) conditions.push(eq(schema.alertRules.severity, p.severity));
      if (p.deviceType) conditions.push(eq(schema.alertRules.deviceType, p.deviceType));
      if (p.isActive !== undefined) conditions.push(eq(schema.alertRules.isActive, p.isActive));
      if (p.keyword) conditions.push(like(schema.alertRules.name, `%${p.keyword}%`));
      const where = conditions.length > 1 ? and(...conditions) : conditions[0];
      const [rows, total] = await Promise.all([
        db.select().from(schema.alertRules).where(where).orderBy(desc(schema.alertRules.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.alertRules).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, input.id)).limit(1);
      return rows[0] || null;
    }),
  create: protectedProcedure
    .input(z.object({
      ruleCode: z.string(),
      name: z.string(),
      deviceType: z.string(),
      measurementType: z.string(),
      severity: z.string().default("warning"),
      condition: alertConditionSchema,
      cooldownSeconds: z.number().default(300),
      notificationChannels: z.array(notificationChannelSchema).optional(),
      description: z.string().optional(),
      priority: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.alertRules).values({
        ...input,
        condition: JSON.stringify(input.condition),
        notificationChannels: input.notificationChannels ? JSON.stringify(input.notificationChannels) : null,
      } as typeof schema.alertRules.$inferInsert);
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      severity: z.string().optional(),
      condition: alertConditionSchema.optional(),
      cooldownSeconds: z.number().optional(),
      notificationChannels: z.array(notificationChannelSchema).optional(),
      isActive: z.number().optional(),
      description: z.string().optional(),
      priority: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, condition, notificationChannels, ...rest } = input;
      const data: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (condition) data.condition = JSON.stringify(condition);
      if (notificationChannels) data.notificationChannels = JSON.stringify(notificationChannels);
      return db.update(schema.alertRules).set(data as typeof schema.alertRules.$inferInsert).where(eq(schema.alertRules.id, id));
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.update(schema.alertRules).set({ isDeleted: 1, updatedAt: new Date() } as typeof schema.alertRules.$inferInsert).where(eq(schema.alertRules.id, input.id));
    }),
  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.update(schema.alertRules).set({ isActive: input.isActive, updatedAt: new Date() } as typeof schema.alertRules.$inferInsert).where(eq(schema.alertRules.id, input.id));
    }),
  stats: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, active, critical, warning] = await Promise.all([
      db.select({ count: count() }).from(schema.alertRules).where(eq(schema.alertRules.isDeleted, 0)),
      db.select({ count: count() }).from(schema.alertRules).where(and(eq(schema.alertRules.isDeleted, 0), eq(schema.alertRules.isActive, 1))),
      db.select({ count: count() }).from(schema.alertRules).where(and(eq(schema.alertRules.isDeleted, 0), eq(schema.alertRules.severity, "critical"))),
      db.select({ count: count() }).from(schema.alertRules).where(and(eq(schema.alertRules.isDeleted, 0), eq(schema.alertRules.severity, "warning"))),
    ]);
    return { total: total[0]?.count || 0, active: active[0]?.count || 0, critical: critical[0]?.count || 0, warning: warning[0]?.count || 0 };
  }),
});

// ============ 审计日志查询（只读公开，敏感日志需鉴权） ============
const auditLogsRouter = router({
  // P0-AUTH-1: 审计日志包含操作记录，需要认证
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      action: z.string().optional(),
      operator: z.string().optional(),
      resourceType: z.string().optional(),
      result: z.string().optional(),
      keyword: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: ReturnType<typeof eq>[] = [];
      if (p.action) conditions.push(eq(schema.auditLogs.action, p.action));
      if (p.operator) conditions.push(eq(schema.auditLogs.operator, p.operator));
      if (p.resourceType) conditions.push(like(schema.auditLogs.resourceType, `%${p.resourceType}%`));
      if (p.result) conditions.push(eq(schema.auditLogs.result, p.result));
      if (p.keyword) conditions.push(like(schema.auditLogs.action, `%${p.keyword}%`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.auditLogs).where(where).orderBy(desc(schema.auditLogs.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.auditLogs).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  stats: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, success, fail] = await Promise.all([
      db.select({ count: count() }).from(schema.auditLogs),
      db.select({ count: count() }).from(schema.auditLogs).where(eq(schema.auditLogs.result, "success")),
      db.select({ count: count() }).from(schema.auditLogs).where(eq(schema.auditLogs.result, "error")),
    ]);
    return { total: total[0]?.count || 0, success: success[0]?.count || 0, fail: fail[0]?.count || 0 };
  }),
  sensitiveList: protectedProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const rows = await db.select().from(schema.auditLogsSensitive).orderBy(desc(schema.auditLogsSensitive.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
      const total = await db.select({ count: count() }).from(schema.auditLogsSensitive);
      return { rows, total: total[0]?.count || 0 };
    }),
});

// ============ 定时任务 CRUD（全部需鉴权，删除需管理员） ============
const scheduledTasksRouter = router({
  // P0-AUTH-1: 定时任务信息需要认证
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
      taskType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: ReturnType<typeof eq>[] = [];
      if (p.status) conditions.push(eq(schema.scheduledTasks.status, p.status));
      if (p.taskType) conditions.push(eq(schema.scheduledTasks.taskType, p.taskType));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, total] = await Promise.all([
        db.select().from(schema.scheduledTasks).where(where).orderBy(desc(schema.scheduledTasks.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
        db.select({ count: count() }).from(schema.scheduledTasks).where(where),
      ]);
      return { rows, total: total[0]?.count || 0, page: p.page, pageSize: p.pageSize };
    }),
  create: protectedProcedure
    .input(z.object({
      taskCode: z.string(),
      name: z.string(),
      taskType: z.string(),
      handler: z.string(),
      cronExpression: z.string().optional(),
      intervalSeconds: z.number().optional(),
      params: z.record(z.unknown()).optional(),
      status: z.string().default("active"),
      maxRetries: z.number().default(3),
      timeoutSeconds: z.number().default(300),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.scheduledTasks).values({
        ...input,
        params: input.params ? JSON.stringify(input.params) : null,
      } as typeof schema.scheduledTasks.$inferInsert);
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      cronExpression: z.string().optional(),
      intervalSeconds: z.number().optional(),
      params: z.record(z.unknown()).optional(),
      status: z.string().optional(),
      maxRetries: z.number().optional(),
      timeoutSeconds: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, params, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (params) data.params = JSON.stringify(params);
      return db.update(schema.scheduledTasks).set(data as typeof schema.scheduledTasks.$inferInsert).where(eq(schema.scheduledTasks.id, id));
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.delete(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, input.id));
    }),
  toggleStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.update(schema.scheduledTasks).set({ status: input.status } as typeof schema.scheduledTasks.$inferInsert).where(eq(schema.scheduledTasks.id, input.id));
    }),
  stats: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const [total, active, paused] = await Promise.all([
      db.select({ count: count() }).from(schema.scheduledTasks),
      db.select({ count: count() }).from(schema.scheduledTasks).where(eq(schema.scheduledTasks.status, "active")),
      db.select({ count: count() }).from(schema.scheduledTasks).where(eq(schema.scheduledTasks.status, "paused")),
    ]);
    return { total: total[0]?.count || 0, active: active[0]?.count || 0, paused: paused[0]?.count || 0 };
  }),
  // P0-AUTH-1: 异步日志包含运行时信息，需要认证
  asyncLogs: protectedProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const p = input || { page: 1, pageSize: 20 };
      const conditions: ReturnType<typeof eq>[] = [];
      if (p.status) conditions.push(eq(schema.asyncTaskLog.status, p.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db.select().from(schema.asyncTaskLog).where(where).orderBy(desc(schema.asyncTaskLog.createdAt)).limit(p.pageSize).offset((p.page - 1) * p.pageSize);
      const total = await db.select({ count: count() }).from(schema.asyncTaskLog).where(where);
      return { rows, total: total[0]?.count || 0 };
    }),
});

export const systemRoutes = router({
  health: healthRouter,
  alertRules: alertRulesRouter,
  auditLogs: auditLogsRouter,
  scheduledTasks: scheduledTasksRouter,
});
