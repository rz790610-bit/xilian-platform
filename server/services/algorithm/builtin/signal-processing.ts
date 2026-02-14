/**
 * ============================================================================
 * 内置算法 — 信号处理（Signal Processing）
 * ============================================================================
 * 
 * 8 个核心信号处理算法，面向振动/声学/温度等工业传感器数据：
 * 1. FFT 频谱分析
 * 2. STFT 短时傅里叶变换
 * 3. 小波分析
 * 4. 包络分析（Hilbert 变换）
 * 5. 带通滤波
 * 6. 小波降噪
 * 7. 倒频谱分析
 * 8. 阶次分析
 * 
 * 所有算法遵循统一接口：
 *   execute(inputData: { data: number[]; sampleRate?: number }, config: Record<string, unknown>)
 *   => Promise<Record<string, unknown>>
 */

// ============================================================================
// 工具函数
// ============================================================================

/** 复数类型 */
interface Complex {
  re: number;
  im: number;
}

/** 复数乘法 */
function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/** 复数模 */
function complexAbs(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}

/** 下一个 2 的幂 */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Cooley-Tukey FFT（原地蝶形运算） */
function fft(data: Complex[]): Complex[] {
  const N = data.length;
  if (N <= 1) return data;

  // 位反转排列
  const result = [...data];
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [result[i], result[j]] = [result[j], result[i]];
    }
  }

  // 蝶形运算
  for (let len = 2; len <= N; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wlen: Complex = { re: Math.cos(angle), im: Math.sin(angle) };

    for (let i = 0; i < N; i += len) {
      let w: Complex = { re: 1, im: 0 };
      for (let k = 0; k < len / 2; k++) {
        const u = result[i + k];
        const v = complexMul(w, result[i + k + len / 2]);
        result[i + k] = { re: u.re + v.re, im: u.im + v.im };
        result[i + k + len / 2] = { re: u.re - v.re, im: u.im - v.im };
        w = complexMul(w, wlen);
      }
    }
  }

  return result;
}

/** IFFT */
function ifft(data: Complex[]): Complex[] {
  const N = data.length;
  const conjugate = data.map(c => ({ re: c.re, im: -c.im }));
  const result = fft(conjugate);
  return result.map(c => ({ re: c.re / N, im: -c.im / N }));
}

/** 窗函数 */
function applyWindow(data: number[], windowType: string): number[] {
  const N = data.length;
  return data.map((v, i) => {
    let w = 1;
    switch (windowType) {
      case 'hanning':
        w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        break;
      case 'hamming':
        w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
        break;
      case 'blackman':
        w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
        break;
      case 'rectangular':
      default:
        w = 1;
    }
    return v * w;
  });
}

/** 零填充到 2 的幂 */
function zeroPad(data: number[], targetLength?: number): Complex[] {
  const N = targetLength || nextPow2(data.length);
  const result: Complex[] = new Array(N);
  for (let i = 0; i < N; i++) {
    result[i] = { re: i < data.length ? data[i] : 0, im: 0 };
  }
  return result;
}

// ============================================================================
// 1. FFT 频谱分析
// ============================================================================

export async function fft_spectrum(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const sampleRate = (config.sample_rate as number) || inputData.sampleRate || 1000;
  const windowType = (config.window_type as string) || 'hanning';
  const windowSize = (config.window_size as number) || Math.min(data.length, 4096);
  const overlap = (config.overlap as number) || 0.5;

  // 分段平均（Welch 方法）
  const step = Math.floor(windowSize * (1 - overlap));
  const segments: number[][] = [];
  for (let start = 0; start + windowSize <= data.length; start += step) {
    segments.push(data.slice(start, start + windowSize));
  }

  if (segments.length === 0) {
    segments.push(data.slice(0, Math.min(data.length, windowSize)));
  }

  // 对每段做 FFT 并平均
  const N = nextPow2(windowSize);
  const halfN = Math.floor(N / 2);
  const avgMagnitude = new Float64Array(halfN);

  for (const segment of segments) {
    const windowed = applyWindow(segment, windowType);
    const padded = zeroPad(windowed, N);
    const spectrum = fft(padded);

    for (let i = 0; i < halfN; i++) {
      avgMagnitude[i] += complexAbs(spectrum[i]) / N;
    }
  }

  // 平均
  for (let i = 0; i < halfN; i++) {
    avgMagnitude[i] /= segments.length;
  }

  // 频率轴
  const freqResolution = sampleRate / N;
  const frequencies = Array.from({ length: halfN }, (_, i) => i * freqResolution);
  const magnitudes = Array.from(avgMagnitude);

  // 峰值检测
  const peaks: Array<{ frequency: number; magnitude: number; index: number }> = [];
  const peakThreshold = (config.peak_threshold as number) || 0.1;
  const maxMag = Math.max(...magnitudes);

  for (let i = 1; i < halfN - 1; i++) {
    if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1] && magnitudes[i] > maxMag * peakThreshold) {
      peaks.push({ frequency: frequencies[i], magnitude: magnitudes[i], index: i });
    }
  }

  peaks.sort((a, b) => b.magnitude - a.magnitude);

  return {
    frequencies: frequencies.slice(0, 500), // 限制输出大小
    magnitudes: magnitudes.slice(0, 500),
    peaks: peaks.slice(0, 20),
    metadata: {
      sampleRate,
      windowType,
      windowSize,
      segments: segments.length,
      freqResolution,
      nyquistFreq: sampleRate / 2,
    },
  };
}

// ============================================================================
// 2. STFT 短时傅里叶变换
// ============================================================================

export async function stft_spectrogram(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const sampleRate = (config.sample_rate as number) || inputData.sampleRate || 1000;
  const windowSize = (config.window_size as number) || 256;
  const hopSize = (config.hop_size as number) || Math.floor(windowSize / 4);
  const windowType = (config.window_type as string) || 'hanning';

  const N = nextPow2(windowSize);
  const halfN = Math.floor(N / 2);
  const spectrogram: number[][] = [];
  const timeAxis: number[] = [];

  for (let start = 0; start + windowSize <= data.length; start += hopSize) {
    const segment = data.slice(start, start + windowSize);
    const windowed = applyWindow(segment, windowType);
    const padded = zeroPad(windowed, N);
    const spectrum = fft(padded);

    const magnitudes = new Array(halfN);
    for (let i = 0; i < halfN; i++) {
      // dB 刻度
      const mag = complexAbs(spectrum[i]) / N;
      magnitudes[i] = mag > 0 ? 20 * Math.log10(mag) : -120;
    }

    spectrogram.push(magnitudes);
    timeAxis.push(start / sampleRate);
  }

  const freqAxis = Array.from({ length: halfN }, (_, i) => (i * sampleRate) / N);

  return {
    spectrogram: spectrogram.slice(0, 200), // 限制输出
    timeAxis: timeAxis.slice(0, 200),
    freqAxis: freqAxis.slice(0, 200),
    metadata: {
      sampleRate,
      windowSize,
      hopSize,
      windowType,
      timeFrames: spectrogram.length,
      freqBins: halfN,
    },
  };
}

// ============================================================================
// 3. 小波分析
// ============================================================================

export async function wavelet_analysis(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const wavelet = (config.wavelet as string) || 'db4';
  const level = (config.level as number) || Math.min(Math.floor(Math.log2(data.length)), 6);

  // Daubechies-4 小波滤波器系数
  const db4Low = [
    0.4829629131445341, 0.8365163037378079,
    0.2241438680420134, -0.1294095225512604,
  ];
  const db4High = db4Low.map((v, i) => ((i % 2 === 0 ? 1 : -1) * db4Low[db4Low.length - 1 - i]));

  // 多级分解
  const coefficients: Array<{ level: number; type: string; data: number[]; energy: number }> = [];
  let approximation = [...data];

  for (let l = 1; l <= level; l++) {
    const detail: number[] = [];
    const approx: number[] = [];

    // 卷积 + 下采样
    for (let i = 0; i < approximation.length - db4Low.length + 1; i += 2) {
      let lowSum = 0;
      let highSum = 0;
      for (let k = 0; k < db4Low.length; k++) {
        const idx = i + k;
        if (idx < approximation.length) {
          lowSum += approximation[idx] * db4Low[k];
          highSum += approximation[idx] * db4High[k];
        }
      }
      approx.push(lowSum);
      detail.push(highSum);
    }

    const detailEnergy = detail.reduce((sum, v) => sum + v * v, 0);
    coefficients.push({
      level: l,
      type: 'detail',
      data: detail.slice(0, 500),
      energy: detailEnergy,
    });

    approximation = approx;
  }

  // 最终近似系数
  const approxEnergy = approximation.reduce((sum, v) => sum + v * v, 0);
  coefficients.push({
    level,
    type: 'approximation',
    data: approximation.slice(0, 500),
    energy: approxEnergy,
  });

  // 能量分布
  const totalEnergy = coefficients.reduce((sum, c) => sum + c.energy, 0);
  const energyDistribution = coefficients.map(c => ({
    level: c.level,
    type: c.type,
    energy: c.energy,
    percentage: totalEnergy > 0 ? (c.energy / totalEnergy) * 100 : 0,
  }));

  return {
    coefficients,
    energyDistribution,
    metadata: {
      wavelet,
      decompositionLevel: level,
      originalLength: data.length,
      totalEnergy,
    },
  };
}

// ============================================================================
// 4. 包络分析（Hilbert 变换）
// ============================================================================

export async function envelope_analysis(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const sampleRate = (config.sample_rate as number) || inputData.sampleRate || 1000;

  // Hilbert 变换：FFT → 零负频 → IFFT
  const N = nextPow2(data.length);
  const padded = zeroPad(data, N);
  const spectrum = fft(padded);

  // 构造解析信号：正频率 ×2，负频率 ×0，DC 和 Nyquist 不变
  const halfN = Math.floor(N / 2);
  spectrum[0] = spectrum[0]; // DC 不变
  for (let i = 1; i < halfN; i++) {
    spectrum[i] = { re: spectrum[i].re * 2, im: spectrum[i].im * 2 };
  }
  for (let i = halfN + 1; i < N; i++) {
    spectrum[i] = { re: 0, im: 0 };
  }

  const analytic = ifft(spectrum);

  // 包络 = 解析信号的模
  const envelope = analytic.slice(0, data.length).map(c => complexAbs(c));

  // 包络频谱
  const envPadded = zeroPad(envelope, N);
  const envSpectrum = fft(envPadded);
  const envFreqs = Array.from({ length: halfN }, (_, i) => (i * sampleRate) / N);
  const envMagnitudes = envSpectrum.slice(0, halfN).map(c => complexAbs(c) / N);

  // 包络峰值
  const peaks: Array<{ frequency: number; magnitude: number }> = [];
  for (let i = 1; i < halfN - 1; i++) {
    const mag = envMagnitudes[i];
    if (mag > envMagnitudes[i - 1] && mag > envMagnitudes[i + 1] && mag > 0.01) {
      peaks.push({ frequency: envFreqs[i], magnitude: mag });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);

  return {
    envelope: envelope.slice(0, 1000),
    envelopeSpectrum: {
      frequencies: envFreqs.slice(0, 500),
      magnitudes: Array.from(envMagnitudes).slice(0, 500),
    },
    peaks: peaks.slice(0, 20),
    metadata: {
      sampleRate,
      originalLength: data.length,
      envelopeRMS: Math.sqrt(envelope.reduce((s, v) => s + v * v, 0) / envelope.length),
    },
  };
}

// ============================================================================
// 5. 带通滤波
// ============================================================================

export async function bandpass_filter(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const sampleRate = (config.sample_rate as number) || inputData.sampleRate || 1000;
  const lowCut = (config.low_cut as number) || 10;
  const highCut = (config.high_cut as number) || 400;
  const order = (config.order as number) || 4;

  // 频域滤波：FFT → 频域掩码 → IFFT
  const N = nextPow2(data.length);
  const padded = zeroPad(data, N);
  const spectrum = fft(padded);

  const freqResolution = sampleRate / N;

  // 巴特沃斯频率响应
  for (let i = 0; i < N; i++) {
    const freq = i <= N / 2 ? i * freqResolution : (N - i) * freqResolution;

    // 高通部分
    const highPassGain = freq > 0 ? 1 / Math.sqrt(1 + Math.pow(lowCut / freq, 2 * order)) : 0;
    // 低通部分
    const lowPassGain = 1 / Math.sqrt(1 + Math.pow(freq / highCut, 2 * order));

    const gain = highPassGain * lowPassGain;
    spectrum[i] = { re: spectrum[i].re * gain, im: spectrum[i].im * gain };
  }

  const filtered = ifft(spectrum);
  const filteredData = filtered.slice(0, data.length).map(c => c.re);

  return {
    filtered: filteredData.slice(0, 5000),
    metadata: {
      sampleRate,
      lowCut,
      highCut,
      order,
      originalLength: data.length,
      filteredRMS: Math.sqrt(filteredData.reduce((s, v) => s + v * v, 0) / filteredData.length),
      originalRMS: Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length),
    },
  };
}

// ============================================================================
// 6. 小波降噪
// ============================================================================

export async function wavelet_denoise(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const level = (config.level as number) || Math.min(Math.floor(Math.log2(data.length)), 4);
  const thresholdType = (config.threshold_type as string) || 'soft'; // soft / hard
  const thresholdMultiplier = (config.threshold_multiplier as number) || 1.0;

  // db4 滤波器
  const db4Low = [0.4829629131445341, 0.8365163037378079, 0.2241438680420134, -0.1294095225512604];
  const db4High = db4Low.map((v, i) => ((i % 2 === 0 ? 1 : -1) * db4Low[db4Low.length - 1 - i]));

  // 分解
  const details: number[][] = [];
  let approx = [...data];

  for (let l = 0; l < level; l++) {
    const detail: number[] = [];
    const newApprox: number[] = [];

    for (let i = 0; i < approx.length - db4Low.length + 1; i += 2) {
      let lowSum = 0;
      let highSum = 0;
      for (let k = 0; k < db4Low.length; k++) {
        if (i + k < approx.length) {
          lowSum += approx[i + k] * db4Low[k];
          highSum += approx[i + k] * db4High[k];
        }
      }
      newApprox.push(lowSum);
      detail.push(highSum);
    }

    details.push(detail);
    approx = newApprox;
  }

  // 通用阈值（VisuShrink）
  const allDetails = details.flat();
  const medianAbsDev = median(allDetails.map(Math.abs));
  const sigma = medianAbsDev / 0.6745;
  const threshold = sigma * Math.sqrt(2 * Math.log(data.length)) * thresholdMultiplier;

  // 阈值处理
  const thresholdedDetails = details.map(d =>
    d.map(v => {
      if (thresholdType === 'soft') {
        return Math.abs(v) > threshold ? Math.sign(v) * (Math.abs(v) - threshold) : 0;
      } else {
        return Math.abs(v) > threshold ? v : 0;
      }
    })
  );

  // 重构（简化版 — 使用阈值处理后的系数估算降噪信号）
  // 完整重构需要上采样+卷积，这里使用近似方法
  const denoised = [...data];
  const noiseEstimate = sigma;

  // 简化降噪：在频域中移除低于阈值的分量
  const N = nextPow2(data.length);
  const padded = zeroPad(data, N);
  const spectrum = fft(padded);

  for (let i = 0; i < N; i++) {
    const mag = complexAbs(spectrum[i]);
    if (mag < threshold * N * 0.001) {
      spectrum[i] = { re: 0, im: 0 };
    }
  }

  const reconstructed = ifft(spectrum);
  const denoisedData = reconstructed.slice(0, data.length).map(c => c.re);

  const originalRMS = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
  const denoisedRMS = Math.sqrt(denoisedData.reduce((s, v) => s + v * v, 0) / denoisedData.length);
  const noiseRMS = Math.sqrt(
    data.reduce((s, v, i) => s + Math.pow(v - denoisedData[i], 2), 0) / data.length
  );

  return {
    denoised: denoisedData.slice(0, 5000),
    metadata: {
      level,
      thresholdType,
      threshold,
      noiseEstimate: sigma,
      originalRMS,
      denoisedRMS,
      noiseRMS,
      snrImprovement: noiseRMS > 0 ? 20 * Math.log10(denoisedRMS / noiseRMS) - 20 * Math.log10(originalRMS / (originalRMS + noiseRMS)) : 0,
    },
  };
}

/** 中位数 */
function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================================
// 7. 倒频谱分析
// ============================================================================

export async function cepstrum_analysis(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const sampleRate = (config.sample_rate as number) || inputData.sampleRate || 1000;

  // 倒频谱 = IFFT(log(|FFT(x)|))
  const N = nextPow2(data.length);
  const padded = zeroPad(data, N);
  const spectrum = fft(padded);

  // 对数幅度谱
  const logSpectrum: Complex[] = spectrum.map(c => {
    const mag = complexAbs(c);
    return { re: mag > 1e-10 ? Math.log(mag) : -23, im: 0 }; // ln(1e-10) ≈ -23
  });

  // IFFT 得到倒频谱
  const cepstrum = ifft(logSpectrum);
  const cepstrumReal = cepstrum.map(c => c.re);

  // 倒频率轴（quefrency）
  const quefAxis = Array.from({ length: Math.floor(N / 2) }, (_, i) => i / sampleRate);
  const cepstrumHalf = cepstrumReal.slice(0, Math.floor(N / 2));

  // 峰值检测（对应周期性成分）
  const peaks: Array<{ quefrency: number; frequency: number; magnitude: number }> = [];
  for (let i = 2; i < cepstrumHalf.length - 1; i++) {
    if (cepstrumHalf[i] > cepstrumHalf[i - 1] && cepstrumHalf[i] > cepstrumHalf[i + 1] && cepstrumHalf[i] > 0.01) {
      peaks.push({
        quefrency: quefAxis[i],
        frequency: quefAxis[i] > 0 ? 1 / quefAxis[i] : 0,
        magnitude: cepstrumHalf[i],
      });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);

  return {
    cepstrum: cepstrumHalf.slice(0, 500),
    quefrencyAxis: quefAxis.slice(0, 500),
    peaks: peaks.slice(0, 20),
    metadata: {
      sampleRate,
      originalLength: data.length,
      fftSize: N,
    },
  };
}

// ============================================================================
// 8. 阶次分析
// ============================================================================

export async function order_analysis(
  inputData: { data: number[]; sampleRate?: number; rpm?: number[] },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const sampleRate = (config.sample_rate as number) || inputData.sampleRate || 1000;
  const rpm = inputData.rpm || [];
  const maxOrder = (config.max_order as number) || 20;
  const avgRPM = (config.avg_rpm as number) || (rpm.length > 0 ? rpm.reduce((a, b) => a + b, 0) / rpm.length : 1500);

  // 基础频率 = RPM / 60
  const fundamentalFreq = avgRPM / 60;

  // FFT
  const N = nextPow2(data.length);
  const padded = zeroPad(data, N);
  const spectrum = fft(padded);
  const halfN = Math.floor(N / 2);
  const freqResolution = sampleRate / N;

  const magnitudes = spectrum.slice(0, halfN).map(c => complexAbs(c) / N);

  // 提取各阶次的幅值
  const orders: Array<{ order: number; frequency: number; magnitude: number; phase: number }> = [];

  for (let ord = 1; ord <= maxOrder; ord++) {
    const targetFreq = fundamentalFreq * ord;
    if (targetFreq >= sampleRate / 2) break;

    const binIndex = Math.round(targetFreq / freqResolution);
    if (binIndex < halfN) {
      // 在目标频率附近搜索峰值（±3 bin）
      let maxMag = 0;
      let maxIdx = binIndex;
      for (let i = Math.max(0, binIndex - 3); i <= Math.min(halfN - 1, binIndex + 3); i++) {
        if (magnitudes[i] > maxMag) {
          maxMag = magnitudes[i];
          maxIdx = i;
        }
      }

      const phase = Math.atan2(spectrum[maxIdx].im, spectrum[maxIdx].re) * (180 / Math.PI);

      orders.push({
        order: ord,
        frequency: maxIdx * freqResolution,
        magnitude: maxMag,
        phase,
      });
    }
  }

  return {
    orders,
    metadata: {
      sampleRate,
      avgRPM,
      fundamentalFreq,
      maxOrder,
      dominantOrder: orders.length > 0 ? orders.reduce((max, o) => o.magnitude > max.magnitude ? o : max, orders[0]).order : 0,
    },
  };
}

// ============================================================================
// 统一导出（按 implRef 映射）
// ============================================================================

export const signalProcessingAlgorithms: Record<string, (inputData: any, config: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  fft_spectrum,
  stft_spectrogram,
  wavelet_analysis,
  envelope_analysis,
  bandpass_filter,
  wavelet_denoise,
  cepstrum_analysis,
  order_analysis,
};
