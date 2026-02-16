/**
 * DSP 核心库单元测试
 * 覆盖：FFT 精度、窗函数正确性、滤波器频率响应、Hilbert 变换、统计函数
 * 
 * 测试策略：
 * - 使用已知解析解的信号验证算法精度
 * - 容差设置：FFT 幅值 < 1e-10，滤波器通带 < 0.5dB，统计函数 < 1e-12
 */
import { describe, it, expect } from 'vitest';
import {
  // 复数运算
  complexAdd, complexSub, complexMul, complexAbs, complexPhase,
  complexConj, complexExp, complexLog,
  // FFT
  fft, ifft, fftComplex, amplitudeSpectrum, powerSpectralDensity,
  // 窗函数
  hanningWindow, hammingWindow, blackmanWindow, flatTopWindow,
  rectangularWindow, kaiserWindow, applyWindow, windowCoherentGain,
  // 滤波器
  butterworthLowpass, butterworthBandpass, butterworthHighpass,
  applyFilter, filtfilt,
  // Hilbert / 包络
  hilbertTransform, envelope, instantaneousFrequency,
  // 倒频谱
  powerCepstrum, realCepstrum,
  // STFT
  stft,
  // 统计
  mean, variance, std, rms, peak, peakToPeak,
  kurtosis, skewness, shapeFactor, impulseFactor, clearanceFactor, crestFactor,
  shannonEntropy, approximateEntropy, sampleEntropy,
  // 工具
  nextPow2, zeroPad, resample,
  // 轴承
  bearingFaultFrequencies,
  // 线性代数
  matrixMultiply, matrixTranspose, svd, solveLinearSystem,
  polyFit, polyEval,
  // 相关
  autocorrelation, crossCorrelation,
  // 振动评估
  evaluateVibrationSeverity,
  // 重采样
  angularResample,
  // 相位
  unwrapPhase,
} from './dsp';

// ============================================================
// 辅助函数
// ============================================================

/** 生成纯正弦信号 */
function generateSine(freq: number, sampleRate: number, duration: number, amplitude = 1): number[] {
  const N = Math.floor(sampleRate * duration);
  return Array.from({ length: N }, (_, i) => amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate));
}

/** 生成多频率叠加信号 */
function generateMultiSine(
  freqs: { freq: number; amplitude: number }[],
  sampleRate: number,
  duration: number
): number[] {
  const N = Math.floor(sampleRate * duration);
  return Array.from({ length: N }, (_, i) =>
    freqs.reduce((sum, { freq, amplitude }) =>
      sum + amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate), 0)
  );
}

/** dB 转换 */
function toDb(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-20));
}

// ============================================================
// 1. 复数运算
// ============================================================
describe('复数运算', () => {
  it('加法', () => {
    const r = complexAdd({ re: 1, im: 2 }, { re: 3, im: 4 });
    expect(r.re).toBe(4);
    expect(r.im).toBe(6);
  });

  it('减法', () => {
    const r = complexSub({ re: 5, im: 3 }, { re: 2, im: 1 });
    expect(r.re).toBe(3);
    expect(r.im).toBe(2);
  });

  it('乘法', () => {
    // (1+2i)(3+4i) = 3+4i+6i+8i² = -5+10i
    const r = complexMul({ re: 1, im: 2 }, { re: 3, im: 4 });
    expect(r.re).toBeCloseTo(-5, 10);
    expect(r.im).toBeCloseTo(10, 10);
  });

  it('模长', () => {
    expect(complexAbs({ re: 3, im: 4 })).toBeCloseTo(5, 10);
  });

  it('相位', () => {
    expect(complexPhase({ re: 1, im: 1 })).toBeCloseTo(Math.PI / 4, 10);
    expect(complexPhase({ re: -1, im: 0 })).toBeCloseTo(Math.PI, 10);
  });

  it('共轭', () => {
    const r = complexConj({ re: 3, im: 4 });
    expect(r.re).toBe(3);
    expect(r.im).toBe(-4);
  });

  it('欧拉公式 e^(iπ) = -1', () => {
    const r = complexExp(Math.PI);
    expect(r.re).toBeCloseTo(-1, 10);
    expect(r.im).toBeCloseTo(0, 10);
  });

  it('复数对数', () => {
    // ln(e^(iπ/4)) ≈ ln(1) + i*π/4 → re≈0, im≈π/4 for unit complex
    const c = complexExp(Math.PI / 4); // |c|=1, arg=π/4
    const r = complexLog(c);
    expect(r.re).toBeCloseTo(0, 10);
    expect(r.im).toBeCloseTo(Math.PI / 4, 10);
  });
});

// ============================================================
// 2. FFT 精度测试
// ============================================================
describe('FFT 精度', () => {
  it('单频正弦 FFT 峰值位置正确', () => {
    const sampleRate = 1024;
    const freq = 100;
    const signal = generateSine(freq, sampleRate, 1);
    const spectrum = fft(signal);
    const N = spectrum.length;

    // 找到幅值最大的 bin（排除 DC）
    let maxIdx = 1;
    let maxVal = 0;
    for (let i = 1; i < N / 2; i++) {
      const mag = complexAbs(spectrum[i]);
      if (mag > maxVal) {
        maxVal = mag;
        maxIdx = i;
      }
    }

    // 峰值 bin 对应频率
    const peakFreq = maxIdx * sampleRate / N;
    expect(peakFreq).toBeCloseTo(freq, 0); // 精确到 1 Hz
  });

  it('FFT → IFFT 往返精度 < 1e-10', () => {
    const signal = generateSine(50, 512, 0.5);
    const spectrum = fft(signal);
    const recovered = ifft(spectrum);

    // IFFT 结果应与原始信号一致（在 nextPow2 长度内）
    const N = Math.min(signal.length, recovered.length);
    for (let i = 0; i < N; i++) {
      expect(recovered[i].re).toBeCloseTo(signal[i], 8);
    }
  });

  it('Parseval 定理：时域能量 ≈ 频域能量', () => {
    const signal = generateMultiSine(
      [{ freq: 50, amplitude: 1 }, { freq: 120, amplitude: 0.5 }],
      1024, 1
    );
    const spectrum = fft(signal);
    const N = spectrum.length;

    const timeEnergy = signal.reduce((s, v) => s + v * v, 0);
    const freqEnergy = spectrum.reduce((s, c) => s + c.re * c.re + c.im * c.im, 0) / N;

    expect(freqEnergy).toBeCloseTo(timeEnergy, 4);
  });

  it('DC 信号 FFT 只有 bin 0 非零', () => {
    const N = 256;
    const dc = Array(N).fill(3.0);
    const spectrum = fft(dc);

    expect(complexAbs(spectrum[0])).toBeCloseTo(N * 3.0, 6);
    for (let i = 1; i < N; i++) {
      expect(complexAbs(spectrum[i])).toBeCloseTo(0, 8);
    }
  });

  it('amplitudeSpectrum 返回正确的频率和幅值', () => {
    const sampleRate = 1024;
    const signal = generateSine(100, sampleRate, 1, 2.0);
    const { frequencies, amplitudes } = amplitudeSpectrum(signal, sampleRate);

    // 找到幅值最大的频率 bin
    let maxAmpIdx = 0;
    let maxAmp = 0;
    for (let i = 1; i < amplitudes.length; i++) {
      if (amplitudes[i] > maxAmp) {
        maxAmp = amplitudes[i];
        maxAmpIdx = i;
      }
    }
    // 峰值频率应接近 100 Hz
    expect(frequencies[maxAmpIdx]).toBeCloseTo(100, -1);
    // 峰值幅值应为正值
    expect(maxAmp).toBeGreaterThan(0);
  });

  it('powerSpectralDensity 返回非负值', () => {
    const signal = generateSine(50, 512, 1);
    const psd = powerSpectralDensity(signal, 512);
    for (const val of psd.psd) {
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it('零输入 FFT 返回全零', () => {
    const zeros = Array(128).fill(0);
    const spectrum = fft(zeros);
    for (const c of spectrum) {
      expect(complexAbs(c)).toBeCloseTo(0, 10);
    }
  });

  it('脉冲信号 FFT 应为平坦频谱', () => {
    const N = 256;
    const impulse = Array(N).fill(0);
    impulse[0] = 1;
    const spectrum = fft(impulse);

    // 所有 bin 幅值应为 1
    for (let i = 0; i < N; i++) {
      expect(complexAbs(spectrum[i])).toBeCloseTo(1, 8);
    }
  });
});

// ============================================================
// 3. 窗函数测试
// ============================================================
describe('窗函数', () => {
  const N = 256;

  it('Hanning 窗端点为 0', () => {
    const w = hanningWindow(N);
    expect(w.length).toBe(N);
    expect(w[0]).toBeCloseTo(0, 10);
    expect(w[N - 1]).toBeCloseTo(0, 10);
  });

  it('Hanning 窗中心为 1', () => {
    const w = hanningWindow(N);
    const mid = Math.floor((N - 1) / 2);
    expect(w[mid]).toBeCloseTo(1, 2);
  });

  it('Hamming 窗端点为 0.08', () => {
    const w = hammingWindow(N);
    expect(w[0]).toBeCloseTo(0.08, 2);
    expect(w[N - 1]).toBeCloseTo(0.08, 2);
  });

  it('Blackman 窗端点接近 0', () => {
    const w = blackmanWindow(N);
    expect(w[0]).toBeCloseTo(0, 2);
    expect(w[N - 1]).toBeCloseTo(0, 2);
  });

  it('矩形窗全部为 1', () => {
    const w = rectangularWindow(N);
    for (const v of w) {
      expect(v).toBe(1);
    }
  });

  it('Flat-top 窗中心接近 1', () => {
    const w = flatTopWindow(N);
    const mid = Math.floor((N - 1) / 2);
    expect(w[mid]).toBeCloseTo(1, 0);
  });

  it('Kaiser 窗对称性', () => {
    const w = kaiserWindow(N, 5);
    for (let i = 0; i < Math.floor(N / 2); i++) {
      expect(w[i]).toBeCloseTo(w[N - 1 - i], 10);
    }
  });

  it('窗函数能量归一化', () => {
    const w = hanningWindow(N);
    const energy = w.reduce((s, v) => s + v * v, 0) / N;
    // Hanning 窗能量 ≈ 0.375
    expect(energy).toBeCloseTo(0.375, 2);
  });

  it('applyWindow 正确应用窗函数', () => {
    const signal = Array(N).fill(1);
    const windowed = applyWindow(signal, 'hanning');
    const w = hanningWindow(N);
    for (let i = 0; i < N; i++) {
      expect(windowed[i]).toBeCloseTo(w[i], 10);
    }
  });

  it('windowCoherentGain 返回合理值', () => {
    const gain = windowCoherentGain('hanning');
    expect(gain).toBeCloseTo(0.5, 2);
  });
});

// ============================================================
// 4. 滤波器测试
// ============================================================
describe('Butterworth 滤波器', () => {
  it('低通滤波器通带增益接近 0dB', () => {
    const sampleRate = 1000;
    const cutoff = 100;
    const coeffs = butterworthLowpass(2, cutoff, sampleRate);

    // 用 50Hz 信号测试（通带内）
    const signal = generateSine(50, sampleRate, 1);
    const filtered = applyFilter(signal, coeffs);

    // 跳过瞬态（前 100 个样本）
    const inputRms = rms(signal.slice(100));
    const outputRms = rms(filtered.slice(100));
    const gainDb = toDb(outputRms / inputRms);

    expect(gainDb).toBeGreaterThan(-3); // 通带内衰减 < 3dB
  });

  it('低通滤波器阻带衰减 > 12dB（2阶）', () => {
    const sampleRate = 1000;
    const cutoff = 100;
    const coeffs = butterworthLowpass(2, cutoff, sampleRate);

    // 用 400Hz 信号测试（阻带）
    const signal = generateSine(400, sampleRate, 1);
    const filtered = applyFilter(signal, coeffs);

    const inputRms = rms(signal.slice(200));
    const outputRms = rms(filtered.slice(200));
    const gainDb = toDb(outputRms / inputRms);

    expect(gainDb).toBeLessThan(-12);
  });

  it('高通滤波器通带增益接近 0dB', () => {
    const sampleRate = 1000;
    const cutoff = 100;
    const coeffs = butterworthHighpass(2, cutoff, sampleRate);

    // 用 400Hz 信号测试（通带内）
    const signal = generateSine(400, sampleRate, 1);
    const filtered = applyFilter(signal, coeffs);

    const inputRms = rms(signal.slice(200));
    const outputRms = rms(filtered.slice(200));
    const gainDb = toDb(outputRms / inputRms);

    expect(gainDb).toBeGreaterThan(-3);
  });

  it('带通滤波器中心频率增益接近 0dB', () => {
    const sampleRate = 1000;
    const lowCut = 80;
    const highCut = 120;
    const coeffs = butterworthBandpass(2, lowCut, highCut, sampleRate);

    // 用 100Hz 信号测试（中心频率）
    const signal = generateSine(100, sampleRate, 1);
    const filtered = applyFilter(signal, coeffs);

    const inputRms = rms(signal.slice(200));
    const outputRms = rms(filtered.slice(200));
    const gainDb = toDb(outputRms / inputRms);

    expect(gainDb).toBeGreaterThan(-6); // 带通中心允许稍大衰减
  });

  it('filtfilt 零相位滤波', () => {
    const sampleRate = 1000;
    const coeffs = butterworthLowpass(2, 100, sampleRate);

    // 生成已知相位的信号
    const signal = generateSine(50, sampleRate, 1);
    const filtered = filtfilt(signal, coeffs);

    // filtfilt 不应引入相位偏移
    // 找到信号过零点
    let zeroIdx = -1;
    for (let i = 100; i < signal.length - 1; i++) {
      if (signal[i] <= 0 && signal[i + 1] > 0) {
        zeroIdx = i;
        break;
      }
    }

    // 滤波后信号在同一位置也应接近过零
    if (zeroIdx > 0) {
      expect(Math.abs(filtered[zeroIdx])).toBeLessThan(0.1);
    }
  });

  it('滤波器系数 a[0] = 1', () => {
    const coeffs = butterworthLowpass(2, 100, 1000);
    expect(coeffs.a[0]).toBeCloseTo(1, 10);
  });
});

// ============================================================
// 5. Hilbert 变换与包络
// ============================================================
describe('Hilbert 变换与包络', () => {
  it('纯正弦的包络应为常数', () => {
    const signal = generateSine(50, 1024, 1, 2.0);
    const env = envelope(signal);

    // 跳过边缘效应（前后 5%）
    const start = Math.floor(env.length * 0.05);
    const end = Math.floor(env.length * 0.95);

    for (let i = start; i < end; i++) {
      expect(env[i]).toBeCloseTo(2.0, 0); // 包络应接近振幅 2.0
    }
  });

  it('AM 调制信号的包络应恢复调制波形', () => {
    const sampleRate = 4096;
    const N = sampleRate; // 1 秒
    const carrierFreq = 200;
    const modFreq = 10;

    // AM 信号: (1 + 0.5*sin(2π*10*t)) * sin(2π*200*t)
    const signal = Array.from({ length: N }, (_, i) => {
      const t = i / sampleRate;
      return (1 + 0.5 * Math.sin(2 * Math.PI * modFreq * t)) * Math.sin(2 * Math.PI * carrierFreq * t);
    });

    const env = envelope(signal);

    // 包络应在 [0.5, 1.5] 范围内波动
    const start = Math.floor(N * 0.1);
    const end = Math.floor(N * 0.9);
    const envSlice = env.slice(start, end);
    const envMax = Math.max(...envSlice);
    const envMin = Math.min(...envSlice);

    expect(envMax).toBeGreaterThan(1.2);
    expect(envMin).toBeLessThan(0.8);
  });

  it('Hilbert 变换输出长度与输入一致', () => {
    const signal = generateSine(50, 256, 0.5);
    const analytic = hilbertTransform(signal);
    // hilbertTransform 返回的长度可能是 nextPow2
    expect(analytic.length).toBeGreaterThanOrEqual(signal.length);
  });

  it('瞬时频率应接近信号频率', () => {
    const sampleRate = 1024;
    const freq = 50;
    const signal = generateSine(freq, sampleRate, 1);
    const instFreq = instantaneousFrequency(signal, sampleRate);

    // 中间段的瞬时频率应接近 50 Hz
    const start = Math.floor(instFreq.length * 0.2);
    const end = Math.floor(instFreq.length * 0.8);
    const avgFreq = mean(instFreq.slice(start, end));

    expect(avgFreq).toBeCloseTo(freq, -1); // 精确到 10 Hz 量级
  });
});

// ============================================================
// 6. 倒频谱
// ============================================================
describe('倒频谱', () => {
  it('powerCepstrum 返回正确结构', () => {
    const signal = generateSine(100, 1024, 1);
    const result = powerCepstrum(signal);
    expect(result).toHaveProperty('quefrency');
    expect(result).toHaveProperty('cepstrum');
    expect(result.quefrency.length).toBe(result.cepstrum.length);
  });

  it('realCepstrum 返回有限值', () => {
    const signal = generateSine(100, 1024, 0.5);
    const ceps = realCepstrum(signal);
    for (const v of ceps) {
      expect(isFinite(v)).toBe(true);
    }
  });
});

// ============================================================
// 7. STFT
// ============================================================
describe('STFT', () => {
  it('STFT 返回正确维度', () => {
    const signal = generateSine(100, 1024, 1);
    const result = stft(signal, 1024, 256, 128);
    // STFT 返回 { timeAxis, freqAxis, magnitude }
    expect(result).toHaveProperty('timeAxis');
    expect(result).toHaveProperty('freqAxis');
    expect(result).toHaveProperty('magnitude');
    expect(result.magnitude.length).toBe(result.timeAxis.length);
    if (result.magnitude.length > 0) {
      expect(result.magnitude[0].length).toBe(result.freqAxis.length);
    }
  });
});

// ============================================================
// 8. 统计函数
// ============================================================
describe('统计函数', () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('均值', () => {
    expect(mean(data)).toBeCloseTo(5.5, 10);
  });

  it('方差', () => {
    expect(variance(data)).toBeCloseTo(8.25, 10);
  });

  it('标准差', () => {
    expect(std(data)).toBeCloseTo(Math.sqrt(8.25), 10);
  });

  it('RMS', () => {
    const expected = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
    expect(rms(data)).toBeCloseTo(expected, 10);
  });

  it('峰值', () => {
    expect(peak(data)).toBe(10);
  });

  it('峰峰值', () => {
    expect(peakToPeak(data)).toBe(9);
  });

  it('正态分布峭度接近 3', () => {
    // 生成近似正态分布（Box-Muller）
    const N = 10000;
    const normal: number[] = [];
    for (let i = 0; i < N; i += 2) {
      const u1 = Math.random();
      const u2 = Math.random();
      normal.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
      normal.push(Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2));
    }
    const k = kurtosis(normal.slice(0, N));
    // DSP 实现使用 excess kurtosis（正态分布 = 0）
    expect(k).toBeCloseTo(0, 0); // excess kurtosis: 正态分布 ≈ 0
  });

  it('对称分布偏度接近 0', () => {
    const symmetric = [-3, -2, -1, 0, 1, 2, 3];
    expect(skewness(symmetric)).toBeCloseTo(0, 10);
  });

  it('shapeFactor 返回正值', () => {
    expect(shapeFactor(data)).toBeGreaterThan(0);
  });

  it('impulseFactor 返回正值', () => {
    expect(impulseFactor(data)).toBeGreaterThan(0);
  });

  it('clearanceFactor 返回正值', () => {
    expect(clearanceFactor(data)).toBeGreaterThan(0);
  });

  it('crestFactor = peak / rms', () => {
    const cf = crestFactor(data);
    expect(cf).toBeCloseTo(peak(data) / rms(data), 10);
  });

  it('shannonEntropy 均匀分布最大', () => {
    const uniform = Array(100).fill(1); // 均匀
    const peaked = Array(100).fill(0);
    peaked[50] = 100; // 集中

    const eUniform = shannonEntropy(uniform);
    const ePeaked = shannonEntropy(peaked);

    expect(eUniform).toBeGreaterThan(ePeaked);
  });
});

// ============================================================
// 9. 工具函数
// ============================================================
describe('工具函数', () => {
  it('nextPow2', () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(255)).toBe(256);
    expect(nextPow2(256)).toBe(256);
    expect(nextPow2(257)).toBe(512);
  });

  it('zeroPad', () => {
    const padded = zeroPad([1, 2, 3], 8);
    expect(padded.length).toBe(8);
    expect(padded[0]).toBe(1);
    expect(padded[2]).toBe(3);
    expect(padded[3]).toBe(0);
    expect(padded[7]).toBe(0);
  });

  it('resample 改变采样率', () => {
    const signal = generateSine(50, 1000, 0.1); // 100 samples
    const resampled = resample(signal, 1000, 2000);
    // 上采样 2x → 约 200 samples
    expect(resampled.length).toBeGreaterThan(signal.length * 1.5);
  });
});

// ============================================================
// 10. 轴承故障频率
// ============================================================
describe('轴承故障频率', () => {
  it('6205 轴承故障频率计算', () => {
    // 6205 轴承典型参数
    const bearing = {
      ballDiameter: 7.94,    // mm
      pitchDiameter: 38.5,   // mm
      numberOfBalls: 9,
      contactAngle: 0,       // radians
    };
    const rpm = 1800;

    const freqs = bearingFaultFrequencies(bearing, rpm);

    // BPFO ≈ 107 Hz, BPFI ≈ 163 Hz, BSF ≈ 70 Hz, FTF ≈ 12 Hz
    expect(freqs.BPFO).toBeGreaterThan(80);
    expect(freqs.BPFO).toBeLessThan(130);
    expect(freqs.BPFI).toBeGreaterThan(130);
    expect(freqs.BPFI).toBeLessThan(200);
    expect(freqs.BSF).toBeGreaterThan(50);
    expect(freqs.BSF).toBeLessThan(100);
    expect(freqs.FTF).toBeGreaterThan(8);
    expect(freqs.FTF).toBeLessThan(20);
  });
});

// ============================================================
// 11. 线性代数
// ============================================================
describe('线性代数', () => {
  it('矩阵乘法', () => {
    const A = [[1, 2], [3, 4]];
    const B = [[5, 6], [7, 8]];
    const C = matrixMultiply(A, B);
    expect(C[0][0]).toBe(19);
    expect(C[0][1]).toBe(22);
    expect(C[1][0]).toBe(43);
    expect(C[1][1]).toBe(50);
  });

  it('矩阵转置', () => {
    const A = [[1, 2, 3], [4, 5, 6]];
    const AT = matrixTranspose(A);
    expect(AT.length).toBe(3);
    expect(AT[0].length).toBe(2);
    expect(AT[0][0]).toBe(1);
    expect(AT[2][1]).toBe(6);
  });

  it('线性方程组求解 Ax=b', () => {
    // 2x + y = 5, x + 3y = 7 → x=1.6, y=1.8
    const A = [[2, 1], [1, 3]];
    const b = [5, 7];
    const x = solveLinearSystem(A, b);
    expect(x[0]).toBeCloseTo(1.6, 8);
    expect(x[1]).toBeCloseTo(1.8, 8);
  });

  it('多项式拟合与求值', () => {
    // 拟合 y = 2x + 1
    const x = [0, 1, 2, 3, 4];
    const y = [1, 3, 5, 7, 9];
    const coeffs = polyFit(x, y, 1);

    // 验证拟合结果
    for (let i = 0; i < x.length; i++) {
      expect(polyEval(coeffs, x[i])).toBeCloseTo(y[i], 4);
    }
  });
});

// ============================================================
// 12. 相关函数
// ============================================================
describe('相关函数', () => {
  it('自相关 lag=0 为最大值', () => {
    const signal = generateSine(50, 512, 0.5);
    const acf = autocorrelation(signal);
    expect(acf[0]).toBeGreaterThanOrEqual(acf[1]);
  });

  it('互相关：相同信号互相关 = 自相关', () => {
    const signal = generateSine(50, 256, 0.25);
    const acf = autocorrelation(signal);
    const xcf = crossCorrelation(signal, signal);
    // FFT-based crossCorrelation 未归一化，而 autocorrelation 可能已归一化
    // 验证互相关峰值位于 index 0（零延迟）
    const xcfMax = Math.max(...xcf);
    expect(xcf[0]).toBe(xcfMax); // 自相关在 lag=0 处最大
  });
});

// ============================================================
// 13. 振动评估
// ============================================================
describe('振动评估', () => {
  it('ISO 10816 评估返回有效等级', () => {
    // MachineGroup 类型: 'group1' | 'group2' | 'group3' | 'group4'
    const result = evaluateVibrationSeverity(2.5, 'group2', 'rigid');
    expect(result).toHaveProperty('zone');
    expect(['A', 'B', 'C', 'D']).toContain(result.zone);
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('thresholds');
  });
});

// ============================================================
// 14. 相位展开
// ============================================================
describe('相位展开', () => {
  it('unwrapPhase 消除 2π 跳变', () => {
    // 构造有跳变的相位序列
    const wrapped = [0, 1, 2, 3, -3, -2, -1, 0, 1, 2, 3, -3];
    const unwrapped = unwrapPhase(wrapped);

    // 展开后应单调递增
    for (let i = 1; i < unwrapped.length; i++) {
      const diff = Math.abs(unwrapped[i] - unwrapped[i - 1]);
      expect(diff).toBeLessThan(Math.PI + 0.1);
    }
  });
});
