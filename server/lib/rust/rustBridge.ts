import type { AnomalyResult, AggregateResult, WindowConfig } from "../../core/types/domain";

/**
 * Rust 模块桥接层
 * PortAI Nexus - TypeScript 与 Rust 高性能模块的桥接
 * 
 * 本模块提供 TypeScript 接口来调用 Rust 编写的高性能计算模块。
 * 在 Rust 模块编译为 WASM 或 Node.js 原生模块后，可以通过此接口调用。
 * 
 * 当前实现为纯 TypeScript 模拟，用于开发和测试阶段。
 * 生产环境应替换为实际的 Rust 模块调用。
 */

// ============================================
// 类型定义
// ============================================

/**
 * 滤波器类型
 */
export type FilterType =
  | { type: 'lowPass'; cutoff: number }
  | { type: 'highPass'; cutoff: number }
  | { type: 'bandPass'; low: number; high: number }
  | { type: 'bandStop'; low: number; high: number }
  | { type: 'movingAverage'; windowSize: number }
  | { type: 'exponentialMovingAverage'; alpha: number }
  | { type: 'median'; windowSize: number };

/**
 * 窗函数类型
 */
export type WindowType =
  | 'rectangular'
  | 'hanning'
  | 'hamming'
  | 'blackman'
  | { type: 'kaiser'; beta: number }
  | { type: 'gaussian'; sigma: number };

/**
 * 统计结果
 */
export interface StatisticsResult {
  count: number;
  mean: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  range: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  kurtosis: number;
  rms: number;
  peakToPeak: number;
  crestFactor: number;
}

/**
 * FFT 结果
 */
export interface FftResult {
  frequencies: number[];
  magnitudes: number[];
  phases: number[];
  powerSpectrum: number[];
  dominantFrequency: number;
  totalPower: number;
}

/**
 * 异常检测结果
 */
/**
 * 时域特征
 */
export interface TimeDomainFeatures {
  mean: number;
  stdDev: number;
  rms: number;
  peak: number;
  peakToPeak: number;
  crestFactor: number;
  shapeFactor: number;
  impulseFactor: number;
  clearanceFactor: number;
  zeroCrossings: number;
}

/**
 * 频域特征
 */
export interface FrequencyDomainFeatures {
  dominantFrequency: number;
  spectralCentroid: number;
  spectralBandwidth: number;
  spectralRolloff: number;
  spectralFlatness: number;
  spectralEntropy: number;
  bandPowers: number[];
}

/**
 * 特征集
 */
export interface FeatureSet {
  timeDomain: TimeDomainFeatures;
  frequencyDomain: FrequencyDomainFeatures;
}

/**
 * 聚合结果
 */
/**
 * 窗口配置
 */
// ============================================
// 信号处理器（TypeScript 模拟实现）
// ============================================

/**
 * 信号处理器
 * 模拟 Rust 信号处理模块的功能
 */
export class SignalProcessor {
  private sampleRate: number;
  private fftSize: number;

  constructor(sampleRate: number) {
    if (sampleRate <= 0) {
      throw new Error(`Invalid sample rate: ${sampleRate}`);
    }
    this.sampleRate = sampleRate;
    this.fftSize = 1024;
  }

  /**
   * 设置 FFT 大小
   */
  setFftSize(size: number): this {
    this.fftSize = Math.pow(2, Math.ceil(Math.log2(size)));
    return this;
  }

  /**
   * 应用滤波器
   */
  applyFilter(signal: number[], filterType: FilterType): number[] {
    switch (filterType.type) {
      case 'movingAverage':
        return this.movingAverage(signal, filterType.windowSize);
      case 'exponentialMovingAverage':
        return this.exponentialMovingAverage(signal, filterType.alpha);
      case 'median':
        return this.medianFilter(signal, filterType.windowSize);
      case 'lowPass':
        return this.butterworthLowpass(signal, filterType.cutoff, 4);
      case 'highPass':
        return this.butterworthHighpass(signal, filterType.cutoff, 4);
      case 'bandPass':
        return this.butterworthBandpass(signal, filterType.low, filterType.high, 4);
      case 'bandStop':
        return this.butterworthBandstop(signal, filterType.low, filterType.high, 4);
      default:
        return signal;
    }
  }

  /**
   * 移动平均滤波
   */
  private movingAverage(signal: number[], windowSize: number): number[] {
    if (signal.length < windowSize) {
      throw new Error(`Signal length ${signal.length} is less than window size ${windowSize}`);
    }

    const result: number[] = [];
    let sum = signal.slice(0, windowSize).reduce((a, b) => a + b, 0);

    for (let i = 0; i < signal.length; i++) {
      if (i >= windowSize) {
        sum -= signal[i - windowSize];
        sum += signal[i];
      }
      result.push(sum / windowSize);
    }

    return result;
  }

  /**
   * 指数移动平均滤波
   */
  private exponentialMovingAverage(signal: number[], alpha: number): number[] {
    if (alpha <= 0 || alpha > 1) {
      throw new Error(`Alpha must be in (0, 1], got ${alpha}`);
    }

    const result: number[] = [];
    let ema = signal[0];

    for (const value of signal) {
      ema = alpha * value + (1 - alpha) * ema;
      result.push(ema);
    }

    return result;
  }

  /**
   * 中值滤波
   */
  private medianFilter(signal: number[], windowSize: number): number[] {
    const halfWindow = Math.floor(windowSize / 2);
    const result: number[] = [];

    for (let i = 0; i < signal.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(signal.length, i + halfWindow + 1);
      const window = signal.slice(start, end).sort((a, b) => a - b);
      result.push(window[Math.floor(window.length / 2)]);
    }

    return result;
  }

  /**
   * Butterworth 低通滤波器
   */
  private butterworthLowpass(signal: number[], cutoff: number, order: number): number[] {
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / this.sampleRate;
    const alpha = dt / (rc + dt);

    let result = [...signal];

    for (let o = 0; o < order; o++) {
      for (let i = 1; i < result.length; i++) {
        result[i] = alpha * signal[i] + (1 - alpha) * result[i - 1];
      }
    }

    return result;
  }

  /**
   * Butterworth 高通滤波器
   */
  private butterworthHighpass(signal: number[], cutoff: number, order: number): number[] {
    const lowpass = this.butterworthLowpass(signal, cutoff, order);
    return signal.map((s, i) => s - lowpass[i]);
  }

  /**
   * Butterworth 带通滤波器
   */
  private butterworthBandpass(signal: number[], low: number, high: number, order: number): number[] {
    const highpassed = this.butterworthHighpass(signal, low, order);
    return this.butterworthLowpass(highpassed, high, order);
  }

  /**
   * Butterworth 带阻滤波器
   */
  private butterworthBandstop(signal: number[], low: number, high: number, order: number): number[] {
    const lowpassed = this.butterworthLowpass(signal, low, order);
    const highpassed = this.butterworthHighpass(signal, high, order);
    return lowpassed.map((l, i) => l + highpassed[i]);
  }

  /**
   * 计算统计指标
   */
  calculateStatistics(signal: number[]): StatisticsResult {
    if (signal.length === 0) {
      throw new Error('Signal cannot be empty');
    }

    const n = signal.length;
    const mean = signal.reduce((a, b) => a + b, 0) / n;
    const variance = signal.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const sorted = [...signal].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[n - 1];
    const range = max - min;

    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const q1 = sorted[Math.floor(n / 4)];
    const q3 = sorted[Math.floor(3 * n / 4)];
    const iqr = q3 - q1;

    const skewness = signal.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 3), 0) / n;
    const kurtosis = signal.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 4), 0) / n - 3;

    const rms = Math.sqrt(signal.reduce((sum, x) => sum + x * x, 0) / n);
    const peakToPeak = max - min;
    const crestFactor = rms > 0 ? Math.max(Math.abs(max), Math.abs(min)) / rms : 0;

    return {
      count: n,
      mean,
      variance,
      stdDev,
      min,
      max,
      range,
      median,
      q1,
      q3,
      iqr,
      skewness,
      kurtosis,
      rms,
      peakToPeak,
      crestFactor,
    };
  }

  /**
   * FFT 分析（简化实现）
   */
  fftAnalysis(signal: number[]): FftResult {
    const n = Math.pow(2, Math.ceil(Math.log2(signal.length)));
    const paddedSignal = [...signal, ...new Array(n - signal.length).fill(0)];

    // 简化的 DFT 实现（生产环境应使用 FFT 库）
    const frequencies: number[] = [];
    const magnitudes: number[] = [];
    const phases: number[] = [];
    const powerSpectrum: number[] = [];

    const freqResolution = this.sampleRate / n;
    const halfN = Math.floor(n / 2);

    let maxMagnitude = 0;
    let dominantFrequency = 0;
    let totalPower = 0;

    for (let k = 0; k < halfN; k++) {
      let real = 0;
      let imag = 0;

      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        real += paddedSignal[t] * Math.cos(angle);
        imag -= paddedSignal[t] * Math.sin(angle);
      }

      const freq = k * freqResolution;
      const magnitude = (Math.sqrt(real * real + imag * imag) * 2) / n;
      const phase = Math.atan2(imag, real);
      const power = magnitude * magnitude;

      frequencies.push(freq);
      magnitudes.push(magnitude);
      phases.push(phase);
      powerSpectrum.push(power);

      totalPower += power;

      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
        dominantFrequency = freq;
      }
    }

    return {
      frequencies,
      magnitudes,
      phases,
      powerSpectrum,
      dominantFrequency,
      totalPower,
    };
  }

  /**
   * Z-Score 异常检测
   */
  detectAnomalyZScore(value: number, history: number[], threshold: number = 3): AnomalyResult {
    const stats = this.calculateStatistics(history);
    const zScore = stats.stdDev > 0 ? Math.abs(value - stats.mean) / stats.stdDev : 0;

    return {
      isAnomaly: zScore > threshold,
      score: zScore,
      threshold,
      algorithm: 'Z-Score',
      details: `mean=${stats.mean.toFixed(4)}, std=${stats.stdDev.toFixed(4)}`,
    };
  }

  /**
   * IQR 异常检测
   */
  detectAnomalyIQR(value: number, history: number[], k: number = 1.5): AnomalyResult {
    const stats = this.calculateStatistics(history);
    const lowerBound = stats.q1 - k * stats.iqr;
    const upperBound = stats.q3 + k * stats.iqr;
    const isAnomaly = value < lowerBound || value > upperBound;

    const score = stats.iqr > 0
      ? (value < stats.median
        ? (stats.q1 - value) / stats.iqr
        : (value - stats.q3) / stats.iqr)
      : 0;

    return {
      isAnomaly,
      score: Math.max(0, score),
      threshold: k,
      algorithm: 'IQR',
      details: `bounds=[${lowerBound.toFixed(4)}, ${upperBound.toFixed(4)}]`,
    };
  }

  /**
   * 提取特征
   */
  extractFeatures(signal: number[]): FeatureSet {
    const stats = this.calculateStatistics(signal);
    const fft = this.fftAnalysis(signal);

    // 时域特征
    const zeroCrossings = signal.slice(1).filter((v, i) =>
      (signal[i] >= 0 && v < 0) || (signal[i] < 0 && v >= 0)
    ).length;

    const absMean = signal.reduce((sum, x) => sum + Math.abs(x), 0) / signal.length;
    const shapeFactor = absMean > 0 ? stats.rms / absMean : 0;
    const impulseFactor = absMean > 0 ? Math.max(Math.abs(stats.max), Math.abs(stats.min)) / absMean : 0;

    const sqrtMean = Math.pow(
      signal.reduce((sum, x) => sum + Math.sqrt(Math.abs(x)), 0) / signal.length,
      2
    );
    const clearanceFactor = sqrtMean > 0 ? Math.max(Math.abs(stats.max), Math.abs(stats.min)) / sqrtMean : 0;

    const timeDomain: TimeDomainFeatures = {
      mean: stats.mean,
      stdDev: stats.stdDev,
      rms: stats.rms,
      peak: Math.max(Math.abs(stats.max), Math.abs(stats.min)),
      peakToPeak: stats.peakToPeak,
      crestFactor: stats.crestFactor,
      shapeFactor,
      impulseFactor,
      clearanceFactor,
      zeroCrossings,
    };

    // 频域特征
    const totalMag = fft.magnitudes.reduce((a, b) => a + b, 0);
    const spectralCentroid = fft.frequencies.reduce((sum, f, i) =>
      sum + f * fft.magnitudes[i], 0) / Math.max(totalMag, 1e-10);

    const spectralBandwidth = Math.sqrt(
      fft.frequencies.reduce((sum, f, i) =>
        sum + Math.pow(f - spectralCentroid, 2) * fft.magnitudes[i], 0) / Math.max(totalMag, 1e-10)
    );

    // 频谱滚降点（95% 能量）
    const totalEnergy = fft.powerSpectrum.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    let spectralRolloff = 0;
    for (let i = 0; i < fft.powerSpectrum.length; i++) {
      cumulative += fft.powerSpectrum[i];
      if (cumulative >= 0.95 * totalEnergy) {
        spectralRolloff = fft.frequencies[i];
        break;
      }
    }

    // 频谱平坦度
    const geometricMean = Math.exp(
      fft.magnitudes.reduce((sum, m) => sum + Math.log(Math.max(m, 1e-10)), 0) / fft.magnitudes.length
    );
    const arithmeticMean = totalMag / fft.magnitudes.length;
    const spectralFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;

    // 频谱熵
    const spectralEntropy = totalMag > 0
      ? -fft.magnitudes.reduce((sum, m) => {
          const p = m / totalMag;
          return sum + (p > 0 ? p * Math.log(p) : 0);
        }, 0)
      : 0;

    // 频带能量
    const numBands = 8;
    const bandSize = Math.floor(fft.powerSpectrum.length / numBands);
    const bandPowers: number[] = [];
    for (let i = 0; i < numBands; i++) {
      const start = i * bandSize;
      const end = Math.min((i + 1) * bandSize, fft.powerSpectrum.length);
      bandPowers.push(fft.powerSpectrum.slice(start, end).reduce((a, b) => a + b, 0));
    }

    const frequencyDomain: FrequencyDomainFeatures = {
      dominantFrequency: fft.dominantFrequency,
      spectralCentroid,
      spectralBandwidth,
      spectralRolloff,
      spectralFlatness,
      spectralEntropy,
      bandPowers,
    };

    return {
      timeDomain,
      frequencyDomain,
    };
  }
}

// ============================================
// 数据聚合器（TypeScript 模拟实现）
// ============================================

/**
 * Welford 在线算法累加器
 */
class WelfordAccumulator {
  private _count = 0;
  private _mean = 0;
  private _m2 = 0;
  private _min = Infinity;
  private _max = -Infinity;
  private _sum = 0;
  private _first?: number;
  private _last?: number;

  add(value: number): void {
    this._count++;
    const delta = value - this._mean;
    this._mean += delta / this._count;
    const delta2 = value - this._mean;
    this._m2 += delta * delta2;

    this._sum += value;
    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);

    if (this._first === undefined) {
      this._first = value;
    }
    this._last = value;
  }

  remove(value: number): void {
    if (this._count === 0) return;

    this._count--;
    this._sum -= value;

    if (this._count === 0) {
      this._mean = 0;
      this._m2 = 0;
      this._min = Infinity;
      this._max = -Infinity;
    } else {
      const delta = value - this._mean;
      this._mean -= delta / this._count;
      const delta2 = value - this._mean;
      this._m2 -= delta * delta2;
    }
  }

  get count(): number { return this._count; }
  get mean(): number { return this._mean; }
  get variance(): number { return this._count > 1 ? this._m2 / (this._count - 1) : 0; }
  get stdDev(): number { return Math.sqrt(this.variance); }
  get min(): number { return this._min === Infinity ? 0 : this._min; }
  get max(): number { return this._max === -Infinity ? 0 : this._max; }
  get sum(): number { return this._sum; }
  get first(): number | undefined { return this._first; }
  get last(): number | undefined { return this._last; }

  getResult(): AggregateResult {
    return {
      windowStart: 0,
      windowEnd: 0,
      count: this._count,
      sum: this._sum,
      mean: this._mean,
      min: this.min,
      max: this.max,
      variance: this.variance,
      stdDev: this.stdDev,
      first: this._first,
      last: this._last,
      percentiles: {},
    };
  }
}

/**
 * 时间窗口聚合器
 */
export class TimeWindowAggregator {
  private config: WindowConfig;
  private windows: Map<number, { accumulator: WelfordAccumulator; values: Array<[number, number]> }> = new Map();
  private currentWindowStart = 0;

  constructor(config: WindowConfig) {
    this.config = config;
  }

  addValue(timestamp: number, value: number): void {
    const windowStart = this.getWindowStart(timestamp);

    if (this.currentWindowStart === 0) {
      this.currentWindowStart = windowStart;
    }

    if (!this.windows.has(windowStart)) {
      this.windows.set(windowStart, {
        accumulator: new WelfordAccumulator(),
        values: [],
      });
    }

    const window = this.windows.get(windowStart)!;
    window.accumulator.add(value);
    window.values.push([timestamp, value]);

    this.cleanupOldWindows(timestamp);
  }

  private getWindowStart(timestamp: number): number {
    switch (this.config.windowType) {
      case 'tumbling':
        return Math.floor(timestamp / this.config.windowSizeMs!) * this.config.windowSizeMs!;
      case 'sliding':
        const slide = this.config.slideSizeMs || this.config.windowSizeMs!;
        return Math.floor(timestamp / slide!) * slide!;
      case 'session':
        return this.currentWindowStart;
      default:
        return timestamp;
    }
  }

  private cleanupOldWindows(currentTime: number): void {
    const maxAge = this.config.windowSizeMs! * (this.config.maxWindowCount || 1000);
    const cutoff = currentTime - maxAge;

    const keysToDelete: number[] = [];
    this.windows.forEach((_, start) => {
      if (start < cutoff) {
        keysToDelete.push(start);
      }
    });
    keysToDelete.forEach(key => this.windows.delete(key));
  }

  getCurrentAggregate(): AggregateResult | null {
    const entries = Array.from(this.windows.entries());
    if (entries.length === 0) return null;

    const [start, window] = entries[entries.length - 1];
    const result = window.accumulator.getResult();
    result.windowStart = start;
    result.windowEnd = start + this.config.windowSizeMs!;
    return result;
  }

  getAllAggregates(): AggregateResult[] {
    const entries = Array.from(this.windows.entries());
    return entries.map(([start, window]) => {
      const result = window.accumulator.getResult();
      result.windowStart = start;
      result.windowEnd = start + this.config.windowSizeMs!;
      return result;
    });
  }

  reset(): void {
    this.windows.clear();
    this.currentWindowStart = 0;
  }
}

/**
 * 流式聚合器
 */
export class StreamAggregator {
  private windowSizeMs: number;
  private slideSizeMs: number;
  private buffer: Array<[number, number]> = [];
  private accumulator = new WelfordAccumulator();
  private lastEmitTime = 0;

  constructor(windowSizeMs: number, slideSizeMs: number) {
    this.windowSizeMs = windowSizeMs;
    this.slideSizeMs = slideSizeMs;
  }

  process(timestamp: number, value: number): AggregateResult | null {
    this.buffer.push([timestamp, value]);
    this.accumulator.add(value);

    // 移除过期数据
    const cutoff = timestamp - this.windowSizeMs;
    while (this.buffer.length > 0 && this.buffer[0][0] < cutoff) {
      const [, val] = this.buffer.shift()!;
      this.accumulator.remove(val);
    }

    // 检查是否需要发射结果
    if (this.lastEmitTime === 0) {
      this.lastEmitTime = timestamp;
    }

    if (timestamp - this.lastEmitTime >= this.slideSizeMs) {
      this.lastEmitTime = timestamp;
      const result = this.accumulator.getResult();
      result.windowStart = cutoff;
      result.windowEnd = timestamp;
      return result;
    }

    return null;
  }

  flush(): AggregateResult {
    const result = this.accumulator.getResult();
    this.buffer = [];
    this.accumulator = new WelfordAccumulator();
    return result;
  }

  get bufferSize(): number {
    return this.buffer.length;
  }
}

// ============================================
// 导出
// ============================================

export default {
  SignalProcessor,
  TimeWindowAggregator,
  StreamAggregator,
};
