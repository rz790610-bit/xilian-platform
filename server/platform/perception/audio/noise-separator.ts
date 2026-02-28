/**
 * ============================================================================
 * 声音背景噪声分离器 — 谱减法 + 工况门控
 * ============================================================================
 *
 * 核心能力：
 *   1. 谱减法 (Spectral Subtraction) 背景噪声估计与分离
 *   2. 工况门控 — 基于工况阶段自动调整噪声估计策略
 *   3. 与现有 acoustic.extractor.ts 对接，输出干净声学信号
 *   4. 噪声分离置信度评分
 *
 * 算法原理：
 *   谱减法基本公式：
 *     |S(f)|² = |X(f)|² - α|N(f)|²
 *   其中：
 *     X(f) = 含噪信号频谱
 *     N(f) = 噪声估计频谱（空载工况下采集）
 *     S(f) = 干净信号频谱
 *     α    = 过减因子 (oversubtraction factor, 通常 1.0-4.0)
 *
 *   增强：
 *     - 谱底 (spectral floor) 防止过减导致的"音乐噪声"
 *     - 工况门控：空载时更新噪声模型，负载时执行谱减
 *     - EWMA 在线噪声估计更新
 *
 * 数据流：
 *   RingBuffer → AdaptiveSampler → NoiseSeparator.process()
 *     → cleanSignal + noiseEstimate + confidence
 *       → acoustic.extractor.ts (用 cleanSignal 提取特征)
 *
 * 物理约束：
 *   - 港口环境基底噪声约 70-85 dB(A)
 *   - 设备异常声学特征通常在 2-20 kHz 范围
 *   - 谱减后信号能量不应超过原始信号（能量守恒）
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('noise-separator');

// ============================================================================
// 类型定义
// ============================================================================

/** 噪声分离器配置 */
export interface NoiseSeparatorConfig {
  /** FFT 窗口大小（必须是 2 的幂） */
  fftSize: number;
  /** 帧移（hop size），通常为 fftSize/4 */
  hopSize: number;
  /** 采样率 (Hz) */
  sampleRate: number;
  /** 过减因子 α (1.0=标准, >1.0=激进降噪, <1.0=保守) */
  oversubtractionFactor: number;
  /** 谱底因子 β (0.001-0.1)，防止过减产生音乐噪声 */
  spectralFloor: number;
  /** EWMA 噪声更新系数 (0-1, 越小越平滑) */
  noiseUpdateAlpha: number;
  /** 噪声估计初始化所需最少帧数 */
  noiseInitFrames: number;
  /** 工况门控：哪些工况阶段用于噪声估计 */
  noiseEstimationPhases: string[];
  /** 工况门控：哪些工况阶段执行谱减 */
  activePhases: string[];
  /** 频率范围限制 (Hz)：只对此范围内的频率执行谱减 */
  freqRangeLow: number;
  freqRangeHigh: number;
}

/** 噪声分离结果 */
export interface SeparationResult {
  /** 干净信号（时域波形） */
  cleanSignal: Float64Array;
  /** 噪声估计信号（时域波形） */
  noiseEstimate: Float64Array;
  /** 分离置信度 (0-1) */
  confidence: number;
  /** 信噪比估计 (dB) */
  estimatedSnr: number;
  /** 噪声功率谱密度 (用于诊断) */
  noisePsd: Float64Array;
  /** 统计信息 */
  stats: SeparationStats;
}

/** 分离统计 */
export interface SeparationStats {
  /** 处理的帧数 */
  framesProcessed: number;
  /** 噪声模型是否已初始化 */
  noiseModelReady: boolean;
  /** 噪声模型更新次数 */
  noiseUpdateCount: number;
  /** 原始信号 RMS */
  inputRms: number;
  /** 干净信号 RMS */
  outputRms: number;
  /** 噪声 RMS */
  noiseRms: number;
  /** 能量比（输出/输入，应 <= 1.0） */
  energyRatio: number;
  /** 当前工况阶段 */
  currentPhase: string;
  /** 处理耗时 (ms) */
  processingTimeMs: number;
}

/** 帧数据（内部使用） */
interface SpectralFrame {
  /** 幅度谱 */
  magnitude: Float64Array;
  /** 相位谱 */
  phase: Float64Array;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: NoiseSeparatorConfig = {
  fftSize: 2048,
  hopSize: 512,
  sampleRate: 44100,
  oversubtractionFactor: 2.0,
  spectralFloor: 0.01,
  noiseUpdateAlpha: 0.05,
  noiseInitFrames: 10,
  noiseEstimationPhases: ['idle', 'standby'],
  activePhases: ['hoisting', 'traversing', 'locking', 'traversing_end'],
  freqRangeLow: 500,
  freqRangeHigh: 20000,
};

// ============================================================================
// 噪声分离器
// ============================================================================

export class NoiseSeparator {
  private readonly config: NoiseSeparatorConfig;

  /** 噪声功率谱密度估计 (EWMA 平滑) */
  private noisePsd: Float64Array;
  /** 噪声模型已收集的帧数 */
  private noiseFrameCount = 0;
  /** 当前工况阶段 */
  private currentPhase = 'idle';
  /** 窗函数缓存 */
  private readonly window: Float64Array;
  /** 频率分辨率 */
  private readonly freqResolution: number;
  /** 频率范围对应的 bin 索引 */
  private readonly binLow: number;
  private readonly binHigh: number;

  constructor(config?: Partial<NoiseSeparatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const halfFft = this.config.fftSize / 2 + 1;
    this.noisePsd = new Float64Array(halfFft);
    this.window = this.hanningWindow(this.config.fftSize);
    this.freqResolution = this.config.sampleRate / this.config.fftSize;
    this.binLow = Math.max(1, Math.floor(this.config.freqRangeLow / this.freqResolution));
    this.binHigh = Math.min(halfFft - 1, Math.ceil(this.config.freqRangeHigh / this.freqResolution));

    log.info({
      fftSize: this.config.fftSize,
      sampleRate: this.config.sampleRate,
      alpha: this.config.oversubtractionFactor,
      freqRange: `${this.config.freqRangeLow}-${this.config.freqRangeHigh} Hz`,
      binRange: `${this.binLow}-${this.binHigh}`,
    }, '噪声分离器初始化');
  }

  // --------------------------------------------------------------------------
  // 主处理接口
  // --------------------------------------------------------------------------

  /**
   * 处理一段音频信号，执行噪声分离
   *
   * @param signal 输入信号（单通道时域波形）
   * @param phase  当前工况阶段（用于门控）
   * @returns 分离结果
   */
  process(signal: Float64Array | number[], phase?: string): SeparationResult {
    const startTime = Date.now();
    const input = signal instanceof Float64Array ? signal : Float64Array.from(signal);

    if (phase) this.currentPhase = phase;

    const isNoisePhase = this.config.noiseEstimationPhases.includes(this.currentPhase);
    const isActivePhase = this.config.activePhases.includes(this.currentPhase);

    // 分帧 + 加窗 + FFT
    const frames = this.analyzeFrames(input);

    if (isNoisePhase) {
      // 空载工况：更新噪声模型
      this.updateNoiseModel(frames);
    }

    let cleanSignal: Float64Array;
    let noiseEstimate: Float64Array;

    if (isActivePhase && this.isNoiseModelReady()) {
      // 负载工况 + 噪声模型就绪：执行谱减
      const result = this.spectralSubtraction(frames, input.length);
      cleanSignal = result.clean;
      noiseEstimate = result.noise;
    } else {
      // 噪声模型未就绪或非活跃工况：原样输出
      cleanSignal = new Float64Array(input);
      noiseEstimate = new Float64Array(input.length);
    }

    // 能量守恒检查：干净信号能量不应超过原始信号
    const inputEnergy = this.computeEnergy(input);
    const outputEnergy = this.computeEnergy(cleanSignal);
    if (outputEnergy > inputEnergy * 1.01) {
      // 违反物理约束，缩放回原始能量水平
      const scale = Math.sqrt(inputEnergy / Math.max(outputEnergy, 1e-10));
      for (let i = 0; i < cleanSignal.length; i++) {
        cleanSignal[i] *= scale;
      }
    }

    // 计算置信度
    const confidence = this.computeConfidence(input, cleanSignal);
    const estimatedSnr = this.estimateSnr(input, noiseEstimate);

    const inputRms = Math.sqrt(inputEnergy / Math.max(input.length, 1));
    const outputRms = Math.sqrt(this.computeEnergy(cleanSignal) / Math.max(cleanSignal.length, 1));
    const noiseRms = Math.sqrt(this.computeEnergy(noiseEstimate) / Math.max(noiseEstimate.length, 1));

    return {
      cleanSignal,
      noiseEstimate,
      confidence,
      estimatedSnr,
      noisePsd: new Float64Array(this.noisePsd),
      stats: {
        framesProcessed: frames.length,
        noiseModelReady: this.isNoiseModelReady(),
        noiseUpdateCount: this.noiseFrameCount,
        inputRms,
        outputRms,
        noiseRms,
        energyRatio: inputRms > 0 ? outputRms / inputRms : 0,
        currentPhase: this.currentPhase,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * 仅更新噪声模型（不执行谱减）
   *
   * 用于空载期间的持续噪声学习。
   */
  updateNoise(signal: Float64Array | number[]): void {
    const input = signal instanceof Float64Array ? signal : Float64Array.from(signal);
    const frames = this.analyzeFrames(input);
    this.updateNoiseModel(frames);
  }

  /** 重置噪声模型 */
  resetNoiseModel(): void {
    this.noisePsd.fill(0);
    this.noiseFrameCount = 0;
    log.info('噪声模型已重置');
  }

  /** 噪声模型是否就绪 */
  isNoiseModelReady(): boolean {
    return this.noiseFrameCount >= this.config.noiseInitFrames;
  }

  /** 设置工况阶段 */
  setPhase(phase: string): void {
    this.currentPhase = phase;
  }

  /** 获取当前配置 */
  getConfig(): Readonly<NoiseSeparatorConfig> {
    return this.config;
  }

  // --------------------------------------------------------------------------
  // 谱减法核心
  // --------------------------------------------------------------------------

  private spectralSubtraction(
    frames: SpectralFrame[],
    outputLength: number,
  ): { clean: Float64Array; noise: Float64Array } {
    const { fftSize, hopSize, oversubtractionFactor, spectralFloor } = this.config;
    const halfFft = fftSize / 2 + 1;

    const cleanAccum = new Float64Array(outputLength);
    const noiseAccum = new Float64Array(outputLength);
    const windowAccum = new Float64Array(outputLength);

    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f];
      const offset = f * hopSize;

      // 谱减：|S(f)|² = max(|X(f)|² - α|N(f)|², β|X(f)|²)
      const cleanMag = new Float64Array(halfFft);
      const noiseMag = new Float64Array(halfFft);

      for (let k = 0; k < halfFft; k++) {
        const xPow = frame.magnitude[k] * frame.magnitude[k];
        const nPow = this.noisePsd[k];

        if (k >= this.binLow && k <= this.binHigh) {
          // 在目标频率范围内执行谱减
          const subtracted = xPow - oversubtractionFactor * nPow;
          const floor = spectralFloor * xPow;
          const cleanPow = Math.max(subtracted, floor);
          cleanMag[k] = Math.sqrt(cleanPow);
          noiseMag[k] = Math.sqrt(Math.max(0, xPow - cleanPow));
        } else {
          // 目标范围外保留原始信号
          cleanMag[k] = frame.magnitude[k];
          noiseMag[k] = 0;
        }
      }

      // IFFT 重建时域信号（使用原始相位）
      const cleanTime = this.ifftMagnitudePhase(cleanMag, frame.phase, fftSize);
      const noiseTime = this.ifftMagnitudePhase(noiseMag, frame.phase, fftSize);

      // 重叠相加 (Overlap-Add)
      for (let i = 0; i < fftSize && offset + i < outputLength; i++) {
        cleanAccum[offset + i] += cleanTime[i] * this.window[i];
        noiseAccum[offset + i] += noiseTime[i] * this.window[i];
        windowAccum[offset + i] += this.window[i] * this.window[i];
      }
    }

    // 归一化（避免窗函数重叠导致的增益变化）
    for (let i = 0; i < outputLength; i++) {
      if (windowAccum[i] > 1e-8) {
        cleanAccum[i] /= windowAccum[i];
        noiseAccum[i] /= windowAccum[i];
      }
    }

    return { clean: cleanAccum, noise: noiseAccum };
  }

  // --------------------------------------------------------------------------
  // 噪声模型更新
  // --------------------------------------------------------------------------

  private updateNoiseModel(frames: SpectralFrame[]): void {
    const alpha = this.config.noiseUpdateAlpha;

    for (const frame of frames) {
      this.noiseFrameCount++;

      for (let k = 0; k < this.noisePsd.length; k++) {
        const power = frame.magnitude[k] * frame.magnitude[k];
        if (this.noiseFrameCount <= this.config.noiseInitFrames) {
          // 初始化阶段：累积平均
          this.noisePsd[k] += (power - this.noisePsd[k]) / this.noiseFrameCount;
        } else {
          // 稳态：EWMA 更新
          this.noisePsd[k] = (1 - alpha) * this.noisePsd[k] + alpha * power;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // DSP 工具
  // --------------------------------------------------------------------------

  private analyzeFrames(signal: Float64Array): SpectralFrame[] {
    const { fftSize, hopSize } = this.config;
    const frames: SpectralFrame[] = [];
    const halfFft = fftSize / 2 + 1;

    for (let offset = 0; offset + fftSize <= signal.length; offset += hopSize) {
      // 取帧并加窗
      const frame = new Float64Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        frame[i] = signal[offset + i] * this.window[i];
      }

      // FFT（实数 FFT，返回前 N/2+1 个频点）
      const { real, imag } = this.realFft(frame);

      const magnitude = new Float64Array(halfFft);
      const phase = new Float64Array(halfFft);
      for (let k = 0; k < halfFft; k++) {
        magnitude[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
        phase[k] = Math.atan2(imag[k], real[k]);
      }

      frames.push({ magnitude, phase });
    }

    return frames;
  }

  /** 实数 FFT（Cooley-Tukey 基2 DIT） */
  private realFft(x: Float64Array): { real: Float64Array; imag: Float64Array } {
    const N = x.length;
    const real = new Float64Array(N);
    const imag = new Float64Array(N);
    real.set(x);

    // 位反转
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    // 蝶形运算
    for (let len = 2; len <= N; len *= 2) {
      const half = len / 2;
      const angle = -2 * Math.PI / len;
      for (let i = 0; i < N; i += len) {
        for (let j = 0; j < half; j++) {
          const wR = Math.cos(angle * j);
          const wI = Math.sin(angle * j);
          const tR = real[i + j + half] * wR - imag[i + j + half] * wI;
          const tI = real[i + j + half] * wI + imag[i + j + half] * wR;
          real[i + j + half] = real[i + j] - tR;
          imag[i + j + half] = imag[i + j] - tI;
          real[i + j] += tR;
          imag[i + j] += tI;
        }
      }
    }

    // 返回前 N/2+1 个频点
    const halfN = N / 2 + 1;
    return {
      real: real.slice(0, halfN),
      imag: imag.slice(0, halfN),
    };
  }

  /** 从幅度谱和相位谱重建时域信号（IFFT） */
  private ifftMagnitudePhase(mag: Float64Array, phase: Float64Array, N: number): Float64Array {
    const real = new Float64Array(N);
    const imag = new Float64Array(N);

    // 恢复共轭对称频谱
    const halfN = N / 2 + 1;
    for (let k = 0; k < halfN; k++) {
      real[k] = mag[k] * Math.cos(phase[k]);
      imag[k] = mag[k] * Math.sin(phase[k]);
    }
    for (let k = halfN; k < N; k++) {
      real[k] = real[N - k];
      imag[k] = -imag[N - k];
    }

    // IFFT = 共轭 → FFT → 共轭 → /N
    for (let i = 0; i < N; i++) imag[i] = -imag[i];

    // FFT in-place
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let len = 2; len <= N; len *= 2) {
      const half = len / 2;
      const angle = -2 * Math.PI / len;
      for (let i = 0; i < N; i += len) {
        for (let j = 0; j < half; j++) {
          const wR = Math.cos(angle * j);
          const wI = Math.sin(angle * j);
          const tR = real[i + j + half] * wR - imag[i + j + half] * wI;
          const tI = real[i + j + half] * wI + imag[i + j + half] * wR;
          real[i + j + half] = real[i + j] - tR;
          imag[i + j + half] = imag[i + j] - tI;
          real[i + j] += tR;
          imag[i + j] += tI;
        }
      }
    }

    const output = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      output[i] = real[i] / N;
    }
    return output;
  }

  /** Hanning 窗 */
  private hanningWindow(size: number): Float64Array {
    const w = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return w;
  }

  private computeEnergy(signal: Float64Array): number {
    let sum = 0;
    for (let i = 0; i < signal.length; i++) {
      sum += signal[i] * signal[i];
    }
    return sum;
  }

  // --------------------------------------------------------------------------
  // 置信度和 SNR
  // --------------------------------------------------------------------------

  private computeConfidence(input: Float64Array, clean: Float64Array): number {
    if (!this.isNoiseModelReady()) return 0;

    const inputE = this.computeEnergy(input);
    const cleanE = this.computeEnergy(clean);
    if (inputE < 1e-10) return 0;

    // 置信度基于：
    //   1. 噪声模型成熟度 (已收集帧数 / 初始化帧数)
    //   2. 能量比合理性 (clean/input 在 0.1-0.95 范围)
    //   3. 输出信号不全为零
    const maturity = Math.min(1, this.noiseFrameCount / (this.config.noiseInitFrames * 5));
    const ratio = cleanE / inputE;
    const ratioScore = (ratio > 0.05 && ratio < 0.98) ? 1.0 : 0.5;
    const nonZero = cleanE > 1e-10 ? 1.0 : 0.0;

    return Math.min(1, maturity * ratioScore * nonZero);
  }

  private estimateSnr(input: Float64Array, noise: Float64Array): number {
    const signalE = this.computeEnergy(input);
    const noiseE = this.computeEnergy(noise);
    if (noiseE < 1e-10) return 60; // 极高 SNR
    return 10 * Math.log10(signalE / noiseE);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建港口环境噪声分离器
 *
 * 预配置：
 *   - 采样率 44100Hz
 *   - FFT 2048（~23ms 帧长，适合机械声学分析）
 *   - 过减因子 2.0（中等激进度）
 *   - 目标频率 500-20000Hz（覆盖轴承/齿轮/电机异常频段）
 *   - 空载/待机阶段更新噪声模型
 */
export function createPortNoiseSeparator(overrides?: Partial<NoiseSeparatorConfig>): NoiseSeparator {
  return new NoiseSeparator({
    fftSize: 2048,
    hopSize: 512,
    sampleRate: 44100,
    oversubtractionFactor: 2.0,
    spectralFloor: 0.01,
    noiseUpdateAlpha: 0.05,
    noiseInitFrames: 10,
    noiseEstimationPhases: ['idle', 'standby'],
    activePhases: ['hoisting', 'traversing', 'locking', 'traversing_end', 'emergency_brake'],
    freqRangeLow: 500,
    freqRangeHigh: 20000,
    ...overrides,
  });
}

/**
 * 创建高频声学分析噪声分离器
 *
 * 用于超声波泄漏检测等场景，采样率 96kHz。
 */
export function createUltrasonicSeparator(overrides?: Partial<NoiseSeparatorConfig>): NoiseSeparator {
  return new NoiseSeparator({
    fftSize: 4096,
    hopSize: 1024,
    sampleRate: 96000,
    oversubtractionFactor: 1.5,
    spectralFloor: 0.005,
    noiseUpdateAlpha: 0.03,
    noiseInitFrames: 20,
    noiseEstimationPhases: ['idle'],
    activePhases: ['hoisting', 'traversing', 'locking'],
    freqRangeLow: 20000,
    freqRangeHigh: 48000,
    ...overrides,
  });
}
