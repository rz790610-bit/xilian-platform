/**
 * DSP 工具库 — 数字信号处理基础函数
 * 
 * 提供 FFT/IFFT、窗函数、滤波器、Hilbert变换、统计函数等
 * 所有算法的底层数学计算依赖此模块
 * 
 * 参考标准:
 * - Cooley-Tukey FFT (1965)
 * - ISO 10816/20816 振动评估
 * - IEEE 519 电能质量
 */

// ============================================================
// 1. 复数运算
// ============================================================

export interface Complex {
  re: number;
  im: number;
}

export function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function complexAbs(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}

export function complexPhase(c: Complex): number {
  return Math.atan2(c.im, c.re);
}

export function complexConj(c: Complex): Complex {
  return { re: c.re, im: -c.im };
}

export function complexExp(theta: number): Complex {
  return { re: Math.cos(theta), im: Math.sin(theta) };
}

export function complexLog(c: Complex): Complex {
  return { re: Math.log(complexAbs(c)), im: complexPhase(c) };
}

// ============================================================
// 2. FFT / IFFT (Cooley-Tukey Radix-2)
// ============================================================

/**
 * 将数组长度补齐到2的幂次
 */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * 零填充到指定长度
 */
export function zeroPad(data: number[], length: number): number[] {
  const result = new Array(length).fill(0);
  for (let i = 0; i < Math.min(data.length, length); i++) {
    result[i] = data[i];
  }
  return result;
}

/**
 * Cooley-Tukey FFT (Radix-2, DIT)
 * 输入: 实数数组（自动零填充到2的幂次）
 * 输出: 复数频谱数组
 */
export function fft(input: number[]): Complex[] {
  const N = nextPow2(input.length);
  const data: Complex[] = zeroPad(input, N).map(v => ({ re: v, im: 0 }));
  return fftComplex(data);
}

/**
 * 复数FFT
 */
export function fftComplex(data: Complex[]): Complex[] {
  const N = data.length;
  if (N <= 1) return data;

  // 位反转排列
  const result = bitReverseCopy(data);

  // 蝶形运算
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = -2 * Math.PI / size;
    const wn = complexExp(angle);

    for (let i = 0; i < N; i += size) {
      let w: Complex = { re: 1, im: 0 };
      for (let j = 0; j < halfSize; j++) {
        const u = result[i + j];
        const t = complexMul(w, result[i + j + halfSize]);
        result[i + j] = complexAdd(u, t);
        result[i + j + halfSize] = complexSub(u, t);
        w = complexMul(w, wn);
      }
    }
  }

  return result;
}

/**
 * IFFT (逆快速傅里叶变换)
 */
export function ifft(spectrum: Complex[]): Complex[] {
  const N = spectrum.length;
  // 取共轭
  const conj = spectrum.map(c => complexConj(c));
  // FFT
  const result = fftComplex(conj);
  // 取共轭并除以N
  return result.map(c => ({ re: c.re / N, im: -c.im / N }));
}

/**
 * 位反转排列
 */
function bitReverseCopy(data: Complex[]): Complex[] {
  const N = data.length;
  const result = new Array(N);
  const bits = Math.log2(N);

  for (let i = 0; i < N; i++) {
    let rev = 0;
    let n = i;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | (n & 1);
      n >>= 1;
    }
    result[rev] = { ...data[i] };
  }

  return result;
}

// ============================================================
// 3. 频谱分析工具
// ============================================================

/**
 * 计算幅值谱 (单边)
 * @param signal 时域信号
 * @param sampleRate 采样率 (Hz)
 * @returns { frequencies, amplitudes } 频率轴和幅值
 */
export function amplitudeSpectrum(signal: number[], sampleRate: number): {
  frequencies: number[];
  amplitudes: number[];
} {
  const N = nextPow2(signal.length);
  const spectrum = fft(signal);
  const halfN = Math.floor(N / 2);

  const frequencies = new Array(halfN);
  const amplitudes = new Array(halfN);
  const df = sampleRate / N;

  for (let i = 0; i < halfN; i++) {
    frequencies[i] = i * df;
    amplitudes[i] = (2 * complexAbs(spectrum[i])) / signal.length;
  }
  // DC分量不乘2
  amplitudes[0] /= 2;

  return { frequencies, amplitudes };
}

/**
 * 计算功率谱密度 (PSD)
 * @param signal 时域信号
 * @param sampleRate 采样率 (Hz)
 * @param windowFn 窗函数
 */
export function powerSpectralDensity(
  signal: number[],
  sampleRate: number,
  windowFn: (n: number) => number[] = hanningWindow
): { frequencies: number[]; psd: number[] } {
  const win = windowFn(signal.length);
  const windowed = signal.map((v, i) => v * win[i]);
  const N = nextPow2(windowed.length);
  const spectrum = fft(windowed);
  const halfN = Math.floor(N / 2);

  // 窗函数功率校正
  const winPower = win.reduce((s, w) => s + w * w, 0) / win.length;
  const df = sampleRate / N;

  const frequencies = new Array(halfN);
  const psd = new Array(halfN);

  for (let i = 0; i < halfN; i++) {
    frequencies[i] = i * df;
    const mag = complexAbs(spectrum[i]);
    psd[i] = (2 * mag * mag) / (signal.length * sampleRate * winPower);
  }
  psd[0] /= 2;

  return { frequencies, psd };
}

/**
 * 计算RMS速度值 (mm/s) — 用于 ISO 10816/20816 评估
 */
export function rmsVelocity(
  signal: number[],
  sampleRate: number,
  fLow: number = 10,
  fHigh: number = 1000
): number {
  const { frequencies, amplitudes } = amplitudeSpectrum(signal, sampleRate);
  let sumSq = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= fLow && frequencies[i] <= fHigh) {
      sumSq += amplitudes[i] * amplitudes[i];
    }
  }
  return Math.sqrt(sumSq / 2); // RMS = peak / sqrt(2)
}

// ============================================================
// 4. 窗函数
// ============================================================

export function hanningWindow(N: number): number[] {
  return Array.from({ length: N }, (_, i) => 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1))));
}

export function hammingWindow(N: number): number[] {
  return Array.from({ length: N }, (_, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1)));
}

export function blackmanWindow(N: number): number[] {
  return Array.from({ length: N }, (_, i) =>
    0.42 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (N - 1))
  );
}

export function flatTopWindow(N: number): number[] {
  const a0 = 0.21557895, a1 = 0.41663158, a2 = 0.277263158;
  const a3 = 0.083578947, a4 = 0.006947368;
  return Array.from({ length: N }, (_, i) => {
    const x = 2 * Math.PI * i / (N - 1);
    return a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x) - a3 * Math.cos(3 * x) + a4 * Math.cos(4 * x);
  });
}

export function rectangularWindow(N: number): number[] {
  return new Array(N).fill(1);
}

export function kaiserWindow(N: number, beta: number = 5): number[] {
  const I0beta = besselI0(beta);
  return Array.from({ length: N }, (_, i) => {
    const x = 2 * i / (N - 1) - 1;
    return besselI0(beta * Math.sqrt(1 - x * x)) / I0beta;
  });
}

/** 零阶修正贝塞尔函数 I0 */
function besselI0(x: number): number {
  let sum = 1, term = 1;
  for (let k = 1; k <= 25; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

export type WindowFunction = 'hanning' | 'hamming' | 'blackman' | 'flat-top' | 'rectangular' | 'kaiser';

export function getWindowFunction(name: WindowFunction): (n: number) => number[] {
  switch (name) {
    case 'hanning': return hanningWindow;
    case 'hamming': return hammingWindow;
    case 'blackman': return blackmanWindow;
    case 'flat-top': return flatTopWindow;
    case 'rectangular': return rectangularWindow;
    case 'kaiser': return (n) => kaiserWindow(n, 5);
    default: return hanningWindow;
  }
}

// ============================================================
// 5. 滤波器设计与应用
// ============================================================

export interface FilterCoefficients {
  b: number[];  // 分子系数 (前馈)
  a: number[];  // 分母系数 (反馈)
}

/**
 * Butterworth 低通滤波器设计 (双线性变换法)
 * @param order 滤波器阶数
 * @param cutoffFreq 截止频率 (Hz)
 * @param sampleRate 采样率 (Hz)
 */
export function butterworthLowpass(order: number, cutoffFreq: number, sampleRate: number): FilterCoefficients {
  const wc = Math.tan(Math.PI * cutoffFreq / sampleRate);
  // 简化实现: 2阶级联 (Biquad sections)
  if (order <= 2) {
    const k = wc;
    const k2 = k * k;
    const sqrt2 = Math.sqrt(2);
    const norm = 1 / (1 + sqrt2 * k + k2);
    return {
      b: [k2 * norm, 2 * k2 * norm, k2 * norm],
      a: [1, 2 * (k2 - 1) * norm, (1 - sqrt2 * k + k2) * norm],
    };
  }
  // 高阶: 级联二阶节
  let result: FilterCoefficients = { b: [1], a: [1] };
  const sections = Math.floor(order / 2);
  for (let i = 0; i < sections; i++) {
    const theta = Math.PI * (2 * i + 1) / (2 * order);
    const k = wc;
    const k2 = k * k;
    const alpha = 2 * Math.cos(theta);
    const norm = 1 / (1 + alpha * k + k2);
    const section: FilterCoefficients = {
      b: [k2 * norm, 2 * k2 * norm, k2 * norm],
      a: [1, 2 * (k2 - 1) * norm, (1 - alpha * k + k2) * norm],
    };
    result = convolveCoefficients(result, section);
  }
  return result;
}

/**
 * Butterworth 带通滤波器
 */
export function butterworthBandpass(
  order: number,
  lowFreq: number,
  highFreq: number,
  sampleRate: number
): FilterCoefficients {
  // 使用低通-带通变换
  const centerFreq = Math.sqrt(lowFreq * highFreq);
  const bandwidth = highFreq - lowFreq;
  const Q = centerFreq / bandwidth;
  const w0 = 2 * Math.PI * centerFreq / sampleRate;
  const alpha = Math.sin(w0) / (2 * Q);

  // 二阶带通 (可级联获得高阶)
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  let result: FilterCoefficients = {
    b: [b0 / a0, b1 / a0, b2 / a0],
    a: [1, a1 / a0, a2 / a0],
  };

  // 级联以提高阶数
  for (let i = 1; i < Math.ceil(order / 2); i++) {
    result = convolveCoefficients(result, {
      b: [b0 / a0, b1 / a0, b2 / a0],
      a: [1, a1 / a0, a2 / a0],
    });
  }

  return result;
}

/**
 * Butterworth 高通滤波器
 */
export function butterworthHighpass(order: number, cutoffFreq: number, sampleRate: number): FilterCoefficients {
  const wc = Math.tan(Math.PI * cutoffFreq / sampleRate);
  if (order <= 2) {
    const k = wc;
    const k2 = k * k;
    const sqrt2 = Math.sqrt(2);
    const norm = 1 / (1 + sqrt2 * k + k2);
    return {
      b: [norm, -2 * norm, norm],
      a: [1, 2 * (k2 - 1) * norm, (1 - sqrt2 * k + k2) * norm],
    };
  }
  let result: FilterCoefficients = { b: [1], a: [1] };
  const sections = Math.floor(order / 2);
  for (let i = 0; i < sections; i++) {
    const theta = Math.PI * (2 * i + 1) / (2 * order);
    const k = wc;
    const k2 = k * k;
    const alpha = 2 * Math.cos(theta);
    const norm = 1 / (1 + alpha * k + k2);
    const section: FilterCoefficients = {
      b: [norm, -2 * norm, norm],
      a: [1, 2 * (k2 - 1) * norm, (1 - alpha * k + k2) * norm],
    };
    result = convolveCoefficients(result, section);
  }
  return result;
}

/** 卷积两组滤波器系数 */
function convolveCoefficients(f1: FilterCoefficients, f2: FilterCoefficients): FilterCoefficients {
  return {
    b: convolve(f1.b, f2.b),
    a: convolve(f1.a, f2.a),
  };
}

function convolve(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}

/**
 * IIR 滤波器应用 (Direct Form II Transposed)
 */
export function applyFilter(signal: number[], coeffs: FilterCoefficients): number[] {
  const { b, a } = coeffs;
  const n = signal.length;
  const output = new Array(n).fill(0);
  const order = Math.max(b.length, a.length) - 1;
  const state = new Array(order + 1).fill(0);

  for (let i = 0; i < n; i++) {
    output[i] = b[0] * signal[i] + state[0];
    for (let j = 0; j < order; j++) {
      state[j] = (j + 1 < b.length ? b[j + 1] * signal[i] : 0)
        - (j + 1 < a.length ? a[j + 1] * output[i] : 0)
        + (j + 1 <= order ? state[j + 1] : 0);
    }
  }

  return output;
}

/**
 * 零相位滤波 (前向-后向滤波, filtfilt)
 */
export function filtfilt(signal: number[], coeffs: FilterCoefficients): number[] {
  // 前向滤波
  const forward = applyFilter(signal, coeffs);
  // 反转
  const reversed = forward.slice().reverse();
  // 后向滤波
  const backward = applyFilter(reversed, coeffs);
  // 再反转
  return backward.reverse();
}

// ============================================================
// 6. Hilbert 变换与包络
// ============================================================

/**
 * Hilbert 变换 — 计算解析信号
 * 输出: 解析信号的复数表示
 */
export function hilbertTransform(signal: number[]): Complex[] {
  const N = nextPow2(signal.length);
  const spectrum = fft(zeroPad(signal, N));

  // 构建 Hilbert 滤波器
  const h = new Array(N).fill(0);
  h[0] = 1;
  if (N % 2 === 0) h[N / 2] = 1;
  for (let i = 1; i < N / 2; i++) h[i] = 2;

  // 应用滤波器
  const analytic = spectrum.map((c, i) => ({
    re: c.re * h[i],
    im: c.im * h[i],
  }));

  // IFFT
  return ifft(analytic).slice(0, signal.length);
}

/**
 * 计算包络 (幅值)
 */
export function envelope(signal: number[]): number[] {
  const analytic = hilbertTransform(signal);
  return analytic.map(c => complexAbs(c));
}

/**
 * 计算瞬时频率
 */
export function instantaneousFrequency(signal: number[], sampleRate: number): number[] {
  const analytic = hilbertTransform(signal);
  const phase = analytic.map(c => complexPhase(c));

  // 相位解缠绕
  const unwrapped = unwrapPhase(phase);

  // 差分计算瞬时频率
  const freq = new Array(unwrapped.length - 1);
  for (let i = 0; i < freq.length; i++) {
    freq[i] = (unwrapped[i + 1] - unwrapped[i]) * sampleRate / (2 * Math.PI);
  }
  return freq;
}

/**
 * 相位解缠绕
 */
export function unwrapPhase(phase: number[]): number[] {
  const result = [phase[0]];
  for (let i = 1; i < phase.length; i++) {
    let diff = phase[i] - phase[i - 1];
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    result.push(result[i - 1] + diff);
  }
  return result;
}

// ============================================================
// 7. 倒频谱分析
// ============================================================

/**
 * 功率倒频谱
 * Cepstrum = IFFT(log|FFT(x)|²)
 */
export function powerCepstrum(signal: number[]): { quefrency: number[]; cepstrum: number[] } {
  const N = nextPow2(signal.length);
  const spectrum = fft(zeroPad(signal, N));

  // log|FFT(x)|²
  const logPower = spectrum.map(c => {
    const power = c.re * c.re + c.im * c.im;
    return { re: Math.log(Math.max(power, 1e-20)), im: 0 };
  });

  // IFFT
  const ceps = ifft(logPower);
  const halfN = Math.floor(N / 2);

  return {
    quefrency: Array.from({ length: halfN }, (_, i) => i),
    cepstrum: ceps.slice(0, halfN).map(c => c.re),
  };
}

/**
 * 实倒频谱 (用于齿轮箱分析)
 * Real Cepstrum = IFFT(log|FFT(x)|)
 */
export function realCepstrum(signal: number[]): number[] {
  const N = nextPow2(signal.length);
  const spectrum = fft(zeroPad(signal, N));
  const logMag = spectrum.map(c => ({
    re: Math.log(Math.max(complexAbs(c), 1e-20)),
    im: 0,
  }));
  return ifft(logMag).map(c => c.re);
}

// ============================================================
// 8. 短时傅里叶变换 (STFT)
// ============================================================

export interface STFTResult {
  timeAxis: number[];
  freqAxis: number[];
  magnitude: number[][];  // [time][freq]
}

/**
 * STFT 短时傅里叶变换
 */
export function stft(
  signal: number[],
  sampleRate: number,
  windowSize: number = 256,
  hopSize: number = 128,
  windowFn: (n: number) => number[] = hanningWindow
): STFTResult {
  const win = windowFn(windowSize);
  const nfft = nextPow2(windowSize);
  const halfNfft = Math.floor(nfft / 2);
  const nFrames = Math.floor((signal.length - windowSize) / hopSize) + 1;

  const timeAxis: number[] = [];
  const freqAxis = Array.from({ length: halfNfft }, (_, i) => i * sampleRate / nfft);
  const magnitude: number[][] = [];

  for (let frame = 0; frame < nFrames; frame++) {
    const start = frame * hopSize;
    const segment = signal.slice(start, start + windowSize).map((v, i) => v * win[i]);
    const spectrum = fft(segment);

    timeAxis.push((start + windowSize / 2) / sampleRate);
    magnitude.push(
      spectrum.slice(0, halfNfft).map(c => complexAbs(c))
    );
  }

  return { timeAxis, freqAxis, magnitude };
}

// ============================================================
// 9. 统计函数
// ============================================================

export function mean(data: number[]): number {
  return data.reduce((s, v) => s + v, 0) / data.length;
}

export function variance(data: number[]): number {
  const m = mean(data);
  return data.reduce((s, v) => s + (v - m) ** 2, 0) / data.length;
}

export function std(data: number[]): number {
  return Math.sqrt(variance(data));
}

export function rms(data: number[]): number {
  return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
}

export function peak(data: number[]): number {
  return Math.max(...data.map(Math.abs));
}

export function peakToPeak(data: number[]): number {
  return Math.max(...data) - Math.min(...data);
}

/** 峭度 (Kurtosis) — 四阶中心矩 / σ⁴ */
export function kurtosis(data: number[]): number {
  const m = mean(data);
  const s = std(data);
  if (s === 0) return 0;
  const n = data.length;
  return data.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0) / n;
}

/** 偏度 (Skewness) — 三阶中心矩 / σ³ */
export function skewness(data: number[]): number {
  const m = mean(data);
  const s = std(data);
  if (s === 0) return 0;
  const n = data.length;
  return data.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0) / n;
}

/** 波形因子 (Shape Factor) = RMS / |mean| */
export function shapeFactor(data: number[]): number {
  const absMean = data.reduce((s, v) => s + Math.abs(v), 0) / data.length;
  return absMean === 0 ? 0 : rms(data) / absMean;
}

/** 脉冲因子 (Impulse Factor) = peak / |mean| */
export function impulseFactor(data: number[]): number {
  const absMean = data.reduce((s, v) => s + Math.abs(v), 0) / data.length;
  return absMean === 0 ? 0 : peak(data) / absMean;
}

/** 裕度因子 (Clearance Factor) = peak / (sqrt(|mean|))² */
export function clearanceFactor(data: number[]): number {
  const sqrtMean = data.reduce((s, v) => s + Math.sqrt(Math.abs(v)), 0) / data.length;
  return sqrtMean === 0 ? 0 : peak(data) / (sqrtMean * sqrtMean);
}

/** 峰值因子 (Crest Factor) = peak / RMS */
export function crestFactor(data: number[]): number {
  const r = rms(data);
  return r === 0 ? 0 : peak(data) / r;
}

// ============================================================
// 10. 信息熵
// ============================================================

/** Shannon 熵 */
export function shannonEntropy(data: number[]): number {
  const total = data.reduce((s, v) => s + Math.abs(v), 0);
  if (total === 0) return 0;
  const probs = data.map(v => Math.abs(v) / total);
  return -probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
}

/** 近似熵 (Approximate Entropy) */
export function approximateEntropy(data: number[], m: number = 2, r?: number): number {
  const tolerance = r ?? 0.2 * std(data);
  const N = data.length;

  function phi(dim: number): number {
    const patterns: number[][] = [];
    for (let i = 0; i <= N - dim; i++) {
      patterns.push(data.slice(i, i + dim));
    }
    let sum = 0;
    for (let i = 0; i < patterns.length; i++) {
      let count = 0;
      for (let j = 0; j < patterns.length; j++) {
        const maxDiff = Math.max(...patterns[i].map((v, k) => Math.abs(v - patterns[j][k])));
        if (maxDiff <= tolerance) count++;
      }
      sum += Math.log(count / patterns.length);
    }
    return sum / patterns.length;
  }

  return phi(m) - phi(m + 1);
}

/** 样本熵 (Sample Entropy) */
export function sampleEntropy(data: number[], m: number = 2, r?: number): number {
  const tolerance = r ?? 0.2 * std(data);
  const N = data.length;

  function countMatches(dim: number): number {
    let count = 0;
    for (let i = 0; i < N - dim; i++) {
      for (let j = i + 1; j < N - dim; j++) {
        let match = true;
        for (let k = 0; k < dim; k++) {
          if (Math.abs(data[i + k] - data[j + k]) > tolerance) {
            match = false;
            break;
          }
        }
        if (match) count++;
      }
    }
    return count;
  }

  const A = countMatches(m + 1);
  const B = countMatches(m);
  return B === 0 ? 0 : -Math.log(A / B);
}

// ============================================================
// 11. 重采样
// ============================================================

/**
 * 三次样条插值重采样
 */
export function resample(signal: number[], originalRate: number, targetRate: number): number[] {
  const ratio = targetRate / originalRate;
  const newLength = Math.round(signal.length * ratio);
  const result = new Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const t = i / ratio;
    const idx = Math.floor(t);
    const frac = t - idx;

    if (idx <= 0) {
      result[i] = signal[0];
    } else if (idx >= signal.length - 1) {
      result[i] = signal[signal.length - 1];
    } else {
      // 三次插值 (Catmull-Rom)
      const p0 = signal[Math.max(0, idx - 1)];
      const p1 = signal[idx];
      const p2 = signal[Math.min(signal.length - 1, idx + 1)];
      const p3 = signal[Math.min(signal.length - 1, idx + 2)];

      result[i] = 0.5 * (
        (2 * p1) +
        (-p0 + p2) * frac +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * frac * frac +
        (-p0 + 3 * p1 - 3 * p2 + p3) * frac * frac * frac
      );
    }
  }

  return result;
}

/**
 * 角度域重采样 (用于变速工况)
 * @param signal 时域信号
 * @param tachoPulses 键相脉冲时间点 (秒)
 * @param samplesPerRev 每转采样点数
 */
export function angularResample(
  signal: number[],
  sampleRate: number,
  tachoPulses: number[],
  samplesPerRev: number = 256
): { angularSignal: number[]; avgRPM: number } {
  const totalRevs = tachoPulses.length - 1;
  const angularSignal: number[] = [];
  let totalTime = 0;

  for (let rev = 0; rev < totalRevs; rev++) {
    const t0 = tachoPulses[rev];
    const t1 = tachoPulses[rev + 1];
    const revDuration = t1 - t0;
    totalTime += revDuration;

    for (let j = 0; j < samplesPerRev; j++) {
      const t = t0 + (j / samplesPerRev) * revDuration;
      const sampleIdx = t * sampleRate;
      const idx = Math.floor(sampleIdx);
      const frac = sampleIdx - idx;

      if (idx >= 0 && idx < signal.length - 1) {
        angularSignal.push(signal[idx] * (1 - frac) + signal[idx + 1] * frac);
      }
    }
  }

  const avgRPM = totalRevs / totalTime * 60;
  return { angularSignal, avgRPM };
}

// ============================================================
// 12. 轴承故障特征频率计算
// ============================================================

export interface BearingGeometry {
  /** 滚动体数量 */
  numberOfBalls: number;
  /** 滚动体直径 (mm) */
  ballDiameter: number;
  /** 节圆直径 (mm) */
  pitchDiameter: number;
  /** 接触角 (度) */
  contactAngle: number;
}

export interface BearingFaultFrequencies {
  /** 外圈故障频率 */
  BPFO: number;
  /** 内圈故障频率 */
  BPFI: number;
  /** 滚动体故障频率 */
  BSF: number;
  /** 保持架故障频率 */
  FTF: number;
}

/**
 * 计算轴承故障特征频率
 * @param bearing 轴承几何参数
 * @param shaftRPM 轴转速 (RPM)
 */
export function bearingFaultFrequencies(bearing: BearingGeometry, shaftRPM: number): BearingFaultFrequencies {
  const fr = shaftRPM / 60; // 转频 (Hz)
  const n = bearing.numberOfBalls;
  const d = bearing.ballDiameter;
  const D = bearing.pitchDiameter;
  const phi = bearing.contactAngle * Math.PI / 180;
  const cosA = Math.cos(phi);

  return {
    BPFO: (n / 2) * fr * (1 - (d / D) * cosA),
    BPFI: (n / 2) * fr * (1 + (d / D) * cosA),
    BSF: (D / (2 * d)) * fr * (1 - ((d / D) * cosA) ** 2),
    FTF: (fr / 2) * (1 - (d / D) * cosA),
  };
}

// ============================================================
// 13. ISO 10816/20816 振动严重度评估
// ============================================================

export type MachineGroup = 'group1' | 'group2' | 'group3' | 'group4';
export type MountType = 'rigid' | 'flexible';
export type VibrationZone = 'A' | 'B' | 'C' | 'D';

/** ISO 10816-3 振动严重度阈值 (mm/s RMS) */
const ISO_10816_THRESHOLDS: Record<MachineGroup, Record<MountType, [number, number, number]>> = {
  // [A/B boundary, B/C boundary, C/D boundary]
  group1: { rigid: [2.3, 4.5, 7.1], flexible: [3.5, 7.1, 11.0] },
  group2: { rigid: [1.4, 2.8, 4.5], flexible: [2.3, 4.5, 7.1] },
  group3: { rigid: [1.4, 2.8, 4.5], flexible: [2.3, 4.5, 7.1] },
  group4: { rigid: [0.71, 1.8, 4.5], flexible: [1.12, 2.8, 7.1] },
};

/**
 * 评估振动严重度 (ISO 10816-3)
 * @param velocityRMS 速度RMS值 (mm/s)
 * @param machineGroup 机器组别
 * @param mountType 安装类型
 */
export function evaluateVibrationSeverity(
  velocityRMS: number,
  machineGroup: MachineGroup = 'group2',
  mountType: MountType = 'rigid'
): { zone: VibrationZone; description: string; thresholds: number[] } {
  const thresholds = ISO_10816_THRESHOLDS[machineGroup][mountType];

  let zone: VibrationZone;
  let description: string;

  if (velocityRMS <= thresholds[0]) {
    zone = 'A';
    description = '新投运设备水平，状态优良';
  } else if (velocityRMS <= thresholds[1]) {
    zone = 'B';
    description = '可无限制长期运行';
  } else if (velocityRMS <= thresholds[2]) {
    zone = 'C';
    description = '受限运行，需安排维护';
  } else {
    zone = 'D';
    description = '可能造成损坏，建议立即停机';
  }

  return { zone, description, thresholds: [...thresholds] };
}

// ============================================================
// 14. 自相关 / 互相关
// ============================================================

/**
 * 自相关函数
 */
export function autocorrelation(signal: number[], maxLag?: number): number[] {
  const N = signal.length;
  const lag = maxLag ?? N;
  const m = mean(signal);
  const result = new Array(lag);

  for (let k = 0; k < lag; k++) {
    let sum = 0;
    for (let i = 0; i < N - k; i++) {
      sum += (signal[i] - m) * (signal[i + k] - m);
    }
    result[k] = sum / N;
  }

  // 归一化
  const r0 = result[0];
  if (r0 !== 0) {
    for (let k = 0; k < lag; k++) result[k] /= r0;
  }

  return result;
}

/**
 * 互相关函数
 */
export function crossCorrelation(signal1: number[], signal2: number[]): number[] {
  const N = Math.max(signal1.length, signal2.length);
  const nfft = nextPow2(2 * N);

  const S1 = fft(zeroPad(signal1, nfft));
  const S2 = fft(zeroPad(signal2, nfft));

  // R12 = IFFT(S1* × S2)
  const product = S1.map((c, i) => complexMul(complexConj(c), S2[i]));
  const result = ifft(product);

  return result.map(c => c.re);
}

// ============================================================
// 15. 矩阵运算工具
// ============================================================

export type Matrix = number[][];

export function matrixMultiply(A: Matrix, B: Matrix): Matrix {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const result: Matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < inner; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

export function matrixTranspose(A: Matrix): Matrix {
  const rows = A.length;
  const cols = A[0].length;
  return Array.from({ length: cols }, (_, j) =>
    Array.from({ length: rows }, (_, i) => A[i][j])
  );
}

/**
 * SVD 分解 (简化版，用于小矩阵)
 * 使用 Jacobi 旋转法
 */
export function svd(A: Matrix): { U: Matrix; S: number[]; V: Matrix } {
  const m = A.length;
  const n = A[0].length;
  const At = matrixTranspose(A);
  const AtA = matrixMultiply(At, A);

  // 特征值分解 AtA (Jacobi迭代)
  const { eigenvalues, eigenvectors } = jacobiEigen(AtA);

  const S = eigenvalues.map(v => Math.sqrt(Math.max(v, 0)));
  const V = eigenvectors;

  // U = A * V * S^-1
  const AV = matrixMultiply(A, V);
  const U: Matrix = AV.map((row, i) =>
    row.map((v, j) => S[j] > 1e-10 ? v / S[j] : 0)
  );

  return { U, S, V };
}

function jacobiEigen(A: Matrix, maxIter: number = 100): { eigenvalues: number[]; eigenvectors: Matrix } {
  const n = A.length;
  let D = A.map(row => [...row]);
  let V: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j ? 1 : 0)
  );

  for (let iter = 0; iter < maxIter; iter++) {
    // 找最大非对角元素
    let maxVal = 0, p = 0, q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(D[i][j]) > maxVal) {
          maxVal = Math.abs(D[i][j]);
          p = i; q = j;
        }
      }
    }
    if (maxVal < 1e-12) break;

    // Jacobi旋转
    const theta = 0.5 * Math.atan2(2 * D[p][q], D[p][p] - D[q][q]);
    const c = Math.cos(theta), s = Math.sin(theta);

    const newD = D.map(row => [...row]);
    for (let i = 0; i < n; i++) {
      newD[i][p] = c * D[i][p] + s * D[i][q];
      newD[i][q] = -s * D[i][p] + c * D[i][q];
    }
    for (let j = 0; j < n; j++) {
      D[p][j] = c * newD[p][j] + s * newD[q][j];
      D[q][j] = -s * newD[p][j] + c * newD[q][j];
    }

    // 更新特征向量
    const newV = V.map(row => [...row]);
    for (let i = 0; i < n; i++) {
      newV[i][p] = c * V[i][p] + s * V[i][q];
      newV[i][q] = -s * V[i][p] + c * V[i][q];
    }
    V = newV;
  }

  const eigenvalues = Array.from({ length: n }, (_, i) => D[i][i]);
  return { eigenvalues, eigenvectors: V };
}

// ============================================================
// 16. 线性代数辅助
// ============================================================

/** 求解线性方程组 Ax = b (高斯消元) */
export function solveLinearSystem(A: Matrix, b: number[]): number[] {
  const n = A.length;
  const aug: Matrix = A.map((row, i) => [...row, b[i]]);

  // 前向消元
  for (let col = 0; col < n; col++) {
    // 部分主元选取
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // 回代
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i] || 1;
  }

  return x;
}

/** 最小二乘拟合 (多项式) */
export function polyFit(x: number[], y: number[], degree: number): number[] {
  const n = x.length;
  const m = degree + 1;

  // 构建范德蒙矩阵
  const V: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => Math.pow(x[i], j))
  );

  // 正规方程 V^T * V * c = V^T * y
  const VtV = matrixMultiply(matrixTranspose(V), V);
  const Vty = matrixTranspose(V).map(row =>
    row.reduce((s, v, i) => s + v * y[i], 0)
  );

  return solveLinearSystem(VtV, Vty);
}

/** 多项式求值 */
export function polyEval(coeffs: number[], x: number): number {
  return coeffs.reduce((sum, c, i) => sum + c * Math.pow(x, i), 0);
}


/** 标准差（standardDeviation 别名） */
export function standardDeviation(data: number[]): number {
  return std(data);
}

/** 对信号应用窗函数 */
export function applyWindow(signal: number[], windowType: WindowFunction = 'hanning'): number[] {
  const windowFn = getWindowFunction(windowType);
  const w = windowFn(signal.length);
  return signal.map((v, i) => v * w[i]);
}

/** nextPowerOf2 别名 */
export function nextPowerOf2(n: number): number {
  return nextPow2(n);
}
