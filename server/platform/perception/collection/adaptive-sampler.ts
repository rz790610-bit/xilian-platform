/**
 * ============================================================================
 * 自适应采样引擎 — 根据工况阶段动态调整采样率
 * ============================================================================
 *
 * 策略表（日照港岸桥场景示例）：
 *
 * | 工况阶段     | 基础采样率 | 高频采样率  | 触发条件           | 保留策略       |
 * |-------------|-----------|------------|-------------------|---------------|
 * | 空载待机     | 1 Hz      | 10 Hz      | 风速>7m/s          | aggregated    |
 * | 起升/下降    | 100 Hz    | 1 kHz      | 电流偏差>15%       | features_only |
 * | 平移联动     | 500 Hz    | 10 kHz     | 振动>3mm/s         | all           |
 * | 联动末端     | 1 kHz     | 100 kHz    | 默认               | all           |
 * | 开闭锁       | 200 Hz    | 5 kHz      | 压力偏差>10%       | features_only |
 * | 紧急制动     | 100 kHz   | 100 kHz    | 默认               | all           |
 *
 * 数据压缩策略：
 *   - none: 原始数据
 *   - delta: 差分编码（相邻值差异小时高效）
 *   - fft: FFT 频域压缩（保留主频成分）
 *   - wavelet: 小波变换压缩（保留瞬态特征）
 */

import { createModuleLogger } from '../../../core/logger';
const log = createModuleLogger('adaptive-sampler');


// ============================================================================
// 类型定义
// ============================================================================

export interface SamplingProfile {
  /** 工况阶段名称 */
  cyclePhase: string;
  /** 基础采样率 (Hz) */
  baseSamplingRate: number;
  /** 高频采样率 (Hz) */
  highFreqSamplingRate: number;
  /** 高频触发条件 */
  highFreqTrigger: SamplingTrigger;
  /** 数据保留策略 */
  retentionPolicy: 'all' | 'features_only' | 'aggregated' | 'sampled';
  /** 压缩方式 */
  compression: 'none' | 'delta' | 'fft' | 'wavelet';
  /** 特征提取窗口大小（样本数） */
  featureWindowSize: number;
  /** 特征提取滑动步长 */
  featureStride: number;
}

export interface SamplingTrigger {
  conditions: Array<{
    field: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'abs_deviation_pct';
    threshold: number;
    baseline?: number;
  }>;
  logic: 'and' | 'or';
}

export interface SamplingState {
  currentPhase: string;
  currentRate: number;
  isHighFreq: boolean;
  triggerReason: string | null;
  lastTransitionTime: number;
  dataReductionRatio: number;
  samplesCollected: number;
  samplesRetained: number;
}

export interface FeatureVector {
  timestamp: number;
  windowStart: number;
  windowEnd: number;
  sampleCount: number;
  features: {
    mean: number;
    std: number;
    min: number;
    max: number;
    rms: number;
    peak: number;
    crestFactor: number;
    kurtosis: number;
    skewness: number;
    zeroCrossingRate: number;
    energy: number;
    dominantFrequency?: number;
    spectralCentroid?: number;
  };
}

// ============================================================================
// 内置工况采样模板
// ============================================================================

export const CRANE_SAMPLING_PROFILES: SamplingProfile[] = [
  {
    cyclePhase: 'idle',
    baseSamplingRate: 1,
    highFreqSamplingRate: 10,
    highFreqTrigger: {
      conditions: [{ field: 'wind_speed', operator: 'gt', threshold: 7 }],
      logic: 'or',
    },
    retentionPolicy: 'aggregated',
    compression: 'delta',
    featureWindowSize: 60,
    featureStride: 30,
  },
  {
    cyclePhase: 'hoisting',
    baseSamplingRate: 100,
    highFreqSamplingRate: 1000,
    highFreqTrigger: {
      conditions: [{ field: 'motor_current', operator: 'abs_deviation_pct', threshold: 15 }],
      logic: 'or',
    },
    retentionPolicy: 'features_only',
    compression: 'fft',
    featureWindowSize: 1000,
    featureStride: 500,
  },
  {
    cyclePhase: 'traversing',
    baseSamplingRate: 500,
    highFreqSamplingRate: 10000,
    highFreqTrigger: {
      conditions: [{ field: 'vibration_rms', operator: 'gt', threshold: 3 }],
      logic: 'or',
    },
    retentionPolicy: 'all',
    compression: 'none',
    featureWindowSize: 5000,
    featureStride: 2500,
  },
  {
    cyclePhase: 'traversing_end',
    baseSamplingRate: 1000,
    highFreqSamplingRate: 100000,
    highFreqTrigger: {
      conditions: [],
      logic: 'and',
    },
    retentionPolicy: 'all',
    compression: 'none',
    featureWindowSize: 10000,
    featureStride: 5000,
  },
  {
    cyclePhase: 'locking',
    baseSamplingRate: 200,
    highFreqSamplingRate: 5000,
    highFreqTrigger: {
      conditions: [{ field: 'hydraulic_pressure', operator: 'abs_deviation_pct', threshold: 10 }],
      logic: 'or',
    },
    retentionPolicy: 'features_only',
    compression: 'fft',
    featureWindowSize: 2000,
    featureStride: 1000,
  },
  {
    cyclePhase: 'emergency_brake',
    baseSamplingRate: 100000,
    highFreqSamplingRate: 100000,
    highFreqTrigger: {
      conditions: [],
      logic: 'and',
    },
    retentionPolicy: 'all',
    compression: 'none',
    featureWindowSize: 100000,
    featureStride: 50000,
  },
];

// ============================================================================
// 自适应采样引擎
// ============================================================================

export class AdaptiveSamplingEngine {
  private profiles: Map<string, SamplingProfile> = new Map();
  private state: SamplingState;
  private featureBuffer: number[] = [];

  constructor(profiles?: SamplingProfile[]) {
    const initialProfiles = profiles || CRANE_SAMPLING_PROFILES;
    for (const p of initialProfiles) {
      this.profiles.set(p.cyclePhase, p);
    }

    this.state = {
      currentPhase: 'idle',
      currentRate: 1,
      isHighFreq: false,
      triggerReason: null,
      lastTransitionTime: Date.now(),
      dataReductionRatio: 1,
      samplesCollected: 0,
      samplesRetained: 0,
    };
  }

  /**
   * 切换工况阶段
   */
  switchPhase(phase: string): void {
    const profile = this.profiles.get(phase);
    if (!profile) {
      log.warn({ phase }, "Unknown phase, keeping current sampling rate");
      return;
    }

    this.state.currentPhase = phase;
    this.state.currentRate = profile.baseSamplingRate;
    this.state.isHighFreq = false;
    this.state.triggerReason = null;
    this.state.lastTransitionTime = Date.now();
    this.featureBuffer = [];
  }

  /**
   * 评估是否需要切换到高频模式
   */
  evaluateTrigger(sensorValues: Record<string, number>, baselines?: Record<string, number>): boolean {
    const profile = this.profiles.get(this.state.currentPhase);
    if (!profile || profile.highFreqTrigger.conditions.length === 0) return false;

    const results: boolean[] = [];

    for (const cond of profile.highFreqTrigger.conditions) {
      const value = sensorValues[cond.field];
      if (value === undefined) continue;

      let triggered = false;
      switch (cond.operator) {
        case 'gt': triggered = value > cond.threshold; break;
        case 'lt': triggered = value < cond.threshold; break;
        case 'gte': triggered = value >= cond.threshold; break;
        case 'lte': triggered = value <= cond.threshold; break;
        case 'abs_deviation_pct': {
          const baseline = cond.baseline ?? baselines?.[cond.field] ?? 0;
          if (baseline !== 0) {
            const deviation = Math.abs((value - baseline) / baseline) * 100;
            triggered = deviation > cond.threshold;
          }
          break;
        }
      }
      results.push(triggered);
    }

    const shouldTrigger = profile.highFreqTrigger.logic === 'and'
      ? results.every(r => r)
      : results.some(r => r);

    if (shouldTrigger && !this.state.isHighFreq) {
      this.state.isHighFreq = true;
      this.state.currentRate = profile.highFreqSamplingRate;
      this.state.triggerReason = `Trigger: ${JSON.stringify(sensorValues)}`;
    } else if (!shouldTrigger && this.state.isHighFreq) {
      // 延迟降频（避免频繁切换）
      const elapsed = Date.now() - this.state.lastTransitionTime;
      if (elapsed > 5000) {
        this.state.isHighFreq = false;
        this.state.currentRate = profile.baseSamplingRate;
        this.state.triggerReason = null;
      }
    }

    return shouldTrigger;
  }

  /**
   * 处理采样数据（特征提取 + 保留策略）
   */
  processSample(value: number): { retained: boolean; feature?: FeatureVector } {
    this.state.samplesCollected++;
    const profile = this.profiles.get(this.state.currentPhase);
    if (!profile) return { retained: true };

    this.featureBuffer.push(value);

    // 检查是否需要提取特征
    let feature: FeatureVector | undefined;
    if (this.featureBuffer.length >= profile.featureWindowSize) {
      feature = this.extractFeatures(
        this.featureBuffer.slice(0, profile.featureWindowSize),
        profile
      );
      // 滑动窗口
      this.featureBuffer = this.featureBuffer.slice(profile.featureStride);
    }

    // 保留策略
    let retained = false;
    switch (profile.retentionPolicy) {
      case 'all':
        retained = true;
        break;
      case 'features_only':
        retained = !!feature;
        break;
      case 'aggregated':
        retained = this.state.samplesCollected % Math.max(1, Math.floor(profile.baseSamplingRate / 10)) === 0;
        break;
      case 'sampled':
        retained = Math.random() < 0.1;
        break;
    }

    if (retained) this.state.samplesRetained++;

    // 更新数据压缩比
    this.state.dataReductionRatio = this.state.samplesCollected > 0
      ? 1 - (this.state.samplesRetained / this.state.samplesCollected)
      : 0;

    return { retained, feature };
  }

  /**
   * 提取特征向量
   */
  private extractFeatures(window: number[], profile: SamplingProfile): FeatureVector {
    const n = window.length;
    const mean = window.reduce((s, v) => s + v, 0) / n;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const min = Math.min(...window);
    const max = Math.max(...window);
    const rms = Math.sqrt(window.reduce((s, v) => s + v * v, 0) / n);
    const peak = Math.max(Math.abs(min), Math.abs(max));
    const crestFactor = rms > 0 ? peak / rms : 0;
    const energy = window.reduce((s, v) => s + v * v, 0);

    // 峰度
    const m4 = window.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
    const kurtosis = variance > 0 ? m4 / (variance ** 2) - 3 : 0;

    // 偏度
    const m3 = window.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
    const skewness = std > 0 ? m3 / (std ** 3) : 0;

    // 过零率
    let zeroCrossings = 0;
    for (let i = 1; i < n; i++) {
      if ((window[i] >= mean && window[i - 1] < mean) ||
          (window[i] < mean && window[i - 1] >= mean)) {
        zeroCrossings++;
      }
    }
    const zeroCrossingRate = zeroCrossings / (n - 1);

    return {
      timestamp: Date.now(),
      windowStart: Date.now() - (n / profile.baseSamplingRate) * 1000,
      windowEnd: Date.now(),
      sampleCount: n,
      features: {
        mean, std, min, max, rms, peak,
        crestFactor, kurtosis, skewness,
        zeroCrossingRate, energy,
      },
    };
  }

  /**
   * 获取当前采样状态
   */
  getState(): SamplingState {
    return { ...this.state };
  }

  /**
   * 获取当前工况的采样配置
   */
  getCurrentProfile(): SamplingProfile | undefined {
    return this.profiles.get(this.state.currentPhase);
  }

  /**
   * 更新采样配置
   */
  updateProfile(phase: string, updates: Partial<SamplingProfile>): void {
    const existing = this.profiles.get(phase);
    if (existing) {
      this.profiles.set(phase, { ...existing, ...updates });
    }
  }

  /**
   * 注册新工况采样配置
   */
  registerProfile(profile: SamplingProfile): void {
    this.profiles.set(profile.cyclePhase, profile);
  }

  /**
   * 获取所有配置
   */
  getAllProfiles(): SamplingProfile[] {
    return Array.from(this.profiles.values());
  }
}
