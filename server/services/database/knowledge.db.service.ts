/**
 * 知识库域服务层
 * 提供 kbChunks / kbConversationMessages / kbConversations / kbEmbeddings / kbQaPairs 的完整 CRUD
 */
import { getDb } from '../../lib/db';
import { kbChunks, kbConversationMessages, kbConversations, kbEmbeddings, kbQaPairs } from '../../../drizzle/schema';
import { eq, and, desc, count } from 'drizzle-orm';

// ============================================
// 知识库切片
// ============================================
export const kbChunkService = {
  async listByDocument(documentId: number, page = 1, pageSize = 50) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const [totalResult] = await db.select({ count: count() }).from(kbChunks).where(eq(kbChunks.documentId, documentId));
    const rows = await db.select().from(kbChunks).where(eq(kbChunks.documentId, documentId)).orderBy(kbChunks.chunkIndex).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(kbChunks).where(eq(kbChunks.id, id));
    return row || null;
  },
  async create(input: { documentId: number; chunkIndex: number; content: string; tokenCount?: number; metadata?: any; embeddingId?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(kbChunks).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
  async deleteByDocument(documentId: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.delete(kbChunks).where(eq(kbChunks.documentId, documentId));
    return { success: true };
  },
};

// ============================================
// 知识库对话
// ============================================
export const kbConversationService = {
  async list(filters?: { collectionId?: number; userId?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.collectionId) conditions.push(eq(kbConversations.collectionId, filters.collectionId));
    if (filters?.userId) conditions.push(eq(kbConversations.userId, filters.userId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(kbConversations).where(where);
    const rows = await db.select().from(kbConversations).where(where).orderBy(desc(kbConversations.updatedAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(kbConversations).where(eq(kbConversations.id, id));
    return row || null;
  },
  async create(input: { collectionId: number; title?: string; userId: string; modelName?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(kbConversations).values({ ...input, messageCount: 0, createdAt: now, updatedAt: now });
    return { success: true };
  },
};

// ============================================
// 知识库对话消息
// ============================================
export const kbConversationMessageService = {
  async listByConversation(conversationId: number, page = 1, pageSize = 50) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const [totalResult] = await db.select({ count: count() }).from(kbConversationMessages).where(eq(kbConversationMessages.conversationId, conversationId));
    const rows = await db.select().from(kbConversationMessages).where(eq(kbConversationMessages.conversationId, conversationId)).orderBy(kbConversationMessages.createdAt).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { conversationId: number; role: string; content: string; tokenCount?: number; sources?: any }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(kbConversationMessages).values({ ...input, createdAt: new Date() });
    // 更新对话消息计数
    const conv = await db.select().from(kbConversations).where(eq(kbConversations.id, input.conversationId));
    if (conv.length > 0) {
      await db.update(kbConversations).set({ messageCount: conv[0].messageCount + 1, updatedAt: new Date() }).where(eq(kbConversations.id, input.conversationId));
    }
    return { success: true };
  },
  async feedback(id: number, feedback: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(kbConversationMessages).set({ feedback }).where(eq(kbConversationMessages.id, id));
    return { success: true };
  },
};

// ============================================
// 知识库向量嵌入
// ============================================
export const kbEmbeddingService = {
  async listByChunk(chunkId: number) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(kbEmbeddings).where(eq(kbEmbeddings.chunkId, chunkId));
  },
  async create(input: { chunkId: number; modelName: string; dimensions: number; vectorData: string; norm?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(kbEmbeddings).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
};

// ============================================
// 知识库 QA 对
// ============================================
export const kbQaPairService = {
  async list(filters?: { collectionId?: number; isVerified?: number; search?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.collectionId) conditions.push(eq(kbQaPairs.collectionId, filters.collectionId));
    if (filters?.isVerified !== undefined) conditions.push(eq(kbQaPairs.isVerified, filters.isVerified));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(kbQaPairs).where(where);
    const rows = await db.select().from(kbQaPairs).where(where).orderBy(desc(kbQaPairs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { collectionId: number; question: string; answer: string; sourceDocumentId?: number; confidence?: number; tags?: any }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(kbQaPairs).values({ ...input, isVerified: 0, createdAt: now, updatedAt: now });
    return { success: true };
  },
  async verify(id: number) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(kbQaPairs).set({ isVerified: 1, updatedAt: new Date() }).where(eq(kbQaPairs.id, id));
    return { success: true };
  },
};
