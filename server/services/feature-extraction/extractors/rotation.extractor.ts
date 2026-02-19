/**
 * 旋转特征提取器
 * ============================================================
 * 
 * 输入：转速/角位移信号
 * 输出：转速统计 + 阶次分析 + 稳定性指标
 * 
 * 支持两种输入模式：
 *   1. 单值模式：value = 当前转速 RPM（维护滑动窗口）
 *   2. 波形模式：waveform = 键相/编码器脉冲信号（做阶次分析）
 * 
 * 参考标准：
 *   - ISO 7919 旋转机械轴振动
 *   - API 670 机械保护系统
 */

import {
  DataType,
  FeatureExtractor,
  RawTelemetryMessage,
  RotationFeatures,
} from '../types';
import {
  fft, magnitude, zeroPad, hanningWindow,
  mean, stdDev,
  dominantFrequency, extractHarmonics,
} from '../dsp-utils';

interface RpmEntry {
  rpm: number;
  timestamp: number;
}

export class RotationExtractor implements FeatureExtractor {
  readonly name = 'RotationExtractor';
  readonly version = '1.0.0';
  readonly supportedTypes = [DataType.ROTATION];

  /** RPM 滑动窗口：key = device_code:mp_code */
  private rpmWindows: Map<string, RpmEntry[]> = new Map();
  private windowSizeSec: number;

  constructor(windowSizeSec: number = 30) {
    this.windowSizeSec = windowSizeSec;
  }

  validate(raw: RawTelemetryMessage): { valid: boolean; reason?: string } {
    // 至少需要 value（RPM）或 waveform（脉冲信号）
    const hasValue = raw.value !== undefined && raw.value !== null && !isNaN(raw.value);
    const hasWaveform = raw.waveform && Array.isArray(raw.waveform) && raw.waveform.length >= 64;

    if (!hasValue && !hasWaveform) {
      return { valid: false, reason: '需要 value（RPM）或 waveform（脉冲信号）' };
    }
    return { valid: true };
  }

  async extract(raw: RawTelemetryMessage): Promise<Record<string, number | string | boolean>> {
    const key = `${raw.device_code}:${raw.mp_code}`;
    const now = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();

    let currentRpm: number;
    let order1x = 0, order2x = 0, order3x = 0, subSync = 0;

    if (raw.waveform && raw.waveform.length >= 64 && raw.sample_rate) {
      // 波形模式：从振动信号中提取阶次特征
      const waveform = raw.waveform;
      const sampleRate = raw.sample_rate;

      const windowed = hanningWindow(waveform);
      const padded = zeroPad(windowed, 2);
      const [re, im] = fft(padded);
      const mag = magnitude(re, im);

      const [domFreq] = dominantFrequency(mag, sampleRate);
      currentRpm = domFreq * 60; // 主频 → RPM

      // 阶次分析（基于转频）
      const rotFreq = currentRpm / 60; // 转频 Hz
      if (rotFreq > 0) {
        const harmonics = extractHarmonics(mag, rotFreq, sampleRate, 4);
        order1x = harmonics[0] || 0;
        order2x = harmonics[1] || 0;
        order3x = harmonics[2] || 0;

        // 亚同步分量（0.3x - 0.5x 范围内最大值）
        const freqRes = sampleRate / ((mag.length - 1) * 2);
        const lowBin = Math.floor(rotFreq * 0.3 / freqRes);
        const highBin = Math.ceil(rotFreq * 0.5 / freqRes);
        for (let i = lowBin; i <= highBin && i < mag.length; i++) {
          if (mag[i] > subSync) subSync = mag[i];
        }
      }
    } else {
      // 单值模式：直接使用 RPM 值
      currentRpm = raw.value!;
    }

    // 更新 RPM 滑动窗口
    if (!this.rpmWindows.has(key)) {
      this.rpmWindows.set(key, []);
    }
    const window = this.rpmWindows.get(key)!;
    window.push({ rpm: currentRpm, timestamp: now });

    // 清理过期
    const cutoff = now - this.windowSizeSec * 1000;
    while (window.length > 0 && window[0].timestamp < cutoff) {
      window.shift();
    }
    if (window.length > 5000) {
      window.splice(0, window.length - 5000);
    }

    const rpmValues = window.map(e => e.rpm);
    const rpmMean = mean(rpmValues);
    const rpmStd = stdDev(rpmValues);

    // 转速波动率
    const fluctuation = rpmMean > 0 ? (rpmStd / rpmMean) * 100 : 0;

    // 稳定性指数（0-1，1=完全稳定）
    const stability = rpmMean > 0
      ? Math.max(0, 1 - fluctuation / 10) // 波动率 10% 时稳定性为 0
      : 0;

    const features: RotationFeatures = {
      rpm: round(currentRpm, 1),
      rpm_fluctuation: round(fluctuation, 2),
      order_1x_amplitude: round(order1x, 6),
      order_2x_amplitude: round(order2x, 6),
      order_3x_amplitude: round(order3x, 6),
      sub_synchronous: round(subSync, 6),
      stability_index: round(stability, 4),
    };

    return features as unknown as Record<string, number | string | boolean>;
  }

  clearWindow(deviceCode: string, mpCode: string): void {
    this.rpmWindows.delete(`${deviceCode}:${mpCode}`);
  }

  clearAll(): void {
    this.rpmWindows.clear();
  }
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export default RotationExtractor;
