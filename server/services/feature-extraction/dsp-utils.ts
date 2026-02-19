/**
 * 数字信号处理工具库
 * ============================================================
 * 
 * 纯 TypeScript 实现，无外部依赖
 * 包含 FFT、窗函数、统计函数、频谱分析工具
 * 
 * 算法参考：
 *   - Cooley-Tukey FFT (radix-2 DIT)
 *   - ISO 10816 振动评估标准
 *   - Mel 频率倒谱系数 (MFCC)
 */

// ============================================================
// FFT（快速傅里叶变换）
// ============================================================

/**
 * Radix-2 DIT FFT
 * 输入长度必须是 2 的幂次
 * 
 * @param real 实部数组
 * @param imag 虚部数组（可选，默认全零）
 * @returns [real[], imag[]] 频域实部和虚部
 */
export function fft(real: number[], imag?: number[]): [number[], number[]] {
  const n = real.length;
  if (n === 0) return [[], []];
  
  // 确保长度是 2 的幂次
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT 输入长度必须是 2 的幂次，当前: ${n}`);
  }

  const re = [...real];
  const im = imag ? [...imag] : new Array(n).fill(0);

  // 位反转排列
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Cooley-Tukey 蝶形运算
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;

      for (let j = 0; j < halfLen; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + halfLen] * curRe - im[i + j + halfLen] * curIm;
        const vIm = re[i + j + halfLen] * curIm + im[i + j + halfLen] * curRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + halfLen] = uRe - vRe;
        im[i + j + halfLen] = uIm - vIm;

        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }

  return [re, im];
}

/**
 * 计算频谱幅值（单边谱）
 * @param real FFT 实部
 * @param imag FFT 虚部
 * @returns 单边幅值谱（长度 N/2 + 1）
 */
export function magnitude(real: number[], imag: number[]): number[] {
  const n = real.length;
  const halfN = Math.floor(n / 2) + 1;
  const mag = new Array(halfN);

  for (let i = 0; i < halfN; i++) {
    mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) * 2 / n;
  }
  // DC 分量和 Nyquist 分量不需要乘 2
  mag[0] /= 2;
  if (halfN > 1) mag[halfN - 1] /= 2;

  return mag;
}

/**
 * 将数组零填充到最近的 2 的幂次
 */
export function zeroPad(data: number[], multiplier: number = 1): number[] {
  const targetLen = nextPow2(data.length) * multiplier;
  if (data.length >= targetLen) return [...data];
  const padded = new Array(targetLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    padded[i] = data[i];
  }
  return padded;
}

/**
 * 下一个 2 的幂次
 */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ============================================================
// 窗函数
// ============================================================

/**
 * Hanning 窗
 */
export function hanningWindow(data: number[]): number[] {
  const n = data.length;
  return data.map((v, i) => v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))));
}

/**
 * Hamming 窗
 */
export function hammingWindow(data: number[]): number[] {
  const n = data.length;
  return data.map((v, i) => v * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))));
}

/**
 * Blackman 窗
 */
export function blackmanWindow(data: number[]): number[] {
  const n = data.length;
  return data.map((v, i) =>
    v * (0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (n - 1)))
  );
}

/**
 * Flat-top 窗（用于幅值精确校准）
 */
export function flatTopWindow(data: number[]): number[] {
  const n = data.length;
  const a0 = 0.21557895, a1 = 0.41663158, a2 = 0.277263158;
  const a3 = 0.083578947, a4 = 0.006947368;
  return data.map((v, i) => {
    const w = a0
      - a1 * Math.cos(2 * Math.PI * i / (n - 1))
      + a2 * Math.cos(4 * Math.PI * i / (n - 1))
      - a3 * Math.cos(6 * Math.PI * i / (n - 1))
      + a4 * Math.cos(8 * Math.PI * i / (n - 1));
    return v * w;
  });
}

// ============================================================
// 统计函数
// ============================================================

/** 均值 */
export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
}

/** 方差 */
export function variance(data: number[]): number {
  if (data.length < 2) return 0;
  const m = mean(data);
  return data.reduce((a, b) => a + (b - m) ** 2, 0) / data.length;
}

/** 标准差 */
export function stdDev(data: number[]): number {
  return Math.sqrt(variance(data));
}

/** RMS（均方根） */
export function rms(data: number[]): number {
  if (data.length === 0) return 0;
  return Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length);
}

/** 峰值（绝对值最大） */
export function peak(data: number[]): number {
  if (data.length === 0) return 0;
  return Math.max(...data.map(Math.abs));
}

/** 峰峰值 */
export function peakToPeak(data: number[]): number {
  if (data.length === 0) return 0;
  return Math.max(...data) - Math.min(...data);
}

/** 峭度（Kurtosis） */
export function kurtosis(data: number[]): number {
  if (data.length < 4) return 0;
  const m = mean(data);
  const s = stdDev(data);
  if (s === 0) return 0;
  const n = data.length;
  const m4 = data.reduce((a, b) => a + ((b - m) / s) ** 4, 0) / n;
  return m4; // 非中心化峭度（正态分布 = 3）
}

/** 偏度（Skewness） */
export function skewness(data: number[]): number {
  if (data.length < 3) return 0;
  const m = mean(data);
  const s = stdDev(data);
  if (s === 0) return 0;
  const n = data.length;
  return data.reduce((a, b) => a + ((b - m) / s) ** 3, 0) / n;
}

/** 波峰因子（Crest Factor） */
export function crestFactor(data: number[]): number {
  const r = rms(data);
  if (r === 0) return 0;
  return peak(data) / r;
}

/** 线性回归斜率 */
export function linearSlope(data: number[], dt: number = 1): number {
  const n = data.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i * dt;
    sumX += x;
    sumY += data[i];
    sumXY += x * data[i];
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** 变化率（最后两个点） */
export function rateOfChange(data: number[], dt: number = 1): number {
  if (data.length < 2) return 0;
  return (data[data.length - 1] - data[data.length - 2]) / dt;
}

/** 突变检测（基于标准差倍数） */
export function detectStepChange(data: number[], threshold: number = 3): boolean {
  if (data.length < 10) return false;
  const windowSize = Math.min(10, Math.floor(data.length / 2));
  const recent = data.slice(-windowSize);
  const historical = data.slice(0, -windowSize);
  const histMean = mean(historical);
  const histStd = stdDev(historical);
  if (histStd === 0) return false;
  const recentMean = mean(recent);
  return Math.abs(recentMean - histMean) > threshold * histStd;
}

// ============================================================
// 频谱分析工具
// ============================================================

/**
 * 找到频谱中的主频（最大幅值对应的频率）
 * @param magnitudes 幅值谱
 * @param sampleRate 采样率 (Hz)
 * @returns [频率, 幅值]
 */
export function dominantFrequency(magnitudes: number[], sampleRate: number): [number, number] {
  if (magnitudes.length < 2) return [0, 0];

  // 跳过 DC 分量（index 0）
  let maxIdx = 1;
  let maxVal = magnitudes[1];
  for (let i = 2; i < magnitudes.length; i++) {
    if (magnitudes[i] > maxVal) {
      maxVal = magnitudes[i];
      maxIdx = i;
    }
  }

  const freqResolution = sampleRate / ((magnitudes.length - 1) * 2);
  return [maxIdx * freqResolution, maxVal];
}

/**
 * 频谱质心
 * @param magnitudes 幅值谱
 * @param sampleRate 采样率 (Hz)
 */
export function spectralCentroid(magnitudes: number[], sampleRate: number): number {
  const n = magnitudes.length;
  const freqRes = sampleRate / ((n - 1) * 2);
  let weightedSum = 0;
  let totalMag = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += i * freqRes * magnitudes[i];
    totalMag += magnitudes[i];
  }
  return totalMag > 0 ? weightedSum / totalMag : 0;
}

/**
 * 频谱带宽（以质心为中心的加权标准差）
 */
export function spectralBandwidth(magnitudes: number[], sampleRate: number): number {
  const centroid = spectralCentroid(magnitudes, sampleRate);
  const n = magnitudes.length;
  const freqRes = sampleRate / ((n - 1) * 2);
  let weightedVar = 0;
  let totalMag = 0;
  for (let i = 0; i < n; i++) {
    const freq = i * freqRes;
    weightedVar += magnitudes[i] * (freq - centroid) ** 2;
    totalMag += magnitudes[i];
  }
  return totalMag > 0 ? Math.sqrt(weightedVar / totalMag) : 0;
}

/**
 * 频谱滚降点（累积能量达到 rolloff% 的频率）
 */
export function spectralRolloff(magnitudes: number[], sampleRate: number, rolloff: number = 0.85): number {
  const n = magnitudes.length;
  const freqRes = sampleRate / ((n - 1) * 2);
  const totalEnergy = magnitudes.reduce((a, b) => a + b * b, 0);
  const threshold = totalEnergy * rolloff;
  let cumEnergy = 0;
  for (let i = 0; i < n; i++) {
    cumEnergy += magnitudes[i] * magnitudes[i];
    if (cumEnergy >= threshold) {
      return i * freqRes;
    }
  }
  return (n - 1) * freqRes;
}

/**
 * 频谱平坦度（几何均值 / 算术均值，越接近 1 越像白噪声）
 */
export function spectralFlatness(magnitudes: number[]): number {
  const n = magnitudes.length;
  if (n === 0) return 0;
  // 使用 log 域避免数值溢出
  let logSum = 0;
  let linSum = 0;
  let count = 0;
  for (let i = 1; i < n; i++) { // 跳过 DC
    if (magnitudes[i] > 1e-10) {
      logSum += Math.log(magnitudes[i]);
      linSum += magnitudes[i];
      count++;
    }
  }
  if (count === 0 || linSum === 0) return 0;
  const geoMean = Math.exp(logSum / count);
  const ariMean = linSum / count;
  return geoMean / ariMean;
}

/**
 * 过零率
 */
export function zeroCrossingRate(data: number[]): number {
  if (data.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (data.length - 1);
}

/**
 * 短时能量
 */
export function shortTimeEnergy(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((a, b) => a + b * b, 0) / data.length;
}

// ============================================================
// 包络分析（Hilbert 变换近似）
// ============================================================

/**
 * 包络提取（基于 FFT 的 Hilbert 变换）
 * @param data 时域信号
 * @returns 包络信号
 */
export function envelope(data: number[]): number[] {
  const n = nextPow2(data.length);
  const padded = zeroPad(data);
  const [re, im] = fft(padded);

  // 构造解析信号：将负频率分量置零
  for (let i = Math.floor(n / 2) + 1; i < n; i++) {
    re[i] = 0;
    im[i] = 0;
  }
  // 正频率分量乘 2（DC 和 Nyquist 不变）
  for (let i = 1; i < Math.floor(n / 2); i++) {
    re[i] *= 2;
    im[i] *= 2;
  }

  // IFFT
  // 利用 FFT 的对称性：IFFT(X) = conj(FFT(conj(X))) / N
  const conjIm = im.map(v => -v);
  const [ifftRe, ifftIm] = fft(re, conjIm);

  // 取模得到包络
  const env = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    env[i] = Math.sqrt((ifftRe[i] / n) ** 2 + (-ifftIm[i] / n) ** 2);
  }
  return env;
}

// ============================================================
// MFCC（Mel 频率倒谱系数）
// ============================================================

/**
 * Hz → Mel 转换
 */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Mel → Hz 转换
 */
export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

/**
 * 创建 Mel 滤波器组
 * @param nFilters 滤波器数量
 * @param nFft FFT 点数
 * @param sampleRate 采样率
 * @param lowFreq 最低频率
 * @param highFreq 最高频率
 */
export function melFilterBank(
  nFilters: number,
  nFft: number,
  sampleRate: number,
  lowFreq: number = 0,
  highFreq?: number
): number[][] {
  const high = highFreq || sampleRate / 2;
  const lowMel = hzToMel(lowFreq);
  const highMel = hzToMel(high);
  const nBins = Math.floor(nFft / 2) + 1;

  // Mel 等间距点
  const melPoints = new Array(nFilters + 2);
  for (let i = 0; i < nFilters + 2; i++) {
    melPoints[i] = lowMel + (highMel - lowMel) * i / (nFilters + 1);
  }

  // 转换回 Hz 并映射到 FFT bin
  const binPoints = melPoints.map(mel => {
    const hz = melToHz(mel);
    return Math.floor((nFft + 1) * hz / sampleRate);
  });

  // 构建三角滤波器
  const filters: number[][] = [];
  for (let i = 0; i < nFilters; i++) {
    const filter = new Array(nBins).fill(0);
    const left = binPoints[i];
    const center = binPoints[i + 1];
    const right = binPoints[i + 2];

    for (let j = left; j < center && j < nBins; j++) {
      filter[j] = (j - left) / (center - left);
    }
    for (let j = center; j < right && j < nBins; j++) {
      filter[j] = (right - j) / (right - center);
    }
    filters.push(filter);
  }

  return filters;
}

/**
 * 计算 MFCC
 * @param signal 音频信号
 * @param sampleRate 采样率
 * @param nCoeffs 系数数量（默认 13）
 * @param nFilters Mel 滤波器数量（默认 26）
 * @returns MFCC 系数数组
 */
export function computeMFCC(
  signal: number[],
  sampleRate: number,
  nCoeffs: number = 13,
  nFilters: number = 26
): number[] {
  // 预加重
  const preEmph = new Array(signal.length);
  preEmph[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    preEmph[i] = signal[i] - 0.97 * signal[i - 1];
  }

  // 加窗 + FFT
  const windowed = hammingWindow(preEmph);
  const padded = zeroPad(windowed);
  const nFft = padded.length;
  const [re, im] = fft(padded);

  // 功率谱
  const nBins = Math.floor(nFft / 2) + 1;
  const powerSpec = new Array(nBins);
  for (let i = 0; i < nBins; i++) {
    powerSpec[i] = (re[i] * re[i] + im[i] * im[i]) / nFft;
  }

  // Mel 滤波
  const filters = melFilterBank(nFilters, nFft, sampleRate);
  const melEnergies = filters.map(filter => {
    let energy = 0;
    for (let i = 0; i < nBins; i++) {
      energy += filter[i] * powerSpec[i];
    }
    return Math.max(energy, 1e-10); // 避免 log(0)
  });

  // Log + DCT
  const logEnergies = melEnergies.map(e => Math.log(e));
  const mfcc = new Array(nCoeffs);
  for (let i = 0; i < nCoeffs; i++) {
    let sum = 0;
    for (let j = 0; j < nFilters; j++) {
      sum += logEnergies[j] * Math.cos(Math.PI * i * (j + 0.5) / nFilters);
    }
    mfcc[i] = sum;
  }

  return mfcc;
}

// ============================================================
// 谐波分析
// ============================================================

/**
 * 提取谐波分量
 * @param magnitudes 幅值谱
 * @param fundamentalFreq 基波频率 (Hz)
 * @param sampleRate 采样率 (Hz)
 * @param nHarmonics 谐波数量
 * @returns 各次谐波幅值 [1次(基波), 2次, 3次, ...]
 */
export function extractHarmonics(
  magnitudes: number[],
  fundamentalFreq: number,
  sampleRate: number,
  nHarmonics: number = 10
): number[] {
  const n = magnitudes.length;
  const freqRes = sampleRate / ((n - 1) * 2);
  const harmonics: number[] = [];

  for (let h = 1; h <= nHarmonics; h++) {
    const targetFreq = fundamentalFreq * h;
    const targetBin = Math.round(targetFreq / freqRes);

    if (targetBin >= n) {
      harmonics.push(0);
      continue;
    }

    // 在目标 bin 附近 ±2 bin 范围内找最大值（补偿频率偏移）
    let maxVal = 0;
    const searchRange = 2;
    for (let i = Math.max(0, targetBin - searchRange); i <= Math.min(n - 1, targetBin + searchRange); i++) {
      if (magnitudes[i] > maxVal) {
        maxVal = magnitudes[i];
      }
    }
    harmonics.push(maxVal);
  }

  return harmonics;
}

/**
 * 计算总谐波失真 (THD)
 * @param harmonics 谐波幅值数组 [基波, 2次, 3次, ...]
 * @returns THD 百分比
 */
export function computeTHD(harmonics: number[]): number {
  if (harmonics.length < 2 || harmonics[0] === 0) return 0;
  const fundamental = harmonics[0];
  let sumSquares = 0;
  for (let i = 1; i < harmonics.length; i++) {
    sumSquares += harmonics[i] * harmonics[i];
  }
  return Math.sqrt(sumSquares) / fundamental * 100;
}
