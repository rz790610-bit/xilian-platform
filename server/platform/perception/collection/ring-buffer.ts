/**
 * ============================================================================
 * 零拷贝环形缓冲 — SPSC 无锁队列
 * ============================================================================
 *
 * 设计目标：
 *   - 单生产者单消费者（SPSC）无锁队列
 *   - 预分配内存（64KB/通道），避免 GC 压力
 *   - 支持批量写入/读取，减少系统调用
 *   - 溢出策略：覆盖最旧数据（环形）
 *
 * 场景：
 *   岸桥/场桥 2 分钟周期碎片（电机 0-1500 rpm 瞬变 + 联动运行）
 *   边缘层 100kHz 级振动/电气接口数据缓冲
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface RingBufferConfig {
  /** 缓冲区大小（字节），默认 65536 (64KB) */
  bufferSize: number;
  /** 每个数据点大小（字节），默认 8 (Float64) */
  itemSize: number;
  /** 通道名称 */
  channelName: string;
  /** 溢出策略 */
  overflowPolicy: 'overwrite' | 'drop_newest' | 'block';
  /** 高水位标记（0-1），触发消费者通知 */
  highWaterMark: number;
}

export interface RingBufferStats {
  channelName: string;
  capacity: number;
  used: number;
  usagePercent: number;
  totalWritten: number;
  totalRead: number;
  overflowCount: number;
  lastWriteTimestamp: number;
  lastReadTimestamp: number;
}

export interface SensorSample {
  timestamp: number;       // Unix 毫秒
  value: number;           // 传感器值
  quality: number;         // 0=bad, 1=uncertain, 2=good
  channelIndex: number;    // 通道索引
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: RingBufferConfig = {
  bufferSize: 65536,       // 64KB
  itemSize: 8,             // Float64
  channelName: 'default',
  overflowPolicy: 'overwrite',
  highWaterMark: 0.8,
};

// ============================================================================
// RingBuffer 实现
// ============================================================================

export class RingBuffer {
  private buffer: Float64Array;
  private capacity: number;
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private count: number = 0;
  private config: RingBufferConfig;

  // 统计
  private totalWritten: number = 0;
  private totalRead: number = 0;
  private overflowCount: number = 0;
  private lastWriteTimestamp: number = 0;
  private lastReadTimestamp: number = 0;

  // 回调
  private onHighWaterMark?: () => void;
  private onOverflow?: (droppedCount: number) => void;

  constructor(config: Partial<RingBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.capacity = Math.floor(this.config.bufferSize / this.config.itemSize);
    this.buffer = new Float64Array(this.capacity);
  }

  /**
   * 写入单个数据点
   */
  write(value: number): boolean {
    if (this.count >= this.capacity) {
      // 缓冲区满
      switch (this.config.overflowPolicy) {
        case 'overwrite':
          // 覆盖最旧数据
          this.readIndex = (this.readIndex + 1) % this.capacity;
          this.count--;
          this.overflowCount++;
          this.onOverflow?.(1);
          break;
        case 'drop_newest':
          this.overflowCount++;
          this.onOverflow?.(1);
          return false;
        case 'block':
          return false;
      }
    }

    this.buffer[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.count++;
    this.totalWritten++;
    this.lastWriteTimestamp = Date.now();

    // 高水位检查
    if (this.count / this.capacity >= this.config.highWaterMark) {
      this.onHighWaterMark?.();
    }

    return true;
  }

  /**
   * 批量写入
   */
  writeBatch(values: number[] | Float64Array): number {
    let written = 0;
    for (let i = 0; i < values.length; i++) {
      if (this.write(values[i])) {
        written++;
      }
    }
    return written;
  }

  /**
   * 读取单个数据点
   */
  read(): number | null {
    if (this.count === 0) return null;

    const value = this.buffer[this.readIndex];
    this.readIndex = (this.readIndex + 1) % this.capacity;
    this.count--;
    this.totalRead++;
    this.lastReadTimestamp = Date.now();

    return value;
  }

  /**
   * 批量读取
   */
  readBatch(maxCount: number): Float64Array {
    const readCount = Math.min(maxCount, this.count);
    const result = new Float64Array(readCount);

    for (let i = 0; i < readCount; i++) {
      result[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }

    this.count -= readCount;
    this.totalRead += readCount;
    this.lastReadTimestamp = Date.now();

    return result;
  }

  /**
   * 窥视（不移动读指针）
   */
  peek(offset: number = 0): number | null {
    if (offset >= this.count) return null;
    const index = (this.readIndex + offset) % this.capacity;
    return this.buffer[index];
  }

  /**
   * 窥视最新 N 个数据点
   */
  peekLatest(n: number): Float64Array {
    const count = Math.min(n, this.count);
    const result = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const index = (this.writeIndex - count + i + this.capacity) % this.capacity;
      result[i] = this.buffer[index];
    }
    return result;
  }

  /**
   * 获取统计信息
   */
  getStats(): RingBufferStats {
    return {
      channelName: this.config.channelName,
      capacity: this.capacity,
      used: this.count,
      usagePercent: this.capacity > 0 ? this.count / this.capacity : 0,
      totalWritten: this.totalWritten,
      totalRead: this.totalRead,
      overflowCount: this.overflowCount,
      lastWriteTimestamp: this.lastWriteTimestamp,
      lastReadTimestamp: this.lastReadTimestamp,
    };
  }

  /**
   * 重置缓冲区
   */
  reset(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
    this.buffer.fill(0);
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: {
    onHighWaterMark?: () => void;
    onOverflow?: (droppedCount: number) => void;
  }): void {
    this.onHighWaterMark = callbacks.onHighWaterMark;
    this.onOverflow = callbacks.onOverflow;
  }

  /** 当前数据量 */
  get size(): number { return this.count; }
  /** 是否为空 */
  get isEmpty(): boolean { return this.count === 0; }
  /** 是否已满 */
  get isFull(): boolean { return this.count >= this.capacity; }
  /** 剩余容量 */
  get remaining(): number { return this.capacity - this.count; }
}

// ============================================================================
// 多通道环形缓冲管理器
// ============================================================================

export class MultiChannelRingBufferManager {
  private buffers: Map<string, RingBuffer> = new Map();
  private defaultConfig: Partial<RingBufferConfig>;

  constructor(defaultConfig: Partial<RingBufferConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * 获取或创建通道缓冲区
   */
  getOrCreate(channelName: string, config?: Partial<RingBufferConfig>): RingBuffer {
    let buffer = this.buffers.get(channelName);
    if (!buffer) {
      buffer = new RingBuffer({
        ...this.defaultConfig,
        ...config,
        channelName,
      });
      this.buffers.set(channelName, buffer);
    }
    return buffer;
  }

  /**
   * 获取通道缓冲区
   */
  get(channelName: string): RingBuffer | undefined {
    return this.buffers.get(channelName);
  }

  /**
   * 写入传感器样本
   */
  writeSample(sample: SensorSample): boolean {
    const channelKey = `ch_${sample.channelIndex}`;
    const buffer = this.getOrCreate(channelKey);
    return buffer.write(sample.value);
  }

  /**
   * 批量写入传感器样本
   */
  writeSamples(samples: SensorSample[]): number {
    let written = 0;
    for (const sample of samples) {
      if (this.writeSample(sample)) written++;
    }
    return written;
  }

  /**
   * 获取所有通道统计
   */
  getAllStats(): RingBufferStats[] {
    return Array.from(this.buffers.values()).map(b => b.getStats());
  }

  /**
   * 获取总体统计
   */
  getSummary(): {
    totalChannels: number;
    totalCapacity: number;
    totalUsed: number;
    totalWritten: number;
    totalOverflow: number;
  } {
    const stats = this.getAllStats();
    return {
      totalChannels: stats.length,
      totalCapacity: stats.reduce((sum, s) => sum + s.capacity, 0),
      totalUsed: stats.reduce((sum, s) => sum + s.used, 0),
      totalWritten: stats.reduce((sum, s) => sum + s.totalWritten, 0),
      totalOverflow: stats.reduce((sum, s) => sum + s.overflowCount, 0),
    };
  }

  /**
   * 重置所有通道
   */
  resetAll(): void {
    for (const buffer of this.buffers.values()) {
      buffer.reset();
    }
  }

  /**
   * 删除通道
   */
  remove(channelName: string): boolean {
    return this.buffers.delete(channelName);
  }
}
