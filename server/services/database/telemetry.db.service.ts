/**
 * 实时遥测域服务层
 * 提供 realtimeDataLatest / vibration1hourAgg 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { realtimeDataLatest, vibration1hourAgg } from '../../../drizzle/schema';
import { eq, and, desc, count, gte, lte } from 'drizzle-orm';

// ============================================
// 实时数据最新值
// ============================================
export const realtimeDataService = {
  async list(filters?: { deviceCode?: string; mpCode?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(realtimeDataLatest.deviceCode, filters.deviceCode));
    if (filters?.mpCode) conditions.push(eq(realtimeDataLatest.mpCode, filters.mpCode));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(realtimeDataLatest).where(where);
    const rows = await db.select().from(realtimeDataLatest).where(where).orderBy(desc(realtimeDataLatest.updatedAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getLatest(deviceCode: string, mpCode: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(realtimeDataLatest).where(and(eq(realtimeDataLatest.deviceCode, deviceCode), eq(realtimeDataLatest.mpCode, mpCode)));
    return row || null;
  },
  async upsert(input: { deviceCode: string; mpCode: string; value?: number; stringValue?: string; quality: number; sourceTimestamp: Date; serverTimestamp: Date }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    // Try update first, then insert
    const existing = await this.getLatest(input.deviceCode, input.mpCode);
    if (existing) {
      await db.update(realtimeDataLatest).set({ ...input, updatedAt: new Date() }).where(eq(realtimeDataLatest.id, existing.id));
    } else {
      await db.insert(realtimeDataLatest).values({ ...input, updatedAt: new Date() });
    }
    return { success: true };
  },
};

// ============================================
// 振动1小时聚合
// ============================================
export const vibrationAggService = {
  async list(filters?: { deviceCode?: string; mpCode?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(vibration1hourAgg.deviceCode, filters.deviceCode));
    if (filters?.mpCode) conditions.push(eq(vibration1hourAgg.mpCode, filters.mpCode));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(vibration1hourAgg).where(where);
    const rows = await db.select().from(vibration1hourAgg).where(where).orderBy(desc(vibration1hourAgg.hourStart)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { deviceCode: string; mpCode: string; hourStart: Date; rmsAvg?: number; rmsMax?: number; peakAvg?: number; peakMax?: number; kurtosisAvg?: number; sampleCount: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(vibration1hourAgg).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};
