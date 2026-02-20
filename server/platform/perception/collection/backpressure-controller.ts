/**
 * ============================================================================
 * 背压控制器 — BackpressureController
 * ============================================================================
 *
 * 通用赋能平台感知层：流量整形 + 过载保护
 *
 * 职责：
 *   1. 令牌桶限流 — 控制数据采集速率，防止下游过载
 *   2. 滑动窗口统计 — 实时监控吞吐量、延迟、丢弃率
 *   3. 自适应调节 — 根据下游处理能力动态调整采集速率
 *   4. 优雅降级 — 过载时按优先级丢弃低价值数据
 *
 * 设计原则：
 *   - 通用化：不绑定任何具体业务场景
 *   - 配置驱动：所有阈值通过配置注入
 *   - 可观测：暴露 Prometheus-ready 指标
 */

// ============================================================================
// 配置接口
// ============================================================================

export interface BackpressureConfig {
  /** 令牌桶容量（每秒允许的最大消息数） */
  tokenBucketCapacity: number;
  /** 令牌填充速率（每秒填充令牌数） */
  tokenRefillRate: number;
  /** 滑动窗口大小（毫秒） */
  slidingWindowMs: number;
  /** 高水位线（队列使用率，超过此值开始降级） */
  highWaterMark: number;
  /** 低水位线（队列使用率，低于此值恢复正常） */
  lowWaterMark: number;
  /** 最大队列深度 */
  maxQueueDepth: number;
  /** 过载时的降级策略 */
  overloadStrategy: 'drop_lowest' | 'sample' | 'throttle';
  /** 采样率（overloadStrategy 为 sample 时生效，0-1） */
  sampleRate: number;
}

export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  tokenBucketCapacity: 1000,
  tokenRefillRate: 500,
  slidingWindowMs: 10_000,
  highWaterMark: 0.8,
  lowWaterMark: 0.3,
  maxQueueDepth: 10_000,
  overloadStrategy: 'drop_lowest',
  sampleRate: 0.5,
};

// ============================================================================
// 数据优先级
// ============================================================================

export type DataPriority = 'critical' | 'high' | 'normal' | 'low';

export interface DataMessage<T = unknown> {
  id: string;
  priority: DataPriority;
  timestamp: number;
  sourceId: string;
  payload: T;
}

// ============================================================================
// 背压指标
// ============================================================================

export interface BackpressureMetrics {
  /** 当前令牌数 */
  currentTokens: number;
  /** 当前队列深度 */
  queueDepth: number;
  /** 队列使用率 (0-1) */
  queueUtilization: number;
  /** 滑动窗口内的吞吐量（消息/秒） */
  throughputPerSec: number;
  /** 滑动窗口内的丢弃数 */
  droppedInWindow: number;
  /** 滑动窗口内的平均延迟（ms） */
  avgLatencyMs: number;
  /** 当前状态 */
  state: 'normal' | 'degraded' | 'overloaded';
  /** 累计接收数 */
  totalReceived: number;
  /** 累计处理数 */
  totalProcessed: number;
  /** 累计丢弃数 */
  totalDropped: number;
}

// ============================================================================
// 令牌桶
// ============================================================================

class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number,
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  tryConsume(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefillTime = now;
  }

  /** 动态调整速率 */
  setRefillRate(rate: number): void {
    (this as any).refillRate = Math.max(1, rate);
  }
}

// ============================================================================
// 滑动窗口统计
// ============================================================================

interface WindowEntry {
  timestamp: number;
  latencyMs: number;
  dropped: boolean;
}

class SlidingWindowStats {
  private entries: WindowEntry[] = [];

  constructor(private readonly windowMs: number) {}

  record(entry: WindowEntry): void {
    this.entries.push(entry);
    this.cleanup();
  }

  getThroughput(): number {
    this.cleanup();
    const processed = this.entries.filter(e => !e.dropped).length;
    return (processed / this.windowMs) * 1000;
  }

  getDropCount(): number {
    this.cleanup();
    return this.entries.filter(e => e.dropped).length;
  }

  getAvgLatency(): number {
    this.cleanup();
    const processed = this.entries.filter(e => !e.dropped);
    if (processed.length === 0) return 0;
    return processed.reduce((sum, e) => sum + e.latencyMs, 0) / processed.length;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.entries = this.entries.filter(e => e.timestamp > cutoff);
  }
}

// ============================================================================
// 背压控制器实现
// ============================================================================

export class BackpressureController {
  private readonly config: BackpressureConfig;
  private readonly tokenBucket: TokenBucket;
  private readonly windowStats: SlidingWindowStats;
  private state: 'normal' | 'degraded' | 'overloaded' = 'normal';
  private queueDepth = 0;

  // 累计指标
  private totalReceived = 0;
  private totalProcessed = 0;
  private totalDropped = 0;

  constructor(config?: Partial<BackpressureConfig>) {
    this.config = { ...DEFAULT_BACKPRESSURE_CONFIG, ...config };
    this.tokenBucket = new TokenBucket(
      this.config.tokenBucketCapacity,
      this.config.tokenRefillRate,
    );
    this.windowStats = new SlidingWindowStats(this.config.slidingWindowMs);
  }

  /**
   * 尝试接收消息
   * @returns true 表示消息被接受，false 表示被丢弃
   */
  tryAccept<T>(message: DataMessage<T>): boolean {
    this.totalReceived++;
    const startTime = Date.now();

    // 1. 检查队列深度
    const utilization = this.queueDepth / this.config.maxQueueDepth;
    this.updateState(utilization);

    // 2. 过载处理
    if (this.state === 'overloaded') {
      const accepted = this.handleOverload(message);
      this.windowStats.record({
        timestamp: startTime,
        latencyMs: Date.now() - startTime,
        dropped: !accepted,
      });
      if (!accepted) this.totalDropped++;
      else { this.totalProcessed++; this.queueDepth++; }
      return accepted;
    }

    // 3. 降级模式：令牌桶限流
    if (this.state === 'degraded') {
      if (!this.tokenBucket.tryConsume()) {
        this.totalDropped++;
        this.windowStats.record({ timestamp: startTime, latencyMs: 0, dropped: true });
        return false;
      }
    }

    // 4. 正常接受
    this.totalProcessed++;
    this.queueDepth++;
    this.windowStats.record({
      timestamp: startTime,
      latencyMs: Date.now() - startTime,
      dropped: false,
    });
    return true;
  }

  /** 通知消息已被消费（减少队列深度） */
  acknowledge(count: number = 1): void {
    this.queueDepth = Math.max(0, this.queueDepth - count);
    const utilization = this.queueDepth / this.config.maxQueueDepth;
    this.updateState(utilization);
  }

  /** 获取当前指标 */
  getMetrics(): BackpressureMetrics {
    return {
      currentTokens: this.tokenBucket.getTokens(),
      queueDepth: this.queueDepth,
      queueUtilization: this.queueDepth / this.config.maxQueueDepth,
      throughputPerSec: this.windowStats.getThroughput(),
      droppedInWindow: this.windowStats.getDropCount(),
      avgLatencyMs: this.windowStats.getAvgLatency(),
      state: this.state,
      totalReceived: this.totalReceived,
      totalProcessed: this.totalProcessed,
      totalDropped: this.totalDropped,
    };
  }

  /** 重置指标 */
  reset(): void {
    this.totalReceived = 0;
    this.totalProcessed = 0;
    this.totalDropped = 0;
    this.queueDepth = 0;
    this.state = 'normal';
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private updateState(utilization: number): void {
    if (utilization >= this.config.highWaterMark) {
      this.state = 'overloaded';
    } else if (utilization >= this.config.lowWaterMark) {
      this.state = 'degraded';
    } else {
      this.state = 'normal';
    }
  }

  private handleOverload<T>(message: DataMessage<T>): boolean {
    switch (this.config.overloadStrategy) {
      case 'drop_lowest':
        // 只接受 critical 和 high 优先级
        return message.priority === 'critical' || message.priority === 'high';

      case 'sample':
        // 按采样率随机接受
        if (message.priority === 'critical') return true;
        return Math.random() < this.config.sampleRate;

      case 'throttle':
        // 令牌桶限流（所有优先级）
        if (message.priority === 'critical') return true;
        return this.tokenBucket.tryConsume();

      default:
        return false;
    }
  }
}
