/**
 * 系统拓扑扩展服务层
 * 提供 topoAlerts / topoLayers / topoSnapshots 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { topoAlerts, topoLayers, topoSnapshots } from '../../../drizzle/schema';
import { eq, and, desc, count } from 'drizzle-orm';

// ============================================
// 拓扑告警
// ============================================
export const topoAlertService = {
  async list(filters?: { nodeId?: string; alertType?: string; severity?: string; resolved?: number; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.nodeId) conditions.push(eq(topoAlerts.nodeId, filters.nodeId));
    if (filters?.alertType) conditions.push(eq(topoAlerts.alertType, filters.alertType));
    if (filters?.severity) conditions.push(eq(topoAlerts.severity, filters.severity));
    if (filters?.resolved !== undefined) conditions.push(eq(topoAlerts.resolved, filters.resolved));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(topoAlerts).where(where);
    const rows = await db.select().from(topoAlerts).where(where).orderBy(desc(topoAlerts.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { nodeId: string; alertType: string; severity: string; message: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(topoAlerts).values({ ...input, resolved: 0, createdAt: new Date() });
    return { success: true };
  },
  async resolve(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(topoAlerts).set({ resolved: 1, resolvedAt: new Date() }).where(eq(topoAlerts.id, id));
    return { success: true };
  },
};

// ============================================
// 拓扑层级
// ============================================
export const topoLayerService = {
  async list() {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(topoLayers).orderBy(topoLayers.layerOrder);
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(topoLayers).where(eq(topoLayers.id, id));
    return row || null;
  },
  async create(input: { layerCode: string; layerName: string; layerOrder: number; color?: string; description?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(topoLayers).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
  async update(id: number, input: Partial<{ layerName: string; layerOrder: number; color: string; description: string }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(topoLayers).set(input).where(eq(topoLayers.id, id));
    return this.getById(id);
  },
};

// ============================================
// 拓扑快照
// ============================================
export const topoSnapshotService = {
  async list(filters?: { page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(topoSnapshots);
    const rows = await db.select().from(topoSnapshots).orderBy(desc(topoSnapshots.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(topoSnapshots).where(eq(topoSnapshots.id, id));
    return row || null;
  },
  async create(input: { snapshotName: string; snapshotData: any; nodeCount: number; edgeCount: number; createdBy?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(topoSnapshots).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};
