/**
 * ============================================================================
 * 统一状态向量编码器 — 从碎片数据到统一世界表示
 * ============================================================================
 *
 * 输入：多源碎片数据（传感器、环境、操作、维修历史）
 * 输出：统一状态向量 UnifiedStateVector
 *
 * 状态向量结构（21 维）：
 *   周期聚合特征（11 维）：
 *     vibrationRms, motorCurrentMean, motorCurrentPeak,
 *     windSpeedMean, windGustMax, loadWeight,
 *     cycleTimeSec, hydraulicPressureMean,
 *     temperatureBearing, temperatureMotor, powerFactor
 *
 *   不确定性因素（6 维）：
 *     loadEccentricity, spreaderFriction, vesselMotion,
 *     windDirection, chlorideConcentration, ambientHumidity
 *
 *   累积指标（4 维）：
 *     fatigueAccumPercent, corrosionIndex,
 *     totalCycles, hoursSinceLastMaintenance
 */

import type { FeatureVector } from '../collection/adaptive-sampler';
import type { FusionResult } from '../fusion/ds-fusion-engine';
import type { UncertaintyResult } from '../fusion/uncertainty-quantifier';

// ============================================================================
// 统一状态向量类型
// ============================================================================

export interface UnifiedStateVector {
  /** 设备 ID */
  machineId: string;
  /** 时间戳 */
  timestamp: number;
  /** 工况阶段 */
  cyclePhase: string;
  /** 工况 Profile ID */
  conditionProfileId: number;

  /** 周期聚合特征（11 维） */
  cycleFeatures: {
    vibrationRms: number;          // mm/s
    motorCurrentMean: number;      // A
    motorCurrentPeak: number;      // A
    windSpeedMean: number;         // m/s
    windGustMax: number;           // m/s
    loadWeight: number;            // tons
    cycleTimeSec: number;          // seconds
    hydraulicPressureMean: number; // MPa
    temperatureBearing: number;    // °C
    temperatureMotor: number;      // °C
    powerFactor: number;           // 0-1
  };

  /** 不确定性因素（6 维） */
  uncertaintyFactors: {
    loadEccentricity: number;      // 0-1
    spreaderFriction: number;      // 摩擦系数
    vesselMotion: number;          // degrees
    windDirection: number;         // degrees (0-360)
    chlorideConcentration: number; // mg/L
    ambientHumidity: number;       // %
  };

  /** 累积指标（4 维） */
  cumulativeMetrics: {
    fatigueAccumPercent: number;   // 0-100
    corrosionIndex: number;        // 0-1
    totalCycles: number;           // count
    hoursSinceLastMaintenance: number; // hours
  };

  /** 融合元数据 */
  fusionMeta: {
    conflictFactor: number;
    fusionMethod: string;
    sourcesCount: number;
    totalUncertainty: number;
    dominantUncertaintySource: string;
  };

  /** 质量标记 */
  quality: {
    completeness: number;          // 0-1 (数据完整度)
    freshness: number;             // 0-1 (数据新鲜度)
    confidence: number;            // 0-1 (综合置信度)
  };
}

/** 编码器输入 */
export interface EncoderInput {
  machineId: string;
  cyclePhase: string;
  conditionProfileId: number;
  /** 传感器特征（来自 AdaptiveSamplingEngine） */
  sensorFeatures: Record<string, FeatureVector>;
  /** 环境数据 */
  environmentalData: Record<string, number>;
  /** 操作数据 */
  operationalData: Record<string, number>;
  /** 累积指标（来自数据库） */
  cumulativeData: {
    fatigueAccumPercent: number;
    corrosionIndex: number;
    totalCycles: number;
    lastMaintenanceTime: number;
  };
  /** 融合结果（来自 DSFusionEngine） */
  fusionResult?: FusionResult;
  /** 不确定性结果（来自 UncertaintyQuantifier） */
  uncertaintyResult?: UncertaintyResult;
}

// ============================================================================
// 状态向量编码器
// ============================================================================

export class StateVectorEncoder {
  /**
   * 编码统一状态向量
   */
  encode(input: EncoderInput): UnifiedStateVector {
    const now = Date.now();

    // 提取周期聚合特征
    const cycleFeatures = this.extractCycleFeatures(input);

    // 提取不确定性因素
    const uncertaintyFactors = this.extractUncertaintyFactors(input);

    // 提取累积指标
    const cumulativeMetrics = this.extractCumulativeMetrics(input);

    // 融合元数据
    const fusionMeta = this.extractFusionMeta(input);

    // 质量评估
    const quality = this.assessQuality(input, cycleFeatures);

    return {
      machineId: input.machineId,
      timestamp: now,
      cyclePhase: input.cyclePhase,
      conditionProfileId: input.conditionProfileId,
      cycleFeatures,
      uncertaintyFactors,
      cumulativeMetrics,
      fusionMeta,
      quality,
    };
  }

  /**
   * 批量编码
   */
  encodeBatch(inputs: EncoderInput[]): UnifiedStateVector[] {
    return inputs.map(input => this.encode(input));
  }

  /**
   * 将状态向量转换为数值数组（用于模型输入）
   */
  toNumericArray(vector: UnifiedStateVector): number[] {
    return [
      // 周期聚合特征 (11)
      vector.cycleFeatures.vibrationRms,
      vector.cycleFeatures.motorCurrentMean,
      vector.cycleFeatures.motorCurrentPeak,
      vector.cycleFeatures.windSpeedMean,
      vector.cycleFeatures.windGustMax,
      vector.cycleFeatures.loadWeight,
      vector.cycleFeatures.cycleTimeSec,
      vector.cycleFeatures.hydraulicPressureMean,
      vector.cycleFeatures.temperatureBearing,
      vector.cycleFeatures.temperatureMotor,
      vector.cycleFeatures.powerFactor,
      // 不确定性因素 (6)
      vector.uncertaintyFactors.loadEccentricity,
      vector.uncertaintyFactors.spreaderFriction,
      vector.uncertaintyFactors.vesselMotion,
      vector.uncertaintyFactors.windDirection / 360, // 归一化
      vector.uncertaintyFactors.chlorideConcentration / 100, // 归一化
      vector.uncertaintyFactors.ambientHumidity / 100, // 归一化
      // 累积指标 (4)
      vector.cumulativeMetrics.fatigueAccumPercent / 100,
      vector.cumulativeMetrics.corrosionIndex,
      Math.log1p(vector.cumulativeMetrics.totalCycles) / 15, // 对数归一化
      Math.log1p(vector.cumulativeMetrics.hoursSinceLastMaintenance) / 10,
    ];
  }

  /**
   * 状态向量维度名称
   */
  static getDimensionNames(): string[] {
    return [
      'vibration_rms', 'motor_current_mean', 'motor_current_peak',
      'wind_speed_mean', 'wind_gust_max', 'load_weight',
      'cycle_time_sec', 'hydraulic_pressure_mean',
      'temperature_bearing', 'temperature_motor', 'power_factor',
      'load_eccentricity', 'spreader_friction', 'vessel_motion',
      'wind_direction', 'chloride_concentration', 'ambient_humidity',
      'fatigue_accum_percent', 'corrosion_index',
      'total_cycles', 'hours_since_maintenance',
    ];
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private extractCycleFeatures(input: EncoderInput): UnifiedStateVector['cycleFeatures'] {
    const sf = input.sensorFeatures;
    const env = input.environmentalData;
    const op = input.operationalData;

    return {
      vibrationRms: sf['vibration']?.features.rms ?? 0,
      motorCurrentMean: sf['motor_current']?.features.mean ?? 0,
      motorCurrentPeak: sf['motor_current']?.features.peak ?? 0,
      windSpeedMean: env['wind_speed'] ?? 0,
      windGustMax: env['wind_gust'] ?? 0,
      loadWeight: op['load_weight'] ?? 0,
      cycleTimeSec: op['cycle_time'] ?? 0,
      hydraulicPressureMean: sf['hydraulic_pressure']?.features.mean ?? 0,
      temperatureBearing: env['temperature_bearing'] ?? 0,
      temperatureMotor: env['temperature_motor'] ?? 0,
      powerFactor: sf['power']?.features.mean ?? 0,
    };
  }

  private extractUncertaintyFactors(input: EncoderInput): UnifiedStateVector['uncertaintyFactors'] {
    const op = input.operationalData;
    const env = input.environmentalData;

    return {
      loadEccentricity: op['load_eccentricity'] ?? 0,
      spreaderFriction: op['spreader_friction'] ?? 0,
      vesselMotion: op['vessel_motion'] ?? 0,
      windDirection: env['wind_direction'] ?? 0,
      chlorideConcentration: env['chloride_concentration'] ?? 0,
      ambientHumidity: env['humidity'] ?? 0,
    };
  }

  private extractCumulativeMetrics(input: EncoderInput): UnifiedStateVector['cumulativeMetrics'] {
    const cd = input.cumulativeData;
    return {
      fatigueAccumPercent: cd.fatigueAccumPercent,
      corrosionIndex: cd.corrosionIndex,
      totalCycles: cd.totalCycles,
      hoursSinceLastMaintenance: cd.lastMaintenanceTime > 0
        ? (Date.now() - cd.lastMaintenanceTime) / 3600000
        : 0,
    };
  }

  private extractFusionMeta(input: EncoderInput): UnifiedStateVector['fusionMeta'] {
    return {
      conflictFactor: input.fusionResult?.conflictFactor ?? 0,
      fusionMethod: input.fusionResult?.method ?? 'none',
      sourcesCount: input.fusionResult?.sources.length ?? 0,
      totalUncertainty: input.uncertaintyResult?.totalUncertainty ?? 0.5,
      dominantUncertaintySource: input.uncertaintyResult?.dominantSource ?? 'unknown',
    };
  }

  private assessQuality(
    input: EncoderInput,
    features: UnifiedStateVector['cycleFeatures']
  ): UnifiedStateVector['quality'] {
    // 完整度：有多少特征有值
    const featureValues = Object.values(features);
    const nonZeroCount = featureValues.filter(v => v !== 0).length;
    const completeness = nonZeroCount / featureValues.length;

    // 新鲜度：基于传感器特征的时间戳
    const timestamps = Object.values(input.sensorFeatures)
      .map(f => f.timestamp)
      .filter(t => t > 0);
    const maxAge = timestamps.length > 0
      ? Date.now() - Math.min(...timestamps)
      : Infinity;
    const freshness = maxAge < 60000 ? 1 : maxAge < 300000 ? 0.8 : maxAge < 3600000 ? 0.5 : 0.2;

    // 综合置信度
    const confidence = completeness * freshness * (1 - (input.uncertaintyResult?.totalUncertainty ?? 0.5));

    return { completeness, freshness, confidence };
  }
}
