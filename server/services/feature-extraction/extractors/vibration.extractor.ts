/**
 * 振动特征提取器
 * ============================================================
 * 
 * 输入：加速度/速度/位移波形（waveform 数组）
 * 输出：时域统计 + 频域特征 + 包络特征
 * 
 * 参考标准：
 *   - ISO 10816 / ISO 20816 机械振动评估
 *   - VDI 3832 振动测量与评估
 */

import {
  DataType,
  FeatureExtractor,
  RawTelemetryMessage,
  VibrationFeatures,
} from '../types';
import {
  fft, magnitude, zeroPad, hanningWindow,
  rms, peak, peakToPeak, kurtosis, skewness, crestFactor,
  dominantFrequency, spectralCentroid, spectralBandwidth,
  envelope,
} from '../dsp-utils';

export class VibrationExtractor implements FeatureExtractor {
  readonly name = 'VibrationExtractor';
  readonly version = '1.0.0';
  readonly supportedTypes = [DataType.VIBRATION];

  private fftPadMultiplier: number;

  constructor(fftPadMultiplier: number = 2) {
    this.fftPadMultiplier = fftPadMultiplier;
  }

  validate(raw: RawTelemetryMessage): { valid: boolean; reason?: string } {
    if (!raw.waveform || !Array.isArray(raw.waveform)) {
      return { valid: false, reason: '缺少 waveform 数组' };
    }
    if (raw.waveform.length < 64) {
      return { valid: false, reason: `waveform 长度不足: ${raw.waveform.length} < 64` };
    }
    if (!raw.sample_rate || raw.sample_rate <= 0) {
      return { valid: false, reason: '缺少有效的 sample_rate' };
    }
    return { valid: true };
  }

  async extract(raw: RawTelemetryMessage): Promise<Record<string, number | string | boolean>> {
    const waveform = raw.waveform!;
    const sampleRate = raw.sample_rate!;

    // ---- 时域特征 ----
    const rmsVal = rms(waveform);
    const peakVal = peak(waveform);
    const p2p = peakToPeak(waveform);
    const kurt = kurtosis(waveform);
    const skew = skewness(waveform);
    const cf = crestFactor(waveform);

    // ---- 频域特征 ----
    const windowed = hanningWindow(waveform);
    const padded = zeroPad(windowed, this.fftPadMultiplier);
    const [re, im] = fft(padded);
    const mag = magnitude(re, im);

    const [domFreq, domAmp] = dominantFrequency(mag, sampleRate);
    const centroid = spectralCentroid(mag, sampleRate);
    const bandwidth = spectralBandwidth(mag, sampleRate);

    // ---- 包络特征 ----
    let envRms = 0;
    let envPeak = 0;
    try {
      const env = envelope(waveform);
      envRms = rms(env);
      envPeak = peak(env);
    } catch {
      // 包络提取失败时跳过（非关键特征）
    }

    const features: VibrationFeatures = {
      rms: round(rmsVal, 6),
      peak: round(peakVal, 6),
      peak_to_peak: round(p2p, 6),
      kurtosis: round(kurt, 4),
      crest_factor: round(cf, 4),
      skewness: round(skew, 4),
      dominant_freq: round(domFreq, 2),
      dominant_amp: round(domAmp, 6),
      spectral_centroid: round(centroid, 2),
      spectral_bandwidth: round(bandwidth, 2),
      envelope_rms: round(envRms, 6),
      envelope_peak: round(envPeak, 6),
    };

    return features as unknown as Record<string, number | string | boolean>;
  }
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export default VibrationExtractor;
