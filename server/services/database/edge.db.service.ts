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
    // P2-12: IP 地址格式校验
    if (input.ipAddress && !isValidIpAddress(input.ipAddress)) {
      throw new Error(`Invalid IP address format: ${input.ipAddress}`);
    }
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
  /**
   * 处理网关心跳
   * P2-12: 添加 gatewayCode 存在性校验，避免对不存在的网关执行无效 UPDATE
   */
  async heartbeat(gatewayCode: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    // P2-12: 先检查网关是否存在
    const existing = await this.getByCode(gatewayCode);
    if (!existing) {
      throw new Error(`Gateway not found: ${gatewayCode}`);
    }
    const now = new Date();
    await db.update(edgeGatewayConfig)
      .set({ lastHeartbeat: now, status: 'online', updatedAt: now })
      .where(eq(edgeGatewayConfig.gatewayCode, gatewayCode));
    return { success: true, gatewayCode };
  },
};

/**
 * P2-12: IP 地址格式校验（支持 IPv4 和 IPv6）
 */
function isValidIpAddress(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  if (ipv4Regex.test(ip)) return true;
  // IPv6 (简化校验)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Regex.test(ip)) return true;
  return false;
}
