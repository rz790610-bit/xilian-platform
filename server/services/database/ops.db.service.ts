/**
 * 运维管理服务层
 * 提供 auditLogs / alertRules / dataExportTasks 的完整 CRUD
 * 
 * 数据链路: Drizzle schema → service CRUD → tRPC router → 前端组件
 */
import { getDb } from '../../lib/db';
import { auditLogs, alertRules, dataExportTasks } from '../../../drizzle/schema';
import { eq, and, like, desc, asc, count, sql, gte, lte } from 'drizzle-orm';

// ============================================
// 审计日志
// ============================================
export const auditLogService = {
  async list(filters?: { action?: string; resourceType?: string; operator?: string; startDate?: Date; endDate?: Date; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters?.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType));
    if (filters?.operator) conditions.push(like(auditLogs.operator, `%${filters.operator}%`));
    if (filters?.startDate) conditions.push(gte(auditLogs.createdAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(auditLogs.createdAt, filters.endDate));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(auditLogs).where(where);
    const rows = await db.select().from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async create(input: {
    action: string; resourceType: string; resourceId: string; operator: string;
    operatorIp?: string; oldValue?: any; newValue?: any; result?: string;
    errorMessage?: string; durationMs?: number; traceId?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(auditLogs).values({
      action: input.action, resourceType: input.resourceType, resourceId: input.resourceId,
      operator: input.operator, operatorIp: input.operatorIp || null,
      oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
      newValue: input.newValue ? JSON.stringify(input.newValue) : null,
      result: input.result || 'success', errorMessage: input.errorMessage || null,
      durationMs: input.durationMs || null, traceId: input.traceId || null,
      createdAt: new Date(),
    });
    return { success: true };
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { total: 0, today: 0, errors: 0 };
    const [total] = await db.select({ count: count() }).from(auditLogs);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [todayCount] = await db.select({ count: count() }).from(auditLogs).where(gte(auditLogs.createdAt, today));
    const [errors] = await db.select({ count: count() }).from(auditLogs).where(eq(auditLogs.result, 'error'));
    return { total: total.count, today: todayCount.count, errors: errors.count };
  },
};

// ============================================
// 告警规则
// ============================================
export const alertRuleService = {
  async list(filters?: { deviceType?: string; severity?: string; isActive?: number; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [eq(alertRules.isDeleted, 0)];
    if (filters?.deviceType) conditions.push(eq(alertRules.deviceType, filters.deviceType));
    if (filters?.severity) conditions.push(eq(alertRules.severity, filters.severity));
    if (filters?.isActive !== undefined) conditions.push(eq(alertRules.isActive, filters.isActive));
    if (filters?.search) conditions.push(like(alertRules.name, `%${filters.search}%`));
    const where = and(...conditions);
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(alertRules).where(where);
    const rows = await db.select().from(alertRules)
      .where(where)
      .orderBy(desc(alertRules.priority), desc(alertRules.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    ruleCode: string; name: string; deviceType: string; measurementType: string;
    severity: string; condition: any; cooldownSeconds?: number;
    notificationChannels?: any; priority?: number; description?: string; createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(alertRules).values({
      ruleCode: input.ruleCode, name: input.name, deviceType: input.deviceType,
      measurementType: input.measurementType, severity: input.severity,
      condition: input.condition, cooldownSeconds: input.cooldownSeconds ?? 300,
      notificationChannels: input.notificationChannels || null,
      isActive: 1, priority: input.priority ?? 0, description: input.description || null,
      version: 1, createdBy: input.createdBy || 'system', createdAt: now,
      updatedBy: input.createdBy || 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getById((await db.select({ id: alertRules.id }).from(alertRules)
      .where(eq(alertRules.ruleCode, input.ruleCode)))[0]?.id);
  },

  async update(id: number, input: Partial<{
    name: string; severity: string; condition: any; cooldownSeconds: number;
    notificationChannels: any; isActive: number; priority: number; description: string; updatedBy: string;
  }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const existing = await this.getById(id);
    if (!existing) throw new Error('Alert rule not found');
    await db.update(alertRules).set({
      ...input, version: existing.version + 1, updatedAt: new Date(),
    }).where(eq(alertRules.id, id));
    return this.getById(id);
  },

  async softDelete(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(alertRules).set({ isDeleted: 1, updatedAt: new Date() }).where(eq(alertRules.id, id));
    return { success: true };
  },

  async toggleActive(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const existing = await this.getById(id);
    if (!existing) throw new Error('Alert rule not found');
    await db.update(alertRules).set({ isActive: existing.isActive === 1 ? 0 : 1, updatedAt: new Date() }).where(eq(alertRules.id, id));
    return this.getById(id);
  },
};

// ============================================
// 数据导出任务
// ============================================
export const dataExportTaskService = {
  async list(filters?: { exportType?: string; status?: string; createdBy?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.exportType) conditions.push(eq(dataExportTasks.exportType, filters.exportType));
    if (filters?.status) conditions.push(eq(dataExportTasks.status, filters.status));
    if (filters?.createdBy) conditions.push(eq(dataExportTasks.createdBy, filters.createdBy));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(dataExportTasks).where(where);
    const rows = await db.select().from(dataExportTasks)
      .where(where)
      .orderBy(desc(dataExportTasks.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(dataExportTasks).where(eq(dataExportTasks.id, id));
    return row || null;
  },

  async create(input: {
    taskCode: string; name: string; exportType: string; format: string;
    queryParams: any; createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(dataExportTasks).values({
      taskCode: input.taskCode, name: input.name, exportType: input.exportType,
      format: input.format, queryParams: input.queryParams,
      status: 'pending', progress: '0', createdBy: input.createdBy || 'system', createdAt: new Date(),
    });
    return this.getById((await db.select({ id: dataExportTasks.id }).from(dataExportTasks)
      .where(eq(dataExportTasks.taskCode, input.taskCode)))[0]?.id);
  },

  async updateProgress(id: number, progress: number, totalRows?: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { progress: String(progress), status: progress >= 100 ? 'completed' : 'running' };
    if (totalRows !== undefined) updates.totalRows = totalRows;
    if (progress >= 100) updates.completedAt = new Date();
    await db.update(dataExportTasks).set(updates).where(eq(dataExportTasks.id, id));
    return this.getById(id);
  },

  async updateResult(id: number, result: { storagePath: string; downloadUrl: string; fileSize: number; totalRows: number; expiresAt?: Date }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(dataExportTasks).set({
      storagePath: result.storagePath, downloadUrl: result.downloadUrl,
      fileSize: result.fileSize, totalRows: result.totalRows,
      expiresAt: result.expiresAt || null, status: 'completed', progress: '100', completedAt: new Date(),
    }).where(eq(dataExportTasks.id, id));
    return this.getById(id);
  },

  async markFailed(id: number, errorMessage: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(dataExportTasks).set({ status: 'failed', errorMessage, completedAt: new Date() }).where(eq(dataExportTasks.id, id));
    return this.getById(id);
  },
};
