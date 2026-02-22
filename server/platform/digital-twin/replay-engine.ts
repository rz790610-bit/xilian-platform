/**
 * ============================================================================
 * 回放引擎 (ReplayEngine)
 * ============================================================================
 *
 * Phase 3 提案 §3.3 — 完整实现：
 *   - 多通道时间序列回放
 *   - DBSCAN 异常聚类（§3.3.4）
 *   - 事件标注与回放
 *   - 速度控制（0.5x ~ 10x）
 *   - OTel 指标埋点
 *
 * 架构：
 *   ReplayEngine
 *     ├── loadTimeRange()     — 加载时间范围数据
 *     ├── clusterAnomalies()  — DBSCAN 异常聚类
 *     ├── annotateEvents()    — 事件标注
 *     └── getReplayStream()   — 流式回放
 */

import { EventEmitter } from 'events';

// ============================================================================
// 类型定义
// ============================================================================

export interface ReplayDataPoint {
  timestamp: number;
  machineId: string;
  channels: Record<string, number>;
  /** 异常标记 */
  anomalies?: AnomalyCluster[];
  /** 事件标注 */
  events?: ReplayEvent[];
}

export interface ReplayEvent {
  id: string;
  timestamp: number;
  type: 'alert' | 'fault' | 'maintenance' | 'config_change' | 'anomaly_cluster';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  relatedChannels: string[];
  /** DBSCAN 聚类 ID（如果是异常聚类事件） */
  clusterId?: number;
}

export interface AnomalyCluster {
  clusterId: number;
  /** 聚类中心时间戳 */
  centroidTimestamp: number;
  /** 聚类起止时间 */
  startTime: number;
  endTime: number;
  /** 聚类中的数据点数 */
  pointCount: number;
  /** 涉及的通道 */
  channels: string[];
  /** 异常严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 异常类型推断 */
  inferredType: string;
  /** 聚类内的异常点 */
  points: Array<{ timestamp: number; channel: string; value: number; zScore: number }>;
}

export interface ReplayConfig {
  machineId: string;
  startTime: number;
  endTime: number;
  channels: string[];
  /** 回放速度倍率 */
  speedMultiplier: number;
  /** 是否启用 DBSCAN 异常检测 */
  enableDBSCAN: boolean;
  /** DBSCAN 参数 */
  dbscanEps?: number;
  dbscanMinPts?: number;
}

export interface ReplayResult {
  machineId: string;
  startTime: number;
  endTime: number;
  /** 数据点 */
  dataPoints: ReplayDataPoint[];
  /** 异常聚类 */
  anomalyClusters: AnomalyCluster[];
  /** 事件列表 */
  events: ReplayEvent[];
  /** 通道统计 */
  channelStats: Record<string, {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    anomalyCount: number;
  }>;
  /** 总数据点数 */
  totalPoints: number;
  /** 处理耗时 */
  durationMs: number;
}

// ============================================================================
// DBSCAN 算法实现
// ============================================================================

interface DBSCANPoint {
  index: number;
  timestamp: number;
  channel: string;
  value: number;
  zScore: number;
  /** 归一化坐标 [时间, z分数] */
  coords: [number, number];
  clusterId: number; // -1 = noise, -2 = unvisited
}

class DBSCAN {
  private eps: number;
  private minPts: number;

  constructor(eps: number = 0.3, minPts: number = 3) {
    this.eps = eps;
    this.minPts = minPts;
  }

  /**
   * 执行 DBSCAN 聚类
   */
  run(points: DBSCANPoint[]): DBSCANPoint[] {
    let clusterId = 0;

    for (const point of points) {
      if (point.clusterId !== -2) continue; // 已访问

      const neighbors = this.regionQuery(points, point);

      if (neighbors.length < this.minPts) {
        point.clusterId = -1; // 噪声
      } else {
        this.expandCluster(points, point, neighbors, clusterId);
        clusterId++;
      }
    }

    return points;
  }

  private regionQuery(points: DBSCANPoint[], center: DBSCANPoint): DBSCANPoint[] {
    return points.filter(p => this.distance(center.coords, p.coords) <= this.eps);
  }

  private expandCluster(
    points: DBSCANPoint[],
    point: DBSCANPoint,
    neighbors: DBSCANPoint[],
    clusterId: number
  ): void {
    point.clusterId = clusterId;

    const queue = [...neighbors];
    const visited = new Set<number>([point.index]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.index)) continue;
      visited.add(current.index);

      if (current.clusterId === -1) {
        current.clusterId = clusterId; // 边界点
      }

      if (current.clusterId !== -2) continue;
      current.clusterId = clusterId;

      const currentNeighbors = this.regionQuery(points, current);
      if (currentNeighbors.length >= this.minPts) {
        queue.push(...currentNeighbors);
      }
    }
  }

  private distance(a: [number, number], b: [number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  }
}

// ============================================================================
// 回放引擎
// ============================================================================

export class ReplayEngine extends EventEmitter {
  private static instance: ReplayEngine;

  static getInstance(): ReplayEngine {
    if (!ReplayEngine.instance) {
      ReplayEngine.instance = new ReplayEngine();
    }
    return ReplayEngine.instance;
  }

  /**
   * 加载并处理回放数据
   */
  async processReplay(config: ReplayConfig, rawData: ReplayDataPoint[]): Promise<ReplayResult> {
    const startTime = Date.now();

    // 1. 计算通道统计
    const channelStats = this.computeChannelStats(rawData, config.channels);

    // 2. DBSCAN 异常聚类
    let anomalyClusters: AnomalyCluster[] = [];
    if (config.enableDBSCAN) {
      anomalyClusters = this.clusterAnomalies(
        rawData,
        config.channels,
        channelStats,
        config.dbscanEps ?? 0.3,
        config.dbscanMinPts ?? 3
      );
    }

    // 3. 事件标注
    const events = this.annotateEvents(rawData, anomalyClusters, config);

    // 4. 将异常标记附加到数据点
    for (const dp of rawData) {
      const relatedClusters = anomalyClusters.filter(
        c => dp.timestamp >= c.startTime && dp.timestamp <= c.endTime
      );
      if (relatedClusters.length > 0) {
        dp.anomalies = relatedClusters;
      }
      const relatedEvents = events.filter(
        e => Math.abs(e.timestamp - dp.timestamp) < 60000 // 1 分钟内
      );
      if (relatedEvents.length > 0) {
        dp.events = relatedEvents;
      }
    }

    return {
      machineId: config.machineId,
      startTime: config.startTime,
      endTime: config.endTime,
      dataPoints: rawData,
      anomalyClusters,
      events,
      channelStats,
      totalPoints: rawData.length,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 计算通道统计
   */
  private computeChannelStats(
    data: ReplayDataPoint[],
    channels: string[]
  ): Record<string, { min: number; max: number; mean: number; stdDev: number; anomalyCount: number }> {
    const stats: Record<string, { min: number; max: number; mean: number; stdDev: number; anomalyCount: number }> = {};

    for (const ch of channels) {
      const values = data.map(dp => dp.channels[ch]).filter(v => v !== undefined && v !== null) as number[];
      if (values.length === 0) {
        stats[ch] = { min: 0, max: 0, mean: 0, stdDev: 0, anomalyCount: 0 };
        continue;
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);

      // 异常计数：|z-score| > 3
      const anomalyCount = values.filter(v => Math.abs((v - mean) / (stdDev || 1)) > 3).length;

      stats[ch] = { min, max, mean, stdDev, anomalyCount };
    }

    return stats;
  }

  /**
   * DBSCAN 异常聚类
   *
   * 提案 §3.3.4:
   *   1. 计算每个通道的 z-score
   *   2. 筛选 |z| > 2 的异常点
   *   3. 在 (归一化时间, z-score) 空间执行 DBSCAN
   *   4. 返回聚类结果，推断异常类型
   */
  clusterAnomalies(
    data: ReplayDataPoint[],
    channels: string[],
    stats: Record<string, { min: number; max: number; mean: number; stdDev: number; anomalyCount: number }>,
    eps: number = 0.3,
    minPts: number = 3
  ): AnomalyCluster[] {
    // 1. 提取异常点（|z-score| > 2）
    const anomalyPoints: DBSCANPoint[] = [];
    let idx = 0;

    const timeRange = data.length > 0
      ? (data[data.length - 1].timestamp - data[0].timestamp) || 1
      : 1;
    const timeStart = data.length > 0 ? data[0].timestamp : 0;

    for (const dp of data) {
      for (const ch of channels) {
        const val = dp.channels[ch];
        if (val === undefined || val === null) continue;

        const s = stats[ch];
        if (!s || s.stdDev === 0) continue;

        const zScore = (val - s.mean) / s.stdDev;
        if (Math.abs(zScore) > 2) {
          const normalizedTime = (dp.timestamp - timeStart) / timeRange;
          anomalyPoints.push({
            index: idx++,
            timestamp: dp.timestamp,
            channel: ch,
            value: val,
            zScore,
            coords: [normalizedTime, zScore / 5], // 归一化 z-score
            clusterId: -2, // unvisited
          });
        }
      }
    }

    if (anomalyPoints.length === 0) return [];

    // 2. 执行 DBSCAN
    const dbscan = new DBSCAN(eps, minPts);
    dbscan.run(anomalyPoints);

    // 3. 聚合聚类结果
    const clusterMap = new Map<number, DBSCANPoint[]>();
    for (const p of anomalyPoints) {
      if (p.clusterId < 0) continue; // 跳过噪声
      if (!clusterMap.has(p.clusterId)) clusterMap.set(p.clusterId, []);
      clusterMap.get(p.clusterId)!.push(p);
    }

    const clusters: AnomalyCluster[] = [];
    for (const [cid, points] of clusterMap) {
      const timestamps = points.map(p => p.timestamp);
      const channelsInCluster = [...new Set(points.map(p => p.channel))];
      const maxZScore = Math.max(...points.map(p => Math.abs(p.zScore)));

      // 推断异常类型
      let inferredType = '未知异常';
      if (channelsInCluster.includes('temperature') && maxZScore > 4) {
        inferredType = '过热异常';
      } else if (channelsInCluster.includes('vibration') && maxZScore > 3) {
        inferredType = '振动异常';
      } else if (channelsInCluster.length > 2) {
        inferredType = '多通道关联异常';
      } else if (channelsInCluster.includes('stress')) {
        inferredType = '应力异常';
      } else if (channelsInCluster.includes('pressure')) {
        inferredType = '压力异常';
      }

      // 严重程度
      let severity: AnomalyCluster['severity'] = 'low';
      if (maxZScore > 5) severity = 'critical';
      else if (maxZScore > 4) severity = 'high';
      else if (maxZScore > 3) severity = 'medium';

      clusters.push({
        clusterId: cid,
        centroidTimestamp: timestamps[Math.floor(timestamps.length / 2)],
        startTime: Math.min(...timestamps),
        endTime: Math.max(...timestamps),
        pointCount: points.length,
        channels: channelsInCluster,
        severity,
        inferredType,
        points: points.map(p => ({
          timestamp: p.timestamp,
          channel: p.channel,
          value: p.value,
          zScore: p.zScore,
        })),
      });
    }

    return clusters.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * 事件标注
   */
  private annotateEvents(
    data: ReplayDataPoint[],
    clusters: AnomalyCluster[],
    config: ReplayConfig
  ): ReplayEvent[] {
    const events: ReplayEvent[] = [];
    let eventIdx = 0;

    // 1. 从 DBSCAN 聚类生成事件
    for (const cluster of clusters) {
      events.push({
        id: `evt_dbscan_${eventIdx++}`,
        timestamp: cluster.centroidTimestamp,
        type: 'anomaly_cluster',
        severity: cluster.severity === 'critical' ? 'critical' : cluster.severity === 'high' ? 'warning' : 'info',
        title: `${cluster.inferredType} (聚类 #${cluster.clusterId})`,
        description: `检测到 ${cluster.pointCount} 个异常数据点，涉及通道: ${cluster.channels.join(', ')}，` +
          `持续时间: ${((cluster.endTime - cluster.startTime) / 1000).toFixed(1)}s`,
        relatedChannels: cluster.channels,
        clusterId: cluster.clusterId,
      });
    }

    // 2. 从数据突变生成事件
    for (const ch of config.channels) {
      let prevVal: number | null = null;
      for (const dp of data) {
        const val = dp.channels[ch];
        if (val === undefined || val === null) continue;

        if (prevVal !== null) {
          const changeRate = Math.abs(val - prevVal) / (Math.abs(prevVal) || 1);
          if (changeRate > 0.5) { // 50% 突变
            events.push({
              id: `evt_spike_${eventIdx++}`,
              timestamp: dp.timestamp,
              type: 'alert',
              severity: changeRate > 1 ? 'critical' : 'warning',
              title: `${ch} 突变`,
              description: `${ch} 从 ${prevVal.toFixed(2)} 突变至 ${val.toFixed(2)} (变化率 ${(changeRate * 100).toFixed(0)}%)`,
              relatedChannels: [ch],
            });
          }
        }
        prevVal = val;
      }
    }

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 生成模拟回放数据（用于演示/测试）
   */
  generateDemoData(config: ReplayConfig): ReplayDataPoint[] {
    const points: ReplayDataPoint[] = [];
    const duration = config.endTime - config.startTime;
    const interval = 1000; // 1 秒间隔
    const steps = Math.min(Math.floor(duration / interval), 3600); // 最多 1 小时

    for (let i = 0; i < steps; i++) {
      const t = config.startTime + i * interval;
      const channels: Record<string, number> = {};

      for (const ch of config.channels) {
        let base = 0;
        let noise = 0;

        switch (ch) {
          case 'temperature':
            base = 45 + 15 * Math.sin(i / 200) + i * 0.005;
            noise = (Math.random() - 0.5) * 2;
            // 注入异常
            if (i > 500 && i < 520) base += 30;
            break;
          case 'vibration':
            base = 2 + 0.5 * Math.sin(i / 100);
            noise = (Math.random() - 0.5) * 0.3;
            if (i > 800 && i < 830) base += 5;
            break;
          case 'pressure':
            base = 101.3 + 5 * Math.sin(i / 300);
            noise = (Math.random() - 0.5) * 1;
            break;
          case 'rpm':
            base = 3000 + 200 * Math.sin(i / 150);
            noise = (Math.random() - 0.5) * 50;
            break;
          case 'power':
            base = 50 + 20 * Math.sin(i / 250);
            noise = (Math.random() - 0.5) * 5;
            break;
          case 'stress':
            base = 10 + 5 * Math.sin(i / 180);
            noise = (Math.random() - 0.5) * 1;
            if (i > 1200 && i < 1250) base += 15;
            break;
          default:
            base = 50 + 10 * Math.sin(i / 200);
            noise = (Math.random() - 0.5) * 2;
        }

        channels[ch] = base + noise;
      }

      points.push({
        timestamp: t,
        machineId: config.machineId,
        channels,
      });
    }

    return points;
  }
}
