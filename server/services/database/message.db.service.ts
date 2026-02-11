/**
 * 消息路由与文件存储域服务层
 * 提供 messageRoutingConfig / minioFileMetadata / minioUploadLogs 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { messageRoutingConfig, minioFileMetadata, minioUploadLogs } from '../../../drizzle/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';

// ============================================
// 消息路由配置
// ============================================
export const messageRoutingService = {
  async list(filters?: { search?: string; isEnabled?: number; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.isEnabled !== undefined) conditions.push(eq(messageRoutingConfig.isEnabled, filters.isEnabled));
    if (filters?.search) conditions.push(like(messageRoutingConfig.routeName, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(messageRoutingConfig).where(where);
    const rows = await db.select().from(messageRoutingConfig).where(where).orderBy(desc(messageRoutingConfig.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(messageRoutingConfig).where(eq(messageRoutingConfig.id, id));
    return row || null;
  },
  async create(input: { routeName: string; sourceTopic: string; targetTopic: string; filterExpr?: string; transformScript?: string; priority: number; isEnabled?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(messageRoutingConfig).values({ ...input, isEnabled: input.isEnabled ?? 1, createdAt: now, updatedAt: now });
    return { success: true };
  },
  async update(id: number, input: Partial<{ routeName: string; sourceTopic: string; targetTopic: string; filterExpr: string; transformScript: string; priority: number; isEnabled: number }>) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(messageRoutingConfig).set({ ...input, updatedAt: new Date() }).where(eq(messageRoutingConfig.id, id));
    return this.getById(id);
  },
};

// ============================================
// MinIO 文件元数据
// ============================================
export const minioFileService = {
  async list(filters?: { bucket?: string; contentType?: string; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.bucket) conditions.push(eq(minioFileMetadata.bucket, filters.bucket));
    if (filters?.contentType) conditions.push(eq(minioFileMetadata.contentType, filters.contentType));
    if (filters?.search) conditions.push(like(minioFileMetadata.objectKey, `%${filters.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(minioFileMetadata).where(where);
    const rows = await db.select().from(minioFileMetadata).where(where).orderBy(desc(minioFileMetadata.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(minioFileMetadata).where(eq(minioFileMetadata.id, id));
    return row || null;
  },
  async create(input: { bucket: string; objectKey: string; contentType: string; fileSize: number; etag?: string; tags?: any; uploadedBy?: string; expiresAt?: Date }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(minioFileMetadata).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};

// ============================================
// MinIO 上传日志
// ============================================
export const minioUploadLogService = {
  async list(filters?: { bucket?: string; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.bucket) conditions.push(eq(minioUploadLogs.bucket, filters.bucket));
    if (filters?.status) conditions.push(eq(minioUploadLogs.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(minioUploadLogs).where(where);
    const rows = await db.select().from(minioUploadLogs).where(where).orderBy(desc(minioUploadLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { bucket: string; objectKey: string; fileSize: number; uploadDurationMs?: number; status: string; errorMessage?: string; uploadedBy?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(minioUploadLogs).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};
