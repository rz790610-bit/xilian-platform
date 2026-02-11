/**
 * 设备运维扩展服务层
 * 提供 alertEventLog / deviceDailySummary / deviceFirmwareVersions / deviceMaintenanceLogs / deviceStatusLog 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { alertEventLog, deviceDailySummary, deviceFirmwareVersions, deviceMaintenanceLogs, deviceStatusLog } from '../../../drizzle/schema';
import { eq, and, like, desc, count, gte, lte } from 'drizzle-orm';

// ============================================
// 告警事件日志
// ============================================
export const alertEventLogService = {
  async list(filters?: { deviceCode?: string; severity?: string; alertType?: string; acknowledged?: number; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(alertEventLog.deviceCode, filters.deviceCode));
    if (filters?.severity) conditions.push(eq(alertEventLog.severity, filters.severity));
    if (filters?.alertType) conditions.push(eq(alertEventLog.alertType, filters.alertType));
    if (filters?.acknowledged !== undefined) conditions.push(eq(alertEventLog.acknowledged, filters.acknowledged));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(alertEventLog).where(where);
    const rows = await db.select().from(alertEventLog).where(where).orderBy(desc(alertEventLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(alertEventLog).where(eq(alertEventLog.id, id));
    return row || null;
  },
  async create(input: { alertId: string; ruleId?: number; deviceCode: string; severity: string; alertType: string; message: string; metricValue?: number; thresholdValue?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(alertEventLog).values({ ...input, acknowledged: 0, createdAt: new Date() });
    return { success: true };
  },
  async acknowledge(id: number, acknowledgedBy: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(alertEventLog).set({ acknowledged: 1, acknowledgedBy, resolvedAt: new Date() }).where(eq(alertEventLog.id, id));
    return { success: true };
  },
};

// ============================================
// 设备日统计
// ============================================
export const deviceDailySummaryService = {
  async list(filters?: { deviceCode?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(deviceDailySummary.deviceCode, filters.deviceCode));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(deviceDailySummary).where(where);
    const rows = await db.select().from(deviceDailySummary).where(where).orderBy(desc(deviceDailySummary.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { deviceCode: string; summaryDate: string; onlineHours?: number; alertCount: number; dataPoints: number; avgCpuUsage?: number; avgMemoryUsage?: number; maxTemperature?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(deviceDailySummary).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};

// ============================================
// 设备固件版本
// ============================================
export const deviceFirmwareService = {
  async list(filters?: { deviceType?: string; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceType) conditions.push(eq(deviceFirmwareVersions.deviceType, filters.deviceType));
    if (filters?.status) conditions.push(eq(deviceFirmwareVersions.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(deviceFirmwareVersions).where(where);
    const rows = await db.select().from(deviceFirmwareVersions).where(where).orderBy(desc(deviceFirmwareVersions.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(deviceFirmwareVersions).where(eq(deviceFirmwareVersions.id, id));
    return row || null;
  },
  async create(input: { deviceType: string; firmwareVersion: string; releaseNotes?: string; fileUrl: string; fileHash: string; fileSize: number; isMandatory: number; status?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(deviceFirmwareVersions).values({ ...input, status: input.status ?? 'draft', createdAt: new Date() });
    return { success: true };
  },
  async updateStatus(id: number, status: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status };
    if (status === 'released') updates.releasedAt = new Date();
    await db.update(deviceFirmwareVersions).set(updates).where(eq(deviceFirmwareVersions.id, id));
    return { success: true };
  },
};

// ============================================
// 设备维护日志
// ============================================
export const deviceMaintenanceService = {
  async list(filters?: { deviceCode?: string; maintenanceType?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(deviceMaintenanceLogs.deviceCode, filters.deviceCode));
    if (filters?.maintenanceType) conditions.push(eq(deviceMaintenanceLogs.maintenanceType, filters.maintenanceType));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(deviceMaintenanceLogs).where(where);
    const rows = await db.select().from(deviceMaintenanceLogs).where(where).orderBy(desc(deviceMaintenanceLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(deviceMaintenanceLogs).where(eq(deviceMaintenanceLogs.id, id));
    return row || null;
  },
  async create(input: { deviceCode: string; maintenanceType: string; title: string; description?: string; operator: string; startedAt: Date; completedAt?: Date; result?: string; cost?: number; partsReplaced?: any; attachments?: any; nextMaintenanceDate?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(deviceMaintenanceLogs).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};

// ============================================
// 设备状态变更日志
// ============================================
export const deviceStatusLogService = {
  async list(filters?: { deviceCode?: string; currentStatus?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(deviceStatusLog.deviceCode, filters.deviceCode));
    if (filters?.currentStatus) conditions.push(eq(deviceStatusLog.currentStatus, filters.currentStatus));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(deviceStatusLog).where(where);
    const rows = await db.select().from(deviceStatusLog).where(where).orderBy(desc(deviceStatusLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { deviceCode: string; previousStatus?: string; currentStatus: string; reason?: string; triggeredBy?: string; metadata?: any }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(deviceStatusLog).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};
