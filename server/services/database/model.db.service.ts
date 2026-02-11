/**
 * 模型中心域服务层
 * 提供 modelRegistry / modelDeployments / modelTrainingJobs / modelInferenceLogs 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { modelRegistry, modelDeployments, modelTrainingJobs, modelInferenceLogs } from '../../../drizzle/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';

// ============================================
// 模型注册表
// ============================================
export const modelRegistryService = {
  async list(filters?: { modelType?: string; status?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.modelType) conditions.push(eq(modelRegistry.modelType, filters.modelType));
    if (filters?.status) conditions.push(eq(modelRegistry.status, filters.status));
    if (filters?.search) conditions.push(like(modelRegistry.modelName, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(modelRegistry).where(where);
    const rows = await db.select().from(modelRegistry).where(where).orderBy(desc(modelRegistry.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(modelRegistry).where(eq(modelRegistry.id, id));
    return row || null;
  },
  async getByCode(modelCode: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(modelRegistry).where(eq(modelRegistry.modelCode, modelCode));
    return row || null;
  },
  async create(input: { modelCode: string; modelName: string; modelType: string; framework?: string; version: string; description?: string; modelFileUrl?: string; metrics?: any; tags?: any; status?: string; createdBy?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(modelRegistry).values({ ...input, status: input.status ?? 'draft', createdAt: now, updatedAt: now });
    return this.getByCode(input.modelCode);
  },
  async update(id: number, input: Partial<{ modelName: string; framework: string; version: string; description: string; modelFileUrl: string; metrics: any; tags: any; status: string }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(modelRegistry).set({ ...input, updatedAt: new Date() }).where(eq(modelRegistry.id, id));
    return this.getById(id);
  },
};

// ============================================
// 模型部署
// ============================================
export const modelDeploymentService = {
  async list(filters?: { modelId?: number; environment?: string; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.modelId) conditions.push(eq(modelDeployments.modelId, filters.modelId));
    if (filters?.environment) conditions.push(eq(modelDeployments.environment, filters.environment));
    if (filters?.status) conditions.push(eq(modelDeployments.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(modelDeployments).where(where);
    const rows = await db.select().from(modelDeployments).where(where).orderBy(desc(modelDeployments.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(modelDeployments).where(eq(modelDeployments.id, id));
    return row || null;
  },
  async create(input: { modelId: number; deploymentName: string; environment: string; endpointUrl?: string; replicas: number; gpuType?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(modelDeployments).values({ ...input, status: 'pending', deployedAt: new Date(), createdAt: new Date() });
    return { success: true };
  },
  async updateStatus(id: number, status: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(modelDeployments).set({ status }).where(eq(modelDeployments.id, id));
    return { success: true };
  },
};

// ============================================
// 模型训练任务
// ============================================
export const modelTrainingJobService = {
  async list(filters?: { modelId?: number; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.modelId) conditions.push(eq(modelTrainingJobs.modelId, filters.modelId));
    if (filters?.status) conditions.push(eq(modelTrainingJobs.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(modelTrainingJobs).where(where);
    const rows = await db.select().from(modelTrainingJobs).where(where).orderBy(desc(modelTrainingJobs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(modelTrainingJobs).where(eq(modelTrainingJobs.id, id));
    return row || null;
  },
  async create(input: { modelId: number; jobName: string; trainingData?: any; hyperparams?: any; gpuType?: string; epochs?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(modelTrainingJobs).values({ ...input, status: 'pending', currentEpoch: 0, createdAt: new Date() });
    return { success: true };
  },
  async updateProgress(id: number, currentEpoch: number, loss?: number, status?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { currentEpoch };
    if (loss !== undefined) updates.loss = loss;
    if (status) {
      updates.status = status;
      if (status === 'running' && !updates.startedAt) updates.startedAt = new Date();
      if (status === 'completed' || status === 'failed') updates.completedAt = new Date();
    }
    await db.update(modelTrainingJobs).set(updates).where(eq(modelTrainingJobs.id, id));
    return { success: true };
  },
};

// ============================================
// 模型推理日志
// ============================================
export const modelInferenceLogService = {
  async list(filters?: { deploymentId?: number; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.deploymentId) conditions.push(eq(modelInferenceLogs.deploymentId, filters.deploymentId));
    if (filters?.status) conditions.push(eq(modelInferenceLogs.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(modelInferenceLogs).where(where);
    const rows = await db.select().from(modelInferenceLogs).where(where).orderBy(desc(modelInferenceLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { deploymentId: number; requestId: string; inputTokens?: number; outputTokens?: number; latencyMs?: number; status: string; errorMessage?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(modelInferenceLogs).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};
