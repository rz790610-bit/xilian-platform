/**
 * ============================================================================
 * 状态向量合成器 — ClickHouse 多测点 → 21 维统一状态向量
 * ============================================================================
 *
 * 核心职责：
 *   1. 从 ClickHouse 查询指定设备的多测点时序数据
 *   2. 按维度定义（从 DB 加载）聚合为 21 维状态向量
 *   3. 输出 SensorStats（供 BPABuilder 消费）和 UnifiedStateVector
 *   4. 完整追溯：记录每次合成的数据源、聚合方法、缺失维度
 *
 * 维度定义（21 维，可通过 DB 配置扩展）：
 *   周期聚合特征（11 维）：
 *     D01 vibrationRms, D02 motorCurrentMean, D03 motorCurrentPeak,
 *     D04 windSpeedMean, D05 windGustMax, D06 loadWeight,
 *     D07 cycleTimeSec, D08 hydraulicPressureMean,
 *     D09 temperatureBearing, D10 temperatureMotor, D11 powerFactor
 *   不确定性因素（6 维）：
 *     D12 loadEccentricity, D13 spreaderFriction, D14 vesselMotion,
 *     D15 windDirection, D16 chlorideConcentration, D17 ambientHumidity
 *   累积指标（4 维）：
 *     D18 fatigueAccumPercent, D19 corrosionIndex,
 *     D20 totalCycles, D21 hoursSinceLastMaintenance
 *
 * 数据流：
 *   ClickHouse (telemetry_data / sensor_readings)
 *     → 按 device_id + metric_name 查询
 *     → 按 DimensionDef.aggregation 聚合
 *     → 21D StateVector + SensorStats
 *
 * 设计原则：
 *   - 维度定义从 DB 加载（state_vector_dimensions 表），支持前端编辑
 *   - 聚合方法可配置：mean, max, min, rms, latest, sum
 *   - 缺失维度使用默认值，并在质量标记中反映
 *   - 支持时间窗口配置（默认 5 分钟滑动窗口）
 */

import { createModuleLogger } from '../../../core/logger';
import { clickhouseConnector } from '../../connectors/clickhouse.connector';
import type { SensorStats } from '../fusion/bpa.types';

const log = createModuleLogger('state-vector-synthesizer');

// ============================================================================
// 类型定义
// ============================================================================

/** 聚合方法 */
export type AggregationMethod = 'mean' | 'max' | 'min' | 'rms' | 'latest' | 'sum' | 'std';

/** 维度分组 */
export type DimensionGroup = 'cycle_features' | 'uncertainty_factors' | 'cumulative_metrics';

/**
 * 维度定义 — 从 state_vector_dimensions 表加载
 */
export interface DimensionDef {
  /** 维度序号（1-21） */
  index: number;
  /** 维度标识（如 'vibrationRms'） */
  key: string;
  /** 显示名称 */
  label: string;
  /** 单位 */
  unit: string;
  /** 所属分组 */
  group: DimensionGroup;
  /** ClickHouse 中的 metric_name（可能是多个，逗号分隔） */
  metricNames: string[];
  /** 聚合方法 */
  aggregation: AggregationMethod;
  /** 默认值（数据缺失时使用） */
  defaultValue: number;
  /** 归一化范围 [min, max]（用于模型输入） */
  normalizeRange: [number, number];
  /** 数据源类型 */
  source: 'clickhouse' | 'mysql' | 'computed' | 'external';
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 合成后的状态向量
 */
export interface SynthesizedStateVector {
  /** 设备 ID */
  machineId: string;
  /** 合成时间戳 */
  timestamp: Date;
  /** 维度值映射 */
  dimensions: Record<string, number>;
  /** 归一化后的维度值（用于模型输入） */
  normalizedDimensions: number[];
  /** 质量信息 */
  quality: {
    /** 数据完整度（有值的维度占比） */
    completeness: number;
    /** 数据新鲜度（最新数据距今的秒数） */
    freshnessSeconds: number;
    /** 缺失的维度列表 */
    missingDimensions: string[];
    /** 使用默认值的维度列表 */
    defaultedDimensions: string[];
    /** 数据点总数 */
    totalDataPoints: number;
  };
  /** 原始聚合结果（用于追溯） */
  rawAggregations: Record<string, {
    value: number;
    count: number;
    method: AggregationMethod;
    source: string;
  }>;
}

/**
 * 合成器配置
 */
export interface SynthesizerConfig {
  /** 查询时间窗口（秒），默认 300（5 分钟） */
  windowSeconds: number;
  /** ClickHouse 遥测表名 */
  telemetryTable: string;
  /** 是否启用追溯日志 */
  enableTracing: boolean;
  /** 最大查询超时（毫秒） */
  queryTimeoutMs: number;
}

const DEFAULT_CONFIG: SynthesizerConfig = {
  windowSeconds: 300,
  telemetryTable: 'telemetry_data',
  enableTracing: true,
  queryTimeoutMs: 10000,
};

// ============================================================================
// 默认 21 维定义（岸桥/场桥）
// ============================================================================

export function createDefaultCraneDimensions(): DimensionDef[] {
  return [
    // ── 周期聚合特征（11 维） ──
    { index: 1, key: 'vibrationRms', label: '振动 RMS', unit: 'mm/s', group: 'cycle_features', metricNames: ['vibration_x', 'vibration_y', 'vibration_z', 'vibration_rms'], aggregation: 'rms', defaultValue: 0, normalizeRange: [0, 20], source: 'clickhouse', enabled: true },
    { index: 2, key: 'motorCurrentMean', label: '电机电流均值', unit: 'A', group: 'cycle_features', metricNames: ['motor_current', 'current_a', 'current_b', 'current_c'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 200], source: 'clickhouse', enabled: true },
    { index: 3, key: 'motorCurrentPeak', label: '电机电流峰值', unit: 'A', group: 'cycle_features', metricNames: ['motor_current', 'current_a', 'current_b', 'current_c'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 300], source: 'clickhouse', enabled: true },
    { index: 4, key: 'windSpeedMean', label: '风速均值', unit: 'm/s', group: 'cycle_features', metricNames: ['wind_speed', 'wind_speed_60m'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 40], source: 'clickhouse', enabled: true },
    { index: 5, key: 'windGustMax', label: '阵风最大值', unit: 'm/s', group: 'cycle_features', metricNames: ['wind_gust', 'wind_speed'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 50], source: 'clickhouse', enabled: true },
    { index: 6, key: 'loadWeight', label: '吊重', unit: 'tons', group: 'cycle_features', metricNames: ['load_weight', 'spreader_weight'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 65], source: 'clickhouse', enabled: true },
    { index: 7, key: 'cycleTimeSec', label: '作业周期时间', unit: 's', group: 'cycle_features', metricNames: ['cycle_time'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 300], source: 'clickhouse', enabled: true },
    { index: 8, key: 'hydraulicPressureMean', label: '液压压力均值', unit: 'MPa', group: 'cycle_features', metricNames: ['hydraulic_pressure', 'pressure'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 35], source: 'clickhouse', enabled: true },
    { index: 9, key: 'temperatureBearing', label: '轴承温度', unit: '°C', group: 'cycle_features', metricNames: ['temperature_bearing', 'bearing_temp'], aggregation: 'mean', defaultValue: 25, normalizeRange: [-20, 120], source: 'clickhouse', enabled: true },
    { index: 10, key: 'temperatureMotor', label: '电机温度', unit: '°C', group: 'cycle_features', metricNames: ['temperature_motor', 'motor_temp', 'winding_temp'], aggregation: 'mean', defaultValue: 25, normalizeRange: [-20, 150], source: 'clickhouse', enabled: true },
    { index: 11, key: 'powerFactor', label: '功率因数', unit: '', group: 'cycle_features', metricNames: ['power_factor', 'pf'], aggregation: 'mean', defaultValue: 0.85, normalizeRange: [0, 1], source: 'clickhouse', enabled: true },

    // ── 不确定性因素（6 维） ──
    { index: 12, key: 'loadEccentricity', label: '载荷偏心率', unit: '', group: 'uncertainty_factors', metricNames: ['load_eccentricity', 'eccentricity'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 1], source: 'clickhouse', enabled: true },
    { index: 13, key: 'spreaderFriction', label: '吊具摩擦系数', unit: '', group: 'uncertainty_factors', metricNames: ['spreader_friction', 'friction_coeff'], aggregation: 'mean', defaultValue: 0.15, normalizeRange: [0, 1], source: 'clickhouse', enabled: true },
    { index: 14, key: 'vesselMotion', label: '船舶摇摆', unit: 'deg', group: 'uncertainty_factors', metricNames: ['vessel_motion', 'vessel_roll', 'vessel_pitch'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 15], source: 'clickhouse', enabled: true },
    { index: 15, key: 'windDirection', label: '风向', unit: 'deg', group: 'uncertainty_factors', metricNames: ['wind_direction', 'wind_dir'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 360], source: 'clickhouse', enabled: true },
    { index: 16, key: 'chlorideConcentration', label: '氯离子浓度', unit: 'mg/L', group: 'uncertainty_factors', metricNames: ['chloride_concentration', 'chloride'], aggregation: 'mean', defaultValue: 10, normalizeRange: [0, 100], source: 'clickhouse', enabled: true },
    { index: 17, key: 'ambientHumidity', label: '环境湿度', unit: '%', group: 'uncertainty_factors', metricNames: ['humidity', 'ambient_humidity'], aggregation: 'mean', defaultValue: 60, normalizeRange: [0, 100], source: 'clickhouse', enabled: true },

    // ── 累积指标（4 维） ──
    { index: 18, key: 'fatigueAccumPercent', label: '疲劳累积百分比', unit: '%', group: 'cumulative_metrics', metricNames: ['fatigue_accum'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 100], source: 'mysql', enabled: true },
    { index: 19, key: 'corrosionIndex', label: '腐蚀指数', unit: '', group: 'cumulative_metrics', metricNames: ['corrosion_index'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 1], source: 'mysql', enabled: true },
    { index: 20, key: 'totalCycles', label: '总作业次数', unit: 'count', group: 'cumulative_metrics', metricNames: ['total_cycles'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 1000000], source: 'mysql', enabled: true },
    { index: 21, key: 'hoursSinceLastMaintenance', label: '距上次维护小时数', unit: 'h', group: 'cumulative_metrics', metricNames: ['hours_since_maintenance'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 10000], source: 'mysql', enabled: true },
  ];
}

// ============================================================================
// 状态向量合成器
// ============================================================================

export class StateVectorSynthesizer {
  private readonly config: SynthesizerConfig;
  private dimensions: DimensionDef[];
  private readonly synthesisLogs: SynthesisLogEntry[] = [];

  private static readonly MAX_LOG_BUFFER = 500;

  constructor(
    dimensions?: DimensionDef[],
    config?: Partial<SynthesizerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dimensions = dimensions || createDefaultCraneDimensions();

    log.info({
      dimensionCount: this.dimensions.length,
      enabledCount: this.dimensions.filter(d => d.enabled).length,
      windowSeconds: this.config.windowSeconds,
    }, 'StateVectorSynthesizer initialized');
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 从 ClickHouse 合成状态向量
   *
   * @param machineId 设备 ID
   * @param cumulativeData 累积指标（从 MySQL 获取）
   * @returns 合成后的状态向量
   */
  async synthesize(
    machineId: string,
    cumulativeData?: Record<string, number>,
  ): Promise<SynthesizedStateVector> {
    const startTime = Date.now();

    // 1. 查询 ClickHouse 数据
    const clickhouseDimensions = this.dimensions.filter(
      d => d.enabled && d.source === 'clickhouse'
    );
    const rawData = await this.queryClickHouseData(machineId, clickhouseDimensions);

    // 2. 聚合各维度
    const dimensions: Record<string, number> = {};
    const rawAggregations: SynthesizedStateVector['rawAggregations'] = {};
    const missingDimensions: string[] = [];
    const defaultedDimensions: string[] = [];
    let totalDataPoints = 0;

    for (const dim of this.dimensions) {
      if (!dim.enabled) continue;

      if (dim.source === 'mysql' || dim.source === 'external') {
        // 从外部数据获取
        const value = cumulativeData?.[dim.key] ?? dim.defaultValue;
        dimensions[dim.key] = value;
        rawAggregations[dim.key] = {
          value,
          count: cumulativeData?.[dim.key] !== undefined ? 1 : 0,
          method: dim.aggregation,
          source: dim.source,
        };
        if (cumulativeData?.[dim.key] === undefined) {
          defaultedDimensions.push(dim.key);
        }
      } else {
        // 从 ClickHouse 聚合
        const metricData = this.extractMetricData(rawData, dim.metricNames);
        totalDataPoints += metricData.length;

        if (metricData.length === 0) {
          dimensions[dim.key] = dim.defaultValue;
          missingDimensions.push(dim.key);
          defaultedDimensions.push(dim.key);
          rawAggregations[dim.key] = {
            value: dim.defaultValue,
            count: 0,
            method: dim.aggregation,
            source: 'default',
          };
        } else {
          const aggregated = this.aggregate(metricData, dim.aggregation);
          dimensions[dim.key] = aggregated;
          rawAggregations[dim.key] = {
            value: aggregated,
            count: metricData.length,
            method: dim.aggregation,
            source: 'clickhouse',
          };
        }
      }
    }

    // 3. 归一化
    const normalizedDimensions = this.normalize(dimensions);

    // 4. 质量评估
    const enabledCount = this.dimensions.filter(d => d.enabled).length;
    const completeness = enabledCount > 0
      ? (enabledCount - missingDimensions.length) / enabledCount
      : 0;

    // 5. 计算新鲜度
    const freshnessSeconds = rawData.length > 0
      ? (Date.now() - Math.max(...rawData.map(r => new Date(r.timestamp).getTime()))) / 1000
      : Infinity;

    const result: SynthesizedStateVector = {
      machineId,
      timestamp: new Date(),
      dimensions,
      normalizedDimensions,
      quality: {
        completeness,
        freshnessSeconds: isFinite(freshnessSeconds) ? freshnessSeconds : -1,
        missingDimensions,
        defaultedDimensions,
        totalDataPoints,
      },
      rawAggregations,
    };

    // 6. 追溯日志
    if (this.config.enableTracing) {
      this.addSynthesisLog({
        timestamp: new Date(),
        machineId,
        durationMs: Date.now() - startTime,
        dimensionCount: enabledCount,
        completeness,
        missingCount: missingDimensions.length,
        totalDataPoints,
      });
    }

    log.info({
      machineId,
      completeness: +completeness.toFixed(2),
      missing: missingDimensions.length,
      dataPoints: totalDataPoints,
      durationMs: Date.now() - startTime,
    }, 'State vector synthesized');

    return result;
  }

  /**
   * 将合成结果转换为 SensorStats（供 BPABuilder 消费）
   */
  toSensorStats(vector: SynthesizedStateVector): SensorStats {
    return {
      vibrationRms: vector.dimensions.vibrationRms ?? 0,
      temperatureDev: (vector.dimensions.temperatureBearing ?? 25) - 25, // 相对于基线 25°C
      currentPeak: vector.dimensions.motorCurrentPeak ?? 0,
      stressDelta: 0, // 需要从应力传感器单独计算
      windSpeed60m: vector.dimensions.windSpeedMean ?? 0,
      // 扩展字段
      motorCurrentMean: vector.dimensions.motorCurrentMean ?? 0,
      windGustMax: vector.dimensions.windGustMax ?? 0,
      loadWeight: vector.dimensions.loadWeight ?? 0,
      hydraulicPressureMean: vector.dimensions.hydraulicPressureMean ?? 0,
      temperatureBearing: vector.dimensions.temperatureBearing ?? 25,
      temperatureMotor: vector.dimensions.temperatureMotor ?? 25,
      powerFactor: vector.dimensions.powerFactor ?? 0.85,
      loadEccentricity: vector.dimensions.loadEccentricity ?? 0,
      ambientHumidity: vector.dimensions.ambientHumidity ?? 60,
    };
  }

  // ==========================================================================
  // ClickHouse 查询
  // ==========================================================================

  /**
   * 查询 ClickHouse 中指定设备的遥测数据
   */
  private async queryClickHouseData(
    machineId: string,
    dimensions: DimensionDef[],
  ): Promise<Array<{ metric_name: string; value: number; timestamp: string }>> {
    // 收集所有需要查询的 metric_name
    const allMetricNames = new Set<string>();
    for (const dim of dimensions) {
      for (const mn of dim.metricNames) {
        allMetricNames.add(mn);
      }
    }

    if (allMetricNames.size === 0) return [];

    const metricList = [...allMetricNames].map(m => `'${m}'`).join(',');
    const windowStart = new Date(Date.now() - this.config.windowSeconds * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '');

    const sql = `
      SELECT metric_name, value, timestamp
      FROM ${this.config.telemetryTable}
      WHERE device_id = '${machineId}'
        AND metric_name IN (${metricList})
        AND timestamp >= '${windowStart}'
      ORDER BY timestamp DESC
    `;

    try {
      const rows = await clickhouseConnector.query(sql, this.config.queryTimeoutMs);
      return rows;
    } catch (err: any) {
      log.warn({
        machineId,
        error: err.message,
      }, 'ClickHouse query failed, returning empty data');
      return [];
    }
  }

  /**
   * 从原始数据中提取指定 metric_name 的值
   */
  private extractMetricData(
    rawData: Array<{ metric_name: string; value: number; timestamp: string }>,
    metricNames: string[],
  ): number[] {
    const nameSet = new Set(metricNames);
    return rawData
      .filter(r => nameSet.has(r.metric_name))
      .map(r => typeof r.value === 'number' ? r.value : parseFloat(r.value))
      .filter(v => isFinite(v));
  }

  // ==========================================================================
  // 聚合方法
  // ==========================================================================

  /**
   * 按指定方法聚合数据
   */
  private aggregate(values: number[], method: AggregationMethod): number {
    if (values.length === 0) return 0;

    switch (method) {
      case 'mean':
        return values.reduce((s, v) => s + v, 0) / values.length;

      case 'max':
        return Math.max(...values);

      case 'min':
        return Math.min(...values);

      case 'rms':
        return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);

      case 'latest':
        return values[0]; // 数据已按时间降序排列

      case 'sum':
        return values.reduce((s, v) => s + v, 0);

      case 'std': {
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
        return Math.sqrt(variance);
      }

      default:
        log.warn({ method }, 'Unknown aggregation method, using mean');
        return values.reduce((s, v) => s + v, 0) / values.length;
    }
  }

  // ==========================================================================
  // 归一化
  // ==========================================================================

  /**
   * 将维度值归一化到 [0, 1]
   */
  private normalize(dimensions: Record<string, number>): number[] {
    const result: number[] = [];

    for (const dim of this.dimensions) {
      if (!dim.enabled) continue;

      const value = dimensions[dim.key] ?? dim.defaultValue;
      const [min, max] = dim.normalizeRange;
      const range = max - min;

      if (range <= 0) {
        result.push(0);
      } else {
        const normalized = Math.max(0, Math.min(1, (value - min) / range));
        result.push(normalized);
      }
    }

    return result;
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /**
   * 热更新维度定义（从 DB 重新加载后调用）
   */
  updateDimensions(newDimensions: DimensionDef[]): void {
    this.dimensions = newDimensions;
    log.info({
      dimensionCount: newDimensions.length,
      enabledCount: newDimensions.filter(d => d.enabled).length,
    }, 'Dimensions updated');
  }

  /**
   * 获取当前维度定义
   */
  getDimensions(): DimensionDef[] {
    return [...this.dimensions];
  }

  /**
   * 获取维度名称列表
   */
  getDimensionNames(): string[] {
    return this.dimensions.filter(d => d.enabled).map(d => d.key);
  }

  /**
   * 获取维度分组信息
   */
  getDimensionsByGroup(): Record<DimensionGroup, DimensionDef[]> {
    const groups: Record<DimensionGroup, DimensionDef[]> = {
      cycle_features: [],
      uncertainty_factors: [],
      cumulative_metrics: [],
    };

    for (const dim of this.dimensions) {
      if (dim.enabled) {
        groups[dim.group].push(dim);
      }
    }

    return groups;
  }

  // ==========================================================================
  // 追溯日志
  // ==========================================================================

  getRecentLogs(limit: number = 100): SynthesisLogEntry[] {
    return this.synthesisLogs.slice(-limit);
  }

  exportAndClearLogs(): SynthesisLogEntry[] {
    const logs = [...this.synthesisLogs];
    this.synthesisLogs.length = 0;
    return logs;
  }

  private addSynthesisLog(entry: SynthesisLogEntry): void {
    this.synthesisLogs.push(entry);
    if (this.synthesisLogs.length > StateVectorSynthesizer.MAX_LOG_BUFFER) {
      this.synthesisLogs.splice(0, this.synthesisLogs.length - StateVectorSynthesizer.MAX_LOG_BUFFER);
    }
  }
}

// ============================================================================
// 追溯日志类型
// ============================================================================

export interface SynthesisLogEntry {
  timestamp: Date;
  machineId: string;
  durationMs: number;
  dimensionCount: number;
  completeness: number;
  missingCount: number;
  totalDataPoints: number;
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建默认岸桥状态向量合成器
 */
export function createCraneSynthesizer(
  config?: Partial<SynthesizerConfig>,
): StateVectorSynthesizer {
  return new StateVectorSynthesizer(createDefaultCraneDimensions(), config);
}
