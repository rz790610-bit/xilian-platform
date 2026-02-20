/**
 * ============================================================================
 * 感知管线 — 采集→融合→编码全链路
 * ============================================================================
 *
 * 数据流：
 *   边缘层 (100kHz) → RingBuffer → AdaptiveSampler → FeatureVector
 *     → DSFusionEngine → UncertaintyQuantifier → StateVectorEncoder
 *       → UnifiedStateVector → EventBus → 认知层
 *
 * 三层架构：
 *   1. 边缘层：RingBuffer + 自适应采样
 *   2. 汇聚层：特征提取 + DS 融合
 *   3. 平台层：状态向量编码 + 事件发射
 */

import { MultiChannelRingBufferManager, type SensorSample } from './collection/ring-buffer';
import { AdaptiveSamplingEngine, type SamplingProfile, type FeatureVector } from './collection/adaptive-sampler';
import { DSFusionEngine, type BPA, type EvidenceSourceConfig } from './fusion/ds-fusion-engine';
import { UncertaintyQuantifier, type UncertaintyInput } from './fusion/uncertainty-quantifier';
import { StateVectorEncoder, type UnifiedStateVector, type EncoderInput } from './encoding/state-vector-encoder';
import { ConditionProfileManager, type ConditionProfile } from './condition/condition-profile-manager';

// ============================================================================
// 类型定义
// ============================================================================

export interface PerceptionPipelineConfig {
  /** 缓冲区大小（字节/通道） */
  bufferSizePerChannel: number;
  /** DS 融合假设集 */
  fusionHypotheses: string[];
  /** 证据源配置 */
  evidenceSources: EvidenceSourceConfig[];
  /** 冲突阈值 */
  conflictThreshold: number;
  /** 状态向量发射间隔 (ms) */
  emitIntervalMs: number;
  /** 是否启用自动工况检测 */
  enableAutoDetection: boolean;
}

export interface PipelineStats {
  totalSamplesIngested: number;
  totalFeaturesExtracted: number;
  totalStateVectorsEmitted: number;
  totalFusionRuns: number;
  avgFusionConflict: number;
  avgUncertainty: number;
  uptimeMs: number;
  channelStats: Array<{ name: string; used: number; capacity: number }>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: PerceptionPipelineConfig = {
  bufferSizePerChannel: 65536,
  fusionHypotheses: ['normal', 'degraded', 'fault', 'critical'],
  evidenceSources: [
    { name: 'vibration', initialWeight: 0.3, reliabilityHalfLife: 24, maxContribution: 0.4, bayesianAdaptive: true },
    { name: 'electrical', initialWeight: 0.25, reliabilityHalfLife: 48, maxContribution: 0.35, bayesianAdaptive: true },
    { name: 'environmental', initialWeight: 0.2, reliabilityHalfLife: 12, maxContribution: 0.3, bayesianAdaptive: false },
    { name: 'maintenance', initialWeight: 0.15, reliabilityHalfLife: 168, maxContribution: 0.25, bayesianAdaptive: true },
    { name: 'production', initialWeight: 0.1, reliabilityHalfLife: 72, maxContribution: 0.2, bayesianAdaptive: false },
  ],
  conflictThreshold: 0.7,
  emitIntervalMs: 5000,
  enableAutoDetection: true,
};

// ============================================================================
// 感知管线
// ============================================================================

export class PerceptionPipeline {
  private config: PerceptionPipelineConfig;
  private bufferManager: MultiChannelRingBufferManager;
  private sampler: AdaptiveSamplingEngine;
  private fusionEngine: DSFusionEngine;
  private uncertaintyQuantifier: UncertaintyQuantifier;
  private stateVectorEncoder: StateVectorEncoder;
  private conditionManager: ConditionProfileManager;

  // 运行时状态
  private isRunning: boolean = false;
  private startTime: number = 0;
  private featureCache: Map<string, FeatureVector> = new Map();
  private latestStateVectors: Map<string, UnifiedStateVector> = new Map();

  // 统计
  private stats = {
    totalSamplesIngested: 0,
    totalFeaturesExtracted: 0,
    totalStateVectorsEmitted: 0,
    totalFusionRuns: 0,
    fusionConflictSum: 0,
    uncertaintySum: 0,
  };

  // 事件回调
  private onStateVectorEmit?: (vector: UnifiedStateVector) => void;
  private onAnomalyDetected?: (machineId: string, anomaly: Record<string, unknown>) => void;

  constructor(config: Partial<PerceptionPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.bufferManager = new MultiChannelRingBufferManager({
      bufferSize: this.config.bufferSizePerChannel,
    });
    this.sampler = new AdaptiveSamplingEngine();
    this.fusionEngine = new DSFusionEngine(
      this.config.fusionHypotheses,
      this.config.evidenceSources
    );
    this.uncertaintyQuantifier = new UncertaintyQuantifier();
    this.stateVectorEncoder = new StateVectorEncoder();
    this.conditionManager = new ConditionProfileManager();
  }

  /**
   * 启动管线
   */
  start(): void {
    this.isRunning = true;
    this.startTime = Date.now();
    console.log('[PerceptionPipeline] Started');
  }

  /**
   * 停止管线
   */
  stop(): void {
    this.isRunning = false;
    console.log('[PerceptionPipeline] Stopped');
  }

  /**
   * 注入传感器数据（边缘层入口）
   */
  ingestSamples(machineId: string, samples: SensorSample[]): void {
    if (!this.isRunning) return;

    this.stats.totalSamplesIngested += samples.length;

    // 写入环形缓冲
    this.bufferManager.writeSamples(samples);

    // 自适应采样处理
    for (const sample of samples) {
      const result = this.sampler.processSample(sample.value);
      if (result.feature) {
        const channelKey = `ch_${sample.channelIndex}`;
        this.featureCache.set(`${machineId}:${channelKey}`, result.feature);
        this.stats.totalFeaturesExtracted++;
      }
    }

    // 自动工况检测
    if (this.config.enableAutoDetection) {
      const sensorValues: Record<string, number> = {};
      for (const sample of samples) {
        sensorValues[`ch_${sample.channelIndex}`] = sample.value;
      }
      const detectedPhase = this.conditionManager.autoDetectPhase(machineId, sensorValues);
      if (detectedPhase) {
        this.sampler.switchPhase(detectedPhase);
      }
    }
  }

  /**
   * 执行融合 + 编码（汇聚层 + 平台层）
   */
  async processAndEmit(
    machineId: string,
    environmentalData: Record<string, number>,
    operationalData: Record<string, number>,
    cumulativeData: {
      fatigueAccumPercent: number;
      corrosionIndex: number;
      totalCycles: number;
      lastMaintenanceTime: number;
    }
  ): Promise<UnifiedStateVector | null> {
    if (!this.isRunning) return null;

    // 收集特征
    const sensorFeatures: Record<string, FeatureVector> = {};
    for (const [key, feature] of this.featureCache) {
      if (key.startsWith(`${machineId}:`)) {
        const channelName = key.split(':')[1];
        sensorFeatures[channelName] = feature;
      }
    }

    if (Object.keys(sensorFeatures).length === 0) return null;

    // DS 融合
    const evidences = this.buildEvidences(sensorFeatures, environmentalData);
    let fusionResult;
    try {
      fusionResult = this.fusionEngine.fuse(evidences, this.config.conflictThreshold);
      this.stats.totalFusionRuns++;
      this.stats.fusionConflictSum += fusionResult.conflictFactor;
    } catch (e) {
      console.warn('[PerceptionPipeline] Fusion failed:', e);
    }

    // 不确定性量化
    const uncertaintyInput: UncertaintyInput = {
      dataQuality: {
        sensorNoise: 0.1,
        missingRate: 0.05,
        latencyMs: 100,
        outlierRate: 0.02,
      },
      environmental: {
        windSpeed: environmentalData['wind_speed'] ?? 0,
        windGust: environmentalData['wind_gust'] ?? 0,
        temperature: environmentalData['temperature'] ?? 25,
        humidity: environmentalData['humidity'] ?? 60,
        chlorideConcentration: environmentalData['chloride_concentration'] ?? 10,
      },
      operational: {
        loadEccentricity: operationalData['load_eccentricity'] ?? 0,
        spreaderFriction: operationalData['spreader_friction'] ?? 0.15,
        vesselMotion: operationalData['vessel_motion'] ?? 0,
        cyclePhase: this.sampler.getState().currentPhase,
      },
    };
    const uncertaintyResult = this.uncertaintyQuantifier.quantify(uncertaintyInput);
    this.stats.uncertaintySum += uncertaintyResult.totalUncertainty;

    // 编码状态向量
    const condition = this.conditionManager.getCurrentCondition(machineId);
    const encoderInput: EncoderInput = {
      machineId,
      cyclePhase: this.sampler.getState().currentPhase,
      conditionProfileId: condition?.profile.id ?? 0,
      sensorFeatures,
      environmentalData,
      operationalData,
      cumulativeData,
      fusionResult,
      uncertaintyResult,
    };

    const stateVector = this.stateVectorEncoder.encode(encoderInput);
    this.latestStateVectors.set(machineId, stateVector);
    this.stats.totalStateVectorsEmitted++;

    // 发射事件
    this.onStateVectorEmit?.(stateVector);

    return stateVector;
  }

  /**
   * 构建 DS 证据
   */
  private buildEvidences(
    sensorFeatures: Record<string, FeatureVector>,
    environmentalData: Record<string, number>
  ): BPA[] {
    const evidences: BPA[] = [];

    // 振动证据
    const vibFeature = sensorFeatures['vibration'] || sensorFeatures['ch_0'];
    if (vibFeature) {
      const rms = vibFeature.features.rms;
      evidences.push({
        masses: new Map([
          ['normal', rms < 2.8 ? 0.7 : 0.1],
          ['degraded', rms >= 2.8 && rms < 4.5 ? 0.6 : 0.15],
          ['fault', rms >= 4.5 ? 0.6 : 0.1],
          ['normal,degraded,fault,critical', 0.05],
        ]),
        sourceName: 'vibration',
        weight: 0.3,
        reliability: 0.9,
        timestamp: vibFeature.timestamp,
      });
    }

    // 电气证据
    const currentFeature = sensorFeatures['motor_current'] || sensorFeatures['ch_1'];
    if (currentFeature) {
      const mean = currentFeature.features.mean;
      evidences.push({
        masses: new Map([
          ['normal', mean < 80 ? 0.65 : 0.1],
          ['degraded', mean >= 80 && mean < 100 ? 0.55 : 0.15],
          ['fault', mean >= 100 ? 0.55 : 0.1],
          ['normal,degraded,fault,critical', 0.1],
        ]),
        sourceName: 'electrical',
        weight: 0.25,
        reliability: 0.85,
        timestamp: currentFeature.timestamp,
      });
    }

    // 环境证据
    const windSpeed = environmentalData['wind_speed'];
    if (windSpeed !== undefined) {
      evidences.push({
        masses: new Map([
          ['normal', windSpeed < 7 ? 0.6 : 0.1],
          ['degraded', windSpeed >= 7 && windSpeed < 13 ? 0.5 : 0.15],
          ['critical', windSpeed >= 13 ? 0.6 : 0.05],
          ['normal,degraded,fault,critical', 0.15],
        ]),
        sourceName: 'environmental',
        weight: 0.2,
        reliability: 0.8,
        timestamp: Date.now(),
      });
    }

    return evidences;
  }

  /**
   * 获取设备最新状态向量
   */
  getLatestStateVector(machineId: string): UnifiedStateVector | undefined {
    return this.latestStateVectors.get(machineId);
  }

  /**
   * 获取管线统计
   */
  getStats(): PipelineStats {
    const channelStats = this.bufferManager.getAllStats().map(s => ({
      name: s.channelName,
      used: s.used,
      capacity: s.capacity,
    }));

    return {
      totalSamplesIngested: this.stats.totalSamplesIngested,
      totalFeaturesExtracted: this.stats.totalFeaturesExtracted,
      totalStateVectorsEmitted: this.stats.totalStateVectorsEmitted,
      totalFusionRuns: this.stats.totalFusionRuns,
      avgFusionConflict: this.stats.totalFusionRuns > 0
        ? this.stats.fusionConflictSum / this.stats.totalFusionRuns
        : 0,
      avgUncertainty: this.stats.totalStateVectorsEmitted > 0
        ? this.stats.uncertaintySum / this.stats.totalStateVectorsEmitted
        : 0,
      uptimeMs: this.isRunning ? Date.now() - this.startTime : 0,
      channelStats,
    };
  }

  /**
   * 设置事件回调
   */
  setCallbacks(callbacks: {
    onStateVectorEmit?: (vector: UnifiedStateVector) => void;
    onAnomalyDetected?: (machineId: string, anomaly: Record<string, unknown>) => void;
  }): void {
    this.onStateVectorEmit = callbacks.onStateVectorEmit;
    this.onAnomalyDetected = callbacks.onAnomalyDetected;
  }

  /**
   * 获取子组件引用（用于高级配置）
   */
  getComponents() {
    return {
      bufferManager: this.bufferManager,
      sampler: this.sampler,
      fusionEngine: this.fusionEngine,
      uncertaintyQuantifier: this.uncertaintyQuantifier,
      stateVectorEncoder: this.stateVectorEncoder,
      conditionManager: this.conditionManager,
    };
  }
}
