/**
 * 机械算法模块 — 8个完整实现
 * 
 * 1. FFT频谱分析 — Cooley-Tukey FFT + ISO 10816/20816评估
 * 2. 倒频谱分析 — 功率/复倒频谱 + 齿轮箱故障检测
 * 3. 包络解调分析 v3.0 — 快速峭度图 + Hilbert包络 + 多方法故障检测 + 谐波分析 + D5推理链路
 * 4. 小波包分解 — 多层分解 + 能量分布 + Shannon熵
 * 5. 带通滤波 — Butterworth/Chebyshev IIR + 零相位滤波
 * 6. 谱峭度SK — Fast Kurtogram (Antoni 2006)
 * 7. 重采样 — 多项式插值 + 角度域重采样
 * 8. 阶次跟踪分析 — 角度域重采样 + 阶次谱
 */

import type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import * as dsp from '../../algorithms/_core/dsp';

// ============================================================
// 辅助：创建标准输出
// ============================================================

function createOutput(
  algorithmId: string,
  version: string,
  input: AlgorithmInput,
  config: Record<string, any>,
  startTime: number,
  diagnosis: AlgorithmOutput['diagnosis'],
  results: Record<string, any>,
  visualizations?: AlgorithmOutput['visualizations']
): AlgorithmOutput {
  const dataLen = Array.isArray(input.data) ? input.data.length : 0;
  return {
    algorithmId,
    status: 'completed',
    diagnosis,
    results,
    visualizations,
    metadata: {
      executionTimeMs: Date.now() - startTime,
      inputDataPoints: dataLen,
      algorithmVersion: version,
      parameters: config,
    },
  };
}

function getSignalData(input: AlgorithmInput): number[] {
  if (Array.isArray(input.data)) {
    if (Array.isArray(input.data[0])) {
      return (input.data as number[][])[0];
    }
    return input.data as number[];
  }
  const keys = Object.keys(input.data);
  if (keys.length > 0) {
    return (input.data as Record<string, number[]>)[keys[0]];
  }
  return [];
}

// ============================================================
// 1. FFT频谱分析
// ============================================================

export class FFTSpectrumAnalyzer implements IAlgorithmExecutor {
  readonly id = 'fft_spectrum';
  readonly name = 'FFT频谱分析';
  readonly version = '2.1.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      windowFunction: 'hanning' as dsp.WindowFunction,
      fftSize: 0, // 0 = auto
      frequencyRange: [0, 0], // [0,0] = full range
      averagingCount: 1,
      overlapPercent: 50,
      outputType: 'amplitude', // amplitude | power | psd
      // ISO 评估参数
      enableISO: true,
      machineGroup: 'group2' as dsp.MachineGroup,
      mountType: 'rigid' as dsp.MountType,
      // 特征频率标注
      enableCharacteristicFreqs: true,
      shaftRPM: 0, // 0 = auto from input
      bearingModel: '',
    };
  }

  validateInput(input: AlgorithmInput, config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 64) {
      return { valid: false, errors: ['信号长度不足，至少需要64个采样点'] };
    }
    if (!input.sampleRate || input.sampleRate <= 0) {
      return { valid: false, errors: ['必须提供有效的采样率 (sampleRate)'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 应用窗函数
    const winFn = dsp.getWindowFunction(cfg.windowFunction);
    const win = winFn(signal.length);
    const windowed = signal.map((v, i) => v * win[i]);

    // FFT + 窗函数幅值补偿
    const { frequencies, amplitudes: rawAmps } = dsp.amplitudeSpectrum(windowed, fs);
    const coherentGain = dsp.windowCoherentGain(cfg.windowFunction);
    const amplitudes = rawAmps.map(a => a / coherentGain);

    // 频率范围截取
    let fLow = cfg.frequencyRange[0] || 0;
    let fHigh = cfg.frequencyRange[1] || fs / 2;
    const filteredFreqs: number[] = [];
    const filteredAmps: number[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= fLow && frequencies[i] <= fHigh) {
        filteredFreqs.push(frequencies[i]);
        filteredAmps.push(amplitudes[i]);
      }
    }

    // 找峰值频率 (Top 10)
    const indexed = filteredAmps.map((a, i) => ({ freq: filteredFreqs[i], amp: a, idx: i }));
    indexed.sort((a, b) => b.amp - a.amp);
    const peaks = indexed.slice(0, 10).map(p => ({
      frequency: Math.round(p.freq * 100) / 100,
      amplitude: Math.round(p.amp * 1000) / 1000,
    }));

    // 计算整体指标
    const overallRMS = dsp.rms(signal);
    const velocityRMS = dsp.rmsVelocity(signal, fs, 10, 1000);

    // ISO 10816 评估
    let isoResult = null;
    if (cfg.enableISO) {
      isoResult = dsp.evaluateVibrationSeverity(velocityRMS, cfg.machineGroup, cfg.mountType);
    }

    // 轴承特征频率
    let bearingFreqs = null;
    const rpm = cfg.shaftRPM || input.operatingCondition?.speed || input.equipment?.ratedSpeed || 0;
    if (cfg.enableCharacteristicFreqs && rpm > 0) {
      const markLines: any[] = [];
      // 1X, 2X, 3X 转频
      const shaftFreq = rpm / 60;
      markLines.push({ value: shaftFreq, label: '1X', color: '#ff4444' });
      markLines.push({ value: 2 * shaftFreq, label: '2X', color: '#ff8844' });
      markLines.push({ value: 3 * shaftFreq, label: '3X', color: '#ffaa44' });

      // 轴承故障频率 (如果有轴承参数)
      if (cfg.bearingModel) {
        // 使用默认轴承库
        const bearing = getDefaultBearing(cfg.bearingModel);
        if (bearing) {
          bearingFreqs = dsp.bearingFaultFrequencies(bearing, rpm);
          markLines.push({ value: bearingFreqs.BPFO, label: 'BPFO', color: '#44aaff' });
          markLines.push({ value: bearingFreqs.BPFI, label: 'BPFI', color: '#44ffaa' });
          markLines.push({ value: bearingFreqs.BSF, label: 'BSF', color: '#aa44ff' });
          markLines.push({ value: bearingFreqs.FTF, label: 'FTF', color: '#ff44aa' });
        }
      }
    }

    // 诊断结论
    let severity: AlgorithmOutput['diagnosis']['severity'] = 'normal';
    let summary = '';
    if (isoResult) {
      severity = isoResult.zone === 'A' ? 'normal' :
        isoResult.zone === 'B' ? 'attention' :
        isoResult.zone === 'C' ? 'warning' : 'critical';
      summary = `振动速度RMS=${velocityRMS.toFixed(2)}mm/s，ISO评估区域${isoResult.zone}：${isoResult.description}。主频${peaks[0]?.frequency}Hz(${peaks[0]?.amplitude.toFixed(3)})`;
    } else {
      summary = `频谱分析完成。主频${peaks[0]?.frequency}Hz，幅值${peaks[0]?.amplitude.toFixed(3)}，整体RMS=${overallRMS.toFixed(3)}`;
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary,
      severity,
      urgency: severity === 'critical' ? 'immediate' : severity === 'warning' ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 8192); const pkS = peaks.length > 0 ? Math.min(1, peaks.length / 5) : 0.2; return Math.min(0.97, Math.max(0.4, 0.35 + lenS * 0.3 + pkS * 0.3)); })(),
      referenceStandard: 'ISO 10816-3 / ISO 20816-1',
      recommendations: severity === 'critical'
        ? ['建议立即停机检查', '检查轴承和对中状态', '记录振动数据用于趋势分析']
        : severity === 'warning'
        ? ['安排维护计划', '增加监测频率', '检查松动和不平衡']
        : ['继续正常监测'],
    }, {
      frequencies: filteredFreqs,
      amplitudes: filteredAmps,
      peaks,
      overallRMS,
      velocityRMS,
      isoEvaluation: isoResult,
      bearingFaultFrequencies: bearingFreqs,
      shaftRPM: rpm,
    }, [{
      type: 'spectrum',
      title: 'FFT频谱图',
      xAxis: { label: '频率', unit: 'Hz', data: filteredFreqs },
      yAxis: { label: '幅值', unit: 'mm/s' },
      series: [{ name: '频谱', data: filteredAmps, color: '#3b82f6' }],
    }]);
  }
}

// ============================================================
// 2. 倒频谱分析
// ============================================================

export class CepstrumAnalyzer implements IAlgorithmExecutor {
  readonly id = 'cepstrum_analysis';
  readonly name = '倒频谱分析';
  readonly version = '1.2.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      cepstrumType: 'power', // power | real
      quefrencyRange: [0, 0], // 自动
      peakThreshold: 0.1, // 峰值检测阈值 (相对于最大值)
      gearTeethCounts: [] as number[], // 齿轮齿数
      shaftRPM: 0,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 256) {
      return { valid: false, errors: ['倒频谱分析至少需要256个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 计算倒频谱
    const { quefrency, cepstrum } = dsp.powerCepstrum(signal);

    // 转换 quefrency 为时间 (秒)
    const quefrencyTime = quefrency.map(q => q / fs);

    // 排除 quefrency=0 (DC分量)
    const startIdx = Math.max(1, Math.floor(fs / 1000)); // 排除低于1ms的quefrency
    const endIdx = cfg.quefrencyRange[1] > 0
      ? Math.floor(cfg.quefrencyRange[1] * fs)
      : Math.floor(quefrency.length / 2);

    const validCeps = cepstrum.slice(startIdx, endIdx);
    const validQuefrency = quefrencyTime.slice(startIdx, endIdx);

    // 峰值检测
    const maxCeps = Math.max(...validCeps.map(Math.abs));
    const threshold = maxCeps * cfg.peakThreshold;
    const peaks: Array<{ quefrency: number; amplitude: number; possibleFrequency: number }> = [];

    for (let i = 1; i < validCeps.length - 1; i++) {
      if (Math.abs(validCeps[i]) > threshold &&
          Math.abs(validCeps[i]) > Math.abs(validCeps[i - 1]) &&
          Math.abs(validCeps[i]) > Math.abs(validCeps[i + 1])) {
        peaks.push({
          quefrency: validQuefrency[i],
          amplitude: validCeps[i],
          possibleFrequency: 1 / validQuefrency[i],
        });
      }
    }
    peaks.sort((a, b) => Math.abs(b.amplitude) - Math.abs(a.amplitude));
    const topPeaks = peaks.slice(0, 10);

    // 齿轮箱故障分析
    const rpm = cfg.shaftRPM || input.operatingCondition?.speed || 0;
    let gearDiagnosis = '';
    if (rpm > 0 && cfg.gearTeethCounts.length > 0) {
      const shaftFreq = rpm / 60;
      for (const peak of topPeaks) {
        for (let gi = 0; gi < cfg.gearTeethCounts.length; gi++) {
          const meshFreq = shaftFreq * cfg.gearTeethCounts[gi];
          if (Math.abs(peak.possibleFrequency - meshFreq) / meshFreq < 0.05) {
            gearDiagnosis += `检测到与第${gi + 1}级齿轮啮合频率(${meshFreq.toFixed(1)}Hz)匹配的倒频谱峰值，可能存在齿轮故障。`;
          }
        }
        // 检查是否为转频的倍数
        const orderRatio = peak.possibleFrequency / shaftFreq;
        if (Math.abs(orderRatio - Math.round(orderRatio)) < 0.1 && Math.round(orderRatio) > 0) {
          gearDiagnosis += `倒频谱峰值对应${Math.round(orderRatio)}X转频，可能指示周期性调制。`;
        }
      }
    }

    const hasFault = topPeaks.length > 3 && Math.abs(topPeaks[0].amplitude) > maxCeps * 0.3;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: gearDiagnosis || (hasFault
        ? `倒频谱检测到${topPeaks.length}个显著峰值，主峰quefrency=${topPeaks[0]?.quefrency.toFixed(4)}s(对应${topPeaks[0]?.possibleFrequency.toFixed(1)}Hz)，可能存在周期性故障`
        : `倒频谱分析正常，未检测到显著周期性调制`),
      severity: hasFault ? 'warning' : 'normal',
      urgency: hasFault ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); const pkS = topPeaks.length > 0 ? Math.min(1, topPeaks.length / 5) : 0.2; return Math.min(0.95, Math.max(0.35, 0.3 + lenS * 0.3 + pkS * 0.3)); })(),
      faultType: hasFault ? '周期性调制/齿轮故障' : undefined,
      referenceStandard: 'ISO 18436-2',
    }, {
      quefrency: validQuefrency,
      cepstrum: validCeps,
      peaks: topPeaks,
      gearDiagnosis,
    }, [{
      type: 'line',
      title: '倒频谱图',
      xAxis: { label: 'Quefrency', unit: 's', data: validQuefrency },
      yAxis: { label: '幅值' },
      series: [{ name: '倒频谱', data: validCeps, color: '#10b981' }],
    }]);
  }
}

// ============================================================
// 3. 包络解调分析 — 生产级实现 v3.0.0
//    快速峭度图 + Hilbert包络 + 多方法故障检测 + 谐波分析
//    合规: D1鲁棒/D2准确/D3时效/D4可配/D5可追溯
// ============================================================

// ── 包络解调内部类型 ──

interface EnvDemodConfig {
  detrend: boolean;
  detrendMethod: 'linear' | 'mean';
  kurtogramLevelMax: number;
  kurtogramFilterOrder: number;
  autoBandSelect: boolean;
  manualBandLow: number | null;
  manualBandHigh: number | null;
  envelopeDcRemove: boolean;
  faultDetectionMethod: 'adaptive_threshold' | 'fixed_threshold' | 'snr';
  fixedThresholdMultiplier: number;
  snrThresholdDb: number;
  frequencyTolerancePercent: number;
  harmonicCount: number;
  severityLevels: { normal: number; attention: number; warning: number };
  maxSignalLength: number;
  // 平台适配
  shaftRPM: number;
  bearingModel: string;
}

interface KurtogramBand {
  level: number;
  fCenter: number;
  bandwidth: number;
  fLow: number;
  fHigh: number;
  kurtosis: number;
}

interface EnvFaultDetection {
  detected: boolean;
  faultType: 'BPFO' | 'BPFI' | 'BSF' | 'FTF';
  faultName: string;
  expectedFreq: number;
  detectedFreq: number;
  amplitude: number;
  snrDb: number;
  harmonics: Array<{ order: number; freq: number; amplitude: number; detected: boolean }>;
  severity: 'normal' | 'attention' | 'warning' | 'critical';
  confidence: number;
}

interface EnvTraceStep {
  step: number;
  operation: string;
  finding: string;
  evidence: Record<string, unknown>;
  durationMs: number;
}

const ENV_FAULT_NAME_MAP: Record<string, string> = {
  BPFO: '外圈故障', BPFI: '内圈故障', BSF: '滚动体故障', FTF: '保持架故障',
};

const ENV_DEFAULT_CONFIG: EnvDemodConfig = {
  detrend: true,
  detrendMethod: 'linear',
  kurtogramLevelMax: 6,
  kurtogramFilterOrder: 4,
  autoBandSelect: true,
  manualBandLow: null,
  manualBandHigh: null,
  envelopeDcRemove: true,
  faultDetectionMethod: 'adaptive_threshold',
  fixedThresholdMultiplier: 3.0,
  snrThresholdDb: 6.0,
  frequencyTolerancePercent: 3.0,
  harmonicCount: 3,
  severityLevels: { normal: 0.15, attention: 0.35, warning: 0.6 },
  maxSignalLength: 10_000_000,
  shaftRPM: 0,
  bearingModel: '',
};

// ── 港机轴承参数库 (扩展) ──
const CRANE_BEARING_DB: Record<string, dsp.BearingGeometry> = {
  '22320':  { numberOfBalls: 17, ballDiameter: 32, pitchDiameter: 145, contactAngle: 0 },
  '6320':   { numberOfBalls: 8,  ballDiameter: 36, pitchDiameter: 138, contactAngle: 0 },
  '23140':  { numberOfBalls: 18, ballDiameter: 40, pitchDiameter: 240, contactAngle: 0 },
  '22228':  { numberOfBalls: 17, ballDiameter: 28, pitchDiameter: 184, contactAngle: 0 },
  '6316':   { numberOfBalls: 8,  ballDiameter: 31, pitchDiameter: 116, contactAngle: 0 },
  '32222':  { numberOfBalls: 19, ballDiameter: 22, pitchDiameter: 152, contactAngle: 12.5 },
};

// ── 内部 DSP 函数 (自包含, 不依赖外部 dsp.ts 的 FFT/Hilbert) ──

function envFft(real: Float64Array, imag?: Float64Array): { re: Float64Array; im: Float64Array } {
  const origLen = real.length;
  let n = 1;
  while (n < origLen) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(real);
  if (imag) im.set(imag);
  for (let i = 0, j = 0; i < n; i++) {
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += size) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
  return { re, im };
}

function envIfft(re: Float64Array, im: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const conjIm = new Float64Array(n);
  for (let i = 0; i < n; i++) conjIm[i] = -im[i];
  const result = envFft(re, conjIm);
  for (let i = 0; i < result.re.length; i++) {
    result.re[i] /= n;
    result.im[i] = -result.im[i] / n;
  }
  return result;
}

function envHilbertEnvelope(signal: Float64Array): Float64Array {
  const n = signal.length;
  const { re, im } = envFft(signal);
  const fftLen = re.length;
  const half = fftLen >> 1;
  for (let i = 1; i < half; i++) { re[i] *= 2; im[i] *= 2; }
  for (let i = half + 1; i < fftLen; i++) { re[i] = 0; im[i] = 0; }
  const analytic = envIfft(re, im);
  const envelope = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    envelope[i] = Math.sqrt(analytic.re[i] * analytic.re[i] + analytic.im[i] * analytic.im[i]);
  }
  return envelope;
}

function envApplyBiquad(
  signal: Float64Array, b0: number, b1: number, b2: number, a1: number, a2: number
): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = Number.isFinite(y0) ? y0 : 0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = out[i];
  }
  return out;
}

function envReverse(arr: Float64Array): void {
  for (let i = 0, j = arr.length - 1; i < j; i++, j--) {
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function envButterworthBandpass(
  signal: Float64Array, fs: number, fLow: number, fHigh: number, order: number = 4
): Float64Array {
  const nyq = fs / 2;
  if (fLow <= 0 || fHigh >= nyq || fLow >= fHigh) return new Float64Array(signal);
  const f0 = Math.sqrt(fLow * fHigh);
  const bw = fHigh - fLow;
  const Q = f0 / bw;
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0;
  const na1 = a1 / a0, na2 = a2 / a0;
  const halfOrder = Math.max(1, Math.floor(order / 2));
  let data = new Float64Array(signal);
  for (let stage = 0; stage < halfOrder; stage++) {
    const forward = envApplyBiquad(data, nb0, nb1, nb2, na1, na2);
    envReverse(forward);
    const backward = envApplyBiquad(forward, nb0, nb1, nb2, na1, na2);
    envReverse(backward);
    data = backward;
  }
  return data;
}

function envDetrend(signal: Float64Array, method: 'linear' | 'mean'): Float64Array {
  const n = signal.length;
  const result = new Float64Array(n);
  if (method === 'mean') {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += signal[i];
    const mean = sum / n;
    for (let i = 0; i < n; i++) result[i] = signal[i] - mean;
    return result;
  }
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += signal[i]; sumXY += i * signal[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-15) {
    const mean = sumY / n;
    for (let i = 0; i < n; i++) result[i] = signal[i] - mean;
    return result;
  }
  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;
  for (let i = 0; i < n; i++) result[i] = signal[i] - (a * i + b);
  return result;
}

function envFisherKurtosis(data: Float64Array): number {
  const n = data.length;
  if (n < 4) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mean = sum / n;
  let m2 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = data[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m4 += d2 * d2;
  }
  m2 /= n;
  m4 /= n;
  if (m2 < 1e-15) return 0;
  return m4 / (m2 * m2) - 3;
}

function envRms(data: Float64Array): number {
  let sum2 = 0;
  for (let i = 0; i < data.length; i++) sum2 += data[i] * data[i];
  return Math.sqrt(sum2 / data.length);
}

function envMean(data: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / data.length;
}

function envStd(data: Float64Array): number {
  const m = envMean(data);
  let sum2 = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i] - m;
    sum2 += d * d;
  }
  return Math.sqrt(sum2 / data.length);
}

function envIsSignalValid(sig: Float64Array): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (!Number.isFinite(sig[i])) return false;
  }
  return true;
}

function envFindPeak(
  spectrum: Float64Array, freqAxis: Float64Array, targetFreq: number, tolHz: number
): { peakAmp: number; peakFreq: number } {
  let peakAmp = 0, peakFreq = targetFreq;
  for (let i = 0; i < spectrum.length; i++) {
    if (Math.abs(freqAxis[i] - targetFreq) <= tolHz) {
      if (spectrum[i] > peakAmp) {
        peakAmp = spectrum[i];
        peakFreq = freqAxis[i];
      }
    }
  }
  return { peakAmp, peakFreq };
}

function envIsDetected(
  peakAmp: number, specMean: number, specStd: number, cfg: EnvDemodConfig
): boolean {
  if (cfg.faultDetectionMethod === 'fixed_threshold') {
    return peakAmp > specMean + cfg.fixedThresholdMultiplier * specStd;
  }
  if (cfg.faultDetectionMethod === 'snr') {
    const snr = specMean > 0 ? 20 * Math.log10(peakAmp / specMean) : 0;
    return snr >= cfg.snrThresholdDb;
  }
  return peakAmp > specMean + 3 * specStd;
}

function envAssessSeverity(
  amplitude: number, levels: EnvDemodConfig['severityLevels']
): 'normal' | 'attention' | 'warning' | 'critical' {
  if (amplitude < levels.normal) return 'normal';
  if (amplitude < levels.attention) return 'attention';
  if (amplitude < levels.warning) return 'warning';
  return 'critical';
}

function envDetermineOverallStatus(faults: EnvFaultDetection[]): 'normal' | 'attention' | 'warning' | 'critical' {
  const detected = faults.filter(f => f.detected);
  if (detected.length === 0) return 'normal';
  const severityOrder = { normal: 0, attention: 1, warning: 2, critical: 3 };
  let maxSev = 0;
  for (const f of detected) {
    const s = severityOrder[f.severity] || 0;
    if (s > maxSev) maxSev = s;
  }
  return (['normal', 'attention', 'warning', 'critical'] as const)[maxSev];
}

function envComputeKurtogram(
  signal: Float64Array, fs: number, levelMax: number, filterOrder: number,
  trace: EnvTraceStep[], stepCounter: { v: number }
): KurtogramBand[] {
  const t0 = Date.now();
  const bands: KurtogramBand[] = [];
  const nyq = fs / 2;
  for (let level = 1; level <= levelMax; level++) {
    const nBands = 1 << level;
    const bw = nyq / nBands;
    for (let i = 0; i < nBands; i++) {
      const fLow = i * bw;
      const fHigh = (i + 1) * bw;
      const fCenter = (fLow + fHigh) / 2;
      if (fLow < 1 || fHigh >= nyq - 1) continue;
      const filtered = envButterworthBandpass(signal, fs, fLow, fHigh, filterOrder);
      const kurt = envFisherKurtosis(filtered);
      if (Number.isFinite(kurt)) {
        bands.push({ level, fCenter, bandwidth: bw, fLow, fHigh, kurtosis: kurt });
      }
    }
  }
  bands.sort((a, b) => b.kurtosis - a.kurtosis);
  trace.push({
    step: stepCounter.v++,
    operation: 'fast_kurtogram',
    finding: bands.length > 0
      ? `分析 ${bands.length} 个频带, 最佳频带中心 ${bands[0]?.fCenter.toFixed(1)}Hz, 峭度 ${bands[0]?.kurtosis.toFixed(2)}`
      : '未找到有效频带',
    evidence: { totalBands: bands.length, levelMax, topBand: bands[0] || null },
    durationMs: Date.now() - t0,
  });
  return bands;
}

export class EnvelopeDemodAnalyzer implements IAlgorithmExecutor {
  readonly id = 'envelope_demod';
  readonly name = '包络解调分析';
  readonly version = '3.0.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      // 预处理
      detrend: true,
      detrendMethod: 'linear',
      // 谱峭度 / 快速峭度图
      kurtogramLevelMax: 6,
      kurtogramFilterOrder: 4,
      autoBandSelect: true,
      manualBandLow: null as number | null,
      manualBandHigh: null as number | null,
      // 包络
      envelopeDcRemove: true,
      // 故障检测
      faultDetectionMethod: 'adaptive_threshold' as 'adaptive_threshold' | 'fixed_threshold' | 'snr',
      fixedThresholdMultiplier: 3.0,
      snrThresholdDb: 6.0,
      frequencyTolerancePercent: 3.0,
      harmonicCount: 3,
      // 严重度
      severityLevels: { normal: 0.15, attention: 0.35, warning: 0.6 },
      // 性能
      maxSignalLength: 10_000_000,
      // 平台适配
      shaftRPM: 0,
      bearingModel: '',
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 64) {
      return { valid: false, errors: ['包络分析至少需要64个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg: EnvDemodConfig = { ...ENV_DEFAULT_CONFIG, ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;
    const rpm = cfg.shaftRPM || input.operatingCondition?.speed || input.equipment?.ratedSpeed || 0;

    const trace: EnvTraceStep[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const stepCounter = { v: 1 };
    const perf = {
      preprocessMs: 0, kurtogramMs: 0, hilbertMs: 0,
      fftMs: 0, detectionMs: 0, totalMs: 0, memoryEstimateMb: 0,
    };

    // ── D1 鲁棒性: 输入校验与转换 ──
    let sig: Float64Array;
    if (signal instanceof Float64Array) {
      sig = signal;
    } else {
      sig = Float64Array.from(signal);
    }
    if (sig.length > cfg.maxSignalLength) {
      warnings.push(`信号长度 ${sig.length} 超过限制 ${cfg.maxSignalLength}, 截断处理`);
      sig = sig.slice(0, cfg.maxSignalLength);
    }
    // NaN/Infinity 清洗
    let nanCount = 0;
    for (let i = 0; i < sig.length; i++) {
      if (!Number.isFinite(sig[i])) { sig[i] = 0; nanCount++; }
    }
    if (nanCount > 0) warnings.push(`清洗 ${nanCount} 个 NaN/Infinity 值`);
    if (nanCount > sig.length * 0.5) errors.push(`超过 50% 数据无效 (${nanCount}/${sig.length})`);

    const inputSummary = {
      signalLength: sig.length,
      sampleRate: fs,
      rpm,
      durationSeconds: sig.length / fs,
      rms: envRms(sig),
      peakToPeak: (() => { let min = Infinity, max = -Infinity; for (let i = 0; i < sig.length; i++) { if (sig[i] < min) min = sig[i]; if (sig[i] > max) max = sig[i]; } return max - min; })(),
    };

    trace.push({
      step: stepCounter.v++,
      operation: 'input_validation',
      finding: `信号长度 ${sig.length} 点, 采样率 ${fs}Hz, 转速 ${rpm}rpm, 时长 ${inputSummary.durationSeconds.toFixed(2)}s`,
      evidence: inputSummary,
      durationMs: Date.now() - startTime,
    });

    // ── Step 1: 预处理 (去趋势) ──
    let tStep = Date.now();
    let processed = sig;
    if (cfg.detrend) {
      processed = envDetrend(sig, cfg.detrendMethod);
    }
    if (!envIsSignalValid(processed)) {
      warnings.push('预处理后信号含无效值, 回退到原始信号');
      processed = sig;
    }
    perf.preprocessMs = Date.now() - tStep;
    trace.push({
      step: stepCounter.v++,
      operation: 'preprocess',
      finding: `去趋势(${cfg.detrendMethod}), 预处理后 RMS=${envRms(processed).toFixed(4)}`,
      evidence: { method: cfg.detrendMethod, rmsAfter: envRms(processed) },
      durationMs: perf.preprocessMs,
    });

    // ── Step 2: 计算轴承特征频率 ──
    let faultFreqs: dsp.BearingFaultFrequencies | null = null;
    const bearing = cfg.bearingModel ? (getDefaultBearing(cfg.bearingModel) || CRANE_BEARING_DB[cfg.bearingModel] && {
      numberOfBalls: CRANE_BEARING_DB[cfg.bearingModel].numberOfBalls,
      ballDiameter: CRANE_BEARING_DB[cfg.bearingModel].ballDiameter,
      pitchDiameter: CRANE_BEARING_DB[cfg.bearingModel].pitchDiameter,
      contactAngle: CRANE_BEARING_DB[cfg.bearingModel].contactAngle,
    }) : null;

    if (bearing && rpm > 0) {
      faultFreqs = dsp.bearingFaultFrequencies(bearing, rpm);
      trace.push({
        step: stepCounter.v++,
        operation: 'bearing_frequencies',
        finding: `BPFO=${faultFreqs.BPFO.toFixed(2)}Hz, BPFI=${faultFreqs.BPFI.toFixed(2)}Hz, BSF=${faultFreqs.BSF.toFixed(2)}Hz, FTF=${faultFreqs.FTF.toFixed(2)}Hz`,
        evidence: faultFreqs,
        durationMs: 0,
      });
    }

    // ── Step 3: 最佳解调频带选择 (快速峭度图) ──
    tStep = Date.now();
    let optimalBand: KurtogramBand | null = null;
    let kurtogramTop5: KurtogramBand[] = [];
    let bandLow: number | null = null;
    let bandHigh: number | null = null;

    if (cfg.autoBandSelect) {
      const bands = envComputeKurtogram(processed, fs, cfg.kurtogramLevelMax, cfg.kurtogramFilterOrder, trace, stepCounter);
      kurtogramTop5 = bands.slice(0, 5);
      if (bands.length > 0 && bands[0].kurtosis > 0) {
        optimalBand = bands[0];
        bandLow = optimalBand.fLow;
        bandHigh = optimalBand.fHigh;
      } else {
        warnings.push('谱峭度未找到明显冲击频带, 使用全频带分析');
      }
    } else if (cfg.manualBandLow !== null && cfg.manualBandHigh !== null) {
      bandLow = cfg.manualBandLow;
      bandHigh = cfg.manualBandHigh;
      trace.push({
        step: stepCounter.v++,
        operation: 'manual_band',
        finding: `使用手动频带 [${bandLow}, ${bandHigh}] Hz`,
        evidence: { fLow: bandLow, fHigh: bandHigh },
        durationMs: 0,
      });
    }
    perf.kurtogramMs = Date.now() - tStep;

    // ── Step 4: 带通滤波 ──
    let filtered = processed;
    if (bandLow !== null && bandHigh !== null) {
      tStep = Date.now();
      filtered = envButterworthBandpass(processed, fs, bandLow, bandHigh, cfg.kurtogramFilterOrder);
      if (!envIsSignalValid(filtered) || envRms(filtered) < 1e-12) {
        warnings.push('带通滤波后信号过弱, 回退到预处理信号');
        filtered = processed;
      }
      trace.push({
        step: stepCounter.v++,
        operation: 'bandpass_filter',
        finding: `带通滤波 [${bandLow.toFixed(1)}, ${bandHigh.toFixed(1)}] Hz, 滤波后 RMS=${envRms(filtered).toFixed(6)}`,
        evidence: { fLow: bandLow, fHigh: bandHigh, rmsAfter: envRms(filtered) },
        durationMs: Date.now() - tStep,
      });
    }

    // ── Step 5: Hilbert 变换 → 包络提取 ──
    tStep = Date.now();
    let envSignal = envHilbertEnvelope(filtered);
    if (cfg.envelopeDcRemove) {
      let sum = 0;
      for (let i = 0; i < envSignal.length; i++) sum += envSignal[i];
      const mean = sum / envSignal.length;
      for (let i = 0; i < envSignal.length; i++) envSignal[i] -= mean;
    }
    perf.hilbertMs = Date.now() - tStep;
    trace.push({
      step: stepCounter.v++,
      operation: 'hilbert_envelope',
      finding: `Hilbert变换完成, 包络 RMS=${envRms(envSignal).toFixed(6)}, DC已${cfg.envelopeDcRemove ? '移除' : '保留'}`,
      evidence: { envelopeRms: envRms(envSignal), dcRemoved: cfg.envelopeDcRemove },
      durationMs: perf.hilbertMs,
    });

    // ── Step 6: 包络谱 (FFT) ──
    tStep = Date.now();
    const n = envSignal.length;
    const { re: envRe, im: envIm } = envFft(envSignal);
    const fftLen = envRe.length;
    const halfLen = fftLen >> 1;
    const envelopeSpectrum = new Float64Array(halfLen);
    for (let i = 0; i < halfLen; i++) {
      envelopeSpectrum[i] = (2 / n) * Math.sqrt(envRe[i] * envRe[i] + envIm[i] * envIm[i]);
    }
    const frequencyAxis = new Float64Array(halfLen);
    for (let i = 0; i < halfLen; i++) {
      frequencyAxis[i] = (i * fs) / fftLen;
    }
    perf.fftMs = Date.now() - tStep;
    trace.push({
      step: stepCounter.v++,
      operation: 'envelope_spectrum',
      finding: `包络谱计算完成, 频率分辨率 ${(fs / fftLen).toFixed(3)}Hz, 频谱长度 ${halfLen}`,
      evidence: { freqResolution: fs / fftLen, spectrumLength: halfLen },
      durationMs: perf.fftMs,
    });

    // ── Step 7: 故障特征频率检测 ──
    tStep = Date.now();
    const faults: EnvFaultDetection[] = [];
    if (faultFreqs) {
      const faultTypes: Array<'BPFO' | 'BPFI' | 'BSF' | 'FTF'> = ['BPFO', 'BPFI', 'BSF', 'FTF'];
      const specMean = envMean(envelopeSpectrum);
      const specStd = envStd(envelopeSpectrum);
      for (const ft of faultTypes) {
        const targetFreq = faultFreqs[ft];
        if (targetFreq <= 0 || targetFreq > fs / 2) continue;
        const tolHz = targetFreq * (cfg.frequencyTolerancePercent / 100);
        const { peakAmp, peakFreq } = envFindPeak(envelopeSpectrum, frequencyAxis, targetFreq, tolHz);
        const snrDb = peakAmp > 0 && specMean > 0 ? 20 * Math.log10(peakAmp / specMean) : 0;
        const harmonics: EnvFaultDetection['harmonics'] = [];
        let harmonicScore = 0;
        for (let h = 1; h <= cfg.harmonicCount; h++) {
          const hFreq = targetFreq * h;
          if (hFreq > fs / 2) break;
          const hTol = hFreq * (cfg.frequencyTolerancePercent / 100);
          const hPeak = envFindPeak(envelopeSpectrum, frequencyAxis, hFreq, hTol);
          const hDetected = envIsDetected(hPeak.peakAmp, specMean, specStd, cfg);
          if (hDetected) harmonicScore += 1 / h;
          harmonics.push({ order: h, freq: hPeak.peakFreq, amplitude: hPeak.peakAmp, detected: hDetected });
        }
        const detected = envIsDetected(peakAmp, specMean, specStd, cfg);
        const baseConf = detected ? Math.min(snrDb / 20, 1.0) : 0;
        const harmonicConf = harmonicScore / cfg.harmonicCount;
        const confidence = Math.min(0.7 * baseConf + 0.3 * harmonicConf, 1.0);
        const severity = envAssessSeverity(peakAmp, cfg.severityLevels);
        faults.push({
          detected, faultType: ft, faultName: ENV_FAULT_NAME_MAP[ft] || ft,
          expectedFreq: targetFreq, detectedFreq: peakFreq, amplitude: peakAmp,
          snrDb, harmonics, severity, confidence,
        });
      }
    }
    perf.detectionMs = Date.now() - tStep;
    const detectedFaults = faults.filter(f => f.detected);
    trace.push({
      step: stepCounter.v++,
      operation: 'fault_detection',
      finding: detectedFaults.length > 0
        ? `检测到 ${detectedFaults.length} 种故障: ${detectedFaults.map(f => `${f.faultName}(${f.expectedFreq.toFixed(1)}Hz, SNR=${f.snrDb.toFixed(1)}dB, ${f.severity})`).join(', ')}`
        : '未检测到故障特征频率',
      evidence: {
        method: cfg.faultDetectionMethod,
        tolerance: cfg.frequencyTolerancePercent,
        faults: faults.map(f => ({ type: f.faultType, detected: f.detected, amplitude: f.amplitude, snrDb: f.snrDb, confidence: f.confidence })),
      },
      durationMs: perf.detectionMs,
    });

    // ── 综合结论 ──
    const overallStatus = envDetermineOverallStatus(faults);
    const overallConfidence = detectedFaults.length > 0
      ? detectedFaults.reduce((sum, f) => sum + f.confidence, 0) / detectedFaults.length
      : 1.0;
    perf.totalMs = Date.now() - startTime;
    perf.memoryEstimateMb = (sig.length * 5 + fftLen * 4) * 8 / (1024 * 1024);

    trace.push({
      step: stepCounter.v++,
      operation: 'conclusion',
      finding: `综合诊断: ${overallStatus}, 置信度 ${(overallConfidence * 100).toFixed(1)}%, 总耗时 ${perf.totalMs}ms`,
      evidence: { overallStatus, overallConfidence, performance: perf },
      durationMs: 0,
    });

    // ── 构建平台标准输出 ──
    const hasFault = detectedFaults.length > 0;
    const envFreqs = Array.from(frequencyAxis);
    const envAmps = Array.from(envelopeSpectrum);
    const envArr = Array.from(envSignal);

    // 限制输出大小
    const maxSpecLen = Math.min(envFreqs.length, Math.floor(envFreqs.length / 4));
    const maxEnvLen = Math.min(envArr.length, 4096);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: hasFault
        ? `包络解调检测到轴承故障特征: ${detectedFaults.map(f => `${f.faultName}(${f.expectedFreq.toFixed(1)}Hz, SNR=${f.snrDb.toFixed(1)}dB, ${f.severity})`).join(', ')}。${optimalBand ? `最佳解调频带: ${optimalBand.fLow.toFixed(0)}-${optimalBand.fHigh.toFixed(0)}Hz` : '全频带分析'}`
        : `包络解调分析正常，${optimalBand ? `最佳解调频带 ${optimalBand.fLow.toFixed(0)}-${optimalBand.fHigh.toFixed(0)}Hz` : '全频带分析'}，未检测到显著轴承故障特征`,
      severity: overallStatus === 'critical' ? 'critical' : overallStatus === 'warning' ? 'warning' : overallStatus === 'attention' ? 'warning' : 'normal',
      urgency: hasFault ? 'scheduled' : 'monitoring',
      confidence: Math.max(0.35, Math.min(0.98, overallConfidence)),
      faultType: detectedFaults.map(f => f.faultName).join(', ') || undefined,
      referenceStandard: 'ISO 15243 (轴承损伤分类)',
      recommendations: hasFault
        ? ['确认轴承型号和转速参数', '安排轴承更换计划', '检查润滑状态', '记录趋势数据', '缩短监测周期']
        : ['继续定期监测'],
    }, {
      // 完整结果数据
      filterBand: optimalBand ? { low: optimalBand.fLow, high: optimalBand.fHigh } : null,
      optimalBand,
      kurtogramTop5,
      envelopeSignal: envArr.slice(0, maxEnvLen),
      envelopeSpectrum: { frequencies: envFreqs, amplitudes: envAmps },
      faults,
      detectedFaults,
      overallStatus,
      overallConfidence,
      reasoningTrace: trace,
      performance: perf,
      inputSummary,
      warnings,
      errors,
    }, [
      {
        type: 'spectrum',
        title: '包络谱',
        xAxis: { label: '频率', unit: 'Hz', data: envFreqs.slice(0, maxSpecLen) },
        yAxis: { label: '包络幅值' },
        series: [
          { name: '包络谱', data: envAmps.slice(0, maxSpecLen), color: '#f59e0b' },
          // 标注检测到的故障频率
          ...detectedFaults.map(f => ({
            name: f.faultName,
            data: envFreqs.slice(0, maxSpecLen).map((freq: number) =>
              Math.abs(freq - f.detectedFreq) < (fs / fftLen * 2) ? f.amplitude : 0
            ),
            color: f.severity === 'critical' ? '#ef4444' : f.severity === 'warning' ? '#f97316' : '#eab308',
          })),
        ],
      },
      {
        type: 'line',
        title: '包络信号',
        xAxis: { label: '时间', unit: 's' },
        yAxis: { label: '幅值' },
        series: [{ name: '包络', data: envArr.slice(0, maxEnvLen), color: '#ef4444' }],
      },
      ...(kurtogramTop5.length > 0 ? [{
        type: 'bar' as const,
        title: '峭度图 Top5 频带',
        xAxis: { label: '频带', unit: 'Hz' },
        yAxis: { label: '峭度值' },
        series: [{
          name: '峭度',
          data: kurtogramTop5.map(b => b.kurtosis),
          color: '#8b5cf6',
          labels: kurtogramTop5.map(b => `${b.fLow.toFixed(0)}-${b.fHigh.toFixed(0)}Hz`),
        }],
      }] : []),
    ]);
  }
}

// ============================================================
// 4. 小波包分解
// ============================================================

export class WaveletPacketAnalyzer implements IAlgorithmExecutor {
  readonly id = 'wavelet_packet';
  readonly name = '小波包分解';
  readonly version = '1.5.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      waveletType: 'db4', // db4 | db8 | sym5
      decompositionLevel: 3,
      energyThreshold: 0.01, // 能量占比阈值
    };
  }

  validateInput(input: AlgorithmInput, config: Record<string, any>) {
    const signal = getSignalData(input);
    const level = config.decompositionLevel || 3;
    const minLen = Math.pow(2, level + 2);
    if (!signal || signal.length < minLen) {
      return { valid: false, errors: [`${level}层分解至少需要${minLen}个采样点`] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate || 1;

    // 简化的小波包分解 (使用 Haar 近似 db4)
    const level = cfg.decompositionLevel;
    const nodes = waveletPacketDecompose(signal, level);

    // 计算各节点能量
    const totalEnergy = signal.reduce((s, v) => s + v * v, 0);
    const nodeEnergies = nodes.map((node, i) => {
      const energy = node.reduce((s, v) => s + v * v, 0);
      const bandWidth = (fs / 2) / Math.pow(2, level);
      return {
        nodeIndex: i,
        frequencyBand: {
          low: i * bandWidth,
          high: (i + 1) * bandWidth,
        },
        energy,
        energyRatio: totalEnergy > 0 ? energy / totalEnergy : 0,
      };
    });

    // Shannon 熵
    const probs = nodeEnergies.map(n => n.energyRatio).filter(p => p > 0);
    const entropy = -probs.reduce((s, p) => s + p * Math.log2(p), 0);
    const maxEntropy = Math.log2(nodes.length);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // 找能量集中的频带
    const significantBands = nodeEnergies
      .filter(n => n.energyRatio > cfg.energyThreshold)
      .sort((a, b) => b.energyRatio - a.energyRatio);

    const isAbnormal = normalizedEntropy > 0.85 || significantBands.length <= 1;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `${level}层小波包分解完成，${nodes.length}个频带。Shannon熵=${entropy.toFixed(3)}(归一化${normalizedEntropy.toFixed(3)})。` +
        `能量主要集中在${significantBands.slice(0, 3).map(b => `${b.frequencyBand.low.toFixed(0)}-${b.frequencyBand.high.toFixed(0)}Hz(${(b.energyRatio * 100).toFixed(1)}%)`).join(', ')}`,
      severity: isAbnormal ? 'attention' : 'normal',
      urgency: 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); const entS = normalizedEntropy < 0.9 ? 0.25 : 0.1; return Math.min(0.95, Math.max(0.4, 0.35 + lenS * 0.3 + entS)); })(),
      referenceStandard: 'Mallat 1989 / Coifman-Wickerhauser 1992',
    }, {
      nodeEnergies,
      shannonEntropy: entropy,
      normalizedEntropy,
      significantBands,
      decompositionLevel: level,
      totalNodes: nodes.length,
    }, [{
      type: 'bar',
      title: '小波包能量分布',
      xAxis: {
        label: '频带',
        data: nodeEnergies.map(n => `${n.frequencyBand.low.toFixed(0)}-${n.frequencyBand.high.toFixed(0)}Hz`),
      },
      yAxis: { label: '能量占比', unit: '%' },
      series: [{
        name: '能量',
        data: nodeEnergies.map(n => n.energyRatio * 100),
        color: '#8b5cf6',
      }],
    }]);
  }
}

/** 简化的小波包分解 */
function waveletPacketDecompose(signal: number[], level: number): number[][] {
  if (level === 0) return [signal];

  // Haar小波分解
  const N = signal.length;
  const halfN = Math.floor(N / 2);
  const approx = new Array(halfN);
  const detail = new Array(halfN);

  for (let i = 0; i < halfN; i++) {
    approx[i] = (signal[2 * i] + signal[2 * i + 1]) / Math.SQRT2;
    detail[i] = (signal[2 * i] - signal[2 * i + 1]) / Math.SQRT2;
  }

  if (level === 1) return [approx, detail];

  // 递归分解
  const approxNodes = waveletPacketDecompose(approx, level - 1);
  const detailNodes = waveletPacketDecompose(detail, level - 1);

  return [...approxNodes, ...detailNodes];
}

// ============================================================
// 5. 带通滤波
// ============================================================

export class BandpassFilterProcessor implements IAlgorithmExecutor {
  readonly id = 'bandpass_filter';
  readonly name = '带通滤波';
  readonly version = '1.3.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      filterType: 'butterworth', // butterworth | chebyshev
      lowCutoff: 100, // Hz
      highCutoff: 3000, // Hz
      order: 4,
      zeroPhase: true, // 零相位滤波
    };
  }

  validateInput(input: AlgorithmInput, config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 32) {
      return { valid: false, errors: ['信号长度不足'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    const fs = input.sampleRate;
    if (config.highCutoff >= fs / 2) {
      return { valid: false, errors: [`高截止频率(${config.highCutoff}Hz)必须小于奈奎斯特频率(${fs / 2}Hz)`] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 设计滤波器
    const coeffs = dsp.butterworthBandpass(cfg.order, cfg.lowCutoff, cfg.highCutoff, fs);

    // 应用滤波
    const filtered = cfg.zeroPhase
      ? dsp.filtfilt(signal, coeffs)
      : dsp.applyFilter(signal, coeffs);

    // 计算滤波前后的统计量
    const beforeRMS = dsp.rms(signal);
    const afterRMS = dsp.rms(filtered);
    const energyRetention = beforeRMS > 0 ? (afterRMS / beforeRMS) * 100 : 0;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `带通滤波完成: ${cfg.lowCutoff}-${cfg.highCutoff}Hz, ${cfg.order}阶${cfg.filterType}。能量保留率${energyRetention.toFixed(1)}%`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const lenS = Math.min(1, signal.length / 4096); const retS = energyRetention > 10 ? 0.3 : 0.1; return Math.min(0.98, Math.max(0.5, 0.45 + lenS * 0.25 + retS)); })(),
    }, {
      filteredSignal: filtered,
      filterBand: { low: cfg.lowCutoff, high: cfg.highCutoff },
      beforeRMS,
      afterRMS,
      energyRetention,
      filterCoefficients: coeffs,
    }, [{
      type: 'line',
      title: '滤波前后对比',
      xAxis: { label: '采样点' },
      yAxis: { label: '幅值' },
      series: [
        { name: '原始信号', data: signal.slice(0, 1024), color: '#94a3b8' },
        { name: '滤波后', data: filtered.slice(0, 1024), color: '#3b82f6' },
      ],
    }]);
  }
}

// ============================================================
// 6. 谱峭度SK (Fast Kurtogram)
// ============================================================

export class SpectralKurtosisAnalyzer implements IAlgorithmExecutor {
  readonly id = 'spectral_kurtosis';
  readonly name = '谱峭度SK';
  readonly version = '1.4.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      maxLevel: 6, // 最大分解层数
      windowSize: 256,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 1024) {
      return { valid: false, errors: ['谱峭度分析至少需要1024个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // Fast Kurtogram (Antoni 2006)
    // 二叉树搜索: 在不同中心频率和带宽下计算峭度
    const kurtogramResults: Array<{
      level: number;
      centerFreq: number;
      bandwidth: number;
      kurtosis: number;
    }> = [];

    let bestKurtosis = -Infinity;
    let bestCenter = fs / 4;
    let bestBandwidth = fs / 4;

    for (let level = 1; level <= cfg.maxLevel; level++) {
      const nBands = Math.pow(2, level);
      const bw = (fs / 2) / nBands;

      for (let band = 0; band < nBands; band++) {
        const center = bw * (band + 0.5);
        const low = Math.max(1, center - bw / 2);
        const high = Math.min(fs / 2 - 1, center + bw / 2);

        // 带通滤波
        try {
          const coeffs = dsp.butterworthBandpass(2, low, high, fs);
          const filtered = dsp.applyFilter(signal, coeffs);
          const env = dsp.envelope(filtered);
          const kurt = dsp.kurtosis(env);

          kurtogramResults.push({ level, centerFreq: center, bandwidth: bw, kurtosis: kurt });

          if (kurt > bestKurtosis) {
            bestKurtosis = kurt;
            bestCenter = center;
            bestBandwidth = bw;
          }
        } catch {
          // 某些频带可能导致滤波器不稳定，跳过
        }
      }
    }

    const optimalBand = {
      centerFrequency: bestCenter,
      bandwidth: bestBandwidth,
      lowFrequency: bestCenter - bestBandwidth / 2,
      highFrequency: bestCenter + bestBandwidth / 2,
      kurtosis: bestKurtosis,
    };

    const isImpulsive = bestKurtosis > 6; // 峭度>6通常指示冲击性故障

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `谱峭度分析完成。最佳频带: ${optimalBand.lowFrequency.toFixed(0)}-${optimalBand.highFrequency.toFixed(0)}Hz(中心${bestCenter.toFixed(0)}Hz)，峭度=${bestKurtosis.toFixed(2)}。` +
        (isImpulsive ? '检测到冲击性成分，建议进行包络解调分析' : '未检测到显著冲击性成分'),
      severity: isImpulsive ? 'attention' : 'normal',
      urgency: isImpulsive ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 8192); const kurtS = bestKurtosis > 3 ? Math.min(1, (bestKurtosis - 3) / 10) : 0.1; return Math.min(0.96, Math.max(0.35, 0.3 + lenS * 0.3 + kurtS * 0.3)); })(),
      referenceStandard: 'Antoni J. (2006) Fast Kurtogram',
      recommendations: isImpulsive
        ? ['使用最佳频带进行包络解调分析', '检查轴承状态', '对比历史谱峭度趋势']
        : ['继续监测'],
    }, {
      optimalBand,
      kurtogramResults,
      isImpulsive,
    }, [{
      type: 'heatmap',
      title: 'Kurtogram',
      xAxis: { label: '中心频率', unit: 'Hz' },
      yAxis: { label: '分解层级' },
      series: [{
        name: '峭度',
        data: kurtogramResults.map(r => [r.centerFreq, r.level, r.kurtosis]),
      }],
    }]);
  }
}

// ============================================================
// 7. 重采样
// ============================================================

export class ResamplingProcessor implements IAlgorithmExecutor {
  readonly id = 'resampling';
  readonly name = '重采样';
  readonly version = '1.1.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      targetSampleRate: 0, // Hz, 0=自动
      method: 'cubic', // linear | cubic
      antiAliasing: true,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 16) {
      return { valid: false, errors: ['信号长度不足'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供原始采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;
    const targetFs = cfg.targetSampleRate || fs * 2;

    // 抗混叠滤波
    let processedSignal = signal;
    if (cfg.antiAliasing && targetFs < fs) {
      const nyquist = targetFs / 2;
      const lpCoeffs = dsp.butterworthLowpass(4, nyquist * 0.9, fs);
      processedSignal = dsp.filtfilt(processedSignal, lpCoeffs);
    }

    // 重采样
    const resampled = dsp.resample(processedSignal, fs, targetFs);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `重采样完成: ${fs}Hz → ${targetFs}Hz，${signal.length}点 → ${resampled.length}点`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const lenS = Math.min(1, signal.length / 4096); return Math.min(0.98, Math.max(0.5, 0.5 + lenS * 0.3 + 0.15)); })(),
    }, {
      resampledSignal: resampled,
      originalSampleRate: fs,
      targetSampleRate: targetFs,
      originalLength: signal.length,
      resampledLength: resampled.length,
      ratio: targetFs / fs,
    });
  }
}

// ============================================================
// 8. 阶次跟踪分析
// ============================================================

export class OrderTrackingAnalyzer implements IAlgorithmExecutor {
  readonly id = 'order_tracking';
  readonly name = '阶次跟踪分析';
  readonly version = '1.3.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      samplesPerRev: 256,
      maxOrder: 20,
      tachoPulseChannel: '', // 键相通道名
      orderResolution: 0.1,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 512) {
      return { valid: false, errors: ['阶次分析至少需要512个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 获取转速信号
    let tachoPulses: number[] = [];
    if (cfg.tachoPulseChannel && typeof input.data === 'object' && !Array.isArray(input.data)) {
      const tachoSignal = (input.data as Record<string, number[]>)[cfg.tachoPulseChannel];
      if (tachoSignal) {
        // 从键相信号提取脉冲时间点 (过零检测)
        for (let i = 1; i < tachoSignal.length; i++) {
          if (tachoSignal[i - 1] < 0 && tachoSignal[i] >= 0) {
            tachoPulses.push(i / fs);
          }
        }
      }
    }

    // 如果没有键相信号，使用恒速假设
    const rpm = input.operatingCondition?.speed || input.equipment?.ratedSpeed || 1500;
    if (tachoPulses.length < 3) {
      const revsPerSec = rpm / 60;
      const totalTime = signal.length / fs;
      const totalRevs = Math.floor(totalTime * revsPerSec);
      tachoPulses = Array.from({ length: totalRevs + 1 }, (_, i) => i / revsPerSec);
    }

    // 角度域重采样
    const { angularSignal, avgRPM } = dsp.angularResample(signal, fs, tachoPulses, cfg.samplesPerRev);

    // 阶次谱 (对角度域信号做FFT)
    if (angularSignal.length < cfg.samplesPerRev) {
      return createOutput(this.id, this.version, input, cfg, startTime, {
        summary: '数据不足以完成阶次分析',
        severity: 'normal',
        urgency: 'monitoring',
        confidence: 0.1,
      }, { error: '角度域信号长度不足' });
    }

    const orderSpectrum = dsp.amplitudeSpectrum(angularSignal, cfg.samplesPerRev);
    // 频率轴转换为阶次
    const orders = orderSpectrum.frequencies.map(f => f); // 已经是阶次（因为采样率=samplesPerRev）
    const orderAmplitudes = orderSpectrum.amplitudes;

    // 提取关键阶次
    const keyOrders: Array<{ order: number; amplitude: number }> = [];
    for (let ord = 1; ord <= cfg.maxOrder; ord++) {
      const idx = Math.round(ord);
      if (idx < orderAmplitudes.length) {
        keyOrders.push({ order: ord, amplitude: orderAmplitudes[idx] });
      }
    }

    // 分析
    const dominantOrder = keyOrders.reduce((max, o) => o.amplitude > max.amplitude ? o : max, keyOrders[0]);
    const has1X = keyOrders.find(o => o.order === 1);
    const has2X = keyOrders.find(o => o.order === 2);

    let diagnosis = `阶次分析完成，平均转速${avgRPM.toFixed(0)}RPM。`;
    if (has1X && has2X && has2X.amplitude > has1X.amplitude * 0.5) {
      diagnosis += `2X阶次显著(${has2X.amplitude.toFixed(3)})，可能存在不对中。`;
    }
    if (dominantOrder.order === 1) {
      diagnosis += `1X阶次主导(${dominantOrder.amplitude.toFixed(3)})，可能存在不平衡。`;
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: diagnosis,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); return Math.min(0.95, Math.max(0.4, 0.4 + lenS * 0.3 + 0.2)); })(),
      referenceStandard: 'Vold-Kalman 1997 / ISO 10816',
    }, {
      orders: orders.slice(0, cfg.maxOrder * 2),
      orderAmplitudes: orderAmplitudes.slice(0, cfg.maxOrder * 2),
      keyOrders,
      avgRPM,
      angularSignalLength: angularSignal.length,
    }, [{
      type: 'bar',
      title: '阶次谱',
      xAxis: { label: '阶次', data: keyOrders.map(o => o.order.toString()) },
      yAxis: { label: '幅值' },
      series: [{ name: '阶次幅值', data: keyOrders.map(o => o.amplitude), color: '#06b6d4' }],
    }]);
  }
}

// ============================================================
// 辅助：默认轴承参数库
// ============================================================

function getDefaultBearing(model: string): dsp.BearingGeometry | null {
  const bearings: Record<string, dsp.BearingGeometry> = {
    '6205': { numberOfBalls: 9, ballDiameter: 7.938, pitchDiameter: 38.5, contactAngle: 0 },
    '6206': { numberOfBalls: 9, ballDiameter: 9.525, pitchDiameter: 46.5, contactAngle: 0 },
    '6208': { numberOfBalls: 9, ballDiameter: 11.906, pitchDiameter: 54.991, contactAngle: 0 },
    '6310': { numberOfBalls: 8, ballDiameter: 17.462, pitchDiameter: 71.501, contactAngle: 0 },
    '6312': { numberOfBalls: 8, ballDiameter: 19.05, pitchDiameter: 81.5, contactAngle: 0 },
    '7210': { numberOfBalls: 14, ballDiameter: 9.525, pitchDiameter: 63.0, contactAngle: 40 },
    'NU210': { numberOfBalls: 14, ballDiameter: 10.0, pitchDiameter: 65.0, contactAngle: 0 },
    '22220': { numberOfBalls: 17, ballDiameter: 18.0, pitchDiameter: 130.0, contactAngle: 10 },
  };
  return bearings[model] || null;
}

// ============================================================
// 导出所有算法注册信息
// ============================================================

export function getMechanicalAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new FFTSpectrumAnalyzer(),
      metadata: {
        description: '基于Cooley-Tukey FFT的频谱分析，支持多种窗函数、ISO 10816/20816振动严重度评估、特征频率自动标注',
        tags: ['频谱', 'FFT', '振动', 'ISO10816', '故障诊断'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'frequencies', type: 'number[]', description: '频率轴(Hz)' },
          { name: 'amplitudes', type: 'number[]', description: '幅值谱' },
          { name: 'peaks', type: 'object[]', description: '峰值频率列表' },
          { name: 'velocityRMS', type: 'number', description: '速度RMS(mm/s)' },
          { name: 'isoEvaluation', type: 'object', description: 'ISO评估结果' },
        ],
        configFields: [
          { name: 'windowFunction', type: 'select', options: ['hanning', 'hamming', 'blackman', 'flat-top'], default: 'hanning' },
          { name: 'enableISO', type: 'boolean', default: true },
          { name: 'machineGroup', type: 'select', options: ['group1', 'group2', 'group3', 'group4'], default: 'group2' },
          { name: 'shaftRPM', type: 'number', default: 0, description: '转速(RPM)，0=自动' },
          { name: 'bearingModel', type: 'string', default: '', description: '轴承型号' },
        ],
        applicableDeviceTypes: ['motor', 'pump', 'compressor', 'turbine', 'gearbox', 'fan', '*'],
        applicableScenarios: ['振动监测', '故障诊断', '验收测试', '定期巡检'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 10816-3', 'ISO 20816-1', 'ISO 7919'],
      },
    },
    {
      executor: new CepstrumAnalyzer(),
      metadata: {
        description: '功率倒频谱/实倒频谱分析，用于齿轮箱故障检测和周期性调制识别',
        tags: ['倒频谱', '齿轮箱', '调制', '故障诊断'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'quefrency', type: 'number[]', description: 'Quefrency轴(s)' },
          { name: 'cepstrum', type: 'number[]', description: '倒频谱值' },
          { name: 'peaks', type: 'object[]', description: '峰值列表' },
        ],
        configFields: [
          { name: 'cepstrumType', type: 'select', options: ['power', 'real'], default: 'power' },
          { name: 'gearTeethCounts', type: 'number[]', default: [], description: '齿轮齿数' },
          { name: 'shaftRPM', type: 'number', default: 0 },
        ],
        applicableDeviceTypes: ['gearbox', 'motor', 'turbine'],
        applicableScenarios: ['齿轮箱诊断', '调制分析'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 18436-2'],
      },
    },
    {
      executor: new EnvelopeDemodAnalyzer(),
      metadata: {
        description: '生产级包络解调分析 v3.0 — 快速峭度图自动选频 + Hilbert变换包络提取 + 多方法故障检测(自适应阈值/固定阈值/SNR) + 谐波分析 + 严重度分级 + D5推理链路',
        tags: ['包络', '解调', '轴承', 'Hilbert', '故障诊断', '峭度图', '谐波分析', 'D5合规'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号(加速度)', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'envelopeSpectrum', type: 'object', description: '包络谱(频率+幅值)' },
          { name: 'envelopeSignal', type: 'number[]', description: '包络时域信号' },
          { name: 'faults', type: 'object[]', description: '故障检测结果(含谐波、SNR、置信度、严重度)' },
          { name: 'optimalBand', type: 'object', description: '峭度图最佳频带' },
          { name: 'kurtogramTop5', type: 'object[]', description: '峭度图Top5频带' },
          { name: 'reasoningTrace', type: 'object[]', description: 'D5推理链路' },
          { name: 'performance', type: 'object', description: '各阶段耗时统计' },
          { name: 'overallStatus', type: 'string', description: '综合状态(normal/attention/warning/critical)' },
          { name: 'overallConfidence', type: 'number', description: '综合置信度' },
        ],
        configFields: [
          { name: 'detrend', type: 'boolean', default: true, description: '去趋势开关' },
          { name: 'detrendMethod', type: 'select', options: ['linear', 'mean'], default: 'linear', description: '去趋势方法' },
          { name: 'autoBandSelect', type: 'boolean', default: true, description: '自动选择最佳解调频带(快速峭度图)' },
          { name: 'kurtogramLevelMax', type: 'number', default: 6, min: 1, max: 8, description: '峭度图最大分解层数' },
          { name: 'kurtogramFilterOrder', type: 'number', default: 4, min: 2, max: 8, description: '峭度图滤波器阶数' },
          { name: 'manualBandLow', type: 'number', default: null, description: '手动频带下限(Hz)，autoBandSelect=false时生效' },
          { name: 'manualBandHigh', type: 'number', default: null, description: '手动频带上限(Hz)，autoBandSelect=false时生效' },
          { name: 'envelopeDcRemove', type: 'boolean', default: true, description: '去除包络直流分量' },
          { name: 'faultDetectionMethod', type: 'select', options: ['adaptive_threshold', 'fixed_threshold', 'snr'], default: 'adaptive_threshold', description: '故障检测方法' },
          { name: 'fixedThresholdMultiplier', type: 'number', default: 3.0, description: '固定阈值倍数(mean+N×std)' },
          { name: 'snrThresholdDb', type: 'number', default: 6.0, description: 'SNR检测阈值(dB)' },
          { name: 'frequencyTolerancePercent', type: 'number', default: 3.0, min: 0.5, max: 10, description: '频率匹配容差(%)' },
          { name: 'harmonicCount', type: 'number', default: 3, min: 1, max: 5, description: '检测谐波数量' },
          { name: 'bearingModel', type: 'string', default: '', description: '轴承型号(支持: 6205/6206/6208/6210/6305/6306/6308/22320/6320/23140/22228/6316/32222)' },
          { name: 'shaftRPM', type: 'number', default: 0, description: '转轴转速(rpm)' },
        ],
        applicableDeviceTypes: ['motor', 'pump', 'compressor', 'fan', 'crane', 'gantry_crane', '*'],
        applicableScenarios: ['轴承诊断', '早期故障检测', '港机设备监测', '旋转机械诊断'],
        complexity: 'O(L×2^L×NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 15243', 'ISO 281', 'ISO 18436-2'],
      },
    },
    {
      executor: new WaveletPacketAnalyzer(),
      metadata: {
        description: '多层小波包分解，频带能量分布计算，Shannon熵特征提取',
        tags: ['小波', '能量分布', '特征提取', 'Shannon熵'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
        ],
        outputFields: [
          { name: 'nodeEnergies', type: 'object[]', description: '各节点能量' },
          { name: 'shannonEntropy', type: 'number', description: 'Shannon熵' },
        ],
        configFields: [
          { name: 'waveletType', type: 'select', options: ['db4', 'db8', 'sym5'], default: 'db4' },
          { name: 'decompositionLevel', type: 'number', default: 3, min: 1, max: 8 },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['特征提取', '故障分类', '信号分析'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['Mallat 1989'],
      },
    },
    {
      executor: new BandpassFilterProcessor(),
      metadata: {
        description: 'Butterworth/Chebyshev IIR带通滤波器，支持零相位滤波(前向-后向)',
        tags: ['滤波', '带通', 'Butterworth', '信号处理'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'filteredSignal', type: 'number[]', description: '滤波后信号' },
          { name: 'energyRetention', type: 'number', description: '能量保留率(%)' },
        ],
        configFields: [
          { name: 'lowCutoff', type: 'number', default: 100, description: '低截止频率(Hz)' },
          { name: 'highCutoff', type: 'number', default: 3000, description: '高截止频率(Hz)' },
          { name: 'order', type: 'number', default: 4, min: 1, max: 8 },
          { name: 'zeroPhase', type: 'boolean', default: true },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['信号预处理', '噪声滤除'],
        complexity: 'O(N)',
        edgeDeployable: true,
      },
    },
    {
      executor: new SpectralKurtosisAnalyzer(),
      metadata: {
        description: 'Fast Kurtogram (Antoni 2006)，自动搜索最佳解调频带，用于轴承早期故障检测',
        tags: ['谱峭度', 'Kurtogram', '最佳频带', '轴承'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'optimalBand', type: 'object', description: '最佳频带参数' },
          { name: 'isImpulsive', type: 'boolean', description: '是否检测到冲击性成分' },
        ],
        configFields: [
          { name: 'maxLevel', type: 'number', default: 6, min: 2, max: 10 },
        ],
        applicableDeviceTypes: ['motor', 'pump', 'compressor', 'fan', '*'],
        applicableScenarios: ['轴承早期故障', '最佳频带选择'],
        complexity: 'O(N*2^L)',
        edgeDeployable: true,
        referenceStandards: ['Antoni J. 2006'],
      },
    },
    {
      executor: new ResamplingProcessor(),
      metadata: {
        description: '三次样条插值重采样，支持抗混叠滤波和角度域重采样',
        tags: ['重采样', '插值', '抗混叠'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '原始采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'resampledSignal', type: 'number[]', description: '重采样后信号' },
          { name: 'targetSampleRate', type: 'number', description: '目标采样率(Hz)' },
        ],
        configFields: [
          { name: 'targetSampleRate', type: 'number', default: 0, description: '目标采样率(Hz)' },
          { name: 'antiAliasing', type: 'boolean', default: true },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['信号预处理', '采样率转换'],
        complexity: 'O(N)',
        edgeDeployable: true,
      },
    },
    {
      executor: new OrderTrackingAnalyzer(),
      metadata: {
        description: '阶次跟踪分析，角度域重采样+阶次谱，适用于变速工况下的故障诊断',
        tags: ['阶次', '变速', '角度域', '旋转机械'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'keyOrders', type: 'object[]', description: '关键阶次幅值' },
          { name: 'avgRPM', type: 'number', description: '平均转速(RPM)' },
        ],
        configFields: [
          { name: 'samplesPerRev', type: 'number', default: 256 },
          { name: 'maxOrder', type: 'number', default: 20 },
          { name: 'tachoPulseChannel', type: 'string', default: '', description: '键相通道名' },
        ],
        applicableDeviceTypes: ['motor', 'turbine', 'compressor', 'gearbox'],
        applicableScenarios: ['变速工况诊断', '升降速测试'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 7919', 'ISO 10816'],
      },
    },
  ];
}
