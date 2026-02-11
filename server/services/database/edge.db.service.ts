/**
 * 边缘采集域服务层
 * 提供 edgeGatewayConfig 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { edgeGatewayConfig } from '../../../drizzle/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';

export const edgeGatewayConfigService = {
  async list(filters?: { gatewayType?: string; status?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.gatewayType) conditions.push(eq(edgeGatewayConfig.gatewayType, filters.gatewayType));
    if (filters?.status) conditions.push(eq(edgeGatewayConfig.status, filters.status));
    if (filters?.search) conditions.push(like(edgeGatewayConfig.gatewayName, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(edgeGatewayConfig).where(where);
    const rows = await db.select().from(edgeGatewayConfig).where(where).orderBy(desc(edgeGatewayConfig.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(edgeGatewayConfig).where(eq(edgeGatewayConfig.id, id));
    return row || null;
  },
  async getByCode(gatewayCode: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(edgeGatewayConfig).where(eq(edgeGatewayConfig.gatewayCode, gatewayCode));
    return row || null;
  },
  async create(input: { gatewayCode: string; gatewayName: string; gatewayType: string; ipAddress?: string; port?: number; firmwareVersion?: string; protocols?: any; maxDevices: number; heartbeatInterval: number; status?: string; location?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(edgeGatewayConfig).values({ ...input, status: input.status ?? 'offline', createdAt: now, updatedAt: now });
    return this.getByCode(input.gatewayCode);
  },
  async update(id: number, input: Partial<{ gatewayName: string; ipAddress: string; port: number; firmwareVersion: string; protocols: any; maxDevices: number; heartbeatInterval: number; status: string; location: string }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(edgeGatewayConfig).set({ ...input, updatedAt: new Date() }).where(eq(edgeGatewayConfig.id, id));
    return this.getById(id);
  },
  async heartbeat(gatewayCode: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(edgeGatewayConfig).set({ lastHeartbeat: new Date(), status: 'online', updatedAt: new Date() }).where(eq(edgeGatewayConfig.gatewayCode, gatewayCode));
    return { success: true };
  },
};
