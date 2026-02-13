/**
 * 调度与系统配置服务层
 * 提供 scheduledTasks / rollbackTriggers / systemConfigs / configChangeLogs / asyncTaskLog / messageQueueLog 的完整 CRUD
 * 
 * 数据链路: Drizzle schema → service CRUD → tRPC router → 前端组件
 */
import { getDb } from '../../lib/db';
import {
  scheduledTasks, rollbackTriggers, systemConfigs, configChangeLogs,
  asyncTaskLog, messageQueueLog
} from '../../../drizzle/schema';
import { eq, and, like, desc, asc, count, gte, lte } from 'drizzle-orm';

// ============================================
// 定时任务
// ============================================
export const scheduledTaskService = {
  async list(filters?: { taskType?: string; status?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [eq(scheduledTasks.isDeleted, 0)];
    if (filters?.taskType) conditions.push(eq(scheduledTasks.taskType, filters.taskType));
    if (filters?.status) conditions.push(eq(scheduledTasks.status, filters.status));
    if (filters?.search) conditions.push(like(scheduledTasks.name, `%${filters.search}%`));
    const where = and(...conditions);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(scheduledTasks).where(where);
    const rows = await db.select().from(scheduledTasks)
      .where(where)
      .orderBy(asc(scheduledTasks.nextRunAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(scheduledTasks).where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    taskCode: string; name: string; taskType: string; cronExpression?: string;
    intervalSeconds?: number; handler: string; params?: any; timeoutSeconds?: number;
    maxRetries?: number; description?: string; createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(scheduledTasks).values({
      taskCode: input.taskCode, name: input.name, taskType: input.taskType,
      cronExpression: input.cronExpression || null, intervalSeconds: input.intervalSeconds || null,
      handler: input.handler, params: input.params || null,
      status: 'active', retryCount: 0, maxRetries: input.maxRetries ?? 3,
      timeoutSeconds: input.timeoutSeconds ?? 300, description: input.description || null,
      version: 1, createdBy: input.createdBy || 'system', createdAt: now, updatedAt: now, isDeleted: 0,
    });
    return this.getById((await db.select({ id: scheduledTasks.id }).from(scheduledTasks)
      .where(eq(scheduledTasks.taskCode, input.taskCode)))[0]?.id);
  },

  async updateStatus(id: number, status: string, lastRunResult?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status, updatedAt: new Date() };
    if (lastRunResult) updates.lastRunResult = lastRunResult;
    if (status === 'running') updates.lastRunAt = new Date();
    await db.update(scheduledTasks).set(updates).where(eq(scheduledTasks.id, id));
    return this.getById(id);
  },

  async softDelete(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(scheduledTasks).set({ isDeleted: 1, updatedAt: new Date() }).where(eq(scheduledTasks.id, id));
    return { success: true };
  },
};

// ============================================
// 回滚触发器
// ============================================
export const rollbackTriggerService = {
  async list(filters?: { targetTable?: string; isActive?: number; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [eq(rollbackTriggers.isDeleted, 0)];
    if (filters?.targetTable) conditions.push(eq(rollbackTriggers.targetTable, filters.targetTable));
    if (filters?.isActive !== undefined) conditions.push(eq(rollbackTriggers.isActive, filters.isActive));
    const where = and(...conditions);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(rollbackTriggers).where(where);
    const rows = await db.select().from(rollbackTriggers)
      .where(where)
      .orderBy(desc(rollbackTriggers.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(rollbackTriggers).where(and(eq(rollbackTriggers.id, id), eq(rollbackTriggers.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    triggerCode: string; name: string; targetTable: string; conditionType: string;
    conditionParams: any; rollbackAction: string; actionParams?: any; createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(rollbackTriggers).values({
      triggerCode: input.triggerCode, name: input.name, targetTable: input.targetTable,
      conditionType: input.conditionType, conditionParams: input.conditionParams,
      rollbackAction: input.rollbackAction, actionParams: input.actionParams || null,
      isActive: 1, triggerCount: 0, version: 1,
      createdBy: input.createdBy || 'system', createdAt: now, updatedAt: now, isDeleted: 0,
    });
    return { success: true };
  },

  async toggleActive(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const existing = await this.getById(id);
    if (!existing) throw new Error('Rollback trigger not found');
    await db.update(rollbackTriggers).set({ isActive: existing.isActive === 1 ? 0 : 1, updatedAt: new Date() }).where(eq(rollbackTriggers.id, id));
    return this.getById(id);
  },

  async softDelete(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(rollbackTriggers).set({ isDeleted: 1, updatedAt: new Date() }).where(eq(rollbackTriggers.id, id));
    return { success: true };
  },
};

// ============================================
// 系统配置
// ============================================
export const systemConfigService = {
  async list(filters?: { category?: string; environment?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.category) conditions.push(eq(systemConfigs.category, filters.category));
    if (filters?.environment) conditions.push(eq(systemConfigs.environment, filters.environment));
    if (filters?.search) conditions.push(like(systemConfigs.configKey, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(systemConfigs).where(where);
    const rows = await db.select().from(systemConfigs)
      .where(where)
      .orderBy(asc(systemConfigs.category), asc(systemConfigs.configKey))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getByKey(configKey: string, environment?: string) {
    const db = await getDb();
    if (!db) return null;
    const conditions: any[] = [eq(systemConfigs.configKey, configKey)];
    if (environment) conditions.push(eq(systemConfigs.environment, environment));
    const [row] = await db.select().from(systemConfigs).where(and(...conditions));
    return row || null;
  },

  async upsert(input: {
    configKey: string; configValue: string; valueType: string; category: string;
    environment?: string; description?: string; isSensitive?: number; updatedBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const existing = await this.getByKey(input.configKey, input.environment);
    const now = new Date();
    if (existing) {
      // 记录变更日志
      await db.insert(configChangeLogs).values({
        configId: existing.id, configKey: existing.configKey,
        oldValue: existing.configValue, newValue: input.configValue,
        oldVersion: existing.version, newVersion: existing.version + 1,
        changeReason: 'manual update', changedBy: input.updatedBy || 'system', changedAt: now,
      });
      await db.update(systemConfigs).set({
        configValue: input.configValue, version: existing.version + 1,
        updatedAt: now, updatedBy: input.updatedBy || 'system',
      }).where(eq(systemConfigs.id, existing.id));
      return this.getByKey(input.configKey, input.environment);
    } else {
      await db.insert(systemConfigs).values({
        configKey: input.configKey, configValue: input.configValue,
        valueType: input.valueType, category: input.category,
        environment: input.environment || 'production',
        description: input.description || null, isSensitive: input.isSensitive ?? 0,
        version: 1, status: 'active', createdAt: now, createdBy: input.updatedBy || 'system',
        updatedAt: now, updatedBy: input.updatedBy || 'system',
      });
      return this.getByKey(input.configKey, input.environment);
    }
  },

  async getChangeHistory(configKey: string, limit?: number) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(configChangeLogs)
      .where(eq(configChangeLogs.configKey, configKey))
      .orderBy(desc(configChangeLogs.changedAt))
      .limit(limit ?? 20);
  },
};

// ============================================
// 异步任务日志
// ============================================
export const asyncTaskLogService = {
  async list(filters?: { taskType?: string; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.taskType) conditions.push(eq(asyncTaskLog.taskType, filters.taskType));
    if (filters?.status) conditions.push(eq(asyncTaskLog.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(asyncTaskLog).where(where);
    const rows = await db.select().from(asyncTaskLog)
      .where(where)
      .orderBy(desc(asyncTaskLog.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async create(input: { taskId: string; taskType: string; inputParams?: any; maxRetries?: number; createdBy?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(asyncTaskLog).values({
      taskId: input.taskId, taskType: input.taskType, inputParams: input.inputParams || null,
      status: 'pending', progress: '0', retryCount: 0, maxRetries: input.maxRetries ?? 3,
      createdAt: new Date(), createdBy: input.createdBy || 'system',
    });
    return { success: true, taskId: input.taskId };
  },

  async updateStatus(id: number, status: string, result?: { outputResult?: any; progress?: number; errorMessage?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status };
    if (status === 'running') updates.startedAt = new Date();
    if (status === 'completed' || status === 'failed') updates.completedAt = new Date();
    if (result?.outputResult !== undefined) updates.outputResult = result.outputResult;
    if (result?.progress !== undefined) updates.progress = result.progress;
    if (result?.errorMessage) updates.errorMessage = result.errorMessage;
    await db.update(asyncTaskLog).set(updates).where(eq(asyncTaskLog.id, id));
    return { success: true };
  },
};

// ============================================
// 消息队列日志
// ============================================
export const messageQueueLogService = {
  async list(filters?: { topic?: string; direction?: string; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.topic) conditions.push(eq(messageQueueLog.topic, filters.topic));
    if (filters?.direction) conditions.push(eq(messageQueueLog.direction, filters.direction));
    if (filters?.status) conditions.push(eq(messageQueueLog.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(messageQueueLog).where(where);
    const rows = await db.select().from(messageQueueLog)
      .where(where)
      .orderBy(desc(messageQueueLog.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async create(input: { messageId: string; topic: string; partitionKey?: string; payload: any; direction: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(messageQueueLog).values({
      messageId: input.messageId, topic: input.topic, partitionKey: input.partitionKey || null,
      payload: input.payload, direction: input.direction, status: 'pending', retryCount: 0, createdAt: new Date(),
    });
    return { success: true, messageId: input.messageId };
  },

  async updateStatus(id: number, status: string, errorMessage?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status };
    if (status === 'delivered') updates.deliveredAt = new Date();
    if (errorMessage) updates.errorMessage = errorMessage;
    if (status === 'failed') updates.retryCount = (await this.getById(id))?.retryCount ?? 0 + 1;
    await db.update(messageQueueLog).set(updates).where(eq(messageQueueLog.id, id));
    return { success: true };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(messageQueueLog).where(eq(messageQueueLog.id, id));
    return row || null;
  },
};
