/**
 * 背压控制模块 - 平台基础设施层
 * 
 * 为 Kafka consumer、WebSocket、数据管道等高吞吐场景提供背压机制，
 * 防止消费者被生产者压垮。
 * 
 * 策略：
 * - 令牌桶限流（Token Bucket）
 * - 滑动窗口计数
 * - 自适应速率调整（基于系统负载）
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: server/core/logger
 */

import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('backpressure');

// ============================================================
// 令牌桶限流器
// ============================================================

export interface TokenBucketConfig {
  /** 桶容量（最大突发量） */
  capacity: number;
  /** 每秒填充速率 */
  refillRate: number;
  /** 初始令牌数 */
  initialTokens?: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.tokens = config.initialTokens ?? config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * 尝试获取令牌
   * @returns true 如果获取成功，false 如果需要背压
   */
  tryAcquire(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /**
   * 等待直到获取到令牌
   */
  async acquire(count: number = 1, maxWaitMs: number = 30000): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      if (this.tryAcquire(count)) return true;
      // 计算需要等待的时间
      const tokensNeeded = count - this.tokens;
      const waitMs = Math.min((tokensNeeded / this.refillRate) * 1000, 100);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    return false;
  }

  /**
   * 获取当前状态
   */
  getStatus(): { tokens: number; capacity: number; refillRate: number; utilizationPercent: number } {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      capacity: this.capacity,
      refillRate: this.refillRate,
      utilizationPercent: Math.round((1 - this.tokens / this.capacity) * 100),
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// ============================================================
// 自适应背压控制器
// ============================================================

export interface AdaptiveBackpressureConfig {
  /** 目标处理延迟(ms) */
  targetLatencyMs: number;
  /** 最大并发数 */
  maxConcurrency: number;
  /** 最小并发数 */
  minConcurrency: number;
  /** 初始并发数 */
  initialConcurrency: number;
  /** 调整间隔(ms) */
  adjustIntervalMs: number;
  /** 延迟采样窗口大小 */
  sampleWindowSize: number;
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveBackpressureConfig = {
  targetLatencyMs: 100,
  maxConcurrency: 100,
  minConcurrency: 1,
  initialConcurrency: 10,
  adjustIntervalMs: 5000,
  sampleWindowSize: 100,
};

export class AdaptiveBackpressureController {
  private config: AdaptiveBackpressureConfig;
  private currentConcurrency: number;
  private activeTasks: number = 0;
  private latencySamples: number[] = [];
  private adjustTimer: NodeJS.Timeout | null = null;
  private waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private isShutdown = false;

  constructor(name: string, config?: Partial<AdaptiveBackpressureConfig>) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    this.currentConcurrency = this.config.initialConcurrency;

    // 启动自适应调整
    this.adjustTimer = setInterval(() => this.adjustConcurrency(), this.config.adjustIntervalMs);
    this.adjustTimer.unref();

    log.info(`[${name}] Adaptive backpressure initialized (target=${this.config.targetLatencyMs}ms, concurrency=${this.currentConcurrency})`);
  }

  /**
   * 获取执行许可（如果超过并发限制则等待）
   */
  async acquire(): Promise<() => void> {
    if (this.isShutdown) throw new Error('Controller is shutdown');

    if (this.activeTasks < this.currentConcurrency) {
      this.activeTasks++;
      const startTime = Date.now();
      return () => this.release(startTime);
    }

    // 排队等待
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.waitQueue.findIndex(w => w.resolve === wrappedResolve);
        if (idx >= 0) this.waitQueue.splice(idx, 1);
        reject(new Error('Backpressure: acquire timeout'));
      }, 30000);

      const wrappedResolve = () => {
        clearTimeout(timeout);
        this.activeTasks++;
        const startTime = Date.now();
        resolve(() => this.release(startTime));
      };

      this.waitQueue.push({ resolve: wrappedResolve, reject });
    });
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    currentConcurrency: number;
    activeTasks: number;
    queueLength: number;
    avgLatencyMs: number;
    utilizationPercent: number;
  } {
    const avgLatency = this.latencySamples.length > 0
      ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
      : 0;

    return {
      currentConcurrency: this.currentConcurrency,
      activeTasks: this.activeTasks,
      queueLength: this.waitQueue.length,
      avgLatencyMs: Math.round(avgLatency),
      utilizationPercent: Math.round((this.activeTasks / this.currentConcurrency) * 100),
    };
  }

  /**
   * 关闭控制器
   */
  shutdown(): void {
    this.isShutdown = true;
    if (this.adjustTimer) {
      clearInterval(this.adjustTimer);
      this.adjustTimer = null;
    }
    // 拒绝所有等待中的请求
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Controller shutdown'));
    }
    this.waitQueue = [];
  }

  private release(startTime: number): void {
    const latency = Date.now() - startTime;
    this.recordLatency(latency);
    this.activeTasks--;

    // 唤醒等待队列中的下一个
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next?.resolve();
    }
  }

  private recordLatency(latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.config.sampleWindowSize) {
      this.latencySamples.shift();
    }
  }

  private adjustConcurrency(): void {
    if (this.latencySamples.length < 10) return;

    const avgLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    const p99Latency = this.getPercentile(99);

    if (avgLatency < this.config.targetLatencyMs * 0.7 && p99Latency < this.config.targetLatencyMs * 2) {
      // 延迟低于目标 70%，增加并发
      const newConcurrency = Math.min(
        this.config.maxConcurrency,
        Math.ceil(this.currentConcurrency * 1.1),
      );
      if (newConcurrency !== this.currentConcurrency) {
        this.currentConcurrency = newConcurrency;
        log.debug(`Concurrency increased to ${this.currentConcurrency} (avgLatency=${Math.round(avgLatency)}ms)`);
      }
    } else if (avgLatency > this.config.targetLatencyMs * 1.3 || p99Latency > this.config.targetLatencyMs * 5) {
      // 延迟高于目标 130%，减少并发
      const newConcurrency = Math.max(
        this.config.minConcurrency,
        Math.floor(this.currentConcurrency * 0.8),
      );
      if (newConcurrency !== this.currentConcurrency) {
        this.currentConcurrency = newConcurrency;
        log.debug(`Concurrency decreased to ${this.currentConcurrency} (avgLatency=${Math.round(avgLatency)}ms)`);
      }
    }
  }

  private getPercentile(p: number): number {
    if (this.latencySamples.length === 0) return 0;
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// ============================================================
// Kafka Consumer 背压包装器
// ============================================================

export interface KafkaBackpressureConfig {
  /** 每秒最大消息处理数 */
  maxMessagesPerSecond: number;
  /** 最大并发处理数 */
  maxConcurrentProcessing: number;
  /** 暂停消费的队列深度阈值 */
  pauseThreshold: number;
  /** 恢复消费的队列深度阈值 */
  resumeThreshold: number;
}

export class KafkaConsumerBackpressure {
  private tokenBucket: TokenBucket;
  private controller: AdaptiveBackpressureController;
  private pendingCount: number = 0;
  private isPaused: boolean = false;
  private pauseCallback: (() => void) | null = null;
  private resumeCallback: (() => void) | null = null;
  private config: KafkaBackpressureConfig;

  constructor(name: string, config: Partial<KafkaBackpressureConfig> = {}) {
    this.config = {
      maxMessagesPerSecond: config.maxMessagesPerSecond || 1000,
      maxConcurrentProcessing: config.maxConcurrentProcessing || 50,
      pauseThreshold: config.pauseThreshold || 100,
      resumeThreshold: config.resumeThreshold || 20,
    };

    this.tokenBucket = new TokenBucket({
      capacity: this.config.maxMessagesPerSecond,
      refillRate: this.config.maxMessagesPerSecond,
    });

    this.controller = new AdaptiveBackpressureController(`kafka-${name}`, {
      maxConcurrency: this.config.maxConcurrentProcessing,
      initialConcurrency: Math.min(10, this.config.maxConcurrentProcessing),
    });

    log.info(`[kafka-${name}] Backpressure initialized (maxMPS=${this.config.maxMessagesPerSecond}, maxConcurrent=${this.config.maxConcurrentProcessing})`);
  }

  /**
   * 注册暂停/恢复回调（连接到 Kafka consumer.pause/resume）
   */
  onPause(callback: () => void): void { this.pauseCallback = callback; }
  onResume(callback: () => void): void { this.resumeCallback = callback; }

  /**
   * 处理消息前调用 — 获取令牌和并发许可
   */
  async beforeProcess(): Promise<() => void> {
    this.pendingCount++;

    // 检查是否需要暂停消费
    if (!this.isPaused && this.pendingCount >= this.config.pauseThreshold) {
      this.isPaused = true;
      this.pauseCallback?.();
      log.warn(`Consumer paused (pending=${this.pendingCount})`);
    }

    // 获取令牌桶许可
    await this.tokenBucket.acquire();

    // 获取并发许可
    const release = await this.controller.acquire();

    return () => {
      release();
      this.pendingCount--;

      // 检查是否可以恢复消费
      if (this.isPaused && this.pendingCount <= this.config.resumeThreshold) {
        this.isPaused = false;
        this.resumeCallback?.();
        log.info(`Consumer resumed (pending=${this.pendingCount})`);
      }
    };
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      isPaused: this.isPaused,
      pendingCount: this.pendingCount,
      tokenBucket: this.tokenBucket.getStatus(),
      controller: this.controller.getStatus(),
    };
  }

  /**
   * 关闭
   */
  shutdown(): void {
    this.controller.shutdown();
  }
}
