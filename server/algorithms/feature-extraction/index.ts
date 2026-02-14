/**
 * 特征提取算法模块 — 5个工业级实现
 *
 * 1. 时域特征提取 — 统计特征 + Burg AR + 波形因子（ISO 10816）
 * 2. 频域特征提取 — FFT频谱 + 频带能量比 + 谱熵/谱峭度
 * 3. 时频域特征提取 — STFT + 瞬时频率 + 谱通量
 * 4. 统计特征提取 — 高阶统计量 + 样本熵/近似熵 + Higuchi分形 + Hurst + 排列熵
 * 5. 深度特征提取 — PCA(幂迭代) / 线性自编码器(梯度下降)
 *
 * confidence全部基于数据质量计算（非硬编码）
 * 所有随机初始化使用确定性种子
 */

import type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import * as dsp from '../../algorithms/_core/dsp';

class PRNG {
  private s: number;
  constructor(seed: number) { this.s = seed & 0x7fffffff; }
  next(): number { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; }
}

function createOutput(
  algorithmId: string, version: string, _input: AlgorithmInput,
  config: Record<string, any>, startTime: number,
  diagnosis: AlgorithmOutput['diagnosis'], results: Record<string, any>,
  visualizations?: AlgorithmOutput['visualizations']
): AlgorithmOutput {
  return {
    algorithmId, status: 'completed', diagnosis, results, visualizations,
    metadata: {
      executionTimeMs: Date.now() - startTime,
      inputDataPoints: results._n || 0,
      algorithmVersion: version,
      parameters: config,
    },
  };
}

function getSignalData(input: AlgorithmInput): number[] {
  if (Array.isArray(input.data)) {
    return Array.isArray(input.data[0]) ? (input.data as number[][])[0] : input.data as number[];
  }
  const keys = Object.keys(input.data);
  return keys.length > 0 ? (input.data as Record<string, number[]>)[keys[0]] : [];
}

// 信号质量评估 → confidence
function signalQuality(sig: number[]): number {
  if (sig.length < 10) return 0.3;
  const mu = dsp.mean(sig), sd = dsp.standardDeviation(sig);
  // SNR估计: 信号功率 / 高频噪声功率
  const diff = sig.slice(1).map((v, i) => v - sig[i]);
  const noisePower = diff.reduce((s, d) => s + d * d, 0) / diff.length;
  const sigPower = sd * sd;
  const snr = sigPower / (noisePower + 1e-15);
  // 数据量充足度
  const lenScore = Math.min(1, sig.length / 1000);
  // 动态范围
  const range = Math.max(...sig) - Math.min(...sig);
  const dynScore = range > 1e-10 ? Math.min(1, Math.log10(range / (sd + 1e-15) + 1) / 2) : 0.3;
  return Math.min(0.99, Math.max(0.3, 0.3 + snr / (snr + 1) * 0.3 + lenScore * 0.2 + dynScore * 0.2));
}

// ============================================================
// 1. 时域特征提取
// ============================================================

export class TimeDomainFeatureExtractor implements IAlgorithmExecutor {
  readonly id = 'time_domain_features';
  readonly name = '时域特征提取';
  readonly version = '2.1.0';
  readonly category = 'feature_extraction';

  getDefaultConfig() {
    return { arOrder: 10, segmentLength: 0, overlap: 0.5 };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (s.length < 32) return { valid: false, errors: ['信号至少32点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sig = getSignalData(input);
    const n = sig.length;

    const mu = dsp.mean(sig), sd = dsp.standardDeviation(sig), r = dsp.rms(sig);
    const mx = Math.max(...sig), mn = Math.min(...sig), pp = mx - mn;
    const absSig = sig.map(Math.abs), absMu = dsp.mean(absSig);

    // 波形指标
    const shapeFactor = r / (absMu || 1e-10);
    const crestFactor = mx / (r || 1e-10);
    const impulseFactor = mx / (absMu || 1e-10);
    const sqrtMean = dsp.mean(absSig.map(Math.sqrt));
    const clearanceFactor = mx / (sqrtMean * sqrtMean || 1e-10);

    // 高阶统计量
    const skewness = sd > 1e-10 ? sig.reduce((s, x) => s + Math.pow((x - mu) / sd, 3), 0) / n : 0;
    const kurtosis = sd > 1e-10 ? sig.reduce((s, x) => s + Math.pow((x - mu) / sd, 4), 0) / n : 0;

    // Burg AR
    const arCoeffs = this.burgAR(sig, cfg.arOrder);

    // 过零率
    let zc = 0;
    for (let i = 1; i < n; i++) if ((sig[i] >= 0) !== (sig[i - 1] >= 0)) zc++;
    const zcr = zc / (n - 1);

    const confidence = signalQuality(sig);

    const features: Record<string, any> = {
      _n: n, mean: mu, std: sd, rms: r, max: mx, min: mn, peakToPeak: pp,
      absMean: absMu, shapeFactor, crestFactor, impulseFactor, clearanceFactor,
      skewness, kurtosis, zeroCrossingRate: zcr, arCoefficients: arCoeffs,
    };

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `时域特征: RMS=${r.toFixed(4)}, 峰值因子=${crestFactor.toFixed(2)}, 峭度=${kurtosis.toFixed(2)}, 波形因子=${shapeFactor.toFixed(2)}, AR阶=${cfg.arOrder}`,
      severity: kurtosis > 6 ? 'warning' : kurtosis > 4 ? 'attention' : 'normal',
      urgency: 'monitoring',
      confidence,
      referenceStandard: 'ISO 10816 / ISO 13373',
    }, features);
  }

  private burgAR(sig: number[], order: number): number[] {
    const n = sig.length;
    const coeffs = new Array(order).fill(0);
    let ef = [...sig], eb = [...sig];
    for (let k = 0; k < order; k++) {
      let num = 0, den = 0;
      for (let i = k + 1; i < n; i++) { num += ef[i] * eb[i - 1]; den += ef[i] * ef[i] + eb[i - 1] * eb[i - 1]; }
      const ak = -2 * num / (den || 1e-10);
      coeffs[k] = ak;
      const nef = new Array(n).fill(0), neb = new Array(n).fill(0);
      for (let i = k + 1; i < n; i++) { nef[i] = ef[i] + ak * eb[i - 1]; neb[i] = eb[i - 1] + ak * ef[i]; }
      ef = nef; eb = neb;
    }
    return coeffs;
  }
}

// ============================================================
// 2. 频域特征提取
// ============================================================

export class FrequencyDomainFeatureExtractor implements IAlgorithmExecutor {
  readonly id = 'frequency_domain_features';
  readonly name = '频域特征提取';
  readonly version = '2.1.0';
  readonly category = 'feature_extraction';

  getDefaultConfig() {
    return { sampleRate: 1000, nfft: 0, windowType: 'hanning', frequencyBands: [] as number[][] };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (s.length < 64) return { valid: false, errors: ['信号至少64点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sig = getSignalData(input);
    const fs = cfg.sampleRate;

    const nfft = cfg.nfft || dsp.nextPowerOf2(sig.length);
    const windowed = dsp.applyWindow(sig, cfg.windowType as dsp.WindowFunction);
    const padded = new Array(nfft).fill(0);
    for (let i = 0; i < windowed.length; i++) padded[i] = windowed[i];

    const fftR = dsp.fft(padded);
    const halfN = Math.floor(nfft / 2);
    const mag = new Array(halfN), freqs = new Array(halfN);
    for (let i = 0; i < halfN; i++) {
      mag[i] = Math.sqrt(fftR[i].re ** 2 + fftR[i].im ** 2) / nfft;
      freqs[i] = i * fs / nfft;
    }

    const psd = mag.map((m: number) => m * m);
    const tp = psd.reduce((s: number, p: number) => s + p, 0);

    const fc = psd.reduce((s: number, p: number, i: number) => s + p * freqs[i], 0) / (tp || 1e-10);
    const rmsf = Math.sqrt(psd.reduce((s: number, p: number, i: number) => s + p * freqs[i] * freqs[i], 0) / (tp || 1e-10));
    const vf = psd.reduce((s: number, p: number, i: number) => s + p * (freqs[i] - fc) ** 2, 0) / (tp || 1e-10);
    const spectralStd = Math.sqrt(vf);

    const bands = cfg.frequencyBands.length > 0 ? cfg.frequencyBands
      : [[0, fs / 8], [fs / 8, fs / 4], [fs / 4, 3 * fs / 8], [3 * fs / 8, fs / 2]];
    const bandEnergies = bands.map(([fL, fH]: number[]) => {
      let e = 0;
      for (let i = 0; i < halfN; i++) if (freqs[i] >= fL && freqs[i] < fH) e += psd[i];
      return { band: `${fL.toFixed(0)}-${fH.toFixed(0)}Hz`, energy: e, ratio: e / (tp || 1e-10) };
    });

    const spectralKurtosis = psd.reduce((s: number, p: number, i: number) => s + p * Math.pow(freqs[i] - fc, 4), 0) / (tp * vf * vf || 1e-10);
    const psdN = psd.map((p: number) => p / (tp || 1e-10));
    const spectralEntropy = -psdN.reduce((s: number, p: number) => p > 0 ? s + p * Math.log2(p) : s, 0);
    const peakIdx = psd.indexOf(Math.max(...psd));
    const peakFreq = freqs[peakIdx];

    const confidence = signalQuality(sig);

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `频域特征: 重心=${fc.toFixed(1)}Hz, 峰值=${peakFreq.toFixed(1)}Hz, 谱熵=${spectralEntropy.toFixed(2)}, 谱峭度=${spectralKurtosis.toFixed(2)}`,
      severity: 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'ISO 13373 / ISO 7919',
    }, {
      _n: sig.length, centroidFrequency: fc, rmsFrequency: rmsf, spectralStd,
      spectralKurtosis, spectralEntropy, peakFrequency: peakFreq, totalPower: tp, bandEnergies,
    });
  }
}

// ============================================================
// 3. 时频域特征提取
// ============================================================

export class TimeFrequencyFeatureExtractor implements IAlgorithmExecutor {
  readonly id = 'time_frequency_features';
  readonly name = '时频域特征提取';
  readonly version = '2.1.0';
  readonly category = 'feature_extraction';

  getDefaultConfig() {
    return { sampleRate: 1000, stftWindowSize: 256, stftOverlap: 0.75, waveletScales: 32 };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (s.length < 256) return { valid: false, errors: ['信号至少256点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sig = getSignalData(input);
    const fs = cfg.sampleRate;
    const ws = cfg.stftWindowSize;
    const hop = Math.floor(ws * (1 - cfg.stftOverlap));
    const nFrames = Math.floor((sig.length - ws) / hop) + 1;
    const nfft = dsp.nextPowerOf2(ws);
    const halfN = Math.floor(nfft / 2);

    const instFreqs: number[] = [], spectralFlux: number[] = [];
    let prevMag: number[] | null = null;

    for (let f = 0; f < nFrames; f++) {
      const start = f * hop;
      const frame = sig.slice(start, start + ws);
      const w = dsp.applyWindow(frame, 'hanning');
      const padded = new Array(nfft).fill(0);
      for (let i = 0; i < w.length; i++) padded[i] = w[i];
      const fftR = dsp.fft(padded);
      const m = new Array(halfN);
      for (let i = 0; i < halfN; i++) m[i] = Math.sqrt(fftR[i].re ** 2 + fftR[i].im ** 2);

      const tp = m.reduce((s: number, v: number) => s + v * v, 0);
      instFreqs.push(m.reduce((s: number, v: number, i: number) => s + v * v * i * fs / nfft, 0) / (tp || 1e-10));

      if (prevMag) {
        spectralFlux.push(Math.sqrt(m.reduce((s: number, v: number, i: number) => s + Math.max(0, v - prevMag![i]) ** 2, 0)));
      }
      prevMag = m;
    }

    const muIF = dsp.mean(instFreqs), sdIF = dsp.standardDeviation(instFreqs);
    const muFlux = spectralFlux.length > 0 ? dsp.mean(spectralFlux) : 0;
    const frameE = instFreqs.map((_, i) => {
      const start = i * hop;
      const frame = sig.slice(start, start + ws);
      return frame.reduce((s, v) => s + v * v, 0) / ws;
    });
    const eVar = dsp.standardDeviation(frameE) / (dsp.mean(frameE) || 1e-10);

    const confidence = signalQuality(sig);

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `时频域: ${nFrames}帧, 平均瞬时频率=${muIF.toFixed(1)}Hz, 频率变化=${sdIF.toFixed(1)}Hz, 能量变异=${eVar.toFixed(3)}`,
      severity: eVar > 0.5 ? 'warning' : 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'Cohen 1995 / Mallat 2008',
    }, {
      _n: sig.length, instantFrequencies: instFreqs, meanInstantFrequency: muIF,
      stdInstantFrequency: sdIF, spectralFlux, meanSpectralFlux: muFlux,
      energyVariation: eVar, nFrames,
    });
  }
}

// ============================================================
// 4. 统计特征提取
// ============================================================

export class StatisticalFeatureExtractor implements IAlgorithmExecutor {
  readonly id = 'statistical_features';
  readonly name = '统计特征提取';
  readonly version = '2.1.0';
  readonly category = 'feature_extraction';

  getDefaultConfig() {
    return { embeddingDimension: 5, embeddingDelay: 1 };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (s.length < 100) return { valid: false, errors: ['信号至少100点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sig = getSignalData(input);
    const n = sig.length, mu = dsp.mean(sig), sd = dsp.standardDeviation(sig);

    const skewness = sd > 1e-10 ? sig.reduce((s, x) => s + Math.pow((x - mu) / sd, 3), 0) / n : 0;
    const kurtosis = sd > 1e-10 ? sig.reduce((s, x) => s + Math.pow((x - mu) / sd, 4), 0) / n : 0;
    const moment5 = sd > 1e-10 ? sig.reduce((s, x) => s + Math.pow((x - mu) / sd, 5), 0) / n : 0;
    const moment6 = sd > 1e-10 ? sig.reduce((s, x) => s + Math.pow((x - mu) / sd, 6), 0) / n : 0;

    // Shannon熵
    const bins = 50, mnV = Math.min(...sig), mxV = Math.max(...sig), bw = (mxV - mnV) / bins || 1;
    const hist = new Array(bins).fill(0);
    for (const x of sig) hist[Math.min(bins - 1, Math.floor((x - mnV) / bw))]++;
    const shannonEntropy = -hist.reduce((s, c) => { const p = c / n; return p > 0 ? s + p * Math.log2(p) : s; }, 0);

    const sampleEntropy = this.sampleEntropy(sig, 2, 0.2 * sd);
    const approxEntropy = this.approxEntropy(sig, 2, 0.2 * sd);
    const higuchiFD = this.higuchiFD(sig, 10);
    const hurst = this.hurst(sig);
    const permEntropy = this.permEntropy(sig, 3, 1);

    const confidence = signalQuality(sig);

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `统计特征: 峭度=${kurtosis.toFixed(2)}, Shannon熵=${shannonEntropy.toFixed(3)}, 样本熵=${sampleEntropy.toFixed(3)}, 分形维数=${higuchiFD.toFixed(3)}, Hurst=${hurst.toFixed(3)}`,
      severity: kurtosis > 6 ? 'warning' : 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'Richman & Moorman 2000 / Higuchi 1988',
    }, {
      _n: n, skewness, kurtosis, moment5, moment6, shannonEntropy, sampleEntropy,
      approxEntropy, higuchiFractalDimension: higuchiFD, hurstExponent: hurst,
      permutationEntropy: permEntropy,
    });
  }

  private sampleEntropy(x: number[], m: number, r: number): number {
    const n = Math.min(x.length, 1000);
    let A = 0, B = 0;
    for (let i = 0; i < n - m; i++) {
      for (let j = i + 1; j < n - m; j++) {
        let ok = true;
        for (let k = 0; k < m; k++) if (Math.abs(x[i + k] - x[j + k]) > r) { ok = false; break; }
        if (ok) { B++; if (i + m < n && j + m < n && Math.abs(x[i + m] - x[j + m]) <= r) A++; }
      }
    }
    return B > 0 ? -Math.log((A || 1) / B) : 0;
  }

  private approxEntropy(x: number[], m: number, r: number): number {
    const n = Math.min(x.length, 1000);
    const phi = (dim: number) => {
      let cnt = 0;
      for (let i = 0; i <= n - dim; i++) {
        let ci = 0;
        for (let j = 0; j <= n - dim; j++) {
          let ok = true;
          for (let k = 0; k < dim; k++) if (Math.abs(x[i + k] - x[j + k]) > r) { ok = false; break; }
          if (ok) ci++;
        }
        cnt += Math.log(ci / (n - dim + 1));
      }
      return cnt / (n - dim + 1);
    };
    return phi(m) - phi(m + 1);
  }

  private higuchiFD(x: number[], kMax: number): number {
    const n = x.length, lnK: number[] = [], lnL: number[] = [];
    for (let k = 1; k <= kMax; k++) {
      let sL = 0;
      for (let m = 1; m <= k; m++) {
        let len = 0;
        const maxI = Math.floor((n - m) / k);
        for (let i = 1; i <= maxI; i++) len += Math.abs(x[m - 1 + i * k] - x[m - 1 + (i - 1) * k]);
        len = len * (n - 1) / (k * maxI * k);
        sL += len;
      }
      lnK.push(Math.log(1 / k)); lnL.push(Math.log(sL / k));
    }
    const mX = dsp.mean(lnK), mY = dsp.mean(lnL);
    let num = 0, den = 0;
    for (let i = 0; i < lnK.length; i++) { num += (lnK[i] - mX) * (lnL[i] - mY); den += (lnK[i] - mX) ** 2; }
    return den > 0 ? num / den : 1;
  }

  private hurst(x: number[]): number {
    const n = x.length, sizes: number[] = [];
    for (let s = 10; s <= n / 2; s = Math.floor(s * 1.5)) sizes.push(s);
    if (sizes.length < 3) return 0.5;
    const lnN: number[] = [], lnRS: number[] = [];
    for (const sz of sizes) {
      const nb = Math.floor(n / sz);
      let tRS = 0;
      for (let b = 0; b < nb; b++) {
        const blk = x.slice(b * sz, (b + 1) * sz);
        const m = dsp.mean(blk);
        const cd = blk.map((_, i) => blk.slice(0, i + 1).reduce((s, v) => s + (v - m), 0));
        const R = Math.max(...cd) - Math.min(...cd), S = dsp.standardDeviation(blk);
        if (S > 0) tRS += R / S;
      }
      if (nb > 0) { lnN.push(Math.log(sz)); lnRS.push(Math.log(tRS / nb)); }
    }
    const mX = dsp.mean(lnN), mY = dsp.mean(lnRS);
    let num = 0, den = 0;
    for (let i = 0; i < lnN.length; i++) { num += (lnN[i] - mX) * (lnRS[i] - mY); den += (lnN[i] - mX) ** 2; }
    return den > 0 ? num / den : 0.5;
  }

  private permEntropy(x: number[], order: number, delay: number): number {
    const n = x.length, pats = new Map<string, number>(), total = n - (order - 1) * delay;
    for (let i = 0; i < total; i++) {
      const idx = Array.from({ length: order }, (_, k) => k);
      idx.sort((a, b) => x[i + a * delay] - x[i + b * delay]);
      const key = idx.join(',');
      pats.set(key, (pats.get(key) || 0) + 1);
    }
    let ent = 0;
    for (const c of Array.from(pats.values())) { const p = c / total; if (p > 0) ent -= p * Math.log2(p); }
    return ent;
  }
}

// ============================================================
// 5. 深度特征提取 — PCA / 线性自编码器
// ============================================================

export class DeepFeatureExtractor implements IAlgorithmExecutor {
  readonly id = 'deep_features';
  readonly name = '深度特征提取';
  readonly version = '2.1.0';
  readonly category = 'feature_extraction';

  getDefaultConfig() {
    return { method: 'pca', latentDim: 16, epochs: 50, pcaComponents: 10, seed: 42 };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    if (typeof input.data !== 'object') return { valid: false, errors: ['需要特征矩阵'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };

    let matrix: number[][];
    if (Array.isArray(input.data) && Array.isArray(input.data[0])) {
      matrix = input.data as number[][];
    } else if (typeof input.data === 'object' && !Array.isArray(input.data)) {
      const cols = Object.values(input.data as Record<string, number[]>);
      const n = Math.min(...cols.map(c => c.length));
      matrix = Array.from({ length: n }, (_, i) => cols.map(c => c[i]));
    } else {
      matrix = [getSignalData(input)];
    }

    return cfg.method === 'pca' ? this.pca(matrix, cfg, input, t0) : this.autoencoder(matrix, cfg, input, t0);
  }

  private pca(matrix: number[][], cfg: any, input: AlgorithmInput, t0: number): AlgorithmOutput {
    const n = matrix.length, d = matrix[0]?.length || 0, k = Math.min(cfg.pcaComponents, d);
    const rng = new PRNG(cfg.seed);

    const means = Array.from({ length: d }, (_, j) => dsp.mean(matrix.map(r => r[j])));
    const stds = Array.from({ length: d }, (_, j) => dsp.standardDeviation(matrix.map(r => r[j])));
    const norm = matrix.map(r => r.map((v, j) => (v - means[j]) / (stds[j] || 1)));

    // 协方差矩阵
    const cov: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < d; i++) for (let j = i; j < d; j++) {
      let s = 0; for (let r = 0; r < n; r++) s += norm[r][i] * norm[r][j];
      cov[i][j] = s / (n - 1); cov[j][i] = cov[i][j];
    }

    // 幂迭代 + deflation
    const eigenvalues: number[] = [], eigenvectors: number[][] = [];
    const cc = cov.map(r => [...r]);
    for (let comp = 0; comp < k; comp++) {
      let v = Array.from({ length: d }, () => rng.next() * 2 - 1);
      let ev = 0;
      for (let iter = 0; iter < 200; iter++) {
        const nv = new Array(d).fill(0);
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) nv[i] += cc[i][j] * v[j];
        ev = Math.sqrt(nv.reduce((s, vi) => s + vi * vi, 0));
        if (ev > 0) v = nv.map(vi => vi / ev);
      }
      eigenvalues.push(ev); eigenvectors.push(v);
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cc[i][j] -= ev * v[i] * v[j];
    }

    const projected = norm.map(r => eigenvectors.map(ev => r.reduce((s, v, j) => s + v * ev[j], 0)));
    const totalVar = eigenvalues.reduce((s, v) => s + v, 0);
    const explRatio = eigenvalues.map(v => v / (totalVar || 1));
    const cumRatio: number[] = [];
    explRatio.reduce((a, r) => { const c = a + r; cumRatio.push(c); return c; }, 0);

    const confidence = cumRatio[k - 1] || 0.5;

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `PCA: ${d}维→${k}维, 累计方差=${(confidence * 100).toFixed(1)}%, 前3: ${explRatio.slice(0, 3).map(r => (r * 100).toFixed(1) + '%').join(', ')}`,
      severity: 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'Pearson 1901 / Hotelling 1933',
    }, {
      _n: n, projected: projected.slice(0, 1000), eigenvalues, explainedVarianceRatio: explRatio,
      cumulativeVarianceRatio: cumRatio, components: k, originalDimensions: d,
    });
  }

  private autoencoder(matrix: number[][], cfg: any, input: AlgorithmInput, t0: number): AlgorithmOutput {
    const n = matrix.length, d = matrix[0]?.length || 1, lat = Math.min(cfg.latentDim, d);
    const rng = new PRNG(cfg.seed);
    const sc = Math.sqrt(2.0 / (d + lat));

    const means = Array.from({ length: d }, (_, j) => dsp.mean(matrix.map(r => r[j] || 0)));
    const stds = Array.from({ length: d }, (_, j) => dsp.standardDeviation(matrix.map(r => r[j] || 0)));
    const norm = matrix.map(r => r.map((v, j) => (v - means[j]) / (stds[j] || 1)));

    const We: number[][] = Array.from({ length: d }, () => Array.from({ length: lat }, () => (rng.next() * 2 - 1) * sc));
    const Wd: number[][] = Array.from({ length: lat }, () => Array.from({ length: d }, () => (rng.next() * 2 - 1) * sc));

    const lr = 0.001, lH: number[] = [];
    for (let ep = 0; ep < cfg.epochs; ep++) {
      let tl = 0;
      for (const x of norm) {
        const z = new Array(lat).fill(0);
        for (let j = 0; j < lat; j++) for (let i = 0; i < d; i++) z[j] += x[i] * We[i][j];
        const xH = new Array(d).fill(0);
        for (let i = 0; i < d; i++) for (let j = 0; j < lat; j++) xH[i] += z[j] * Wd[j][i];
        const err = x.map((xi, i) => xi - xH[i]);
        tl += err.reduce((s, e) => s + e * e, 0) / d;
        for (let j = 0; j < lat; j++) for (let i = 0; i < d; i++) {
          Wd[j][i] -= lr * (-2 * err[i] * z[j] / d);
          We[i][j] -= lr * (-2 * err.reduce((s, e, k) => s + e * Wd[j][k], 0) * x[i] / d);
        }
      }
      lH.push(tl / n);
    }

    const encoded = norm.map(x => {
      const z = new Array(lat).fill(0);
      for (let j = 0; j < lat; j++) for (let i = 0; i < d; i++) z[j] += x[i] * We[i][j];
      return z;
    });

    const reErr = norm.map((x, idx) => {
      const z = encoded[idx];
      const xH = new Array(d).fill(0);
      for (let i = 0; i < d; i++) for (let j = 0; j < lat; j++) xH[i] += z[j] * Wd[j][i];
      return Math.sqrt(x.reduce((s, xi, i) => s + (xi - xH[i]) ** 2, 0) / d);
    });

    const convergence = lH.length > 1 ? Math.min(1, 1 - lH[lH.length - 1] / Math.max(lH[0], 1e-10)) : 0.5;
    const confidence = Math.min(0.99, Math.max(0.3, convergence));

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `自编码器: ${d}维→${lat}维, 最终损失=${lH[lH.length - 1]?.toFixed(4)}, 收敛=${(convergence * 100).toFixed(1)}%`,
      severity: 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'Hinton & Salakhutdinov 2006',
    }, {
      _n: n, encoded: encoded.slice(0, 1000), reconstructionErrors: reErr.slice(0, 1000),
      lossHistory: lH, latentDimension: lat, originalDimensions: d,
    });
  }
}

// ============================================================
// 导出
// ============================================================

export function getFeatureExtractionAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new TimeDomainFeatureExtractor(),
      metadata: {
        description: '时域特征提取：RMS、波形因子、峰值因子、峭度、Burg AR系数',
        tags: ['时域', '特征提取', 'RMS', '峭度', 'AR'],
        inputFields: [{ name: 'data', type: 'number[]', description: '时域信号', required: true }],
        outputFields: [
          { name: 'rms', type: 'number', description: 'RMS值' },
          { name: 'kurtosis', type: 'number', description: '峭度' },
          { name: 'crestFactor', type: 'number', description: '峰值因子' },
          { name: 'arCoefficients', type: 'number[]', description: 'AR系数' },
        ],
        configFields: [{ name: 'arOrder', type: 'number', default: 10, description: 'AR阶数' }],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['振动分析', '状态监测', '故障诊断'],
        complexity: 'O(N)', edgeDeployable: true,
        referenceStandards: ['ISO 10816', 'ISO 13373'],
      },
    },
    {
      executor: new FrequencyDomainFeatureExtractor(),
      metadata: {
        description: '频域特征提取：重心频率、谱熵、谱峭度、频带能量比',
        tags: ['频域', 'FFT', '频谱', '特征提取'],
        inputFields: [{ name: 'data', type: 'number[]', description: '时域信号', required: true }],
        outputFields: [
          { name: 'centroidFrequency', type: 'number', description: '重心频率' },
          { name: 'spectralEntropy', type: 'number', description: '谱熵' },
          { name: 'bandEnergies', type: 'object[]', description: '频带能量' },
        ],
        configFields: [
          { name: 'sampleRate', type: 'number', default: 1000, description: '采样率Hz' },
          { name: 'frequencyBands', type: 'json', default: [], description: '自定义频带' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['频谱分析', '故障特征提取'],
        complexity: 'O(NlogN)', edgeDeployable: true,
        referenceStandards: ['ISO 13373', 'ISO 7919'],
      },
    },
    {
      executor: new TimeFrequencyFeatureExtractor(),
      metadata: {
        description: '时频域特征提取：STFT、瞬时频率、谱通量、能量时变',
        tags: ['时频', 'STFT', '瞬时频率'],
        inputFields: [{ name: 'data', type: 'number[]', description: '时域信号', required: true }],
        outputFields: [
          { name: 'meanInstantFrequency', type: 'number', description: '平均瞬时频率' },
          { name: 'energyVariation', type: 'number', description: '能量变异系数' },
        ],
        configFields: [
          { name: 'sampleRate', type: 'number', default: 1000, description: '采样率Hz' },
          { name: 'stftWindowSize', type: 'number', default: 256, description: 'STFT窗长' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['非平稳信号', '变速工况'],
        complexity: 'O(N*W*logW)', edgeDeployable: true,
        referenceStandards: ['Cohen 1995', 'Mallat 2008'],
      },
    },
    {
      executor: new StatisticalFeatureExtractor(),
      metadata: {
        description: '统计特征提取：高阶统计量、Shannon/样本/近似/排列熵、Higuchi分形、Hurst指数',
        tags: ['统计', '熵', '分形', 'Hurst'],
        inputFields: [{ name: 'data', type: 'number[]', description: '时域信号', required: true }],
        outputFields: [
          { name: 'shannonEntropy', type: 'number', description: 'Shannon熵' },
          { name: 'sampleEntropy', type: 'number', description: '样本熵' },
          { name: 'higuchiFractalDimension', type: 'number', description: 'Higuchi分形维数' },
          { name: 'hurstExponent', type: 'number', description: 'Hurst指数' },
        ],
        configFields: [],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['复杂度分析', '非线性分析', '早期故障'],
        complexity: 'O(N^2)', edgeDeployable: true,
        referenceStandards: ['Richman & Moorman 2000', 'Higuchi 1988'],
      },
    },
    {
      executor: new DeepFeatureExtractor(),
      metadata: {
        description: '深度特征提取：PCA(幂迭代)/线性自编码器(梯度下降)降维',
        tags: ['PCA', '自编码器', '降维'],
        inputFields: [{ name: 'data', type: 'number[][]', description: '特征矩阵', required: true }],
        outputFields: [
          { name: 'encoded', type: 'number[][]', description: '降维特征' },
          { name: 'reconstructionErrors', type: 'number[]', description: '重构误差' },
        ],
        configFields: [
          { name: 'method', type: 'select', options: ['pca', 'autoencoder'], default: 'pca', description: '方法' },
          { name: 'pcaComponents', type: 'number', default: 10, description: 'PCA主成分数' },
          { name: 'latentDim', type: 'number', default: 16, description: '自编码器潜在维度' },
          { name: 'seed', type: 'number', default: 42, description: '随机种子' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['高维压缩', '异常检测', '可视化'],
        complexity: 'O(N*D*K)', edgeDeployable: false,
        referenceStandards: ['Pearson 1901', 'Hinton & Salakhutdinov 2006'],
      },
    },
  ];
}
