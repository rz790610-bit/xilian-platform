/**
 * ============================================================================
 * 感知管线 — 采集→融合→编码全链路（Phase 1 增强版）
 * ============================================================================
 *
 * 数据流：
 *   边缘层 (100kHz) → RingBuffer → AdaptiveSampler → FeatureVector
 *     → StateVectorSynthesizer → SensorStats
 *       → BPABuilder → BasicProbabilityAssignment[]
 *         → DSFusionEngine → EnhancedFusionResult
 *           → StateVectorEncoder → UnifiedStateVector → EventBus → 认知层
 *
 * Phase 1 增强点：
 *   1. 用 BPABuilder 替换硬编码的 buildEvidences()（C2/C3）
 *   2. 用 StateVectorSynthesizer 从 ClickHouse 合成 21D 向量（C4）
 *   3. 集成 EvidenceLearner 进行权重自学习（H4/H5）
 *   4. 完整追溯日志链路
 *
 * 三层架构：
 *   1. 边缘层：RingBuffer + 自适应采样
 *   2. 汇聚层：BPABuilder + DS 融合
 *   3. 平台层：状态向量编码 + 事件发射
 *
 * 三原则：可配置、可追溯、可复用
 */

import { MultiChannelRingBufferManager, type SensorSample } from './collection/ring-buffer';
import { AdaptiveSamplingEngine, type SamplingProfile, type FeatureVector } from './collection/adaptive-sampler';
import { DSFusionEngine, type BPA, type EvidenceSourceConfig, type EnhancedFusionResult } from './fusion/ds-fusion-engine';
import { UncertaintyQuantifier, type UncertaintyInput } from './fusion/uncertainty-quantifier';
import { StateVectorEncoder, type UnifiedStateVector, type EncoderInput } from './encoding/state-vector-encoder';
import { ConditionProfileManager, type ConditionProfile } from './condition/condition-profile-manager';
import { BPABuilder, createBPABuilder, type BPABuilderOptions } from './fusion/bpa-builder';
import { type BpaConfig, type SensorStats, type BasicProbabilityAssignment, toPerceptionBPA } from './fusion/bpa.types';
import { EvidenceLearner } from './fusion/evidence-learner';
import { StateVectorSynthesizer, createCraneSynthesizer, type DimensionDef, type SynthesizedStateVector } from './encoding/state-vector-synthesizer';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('perception-pipeline');

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
  /** BPA 配置（可选，不提供则使用默认岸桥配置） */
  bpaConfig?: BpaConfig;
  /** BPA 构建器选项 */
  bpaOptions?: Partial<BPABuilderOptions>;
  /** 维度定义（可选，不提供则使用默认 21 维） */
  dimensionDefs?: DimensionDef[];
  /** ClickHouse 查询时间窗口（秒） */
  clickhouseWindowSeconds?: number;
  /** 是否启用证据权重自学习 */
  enableEvidenceLearning?: boolean;
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
  /** Phase 1 新增统计 */
  bpaBuilderStats: {
    totalBuilds: number;
    configVersion: string;
    logBufferSize: number;
  };
  synthesizerStats: {
    totalSyntheses: number;
    avgCompleteness: number;
    logBufferSize: number;
  };
  evidenceLearnerStats: {
    registeredSources: number;
    degradedSources: number;
  };
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
    { name: 'temperature', initialWeight: 0.2, reliabilityHalfLife: 12, maxContribution: 0.3, bayesianAdaptive: true },
    { name: 'stress', initialWeight: 0.15, reliabilityHalfLife: 168, maxContribution: 0.25, bayesianAdaptive: true },
    { name: 'wind', initialWeight: 0.1, reliabilityHalfLife: 72, maxContribution: 0.2, bayesianAdaptive: false },
  ],
  conflictThreshold: 0.7,
  emitIntervalMs: 5000,
  enableAutoDetection: true,
  enableEvidenceLearning: true,
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

  // Phase 1 新增组件
  private bpaBuilder: BPABuilder;
  private synthesizer: StateVectorSynthesizer;
  private evidenceLearner: EvidenceLearner;

  // 运行时状态
  private isRunning: boolean = false;
  private startTime: number = 0;
  private featureCache: Map<string, FeatureVector> = new Map();
  private latestStateVectors: Map<string, UnifiedStateVector> = new Map();
  private latestSynthesizedVectors: Map<string, SynthesizedStateVector> = new Map();

  // 统计
  private stats = {
    totalSamplesIngested: 0,
    totalFeaturesExtracted: 0,
    totalStateVectorsEmitted: 0,
    totalFusionRuns: 0,
    fusionConflictSum: 0,
    uncertaintySum: 0,
    totalBpaBuilds: 0,
    totalSyntheses: 0,
    completenessSum: 0,
  };

  // 事件回调
  private onStateVectorEmit?: (vector: UnifiedStateVector) => void;
  private onAnomalyDetected?: (machineId: string, anomaly: Record<string, unknown>) => void;
  private onFusionComplete?: (machineId: string, result: EnhancedFusionResult) => void;

  constructor(config: Partial<PerceptionPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 原有组件
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

    // Phase 1 新增组件
    this.bpaBuilder = createBPABuilder(
      this.config.bpaConfig,
      this.config.bpaOptions,
    );

    this.synthesizer = new StateVectorSynthesizer(
      this.config.dimensionDefs,
      {
        windowSeconds: this.config.clickhouseWindowSeconds ?? 300,
        enableTracing: true,
      },
    );

    this.evidenceLearner = new EvidenceLearner();

    // 注册证据源到 EvidenceLearner
    if (this.config.enableEvidenceLearning) {
      for (const source of this.config.evidenceSources) {
        this.evidenceLearner.registerSource(source.name, {
          initialWeight: source.initialWeight,
          bayesianAdaptive: source.bayesianAdaptive,
        });
      }
    }

    log.info({
      hypotheses: this.config.fusionHypotheses,
      sourcesCount: this.config.evidenceSources.length,
      bpaConfigVersion: this.bpaBuilder.getConfigVersion(),
      dimensionCount: this.synthesizer.getDimensionNames().length,
    }, 'PerceptionPipeline initialized (Phase 1 enhanced)');
  }

  /**
   * 启动管线
   */
  start(): void {
    this.isRunning = true;
    this.startTime = Date.now();
    log.info('PerceptionPipeline started');
  }

  /**
   * 停止管线
   */
  stop(): void {
    this.isRunning = false;
    log.info('PerceptionPipeline stopped');
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

  // ==========================================================================
  // Phase 1 核心方法 — ClickHouse → 21D → BPA → DS Fusion
  // ==========================================================================

  /**
   * 从 ClickHouse 合成状态向量 + BPA 构建 + DS 融合（推荐新入口）
   *
   * 这是 Phase 1 的核心方法，替代原有的 processAndEmit()。
   * 完整链路：ClickHouse → 21D Vector → SensorStats → BPA → DS Fusion → StateVector
   */
  async synthesizeAndFuse(
    machineId: string,
    cumulativeData?: Record<string, number>,
  ): Promise<{
    stateVector: SynthesizedStateVector;
    sensorStats: SensorStats;
    bpaResults: Map<string, BasicProbabilityAssignment>;
    fusionResult: EnhancedFusionResult;
  } | null> {
    if (!this.isRunning) return null;

    // Step 1: 从 ClickHouse 合成 21D 状态向量
    const stateVector = await this.synthesizer.synthesize(machineId, cumulativeData);
    this.latestSynthesizedVectors.set(machineId, stateVector);
    this.stats.totalSyntheses++;
    this.stats.completenessSum += stateVector.quality.completeness;

    // Step 2: 转换为 SensorStats
    const sensorStats = this.synthesizer.toSensorStats(stateVector);

    // Step 3: BPA 构建（使用 BPABuilder，不再硬编码）
    const bpaResults = this.bpaBuilder.buildAll(sensorStats, machineId);
    this.stats.totalBpaBuilds++;

    if (bpaResults.size === 0) {
      log.warn({ machineId }, 'No BPA results, skipping fusion');
      return null;
    }

    // Step 4: DS 融合（使用增强版接口）
    const fusionResult = this.fusionEngine.fuseWithBPABuilder(bpaResults);
    this.stats.totalFusionRuns++;
    this.stats.fusionConflictSum += fusionResult.conflictFactor;

    // Step 5: 证据权重自学习反馈（如果启用）
    if (this.config.enableEvidenceLearning && fusionResult.cognitiveOutput) {
      for (const source of fusionResult.sources) {
        const success = fusionResult.confidence > 0.6;
        this.evidenceLearner.observe(source, success);
      }
    }

    // Step 6: 触发回调
    this.onFusionComplete?.(machineId, fusionResult);

    log.info({
      machineId,
      decision: fusionResult.decision,
      confidence: +fusionResult.confidence.toFixed(3),
      conflict: +fusionResult.conflictFactor.toFixed(3),
      method: fusionResult.method,
      completeness: +stateVector.quality.completeness.toFixed(2),
      sources: fusionResult.sources,
    }, 'Synthesize and fuse completed');

    return { stateVector, sensorStats, bpaResults, fusionResult };
  }

  // ==========================================================================
  // 原有接口（向后兼容，内部已改用 BPABuilder）
  // ==========================================================================

  /**
   * 执行融合 + 编码（汇聚层 + 平台层）
   *
   * 保持原有方法签名，内部已改用 BPABuilder 替代硬编码 buildEvidences()。
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

    // 构建 SensorStats（从特征向量 + 环境数据）
    const sensorStats: SensorStats = {
      vibrationRms: sensorFeatures['vibration']?.features.rms ?? sensorFeatures['ch_0']?.features.rms ?? 0,
      temperatureDev: (environmentalData['temperature_bearing'] ?? environmentalData['temperature'] ?? 25) - 25,
      currentPeak: sensorFeatures['motor_current']?.features.peak ?? sensorFeatures['ch_1']?.features.peak ?? 0,
      stressDelta: operationalData['stress_delta'] ?? 0,
      windSpeed60m: environmentalData['wind_speed'] ?? 0,
    };

    // BPA 构建（替代原硬编码 buildEvidences）
    const bpaResults = this.bpaBuilder.buildAll(sensorStats, machineId);
    this.stats.totalBpaBuilds++;

    // DS 融合
    let fusionResult;
    try {
      if (bpaResults.size > 0) {
        // 转换为感知层 BPA 格式（向后兼容）
        const evidences: BPA[] = [];
        const learnerWeights = this.config.enableEvidenceLearning
          ? this.evidenceLearner.getNormalizedWeights()
          : null;

        for (const [source, bpa] of bpaResults) {
          const sourceConfig = this.config.evidenceSources.find(s => s.name === source);
          const weight = learnerWeights?.get(source) ?? sourceConfig?.initialWeight ?? 0.2;
          const perceptionBPA = toPerceptionBPA(bpa, source, weight, 0.9);
          evidences.push(perceptionBPA);
        }

        fusionResult = this.fusionEngine.fuse(evidences, this.config.conflictThreshold);
        this.stats.totalFusionRuns++;
        this.stats.fusionConflictSum += fusionResult.conflictFactor;
      }
    } catch (e) {
      log.warn({ error: (e as Error).message }, 'Fusion failed');
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

  // ==========================================================================
  // 配置热更新
  // ==========================================================================

  /**
   * 热更新 BPA 配置（从 DB 加载后调用）
   */
  updateBpaConfig(config: BpaConfig, version?: string): void {
    this.bpaBuilder.updateConfig(config, version);
    log.info({ version }, 'BPA config hot-updated');
  }

  /**
   * 热更新维度定义（从 DB 加载后调用）
   */
  updateDimensionDefs(dimensions: DimensionDef[]): void {
    this.synthesizer.updateDimensions(dimensions);
    log.info({ count: dimensions.length }, 'Dimension definitions hot-updated');
  }

  // ==========================================================================
  // 查询接口
  // ==========================================================================

  /**
   * 获取设备最新状态向量
   */
  getLatestStateVector(machineId: string): UnifiedStateVector | undefined {
    return this.latestStateVectors.get(machineId);
  }

  /**
   * 获取设备最新合成向量（Phase 1 新增）
   */
  getLatestSynthesizedVector(machineId: string): SynthesizedStateVector | undefined {
    return this.latestSynthesizedVectors.get(machineId);
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
      bpaBuilderStats: {
        totalBuilds: this.stats.totalBpaBuilds,
        configVersion: this.bpaBuilder.getConfigVersion(),
        logBufferSize: this.bpaBuilder.getConstructionLogs().length,
      },
      synthesizerStats: {
        totalSyntheses: this.stats.totalSyntheses,
        avgCompleteness: this.stats.totalSyntheses > 0
          ? this.stats.completenessSum / this.stats.totalSyntheses
          : 0,
        logBufferSize: this.synthesizer.getRecentLogs().length,
      },
      evidenceLearnerStats: {
        registeredSources: this.evidenceLearner.getAllProfiles().length,
        degradedSources: this.evidenceLearner.getDegradedSources().length,
      },
    };
  }

  /**
   * 设置事件回调
   */
  setCallbacks(callbacks: {
    onStateVectorEmit?: (vector: UnifiedStateVector) => void;
    onAnomalyDetected?: (machineId: string, anomaly: Record<string, unknown>) => void;
    onFusionComplete?: (machineId: string, result: EnhancedFusionResult) => void;
  }): void {
    this.onStateVectorEmit = callbacks.onStateVectorEmit;
    this.onAnomalyDetected = callbacks.onAnomalyDetected;
    this.onFusionComplete = callbacks.onFusionComplete;
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
      // Phase 1 新增
      bpaBuilder: this.bpaBuilder,
      synthesizer: this.synthesizer,
      evidenceLearner: this.evidenceLearner,
    };
  }

  /**
   * 导出追溯日志（用于持久化到 DB）
   */
  exportTracingLogs() {
    return {
      bpaLogs: this.bpaBuilder.exportAndClearLogs(),
      synthesisLogs: this.synthesizer.exportAndClearLogs(),
      evidenceLearnerState: this.evidenceLearner.exportState(),
    };
  }
}
