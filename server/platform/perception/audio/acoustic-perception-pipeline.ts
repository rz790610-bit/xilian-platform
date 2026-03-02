/**
 * ============================================================================
 * 声学感知管线 — NoiseSeparator → AcousticExtractor 端到端编排
 * ============================================================================
 *
 * 数据流：
 *   原始音频波形 (MQTT/Modbus 采集)
 *     → NoiseSeparator.process(signal, phase)
 *       → 干净信号 + 噪声估计 + SNR
 *         → AcousticExtractor.extract(cleanSignal)
 *           → 声学特征 (SPL, MFCC, 频谱...)
 *             → EventBus (acoustic.features.ready)
 *
 * 工况门控：
 *   - 空载/待机 → 更新噪声模型（不提取特征）
 *   - 起升/行走/锁定 → 谱减降噪 → 特征提取
 *   - 紧急制动 → 跳过降噪，直接提取（保留瞬态冲击信号）
 *
 * 物理约束：
 *   - 谱减后能量 <= 原始能量（NoiseSeparator 已保证）
 *   - SPL(A) 范围 40-140 dB（港口环境合理范围）
 *   - 特征提取失败 → 降级为仅输出 SNR + 分离置信度
 */

import { createModuleLogger } from '../../../core/logger';
import { NoiseSeparator, createPortNoiseSeparator, type NoiseSeparatorConfig, type SeparationResult } from './noise-separator';

const log = createModuleLogger('acoustic-perception-pipeline');

// ============================================================================
// 类型定义
// ============================================================================

/** 声学管线输入 */
export interface AcousticInput {
  /** 设备 ID */
  deviceId: string;
  /** 传感器 ID（麦克风/超声波） */
  sensorId: string;
  /** 原始音频波形（单通道） */
  waveform: Float64Array | number[];
  /** 采样率 (Hz) */
  sampleRate: number;
  /** 当前工况阶段 */
  phase: string;
  /** 时间戳 (Unix ms) */
  timestamp: number;
  /** 部件编码（4 段式） */
  componentCode?: string;
}

/** 声学管线输出 */
export interface AcousticPipelineResult {
  /** 设备 ID */
  deviceId: string;
  /** 传感器 ID */
  sensorId: string;
  /** 时间戳 */
  timestamp: number;
  /** 噪声分离结果 */
  separation: {
    snr: number;
    confidence: number;
    noiseModelReady: boolean;
    energyRatio: number;
    processingTimeMs: number;
  };
  /** 声学特征（AcousticExtractor 输出），降级时为 null */
  features: Record<string, number | string | boolean> | null;
  /** 工况阶段 */
  phase: string;
  /** 处理模式 */
  mode: 'noise_update' | 'full_extraction' | 'raw_extraction' | 'skipped';
  /** 总处理耗时 (ms) */
  totalDurationMs: number;
}

/** 管线配置 */
export interface AcousticPipelineConfig {
  /** NoiseSeparator 配置覆盖 */
  separatorOverrides?: Partial<NoiseSeparatorConfig>;
  /** 跳过降噪直接提取的工况阶段 */
  rawExtractionPhases: string[];
  /** 跳过处理的工况阶段 */
  skipPhases: string[];
  /** SPL(A) 合理范围 (dB) */
  splRange: { min: number; max: number };
  /** 最小波形长度（短于此值不处理） */
  minWaveformLength: number;
  /** 是否启用 */
  enabled: boolean;
}

/** 管线统计 */
export interface AcousticPipelineStats {
  totalInputs: number;
  noiseUpdates: number;
  fullExtractions: number;
  rawExtractions: number;
  skipped: number;
  extractionFailures: number;
  avgSeparationMs: number;
  avgExtractionMs: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: AcousticPipelineConfig = {
  rawExtractionPhases: ['emergency_brake'],
  skipPhases: ['maintenance', 'powered_off'],
  splRange: { min: 40, max: 140 },
  minWaveformLength: 512,
  enabled: true,
};

// ============================================================================
// 声学感知管线
// ============================================================================

export class AcousticPerceptionPipeline {
  private readonly config: AcousticPipelineConfig;
  private readonly separator: NoiseSeparator;

  /** ExtractorRegistry 动态加载（避免循环依赖） */
  private extractorRegistry: { process: (raw: import('../../../services/feature-extraction/types').RawTelemetryMessage) => Promise<{ features: Record<string, number | string | boolean> } | null> } | null = null;
  private extractorLoading: Promise<void> | null = null;

  private stats: AcousticPipelineStats = {
    totalInputs: 0,
    noiseUpdates: 0,
    fullExtractions: 0,
    rawExtractions: 0,
    skipped: 0,
    extractionFailures: 0,
    avgSeparationMs: 0,
    avgExtractionMs: 0,
  };
  private separationMsSum = 0;
  private extractionMsSum = 0;
  private extractionCount = 0;

  /** EventBus 回调 */
  private onFeaturesReady?: (result: AcousticPipelineResult) => void;

  constructor(config?: Partial<AcousticPipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.separator = createPortNoiseSeparator(this.config.separatorOverrides);

    log.info({
      rawPhases: this.config.rawExtractionPhases,
      skipPhases: this.config.skipPhases,
      splRange: this.config.splRange,
    }, '声学感知管线初始化');
  }

  // --------------------------------------------------------------------------
  // 主处理接口
  // --------------------------------------------------------------------------

  /**
   * 处理一段原始音频
   *
   * 根据工况阶段自动选择处理模式：
   *   - skipPhases → 跳过
   *   - 空载/待机 → 仅更新噪声模型
   *   - rawExtractionPhases → 跳过降噪，直接提取
   *   - 其他 → 降噪 + 提取
   */
  async process(input: AcousticInput): Promise<AcousticPipelineResult> {
    const startTime = Date.now();
    this.stats.totalInputs++;

    if (!this.config.enabled) {
      return this.buildResult(input, null, null, 'skipped', startTime);
    }

    // 波形长度检查
    const waveformLen = input.waveform instanceof Float64Array
      ? input.waveform.length
      : input.waveform.length;
    if (waveformLen < this.config.minWaveformLength) {
      this.stats.skipped++;
      return this.buildResult(input, null, null, 'skipped', startTime);
    }

    // 跳过的工况
    if (this.config.skipPhases.includes(input.phase)) {
      this.stats.skipped++;
      return this.buildResult(input, null, null, 'skipped', startTime);
    }

    // 空载/待机 → 仅更新噪声模型
    const isNoisePhase = this.separator.getConfig().noiseEstimationPhases.includes(input.phase);
    if (isNoisePhase) {
      const sepResult = this.separator.process(
        input.waveform instanceof Float64Array ? input.waveform : Float64Array.from(input.waveform),
        input.phase,
      );
      this.updateSeparationStats(sepResult.stats.processingTimeMs);
      this.stats.noiseUpdates++;
      return this.buildResult(input, sepResult, null, 'noise_update', startTime);
    }

    // 紧急制动等 → 跳过降噪，直接用原始信号提取
    if (this.config.rawExtractionPhases.includes(input.phase)) {
      const features = await this.extractFeatures(input.waveform, input.sampleRate);
      this.stats.rawExtractions++;
      return this.buildResult(input, null, features, 'raw_extraction', startTime);
    }

    // 正常工况 → 降噪 + 提取
    const sepResult = this.separator.process(
      input.waveform instanceof Float64Array ? input.waveform : Float64Array.from(input.waveform),
      input.phase,
    );
    this.updateSeparationStats(sepResult.stats.processingTimeMs);

    let features: Record<string, number | string | boolean> | null = null;
    if (sepResult.confidence > 0.1) {
      // 置信度足够 → 用干净信号提取
      features = await this.extractFeatures(sepResult.cleanSignal, input.sampleRate);
    } else {
      // 置信度太低（噪声模型不成熟）→ 用原始信号提取
      features = await this.extractFeatures(input.waveform, input.sampleRate);
    }

    this.stats.fullExtractions++;
    const result = this.buildResult(input, sepResult, features, 'full_extraction', startTime);

    // 回调通知
    this.onFeaturesReady?.(result);

    return result;
  }

  /**
   * 批量处理
   */
  async processBatch(inputs: AcousticInput[]): Promise<AcousticPipelineResult[]> {
    const results: AcousticPipelineResult[] = [];
    for (const input of inputs) {
      results.push(await this.process(input));
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // 特征提取（委托 AcousticExtractor）
  // --------------------------------------------------------------------------

  private async extractFeatures(
    waveform: Float64Array | number[],
    sampleRate: number,
  ): Promise<Record<string, number | string | boolean> | null> {
    const startTime = Date.now();

    try {
      // 懒加载 ExtractorRegistry
      await this.ensureExtractor();

      const arr = waveform instanceof Float64Array ? Array.from(waveform) : waveform;

      // 构造 RawTelemetryMessage 格式交给 ExtractorRegistry
      const raw = {
        device_code: 'acoustic-pipeline',
        mp_code: 'mic',
        gateway_id: 'perception',
        data_type: 'acoustic',
        waveform: arr,
        sample_rate: sampleRate,
        timestamp: Date.now(),
      };

      const result = await this.extractorRegistry!.process(raw as import('../../../services/feature-extraction/types').RawTelemetryMessage);

      const extractMs = Date.now() - startTime;
      this.updateExtractionStats(extractMs);

      if (!result) return null;

      // 物理约束验证：SPL(A) 范围
      const splDba = result.features.spl_dba as number | undefined;
      if (splDba !== undefined) {
        if (splDba < this.config.splRange.min || splDba > this.config.splRange.max) {
          log.warn({
            splDba,
            range: this.config.splRange,
          }, 'SPL(A) 超出合理范围，标记为 uncertain');
          result.features.spl_validity = 'uncertain';
        }
      }

      return result.features;
    } catch (err) {
      this.stats.extractionFailures++;
      log.warn({ err }, '声学特征提取失败，降级');
      return null;
    }
  }

  private async ensureExtractor(): Promise<void> {
    if (this.extractorRegistry) return;
    if (this.extractorLoading) {
      await this.extractorLoading;
      return;
    }
    this.extractorLoading = (async () => {
      const mod = await import('../../../services/feature-extraction/extractor-registry');
      this.extractorRegistry = mod.extractorRegistry;
    })();
    await this.extractorLoading;
  }

  // --------------------------------------------------------------------------
  // 结果构建
  // --------------------------------------------------------------------------

  private buildResult(
    input: AcousticInput,
    separation: SeparationResult | null,
    features: Record<string, number | string | boolean> | null,
    mode: AcousticPipelineResult['mode'],
    startTime: number,
  ): AcousticPipelineResult {
    return {
      deviceId: input.deviceId,
      sensorId: input.sensorId,
      timestamp: input.timestamp,
      separation: separation ? {
        snr: separation.estimatedSnr,
        confidence: separation.confidence,
        noiseModelReady: separation.stats.noiseModelReady,
        energyRatio: separation.stats.energyRatio,
        processingTimeMs: separation.stats.processingTimeMs,
      } : {
        snr: 0,
        confidence: 0,
        noiseModelReady: this.separator.isNoiseModelReady(),
        energyRatio: 1,
        processingTimeMs: 0,
      },
      features,
      phase: input.phase,
      mode,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // --------------------------------------------------------------------------
  // 统计
  // --------------------------------------------------------------------------

  private updateSeparationStats(ms: number): void {
    this.separationMsSum += ms;
    const total = this.stats.noiseUpdates + this.stats.fullExtractions + 1;
    this.stats.avgSeparationMs = this.separationMsSum / total;
  }

  private updateExtractionStats(ms: number): void {
    this.extractionMsSum += ms;
    this.extractionCount++;
    this.stats.avgExtractionMs = this.extractionMsSum / this.extractionCount;
  }

  /** 获取统计信息 */
  getStats(): AcousticPipelineStats {
    return { ...this.stats };
  }

  /** 获取噪声分离器引用 */
  getSeparator(): NoiseSeparator {
    return this.separator;
  }

  /** 设置回调 */
  setOnFeaturesReady(callback: (result: AcousticPipelineResult) => void): void {
    this.onFeaturesReady = callback;
  }

  /** 重置噪声模型 */
  resetNoiseModel(): void {
    this.separator.resetNoiseModel();
  }

  /** 获取当前配置 */
  getConfig(): Readonly<AcousticPipelineConfig> {
    return this.config;
  }
}

// ============================================================================
// 单例 + 工厂函数
// ============================================================================

let _instance: AcousticPerceptionPipeline | null = null;

/** 获取全局声学感知管线单例 */
export function getAcousticPipeline(config?: Partial<AcousticPipelineConfig>): AcousticPerceptionPipeline {
  if (!_instance) {
    _instance = new AcousticPerceptionPipeline(config);
  }
  return _instance;
}

/** 重置单例（用于测试） */
export function resetAcousticPipeline(): void {
  _instance = null;
}
