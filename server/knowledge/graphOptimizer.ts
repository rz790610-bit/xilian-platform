/**
 * 知识图谱查询优化器
 * 提供图遍历优化、结果缓存、索引建议等功能
 */

import { getDb } from '../db';
import { kgNodes, kgEdges } from '../../drizzle/schema';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { redisClient } from '../redis/redisClient';

// 缓存键前缀
const GRAPH_CACHE_PREFIX = 'kg:cache:';

// 图遍历结果接口
interface GraphTraversalResult {
  nodes: Array<{
    id: number;
    nodeId: string;
    label: string;
    type: string;
    properties?: Record<string, unknown>;
    depth: number;
  }>;
  edges: Array<{
    id: number;
    edgeId: string;
    sourceNodeId: string;
    targetNodeId: string;
    label: string;
    type: string;
    weight?: number;
  }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    executionTimeMs: number;
  };
}

// 路径查找结果接口
interface PathResult {
  paths: Array<{
    nodes: string[];
    edges: string[];
    totalWeight: number;
  }>;
  shortestPath?: {
    nodes: string[];
    edges: string[];
    totalWeight: number;
  };
}

// 边类型
interface EdgeRecord {
  id: number;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  type: string;
  weight: number | null;
}

/**
 * 知识图谱查询优化器类
 */
export class GraphOptimizer {
  private cacheEnabled: boolean = true;
  private defaultCacheTTL: number = 300; // 5 分钟

  /**
   * 启用/禁用缓存
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(operation: string, params: object): string {
    const hash = Buffer.from(JSON.stringify(params)).toString('base64').slice(0, 32);
    return `${GRAPH_CACHE_PREFIX}${operation}:${hash}`;
  }

  /**
   * 从缓存获取结果
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.cacheEnabled) return null;
    return redisClient.get<T>(key, true);
  }

  /**
   * 保存结果到缓存
   */
  private async saveToCache(key: string, data: object, ttl?: number): Promise<void> {
    if (!this.cacheEnabled) return;
    await redisClient.set(key, data, ttl || this.defaultCacheTTL);
  }

  /**
   * 广度优先遍历（BFS）
   * 从指定节点开始，遍历指定深度内的所有节点
   */
  async bfsTraversal(
    collectionId: number,
    startNodeId: string,
    maxDepth: number = 3,
    options: {
      nodeTypes?: string[];
      edgeTypes?: string[];
      maxNodes?: number;
    } = {}
  ): Promise<GraphTraversalResult> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey('bfs', { collectionId, startNodeId, maxDepth, options });

    // 尝试从缓存获取
    const cached = await this.getFromCache<GraphTraversalResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    if (!db) {
      return {
        nodes: [],
        edges: [],
        stats: { totalNodes: 0, totalEdges: 0, maxDepth: 0, executionTimeMs: 0 },
      };
    }

    const visitedNodes = new Set<string>();
    const resultNodes: GraphTraversalResult['nodes'] = [];
    const resultEdges: GraphTraversalResult['edges'] = [];
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: startNodeId, depth: 0 }];

    const maxNodes = options.maxNodes || 500;

    while (queue.length > 0 && resultNodes.length < maxNodes) {
      const { nodeId, depth } = queue.shift()!;

      if (visitedNodes.has(nodeId) || depth > maxDepth) {
        continue;
      }

      visitedNodes.add(nodeId);

      // 获取当前节点
      let nodeQuery = db
        .select()
        .from(kgNodes)
        .where(
          and(
            eq(kgNodes.collectionId, collectionId),
            eq(kgNodes.nodeId, nodeId)
          )
        )
        .limit(1);

      const [node] = await nodeQuery;

      if (node) {
        // 检查节点类型过滤
        if (options.nodeTypes && options.nodeTypes.length > 0 && !options.nodeTypes.includes(node.type)) {
          continue;
        }

        resultNodes.push({
          id: node.id,
          nodeId: node.nodeId,
          label: node.label,
          type: node.type,
          properties: node.properties as Record<string, unknown> | undefined,
          depth,
        });

        // 获取相邻边
        const edges = await db
          .select()
          .from(kgEdges)
          .where(
            and(
              eq(kgEdges.collectionId, collectionId),
              or(
                eq(kgEdges.sourceNodeId, nodeId),
                eq(kgEdges.targetNodeId, nodeId)
              )
            )
          );

        for (const edge of edges) {
          // 检查边类型过滤
          if (options.edgeTypes && options.edgeTypes.length > 0 && !options.edgeTypes.includes(edge.type)) {
            continue;
          }

          // 避免重复添加边
          if (!resultEdges.find((e: GraphTraversalResult['edges'][0]) => e.edgeId === edge.edgeId)) {
            resultEdges.push({
              id: edge.id,
              edgeId: edge.edgeId,
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
              label: edge.label,
              type: edge.type,
              weight: edge.weight ?? undefined,
            });
          }

          // 添加相邻节点到队列
          const neighborId = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
          if (!visitedNodes.has(neighborId)) {
            queue.push({ nodeId: neighborId, depth: depth + 1 });
          }
        }
      }
    }

    const result: GraphTraversalResult = {
      nodes: resultNodes,
      edges: resultEdges,
      stats: {
        totalNodes: resultNodes.length,
        totalEdges: resultEdges.length,
        maxDepth: Math.max(...resultNodes.map(n => n.depth), 0),
        executionTimeMs: Date.now() - startTime,
      },
    };

    // 保存到缓存
    await this.saveToCache(cacheKey, result);

    return result;
  }

  /**
   * 查找两个节点之间的路径
   */
  async findPaths(
    collectionId: number,
    sourceNodeId: string,
    targetNodeId: string,
    maxDepth: number = 5,
    maxPaths: number = 10
  ): Promise<PathResult> {
    const cacheKey = this.getCacheKey('paths', { collectionId, sourceNodeId, targetNodeId, maxDepth });

    // 尝试从缓存获取
    const cached = await this.getFromCache<PathResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    if (!db) {
      return { paths: [] };
    }

    const paths: PathResult['paths'] = [];
    const visited = new Set<string>();

    // 使用 DFS 查找所有路径
    const dfs = async (
      currentNodeId: string,
      currentPath: string[],
      currentEdges: string[],
      currentWeight: number,
      depth: number
    ): Promise<void> => {
      if (depth > maxDepth || paths.length >= maxPaths) {
        return;
      }

      if (currentNodeId === targetNodeId) {
        paths.push({
          nodes: [...currentPath],
          edges: [...currentEdges],
          totalWeight: currentWeight,
        });
        return;
      }

      visited.add(currentNodeId);

      // 获取出边
      const edges = await db
        .select()
        .from(kgEdges)
        .where(
          and(
            eq(kgEdges.collectionId, collectionId),
            eq(kgEdges.sourceNodeId, currentNodeId)
          )
        );

      for (const edge of edges) {
        if (!visited.has(edge.targetNodeId)) {
          await dfs(
            edge.targetNodeId,
            [...currentPath, edge.targetNodeId],
            [...currentEdges, edge.edgeId],
            currentWeight + (edge.weight || 1),
            depth + 1
          );
        }
      }

      visited.delete(currentNodeId);
    };

    await dfs(sourceNodeId, [sourceNodeId], [], 0, 0);

    // 找出最短路径
    const shortestPath = paths.length > 0
      ? paths.reduce((shortest, current) =>
          current.nodes.length < shortest.nodes.length ? current : shortest
        )
      : undefined;

    const result: PathResult = {
      paths,
      shortestPath,
    };

    // 保存到缓存
    await this.saveToCache(cacheKey, result);

    return result;
  }

  /**
   * 获取节点的邻居统计
   */
  async getNeighborStats(
    collectionId: number,
    nodeId: string
  ): Promise<{
    inDegree: number;
    outDegree: number;
    totalDegree: number;
    neighborTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
  }> {
    const cacheKey = this.getCacheKey('neighbor_stats', { collectionId, nodeId });

    // 尝试从缓存获取
    const cached = await this.getFromCache<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    if (!db) {
      return {
        inDegree: 0,
        outDegree: 0,
        totalDegree: 0,
        neighborTypes: {},
        edgeTypes: {},
      };
    }

    // 入边统计
    const inEdges = await db
      .select()
      .from(kgEdges)
      .where(
        and(
          eq(kgEdges.collectionId, collectionId),
          eq(kgEdges.targetNodeId, nodeId)
        )
      );

    // 出边统计
    const outEdges = await db
      .select()
      .from(kgEdges)
      .where(
        and(
          eq(kgEdges.collectionId, collectionId),
          eq(kgEdges.sourceNodeId, nodeId)
        )
      );

    // 统计邻居类型
    const neighborIds = [
      ...inEdges.map((e: EdgeRecord) => e.sourceNodeId),
      ...outEdges.map((e: EdgeRecord) => e.targetNodeId),
    ];

    const neighborTypes: Record<string, number> = {};
    const edgeTypes: Record<string, number> = {};

    if (neighborIds.length > 0) {
      const neighbors = await db
        .select()
        .from(kgNodes)
        .where(
          and(
            eq(kgNodes.collectionId, collectionId),
            inArray(kgNodes.nodeId, neighborIds)
          )
        );

      for (const neighbor of neighbors) {
        neighborTypes[neighbor.type] = (neighborTypes[neighbor.type] || 0) + 1;
      }
    }

    // 统计边类型
    for (const edge of [...inEdges, ...outEdges]) {
      edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
    }

    const result = {
      inDegree: inEdges.length,
      outDegree: outEdges.length,
      totalDegree: inEdges.length + outEdges.length,
      neighborTypes,
      edgeTypes,
    };

    // 保存到缓存
    await this.saveToCache(cacheKey, result);

    return result;
  }

  /**
   * 获取图谱统计信息
   */
  async getGraphStats(collectionId: number): Promise<{
    totalNodes: number;
    totalEdges: number;
    nodeTypeDistribution: Record<string, number>;
    edgeTypeDistribution: Record<string, number>;
    avgDegree: number;
    density: number;
  }> {
    const cacheKey = this.getCacheKey('graph_stats', { collectionId });

    // 尝试从缓存获取
    const cached = await this.getFromCache<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    if (!db) {
      return {
        totalNodes: 0,
        totalEdges: 0,
        nodeTypeDistribution: {},
        edgeTypeDistribution: {},
        avgDegree: 0,
        density: 0,
      };
    }

    // 节点统计
    const nodeStats = await db
      .select({
        type: kgNodes.type,
        count: sql<number>`count(*)`,
      })
      .from(kgNodes)
      .where(eq(kgNodes.collectionId, collectionId))
      .groupBy(kgNodes.type);

    // 边统计
    const edgeStats = await db
      .select({
        type: kgEdges.type,
        count: sql<number>`count(*)`,
      })
      .from(kgEdges)
      .where(eq(kgEdges.collectionId, collectionId))
      .groupBy(kgEdges.type);

    let totalNodes = 0;
    let totalEdges = 0;

    const nodeTypeDistribution: Record<string, number> = {};
    for (const stat of nodeStats) {
      const count = Number(stat.count);
      nodeTypeDistribution[stat.type] = count;
      totalNodes += count;
    }

    const edgeTypeDistribution: Record<string, number> = {};
    for (const stat of edgeStats) {
      const count = Number(stat.count);
      edgeTypeDistribution[stat.type] = count;
      totalEdges += count;
    }

    // 计算平均度数和密度
    const avgDegree = totalNodes > 0 ? (2 * totalEdges) / totalNodes : 0;
    const maxEdges = totalNodes > 1 ? (totalNodes * (totalNodes - 1)) / 2 : 0;
    const density = maxEdges > 0 ? totalEdges / maxEdges : 0;

    const result = {
      totalNodes,
      totalEdges,
      nodeTypeDistribution,
      edgeTypeDistribution,
      avgDegree: Math.round(avgDegree * 100) / 100,
      density: Math.round(density * 10000) / 10000,
    };

    // 保存到缓存（较长时间）
    await this.saveToCache(cacheKey, result, 600);

    return result;
  }

  /**
   * 清除指定集合的缓存
   */
  async clearCache(collectionId?: number): Promise<void> {
    const pattern = collectionId
      ? `${GRAPH_CACHE_PREFIX}*:*${collectionId}*`
      : `${GRAPH_CACHE_PREFIX}*`;
    
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}

// 导出单例
export const graphOptimizer = new GraphOptimizer();
