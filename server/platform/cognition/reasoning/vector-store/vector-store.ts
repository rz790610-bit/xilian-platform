/**
 * ============================================================================
 * Phase 2 — VectorStore 内存向量检索引擎
 * ============================================================================
 *
 * 轻量级内存向量存储，为 ExperiencePool 和 PhysicsVerifier 提供
 * 语义检索能力。设计为可替换为 pgvector 的适配层。
 *
 * 特性：
 *   1. 余弦相似度 / 欧氏距离 / 点积 三种度量
 *   2. 元数据过滤（支持精确匹配和范围查询）
 *   3. 批量 upsert / 删除
 *   4. 自动归一化（余弦相似度模式下）
 *   5. 可序列化（支持 JSON 导入导出）
 *
 * 性能：
 *   - 暴力搜索 O(N×D)，适用于 N < 10000 的场景
 *   - 后续可通过 HNSW 索引优化大规模场景
 */

import { createModuleLogger } from '../../../../core/logger';
import type { VectorStoreConfig, VectorQuery, VectorSearchResult } from '../reasoning.types';

const logger = createModuleLogger('vector-store');

// ============================================================================
// 内部文档结构
// ============================================================================

interface StoredDocument {
  id: string;
  vector: number[];
  normalizedVector: number[];  // 预计算归一化向量（余弦相似度优化）
  metadata: Record<string, unknown>;
  insertedAt: Date;
}

// ============================================================================
// VectorStore
// ============================================================================

export class VectorStore {
  private readonly config: VectorStoreConfig;
  private readonly documents: Map<string, StoredDocument> = new Map();

  constructor(config?: Partial<VectorStoreConfig>) {
    this.config = {
      dimensions: 64,
      metric: 'cosine',
      indexType: 'flat',
      ...config,
    };
    logger.info({
      dimensions: this.config.dimensions,
      metric: this.config.metric,
    }, '[VectorStore] 初始化完成');
  }

  // =========================================================================
  // 写入 API
  // =========================================================================

  /** 插入或更新单个文档 */
  upsert(id: string, vector: number[], metadata: Record<string, unknown> = {}): void {
    this.validateVector(vector);
    const normalizedVector = this.normalize(vector);
    this.documents.set(id, {
      id,
      vector: [...vector],
      normalizedVector,
      metadata,
      insertedAt: new Date(),
    });
  }

  /** 批量插入或更新 */
  batchUpsert(items: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>): number {
    let count = 0;
    for (const item of items) {
      try {
        this.upsert(item.id, item.vector, item.metadata ?? {});
        count++;
      } catch (err) {
        logger.warn({ id: item.id, error: String(err) }, '[VectorStore] 批量 upsert 跳过无效文档');
      }
    }
    return count;
  }

  /** 删除文档 */
  delete(id: string): boolean {
    return this.documents.delete(id);
  }

  /** 批量删除 */
  batchDelete(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      if (this.documents.delete(id)) count++;
    }
    return count;
  }

  // =========================================================================
  // 检索 API
  // =========================================================================

  /** 向量相似度搜索 */
  search(query: VectorQuery): VectorSearchResult[] {
    this.validateVector(query.vector);

    const queryNormalized = this.normalize(query.vector);
    const minSim = query.minSimilarity ?? 0;
    const results: Array<VectorSearchResult & { _score: number }> = [];

    for (const doc of this.documents.values()) {
      // 元数据过滤
      if (query.filter && !this.matchesFilter(doc.metadata, query.filter)) {
        continue;
      }

      // 计算相似度
      const similarity = this.computeSimilarity(queryNormalized, doc.normalizedVector, doc.vector);

      if (similarity >= minSim) {
        results.push({
          id: doc.id,
          similarity,
          metadata: doc.metadata,
          _score: similarity,
        });
      }
    }

    // 按相似度降序排序，取 top-K
    results.sort((a, b) => b._score - a._score);
    const topK = results.slice(0, query.topK);

    return topK.map(({ _score, ...rest }) => rest);
  }

  /** 根据 ID 获取文档 */
  get(id: string): { vector: number[]; metadata: Record<string, unknown> } | null {
    const doc = this.documents.get(id);
    if (!doc) return null;
    return { vector: [...doc.vector], metadata: doc.metadata };
  }

  /** 获取文档总数 */
  size(): number {
    return this.documents.size;
  }

  // =========================================================================
  // 序列化 API
  // =========================================================================

  /** 导出为 JSON（用于持久化） */
  exportJSON(): string {
    const entries: Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }> = [];
    for (const doc of this.documents.values()) {
      entries.push({ id: doc.id, vector: doc.vector, metadata: doc.metadata });
    }
    return JSON.stringify({ config: this.config, documents: entries });
  }

  /** 从 JSON 导入 */
  importJSON(json: string): number {
    const data = JSON.parse(json) as {
      documents: Array<{ id: string; vector: number[]; metadata: Record<string, unknown> }>;
    };
    return this.batchUpsert(data.documents);
  }

  /** 清空所有文档 */
  clear(): void {
    this.documents.clear();
    logger.info('[VectorStore] 已清空所有文档');
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** 向量维度校验 */
  private validateVector(vector: number[]): void {
    if (!Array.isArray(vector) || vector.length !== this.config.dimensions) {
      throw new Error(
        `向量维度不匹配: 期望 ${this.config.dimensions}, 实际 ${vector?.length ?? 'null'}`
      );
    }
    for (let i = 0; i < vector.length; i++) {
      if (typeof vector[i] !== 'number' || !isFinite(vector[i])) {
        throw new Error(`向量第 ${i} 维包含非法值: ${vector[i]}`);
      }
    }
  }

  /** L2 归一化 */
  private normalize(vector: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return vector.map(() => 0);
    return vector.map((v) => v / norm);
  }

  /** 计算相似度 */
  private computeSimilarity(
    queryNorm: number[],
    docNorm: number[],
    docRaw: number[]
  ): number {
    switch (this.config.metric) {
      case 'cosine':
        return this.dotProduct(queryNorm, docNorm);
      case 'dot_product':
        return this.dotProduct(queryNorm, docRaw);
      case 'euclidean':
        return this.euclideanSimilarity(queryNorm, docNorm);
      default:
        return this.dotProduct(queryNorm, docNorm);
    }
  }

  /** 点积 */
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /** 欧氏距离转相似度 — sim = 1 / (1 + dist) */
  private euclideanSimilarity(a: number[], b: number[]): number {
    let sumSq = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sumSq += diff * diff;
    }
    return 1 / (1 + Math.sqrt(sumSq));
  }

  /** 元数据过滤匹配 */
  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, expected] of Object.entries(filter)) {
      const actual = metadata[key];

      // 范围查询: { $gte: number, $lte: number }
      if (
        expected !== null &&
        typeof expected === 'object' &&
        !Array.isArray(expected)
      ) {
        const rangeFilter = expected as Record<string, number>;
        const numActual = Number(actual);
        if (isNaN(numActual)) return false;
        if ('$gte' in rangeFilter && numActual < rangeFilter.$gte) return false;
        if ('$lte' in rangeFilter && numActual > rangeFilter.$lte) return false;
        if ('$gt' in rangeFilter && numActual <= rangeFilter.$gt) return false;
        if ('$lt' in rangeFilter && numActual < rangeFilter.$lt) return false;
        continue;
      }

      // 数组包含查询: filter value 是数组 → actual 必须在数组中
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) return false;
        continue;
      }

      // 精确匹配
      if (actual !== expected) return false;
    }
    return true;
  }
}
