/**
 * 诊断分析域服务层
 * 提供 anomalyModels / diagnosisResults 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { anomalyModels, diagnosisResults } from '../../../drizzle/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';

// ============================================
// 异常检测模型
// ============================================
export const anomalyModelService = {
  async list(filters?: { modelType?: string; status?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.modelType) conditions.push(eq(anomalyModels.modelType, filters.modelType));
    if (filters?.status) conditions.push(eq(anomalyModels.status, filters.status));
    if (filters?.search) conditions.push(like(anomalyModels.modelName, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(anomalyModels).where(where);
    const rows = await db.select().from(anomalyModels).where(where).orderBy(desc(anomalyModels.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(anomalyModels).where(eq(anomalyModels.id, id));
    return row || null;
  },
  async create(input: { modelCode: string; modelName: string; modelType: string; targetMetric: string; hyperparams?: any; trainingDataRange?: any; accuracy?: number; modelFileUrl?: string; status?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(anomalyModels).values({ ...input, status: input.status ?? 'draft', createdAt: now, updatedAt: now });
    return { success: true };
  },
  async update(id: number, input: Partial<{ modelName: string; hyperparams: any; accuracy: number; modelFileUrl: string; status: string }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(anomalyModels).set({ ...input, updatedAt: new Date() }).where(eq(anomalyModels.id, id));
    return this.getById(id);
  },
  async deploy(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(anomalyModels).set({ status: 'deployed', deployedAt: new Date(), updatedAt: new Date() }).where(eq(anomalyModels.id, id));
    return { success: true };
  },
};

// ============================================
// 诊断结果
// ============================================
export const diagnosisResultService = {
  async list(filters?: { deviceCode?: string; diagnosisType?: string; severity?: string; resolved?: number; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(diagnosisResults.deviceCode, filters.deviceCode));
    if (filters?.diagnosisType) conditions.push(eq(diagnosisResults.diagnosisType, filters.diagnosisType));
    if (filters?.severity) conditions.push(eq(diagnosisResults.severity, filters.severity));
    if (filters?.resolved !== undefined) conditions.push(eq(diagnosisResults.resolved, filters.resolved));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(diagnosisResults).where(where);
    const rows = await db.select().from(diagnosisResults).where(where).orderBy(desc(diagnosisResults.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(diagnosisResults).where(eq(diagnosisResults.id, id));
    return row || null;
  },
  async create(input: { taskId: number; deviceCode: string; diagnosisType: string; severity: string; faultCode?: string; faultDescription?: string; confidence?: number; evidence?: any; recommendation?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(diagnosisResults).values({ ...input, resolved: 0, createdAt: new Date() });
    return { success: true };
  },
  async resolve(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(diagnosisResults).set({ resolved: 1, resolvedAt: new Date() }).where(eq(diagnosisResults.id, id));
    return { success: true };
  },
};
