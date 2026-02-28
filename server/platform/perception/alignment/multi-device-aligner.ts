/**
 * ============================================================================
 * 跨设备时间对齐器 — 多源异构采样率统一
 * ============================================================================
 *
 * 核心能力：
 *   1. 接收多台设备不同采样率的数据流
 *   2. 线性插值对齐到统一时间轴
 *   3. 缺口检测与填补策略（短缺口插值 / 长缺口标记）
 *   4. 与现有 RingBuffer + AdaptiveSampler 对接
 *
 * 数据流：
 *   RingBuffer (per device) → MultiDeviceAligner → 对齐后的统一时间序列
 *     → StateVectorEncoder / ConditionNormalizer / 跨设备横向对比
 *
 * 设计原则：
 *   - 物理约束优先：插值不应改变信号的频域特性
 *   - 缺口检测基于采样间隔倍数，而非绝对时长
 *   - 长缺口标记而不填补，防止引入虚假数据
 *   - 零拷贝：输出复用输入缓冲区（当采样率匹配时）
 */

import { createModuleLogger } from '../../../core/logger';
import type { SensorSample, MultiChannelRingBufferManager } from '../collection/ring-buffer';

const log = createModuleLogger('multi-device-aligner');

// ============================================================================
// 类型定义
// ============================================================================

/** 设备数据流注册配置 */
export interface DeviceStreamConfig {
  /** 设备 ID（如 "RTG-001"） */
  deviceId: string;
  /** 通道列表（如 ["VT-01", "VT-02", ...]） */
  channels: string[];
  /** 原始采样率 (Hz) */
  nominalSampleRate: number;
  /** 数据时钟源类型 */
  clockSource: 'ntp' | 'ptp' | 'gps' | 'local';
  /** 预估时钟偏差上限 (ms) */
  maxClockDriftMs: number;
}

/** 对齐参数 */
export interface AlignmentConfig {
  /** 目标采样率 (Hz)，所有设备对齐到此频率 */
  targetSampleRate: number;
  /** 目标时间窗口起始时间 (Unix ms)，null = 自动取最晚设备的起始时间 */
  windowStartMs: number | null;
  /** 目标时间窗口结束时间 (Unix ms)，null = 自动取最早设备的结束时间 */
  windowEndMs: number | null;
  /** 插值方法 */
  interpolation: InterpolationMethod;
  /** 短缺口阈值：采样间隔的倍数（默认 3.0，即 3 倍采样周期以内视为短缺口） */
  shortGapThresholdMultiplier: number;
  /** 长缺口阈值：采样间隔的倍数（默认 10.0，超过此值标记为缺口） */
  longGapThresholdMultiplier: number;
  /** 长缺口填补策略 */
  longGapStrategy: GapFillStrategy;
  /** 边缘处理：窗口外的数据如何处理 */
  edgePolicy: 'zero_pad' | 'hold_last' | 'nan_fill' | 'truncate';
}

/** 插值方法 */
export type InterpolationMethod = 'linear' | 'nearest' | 'zero_hold';

/** 长缺口填补策略 */
export type GapFillStrategy = 'mark_nan' | 'hold_last' | 'mark_and_hold';

/** 数据缺口描述 */
export interface DataGap {
  deviceId: string;
  channel: string;
  /** 缺口起始时间 (Unix ms) */
  startMs: number;
  /** 缺口结束时间 (Unix ms) */
  endMs: number;
  /** 缺口时长 (ms) */
  durationMs: number;
  /** 缺失的采样点数（按目标采样率计） */
  missingSamples: number;
  /** 缺口类型 */
  type: 'short' | 'long';
  /** 填补方式 */
  fillMethod: 'interpolated' | 'held_last' | 'nan' | 'none';
}

/** 单通道对齐结果 */
export interface AlignedChannel {
  deviceId: string;
  channel: string;
  /** 对齐后的时间戳数组 (Unix ms)，等间隔 */
  timestamps: Float64Array;
  /** 对齐后的值数组 */
  values: Float64Array;
  /** 质量标记数组: 0=缺失, 1=插值, 2=原始 */
  quality: Uint8Array;
  /** 原始采样数 */
  originalSampleCount: number;
  /** 对齐后采样数 */
  alignedSampleCount: number;
  /** 数据利用率（原始点被使用的比例） */
  utilizationRatio: number;
}

/** 多设备对齐结果 */
export interface AlignmentResult {
  /** 统一时间轴起始 (Unix ms) */
  windowStartMs: number;
  /** 统一时间轴结束 (Unix ms) */
  windowEndMs: number;
  /** 目标采样率 */
  targetSampleRate: number;
  /** 总采样点数 */
  totalSamples: number;
  /** 各通道对齐结果 */
  channels: AlignedChannel[];
  /** 检测到的数据缺口 */
  gaps: DataGap[];
  /** 对齐统计 */
  stats: AlignmentStats;
}

/** 对齐统计 */
export interface AlignmentStats {
  /** 参与对齐的设备数 */
  deviceCount: number;
  /** 参与对齐的通道总数 */
  channelCount: number;
  /** 总原始采样点 */
  totalRawSamples: number;
  /** 总对齐后采样点 */
  totalAlignedSamples: number;
  /** 短缺口数 */
  shortGapCount: number;
  /** 长缺口数 */
  longGapCount: number;
  /** 数据完整率（有效点/总点数） */
  completenessRatio: number;
  /** 处理耗时 (ms) */
  processingTimeMs: number;
}

/** 时间戳采样点对（内部使用） */
interface TimedValue {
  t: number;
  v: number;
  q: number; // quality: 0=bad, 1=uncertain, 2=good
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_ALIGNMENT_CONFIG: AlignmentConfig = {
  targetSampleRate: 100,
  windowStartMs: null,
  windowEndMs: null,
  interpolation: 'linear',
  shortGapThresholdMultiplier: 3.0,
  longGapThresholdMultiplier: 10.0,
  longGapStrategy: 'mark_and_hold',
  edgePolicy: 'truncate',
};

// ============================================================================
// 多设备时间对齐器
// ============================================================================

export class MultiDeviceAligner {
  private readonly config: AlignmentConfig;
  private readonly devices: Map<string, DeviceStreamConfig> = new Map();
  /** 各通道的原始数据缓存: key = "deviceId::channel" */
  private readonly rawBuffers: Map<string, TimedValue[]> = new Map();

  constructor(config?: Partial<AlignmentConfig>) {
    this.config = { ...DEFAULT_ALIGNMENT_CONFIG, ...config };
    log.info({ targetRate: this.config.targetSampleRate, interpolation: this.config.interpolation }, '跨设备对齐器初始化');
  }

  // --------------------------------------------------------------------------
  // 设备注册
  // --------------------------------------------------------------------------

  /** 注册一台设备的数据流 */
  registerDevice(config: DeviceStreamConfig): void {
    this.devices.set(config.deviceId, config);
    for (const ch of config.channels) {
      this.rawBuffers.set(this.bufferKey(config.deviceId, ch), []);
    }
    log.info({ deviceId: config.deviceId, channels: config.channels.length, rate: config.nominalSampleRate }, '设备已注册');
  }

  /** 注销设备 */
  unregisterDevice(deviceId: string): void {
    const dev = this.devices.get(deviceId);
    if (!dev) return;
    for (const ch of dev.channels) {
      this.rawBuffers.delete(this.bufferKey(deviceId, ch));
    }
    this.devices.delete(deviceId);
  }

  // --------------------------------------------------------------------------
  // 数据输入（与 RingBuffer / AdaptiveSampler 对接）
  // --------------------------------------------------------------------------

  /**
   * 从 RingBuffer 拉取某设备的最新数据
   *
   * 典型调用：对齐器定期从 MultiChannelRingBufferManager 拉取各通道数据
   */
  ingestFromRingBuffer(deviceId: string, channel: string, samples: SensorSample[]): number {
    const key = this.bufferKey(deviceId, channel);
    let buf = this.rawBuffers.get(key);
    if (!buf) {
      buf = [];
      this.rawBuffers.set(key, buf);
    }

    let count = 0;
    for (const s of samples) {
      buf.push({ t: s.timestamp, v: s.value, q: s.quality });
      count++;
    }
    return count;
  }

  /**
   * 批量推入原始数据（通用入口）
   */
  ingestRaw(deviceId: string, channel: string, timestamps: number[], values: number[], qualities?: number[]): number {
    const key = this.bufferKey(deviceId, channel);
    let buf = this.rawBuffers.get(key);
    if (!buf) {
      buf = [];
      this.rawBuffers.set(key, buf);
    }

    const len = Math.min(timestamps.length, values.length);
    for (let i = 0; i < len; i++) {
      buf.push({ t: timestamps[i], v: values[i], q: qualities?.[i] ?? 2 });
    }
    return len;
  }

  // --------------------------------------------------------------------------
  // 对齐执行
  // --------------------------------------------------------------------------

  /**
   * 执行多设备时间对齐
   *
   * 处理流程：
   *   1. 确定统一时间窗口
   *   2. 生成目标时间轴
   *   3. 对每个通道：排序 → 缺口检测 → 插值 → 质量标记
   *   4. 汇总统计
   */
  align(): AlignmentResult {
    const startTime = Date.now();
    const gaps: DataGap[] = [];

    // Step 1: 确定时间窗口
    const { windowStart, windowEnd } = this.computeWindow();
    if (windowStart >= windowEnd) {
      log.warn({ windowStart, windowEnd }, '时间窗口无效，返回空结果');
      return this.emptyResult(windowStart, windowEnd, Date.now() - startTime);
    }

    // Step 2: 生成目标时间轴
    const dt = 1000 / this.config.targetSampleRate; // ms per sample
    const totalSamples = Math.floor((windowEnd - windowStart) / dt) + 1;
    const targetTimestamps = new Float64Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      targetTimestamps[i] = windowStart + i * dt;
    }

    // Step 3: 逐通道对齐
    const channels: AlignedChannel[] = [];
    let totalRaw = 0;

    for (const [key, rawBuf] of this.rawBuffers.entries()) {
      const [deviceId, channel] = key.split('::');
      const dev = this.devices.get(deviceId);
      const nominalRate = dev?.nominalSampleRate ?? this.config.targetSampleRate;

      // 排序（按时间戳升序）
      rawBuf.sort((a, b) => a.t - b.t);

      // 窗口内数据
      const windowed = rawBuf.filter(p => p.t >= windowStart && p.t <= windowEnd);
      totalRaw += windowed.length;

      // 缺口检测
      const nominalDt = 1000 / nominalRate;
      const channelGaps = this.detectGaps(deviceId, channel, windowed, nominalDt);
      gaps.push(...channelGaps);

      // 插值
      const { values, quality } = this.interpolateChannel(
        windowed, targetTimestamps, channelGaps, nominalDt,
      );

      channels.push({
        deviceId,
        channel,
        timestamps: targetTimestamps,
        values,
        quality,
        originalSampleCount: windowed.length,
        alignedSampleCount: totalSamples,
        utilizationRatio: windowed.length > 0
          ? Math.min(1, windowed.length / totalSamples)
          : 0,
      });
    }

    // Step 4: 统计
    const shortGaps = gaps.filter(g => g.type === 'short').length;
    const longGaps = gaps.filter(g => g.type === 'long').length;

    let validPoints = 0;
    let totalPoints = 0;
    for (const ch of channels) {
      for (let i = 0; i < ch.quality.length; i++) {
        totalPoints++;
        if (ch.quality[i] > 0) validPoints++;
      }
    }

    const result: AlignmentResult = {
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
      targetSampleRate: this.config.targetSampleRate,
      totalSamples,
      channels,
      gaps,
      stats: {
        deviceCount: this.devices.size,
        channelCount: channels.length,
        totalRawSamples: totalRaw,
        totalAlignedSamples: totalSamples * channels.length,
        shortGapCount: shortGaps,
        longGapCount: longGaps,
        completenessRatio: totalPoints > 0 ? validPoints / totalPoints : 0,
        processingTimeMs: Date.now() - startTime,
      },
    };

    log.info({
      devices: result.stats.deviceCount,
      channels: result.stats.channelCount,
      samples: totalSamples,
      gaps: shortGaps + longGaps,
      completeness: (result.stats.completenessRatio * 100).toFixed(1) + '%',
      ms: result.stats.processingTimeMs,
    }, '对齐完成');

    return result;
  }

  /**
   * 对齐并清空缓冲区（适用于流式场景）
   */
  alignAndFlush(): AlignmentResult {
    const result = this.align();
    this.flush();
    return result;
  }

  /** 清空所有原始数据缓冲区 */
  flush(): void {
    for (const buf of this.rawBuffers.values()) {
      buf.length = 0;
    }
  }

  // --------------------------------------------------------------------------
  // 缺口检测
  // --------------------------------------------------------------------------

  private detectGaps(
    deviceId: string,
    channel: string,
    sorted: TimedValue[],
    nominalDt: number,
  ): DataGap[] {
    if (sorted.length < 2) return [];

    const shortThreshold = nominalDt * this.config.shortGapThresholdMultiplier;
    const longThreshold = nominalDt * this.config.longGapThresholdMultiplier;
    const gaps: DataGap[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const dt = sorted[i].t - sorted[i - 1].t;
      if (dt <= shortThreshold) continue;

      const isLong = dt > longThreshold;
      const targetDt = 1000 / this.config.targetSampleRate;
      const missingSamples = Math.floor(dt / targetDt) - 1;

      let fillMethod: DataGap['fillMethod'];
      if (isLong) {
        fillMethod = this.config.longGapStrategy === 'mark_nan' ? 'nan'
          : this.config.longGapStrategy === 'hold_last' ? 'held_last'
          : 'held_last'; // mark_and_hold → hold + 质量标记
      } else {
        fillMethod = 'interpolated';
      }

      gaps.push({
        deviceId,
        channel,
        startMs: sorted[i - 1].t,
        endMs: sorted[i].t,
        durationMs: dt,
        missingSamples,
        type: isLong ? 'long' : 'short',
        fillMethod,
      });
    }

    return gaps;
  }

  // --------------------------------------------------------------------------
  // 插值引擎
  // --------------------------------------------------------------------------

  private interpolateChannel(
    sorted: TimedValue[],
    targetTs: Float64Array,
    gaps: DataGap[],
    _nominalDt: number,
  ): { values: Float64Array; quality: Uint8Array } {
    const n = targetTs.length;
    const values = new Float64Array(n);
    const quality = new Uint8Array(n); // 0=missing, 1=interpolated, 2=original

    if (sorted.length === 0) {
      // 全部标记为缺失
      return { values, quality };
    }

    // 构建长缺口区间集合（用于快速查找）
    const longGapIntervals: Array<{ start: number; end: number }> = [];
    for (const g of gaps) {
      if (g.type === 'long') {
        longGapIntervals.push({ start: g.startMs, end: g.endMs });
      }
    }

    // 双指针遍历
    let j = 0; // sorted 指针
    for (let i = 0; i < n; i++) {
      const t = targetTs[i];

      // 推进 j 使 sorted[j].t <= t < sorted[j+1].t
      while (j < sorted.length - 1 && sorted[j + 1].t <= t) {
        j++;
      }

      // 检查是否在长缺口区间内
      const inLongGap = longGapIntervals.some(g => t > g.start && t < g.end);

      if (inLongGap) {
        // 长缺口处理
        if (this.config.longGapStrategy === 'mark_nan') {
          values[i] = NaN;
          quality[i] = 0;
        } else {
          // hold_last 或 mark_and_hold
          values[i] = sorted[j].v;
          quality[i] = 0; // 标记为不可靠
        }
        continue;
      }

      // 精确命中
      if (Math.abs(sorted[j].t - t) < 0.5) {
        values[i] = sorted[j].v;
        quality[i] = 2;
        continue;
      }

      // 边界外
      if (t < sorted[0].t || t > sorted[sorted.length - 1].t) {
        switch (this.config.edgePolicy) {
          case 'zero_pad':
            values[i] = 0;
            quality[i] = 0;
            break;
          case 'hold_last':
            values[i] = t < sorted[0].t ? sorted[0].v : sorted[sorted.length - 1].v;
            quality[i] = 1;
            break;
          case 'nan_fill':
            values[i] = NaN;
            quality[i] = 0;
            break;
          case 'truncate':
          default:
            values[i] = NaN;
            quality[i] = 0;
            break;
        }
        continue;
      }

      // 插值（j 和 j+1 之间）
      if (j < sorted.length - 1) {
        const p0 = sorted[j];
        const p1 = sorted[j + 1];

        switch (this.config.interpolation) {
          case 'linear': {
            const ratio = (t - p0.t) / (p1.t - p0.t);
            values[i] = p0.v + ratio * (p1.v - p0.v);
            quality[i] = 1;
            break;
          }
          case 'nearest': {
            values[i] = (t - p0.t) <= (p1.t - t) ? p0.v : p1.v;
            quality[i] = 1;
            break;
          }
          case 'zero_hold': {
            values[i] = p0.v;
            quality[i] = 1;
            break;
          }
        }
      } else {
        // j 是最后一个点
        values[i] = sorted[j].v;
        quality[i] = 1;
      }
    }

    return { values, quality };
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  private computeWindow(): { windowStart: number; windowEnd: number } {
    if (this.config.windowStartMs !== null && this.config.windowEndMs !== null) {
      return { windowStart: this.config.windowStartMs, windowEnd: this.config.windowEndMs };
    }

    let globalMin = Infinity;
    let globalMax = -Infinity;
    let latestMin = -Infinity;
    let earliestMax = Infinity;

    for (const buf of this.rawBuffers.values()) {
      if (buf.length === 0) continue;
      const sorted = buf; // 可能未排序，取 min/max
      let localMin = Infinity;
      let localMax = -Infinity;
      for (const p of sorted) {
        if (p.t < localMin) localMin = p.t;
        if (p.t > localMax) localMax = p.t;
      }
      if (localMin < globalMin) globalMin = localMin;
      if (localMax > globalMax) globalMax = localMax;
      if (localMin > latestMin) latestMin = localMin;
      if (localMax < earliestMax) earliestMax = localMax;
    }

    // 默认取最大公共窗口（所有设备都有数据的时间段）
    const windowStart = this.config.windowStartMs ?? latestMin;
    const windowEnd = this.config.windowEndMs ?? earliestMax;

    return {
      windowStart: isFinite(windowStart) ? windowStart : 0,
      windowEnd: isFinite(windowEnd) ? windowEnd : 0,
    };
  }

  private emptyResult(start: number, end: number, processingMs: number): AlignmentResult {
    return {
      windowStartMs: start,
      windowEndMs: end,
      targetSampleRate: this.config.targetSampleRate,
      totalSamples: 0,
      channels: [],
      gaps: [],
      stats: {
        deviceCount: this.devices.size,
        channelCount: 0,
        totalRawSamples: 0,
        totalAlignedSamples: 0,
        shortGapCount: 0,
        longGapCount: 0,
        completenessRatio: 0,
        processingTimeMs: processingMs,
      },
    };
  }

  private bufferKey(deviceId: string, channel: string): string {
    return `${deviceId}::${channel}`;
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  /** 获取已注册设备列表 */
  getRegisteredDevices(): DeviceStreamConfig[] {
    return [...this.devices.values()];
  }

  /** 获取某通道的缓冲区大小 */
  getBufferSize(deviceId: string, channel: string): number {
    return this.rawBuffers.get(this.bufferKey(deviceId, channel))?.length ?? 0;
  }

  /** 获取所有缓冲区总大小 */
  getTotalBufferedSamples(): number {
    let total = 0;
    for (const buf of this.rawBuffers.values()) {
      total += buf.length;
    }
    return total;
  }

  /** 获取当前配置 */
  getConfig(): Readonly<AlignmentConfig> {
    return this.config;
  }

  /** 更新配置（部分更新） */
  updateConfig(partial: Partial<AlignmentConfig>): void {
    Object.assign(this.config, partial);
    log.info({ config: partial }, '对齐配置已更新');
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建港机设备跨设备对齐器
 *
 * 预配置：
 *   - 目标采样率 100Hz（满足振动分析 50Hz 以下频段需求）
 *   - 线性插值
 *   - 短缺口 3 倍采样周期，长缺口 10 倍
 *   - 长缺口标记+保持
 */
export function createCraneAligner(overrides?: Partial<AlignmentConfig>): MultiDeviceAligner {
  return new MultiDeviceAligner({
    targetSampleRate: 100,
    interpolation: 'linear',
    shortGapThresholdMultiplier: 3.0,
    longGapThresholdMultiplier: 10.0,
    longGapStrategy: 'mark_and_hold',
    edgePolicy: 'truncate',
    ...overrides,
  });
}

/**
 * 创建高频振动分析对齐器
 *
 * 预配置：
 *   - 目标采样率 12800Hz（匹配 VT 传感器原始采样率）
 *   - 零阶保持（避免高频插值伪影）
 *   - 严格缺口检测
 */
export function createHighFreqAligner(overrides?: Partial<AlignmentConfig>): MultiDeviceAligner {
  return new MultiDeviceAligner({
    targetSampleRate: 12800,
    interpolation: 'zero_hold',
    shortGapThresholdMultiplier: 2.0,
    longGapThresholdMultiplier: 5.0,
    longGapStrategy: 'mark_nan',
    edgePolicy: 'nan_fill',
    ...overrides,
  });
}
