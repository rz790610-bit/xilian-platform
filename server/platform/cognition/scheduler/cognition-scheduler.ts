/**
 * ============================================================================
 * 认知调度器 — CognitionScheduler
 * ============================================================================
 *
 * 管理认知活动的调度和执行，包括：
 *   - 三级优先队列（critical / high / normal）
 *   - 并发控制（最大并发认知活动数）
 *   - 去重合并（相同 deduplicationKey 在窗口期内合并）
 *   - 配额管理（各优先级的配额限制）
 *   - 降级策略（normal / high_pressure / emergency）
 *   - 刺激预处理（StimulusPreprocessor）
 *
 * 设计原则：
 *   - 调度器不包含认知逻辑，仅负责调度
 *   - 通过配置驱动行为
 *   - 支持运行时动态调整配置
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
// 默认配置
// ============================================================================

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrency: 3,
  quotas: {
    critical: 10,
    high: 20,
    normal: 50,
  },
  deduplicationWindowMs: 5_000,
  degradationThresholds: {
    highPressureCpu: 0.7,
    highPressureQueueDepth: 10,
    emergencyCpu: 0.9,
    emergencyQueueDepth: 20,
  },
};

// ============================================================================
// 队列项
// ============================================================================

interface QueueItem {
  stimulus: CognitionStimulus;
  enqueuedAt: Date;
  resolve: (result: CognitionResult) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// 调度器实现
// ============================================================================

export class CognitionScheduler {
  private readonly config: SchedulerConfig;
  private readonly emitter = getCognitionEventEmitter();

  // 三级优先队列
  private readonly queues: Record<CognitionPriority, QueueItem[]> = {
    critical: [],
    high: [],
    normal: [],
  };

  // 并发控制
  private runningCount = 0;
  private readonly runningUnits: Map<string, CognitionUnit> = new Map();

  // 去重
  private readonly deduplicationMap: Map<string, { stimulusId: string; timestamp: number }> = new Map();

  // 配额计数（每分钟重置）
  private readonly quotaCounters: Record<CognitionPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
  };
  private quotaResetTimer?: ReturnType<typeof setInterval>;

  // 降级模式
  private currentDegradationMode: DegradationMode = 'normal';

  // 维度处理器（全局注册，所有 CognitionUnit 共享）
  private perceptionProcessor?: DimensionProcessor<PerceptionOutput>;
  private reasoningProcessor?: DimensionProcessor<ReasoningOutput>;
  private fusionProcessor?: DimensionProcessor<FusionOutput>;
  private decisionProcessor?: DimensionProcessor<DecisionOutput>;
  private preprocessor?: StimulusPreprocessor;
  private narrativeGenerator?: NarrativeGenerator;

  // 运行状态
  private started = false;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  /** 启动调度器 */
  start(): void {
    if (this.started) return;
    this.started = true;

    // 每分钟重置配额计数
    this.quotaResetTimer = setInterval(() => {
      this.quotaCounters.critical = 0;
      this.quotaCounters.high = 0;
      this.quotaCounters.normal = 0;
    }, 60_000);

    log.info({ config: this.config }, 'CognitionScheduler started');
  }

  /** 停止调度器 */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.quotaResetTimer) {
      clearInterval(this.quotaResetTimer);
      this.quotaResetTimer = undefined;
    }

    log.info('CognitionScheduler stopped');
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
   * @returns Promise<CognitionResult> 认知活动完成后 resolve
   */
  submit(stimulus: CognitionStimulus): Promise<CognitionResult> {
    if (!this.started) {
      return Promise.reject(new Error('CognitionScheduler is not started'));
    }

    // Step 1: 检查过期
    if (stimulus.expiresAt && stimulus.expiresAt.getTime() < Date.now()) {
      log.debug({ stimulusId: stimulus.id }, 'Stimulus expired, discarding');
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
      return Promise.reject(new Error(`Quota exceeded for priority "${stimulus.priority}"`));
    }

    // Step 4: 入队
    return new Promise<CognitionResult>((resolve, reject) => {
      const item: QueueItem = {
        stimulus,
        enqueuedAt: new Date(),
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

      // 尝试调度
      this.trySchedule();
    });
  }

  // ==========================================================================
  // 调度逻辑
  // ==========================================================================

  /** 尝试从队列中取出并执行认知活动 */
  private trySchedule(): void {
    while (this.runningCount < this.config.maxConcurrency) {
      const item = this.dequeue();
      if (!item) break;

      this.runningCount++;
      this.executeItem(item).finally(() => {
        this.runningCount--;
        // 执行完后继续调度
        this.trySchedule();
      });
    }

    // 检查降级
    this.checkDegradation();
  }

  /** 按优先级从队列中取出一项 */
  private dequeue(): QueueItem | undefined {
    // 优先级顺序：critical > high > normal
    for (const priority of ['critical', 'high', 'normal'] as CognitionPriority[]) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift();
      }
    }
    return undefined;
  }

  /** 执行单个认知活动 */
  private async executeItem(item: QueueItem): Promise<void> {
    const { stimulus, resolve, reject } = item;

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
      resolve(result);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.runningUnits.delete(stimulus.id);
    }
  }

  // ==========================================================================
  // 降级策略
  // ==========================================================================

  /** 检查是否需要降级 */
  private checkDegradation(): void {
    const queueDepth = this.getQueueDepth();
    let newMode: DegradationMode = 'normal';

    if (queueDepth >= this.config.degradationThresholds.emergencyQueueDepth) {
      newMode = 'emergency';
    } else if (queueDepth >= this.config.degradationThresholds.highPressureQueueDepth) {
      newMode = 'high_pressure';
    }

    if (newMode !== this.currentDegradationMode) {
      const previousMode = this.currentDegradationMode;
      this.currentDegradationMode = newMode;

      this.emitter.emitDegradationModeChanged({
        previousMode,
        currentMode: newMode,
        reason: `Queue depth: ${queueDepth}`,
        changedAt: new Date(),
      });

      log.info({
        previousMode,
        currentMode: newMode,
        queueDepth,
      }, 'Degradation mode changed');
    }
  }

  /** 手动设置降级模式 */
  setDegradationMode(mode: DegradationMode): void {
    const previousMode = this.currentDegradationMode;
    this.currentDegradationMode = mode;

    if (previousMode !== mode) {
      this.emitter.emitDegradationModeChanged({
        previousMode,
        currentMode: mode,
        reason: 'Manual override',
        changedAt: new Date(),
      });
    }
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
    return this.runningCount;
  }

  /** 获取当前降级模式 */
  getDegradationMode(): DegradationMode {
    return this.currentDegradationMode;
  }

  /** 获取调度器状态摘要 */
  getStatus(): {
    started: boolean;
    degradationMode: DegradationMode;
    runningCount: number;
    queueDepth: Record<CognitionPriority, number>;
    quotaUsage: Record<CognitionPriority, { used: number; limit: number }>;
  } {
    return {
      started: this.started,
      degradationMode: this.currentDegradationMode,
      runningCount: this.runningCount,
      queueDepth: this.getQueueDepthByPriority(),
      quotaUsage: {
        critical: { used: this.quotaCounters.critical, limit: this.config.quotas.critical },
        high: { used: this.quotaCounters.high, limit: this.config.quotas.high },
        normal: { used: this.quotaCounters.normal, limit: this.config.quotas.normal },
      },
    };
  }

  /** 清理过期的去重记录 */
  cleanupDeduplication(): void {
    const now = Date.now();
    for (const [key, entry] of this.deduplicationMap.entries()) {
      if (now - entry.timestamp > this.config.deduplicationWindowMs) {
        this.deduplicationMap.delete(key);
      }
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
    defaultScheduler.stop();
    defaultScheduler = null;
  }
}
