/**
 * ============================================================================
 * DBSCAN 异常聚类引擎 — Phase 3 §3.3.4
 * ============================================================================
 *
 * 对时序数据执行 DBSCAN 密度聚类，识别异常点和异常簇。
 *
 * 输入：多通道时序数据（timestamp + values）
 * 输出：每个数据点的聚类标签（-1 = 噪声/异常）+ 聚类摘要
 *
 * 算法参数：
 *   - eps: 邻域半径（归一化空间中的欧氏距离）
 *   - minPts: 最小邻域点数
 *
 * 架构位置：L7 世界模型层 → 回放分析子层
 */

import { createModuleLogger } from '../../../core/logger';

const logger = createModuleLogger('dbscan-engine');

// ============================================================================
// 类型定义
// ============================================================================

export interface DBSCANPoint {
  index: number;
  timestamp: string;
  values: number[];       // 归一化后的特征向量
  rawValues: number[];    // 原始值
  label: number;          // 聚类标签，-1 = 噪声/异常
}

export interface DBSCANCluster {
  clusterId: number;
  size: number;
  centroid: number[];
  timeRange: { start: string; end: string };
  avgDistance: number;
}

export interface DBSCANResult {
  points: Array<{
    index: number;
    timestamp: string;
    label: number;
    isAnomaly: boolean;
    rawValues: Record<string, number>;
  }>;
  clusters: DBSCANCluster[];
  anomalyCount: number;
  anomalyRate: number;
  totalPoints: number;
  params: { eps: number; minPts: number };
}

// ============================================================================
// DBSCAN 核心算法
// ============================================================================

export class DBSCANEngine {
  /**
   * 执行 DBSCAN 聚类
   *
   * @param data 时序数据数组
   * @param channels 通道名列表
   * @param eps 邻域半径（默认 0.3）
   * @param minPts 最小邻域点数（默认 5）
   */
  static cluster(
    data: Array<{ timestamp: string; values: Record<string, number> }>,
    channels: string[],
    eps: number = 0.3,
    minPts: number = 5,
  ): DBSCANResult {
    if (data.length === 0) {
      return { points: [], clusters: [], anomalyCount: 0, anomalyRate: 0, totalPoints: 0, params: { eps, minPts } };
    }

    // 1. 提取特征矩阵并归一化
    const rawMatrix: number[][] = data.map(d => channels.map(ch => d.values[ch] ?? 0));
    const { normalized, mins, ranges } = this.normalize(rawMatrix);

    // 2. 初始化标签
    const labels = new Array<number>(data.length).fill(-2); // -2 = 未访问
    let currentCluster = 0;

    // 3. DBSCAN 主循环
    for (let i = 0; i < data.length; i++) {
      if (labels[i] !== -2) continue; // 已访问

      const neighbors = this.regionQuery(normalized, i, eps);

      if (neighbors.length < minPts) {
        labels[i] = -1; // 噪声点
      } else {
        // 扩展聚类
        this.expandCluster(normalized, labels, i, neighbors, currentCluster, eps, minPts);
        currentCluster++;
      }
    }

    // 4. 构建结果
    const points = data.map((d, i) => ({
      index: i,
      timestamp: d.timestamp,
      label: labels[i],
      isAnomaly: labels[i] === -1,
      rawValues: d.values,
    }));

    // 5. 聚类摘要
    const clusterMap = new Map<number, number[]>();
    labels.forEach((label, idx) => {
      if (label >= 0) {
        if (!clusterMap.has(label)) clusterMap.set(label, []);
        clusterMap.get(label)!.push(idx);
      }
    });

    const clusters: DBSCANCluster[] = [];
    for (const [clusterId, indices] of Array.from(clusterMap)) {
      const centroid = new Array(channels.length).fill(0);
      for (const idx of indices) {
        for (let j = 0; j < channels.length; j++) {
          centroid[j] += rawMatrix[idx][j];
        }
      }
      for (let j = 0; j < channels.length; j++) {
        centroid[j] /= indices.length;
      }

      // 平均距离到质心
      let totalDist = 0;
      for (const idx of indices) {
        totalDist += this.euclidean(normalized[idx], centroid.map((c, j) => ranges[j] > 0 ? (c - mins[j]) / ranges[j] : 0));
      }

      clusters.push({
        clusterId,
        size: indices.length,
        centroid,
        timeRange: {
          start: data[indices[0]].timestamp,
          end: data[indices[indices.length - 1]].timestamp,
        },
        avgDistance: totalDist / indices.length,
      });
    }

    const anomalyCount = labels.filter(l => l === -1).length;

    logger.info(`DBSCAN 完成: ${data.length} 点, ${clusters.length} 簇, ${anomalyCount} 异常 (eps=${eps}, minPts=${minPts})`);

    return {
      points,
      clusters,
      anomalyCount,
      anomalyRate: data.length > 0 ? anomalyCount / data.length : 0,
      totalPoints: data.length,
      params: { eps, minPts },
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private static normalize(matrix: number[][]): { normalized: number[][]; mins: number[]; ranges: number[] } {
    if (matrix.length === 0) return { normalized: [], mins: [], ranges: [] };

    const dims = matrix[0].length;
    const mins = new Array(dims).fill(Infinity);
    const maxs = new Array(dims).fill(-Infinity);

    for (const row of matrix) {
      for (let j = 0; j < dims; j++) {
        if (row[j] < mins[j]) mins[j] = row[j];
        if (row[j] > maxs[j]) maxs[j] = row[j];
      }
    }

    const ranges = maxs.map((max, j) => max - mins[j]);
    const normalized = matrix.map(row =>
      row.map((val, j) => ranges[j] > 0 ? (val - mins[j]) / ranges[j] : 0),
    );

    return { normalized, mins, ranges };
  }

  private static euclidean(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  private static regionQuery(points: number[][], idx: number, eps: number): number[] {
    const neighbors: number[] = [];
    const point = points[idx];
    for (let i = 0; i < points.length; i++) {
      if (this.euclidean(point, points[i]) <= eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  private static expandCluster(
    points: number[][],
    labels: number[],
    pointIdx: number,
    neighbors: number[],
    clusterId: number,
    eps: number,
    minPts: number,
  ): void {
    labels[pointIdx] = clusterId;

    const queue = [...neighbors];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];

      if (labels[current] === -1) {
        // 噪声点被吸收到聚类中
        labels[current] = clusterId;
      }

      if (labels[current] !== -2) continue; // 已分配到某个聚类

      labels[current] = clusterId;

      const currentNeighbors = this.regionQuery(points, current, eps);
      if (currentNeighbors.length >= minPts) {
        // 将新邻居加入队列
        for (const n of currentNeighbors) {
          if (!queue.includes(n)) {
            queue.push(n);
          }
        }
      }
    }
  }
}
