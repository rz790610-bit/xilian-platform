// 降维算法服务模块
// 使用 druid.js 实现 t-SNE 和 PCA 降维

import * as druid from '@saehrimnir/druidjs';

// 2D 投影点接口
export interface ProjectedPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  category?: string;
  originalVector?: number[];
}

// 降维算法类型
export type ReductionMethod = 'tsne' | 'pca' | 'umap';

// 降维参数
export interface ReductionParams {
  method: ReductionMethod;
  perplexity?: number;      // t-SNE 参数，默认 30
  iterations?: number;      // t-SNE 迭代次数，默认 500
  learningRate?: number;    // t-SNE 学习率，默认 200
  components?: number;      // PCA 主成分数，默认 2
}

/**
 * 使用 t-SNE 算法进行降维
 */
export function tsneReduce(
  vectors: number[][],
  params: {
    perplexity?: number;
    iterations?: number;
    learningRate?: number;
  } = {}
): number[][] {
  const {
    perplexity = Math.min(30, Math.floor(vectors.length / 3)),
    iterations = 500,
    learningRate = 200
  } = params;
  
  if (vectors.length < 3) {
    // 数据太少，返回简单投影
    return vectors.map((v, i) => [i * 10, (v[0] || 0) * 10]);
  }
  
  // 创建数据矩阵
  const matrix = druid.Matrix.from(vectors);
  
  // 创建 t-SNE 实例
  const tsne = new druid.TSNE(matrix, {
    perplexity: Math.max(5, Math.min(perplexity, vectors.length - 1)),
    epsilon: learningRate,
    d: 2  // 降到 2 维
  });
  
  // 执行迭代
  for (let i = 0; i < iterations; i++) {
    tsne.next();
  }
  
  // 获取结果
  const result = tsne.transform();
  return result.to2dArray;
}

/**
 * 使用 PCA 算法进行降维
 */
export function pcaReduce(
  vectors: number[][],
  components: number = 2
): number[][] {
  if (vectors.length < 2) {
    return vectors.map((v, i) => [i * 10, (v[0] || 0) * 10]);
  }
  
  // 创建数据矩阵
  const matrix = druid.Matrix.from(vectors);
  
  // 创建 PCA 实例
  const pca = new druid.PCA(matrix, components);
  
  // 获取结果
  const result = pca.transform();
  return result.to2dArray;
}

/**
 * 使用 UMAP 算法进行降维
 */
export function umapReduce(
  vectors: number[][],
  params: {
    neighbors?: number;
    minDist?: number;
  } = {}
): number[][] {
  const {
    neighbors = Math.min(15, Math.floor(vectors.length / 2)),
    minDist = 0.1
  } = params;
  
  if (vectors.length < 3) {
    return vectors.map((v, i) => [i * 10, (v[0] || 0) * 10]);
  }
  
  // 创建数据矩阵
  const matrix = druid.Matrix.from(vectors);
  
  // 创建 UMAP 实例
  const umap = new druid.UMAP(matrix, {
    n_neighbors: Math.max(2, Math.min(neighbors, vectors.length - 1)),
    min_dist: minDist,
    d: 2
  });
  
  // 获取结果
  const result = umap.transform();
  return result.to2dArray;
}

/**
 * 统一的降维接口
 */
export function reduceVectors(
  vectors: number[][],
  params: ReductionParams = { method: 'pca' }
): number[][] {
  const { method, ...methodParams } = params;
  
  switch (method) {
    case 'tsne':
      return tsneReduce(vectors, methodParams);
    case 'pca':
      return pcaReduce(vectors, methodParams.components);
    case 'umap':
      return umapReduce(vectors, {
        neighbors: (methodParams as any).neighbors,
        minDist: (methodParams as any).minDist
      });
    default:
      return pcaReduce(vectors);
  }
}

/**
 * 将向量数据转换为投影点
 */
export function vectorsToProjectedPoints(
  data: Array<{
    id: string;
    vector: number[];
    payload: Record<string, any>;
  }>,
  params: ReductionParams = { method: 'pca' }
): ProjectedPoint[] {
  if (data.length === 0) return [];
  
  // 提取向量
  const vectors = data.map(d => d.vector);
  
  // 执行降维
  const projected = reduceVectors(vectors, params);
  
  // 归一化到 0-100 范围
  const normalized = normalizeCoordinates(projected);
  
  // 组合结果
  return data.map((d, i) => ({
    id: d.id,
    x: normalized[i][0],
    y: normalized[i][1],
    label: d.payload.title || d.id,
    category: d.payload.category || 'default',
    originalVector: d.vector
  }));
}

/**
 * 归一化坐标到指定范围
 */
function normalizeCoordinates(
  coords: number[][],
  minVal: number = 5,
  maxVal: number = 95
): number[][] {
  if (coords.length === 0) return [];
  
  // 找到边界
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  
  // 处理边界情况
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  
  // 归一化
  return coords.map(([x, y]) => [
    minVal + ((x - minX) / rangeX) * (maxVal - minVal),
    minVal + ((y - minY) / rangeY) * (maxVal - minVal)
  ]);
}

/**
 * 计算向量之间的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 计算向量统计信息
 */
export function computeVectorStats(vectors: number[][]): {
  count: number;
  dimension: number;
  meanNorm: number;
  minNorm: number;
  maxNorm: number;
} {
  if (vectors.length === 0) {
    return { count: 0, dimension: 0, meanNorm: 0, minNorm: 0, maxNorm: 0 };
  }
  
  const norms = vectors.map(v => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)));
  
  return {
    count: vectors.length,
    dimension: vectors[0].length,
    meanNorm: norms.reduce((a, b) => a + b, 0) / norms.length,
    minNorm: Math.min(...norms),
    maxNorm: Math.max(...norms)
  };
}

// ==================== 聚类分析功能 ====================

/**
 * 聚类结果接口
 */
export interface ClusterResult {
  clusters: ClusterInfo[];
  assignments: number[];  // 每个点的聚类索引
  centroids: number[][];  // 聚类中心点
}

export interface ClusterInfo {
  id: number;
  size: number;
  centroid: { x: number; y: number };
  color: string;
  points: string[];  // 属于该聚类的点 ID
  representativePoint?: string;  // 代表性点
}

// 聚类颜色调色板
const CLUSTER_COLORS = [
  '#ef4444', // 红
  '#f97316', // 橙
  '#eab308', // 黄
  '#22c55e', // 绿
  '#06b6d4', // 青
  '#3b82f6', // 蓝
  '#8b5cf6', // 紫
  '#ec4899', // 粉
  '#6366f1', // 靖蓝
  '#14b8a6', // 青绿
];

/**
 * 计算两点之间的欧氏距离
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * K-Means++ 初始化聚类中心
 */
function initializeCentroids(points: number[][], k: number): number[][] {
  const centroids: number[][] = [];
  const n = points.length;
  
  // 随机选择第一个中心
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...points[firstIdx]]);
  
  // 选择剩余的中心
  for (let i = 1; i < k; i++) {
    const distances: number[] = [];
    let totalDist = 0;
    
    // 计算每个点到最近中心的距离
    for (const point of points) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(point, centroid);
        minDist = Math.min(minDist, dist);
      }
      distances.push(minDist * minDist);  // 使用距离的平方
      totalDist += minDist * minDist;
    }
    
    // 按距离比例随机选择下一个中心
    let r = Math.random() * totalDist;
    for (let j = 0; j < n; j++) {
      r -= distances[j];
      if (r <= 0) {
        centroids.push([...points[j]]);
        break;
      }
    }
    
    // 如果没有选中，选择最后一个
    if (centroids.length === i) {
      centroids.push([...points[n - 1]]);
    }
  }
  
  return centroids;
}

/**
 * K-Means 聚类算法
 */
export function kMeansClustering(
  points: number[][],
  k: number,
  maxIterations: number = 100
): { assignments: number[]; centroids: number[][] } {
  const n = points.length;
  
  if (n === 0 || k <= 0) {
    return { assignments: [], centroids: [] };
  }
  
  // 确保 k 不超过点的数量
  k = Math.min(k, n);
  
  // 初始化聚类中心
  let centroids = initializeCentroids(points, k);
  let assignments = new Array(n).fill(0);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配每个点到最近的聚类中心
    const newAssignments = points.map(point => {
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < k; i++) {
        const dist = euclideanDistance(point, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }
      return minIdx;
    });
    
    // 检查是否收敛
    let converged = true;
    for (let i = 0; i < n; i++) {
      if (newAssignments[i] !== assignments[i]) {
        converged = false;
        break;
      }
    }
    
    assignments = newAssignments;
    
    if (converged) break;
    
    // 更新聚类中心
    const newCentroids: number[][] = [];
    for (let i = 0; i < k; i++) {
      const clusterPoints = points.filter((_, idx) => assignments[idx] === i);
      if (clusterPoints.length === 0) {
        // 如果聚类为空，保持原来的中心
        newCentroids.push(centroids[i]);
      } else {
        // 计算新的中心（平均值）
        const dim = clusterPoints[0].length;
        const newCentroid = new Array(dim).fill(0);
        for (const point of clusterPoints) {
          for (let d = 0; d < dim; d++) {
            newCentroid[d] += point[d];
          }
        }
        for (let d = 0; d < dim; d++) {
          newCentroid[d] /= clusterPoints.length;
        }
        newCentroids.push(newCentroid);
      }
    }
    centroids = newCentroids;
  }
  
  return { assignments, centroids };
}

/**
 * 对投影点进行聚类分析
 */
export function clusterProjectedPoints(
  points: ProjectedPoint[],
  k: number = 3
): ClusterResult {
  if (points.length === 0) {
    return { clusters: [], assignments: [], centroids: [] };
  }
  
  // 提取 2D 坐标
  const coords = points.map(p => [p.x, p.y]);
  
  // 执行 K-Means 聚类
  const { assignments, centroids } = kMeansClustering(coords, k);
  
  // 构建聚类信息
  const clusters: ClusterInfo[] = [];
  for (let i = 0; i < k; i++) {
    const clusterPointIds = points
      .filter((_, idx) => assignments[idx] === i)
      .map(p => p.id);
    
    // 找到离中心最近的点作为代表
    let representativePoint: string | undefined;
    let minDist = Infinity;
    for (const pid of clusterPointIds) {
      const point = points.find(p => p.id === pid);
      if (point) {
        const dist = euclideanDistance([point.x, point.y], centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          representativePoint = pid;
        }
      }
    }
    
    clusters.push({
      id: i,
      size: clusterPointIds.length,
      centroid: { x: centroids[i][0], y: centroids[i][1] },
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      points: clusterPointIds,
      representativePoint
    });
  }
  
  return { clusters, assignments, centroids };
}

/**
 * 获取聚类颜色
 */
export function getClusterColor(clusterIndex: number): string {
  return CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
}
