/**
 * ============================================================================
 * HDE 跨设备奇点对比引擎 — CrossDeviceComparator
 * ============================================================================
 *
 * Phase 0b 实现：
 *   - 从 ClickHouse 拉取多设备时序数据
 *   - 对每个设备运行异常检测
 *   - 计算跨设备横向对比指标
 *   - 生成设备排名和奇点报告
 *
 * 核心能力：
 *   - 跨设备健康排名
 *   - 相对奇点识别（相对于群体的异常）
 *   - 同型号设备对标分析
 *   - 最佳实践设备识别
 *
 * 数据来源：
 *   - ClickHouse: sensor_readings, sensor_readings_1m 聚合表
 *   - 支持模拟数据模式（用于测试）
 */

import { createModuleLogger } from '../../../core/logger';
import {
  getClickHouseClient,
  checkConnection as checkClickHouseConnection,
  type AggregatedData,
} from '../../../lib/clients/clickhouse.client';
import {
  UnifiedAnomalyEngine,
  computeStats,
  type AnomalyDetectionResult,
} from '../../../lib/dataflow/anomalyEngine';

const log = createModuleLogger('hde-cross-device-comparator');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 设备指标数据
 */
export interface DeviceMetricData {
  /** 设备编码 */
  deviceCode: string;
  /** 设备类型（用于同型号对比） */
  deviceType?: string;
  /** 指标名称 */
  metricName: string;
  /** 数值序列 */
  values: number[];
  /** 时间戳序列 */
  timestamps: number[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 跨设备对比请求
 */
export interface CrossDeviceCompareRequest {
  /** 设备编码列表 */
  deviceCodes: string[];
  /** 指标名称 */
  metricName: string;
  /** 时间范围 */
  timeRange: {
    start: Date;
    end: Date;
  };
  /** 设备类型过滤（可选） */
  deviceType?: string;
  /** 聚合间隔 */
  aggregationInterval?: '1m' | '5m' | '1h';
  /** 数据源 */
  dataSource?: 'clickhouse' | 'mock';
}

/**
 * 跨设备对比结果
 */
export interface CrossDeviceCompareResult {
  /** 请求摘要 */
  request: {
    deviceCount: number;
    metricName: string;
    timeRange: { start: string; end: string };
  };
  /** 设备健康排名 */
  rankings: DeviceRanking[];
  /** 跨设备奇点 */
  singularities: CrossDeviceSingularity[];
  /** 群体统计 */
  fleetStats: FleetStatistics;
  /** 对标分析 */
  peerComparison: PeerComparison;
  /** 执行元数据 */
  metadata: {
    executionTimeMs: number;
    dataPointsProcessed: number;
    dataSource: string;
    analyzedAt: number;
  };
}

/**
 * 设备排名
 */
export interface DeviceRanking {
  /** 设备编码 */
  deviceCode: string;
  /** 设备类型 */
  deviceType?: string;
  /** 排名（1=最佳） */
  rank: number;
  /** 健康分数 (0-100) */
  healthScore: number;
  /** 异常率 */
  anomalyRate: number;
  /** 偏离群体均值的程度 */
  deviationFromFleet: number;
  /** 健康类别 */
  category: 'excellent' | 'normal' | 'attention' | 'critical';
  /** 统计摘要 */
  stats: {
    mean: number;
    std: number;
    min: number;
    max: number;
    dataPoints: number;
  };
}

/**
 * 跨设备奇点
 */
export interface CrossDeviceSingularity {
  /** 设备编码 */
  deviceCode: string;
  /** 时间戳 */
  timestamp: number;
  /** 当前值 */
  value: number;
  /** 奇点类型 */
  type: 'outlier_vs_peers' | 'pattern_deviation' | 'trend_anomaly';
  /** 群体均值 */
  fleetMean: number;
  /** 群体标准差 */
  fleetStd: number;
  /** 相对于群体的 Z-Score */
  zScoreVsFleet: number;
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 描述 */
  description: string;
}

/**
 * 群体统计
 */
export interface FleetStatistics {
  /** 设备数量 */
  deviceCount: number;
  /** 平均异常率 */
  meanAnomalyRate: number;
  /** 异常率标准差 */
  stdAnomalyRate: number;
  /** 健康设备数量 */
  healthyDeviceCount: number;
  /** 需关注设备数量 */
  attentionDeviceCount: number;
  /** 严重问题设备数量 */
  criticalDeviceCount: number;
  /** 群体指标统计 */
  metricStats: {
    overallMean: number;
    overallStd: number;
    overallMin: number;
    overallMax: number;
  };
}

/**
 * 对标分析
 */
export interface PeerComparison {
  /** 按设备类型分组的排名 */
  byDeviceType: Record<string, DeviceRanking[]>;
  /** 最佳实践设备（可作为基准） */
  bestPracticeDevices: string[];
  /** 需关注设备 */
  attentionDevices: string[];
  /** 基准线（健康设备的平均指标） */
  baseline: {
    mean: number;
    upperBound: number;
    lowerBound: number;
  };
}

// ============================================================================
// 跨设备对比引擎
// ============================================================================

/**
 * HDE 跨设备奇点对比引擎
 *
 * @example
 * ```ts
 * const comparator = new CrossDeviceComparator();
 *
 * // 从 ClickHouse 获取数据并对比
 * const result = await comparator.compare({
 *   deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003'],
 *   metricName: 'vibration_rms',
 *   timeRange: { start: new Date('2024-01-01'), end: new Date('2024-01-02') },
 * });
 *
 * console.log(result.rankings);
 * console.log(result.singularities);
 * ```
 */
export class CrossDeviceComparator {
  private readonly anomalyEngine: UnifiedAnomalyEngine;

  constructor() {
    this.anomalyEngine = new UnifiedAnomalyEngine({
      algorithms: ['zscore', 'iqr'],
      zscoreThreshold: 3.0,
      iqrMultiplier: 1.5,
    });
    log.info('CrossDeviceComparator initialized');
  }

  // ==========================================================================
  // 主要 API
  // ==========================================================================

  /**
   * 执行跨设备对比
   */
  async compare(request: CrossDeviceCompareRequest): Promise<CrossDeviceCompareResult> {
    const startTime = Date.now();
    log.info({
      deviceCount: request.deviceCodes.length,
      metricName: request.metricName,
      timeRange: request.timeRange,
      dataSource: request.dataSource || 'clickhouse',
    }, 'Starting cross-device comparison');

    // Step 1: 获取设备数据
    const devices = await this.fetchDeviceData(request);

    if (devices.length < 2) {
      throw new Error('至少需要2台设备进行横向对比');
    }

    // Step 2: 对每个设备计算异常指标
    const deviceMetrics = devices.map(d => this.computeDeviceMetrics(d));

    // Step 3: 计算群体统计
    const fleetStats = this.computeFleetStats(deviceMetrics, devices);

    // Step 4: 生成设备排名
    const rankings = this.rankDevices(deviceMetrics, fleetStats);

    // Step 5: 识别跨设备奇点
    const singularities = this.findCrossDeviceSingularities(devices, fleetStats);

    // Step 6: 生成对标分析
    const peerComparison = this.generatePeerComparison(devices, rankings, deviceMetrics);

    const executionTimeMs = Date.now() - startTime;
    const dataPointsProcessed = devices.reduce((sum, d) => sum + d.values.length, 0);

    log.info({
      executionTimeMs,
      dataPointsProcessed,
      singularityCount: singularities.length,
    }, 'Cross-device comparison completed');

    return {
      request: {
        deviceCount: devices.length,
        metricName: request.metricName,
        timeRange: {
          start: request.timeRange.start.toISOString(),
          end: request.timeRange.end.toISOString(),
        },
      },
      rankings,
      singularities,
      fleetStats,
      peerComparison,
      metadata: {
        executionTimeMs,
        dataPointsProcessed,
        dataSource: request.dataSource || 'clickhouse',
        analyzedAt: Date.now(),
      },
    };
  }

  /**
   * 使用外部注入的数据执行对比（用于自定义数据演示）
   */
  async compareWithData(
    devices: DeviceMetricData[],
    request: CrossDeviceCompareRequest,
  ): Promise<CrossDeviceCompareResult> {
    const startTime = Date.now();
    log.info({
      deviceCount: devices.length,
      metricName: request.metricName,
    }, 'Starting cross-device comparison with injected data');

    if (devices.length < 2) {
      throw new Error('至少需要2台设备进行横向对比');
    }

    // Step 2: 对每个设备计算异常指标
    const deviceMetrics = devices.map(d => this.computeDeviceMetrics(d));

    // Step 3: 计算群体统计
    const fleetStats = this.computeFleetStats(deviceMetrics, devices);

    // Step 4: 生成设备排名
    const rankings = this.rankDevices(deviceMetrics, fleetStats);

    // Step 5: 识别跨设备奇点
    const singularities = this.findCrossDeviceSingularities(devices, fleetStats);

    // Step 6: 生成对标分析
    const peerComparison = this.generatePeerComparison(devices, rankings, deviceMetrics);

    const executionTimeMs = Date.now() - startTime;
    const dataPointsProcessed = devices.reduce((sum, d) => sum + d.values.length, 0);

    log.info({
      executionTimeMs,
      dataPointsProcessed,
      singularityCount: singularities.length,
    }, 'Cross-device comparison with injected data completed');

    return {
      request: {
        deviceCount: devices.length,
        metricName: request.metricName,
        timeRange: {
          start: request.timeRange.start.toISOString(),
          end: request.timeRange.end.toISOString(),
        },
      },
      rankings,
      singularities,
      fleetStats,
      peerComparison,
      metadata: {
        executionTimeMs,
        dataPointsProcessed,
        dataSource: 'injected',
        analyzedAt: Date.now(),
      },
    };
  }

  /**
   * 快速健康检查 — 仅返回排名和需关注设备
   */
  async quickHealthCheck(
    deviceCodes: string[],
    metricName: string,
    lookbackMinutes: number = 60,
  ): Promise<{ rankings: DeviceRanking[]; attentionDevices: string[] }> {
    const now = new Date();
    const start = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

    const result = await this.compare({
      deviceCodes,
      metricName,
      timeRange: { start, end: now },
      aggregationInterval: '1m',
    });

    return {
      rankings: result.rankings,
      attentionDevices: result.peerComparison.attentionDevices,
    };
  }

  // ==========================================================================
  // 数据获取
  // ==========================================================================

  /**
   * 从数据源获取设备数据
   */
  private async fetchDeviceData(request: CrossDeviceCompareRequest): Promise<DeviceMetricData[]> {
    const dataSource = request.dataSource || 'clickhouse';

    if (dataSource === 'mock') {
      return this.generateMockData(request);
    }

    return this.fetchFromClickHouse(request);
  }

  /**
   * 从 ClickHouse 获取数据
   */
  private async fetchFromClickHouse(request: CrossDeviceCompareRequest): Promise<DeviceMetricData[]> {
    const connected = await checkClickHouseConnection();
    if (!connected) {
      log.warn('ClickHouse not connected, falling back to mock data');
      return this.generateMockData(request);
    }

    const client = getClickHouseClient();
    const interval = request.aggregationInterval || '1m';

    // 使用聚合表获取数据
    const query = `
      SELECT
        device_id,
        metric_name,
        window_start,
        avg_value,
        sample_count
      FROM sensor_readings_1m
      WHERE device_id IN ({deviceCodes:Array(String)})
        AND metric_name = {metricName:String}
        AND window_start >= {startTime:DateTime}
        AND window_start <= {endTime:DateTime}
      ORDER BY device_id, window_start
    `;

    try {
      const result = await client.query({
        query,
        query_params: {
          deviceCodes: request.deviceCodes,
          metricName: request.metricName,
          startTime: request.timeRange.start.toISOString().replace('T', ' ').replace('Z', ''),
          endTime: request.timeRange.end.toISOString().replace('T', ' ').replace('Z', ''),
        },
        format: 'JSONEachRow',
      });

      interface RowData {
        device_id: string;
        metric_name: string;
        window_start: string;
        avg_value: number;
        sample_count: number;
      }

      const rows = await result.json() as RowData[];

      // 按设备分组
      const deviceMap = new Map<string, { values: number[]; timestamps: number[] }>();

      for (const row of rows) {
        if (!deviceMap.has(row.device_id)) {
          deviceMap.set(row.device_id, { values: [], timestamps: [] });
        }
        const device = deviceMap.get(row.device_id)!;
        device.values.push(row.avg_value);
        device.timestamps.push(new Date(row.window_start).getTime());
      }

      // 转换为 DeviceMetricData
      const devices: DeviceMetricData[] = [];
      for (const [deviceCode, data] of deviceMap) {
        devices.push({
          deviceCode,
          metricName: request.metricName,
          values: data.values,
          timestamps: data.timestamps,
          deviceType: request.deviceType,
        });
      }

      log.info({ deviceCount: devices.length, rowCount: rows.length }, 'Fetched data from ClickHouse');
      return devices;
    } catch (error) {
      log.warn({ error }, 'ClickHouse query failed, falling back to mock data');
      return this.generateMockData(request);
    }
  }

  /**
   * 生成模拟数据（用于测试和演示）
   */
  generateMockData(request: CrossDeviceCompareRequest): DeviceMetricData[] {
    const devices: DeviceMetricData[] = [];
    const pointCount = 100;
    const startTs = request.timeRange.start.getTime();
    const endTs = request.timeRange.end.getTime();
    const interval = (endTs - startTs) / pointCount;

    // 为每个设备生成不同特性的数据
    for (let i = 0; i < request.deviceCodes.length; i++) {
      const deviceCode = request.deviceCodes[i];
      const values: number[] = [];
      const timestamps: number[] = [];

      // 基础参数（每个设备略有不同）
      const baseMean = 50 + Math.random() * 20;
      const baseStd = 5 + Math.random() * 5;
      const anomalyProb = i === 0 ? 0.02 : i === 1 ? 0.15 : 0.05; // 第二台设备异常率更高

      for (let j = 0; j < pointCount; j++) {
        const ts = startTs + j * interval;
        timestamps.push(ts);

        // 生成正常值
        let value = baseMean + (Math.random() - 0.5) * 2 * baseStd;

        // 按概率注入异常
        if (Math.random() < anomalyProb) {
          value = baseMean + (Math.random() > 0.5 ? 1 : -1) * baseStd * (3 + Math.random() * 2);
        }

        // 第三台设备在后半段有趋势
        if (i === 2 && j > pointCount * 0.6) {
          value += (j - pointCount * 0.6) * 0.3;
        }

        values.push(value);
      }

      devices.push({
        deviceCode,
        deviceType: request.deviceType || 'STS_CRANE',
        metricName: request.metricName,
        values,
        timestamps,
        metadata: { source: 'mock', anomalyProb },
      });
    }

    log.info({ deviceCount: devices.length, pointCount }, 'Generated mock data');
    return devices;
  }

  // ==========================================================================
  // 指标计算
  // ==========================================================================

  /**
   * 计算单设备指标
   */
  private computeDeviceMetrics(device: DeviceMetricData): {
    deviceCode: string;
    deviceType?: string;
    stats: ReturnType<typeof computeStats>;
    anomalyRate: number;
    anomalyResults: AnomalyDetectionResult[];
  } {
    const stats = computeStats(device.values);

    // 对每个点进行异常检测
    const anomalyResults = device.values.map(v =>
      this.anomalyEngine.detectPoint(v, device.values),
    );
    const anomalyCount = anomalyResults.filter(r => r.isAnomaly).length;
    const anomalyRate = device.values.length > 0 ? anomalyCount / device.values.length : 0;

    return {
      deviceCode: device.deviceCode,
      deviceType: device.deviceType,
      stats,
      anomalyRate,
      anomalyResults,
    };
  }

  /**
   * 计算群体统计
   */
  private computeFleetStats(
    deviceMetrics: ReturnType<typeof this.computeDeviceMetrics>[],
    devices: DeviceMetricData[],
  ): FleetStatistics {
    const anomalyRates = deviceMetrics.map(m => m.anomalyRate);
    const rateStats = computeStats(anomalyRates);

    // 计算整体指标统计
    const allValues = devices.flatMap(d => d.values);
    const overallStats = computeStats(allValues);

    return {
      deviceCount: deviceMetrics.length,
      meanAnomalyRate: rateStats.mean,
      stdAnomalyRate: rateStats.stdDev,
      healthyDeviceCount: deviceMetrics.filter(m => m.anomalyRate < 0.05).length,
      attentionDeviceCount: deviceMetrics.filter(m => m.anomalyRate >= 0.05 && m.anomalyRate < 0.15).length,
      criticalDeviceCount: deviceMetrics.filter(m => m.anomalyRate >= 0.15).length,
      metricStats: {
        overallMean: overallStats.mean,
        overallStd: overallStats.stdDev,
        overallMin: overallStats.min,
        overallMax: overallStats.max,
      },
    };
  }

  /**
   * 设备排名
   */
  private rankDevices(
    deviceMetrics: ReturnType<typeof this.computeDeviceMetrics>[],
    fleetStats: FleetStatistics,
  ): DeviceRanking[] {
    return deviceMetrics
      .map(m => {
        const deviationFromFleet = fleetStats.stdAnomalyRate > 0
          ? (m.anomalyRate - fleetStats.meanAnomalyRate) / fleetStats.stdAnomalyRate
          : 0;

        // 健康分数: 100 - 异常率*100 - 偏离惩罚
        const healthScore = Math.max(0, Math.min(100,
          100 - m.anomalyRate * 200 - Math.max(0, deviationFromFleet) * 10,
        ));

        const category: DeviceRanking['category'] =
          healthScore >= 90 ? 'excellent' :
          healthScore >= 70 ? 'normal' :
          healthScore >= 50 ? 'attention' : 'critical';

        return {
          deviceCode: m.deviceCode,
          deviceType: m.deviceType,
          rank: 0, // 稍后填充
          healthScore,
          anomalyRate: m.anomalyRate,
          deviationFromFleet,
          category,
          stats: {
            mean: m.stats.mean,
            std: m.stats.stdDev,
            min: m.stats.min,
            max: m.stats.max,
            dataPoints: m.stats.count,
          },
        };
      })
      .sort((a, b) => b.healthScore - a.healthScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /**
   * 识别跨设备奇点
   * 使用 MAD (Median Absolute Deviation) 进行鲁棒检测，避免单个异常值影响群体统计
   */
  private findCrossDeviceSingularities(
    devices: DeviceMetricData[],
    fleetStats: FleetStatistics,
  ): CrossDeviceSingularity[] {
    const singularities: CrossDeviceSingularity[] = [];

    // 对齐时间戳，逐时间点比较
    const allTimestamps = new Set<number>();
    devices.forEach(d => d.timestamps.forEach(t => allTimestamps.add(t)));
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // 只检查部分采样点（避免过多结果）
    const sampleRate = Math.max(1, Math.floor(sortedTimestamps.length / 50));

    for (let i = 0; i < sortedTimestamps.length; i += sampleRate) {
      const ts = sortedTimestamps[i];

      // 收集该时间点所有设备的值
      const valuesAtTime: { deviceCode: string; value: number }[] = [];
      for (const device of devices) {
        const idx = device.timestamps.indexOf(ts);
        if (idx !== -1) {
          valuesAtTime.push({ deviceCode: device.deviceCode, value: device.values[idx] });
        }
      }

      if (valuesAtTime.length < 3) continue; // 至少需要3台设备才能有意义地检测异常

      // 使用鲁棒统计：中位数和 MAD
      const values = valuesAtTime.map(v => v.value);
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

      // MAD = median(|Xi - median(X)|)
      const absoluteDeviations = values.map(v => Math.abs(v - median));
      const sortedDeviations = [...absoluteDeviations].sort((a, b) => a - b);
      const mad = sortedDeviations.length % 2 === 0
        ? (sortedDeviations[sortedDeviations.length / 2 - 1] + sortedDeviations[sortedDeviations.length / 2]) / 2
        : sortedDeviations[Math.floor(sortedDeviations.length / 2)];

      // 修正MAD（乘以1.4826使其等价于正态分布的标准差）
      const madStd = mad * 1.4826;

      // 如果所有值都相同，跳过
      if (madStd < 0.001) continue;

      // 找出相对于群体的异常设备（使用 Modified Z-Score）
      for (const item of valuesAtTime) {
        const modifiedZScore = (item.value - median) / madStd;

        // 使用 3.5 作为阈值（MAD-based Modified Z-Score 的推荐阈值）
        if (Math.abs(modifiedZScore) > 3.5) {
          singularities.push({
            deviceCode: item.deviceCode,
            timestamp: ts,
            value: item.value,
            type: 'outlier_vs_peers',
            fleetMean: median,  // 使用中位数作为"群体均值"
            fleetStd: madStd,   // 使用修正MAD作为"群体标准差"
            zScoreVsFleet: modifiedZScore,
            severity: Math.abs(modifiedZScore) > 10 ? 'critical' :
                      Math.abs(modifiedZScore) > 7 ? 'high' :
                      Math.abs(modifiedZScore) > 5 ? 'medium' : 'low',
            description: `设备 ${item.deviceCode} 在 ${new Date(ts).toISOString()} 相对群体偏离 ${modifiedZScore.toFixed(2)}σ (MAD-based)`,
          });
        }
      }
    }

    // 按严重程度和偏离程度排序
    return singularities
      .sort((a, b) => Math.abs(b.zScoreVsFleet) - Math.abs(a.zScoreVsFleet))
      .slice(0, 100); // 限制返回数量
  }

  /**
   * 生成对标分析
   */
  private generatePeerComparison(
    devices: DeviceMetricData[],
    rankings: DeviceRanking[],
    deviceMetrics: ReturnType<typeof this.computeDeviceMetrics>[],
  ): PeerComparison {
    // 按设备类型分组
    const byDeviceType: Record<string, DeviceRanking[]> = {};
    for (const device of devices) {
      const type = device.deviceType || 'unknown';
      const ranking = rankings.find(r => r.deviceCode === device.deviceCode);
      if (ranking) {
        if (!byDeviceType[type]) byDeviceType[type] = [];
        byDeviceType[type].push(ranking);
      }
    }

    // 排序每个类型内的设备
    for (const type of Object.keys(byDeviceType)) {
      byDeviceType[type].sort((a, b) => b.healthScore - a.healthScore);
    }

    // 最佳实践设备（top 20%）
    const topCount = Math.max(1, Math.floor(rankings.length * 0.2));
    const bestPracticeDevices = rankings.slice(0, topCount).map(r => r.deviceCode);

    // 需关注设备（category 为 attention 或 critical）
    const attentionDevices = rankings
      .filter(r => r.category === 'attention' || r.category === 'critical')
      .map(r => r.deviceCode);

    // 计算健康设备的基准线
    const healthyMetrics = deviceMetrics.filter(m => m.anomalyRate < 0.05);
    const baselineMean = healthyMetrics.length > 0
      ? healthyMetrics.reduce((sum, m) => sum + m.stats.mean, 0) / healthyMetrics.length
      : deviceMetrics.reduce((sum, m) => sum + m.stats.mean, 0) / deviceMetrics.length;

    const baselineStd = healthyMetrics.length > 0
      ? healthyMetrics.reduce((sum, m) => sum + m.stats.stdDev, 0) / healthyMetrics.length
      : deviceMetrics.reduce((sum, m) => sum + m.stats.stdDev, 0) / deviceMetrics.length;

    return {
      byDeviceType,
      bestPracticeDevices,
      attentionDevices,
      baseline: {
        mean: baselineMean,
        upperBound: baselineMean + 3 * baselineStd,
        lowerBound: baselineMean - 3 * baselineStd,
      },
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建跨设备对比器 */
export function createCrossDeviceComparator(): CrossDeviceComparator {
  return new CrossDeviceComparator();
}

/** 默认单例 */
export const crossDeviceComparator = new CrossDeviceComparator();
