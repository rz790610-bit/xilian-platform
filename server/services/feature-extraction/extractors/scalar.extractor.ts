/**
 * 标量特征提取器
 * ============================================================
 * 
 * 输入：温度/压力/流量/液位等单值量
 * 输出：统计特征 + 趋势分析 + 突变检测
 * 
 * 设计：维护每个测点的滑动窗口缓存，
 *       每次新值到达时基于窗口内历史数据计算特征
 */

import {
  DataType,
  FeatureExtractor,
  RawTelemetryMessage,
  ScalarFeatures,
} from '../types';
import {
  mean, stdDev, linearSlope, rateOfChange, detectStepChange,
} from '../dsp-utils';

interface WindowEntry {
  value: number;
  timestamp: number;
}

export class ScalarExtractor implements FeatureExtractor {
  readonly name = 'ScalarExtractor';
  readonly version = '1.0.0';
  readonly supportedTypes = [DataType.SCALAR];

  /** 滑动窗口：key = device_code:mp_code */
  private windows: Map<string, WindowEntry[]> = new Map();
  /** 基线值缓存：key = device_code:mp_code */
  private baselines: Map<string, { value: number; updatedAt: number }> = new Map();

  private windowSizeSec: number;
  private baselineTtlSec: number;

  constructor(windowSizeSec: number = 60, baselineTtlSec: number = 3600) {
    this.windowSizeSec = windowSizeSec;
    this.baselineTtlSec = baselineTtlSec;
  }

  validate(raw: RawTelemetryMessage): { valid: boolean; reason?: string } {
    if (raw.value === undefined || raw.value === null) {
      return { valid: false, reason: '缺少 value 字段' };
    }
    if (typeof raw.value !== 'number' || isNaN(raw.value)) {
      return { valid: false, reason: `value 不是有效数字: ${raw.value}` };
    }
    return { valid: true };
  }

  async extract(raw: RawTelemetryMessage): Promise<Record<string, number | string | boolean>> {
    const key = `${raw.device_code}:${raw.mp_code}`;
    const now = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
    const value = raw.value!;

    // 更新滑动窗口
    if (!this.windows.has(key)) {
      this.windows.set(key, []);
    }
    const window = this.windows.get(key)!;
    window.push({ value, timestamp: now });

    // 清理过期数据
    const cutoff = now - this.windowSizeSec * 1000;
    while (window.length > 0 && window[0].timestamp < cutoff) {
      window.shift();
    }

    // 限制窗口大小（防止内存泄漏）
    if (window.length > 10000) {
      window.splice(0, window.length - 10000);
    }

    const values = window.map(e => e.value);

    // 计算基线
    let baseline = value;
    const cached = this.baselines.get(key);
    if (cached && (now - cached.updatedAt) < this.baselineTtlSec * 1000) {
      baseline = cached.value;
    } else {
      // 使用当前窗口均值作为基线
      baseline = mean(values);
      this.baselines.set(key, { value: baseline, updatedAt: now });
    }

    // 计算时间间隔（秒）
    const dt = window.length >= 2
      ? (window[window.length - 1].timestamp - window[0].timestamp) / 1000 / (window.length - 1)
      : 1;

    const features: ScalarFeatures = {
      current_value: round(value, 6),
      mean: round(mean(values), 6),
      std_dev: round(stdDev(values), 6),
      min: round(Math.min(...values), 6),
      max: round(Math.max(...values), 6),
      rate_of_change: round(rateOfChange(values, dt), 6),
      trend_slope: round(linearSlope(values, dt), 8),
      offset_from_baseline: round(value - baseline, 6),
      is_step_change: detectStepChange(values),
    };

    return features as unknown as Record<string, number | string | boolean>;
  }

  /**
   * 清理指定测点的窗口缓存
   */
  clearWindow(deviceCode: string, mpCode: string): void {
    const key = `${deviceCode}:${mpCode}`;
    this.windows.delete(key);
    this.baselines.delete(key);
  }

  /**
   * 清理所有缓存
   */
  clearAll(): void {
    this.windows.clear();
    this.baselines.clear();
  }
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export default ScalarExtractor;
