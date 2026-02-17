/**
 * 工况归一化服务层 — TypeScript 翻译 Python ConditionNormalizer 引擎
 *
 * 核心模块：
 * 1. ConfigManager — 配置管理（默认 + 覆盖 + 热加载）
 * 2. BaselineLearner — 基线学习（IQR 异常值剔除 + EWMA 在线更新）
 * 3. ConditionIdentifier — 工况识别（PLC 规则 + 特征规则）
 * 4. FeatureNormalizer — 归一化方法（ratio / z-score）
 * 5. StatusChecker — 自适应阈值状态判定
 * 6. ConditionNormalizerEngine — 主引擎
 *
 * Python 对齐：
 * - BaselineLearner.learn_baseline → IQR 1.5倍 + clip(1%,99%) 一致
 * - BaselineLearner.update_baseline_online → EWMA(α=0.1) 一致
 * - ConditionIdentifier → PLC code + 特征规则 一致
 * - FeatureNormalizer → ratio / z-score 两种方法一致
 * - StatusChecker → 自适应阈值 normal/warning/danger 一致
 * - ConfigManager → 默认配置 + overrides + 热加载 一致
 */

import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('conditionNormalizer');

// ============================================================================
// 类型定义
// ============================================================================

export interface Baseline {
  mean: number;
  std: number;
  p5: number;
  p95: number;
}

export interface ThresholdRange {
  normal: [number, number];
  warning: [number, number];
  danger: [number, number];
}

export interface ConditionDef {
  description: string;
  keyFeatures: string;
  typicalDuration: string;
}

export interface PlcRule {
  plcCode: number;
}

export interface NormalizationBounds {
  ratioBounds: {
    normal: [number, number];
    attention: [number, number];
    warning: [number, number];
    severe: [number, number];
  };
  zscoreBounds: {
    normalLow: number;
    normalHigh: number;
    attentionLow: number;
    attentionHigh: number;
    anomalyLow: number;
    anomalyHigh: number;
  };
}

export interface ConditionNormalizerConfig {
  conditions: Record<string, ConditionDef>;
  plcRules: Record<string, PlcRule>;
  adaptiveThresholds: Record<string, Record<string, ThresholdRange>>;
  normalization: NormalizationBounds;
  thresholdIdleCurrent: number;
  loadWeightThreshold: number;
}

export interface DataSlice {
  timestamp?: string;
  plcCode?: number;
  current?: number;
  loadWeight?: number;
  vibrationSpeed?: number;
  bearingTemp?: number;
  motorSpeed?: number;
  [key: string]: any;
}

export interface NormalizationResult {
  condition: string;
  conditionLabel: string;
  features: Record<string, number>;
  normalizedFeatures: Record<string, number>;
  ratios: Record<string, number>;
  status: Record<string, string>;
  overallStatus: string;
  baseline: Record<string, Baseline | null>;
  method: string;
  timestamp: string;
}

export interface LearnResult {
  condition: string;
  feature: string;
  baseline: Baseline;
  sampleCount: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  condition: string;
  method: string;
  overallStatus: string;
  features: Record<string, number>;
  normalizedFeatures: Record<string, number>;
}

// ============================================================================
// ConfigManager — 配置管理器
// ============================================================================

function getDefaultConfig(): ConditionNormalizerConfig {
  return {
    conditions: {
      IDLE: { description: '待机空闲', keyFeatures: '电机停止', typicalDuration: '不定' },
      LIFT_EMPTY: { description: '空载起升', keyFeatures: '起升电机启动，无负载', typicalDuration: '30-60s' },
      LIFT_LOADED: { description: '重载起升', keyFeatures: '额定负载起升', typicalDuration: '30-60s' },
      TROLLEY_MOVE: { description: '小车行走', keyFeatures: '小车水平移动', typicalDuration: '20-40s' },
      LANDING: { description: '集装箱落地', keyFeatures: '冲击载荷', typicalDuration: '5-10s' },
    },
    plcRules: {
      IDLE: { plcCode: 0 },
      LIFT_EMPTY: { plcCode: 1 },
      LIFT_LOADED: { plcCode: 2 },
      TROLLEY_MOVE: { plcCode: 3 },
      LANDING: { plcCode: 4 },
    },
    adaptiveThresholds: {
      LIFT_LOADED: {
        '振动速度(mm/s)': { normal: [0, 4.5], warning: [4.5, 7.1], danger: [7.1, Infinity] },
        '电流比(%)': { normal: [60, 95], warning: [95, 105], danger: [105, Infinity] },
        '轴承温度(℃)': { normal: [20, 70], warning: [70, 85], danger: [85, Infinity] },
      },
      LIFT_EMPTY: {
        '振动速度(mm/s)': { normal: [0, 2.8], warning: [2.8, 4.5], danger: [4.5, Infinity] },
        '电流比(%)': { normal: [20, 50], warning: [50, 70], danger: [70, Infinity] },
        '轴承温度(℃)': { normal: [20, 55], warning: [55, 70], danger: [70, Infinity] },
      },
    },
    normalization: {
      ratioBounds: {
        normal: [0.8, 1.2],
        attention: [1.2, 1.5],
        warning: [1.5, 2.0],
        severe: [2.0, Infinity],
      },
      zscoreBounds: {
        normalLow: -2.0,
        normalHigh: 2.0,
        attentionLow: -3.0,
        attentionHigh: 3.0,
        anomalyLow: -Infinity,
        anomalyHigh: Infinity,
      },
    },
    thresholdIdleCurrent: 0.1,
    loadWeightThreshold: 10.0,
  };
}

let _configInstance: { config: ConditionNormalizerConfig; overrides: Record<string, any> } | null = null;

export function getConfig(overrides?: Record<string, any>): ConditionNormalizerConfig {
  if (!_configInstance) {
    const base = getDefaultConfig();
    if (overrides) {
      Object.assign(base, overrides);
    }
    _configInstance = { config: base, overrides: overrides || {} };
  } else if (overrides) {
    const base = getDefaultConfig();
    Object.assign(base, overrides);
    _configInstance = { config: base, overrides };
  }
  return _configInstance.config;
}

export function reloadConfig(overrides?: Record<string, any>): ConditionNormalizerConfig {
  _configInstance = null;
  return getConfig(overrides);
}

// ============================================================================
// BaselineLearner — 基线学习器
// ============================================================================

export class BaselineLearner {
  private baselines: Map<string, Map<string, Baseline>> = new Map();
  private maxSamplesPerBaseline = 10000;
  private ewmaAlpha = 0.1;

  /**
   * 从历史数据学习基线
   * Python 对齐：clip(1%,99%) → IQR 1.5倍异常值剔除 → 统计量计算
   */
  learnBaseline(condition: string, featureName: string, values: number[]): Baseline | null {
    if (!values || values.length < 3) {
      log.warn(`Skipping baseline for ${condition}-${featureName}: insufficient samples (${values?.length ?? 0})`);
      return null;
    }

    let arr = Float64Array.from(values);
    if (arr.length > this.maxSamplesPerBaseline) {
      arr = arr.slice(0, this.maxSamplesPerBaseline);
    }

    // clip(1%, 99%)
    const sorted = Float64Array.from(arr).sort();
    const low = percentile(sorted, 1);
    const high = percentile(sorted, 99);
    arr = arr.map(v => Math.max(low, Math.min(high, v)));

    // IQR 1.5倍异常值剔除
    const q1 = percentile(Float64Array.from(arr).sort(), 25);
    const q3 = percentile(Float64Array.from(arr).sort(), 75);
    const iqr = q3 - q1;
    let clean: number[];
    if (iqr === 0) {
      clean = Array.from(arr);
    } else {
      clean = Array.from(arr).filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    }

    if (clean.length === 0) {
      clean = Array.from(arr);
    }

    const baseline: Baseline = {
      mean: mean(clean),
      std: clean.length > 1 ? std(clean) : 0,
      p5: percentile(Float64Array.from(clean).sort(), 5),
      p95: percentile(Float64Array.from(clean).sort(), 95),
    };

    if (!this.baselines.has(condition)) {
      this.baselines.set(condition, new Map());
    }
    this.baselines.get(condition)!.set(featureName, baseline);
    log.info(`Baseline learned for ${condition}-${featureName}: mean=${baseline.mean.toFixed(2)}`);
    return baseline;
  }

  /**
   * EWMA 在线更新基线
   * Python 对齐：new_mean = α * new_value + (1-α) * old_mean
   */
  updateBaselineOnline(condition: string, featureName: string, newValue: number): void {
    const condMap = this.baselines.get(condition);
    if (!condMap) return;
    const b = condMap.get(featureName);
    if (!b) return;

    const newMean = this.ewmaAlpha * newValue + (1 - this.ewmaAlpha) * b.mean;
    condMap.set(featureName, { ...b, mean: newMean });
  }

  getBaseline(condition: string, featureName: string): Baseline | null {
    return this.baselines.get(condition)?.get(featureName) ?? null;
  }

  getAllBaselines(): Record<string, Record<string, Baseline>> {
    const result: Record<string, Record<string, Baseline>> = {};
    for (const [cond, features] of Array.from(this.baselines.entries())) {
      result[cond] = {};
      for (const [feat, bl] of Array.from(features.entries())) {
        result[cond][feat] = bl;
      }
    }
    return result;
  }

  loadBaselines(data: Record<string, Record<string, Baseline>>): void {
    this.baselines.clear();
    for (const [cond, features] of Object.entries(data)) {
      const condMap = new Map<string, Baseline>();
      for (const [feat, bl] of Object.entries(features)) {
        condMap.set(feat, bl);
      }
      this.baselines.set(cond, condMap);
    }
    log.info(`Baselines loaded: ${Object.keys(data).length} conditions`);
  }

  exportBaselines(): Record<string, Record<string, Baseline>> {
    return this.getAllBaselines();
  }
}

// ============================================================================
// ConditionIdentifier — 工况识别器
// ============================================================================

export class ConditionIdentifier {
  /**
   * 识别工况
   * Python 对齐：PLC code 优先 → 特征规则兜底
   */
  identify(dataSlice: DataSlice, config: ConditionNormalizerConfig): string {
    // PLC code 优先
    if (dataSlice.plcCode !== undefined && dataSlice.plcCode !== null) {
      for (const [cond, rule] of Object.entries(config.plcRules)) {
        if (rule.plcCode === dataSlice.plcCode) {
          return cond;
        }
      }
    }

    // 特征规则兜底
    const current = dataSlice.current ?? 0;
    const loadWeight = dataSlice.loadWeight ?? 0;
    const motorSpeed = dataSlice.motorSpeed ?? 0;

    if (current < config.thresholdIdleCurrent && motorSpeed < 10) {
      return 'IDLE';
    }

    if (loadWeight > config.loadWeightThreshold) {
      return 'LIFT_LOADED';
    }

    if (current > config.thresholdIdleCurrent && loadWeight <= config.loadWeightThreshold) {
      // 检查是否有水平移动特征
      const trolleySpeed = dataSlice.trolleySpeed ?? dataSlice['小车速度'] ?? 0;
      if (trolleySpeed > 0.1) {
        return 'TROLLEY_MOVE';
      }
      return 'LIFT_EMPTY';
    }

    // 冲击检测 (LANDING)
    const vibration = dataSlice.vibrationSpeed ?? dataSlice['振动速度'] ?? 0;
    if (vibration > 7.0 && loadWeight > config.loadWeightThreshold * 0.5) {
      return 'LANDING';
    }

    return 'IDLE';
  }
}

// ============================================================================
// FeatureNormalizer — 特征归一化器
// ============================================================================

export class FeatureNormalizer {
  /**
   * Ratio 归一化
   * Python 对齐：normalized = value / baseline.mean
   */
  normalizeRatio(value: number, baseline: Baseline): number {
    if (baseline.mean === 0) return value === 0 ? 1.0 : Infinity;
    return value / baseline.mean;
  }

  /**
   * Z-Score 归一化
   * Python 对齐：normalized = (value - baseline.mean) / baseline.std
   */
  normalizeZscore(value: number, baseline: Baseline): number {
    if (baseline.std === 0) return 0;
    return (value - baseline.mean) / baseline.std;
  }

  /**
   * 归一化单个特征值
   */
  normalize(value: number, baseline: Baseline, method: string = 'ratio'): number {
    if (method === 'zscore') {
      return this.normalizeZscore(value, baseline);
    }
    return this.normalizeRatio(value, baseline);
  }
}

// ============================================================================
// StatusChecker — 状态判定器
// ============================================================================

export class StatusChecker {
  /**
   * 使用自适应阈值判定状态
   * Python 对齐：根据工况 + 特征名查找阈值 → 判定 normal/warning/danger
   */
  checkAdaptive(
    value: number,
    condition: string,
    featureName: string,
    config: ConditionNormalizerConfig
  ): string {
    const condThresholds = config.adaptiveThresholds[condition];
    if (!condThresholds) return 'unknown';

    const featThreshold = condThresholds[featureName];
    if (!featThreshold) return 'unknown';

    if (value >= featThreshold.normal[0] && value <= featThreshold.normal[1]) {
      return 'normal';
    }
    if (value >= featThreshold.warning[0] && value <= featThreshold.warning[1]) {
      return 'warning';
    }
    if (value >= featThreshold.danger[0]) {
      return 'danger';
    }
    return 'normal';
  }

  /**
   * 使用归一化比值判定状态
   * Python 对齐：ratio_bounds 判定
   */
  checkRatio(ratio: number, config: ConditionNormalizerConfig): string {
    const bounds = config.normalization.ratioBounds;
    const absRatio = Math.abs(ratio);

    if (absRatio >= bounds.normal[0] && absRatio <= bounds.normal[1]) return 'normal';
    if (absRatio >= bounds.attention[0] && absRatio <= bounds.attention[1]) return 'attention';
    if (absRatio >= bounds.warning[0] && absRatio <= bounds.warning[1]) return 'warning';
    if (absRatio >= bounds.severe[0]) return 'severe';
    return 'normal';
  }

  /**
   * 使用 Z-Score 判定状态
   */
  checkZscore(zscore: number, config: ConditionNormalizerConfig): string {
    const bounds = config.normalization.zscoreBounds;
    if (zscore >= bounds.normalLow && zscore <= bounds.normalHigh) return 'normal';
    if (zscore >= bounds.attentionLow && zscore <= bounds.attentionHigh) return 'attention';
    return 'anomaly';
  }
}

// ============================================================================
// ConditionNormalizerEngine — 主引擎
// ============================================================================

export class ConditionNormalizerEngine {
  private baselineLearner = new BaselineLearner();
  private identifier = new ConditionIdentifier();
  private normalizer = new FeatureNormalizer();
  private statusChecker = new StatusChecker();
  private config: ConditionNormalizerConfig;
  private history: HistoryEntry[] = [];
  private maxHistory = 500;

  constructor(overrides?: Record<string, any>) {
    this.config = getConfig(overrides);
  }

  /**
   * 处理单个数据片段
   * Python 对齐：process_slice → 识别工况 → 提取特征 → 归一化 → 状态判定
   */
  processSlice(dataSlice: DataSlice, method: string = 'ratio', overrides?: Record<string, any>): NormalizationResult {
    if (overrides) {
      this.config = reloadConfig(overrides);
    }

    // 1. 识别工况
    const condition = this.identifier.identify(dataSlice, this.config);
    const condDef = this.config.conditions[condition];

    // 2. 提取特征
    const features = this.extractFeatures(dataSlice);

    // 3. 归一化
    const normalizedFeatures: Record<string, number> = {};
    const ratios: Record<string, number> = {};
    const status: Record<string, string> = {};
    const baselineMap: Record<string, Baseline | null> = {};

    for (const [featName, featValue] of Object.entries(features)) {
      const baseline = this.baselineLearner.getBaseline(condition, featName);
      baselineMap[featName] = baseline;

      if (baseline) {
        const normalized = this.normalizer.normalize(featValue, baseline, method);
        normalizedFeatures[featName] = normalized;
        ratios[featName] = method === 'ratio' ? normalized : featValue / (baseline.mean || 1);

        // 状态判定：优先自适应阈值，其次归一化比值
        const adaptiveStatus = this.statusChecker.checkAdaptive(featValue, condition, featName, this.config);
        if (adaptiveStatus !== 'unknown') {
          status[featName] = adaptiveStatus;
        } else if (method === 'zscore') {
          status[featName] = this.statusChecker.checkZscore(normalized, this.config);
        } else {
          status[featName] = this.statusChecker.checkRatio(normalized, this.config);
        }

        // EWMA 在线更新
        this.baselineLearner.updateBaselineOnline(condition, featName, featValue);
      } else {
        normalizedFeatures[featName] = featValue;
        ratios[featName] = 1.0;
        status[featName] = 'no_baseline';
      }
    }

    // 4. 综合状态
    const statusValues = Object.values(status);
    let overallStatus = 'normal';
    if (statusValues.includes('danger') || statusValues.includes('severe')) {
      overallStatus = 'danger';
    } else if (statusValues.includes('warning')) {
      overallStatus = 'warning';
    } else if (statusValues.includes('attention')) {
      overallStatus = 'attention';
    }

    const result: NormalizationResult = {
      condition,
      conditionLabel: condDef?.description ?? condition,
      features,
      normalizedFeatures,
      ratios,
      status,
      overallStatus,
      baseline: baselineMap,
      method,
      timestamp: new Date().toISOString(),
    };

    // 记录历史
    this.addHistory(result);

    return result;
  }

  /**
   * 从历史数据学习基线
   * Python 对齐：learn_from_historical_data
   */
  learnFromHistoricalData(
    historicalData: DataSlice[],
    targetCondition?: string
  ): LearnResult[] {
    // 按工况分组
    const grouped: Record<string, Record<string, number[]>> = {};

    for (const slice of historicalData) {
      const condition = targetCondition || this.identifier.identify(slice, this.config);
      if (!grouped[condition]) grouped[condition] = {};

      const features = this.extractFeatures(slice);
      for (const [featName, featValue] of Object.entries(features)) {
        if (!grouped[condition][featName]) grouped[condition][featName] = [];
        grouped[condition][featName].push(featValue);
      }
    }

    // 学习基线
    const results: LearnResult[] = [];
    for (const [condition, features] of Object.entries(grouped)) {
      for (const [featName, values] of Object.entries(features)) {
        const baseline = this.baselineLearner.learnBaseline(condition, featName, values);
        if (baseline) {
          results.push({
            condition,
            feature: featName,
            baseline,
            sampleCount: values.length,
          });
        }
      }
    }

    log.info(`Learned ${results.length} baselines from ${historicalData.length} samples`);
    return results;
  }

  /**
   * 批量处理
   */
  processBatch(
    dataSlices: DataSlice[],
    method: string = 'ratio'
  ): NormalizationResult[] {
    return dataSlices.map(slice => this.processSlice(slice, method));
  }

  /**
   * 提取特征
   */
  private extractFeatures(dataSlice: DataSlice): Record<string, number> {
    const features: Record<string, number> = {};
    const featureKeys = [
      'vibrationSpeed', '振动速度', '振动速度(mm/s)',
      'current', '电流', '电流比(%)',
      'bearingTemp', '轴承温度', '轴承温度(℃)',
      'motorSpeed', '电机转速',
      'loadWeight', '载荷',
      'trolleySpeed', '小车速度',
    ];

    for (const key of featureKeys) {
      if (dataSlice[key] !== undefined && dataSlice[key] !== null && typeof dataSlice[key] === 'number') {
        features[key] = dataSlice[key] as number;
      }
    }

    // 也包含任何额外的数值字段
    for (const [key, value] of Object.entries(dataSlice)) {
      if (typeof value === 'number' && !['plcCode', 'timestamp'].includes(key) && !(key in features)) {
        features[key] = value;
      }
    }

    return features;
  }

  // 配置管理
  getConfigSnapshot(): ConditionNormalizerConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  updateConfig(overrides: Record<string, any>): ConditionNormalizerConfig {
    this.config = reloadConfig(overrides);
    return this.config;
  }

  // 阈值管理
  updateThreshold(
    condition: string,
    featureName: string,
    thresholds: ThresholdRange
  ): void {
    if (!this.config.adaptiveThresholds[condition]) {
      this.config.adaptiveThresholds[condition] = {};
    }
    this.config.adaptiveThresholds[condition][featureName] = thresholds;
    log.info(`Threshold updated: ${condition}-${featureName}`);
  }

  getThresholds(): Record<string, Record<string, ThresholdRange>> {
    return JSON.parse(JSON.stringify(this.config.adaptiveThresholds));
  }

  // 基线管理
  getBaselines(): Record<string, Record<string, Baseline>> {
    return this.baselineLearner.getAllBaselines();
  }

  loadBaselines(data: Record<string, Record<string, Baseline>>): void {
    this.baselineLearner.loadBaselines(data);
  }

  exportBaselines(): Record<string, Record<string, Baseline>> {
    return this.baselineLearner.exportBaselines();
  }

  // 工况定义管理
  getConditions(): Record<string, ConditionDef> {
    return JSON.parse(JSON.stringify(this.config.conditions));
  }

  addCondition(id: string, def: ConditionDef, plcCode?: number): void {
    this.config.conditions[id] = def;
    if (plcCode !== undefined) {
      this.config.plcRules[id] = { plcCode };
    }
    log.info(`Condition added: ${id} (${def.description})`);
  }

  removeCondition(id: string): boolean {
    if (this.config.conditions[id]) {
      delete this.config.conditions[id];
      delete this.config.plcRules[id];
      delete this.config.adaptiveThresholds[id];
      return true;
    }
    return false;
  }

  // 历史管理
  getHistory(limit: number = 50): HistoryEntry[] {
    return this.history.slice(-limit);
  }

  private addHistory(result: NormalizationResult): void {
    this.history.push({
      id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: result.timestamp,
      condition: result.condition,
      method: result.method,
      overallStatus: result.overallStatus,
      features: result.features,
      normalizedFeatures: result.normalizedFeatures,
    });

    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  clearHistory(): void {
    this.history = [];
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let _engineInstance: ConditionNormalizerEngine | null = null;

export function getEngine(overrides?: Record<string, any>): ConditionNormalizerEngine {
  if (!_engineInstance) {
    _engineInstance = new ConditionNormalizerEngine(overrides);
  }
  return _engineInstance;
}

export function resetEngine(overrides?: Record<string, any>): ConditionNormalizerEngine {
  _engineInstance = new ConditionNormalizerEngine(overrides);
  return _engineInstance;
}

// ============================================================================
// 数学工具函数
// ============================================================================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}
