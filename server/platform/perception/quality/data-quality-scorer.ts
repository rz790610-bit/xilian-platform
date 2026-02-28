/**
 * ============================================================================
 * 数据质量评分器 — 多维度综合质量评估
 * ============================================================================
 *
 * 核心能力：
 *   1. 五类数据完整度评分（机械/电气/结构/环境/作业）
 *   2. 四维准确度评分（传感器健康/连续性/一致性/物理合理性）
 *   3. 综合评分：completeness × 0.4 + accuracy × 0.6
 *   4. 与 anomalyEngine、conditionNormalizer 集成
 *   5. 统一质量评分接口
 *
 * 评分模型：
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │            综合质量评分 (0-100)                  │
 *   │  = completeness × 0.4 + accuracy × 0.6          │
 *   ├────────────────────────┬────────────────────────┤
 *   │     完整度 (0-100)     │     准确度 (0-100)     │
 *   │  mechanical   20%      │  sensorHealth   30%    │
 *   │  electrical   20%      │  continuity     25%    │
 *   │  structural   20%      │  consistency    20%    │
 *   │  environmental 20%     │  physicalValid  25%    │
 *   │  operational  20%      │                        │
 *   └────────────────────────┴────────────────────────┘
 *
 * 与 KNOWLEDGE_ARCHITECTURE.md §4 标签质量评分公式对齐：
 *   qualityScore = completeness × 0.4 + accuracy × 0.4 + traceability × 0.2
 *   本模块专注数据层质量，traceability 由管线层补充。
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('data-quality-scorer');

// ============================================================================
// 类型定义
// ============================================================================

/** 数据质量评分结果 */
export interface QualityScore {
  /** 综合评分 (0-100) */
  overall: number;
  /** 质量等级 */
  grade: QualityGrade;
  /** 完整度评分 (0-100) */
  completeness: CompletenessScore;
  /** 准确度评分 (0-100) */
  accuracy: AccuracyScore;
  /** 评分时间 */
  timestamp: number;
  /** 评分上下文 */
  context: ScoringContext;
  /** 改善建议 */
  suggestions: QualitySuggestion[];
}

/** 质量等级 */
export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** 完整度评分（五类） */
export interface CompletenessScore {
  /** 综合完整度 (0-100) */
  overall: number;
  /** 机械数据完整度 — 振动/轴承温度/转速 */
  mechanical: number;
  /** 电气数据完整度 — 电流/电压/功率因数 */
  electrical: number;
  /** 结构数据完整度 — 应力/应变/位移 */
  structural: number;
  /** 环境数据完整度 — 风速/温湿度/盐雾 */
  environmental: number;
  /** 作业数据完整度 — 工况/载荷/循环次数 */
  operational: number;
  /** 各类别详情 */
  details: Record<string, FieldCompleteness>;
}

/** 单字段完整度 */
export interface FieldCompleteness {
  /** 字段名 */
  field: string;
  /** 所属类别 */
  category: DataCategory;
  /** 期望数据点数 */
  expected: number;
  /** 实际有效数据点数 */
  actual: number;
  /** 完整率 (0-1) */
  ratio: number;
}

/** 准确度评分（四维） */
export interface AccuracyScore {
  /** 综合准确度 (0-100) */
  overall: number;
  /** 传感器健康度 — 信号质量/噪声水平/零漂 */
  sensorHealth: number;
  /** 连续性 — 无突变/无跳变/无长缺口 */
  continuity: number;
  /** 一致性 — 多传感器交叉验证/冗余校验 */
  consistency: number;
  /** 物理合理性 — 值在物理有效范围内/符合设备工况 */
  physicalValidity: number;
  /** 各维度详情 */
  details: AccuracyDetails;
}

/** 准确度详情 */
export interface AccuracyDetails {
  /** 异常点数（来自 anomalyEngine） */
  anomalyCount: number;
  /** 异常率 */
  anomalyRatio: number;
  /** 跳变/突变点数 */
  jumpCount: number;
  /** 长缺口数 */
  longGapCount: number;
  /** 物理越界点数 */
  outOfRangeCount: number;
  /** 一致性违反次数 */
  inconsistencyCount: number;
  /** 传感器故障标记 */
  faultySensors: string[];
}

/** 数据类别 */
export type DataCategory = 'mechanical' | 'electrical' | 'structural' | 'environmental' | 'operational';

/** 评分上下文 */
export interface ScoringContext {
  /** 设备 ID */
  deviceId: string;
  /** 时间窗口起始 */
  windowStartMs: number;
  /** 时间窗口结束 */
  windowEndMs: number;
  /** 工况阶段（可选） */
  cyclePhase?: string;
  /** 部件编码（可选） */
  componentCode?: string;
}

/** 质量改善建议 */
export interface QualitySuggestion {
  /** 建议类型 */
  type: 'missing_data' | 'sensor_fault' | 'calibration' | 'gap_fill' | 'outlier';
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 涉及的字段/传感器 */
  target: string;
  /** 建议描述 */
  message: string;
}

/** 评分器输入：数据切片集合 */
export interface ScoringInput {
  /** 设备 ID */
  deviceId: string;
  /** 时间窗口 */
  windowStartMs: number;
  windowEndMs: number;
  /** 工况阶段 */
  cyclePhase?: string;
  /** 部件编码 */
  componentCode?: string;
  /**
   * 数据通道：字段名 → 时间序列
   * 每个通道包含时间戳数组和值数组
   */
  channels: Record<string, ChannelData>;
  /** 异常检测结果（来自 anomalyEngine，可选） */
  anomalyResults?: AnomalyInputSummary;
  /** 工况归一化结果（来自 conditionNormalizer，可选） */
  normalizationStatus?: Record<string, string>;
}

/** 通道数据 */
export interface ChannelData {
  /** 时间戳数组 (Unix ms) */
  timestamps: number[] | Float64Array;
  /** 值数组 */
  values: number[] | Float64Array;
  /** 质量标记数组 (可选): 0=missing, 1=interpolated, 2=original */
  quality?: number[] | Uint8Array;
  /** 采样率 (Hz) */
  sampleRate?: number;
}

/** 异常检测摘要（从 anomalyEngine 接入） */
export interface AnomalyInputSummary {
  /** 各通道异常点数 */
  anomalyCounts: Record<string, number>;
  /** 各通道数据点总数 */
  totalCounts: Record<string, number>;
  /** 故障传感器列表 */
  faultySensors: string[];
}

// ============================================================================
// 字段到类别映射
// ============================================================================

/** 工业传感器字段 → 数据类别 */
const FIELD_CATEGORY_MAP: Record<string, DataCategory> = {
  // 机械
  vibrationRms: 'mechanical',
  vibrationPeak: 'mechanical',
  vibrationCrestFactor: 'mechanical',
  vibrationKurtosis: 'mechanical',
  bearingTemp: 'mechanical',
  motorTemp: 'mechanical',
  motorSpeed: 'mechanical',
  gearMeshFreq: 'mechanical',
  envelopeRms: 'mechanical',

  // 电气
  current: 'electrical',
  currentPeak: 'electrical',
  voltage: 'electrical',
  powerFactor: 'electrical',
  activePower: 'electrical',
  reactivePower: 'electrical',
  motorCurrent: 'electrical',

  // 结构
  stress: 'structural',
  stressDelta: 'structural',
  strain: 'structural',
  displacement: 'structural',
  tilt: 'structural',
  crackLength: 'structural',

  // 环境
  windSpeed: 'environmental',
  windSpeed60m: 'environmental',
  windDirection: 'environmental',
  ambientTemp: 'environmental',
  humidity: 'environmental',
  chlorideConcentration: 'environmental',

  // 作业
  loadWeight: 'operational',
  cycleCount: 'operational',
  cyclePhase: 'operational',
  plcCode: 'operational',
  hoistHeight: 'operational',
  trolleyPosition: 'operational',
  spreaderTwistLock: 'operational',
};

/** 各类别的最低期望字段数 */
const CATEGORY_MIN_FIELDS: Record<DataCategory, number> = {
  mechanical: 3,     // 至少：振动RMS + 轴承温度 + 转速
  electrical: 2,     // 至少：电流 + 功率因数
  structural: 1,     // 至少：应力
  environmental: 2,  // 至少：风速 + 环境温度
  operational: 2,    // 至少：载荷 + 工况
};

/** 各类别权重 */
const CATEGORY_WEIGHTS: Record<DataCategory, number> = {
  mechanical: 0.20,
  electrical: 0.20,
  structural: 0.20,
  environmental: 0.20,
  operational: 0.20,
};

/** 准确度各维度权重 */
const ACCURACY_WEIGHTS = {
  sensorHealth: 0.30,
  continuity: 0.25,
  consistency: 0.20,
  physicalValidity: 0.25,
};

/** 物理有效范围（标准单位，与 unit-registry 一致） */
const PHYSICAL_RANGES: Record<string, { min: number; max: number }> = {
  vibrationRms:     { min: 0,    max: 100 },    // mm/s
  vibrationPeak:    { min: 0,    max: 200 },    // mm/s
  bearingTemp:      { min: -20,  max: 200 },    // ℃
  motorTemp:        { min: -20,  max: 250 },    // ℃
  motorSpeed:       { min: 0,    max: 5000 },   // rpm
  current:          { min: 0,    max: 3000 },   // A
  currentPeak:      { min: 0,    max: 5000 },   // A
  voltage:          { min: 0,    max: 15000 },  // V
  powerFactor:      { min: 0,    max: 1.0 },
  stress:           { min: -500, max: 1000 },   // MPa
  stressDelta:      { min: -200, max: 200 },    // MPa
  windSpeed:        { min: 0,    max: 60 },     // m/s
  windSpeed60m:     { min: 0,    max: 80 },     // m/s
  ambientTemp:      { min: -40,  max: 60 },     // ℃
  humidity:         { min: 0,    max: 100 },     // %
  loadWeight:       { min: 0,    max: 100000 },  // kg
};

/** 跳变阈值：前后采样差超过此倍标准差视为跳变 */
const JUMP_THRESHOLD_SIGMA = 5.0;

/** 连续性：长缺口阈值（秒） */
const LONG_GAP_THRESHOLD_SEC = 10;

// ============================================================================
// 数据质量评分器
// ============================================================================

export class DataQualityScorer {
  /** 自定义字段映射（扩展或覆盖默认 FIELD_CATEGORY_MAP） */
  private readonly fieldMap: Record<string, DataCategory>;

  constructor(customFieldMap?: Record<string, DataCategory>) {
    this.fieldMap = { ...FIELD_CATEGORY_MAP, ...customFieldMap };
    log.info({ fieldCount: Object.keys(this.fieldMap).length }, '数据质量评分器初始化');
  }

  // --------------------------------------------------------------------------
  // 主评分接口
  // --------------------------------------------------------------------------

  /**
   * 计算综合数据质量评分
   *
   * 公式：overall = completeness × 0.4 + accuracy × 0.6
   */
  score(input: ScoringInput): QualityScore {
    const completeness = this.scoreCompleteness(input);
    const accuracy = this.scoreAccuracy(input);

    const overall = completeness.overall * 0.4 + accuracy.overall * 0.6;
    const grade = this.toGrade(overall);

    const suggestions = this.generateSuggestions(completeness, accuracy, input);

    const result: QualityScore = {
      overall: round2(overall),
      grade,
      completeness,
      accuracy,
      timestamp: Date.now(),
      context: {
        deviceId: input.deviceId,
        windowStartMs: input.windowStartMs,
        windowEndMs: input.windowEndMs,
        cyclePhase: input.cyclePhase,
        componentCode: input.componentCode,
      },
      suggestions,
    };

    log.info({
      deviceId: input.deviceId,
      overall: result.overall,
      grade,
      completeness: completeness.overall,
      accuracy: accuracy.overall,
      suggestions: suggestions.length,
    }, '质量评分完成');

    return result;
  }

  /**
   * 批量评分
   */
  scoreBatch(inputs: ScoringInput[]): QualityScore[] {
    return inputs.map(i => this.score(i));
  }

  // --------------------------------------------------------------------------
  // 完整度评分
  // --------------------------------------------------------------------------

  private scoreCompleteness(input: ScoringInput): CompletenessScore {
    const windowDurationMs = input.windowEndMs - input.windowStartMs;
    const details: Record<string, FieldCompleteness> = {};

    // 按类别分组
    const categoryScores: Record<DataCategory, number[]> = {
      mechanical: [],
      electrical: [],
      structural: [],
      environmental: [],
      operational: [],
    };

    for (const [field, channel] of Object.entries(input.channels)) {
      const category = this.fieldMap[field] ?? 'operational';
      const sampleRate = channel.sampleRate ?? this.estimateSampleRate(channel);
      const expected = Math.max(1, Math.floor((windowDurationMs / 1000) * sampleRate));
      const actual = this.countValidPoints(channel);
      const ratio = Math.min(1, actual / expected);

      details[field] = { field, category, expected, actual, ratio };
      categoryScores[category].push(ratio);
    }

    // 各类别评分：有数据通道取平均，无通道则惩罚
    const catResult: Record<DataCategory, number> = {
      mechanical: 0, electrical: 0, structural: 0, environmental: 0, operational: 0,
    };

    for (const cat of Object.keys(CATEGORY_MIN_FIELDS) as DataCategory[]) {
      const scores = categoryScores[cat];
      if (scores.length === 0) {
        // 该类别完全缺失
        catResult[cat] = 0;
      } else {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        // 如果通道数不足最低要求，按比例惩罚
        const coveragePenalty = Math.min(1, scores.length / CATEGORY_MIN_FIELDS[cat]);
        catResult[cat] = avg * coveragePenalty * 100;
      }
    }

    // 加权汇总
    let overall = 0;
    for (const cat of Object.keys(CATEGORY_WEIGHTS) as DataCategory[]) {
      overall += catResult[cat] * CATEGORY_WEIGHTS[cat];
    }

    return {
      overall: round2(overall),
      mechanical: round2(catResult.mechanical),
      electrical: round2(catResult.electrical),
      structural: round2(catResult.structural),
      environmental: round2(catResult.environmental),
      operational: round2(catResult.operational),
      details,
    };
  }

  // --------------------------------------------------------------------------
  // 准确度评分
  // --------------------------------------------------------------------------

  private scoreAccuracy(input: ScoringInput): AccuracyScore {
    let totalPoints = 0;
    let anomalyCount = 0;
    let jumpCount = 0;
    let longGapCount = 0;
    let outOfRangeCount = 0;
    let inconsistencyCount = 0;
    const faultySensors: string[] = input.anomalyResults?.faultySensors ?? [];

    for (const [field, channel] of Object.entries(input.channels)) {
      const vals = toNumberArray(channel.values);
      const ts = toNumberArray(channel.timestamps);
      const n = vals.length;
      totalPoints += n;

      // --- 传感器健康度指标 ---
      // 从外部 anomalyEngine 结果获取异常数
      if (input.anomalyResults?.anomalyCounts[field]) {
        anomalyCount += input.anomalyResults.anomalyCounts[field];
      } else {
        // 简单内建检测：NaN/Infinity 视为异常
        for (let i = 0; i < n; i++) {
          if (!isFinite(vals[i])) anomalyCount++;
        }
      }

      // 零方差检测（传感器卡死）
      if (n > 10) {
        const { std } = basicStats(vals);
        if (std === 0) {
          faultySensors.push(field);
        }
      }

      // --- 连续性指标 ---
      if (n > 1) {
        // 跳变检测
        const { mean, std } = basicStats(vals);
        const threshold = std > 0 ? JUMP_THRESHOLD_SIGMA * std : Math.abs(mean) * 0.5;
        for (let i = 1; i < n; i++) {
          if (Math.abs(vals[i] - vals[i - 1]) > threshold) {
            jumpCount++;
          }
        }

        // 长缺口检测
        const sampleRate = channel.sampleRate ?? this.estimateSampleRate(channel);
        const nominalDt = sampleRate > 0 ? 1000 / sampleRate : 1000;
        const gapThresholdMs = LONG_GAP_THRESHOLD_SEC * 1000;
        for (let i = 1; i < ts.length; i++) {
          if (ts[i] - ts[i - 1] > Math.max(gapThresholdMs, nominalDt * 10)) {
            longGapCount++;
          }
        }
      }

      // --- 物理合理性 ---
      const range = PHYSICAL_RANGES[field];
      if (range) {
        for (let i = 0; i < n; i++) {
          if (isFinite(vals[i]) && (vals[i] < range.min || vals[i] > range.max)) {
            outOfRangeCount++;
          }
        }
      }
    }

    // --- 一致性指标（多传感器交叉验证） ---
    inconsistencyCount = this.checkConsistency(input);

    // 各维度评分 (0-100)
    const safeTotal = Math.max(1, totalPoints);

    // 传感器健康度：无异常=100, 异常率越高分越低
    const anomalyRatio = anomalyCount / safeTotal;
    const sensorHealth = Math.max(0, (1 - anomalyRatio * 10) * 100); // 10%异常率→0分

    // 连续性：无跳变无缺口=100
    const jumpRatio = jumpCount / safeTotal;
    const gapPenalty = Math.min(longGapCount * 5, 50); // 每个长缺口扣 5 分，最多 50
    const continuity = Math.max(0, 100 - jumpRatio * 200 - gapPenalty);

    // 一致性：无违反=100
    const consistencyPenalty = Math.min(inconsistencyCount * 10, 100);
    const consistency = Math.max(0, 100 - consistencyPenalty);

    // 物理合理性：越界越多分越低
    const oorRatio = outOfRangeCount / safeTotal;
    const physicalValidity = Math.max(0, (1 - oorRatio * 20) * 100);

    // 加权汇总
    const overall =
      sensorHealth * ACCURACY_WEIGHTS.sensorHealth +
      continuity * ACCURACY_WEIGHTS.continuity +
      consistency * ACCURACY_WEIGHTS.consistency +
      physicalValidity * ACCURACY_WEIGHTS.physicalValidity;

    return {
      overall: round2(overall),
      sensorHealth: round2(sensorHealth),
      continuity: round2(continuity),
      consistency: round2(consistency),
      physicalValidity: round2(physicalValidity),
      details: {
        anomalyCount,
        anomalyRatio: round4(anomalyRatio),
        jumpCount,
        longGapCount,
        outOfRangeCount,
        inconsistencyCount,
        faultySensors: [...new Set(faultySensors)],
      },
    };
  }

  // --------------------------------------------------------------------------
  // 一致性检查（多传感器交叉验证）
  // --------------------------------------------------------------------------

  private checkConsistency(input: ScoringInput): number {
    let violations = 0;

    const channels = input.channels;

    // 规则 1: 振动 RMS 与峰值关系 — peak >= rms（物理必然）
    if (channels['vibrationRms'] && channels['vibrationPeak']) {
      const rms = toNumberArray(channels['vibrationRms'].values);
      const peak = toNumberArray(channels['vibrationPeak'].values);
      const n = Math.min(rms.length, peak.length);
      for (let i = 0; i < n; i++) {
        if (isFinite(rms[i]) && isFinite(peak[i]) && peak[i] < rms[i] * 0.95) {
          violations++;
        }
      }
    }

    // 规则 2: 功率因数范围 [0, 1]
    if (channels['powerFactor']) {
      const pf = toNumberArray(channels['powerFactor'].values);
      for (let i = 0; i < pf.length; i++) {
        if (isFinite(pf[i]) && (pf[i] < 0 || pf[i] > 1.01)) {
          violations++;
        }
      }
    }

    // 规则 3: 电机温度不应远低于环境温度（运行时）
    if (channels['motorTemp'] && channels['ambientTemp']) {
      const motor = toNumberArray(channels['motorTemp'].values);
      const ambient = toNumberArray(channels['ambientTemp'].values);
      const n = Math.min(motor.length, ambient.length);
      for (let i = 0; i < n; i++) {
        if (isFinite(motor[i]) && isFinite(ambient[i]) && motor[i] < ambient[i] - 10) {
          violations++;
        }
      }
    }

    // 规则 4: 载荷为正时电流应大于空载电流
    if (channels['loadWeight'] && channels['current']) {
      const load = toNumberArray(channels['loadWeight'].values);
      const curr = toNumberArray(channels['current'].values);
      const n = Math.min(load.length, curr.length);
      for (let i = 0; i < n; i++) {
        if (isFinite(load[i]) && isFinite(curr[i]) && load[i] > 1000 && curr[i] < 1) {
          violations++;
        }
      }
    }

    return violations;
  }

  // --------------------------------------------------------------------------
  // 建议生成
  // --------------------------------------------------------------------------

  private generateSuggestions(
    completeness: CompletenessScore,
    accuracy: AccuracyScore,
    input: ScoringInput,
  ): QualitySuggestion[] {
    const suggestions: QualitySuggestion[] = [];

    // 完整度建议
    const categories: DataCategory[] = ['mechanical', 'electrical', 'structural', 'environmental', 'operational'];
    for (const cat of categories) {
      if (completeness[cat] < 30) {
        suggestions.push({
          type: 'missing_data',
          priority: 'high',
          target: cat,
          message: `${cat} 类数据严重缺失 (${completeness[cat].toFixed(0)}%)，请检查传感器连接和数据采集通道`,
        });
      } else if (completeness[cat] < 70) {
        suggestions.push({
          type: 'missing_data',
          priority: 'medium',
          target: cat,
          message: `${cat} 类数据完整度不足 (${completeness[cat].toFixed(0)}%)，建议补充缺失通道`,
        });
      }
    }

    // 传感器故障
    for (const sensor of accuracy.details.faultySensors) {
      suggestions.push({
        type: 'sensor_fault',
        priority: 'high',
        target: sensor,
        message: `传感器 ${sensor} 疑似故障（零方差或异常率过高），建议现场检查`,
      });
    }

    // 物理合理性
    if (accuracy.physicalValidity < 70) {
      suggestions.push({
        type: 'calibration',
        priority: 'high',
        target: 'all',
        message: `物理合理性评分偏低 (${accuracy.physicalValidity.toFixed(0)}%)，可能存在单位错误或传感器校准偏差`,
      });
    }

    // 缺口
    if (accuracy.details.longGapCount > 0) {
      suggestions.push({
        type: 'gap_fill',
        priority: accuracy.details.longGapCount > 5 ? 'high' : 'medium',
        target: input.deviceId,
        message: `检测到 ${accuracy.details.longGapCount} 个长数据缺口，建议检查网络连接和数据采集稳定性`,
      });
    }

    // 异常值
    if (accuracy.details.anomalyRatio > 0.05) {
      suggestions.push({
        type: 'outlier',
        priority: 'medium',
        target: input.deviceId,
        message: `异常数据比例 ${(accuracy.details.anomalyRatio * 100).toFixed(1)}%，建议配合 anomalyEngine 做详细排查`,
      });
    }

    return suggestions;
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  private estimateSampleRate(channel: ChannelData): number {
    const ts = toNumberArray(channel.timestamps);
    if (ts.length < 2) return 1;
    // 取前 100 个间隔的中位数
    const diffs: number[] = [];
    const n = Math.min(ts.length, 101);
    for (let i = 1; i < n; i++) {
      const d = ts[i] - ts[i - 1];
      if (d > 0) diffs.push(d);
    }
    if (diffs.length === 0) return 1;
    diffs.sort((a, b) => a - b);
    const medianDt = diffs[Math.floor(diffs.length / 2)];
    return medianDt > 0 ? 1000 / medianDt : 1;
  }

  private countValidPoints(channel: ChannelData): number {
    const vals = toNumberArray(channel.values);
    if (channel.quality) {
      const q = channel.quality;
      let count = 0;
      for (let i = 0; i < q.length; i++) {
        if (q[i] > 0 && isFinite(vals[i])) count++;
      }
      return count;
    }
    // 无质量标记：统计有限值数量
    let count = 0;
    for (let i = 0; i < vals.length; i++) {
      if (isFinite(vals[i])) count++;
    }
    return count;
  }

  private toGrade(score: number): QualityGrade {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  // --------------------------------------------------------------------------
  // 扩展接口
  // --------------------------------------------------------------------------

  /** 注册自定义字段映射 */
  registerField(field: string, category: DataCategory): void {
    this.fieldMap[field] = category;
  }

  /** 获取字段映射 */
  getFieldMap(): Record<string, DataCategory> {
    return { ...this.fieldMap };
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function toNumberArray(arr: number[] | Float64Array | Uint8Array): number[] {
  return arr instanceof Array ? arr : Array.from(arr);
}

function basicStats(values: number[]): { mean: number; std: number } {
  const valid = values.filter(isFinite);
  if (valid.length === 0) return { mean: 0, std: 0 };
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length;
  return { mean, std: Math.sqrt(variance) };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ============================================================================
// 单例
// ============================================================================

let _instance: DataQualityScorer | null = null;

/** 获取全局 DataQualityScorer 单例 */
export function getDataQualityScorer(): DataQualityScorer {
  if (!_instance) {
    _instance = new DataQualityScorer();
  }
  return _instance;
}

/** 重置单例（用于测试） */
export function resetDataQualityScorer(): void {
  _instance = null;
}
