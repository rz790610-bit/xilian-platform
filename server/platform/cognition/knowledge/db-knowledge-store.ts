/**
 * ============================================================================
 * K4: DB 持久化适配器 (DbKnowledgeStore)
 * ============================================================================
 *
 * Phase 4 v5.0 升级：
 *   - 并发安全的保存（content_hash + ON DUPLICATE KEY UPDATE）
 *   - 原子自增 incrementVerification（BUG-3 修复）
 *   - 改进的 findSimilar（按创建时间优先，TF-IDF 文本相似度）
 *   - TTL 缓存层（300s）
 *   - 向量嵌入接口预留（Phase 5）
 *   - 应用追踪（crystal_applications）
 *   - 迁移追踪（crystal_migrations）
 *
 * FSD 路径：features/knowledge-crystal/model/db-knowledge-store.ts
 */

import crypto from 'crypto';
import { getDb } from '../../../lib/db';
import { eq, desc, and, gt, sql } from 'drizzle-orm';
import {
  knowledgeCrystals,
  crystalApplications,
  crystalMigrations,
} from '../../../../drizzle/evolution-schema';
import { createModuleLogger } from '../../../core/logger';

const logger = createModuleLogger('db-knowledge-store');

// ============================================================================
// 接口定义
// ============================================================================

/** 向量嵌入提供者接口（Phase 5 实现） */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
}

/** 结晶应用记录 */
export interface CrystalApplicationRecord {
  crystalId: number;
  appliedIn: string;
  contextSummary?: string;
  outcome?: 'positive' | 'negative' | 'neutral';
}

/** 结晶迁移请求 */
export interface CrystalMigrationRequest {
  crystalId: number;
  fromProfile: string;
  toProfile: string;
  adaptations: Array<{
    field: string;
    originalValue: unknown;
    adaptedValue: unknown;
    reason: string;
  }>;
}

// ============================================================================
// 简易 TTL 缓存
// ============================================================================

class TTLCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();

  constructor(private ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// MD5 工具
// ============================================================================

function md5(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// ============================================================================
// TF-IDF 文本相似度
// ============================================================================

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(Boolean);
}

function tfidfSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

// ============================================================================
// DbKnowledgeStore 实现
// ============================================================================

export class DbKnowledgeStore {
  private cache: TTLCache<string, any[]>;
  private embeddingProvider?: EmbeddingProvider;

  constructor(opts?: { embeddingProvider?: EmbeddingProvider }) {
    this.cache = new TTLCache(300_000); // 300s TTL
    this.embeddingProvider = opts?.embeddingProvider;
  }

  /**
   * 并发安全的保存（content_hash 去重）
   * 如果 content_hash 冲突，则自增 verificationCount
   */
  async save(crystal: {
    name: string;
    type: string;
    pattern: Record<string, unknown>;
    confidence: number;
    sourceType?: string;
    sourceSessionIds?: string[];
    createdBy?: string;
  }): Promise<{ id: number; deduplicated: boolean }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const contentHash = md5(JSON.stringify(crystal.pattern));
    const sourceType = crystal.sourceType ?? 'cognition';
    const createdBy = crystal.createdBy ?? `system:${sourceType}`;

    try {
      const [result] = await db.insert(knowledgeCrystals)
        .values({
          name: crystal.name,
          type: crystal.type,
          pattern: JSON.stringify(crystal.pattern),
          confidence: crystal.confidence,
          sourceType,
          contentHash,
          createdBy,
          status: 'draft',
          applicationCount: 0,
          negativeFeedbackRate: 0,
        } as any)
        .onDuplicateKeyUpdate({
          set: {
            verificationCount: sql`verification_count + 1`,
            lastVerifiedAt: new Date(),
          },
        });

      this.cache.invalidate(`type:${crystal.type}`);
      logger.info(`结晶保存成功: ${crystal.name} (hash=${contentHash})`);

      return { id: (result as any).insertId, deduplicated: false };
    } catch (error) {
      logger.error('结晶保存失败', { error, crystal: crystal.name });
      throw error;
    }
  }

  /**
   * 原子自增验证次数（BUG-3 修复）
   * 同时更新 negativeFeedbackRate（滑动平均）
   */
  async incrementVerification(
    id: number,
    outcome: 'positive' | 'negative' | 'neutral' = 'positive',
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(knowledgeCrystals)
      .set({
        verificationCount: sql`verification_count + 1`,
        lastVerifiedAt: new Date(),
        negativeFeedbackRate: outcome === 'negative'
          ? sql`(negative_feedback_rate * application_count + 1) / (application_count + 1)`
          : outcome === 'positive'
            ? sql`(negative_feedback_rate * application_count) / (application_count + 1)`
            : sql`negative_feedback_rate`,
        applicationCount: sql`application_count + 1`,
      } as any)
      .where(eq(knowledgeCrystals.id, id));
  }

  /**
   * 改进的 findSimilar（按创建时间优先，避免马太效应）
   * Phase 5: 向量匹配
   */
  async findSimilar(
    type: string,
    pattern: Record<string, unknown>,
    limit: number = 20,
  ): Promise<any | null> {
    const db = await getDb();
    if (!db) return null;

    // 1. 先检查 content_hash 精确匹配
    const contentHash = md5(JSON.stringify(pattern));
    const exactMatch = await db.select().from(knowledgeCrystals)
      .where(
        and(
          eq(knowledgeCrystals.type, type as any),
          eq(knowledgeCrystals.contentHash, contentHash),
        )
      )
      .limit(1);
    if (exactMatch.length > 0) return exactMatch[0];

    // 2. 向量匹配（Phase 5 实现）
    if (this.embeddingProvider) {
      // const embedding = await this.embeddingProvider.embed(JSON.stringify(pattern));
      // 向量匹配逻辑预留
    }

    // 3. 回退：TF-IDF 文本相似度
    const cacheKey = `type:${type}`;
    let candidates: any[] | undefined = this.cache.get(cacheKey);
    if (!candidates) {
      candidates = await db.select().from(knowledgeCrystals)
        .where(eq(knowledgeCrystals.type, type as any))
        .orderBy(desc(knowledgeCrystals.createdAt))  // 按创建时间优先
        .limit(limit);
      this.cache.set(cacheKey, candidates ?? []);
    }

    const targetText = JSON.stringify(pattern);
    for (const c of (candidates ?? []))  {
      const patternText = typeof c.pattern === 'string' ? c.pattern : JSON.stringify(c.pattern);
      const similarity = tfidfSimilarity(targetText, patternText);
      if (similarity > 0.8) return c;
    }

    return null;
  }

  // ============================================================================
  // 应用追踪
  // ============================================================================

  /**
   * 记录结晶应用
   */
  async recordApplication(record: CrystalApplicationRecord): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const [result] = await db.insert(crystalApplications).values({
      crystalId: record.crystalId,
      appliedIn: record.appliedIn,
      contextSummary: record.contextSummary ?? null,
      outcome: record.outcome ?? null,
    } as any);

    // 同步更新结晶的 applicationCount
    await this.incrementVerification(record.crystalId, record.outcome ?? 'neutral');

    return (result as any).insertId;
  }

  /**
   * 查询结晶应用效果
   */
  async getApplicationStats(crystalId: number): Promise<{
    totalApplications: number;
    positiveRate: number;
    negativeRate: number;
    recentApplications: any[];
  }> {
    const db = await getDb();
    if (!db) return { totalApplications: 0, positiveRate: 0, negativeRate: 0, recentApplications: [] };
    const apps = await db.select()
      .from(crystalApplications)
      .where(eq(crystalApplications.crystalId, crystalId))
      .orderBy(desc(crystalApplications.appliedAt));

    const total = apps.length;
    const positive = apps.filter((a: any) => a.outcome === 'positive').length;
    const negative = apps.filter((a: any) => a.outcome === 'negative').length;

    return {
      totalApplications: total,
      positiveRate: total > 0 ? positive / total : 0,
      negativeRate: total > 0 ? negative / total : 0,
      recentApplications: apps.slice(0, 10),
    };
  }

  // ============================================================================
  // 迁移追踪
  // ============================================================================

  /**
   * 创建迁移记录
   */
  async createMigration(request: CrystalMigrationRequest): Promise<{
    migrationId: number;
    newCrystalId: number;
  }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // 1. 获取源结晶
    const source = await db.select().from(knowledgeCrystals)
      .where(eq(knowledgeCrystals.id, request.crystalId))
      .limit(1);
    if (!source[0]) throw new Error(`Crystal ${request.crystalId} not found`);

    // 2. 创建迁移记录
    const [migration] = await db.insert(crystalMigrations).values({
      crystalId: request.crystalId,
      fromProfile: request.fromProfile,
      toProfile: request.toProfile,
      adaptations: JSON.stringify(request.adaptations),
      status: 'pending',
    } as any);

    // 3. 应用适配调整，创建新结晶
    const sourcePattern = typeof source[0].pattern === 'string'
      ? JSON.parse(source[0].pattern)
      : source[0].pattern;
    const newPattern = applyAdaptations(sourcePattern, request.adaptations);
    const contentHash = md5(JSON.stringify(newPattern));

    const [newCrystal] = await db.insert(knowledgeCrystals).values({
      name: `${(source[0] as any).name ?? '结晶'} [迁移→${request.toProfile}]`,
      type: source[0].type as any,
      pattern: JSON.stringify(newPattern),
      confidence: (source[0].confidence ?? 0.5) * 0.8,  // 迁移后置信度打折
      sourceType: source[0].sourceType ?? 'cognition',
      status: 'draft',
      contentHash,
      createdBy: 'system:migration',
      applicationCount: 0,
      negativeFeedbackRate: 0,
    } as any).onDuplicateKeyUpdate({
      set: { verificationCount: sql`verification_count + 1` },
    });

    // 4. 更新迁移记录（成功时必须写入 new_crystal_id）
    const migrationId = (migration as any).insertId;
    const newCrystalId = (newCrystal as any).insertId;

    await db.update(crystalMigrations).set({
      newCrystalId,
      status: 'success',
    } as any).where(eq(crystalMigrations.id, migrationId));

    logger.info(`结晶迁移成功: ${request.crystalId} → ${newCrystalId} (${request.fromProfile} → ${request.toProfile})`);

    return { migrationId, newCrystalId };
  }

  // ============================================================================
  // K7: 自动失效检查
  // ============================================================================

  /**
   * 自动失效：扫描 approved 状态结晶，负面反馈率 > 40% 且应用 > 5 次时降级为 pending_review
   */
  async autoDeprecationCheck(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    const candidates = await db.select().from(knowledgeCrystals)
      .where(
        and(
          eq(knowledgeCrystals.status, 'approved'),
          gt(knowledgeCrystals.negativeFeedbackRate, 0.4),
          gt(knowledgeCrystals.applicationCount, 5),
        )
      );

    let deprecatedCount = 0;
    for (const c of (candidates ?? [])) {
      await db.update(knowledgeCrystals).set({
        status: 'pending_review',
        reviewComment: `自动降级：负面反馈率 ${(((c as any).negativeFeedbackRate ?? 0) * 100).toFixed(1)}% 超过阈值 40%`,
      } as any).where(eq(knowledgeCrystals.id, c.id));

      logger.warn(`Crystal ${c.id} auto-deprecated: NFR=${c.negativeFeedbackRate}`);
      deprecatedCount++;
    }

    return deprecatedCount;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 应用适配调整到 pattern
 */
function applyAdaptations(
  pattern: Record<string, unknown>,
  adaptations: Array<{ field: string; adaptedValue: unknown }>,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(pattern));
  for (const adaptation of adaptations) {
    const parts = adaptation.field.split('.');
    let current: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = adaptation.adaptedValue;
  }
  return result;
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建 DB 知识存储 */
export function createDbKnowledgeStore(
  opts?: { embeddingProvider?: EmbeddingProvider },
): DbKnowledgeStore {
  return new DbKnowledgeStore(opts);
}
