/**
 * 声学特征提取器
 * ============================================================
 * 
 * 输入：麦克风/超声波传感器音频波形
 * 输出：声压级 + MFCC + 频谱特征
 * 
 * 应用场景：
 *   - 电机/轴承异常音检测
 *   - 泄漏检测（超声波）
 *   - 设备运行状态声纹识别
 * 
 * 参考标准：
 *   - IEC 61672 声级计
 *   - ISO 3745 声功率测量
 */

import {
  DataType,
  FeatureExtractor,
  RawTelemetryMessage,
  AcousticFeatures,
} from '../types';
import {
  fft, magnitude, zeroPad, hammingWindow,
  rms,
  spectralCentroid, spectralRolloff, spectralFlatness,
  zeroCrossingRate, shortTimeEnergy,
  computeMFCC,
} from '../dsp-utils';

/**
 * A 计权滤波器系数（简化版，基于 IEC 61672）
 * 返回给定频率的 A 计权增益 (dB)
 */
function aWeighting(freq: number): number {
  if (freq <= 0) return -Infinity;
  const f2 = freq * freq;
  const f4 = f2 * f2;
  const num = 12194 ** 2 * f4;
  const denom = (f2 + 20.6 ** 2)
    * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
    * (f2 + 12194 ** 2);
  if (denom === 0) return -Infinity;
  const ra = num / denom;
  return 20 * Math.log10(ra) + 2.0; // +2.0 dB 归一化校正
}

export class AcousticExtractor implements FeatureExtractor {
  readonly name = 'AcousticExtractor';
  readonly version = '1.0.0';
  readonly supportedTypes = [DataType.ACOUSTIC];

  private nMfccCoeffs: number;

  constructor(nMfccCoeffs: number = 13) {
    this.nMfccCoeffs = nMfccCoeffs;
  }

  validate(raw: RawTelemetryMessage): { valid: boolean; reason?: string } {
    if (!raw.waveform || !Array.isArray(raw.waveform)) {
      return { valid: false, reason: '缺少 waveform 数组' };
    }
    if (raw.waveform.length < 256) {
      return { valid: false, reason: `waveform 长度不足: ${raw.waveform.length} < 256（声学分析需要更长窗口）` };
    }
    if (!raw.sample_rate || raw.sample_rate <= 0) {
      return { valid: false, reason: '缺少有效的 sample_rate' };
    }
    return { valid: true };
  }

  async extract(raw: RawTelemetryMessage): Promise<Record<string, number | string | boolean>> {
    const waveform = raw.waveform!;
    const sampleRate = raw.sample_rate!;

    // ---- 声压级 (SPL) ----
    const rmsVal = rms(waveform);
    // 参考声压 20 μPa（空气中）
    const pRef = 20e-6;
    // 假设波形已校准为 Pa 单位；如果未校准则 SPL 为相对值
    const splDb = rmsVal > 0 ? 20 * Math.log10(rmsVal / pRef) : 0;

    // ---- A 计权声压级 ----
    const windowed = hammingWindow(waveform);
    const padded = zeroPad(windowed, 2);
    const nFft = padded.length;
    const [re, im] = fft(padded);
    const mag = magnitude(re, im);
    const freqRes = sampleRate / nFft;

    // 对每个频率 bin 应用 A 计权
    let aWeightedEnergy = 0;
    for (let i = 1; i < mag.length; i++) {
      const freq = i * freqRes;
      const weightDb = aWeighting(freq);
      const weightLinear = 10 ** (weightDb / 20);
      aWeightedEnergy += (mag[i] * weightLinear) ** 2;
    }
    const aWeightedRms = Math.sqrt(aWeightedEnergy);
    const splDba = aWeightedRms > 0 ? 20 * Math.log10(aWeightedRms / pRef) : 0;

    // ---- MFCC ----
    const mfcc = computeMFCC(waveform, sampleRate, this.nMfccCoeffs);

    // ---- 频谱特征 ----
    const centroid = spectralCentroid(mag, sampleRate);
    const rolloff = spectralRolloff(mag, sampleRate, 0.85);
    const flatness = spectralFlatness(mag);

    // ---- 时域特征 ----
    const zcr = zeroCrossingRate(waveform);
    const ste = shortTimeEnergy(waveform);

    const features: AcousticFeatures = {
      spl_db: round(splDb, 1),
      spl_dba: round(splDba, 1),
      mfcc: mfcc.map(c => round(c, 4)),
      spectral_centroid: round(centroid, 2),
      spectral_rolloff: round(rolloff, 2),
      spectral_flatness: round(flatness, 6),
      zero_crossing_rate: round(zcr, 6),
      short_time_energy: round(ste, 6),
    };

    // 展平为 Record 格式
    const result: Record<string, number | string | boolean> = {
      spl_db: features.spl_db,
      spl_dba: features.spl_dba,
      spectral_centroid: features.spectral_centroid,
      spectral_rolloff: features.spectral_rolloff,
      spectral_flatness: features.spectral_flatness,
      zero_crossing_rate: features.zero_crossing_rate,
      short_time_energy: features.short_time_energy,
    };

    // MFCC 展开为独立字段
    features.mfcc.forEach((coeff, i) => {
      result[`mfcc_${i}`] = coeff;
    });

    return result;
  }
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export default AcousticExtractor;
