/**
 * ============================================================================
 * 知识图谱查询服务 — KGQueryService
 * ============================================================================
 *
 * 持久化层：连接 KnowledgeGraph 引擎与数据库/路由
 *
 * 职责：
 *   1. 三元组 CRUD 持久化（MySQL knowledge_triples 表）
 *   2. 路径查询（BFS/DFS + 缓存）
 *   3. 相似度搜索（向量嵌入 + 余弦相似度）
 *   4. 因果链追溯（反向遍历 causes/leads_to 关系）
 *   5. 查询缓存和性能优化
 */

import type { KnowledgeGraphEngine as KnowledgeGraph } from '../graph/knowledge-graph';

// ============================================================================
// 查询类型
// ============================================================================

export interface TripleRecord {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PathQueryResult {
  paths: Array<{
    nodes: string[];
    edges: string[];
    totalConfidence: number;
  }>;
  queryTimeMs: number;
}

export interface SimilarityResult {
  entity: string;
  similarity: number;
  relatedTriples: TripleRecord[];
}

export interface CausalChain {
  rootCause: string;
  chain: Array<{
    from: string;
    relation: string;
    to: string;
    confidence: number;
  }>;
  totalConfidence: number;
}

// ============================================================================
// KG 查询服务
// ============================================================================

export class KGQueryService {
  private graph: KnowledgeGraph | null = null;
  private queryCache = new Map<string, { result: unknown; expiry: number }>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly cacheTTLMs = 60_000; // 1 分钟缓存

  /**
   * 注入 KnowledgeGraph 引擎
   */
  setGraph(graph: KnowledgeGraph): void {
    this.graph = graph;
  }

  /**
   * 添加三元组
   */
  async addTriple(
    subject: string,
    predicate: string,
    object: string,
    confidence: number = 1.0,
    source: string = 'manual',
    metadata: Record<string, unknown> = {},
  ): Promise<TripleRecord> {
    // 写入引擎
    if (this.graph) {
      this.graph.addTriple({ subject, predicate, object, confidence, source, subjectType: 'entity', objectType: 'entity' });
    }

    // 持久化到数据库
    const record: TripleRecord = {
      id: Date.now(),
      subject,
      predicate,
      object,
      confidence,
      source,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // TODO: 实际 DB 写入 — INSERT INTO knowledge_triples ...
    this.invalidateCache(`triple:${subject}:*`);
    return record;
  }

  /**
   * 查询三元组
   */
  async queryTriples(params: {
    subject?: string;
    predicate?: string;
    object?: string;
    minConfidence?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ triples: TripleRecord[]; total: number }> {
    const cacheKey = `triples:${JSON.stringify(params)}`;
    const cached = this.getFromCache<{ triples: TripleRecord[]; total: number }>(cacheKey);
    if (cached) return cached;

    // 从引擎查询
    if (this.graph) {
      const results = this.graph.query({
        subject: params.subject,
        predicate: params.predicate,
        object: params.object,
        minConfidence: params.minConfidence,
      });

      const filtered = results
        .filter(r => !params.minConfidence || r.confidence >= params.minConfidence)
        .slice(params.offset || 0, (params.offset || 0) + (params.limit || 50));

      const triples: TripleRecord[] = filtered.map((r, i) => ({
        id: i,
        subject: r.subject,
        predicate: r.predicate,
        object: r.object,
        confidence: r.confidence,
        source: r.source,
        metadata: r.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = { triples, total: results.length };
      this.setCache(cacheKey, result);
      return result;
    }

    return { triples: [], total: 0 };
  }

  /**
   * 路径查询
   */
  async findPaths(
    from: string,
    to: string,
    maxDepth: number = 5,
    maxPaths: number = 10,
  ): Promise<PathQueryResult> {
    const startTime = Date.now();
    const cacheKey = `path:${from}:${to}:${maxDepth}`;
    const cached = this.getFromCache<PathQueryResult>(cacheKey);
    if (cached) return cached;

    if (!this.graph) return { paths: [], queryTimeMs: 0 };

    // BFS 路径搜索
    const paths: PathQueryResult['paths'] = [];
    const queue: Array<{ node: string; path: string[]; edges: string[]; confidence: number }> = [
      { node: from, path: [from], edges: [], confidence: 1.0 },
    ];
    const visited = new Set<string>();

    while (queue.length > 0 && paths.length < maxPaths) {
      const current = queue.shift()!;
      if (current.path.length > maxDepth + 1) continue;

      if (current.node === to && current.path.length > 1) {
        paths.push({
          nodes: current.path,
          edges: current.edges,
          totalConfidence: current.confidence,
        });
        continue;
      }

      const key = `${current.node}:${current.path.length}`;
      if (visited.has(key)) continue;
      visited.add(key);

      // 获取邻居
      const neighbors = this.graph.query({ subject: current.node });
      for (const triple of neighbors) {
        if (!current.path.includes(triple.object)) {
          queue.push({
            node: triple.object,
            path: [...current.path, triple.object],
            edges: [...current.edges, triple.predicate],
            confidence: current.confidence * triple.confidence,
          });
        }
      }
    }

    const result: PathQueryResult = {
      paths: paths.sort((a, b) => b.totalConfidence - a.totalConfidence),
      queryTimeMs: Date.now() - startTime,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * 因果链追溯
   */
  async traceCausalChain(effect: string, maxDepth: number = 5): Promise<CausalChain[]> {
    if (!this.graph) return [];

    const chains: CausalChain[] = [];
    const causalPredicates = ['causes', 'leads_to', 'triggers', 'accelerates', 'contributes_to'];

    // 反向遍历因果关系
    const findCauses = (
      entity: string,
      chain: CausalChain['chain'],
      depth: number,
      visited: Set<string>,
    ): void => {
      if (depth >= maxDepth || visited.has(entity)) return;
      visited.add(entity);

      for (const predicate of causalPredicates) {
        const causes = this.graph!.query({ predicate, object: entity });
        for (const triple of causes) {
          const newChain = [
            ...chain,
            {
              from: triple.subject,
              relation: triple.predicate,
              to: triple.object,
              confidence: triple.confidence,
            },
          ];

          // 检查是否为根因（没有更上游的原因）
          let isRoot = true;
          for (const p of causalPredicates) {
            if (this.graph!.query({ predicate: p, object: triple.subject }).length > 0) {
              isRoot = false;
              break;
            }
          }

          if (isRoot) {
            const totalConfidence = newChain.reduce((acc, c) => acc * c.confidence, 1);
            chains.push({
              rootCause: triple.subject,
              chain: newChain.reverse(),
              totalConfidence,
            });
          } else {
            findCauses(triple.subject, newChain, depth + 1, new Set(visited));
          }
        }
      }
    };

    findCauses(effect, [], 0, new Set());
    return chains.sort((a, b) => b.totalConfidence - a.totalConfidence);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      size: this.queryCache.size,
    };
  }

  // --------------------------------------------------------------------------
  // 内部缓存方法
  // --------------------------------------------------------------------------

  private getFromCache<T>(key: string): T | null {
    const entry = this.queryCache.get(key);
    if (entry && entry.expiry > Date.now()) {
      this.cacheHits++;
      return entry.result as T;
    }
    this.cacheMisses++;
    if (entry) this.queryCache.delete(key);
    return null;
  }

  private setCache(key: string, result: unknown): void {
    this.queryCache.set(key, { result, expiry: Date.now() + this.cacheTTLMs });
    // 限制缓存大小
    if (this.queryCache.size > 10_000) {
      const oldest = this.queryCache.keys().next().value;
      if (oldest) this.queryCache.delete(oldest);
    }
  }

  private invalidateCache(pattern: string): void {
    const prefix = pattern.replace('*', '');
    for (const key of this.queryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.queryCache.delete(key);
      }
    }
  }
}
