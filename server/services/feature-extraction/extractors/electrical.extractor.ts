/**
 * 电气特征提取器
 * ============================================================
 * 
 * 输入：电压/电流波形
 * 输出：基波分析 + 谐波失真 + 波形质量指标
 * 
 * 参考标准：
 *   - IEC 61000-4-7 谐波测量
 *   - IEEE 519 谐波控制
 */

import {
  DataType,
  FeatureExtractor,
  RawTelemetryMessage,
  ElectricalFeatures,
} from '../types';
import {
  fft, magnitude, zeroPad, hanningWindow,
  rms, peak, mean,
  dominantFrequency, extractHarmonics, computeTHD,
} from '../dsp-utils';

export class ElectricalExtractor implements FeatureExtractor {
  readonly name = 'ElectricalExtractor';
  readonly version = '1.0.0';
  readonly supportedTypes = [DataType.ELECTRICAL];

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

    // ---- 时域 ----
    const rmsVal = rms(waveform);
    const peakVal = peak(waveform);
    const meanVal = mean(waveform.map(Math.abs));
    const formFactor = meanVal > 0 ? rmsVal / meanVal : 0;

    // ---- 频域 ----
    const windowed = hanningWindow(waveform);
    const padded = zeroPad(windowed, 2);
    const [re, im] = fft(padded);
    const mag = magnitude(re, im);

    // 找基波频率（工频附近：45-65Hz 范围内最大值）
    const [domFreq, domAmp] = dominantFrequency(mag, sampleRate);

    // 如果主频在合理工频范围内，用它作为基波；否则假设 50Hz
    const fundamentalFreq = (domFreq >= 45 && domFreq <= 65) ? domFreq : 50;

    // 提取谐波（最多到 10 次）
    const harmonics = extractHarmonics(mag, fundamentalFreq, sampleRate, 10);

    // 计算 THD
    const thd = computeTHD(harmonics);

    const features: ElectricalFeatures = {
      fundamental_amplitude: round(harmonics[0] || domAmp, 6),
      fundamental_freq: round(fundamentalFreq, 2),
      thd: round(thd, 2),
      harmonic_amplitudes: harmonics.slice(1).map(h => round(h, 6)),
      rms: round(rmsVal, 6),
      peak: round(peakVal, 6),
      form_factor: round(formFactor, 4),
    };

    // 将数组展平为 Record 格式
    const result: Record<string, number | string | boolean> = {
      fundamental_amplitude: features.fundamental_amplitude,
      fundamental_freq: features.fundamental_freq,
      thd: features.thd,
      rms: features.rms,
      peak: features.peak,
      form_factor: features.form_factor,
    };

    // 谐波分量展开为独立字段
    features.harmonic_amplitudes.forEach((amp, i) => {
      result[`harmonic_${i + 2}x`] = amp;
    });

    return result;
  }
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export default ElectricalExtractor;
