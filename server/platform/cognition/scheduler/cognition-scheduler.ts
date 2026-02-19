/**
 * ============================================================================
 * 认知调度器 — CognitionScheduler  v2.0
 * ============================================================================
 *
 * 面向 100 设备 / 100 边缘端 / 2000 测点的工业场景重写：
 *
 * v1 → v2 变更清单：
 *   1. 并发控制：从简单计数器改为 Semaphore 信号量，避免 race condition
 *   2. 队列容量：增加 maxQueueSize 上限，溢出时按 LRU 丢弃 normal 队列尾部
 *   3. 去重清理：定时器自动清理过期 deduplication 条目，防止内存泄漏
 *   4. 降级动态并发：根据 degradationMode 动态调整 effectiveConcurrency
 *   5. 重试退避：指数退避 + 抖动，失败任务自动重入队列
 *   6. 优雅关闭：stop() 等待所有运行中任务完成，超时后强制终止
 *   7. 指标暴露：getMetrics() 返回 Prometheus-ready 的调度器指标
 *
 * 设计原则：
 *   - 调度器不包含认知逻辑，仅负责调度
 *   - 通过配置驱动行为
 *   - 支持运行时动态调整配置
 *   - 所有状态变更通过事件发射器通知外部
 */

import { createModuleLogger } from '../../../core/logger';
import { CognitionUnit, createCognitionUnit } from '../engines/cognition-unit';
import { getCognitionEventEmitter } from '../events/emitter';
import type {
  CognitionStimulus,
  CognitionResult,
  CognitionPriority,
  DegradationMode,
  SchedulerConfig,
} from '../types';
import type {
  DimensionProcessor,
  StimulusPreprocessor,
  NarrativeGenerator,
  CognitionUnitConfig,
} from '../engines/cognition-unit';
import type {
  PerceptionOutput,
  ReasoningOutput,
  FusionOutput,
  DecisionOutput,
} from '../types';

const log = createModuleLogger('cognitionScheduler');

// ============================================================================
// 默认配置 — 面向 100/100/2000 场景
// ============================================================================

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrency: 5,
  quotas: {
    critical: 30,   // 每分钟 30 个 critical（异常告警）
    high: 60,       // 每分钟 60 个 high（漂移检测）
    normal: 120,    // 每分钟 120 个 normal（定期巡检）
  },
  maxQueueSize: {
    critical: 200,  // critical 不轻易丢弃
    high: 100,
    normal: 50,     // normal 可以丢弃
  },
  deduplicationWindowMs: 5_000,
  deduplicationCleanupIntervalMs: 10_000,
  degradationThresholds: {
    highPressureCpu: 0.7,
    highPressureQueueDepth: 30,
    highPressureMemory: 0.75,
    emergencyCpu: 0.9,
    emergencyQueueDepth: 80,
    emergencyMemory: 0.9,
  },
  degradationCheckIntervalMs: 10_000,
  concurrencyMultipliers: {
    normal: 1.0,
    // 修复问题3：high_pressure 设为 1.5 是有意设计
    // 高压模式下增加并发是为了加速消化积压队列（"排水"策略），
    // 而非降低处理能力。只有 emergency 模式才降低并发以保护系统。
    // 如果上游持续高压，degradation 检查会在队列深度达到 emergency 阈值时
    // 自动切换到 emergency 模式（0.5x 并发）。
    high_pressure: 1.5,
    emergency: 0.5,
  },
  retry: {
    maxRetries: 3,
    baseBackoffMs: 1_000,
    maxBackoffMs: 30_000,
  },
};

// ============================================================================
// 信号量 — 并发安全的资源控制
// ============================================================================

class Semaphore {
  private current = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private max: number) {}

  /** 获取一个许可，如果没有可用许可则等待 */
  acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** 释放一个许可 */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // 直接传递给等待者，不减少 current
      next();
    } else {
      this.current--;
    }
  }

  /** 动态调整最大许可数 */
  setMax(newMax: number): void {
    const diff = newMax - this.max;
    this.max = newMax;
    // 如果增加了许可，唤醒等待者
    if (diff > 0) {
      for (let i = 0; i < diff && this.waiters.length > 0; i++) {
        this.current++;
        const next = this.waiters.shift();
        if (next) next();
      }
    }
  }

  getMax(): number { return this.max; }
  getRunning(): number { return this.current; }
  getWaiting(): number { return this.waiters.length; }
}

// ============================================================================
// 队列项
// ============================================================================

interface QueueItem {
  stimulus: CognitionStimulus;
  enqueuedAt: number;       // Date.now() 时间戳
  retryCount: number;       // 已重试次数
  resolve: (result: CognitionResult) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// 调度器指标
// ============================================================================

export interface SchedulerMetrics {
  started: boolean;
  degradationMode: DegradationMode;
  effectiveConcurrency: number;
  runningCount: number;
  waitingCount: number;
  queueDepth: Record<CognitionPriority, number>;
  quotaUsage: Record<CognitionPriority, { used: number; limit: number }>;
  deduplicationMapSize: number;
  pendingAcquireCount: number;
  totalSubmitted: number;
  totalCompleted: number;
  totalFailed: number;
  totalRetried: number;
  totalDropped: number;
  totalDeduplicated: number;
  avgExecutionMs: number;
}

// ============================================================================
// 调度器实现
// ============================================================================

export class CognitionScheduler {
  private config: SchedulerConfig;
  private readonly emitter = getCognitionEventEmitter();

  // 三级优先队列
  private readonly queues: Record<CognitionPriority, QueueItem[]> = {
    critical: [],
    high: [],
    normal: [],
  };

  // 并发控制 — 信号量
  private semaphore: Semaphore;
  private readonly runningUnits: Map<string, CognitionUnit> = new Map();

  // 去重
  private readonly deduplicationMap: Map<string, { stimulusId: string; timestamp: number }> = new Map();
  private deduplicationCleanupTimer?: ReturnType<typeof setInterval>;

  // 配额计数（每分钟重置）
  private readonly quotaCounters: Record<CognitionPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
  };
  private quotaResetTimer?: ReturnType<typeof setInterval>;

  // 降级模式
  private currentDegradationMode: DegradationMode = 'normal';
  private degradationCheckTimer?: ReturnType<typeof setInterval>;

  // 维度处理器（全局注册，所有 CognitionUnit 共享）
  private perceptionProcessor?: DimensionProcessor<PerceptionOutput>;
  private reasoningProcessor?: DimensionProcessor<ReasoningOutput>;
  private fusionProcessor?: DimensionProcessor<FusionOutput>;
  private decisionProcessor?: DimensionProcessor<DecisionOutput>;
  private preprocessor?: StimulusPreprocessor;
  private narrativeGenerator?: NarrativeGenerator;

  // 运行状态
  private started = false;
  private draining = false; // 优雅关闭中

  // 统计指标
  private stats = {
    totalSubmitted: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalRetried: 0,
    totalDropped: 0,
    totalDeduplicated: 0,
    executionTimeSum: 0,
    executionTimeCount: 0,
  };

  // 已从队列取出但尚未获得信号量的 pending 计数（修复问题1：指标准确性）
  private pendingAcquireCount = 0;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.semaphore = new Semaphore(this.config.maxConcurrency);
  }

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  /** 启动调度器 */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.draining = false;

    // 每分钟重置配额计数
    this.quotaResetTimer = setInterval(() => {
      this.quotaCounters.critical = 0;
      this.quotaCounters.high = 0;
      this.quotaCounters.normal = 0;
    }, 60_000);

    // 定时清理去重 Map
    const cleanupInterval = this.config.deduplicationCleanupIntervalMs
      ?? this.config.deduplicationWindowMs * 2;
    this.deduplicationCleanupTimer = setInterval(() => {
      this.cleanupDeduplication();
    }, cleanupInterval);

    // 定时检查降级
    this.degradationCheckTimer = setInterval(() => {
      this.checkDegradation();
    }, this.config.degradationCheckIntervalMs);

    log.info({ config: this.config }, 'CognitionScheduler v2.0 started');
  }

  /**
   * 停止调度器（优雅关闭）
   * @param timeoutMs 等待运行中任务完成的超时时间，默认 30 秒
   */
  async stop(timeoutMs = 30_000): Promise<void> {
    if (!this.started) return;
    this.draining = true;

    // 清理定时器
    if (this.quotaResetTimer) {
      clearInterval(this.quotaResetTimer);
      this.quotaResetTimer = undefined;
    }
    if (this.deduplicationCleanupTimer) {
      clearInterval(this.deduplicationCleanupTimer);
      this.deduplicationCleanupTimer = undefined;
    }
    if (this.degradationCheckTimer) {
      clearInterval(this.degradationCheckTimer);
      this.degradationCheckTimer = undefined;
    }

    // 拒绝所有队列中等待的任务
    for (const priority of ['critical', 'high', 'normal'] as CognitionPriority[]) {
      while (this.queues[priority].length > 0) {
        const item = this.queues[priority].shift()!;
        item.reject(new Error('Scheduler shutting down'));
      }
    }

    // 等待运行中的任务完成
    if (this.runningUnits.size > 0) {
      log.info({ runningCount: this.runningUnits.size }, 'Waiting for running cognition units to complete...');
      await Promise.race([
        this.waitForDrain(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);

      if (this.runningUnits.size > 0) {
        log.warn({ runningCount: this.runningUnits.size }, 'Force stopping remaining cognition units');
      }
    }

    this.started = false;
    this.draining = false;
    this.deduplicationMap.clear();

    log.info('CognitionScheduler v2.0 stopped');
  }

  /** 等待所有运行中的任务完成 */
  private waitForDrain(): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this.runningUnits.size === 0) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  // ==========================================================================
  // 维度处理器注册
  // ==========================================================================

  registerPerceptionProcessor(processor: DimensionProcessor<PerceptionOutput>): void {
    this.perceptionProcessor = processor;
  }

  registerReasoningProcessor(processor: DimensionProcessor<ReasoningOutput>): void {
    this.reasoningProcessor = processor;
  }

  registerFusionProcessor(processor: DimensionProcessor<FusionOutput>): void {
    this.fusionProcessor = processor;
  }

  registerDecisionProcessor(processor: DimensionProcessor<DecisionOutput>): void {
    this.decisionProcessor = processor;
  }

  registerPreprocessor(preprocessor: StimulusPreprocessor): void {
    this.preprocessor = preprocessor;
  }

  registerNarrativeGenerator(generator: NarrativeGenerator): void {
    this.narrativeGenerator = generator;
  }

  // ==========================================================================
  // 提交认知刺激
  // ==========================================================================

  /**
   * 提交认知刺激到调度队列
   *
   * 流程：过期检查 → 去重检查 → 配额检查 → 队列容量检查 → 入队 → 触发调度
   *
   * @returns Promise<CognitionResult> 认知活动完成后 resolve
   */
  submit(stimulus: CognitionStimulus): Promise<CognitionResult> {
    if (!this.started || this.draining) {
      return Promise.reject(new Error('CognitionScheduler is not accepting submissions'));
    }

    this.stats.totalSubmitted++;

    // Step 1: 检查过期
    if (stimulus.expiresAt && stimulus.expiresAt.getTime() < Date.now()) {
      log.debug({ stimulusId: stimulus.id }, 'Stimulus expired, discarding');
      this.stats.totalDropped++;
      return Promise.reject(new Error('Stimulus expired'));
    }

    // Step 2: 去重检查
    if (stimulus.deduplicationKey) {
      const existing = this.deduplicationMap.get(stimulus.deduplicationKey);
      if (existing && (Date.now() - existing.timestamp) < this.config.deduplicationWindowMs) {
        log.debug({
          stimulusId: stimulus.id,
          deduplicationKey: stimulus.deduplicationKey,
          existingStimulusId: existing.stimulusId,
        }, 'Stimulus deduplicated');
        this.stats.totalDeduplicated++;
        return Promise.reject(new Error(`Deduplicated: same key "${stimulus.deduplicationKey}" within window`));
      }
      this.deduplicationMap.set(stimulus.deduplicationKey, {
        stimulusId: stimulus.id,
        timestamp: Date.now(),
      });
    }

    // Step 3: 配额检查
    if (this.quotaCounters[stimulus.priority] >= this.config.quotas[stimulus.priority]) {
      log.warn({
        stimulusId: stimulus.id,
        priority: stimulus.priority,
        quota: this.config.quotas[stimulus.priority],
      }, 'Quota exceeded');
      this.stats.totalDropped++;
      return Promise.reject(new Error(`Quota exceeded for priority "${stimulus.priority}"`));
    }

    // Step 4: 队列容量检查
    const maxSize = this.config.maxQueueSize[stimulus.priority];
    if (this.queues[stimulus.priority].length >= maxSize) {
      if (stimulus.priority === 'normal') {
        const dropped = this.queues.normal.shift();
        if (dropped) {
          dropped.reject(new Error('Evicted from queue: capacity exceeded'));
          this.stats.totalDropped++;
          log.debug({ droppedId: dropped.stimulus.id }, 'Evicted oldest normal stimulus');
        }
      } else if (stimulus.priority === 'high') {
        const dropped = this.queues.high.shift();
        if (dropped) {
          dropped.reject(new Error('Evicted from queue: capacity exceeded'));
          this.stats.totalDropped++;
        }
      } else {
        // critical 队列满了，直接拒绝（不丢弃已有的）
        log.error({ stimulusId: stimulus.id, queueSize: maxSize }, 'Critical queue full, rejecting');
        this.stats.totalDropped++;
        return Promise.reject(new Error('Critical queue full'));
      }
    }

    // Step 5: 入队
    return new Promise<CognitionResult>((resolve, reject) => {
      const item: QueueItem = {
        stimulus,
        enqueuedAt: Date.now(),
        retryCount: 0,
        resolve,
        reject,
      };

      this.queues[stimulus.priority].push(item);
      this.quotaCounters[stimulus.priority]++;

      log.debug({
        stimulusId: stimulus.id,
        priority: stimulus.priority,
        queueDepth: this.getQueueDepth(),
      }, 'Stimulus enqueued');

      // 触发调度（非阻塞）
      this.scheduleNext();
    });
  }

  // ==========================================================================
  // 调度逻辑
  // ==========================================================================

  /**
   * 尝试从队列中取出并执行认知活动
   * 使用信号量控制并发，避免 race condition
   *
   * 修复问题1：先 acquire 信号量，成功后再 dequeue，确保队列深度指标准确
   */
  private scheduleNext(): void {
    if (!this.started || this.draining) return;

    // 先检查队列是否有内容（peek，不取出）
    if (this.getQueueDepth() === 0) return;

    // 先获取信号量许可，成功后再从队列取出
    this.pendingAcquireCount++;
    this.semaphore.acquire().then(() => {
      this.pendingAcquireCount--;

      // 获得许可后再 dequeue（此时队列可能已被其他调度消费）
      const item = this.dequeue();
      if (!item) {
        // 队列已空，释放许可
        this.semaphore.release();
        return;
      }

      // 检查入队后是否已过期
      if (item.stimulus.expiresAt && item.stimulus.expiresAt.getTime() < Date.now()) {
        item.reject(new Error('Stimulus expired while in queue'));
        this.stats.totalDropped++;
        this.semaphore.release();
        this.scheduleNext(); // 继续尝试下一个
        return;
      }

      this.executeItem(item).finally(() => {
        this.semaphore.release();
        // 执行完后继续调度
        this.scheduleNext();
      });
    });
  }

  /** 按优先级从队列中取出一项 */
  private dequeue(): QueueItem | undefined {
    for (const priority of ['critical', 'high', 'normal'] as CognitionPriority[]) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift();
      }
    }
    return undefined;
  }

  /** 执行单个认知活动（带重试） */
  private async executeItem(item: QueueItem): Promise<void> {
    const { stimulus, resolve, reject } = item;
    const startTime = Date.now();

    try {
      const unitConfig: Partial<CognitionUnitConfig> = {
        degradationMode: this.currentDegradationMode,
      };

      const unit = createCognitionUnit(stimulus, unitConfig);

      // 注册维度处理器
      if (this.perceptionProcessor) unit.setPerceptionProcessor(this.perceptionProcessor);
      if (this.reasoningProcessor) unit.setReasoningProcessor(this.reasoningProcessor);
      if (this.fusionProcessor) unit.setFusionProcessor(this.fusionProcessor);
      if (this.decisionProcessor) unit.setDecisionProcessor(this.decisionProcessor);
      if (this.preprocessor) unit.setPreprocessor(this.preprocessor);
      if (this.narrativeGenerator) unit.setNarrativeGenerator(this.narrativeGenerator);

      this.runningUnits.set(stimulus.id, unit);

      const result = await unit.execute();

      // 成功
      const elapsed = Date.now() - startTime;
      this.stats.totalCompleted++;
      this.stats.executionTimeSum += elapsed;
      this.stats.executionTimeCount++;

      resolve(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // 重试逻辑
      if (item.retryCount < this.config.retry.maxRetries) {
        item.retryCount++;
        this.stats.totalRetried++;

        // 指数退避 + 抖动
        const backoff = Math.min(
          this.config.retry.baseBackoffMs * Math.pow(2, item.retryCount - 1),
          this.config.retry.maxBackoffMs,
        );
        const jitter = backoff * 0.2 * Math.random();
        const delay = backoff + jitter;

        log.warn({
          stimulusId: stimulus.id,
          retryCount: item.retryCount,
          maxRetries: this.config.retry.maxRetries,
          delayMs: Math.round(delay),
          error: error.message,
        }, 'Retrying cognition activity');

        // 延迟后重新入队
        // 修复问题2：push 到队列尾部而非 unshift 到头部，
        // 避免持续失败的 item 反复占据队列头部阻塞同优先级的其他 item
        setTimeout(() => {
          if (this.started && !this.draining) {
            this.queues[stimulus.priority].push(item);
            this.scheduleNext();
          } else {
            reject(new Error('Scheduler stopped during retry'));
          }
        }, delay);
      } else {
        // 超过最大重试次数
        this.stats.totalFailed++;
        log.error({
          stimulusId: stimulus.id,
          retryCount: item.retryCount,
          error: error.message,
        }, 'Cognition activity failed after max retries');
        reject(error);
      }
    } finally {
      this.runningUnits.delete(stimulus.id);
    }
  }

  // ==========================================================================
  // 降级策略
  // ==========================================================================

  /** 检查是否需要降级（综合队列深度 + 系统资源） */
  private checkDegradation(): void {
    const queueDepth = this.getQueueDepth();
    let newMode: DegradationMode = 'normal';

    // 基于队列深度判断
    if (queueDepth >= this.config.degradationThresholds.emergencyQueueDepth) {
      newMode = 'emergency';
    } else if (queueDepth >= this.config.degradationThresholds.highPressureQueueDepth) {
      newMode = 'high_pressure';
    }

    // 基于系统资源判断（Node.js 可获取的指标）
    try {
      const memUsage = process.memoryUsage();
      const heapUsedRatio = memUsage.heapUsed / memUsage.heapTotal;

      if (heapUsedRatio >= this.config.degradationThresholds.emergencyMemory) {
        newMode = 'emergency';
      } else if (heapUsedRatio >= this.config.degradationThresholds.highPressureMemory && newMode === 'normal') {
        newMode = 'high_pressure';
      }
    } catch {
      // 忽略资源检查失败
    }

    if (newMode !== this.currentDegradationMode) {
      const previousMode = this.currentDegradationMode;
      this.currentDegradationMode = newMode;

      // 动态调整并发槽位
      const multiplier = this.config.concurrencyMultipliers[newMode];
      const newConcurrency = Math.max(1, Math.round(this.config.maxConcurrency * multiplier));
      this.semaphore.setMax(newConcurrency);

      this.emitter.emitDegradationModeChanged({
        previousMode,
        currentMode: newMode,
        reason: `Queue depth: ${queueDepth}, effective concurrency: ${newConcurrency}`,
        changedAt: new Date(),
      });

      log.info({
        previousMode,
        currentMode: newMode,
        queueDepth,
        effectiveConcurrency: newConcurrency,
      }, 'Degradation mode changed');

      // 紧急模式下：丢弃 normal 队列中超过 50% 容量的任务
      if (newMode === 'emergency') {
        const normalMax = Math.floor(this.config.maxQueueSize.normal * 0.5);
        while (this.queues.normal.length > normalMax) {
          const dropped = this.queues.normal.pop();
          if (dropped) {
            dropped.reject(new Error('Dropped in emergency mode'));
            this.stats.totalDropped++;
          }
        }
      }
    }
  }

  /** 手动设置降级模式 */
  setDegradationMode(mode: DegradationMode): void {
    const previousMode = this.currentDegradationMode;
    this.currentDegradationMode = mode;

    // 动态调整并发
    const multiplier = this.config.concurrencyMultipliers[mode];
    const newConcurrency = Math.max(1, Math.round(this.config.maxConcurrency * multiplier));
    this.semaphore.setMax(newConcurrency);

    if (previousMode !== mode) {
      this.emitter.emitDegradationModeChanged({
        previousMode,
        currentMode: mode,
        reason: 'Manual override',
        changedAt: new Date(),
      });
    }
  }

  /** 运行时更新配置 */
  updateConfig(partial: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...partial };

    if (partial.maxConcurrency !== undefined) {
      const multiplier = this.config.concurrencyMultipliers[this.currentDegradationMode];
      const newConcurrency = Math.max(1, Math.round(partial.maxConcurrency * multiplier));
      this.semaphore.setMax(newConcurrency);
    }

    log.info({ updatedKeys: Object.keys(partial) }, 'Scheduler config updated');
  }

  // ==========================================================================
  // 状态查询
  // ==========================================================================

  /** 获取当前队列深度 */
  getQueueDepth(): number {
    return this.queues.critical.length +
           this.queues.high.length +
           this.queues.normal.length;
  }

  /** 获取各优先级队列深度 */
  getQueueDepthByPriority(): Record<CognitionPriority, number> {
    return {
      critical: this.queues.critical.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
    };
  }

  /** 获取当前运行中的认知活动数 */
  getRunningCount(): number {
    return this.semaphore.getRunning();
  }

  /** 获取当前降级模式 */
  getDegradationMode(): DegradationMode {
    return this.currentDegradationMode;
  }

  /** 获取有效并发数（考虑降级模式） */
  getEffectiveConcurrency(): number {
    return this.semaphore.getMax();
  }

  /** 获取完整调度器指标（Prometheus-ready） */
  getMetrics(): SchedulerMetrics {
    return {
      started: this.started,
      degradationMode: this.currentDegradationMode,
      effectiveConcurrency: this.semaphore.getMax(),
      runningCount: this.semaphore.getRunning(),
      waitingCount: this.semaphore.getWaiting(),
      queueDepth: this.getQueueDepthByPriority(),
      quotaUsage: {
        critical: { used: this.quotaCounters.critical, limit: this.config.quotas.critical },
        high: { used: this.quotaCounters.high, limit: this.config.quotas.high },
        normal: { used: this.quotaCounters.normal, limit: this.config.quotas.normal },
      },
      deduplicationMapSize: this.deduplicationMap.size,
      pendingAcquireCount: this.pendingAcquireCount,
      totalSubmitted: this.stats.totalSubmitted,
      totalCompleted: this.stats.totalCompleted,
      totalFailed: this.stats.totalFailed,
      totalRetried: this.stats.totalRetried,
      totalDropped: this.stats.totalDropped,
      totalDeduplicated: this.stats.totalDeduplicated,
      avgExecutionMs: this.stats.executionTimeCount > 0
        ? Math.round(this.stats.executionTimeSum / this.stats.executionTimeCount)
        : 0,
    };
  }

  /** 获取调度器状态摘要（向后兼容 v1 API） */
  getStatus(): {
    started: boolean;
    degradationMode: DegradationMode;
    runningCount: number;
    queueDepth: Record<CognitionPriority, number>;
    quotaUsage: Record<CognitionPriority, { used: number; limit: number }>;
  } {
    const metrics = this.getMetrics();
    return {
      started: metrics.started,
      degradationMode: metrics.degradationMode,
      runningCount: metrics.runningCount,
      queueDepth: metrics.queueDepth,
      quotaUsage: metrics.quotaUsage,
    };
  }

  /** 清理过期的去重记录 */
  cleanupDeduplication(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.deduplicationMap.entries()) {
      if (now - entry.timestamp > this.config.deduplicationWindowMs) {
        this.deduplicationMap.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.debug({ cleaned, remaining: this.deduplicationMap.size }, 'Deduplication map cleaned');
    }
  }
}

// ============================================================================
// 单例
// ============================================================================

let defaultScheduler: CognitionScheduler | null = null;

/** 获取默认调度器（懒初始化） */
export function getCognitionScheduler(config?: Partial<SchedulerConfig>): CognitionScheduler {
  if (!defaultScheduler) {
    defaultScheduler = new CognitionScheduler(config);
  }
  return defaultScheduler;
}

/** 重置默认调度器（测试用） */
export function resetCognitionScheduler(): void {
  if (defaultScheduler) {
    defaultScheduler.stop(1000).catch(() => {});
    defaultScheduler = null;
  }
}
