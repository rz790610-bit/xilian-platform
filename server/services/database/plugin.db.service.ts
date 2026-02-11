/**
 * 插件引擎服务层
 * 提供 pluginRegistry / pluginInstances / pluginEvents 的完整 CRUD
 * 
 * 数据链路: Drizzle schema → service CRUD → tRPC router → 前端组件
 */
import { getDb } from '../../lib/db';
import { pluginRegistry, pluginInstances, pluginEvents } from '../../../drizzle/schema';
import { eq, and, like, desc, asc, count, sql, gte, lte } from 'drizzle-orm';

// ============================================
// 插件注册表
// ============================================
export const pluginRegistryService = {
  async list(filters?: { pluginType?: string; status?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.pluginType) conditions.push(eq(pluginRegistry.pluginType, filters.pluginType));
    if (filters?.status) conditions.push(eq(pluginRegistry.status, filters.status));
    if (filters?.search) conditions.push(like(pluginRegistry.name, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(pluginRegistry).where(where);
    const rows = await db.select().from(pluginRegistry)
      .where(where)
      .orderBy(desc(pluginRegistry.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(pluginRegistry).where(eq(pluginRegistry.id, id));
    return row || null;
  },

  async getByCode(pluginCode: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(pluginRegistry).where(eq(pluginRegistry.pluginCode, pluginCode));
    return row || null;
  },

  async create(input: {
    pluginCode: string; name: string; pluginType: string; version: string;
    entryPoint: string; description?: string; configSchema?: any; defaultConfig?: any;
    capabilities?: any; dependencies?: any; author?: string; license?: string;
    isBuiltin?: number; createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(pluginRegistry).values({
      pluginCode: input.pluginCode, name: input.name, pluginType: input.pluginType,
      version: input.version, entryPoint: input.entryPoint,
      description: input.description || null, configSchema: input.configSchema || null,
      defaultConfig: input.defaultConfig || null, capabilities: input.capabilities || null,
      dependencies: input.dependencies || null, author: input.author || null,
      license: input.license || null, status: 'registered', isBuiltin: input.isBuiltin ?? 0,
      createdAt: now, createdBy: input.createdBy || 'system', updatedAt: now, updatedBy: input.createdBy || 'system',
    });
    return this.getByCode(input.pluginCode);
  },

  async update(id: number, input: Partial<{
    name: string; version: string; entryPoint: string; description: string;
    configSchema: any; defaultConfig: any; capabilities: any; dependencies: any;
    status: string; updatedBy: string;
  }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(pluginRegistry).set({ ...input, updatedAt: new Date() }).where(eq(pluginRegistry.id, id));
    return this.getById(id);
  },

  async delete(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(pluginRegistry).where(eq(pluginRegistry.id, id));
    return { success: true };
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { total: 0, active: 0, registered: 0, disabled: 0, builtin: 0 };
    const [total] = await db.select({ count: count() }).from(pluginRegistry);
    const [active] = await db.select({ count: count() }).from(pluginRegistry).where(eq(pluginRegistry.status, 'active'));
    const [registered] = await db.select({ count: count() }).from(pluginRegistry).where(eq(pluginRegistry.status, 'registered'));
    const [disabled] = await db.select({ count: count() }).from(pluginRegistry).where(eq(pluginRegistry.status, 'disabled'));
    const [builtin] = await db.select({ count: count() }).from(pluginRegistry).where(eq(pluginRegistry.isBuiltin, 1));
    return { total: total.count, active: active.count, registered: registered.count, disabled: disabled.count, builtin: builtin.count };
  },
};

// ============================================
// 插件实例
// ============================================
export const pluginInstanceService = {
  async list(filters?: { pluginId?: number; status?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.pluginId) conditions.push(eq(pluginInstances.pluginId, filters.pluginId));
    if (filters?.status) conditions.push(eq(pluginInstances.status, filters.status));
    if (filters?.search) conditions.push(like(pluginInstances.name, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(pluginInstances).where(where);
    const rows = await db.select().from(pluginInstances)
      .where(where)
      .orderBy(desc(pluginInstances.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(pluginInstances).where(eq(pluginInstances.id, id));
    return row || null;
  },

  async create(input: {
    instanceCode: string; pluginId: number; name: string;
    boundEntityType?: string; boundEntityId?: string; config?: any; createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(pluginInstances).values({
      instanceCode: input.instanceCode, pluginId: input.pluginId, name: input.name,
      boundEntityType: input.boundEntityType || null, boundEntityId: input.boundEntityId || null,
      config: input.config || null, runtimeState: null, status: 'created',
      createdAt: now, createdBy: input.createdBy || 'system', updatedAt: now,
    });
    return this.getById((await db.select({ id: pluginInstances.id }).from(pluginInstances)
      .where(eq(pluginInstances.instanceCode, input.instanceCode)))[0]?.id);
  },

  async updateStatus(id: number, status: string, errorMessage?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status, updatedAt: new Date() };
    if (status === 'running') updates.startedAt = new Date();
    if (status === 'running') updates.lastHeartbeatAt = new Date();
    if (errorMessage !== undefined) updates.errorMessage = errorMessage;
    await db.update(pluginInstances).set(updates).where(eq(pluginInstances.id, id));
    return this.getById(id);
  },

  async heartbeat(id: number, runtimeState?: any) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { lastHeartbeatAt: new Date(), updatedAt: new Date() };
    if (runtimeState !== undefined) updates.runtimeState = runtimeState;
    await db.update(pluginInstances).set(updates).where(eq(pluginInstances.id, id));
    return { success: true };
  },

  async delete(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(pluginInstances).where(eq(pluginInstances.id, id));
    return { success: true };
  },
};

// ============================================
// 插件事件
// ============================================
export const pluginEventService = {
  async list(filters?: { instanceId?: number; eventType?: string; severity?: string; processed?: number; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.instanceId) conditions.push(eq(pluginEvents.instanceId, filters.instanceId));
    if (filters?.eventType) conditions.push(eq(pluginEvents.eventType, filters.eventType));
    if (filters?.severity) conditions.push(eq(pluginEvents.severity, filters.severity));
    if (filters?.processed !== undefined) conditions.push(eq(pluginEvents.processed, filters.processed));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(pluginEvents).where(where);
    const rows = await db.select().from(pluginEvents)
      .where(where)
      .orderBy(desc(pluginEvents.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async emit(input: {
    eventId: string; instanceId: number; eventType: string; payload?: any;
    severity?: string; sourcePlugin?: string; targetPlugin?: string; expiresAt?: Date;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(pluginEvents).values({
      eventId: input.eventId, instanceId: input.instanceId, eventType: input.eventType,
      payload: input.payload || null, severity: input.severity || 'info',
      sourcePlugin: input.sourcePlugin || null, targetPlugin: input.targetPlugin || null,
      processed: 0, createdAt: new Date(), expiresAt: input.expiresAt || null,
    });
    return { success: true, eventId: input.eventId };
  },

  async markProcessed(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(pluginEvents).set({ processed: 1, processedAt: new Date() }).where(eq(pluginEvents.id, id));
    return { success: true };
  },
};
