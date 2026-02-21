/**
 * ============================================================================
 * KnowledgeFeedbackLoop — 知识反馈环
 * ============================================================================
 *
 * 将推理结果反馈到各知识组件，形成闭环学习：
 *   1. EventEmitter 异步事件总线 — 解耦发布/订阅
 *   2. 最小样本数保护 — ≥3 次一致反馈才更新权重
 *   3. revision_log — 所有权重修改可追溯、可回滚
 *   4. RL 奖励值 — 正确假设 +1，错误 -1，用于学习率调整
 *   5. 学习率自适应 — 初始 0.1，随反馈次数衰减，范围 [0.01, 0.3]
 *
 * 反馈路径：
 *   hypothesis_confirmed → 增强因果边权重 + 记录经验 + 更新物理参数
 *   hypothesis_rejected  → 削弱因果边权重 + 记录负面经验
 *   new_causal_link      → 因果图添加新边
 *   experience_recorded   → 经验池添加新记录
 *   physics_rule_updated  → 物理验证器更新参数
 */

import { EventEmitter } from 'events';
import { createModuleLogger } from '../../../../core/logger';
import type { BuiltinCausalGraph } from '../causal/causal-graph';
import type { ExperiencePool } from '../experience/experience-pool';
import type { Observability } from '../observability/observability';
import type {
  FeedbackEvent,
  FeedbackEventType,
  FeedbackLoopConfig,
  RevisionLogEntry,
  AnomalyDomain,
} from '../reasoning.types';

const log = createModuleLogger('knowledgeFeedbackLoop');

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: FeedbackLoopConfig = {
  minSamplesForUpdate: 3,
  learningRate: {
    initial: 0.1,
    min: 0.01,
    max: 0.3,
    decayFactor: 0.995,
  },
  revisionLogRetentionDays: 90,
  enableAutoFeedback: true,
};

// ============================================================================
// 内部类型
// ============================================================================

/** 反馈累积器 — 用于最小样本数保护 */
interface FeedbackAccumulator {
  /** 实体 ID（因果边 ID / 经验 ID 等） */
  entityId: string;
  /** 组件类型 */
  component: RevisionLogEntry['component'];
  /** 累积的正面反馈次数 */
  positiveCount: number;
  /** 累积的负面反馈次数 */
  negativeCount: number;
  /** 累积的奖励值总和 */
  totalReward: number;
  /** 最近的反馈事件 */
  recentEvents: FeedbackEvent[];
  /** 首次反馈时间 */
  firstFeedbackAt: Date;
  /** 最后反馈时间 */
  lastFeedbackAt: Date;
}

/** 反馈处理器函数签名 */
type FeedbackHandler = (event: FeedbackEvent) => Promise<void>;

// ============================================================================
// KnowledgeFeedbackLoop
// ============================================================================

export class KnowledgeFeedbackLoop {
  private readonly config: FeedbackLoopConfig;
  private readonly emitter = new EventEmitter();

  // 反馈累积器 — entityId → accumulator
  private readonly accumulators = new Map<string, FeedbackAccumulator>();

  // 修订日志 — 内存缓存（定期持久化到 DB）
  private readonly revisionLog: RevisionLogEntry[] = [];

  // 学习率状态
  private currentLearningRate: number;
  private totalFeedbackCount = 0;

  // 统计
  private stats = {
    eventsReceived: 0,
    updatesApplied: 0,
    updatesBlocked: 0,  // 因最小样本数保护而阻止的
    rollbacksPerformed: 0,
  };

  constructor(
    private readonly causalGraph: BuiltinCausalGraph,
    private readonly experiencePool: ExperiencePool,
    private readonly observability: Observability,
    config?: Partial<FeedbackLoopConfig>,
  ) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.currentLearningRate = this.config.learningRate.initial;

    // 注册事件处理器
    this.registerHandlers();

    log.info({
      minSamples: this.config.minSamplesForUpdate,
      initialLR: this.currentLearningRate,
    }, 'KnowledgeFeedbackLoop initialized');
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 发布反馈事件 — 异步处理，不阻塞调用方
   */
  emit(event: FeedbackEvent): void {
    this.stats.eventsReceived++;
    this.emitter.emit(event.type, event);
  }

  /**
   * 批量发布反馈事件
   */
  emitBatch(events: FeedbackEvent[]): void {
    for (const event of events) {
      this.emit(event);
    }
  }

  /**
   * 回滚指定的修订日志条目
   *
   * @returns 回滚是否成功
   */
  async rollback(revisionId: string): Promise<boolean> {
    const entry = this.revisionLog.find(r => r.id === revisionId);
    if (!entry) {
      log.warn({ revisionId }, 'Revision not found for rollback');
      return false;
    }

    if (entry.rolledBack) {
      log.warn({ revisionId }, 'Revision already rolled back');
      return false;
    }

    try {
      await this.applyRollback(entry);
      entry.rolledBack = true;
      this.stats.rollbacksPerformed++;

      log.info({
        revisionId,
        component: entry.component,
        entityId: entry.entityId,
      }, 'Revision rolled back successfully');

      return true;
    } catch (err) {
      log.error({
        revisionId,
        error: err instanceof Error ? err.message : String(err),
      }, 'Rollback failed');
      return false;
    }
  }

  /**
   * 获取修订日志
   */
  getRevisionLog(limit = 100): RevisionLogEntry[] {
    return this.revisionLog.slice(-limit);
  }

  /**
   * 获取反馈统计
   */
  getStats(): typeof this.stats & { currentLearningRate: number; accumulatorCount: number } {
    return {
      ...this.stats,
      currentLearningRate: this.currentLearningRate,
      accumulatorCount: this.accumulators.size,
    };
  }

  /**
   * 获取指定实体的累积反馈状态
   */
  getAccumulator(entityId: string): FeedbackAccumulator | undefined {
    return this.accumulators.get(entityId);
  }

  /**
   * 清理过期的修订日志
   */
  cleanupExpiredRevisions(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.revisionLogRetentionDays);

    const before = this.revisionLog.length;
    const kept = this.revisionLog.filter(r => r.timestamp >= cutoff);
    this.revisionLog.length = 0;
    this.revisionLog.push(...kept);

    const removed = before - kept.length;
    if (removed > 0) {
      log.info({ removed, remaining: kept.length }, 'Expired revisions cleaned up');
    }
    return removed;
  }

  // ==========================================================================
  // 事件处理器注册
  // ==========================================================================

  private registerHandlers(): void {
    const handlers: Record<FeedbackEventType, FeedbackHandler> = {
      hypothesis_confirmed: this.handleHypothesisConfirmed.bind(this),
      hypothesis_rejected: this.handleHypothesisRejected.bind(this),
      new_causal_link: this.handleNewCausalLink.bind(this),
      experience_recorded: this.handleExperienceRecorded.bind(this),
      physics_rule_updated: this.handlePhysicsRuleUpdated.bind(this),
    };

    for (const [eventType, handler] of Object.entries(handlers)) {
      this.emitter.on(eventType, (event: FeedbackEvent) => {
        // 异步执行，不阻塞
        handler(event).catch(err => {
          log.error({
            eventType,
            sessionId: event.sessionId,
            error: err instanceof Error ? err.message : String(err),
          }, 'Feedback handler error');
        });
      });
    }
  }

  // ==========================================================================
  // 反馈处理器实现
  // ==========================================================================

  /**
   * 假设被确认 → 增强因果边权重 + 记录正面经验
   */
  private async handleHypothesisConfirmed(event: FeedbackEvent): Promise<void> {
    const { hypothesisId, causalEdgeIds, domain, rootCause, resolution } =
      event.data as {
        hypothesisId: string;
        causalEdgeIds?: string[];
        domain?: AnomalyDomain;
        rootCause?: string;
        resolution?: string;
      };

    // 1. 累积因果边正面反馈
    if (causalEdgeIds && causalEdgeIds.length > 0) {
      for (const edgeId of causalEdgeIds) {
        const acc = this.getOrCreateAccumulator(edgeId, 'causal_edge');
        acc.positiveCount++;
        acc.totalReward += event.reward;
        acc.recentEvents.push(event);
        acc.lastFeedbackAt = new Date();

        // 检查是否达到最小样本数
        if (this.shouldApplyUpdate(acc)) {
          await this.applyCausalEdgeUpdate(acc, 'strengthen');
        } else {
          this.stats.updatesBlocked++;
          log.info({
            edgeId,
            positive: acc.positiveCount,
            negative: acc.negativeCount,
            required: this.config.minSamplesForUpdate,
          }, 'Update blocked: insufficient samples');
        }
      }
    }

    // 2. 记录正面经验
    if (domain && rootCause) {
      this.experiencePool.recordEpisodic({
        id: `exp_${event.sessionId}_${Date.now()}`,
        sessionId: event.sessionId,
        domain: domain,
        deviceType: (event.data.deviceType as string) ?? 'unknown',
        deviceCode: (event.data.deviceCode as string) ?? 'unknown',
        anomalyDescription: hypothesisId,
        hypothesis: hypothesisId,
        rootCause: rootCause,
        resolution: resolution ?? '',
        wasCorrect: true,
        confidence: Math.max(0, event.reward),
        featureVector: [],
        context: event.data,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });
    }

    // 3. 更新学习率
    this.updateLearningRate(event.reward);
  }

  /**
   * 假设被否定 → 削弱因果边权重 + 记录负面经验
   */
  private async handleHypothesisRejected(event: FeedbackEvent): Promise<void> {
    const { hypothesisId, causalEdgeIds, domain, rootCause } =
      event.data as {
        hypothesisId: string;
        causalEdgeIds?: string[];
        domain?: AnomalyDomain;
        rootCause?: string;
      };

    // 1. 累积因果边负面反馈
    if (causalEdgeIds && causalEdgeIds.length > 0) {
      for (const edgeId of causalEdgeIds) {
        const acc = this.getOrCreateAccumulator(edgeId, 'causal_edge');
        acc.negativeCount++;
        acc.totalReward += event.reward; // reward 为负值
        acc.recentEvents.push(event);
        acc.lastFeedbackAt = new Date();

        if (this.shouldApplyUpdate(acc)) {
          await this.applyCausalEdgeUpdate(acc, 'weaken');
        } else {
          this.stats.updatesBlocked++;
        }
      }
    }

    // 2. 记录负面经验
    if (domain && rootCause) {
      this.experiencePool.recordEpisodic({
        id: `exp_${event.sessionId}_${Date.now()}`,
        sessionId: event.sessionId,
        domain: domain,
        deviceType: (event.data.deviceType as string) ?? 'unknown',
        deviceCode: (event.data.deviceCode as string) ?? 'unknown',
        anomalyDescription: hypothesisId,
        hypothesis: hypothesisId,
        rootCause: rootCause,
        resolution: '',
        wasCorrect: false,
        confidence: 0,
        featureVector: [],
        context: event.data,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });
    }

    this.updateLearningRate(event.reward);
  }

  /**
   * 新因果关系发现 → 因果图添加新边
   */
  private async handleNewCausalLink(event: FeedbackEvent): Promise<void> {
    const { sourceNodeId, targetNodeId, mechanism, weight, domain } =
      event.data as {
        sourceNodeId: string;
        targetNodeId: string;
        mechanism: string;
        weight: number;
        domain: AnomalyDomain;
      };

    if (!sourceNodeId || !targetNodeId) {
      log.warn({ data: event.data }, 'Invalid new_causal_link event: missing node IDs');
      return;
    }

    // 记录修订日志
    const revision = this.createRevision(
      'causal_edge',
      `${sourceNodeId}->${targetNodeId}`,
      event,
      { exists: false },
      { source: sourceNodeId, target: targetNodeId, weight, mechanism },
    );

    // 添加到因果图
    try {
    this.causalGraph.addEdgePublic(sourceNodeId, targetNodeId, {
      weight: weight ?? 0.5,
      mechanism: mechanism ?? 'discovered_via_feedback',
      source_type: 'experience_learned',
    });

      this.revisionLog.push(revision);
      this.stats.updatesApplied++;

      log.info({
        source: sourceNodeId,
        target: targetNodeId,
        weight,
      }, 'New causal link added via feedback');
    } catch (err) {
      log.warn({
        source: sourceNodeId,
        target: targetNodeId,
        error: err instanceof Error ? err.message : String(err),
      }, 'Failed to add causal link');
    }
  }

  /**
   * 新经验记录 → 经验池添加
   */
  private async handleExperienceRecorded(event: FeedbackEvent): Promise<void> {
    const { domain, hypothesis, rootCause, resolution, wasCorrect, confidence, features, sensorTags } =
      event.data as {
        domain: AnomalyDomain;
        hypothesis: string;
        rootCause: string;
        resolution: string;
        wasCorrect: boolean;
        confidence: number;
        features: string[];
        sensorTags: string[];
      };

    this.experiencePool.recordEpisodic({
      id: `exp_${event.sessionId}_${Date.now()}`,
      sessionId: event.sessionId,
      domain,
      deviceType: (event.data.deviceType as string) ?? 'unknown',
      deviceCode: (event.data.deviceCode as string) ?? 'unknown',
      anomalyDescription: hypothesis,
      hypothesis,
      rootCause,
      resolution,
      wasCorrect,
      confidence,
      featureVector: [],
      context: event.data,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });

    this.stats.updatesApplied++;
  }

  /**
   * 物理规则更新 → 记录修订日志（实际参数更新由 PhysicsVerifier 自行处理）
   */
  private async handlePhysicsRuleUpdated(event: FeedbackEvent): Promise<void> {
    const { equationId, parameterName, oldValue, newValue } =
      event.data as {
        equationId: string;
        parameterName: string;
        oldValue: number;
        newValue: number;
      };

    // 累积反馈
    const entityId = `${equationId}.${parameterName}`;
    const acc = this.getOrCreateAccumulator(entityId, 'physics_param');
    acc.positiveCount++;
    acc.totalReward += event.reward;
    acc.recentEvents.push(event);
    acc.lastFeedbackAt = new Date();

    if (this.shouldApplyUpdate(acc)) {
      const revision = this.createRevision(
        'physics_param',
        entityId,
        event,
        { value: oldValue },
        { value: newValue },
      );
      this.revisionLog.push(revision);
      this.stats.updatesApplied++;

      log.info({
        equationId,
        parameterName,
        oldValue,
        newValue,
      }, 'Physics parameter update recorded');
    } else {
      this.stats.updatesBlocked++;
    }
  }

  // ==========================================================================
  // 因果边权重更新
  // ==========================================================================

  /**
   * 应用因果边权重更新
   *
   * 更新公式：
   *   strengthen: new_weight = old_weight + lr × (1 - old_weight) × avg_reward
   *   weaken:     new_weight = old_weight × (1 - lr × |avg_reward|)
   */
  private async applyCausalEdgeUpdate(
    acc: FeedbackAccumulator,
    direction: 'strengthen' | 'weaken',
  ): Promise<void> {
    const edgeId = acc.entityId;
    const avgReward = acc.totalReward / (acc.positiveCount + acc.negativeCount || 1);
    const lr = this.currentLearningRate;

    // 获取当前边权重
    const currentWeight = this.causalGraph.getEdgeWeight(edgeId);
    if (currentWeight === undefined) {
      log.warn({ edgeId }, 'Causal edge not found for update');
      return;
    }
    // edgeId 格式为 "source→target"

    let newWeight: number;
    if (direction === 'strengthen') {
      // 正向更新：向 1 靠近，受学习率和奖励值调节
      newWeight = currentWeight + lr * (1 - currentWeight) * Math.abs(avgReward);
    } else {
      // 负向更新：向 0 靠近，受学习率和奖励值调节
      newWeight = currentWeight * (1 - lr * Math.abs(avgReward));
    }

    // 边界约束 [0.01, 0.99]
    newWeight = Math.max(0.01, Math.min(0.99, newWeight));

    // 记录修订日志
    const latestEvent = acc.recentEvents[acc.recentEvents.length - 1];
    const revision = this.createRevision(
      'causal_edge',
      edgeId,
      latestEvent,
      { weight: currentWeight },
      { weight: newWeight },
    );

    // 应用更新
    this.causalGraph.setEdgeWeight(edgeId, newWeight);
    this.revisionLog.push(revision);
    this.stats.updatesApplied++;

    // 清空累积器
    acc.positiveCount = 0;
    acc.negativeCount = 0;
    acc.totalReward = 0;
    acc.recentEvents = [];

    log.info({
      edgeId,
      direction,
      oldWeight: currentWeight,
      newWeight,
      lr,
      avgReward,
    }, 'Causal edge weight updated');
  }

  // ==========================================================================
  // 回滚实现
  // ==========================================================================

  private async applyRollback(entry: RevisionLogEntry): Promise<void> {
    switch (entry.component) {
      case 'causal_edge': {
        const prevWeight = (entry.previousValue as { weight?: number }).weight;
        if (prevWeight !== undefined) {
          this.causalGraph.setEdgeWeight(entry.entityId, prevWeight);
        } else if (!(entry.previousValue as { exists?: boolean }).exists) {
          // 新增的边 → 回滚 = 删除
          this.causalGraph.removeEdge(entry.entityId);
          // removeEdge 接受 edgeKey 格式 "source→target"
        }
        break;
      }
      case 'physics_param': {
        // 物理参数回滚 — 记录日志，实际回滚由 PhysicsVerifier 处理
        log.info({
          entityId: entry.entityId,
          previousValue: entry.previousValue,
        }, 'Physics param rollback recorded (manual apply needed)');
        break;
      }
      case 'experience_weight':
      case 'bpa_config': {
        // 这些组件的回滚需要各自的模块处理
        log.info({
          component: entry.component,
          entityId: entry.entityId,
        }, 'Rollback recorded (component-specific apply needed)');
        break;
      }
    }
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 获取或创建反馈累积器
   */
  private getOrCreateAccumulator(
    entityId: string,
    component: RevisionLogEntry['component'],
  ): FeedbackAccumulator {
    let acc = this.accumulators.get(entityId);
    if (!acc) {
      acc = {
        entityId,
        component,
        positiveCount: 0,
        negativeCount: 0,
        totalReward: 0,
        recentEvents: [],
        firstFeedbackAt: new Date(),
        lastFeedbackAt: new Date(),
      };
      this.accumulators.set(entityId, acc);
    }
    return acc;
  }

  /**
   * 检查是否满足最小样本数保护条件
   *
   * 条件：总反馈次数 ≥ minSamplesForUpdate 且方向一致性 > 60%
   */
  private shouldApplyUpdate(acc: FeedbackAccumulator): boolean {
    const totalCount = acc.positiveCount + acc.negativeCount;
    if (totalCount < this.config.minSamplesForUpdate) {
      return false;
    }

    // 方向一致性检查：正面或负面占比 > 60%
    const dominantRatio = Math.max(acc.positiveCount, acc.negativeCount) / totalCount;
    return dominantRatio > 0.6;
  }

  /**
   * 自适应学习率更新
   *
   * 公式：lr = lr × decayFactor，约束在 [min, max] 范围内
   * 正面奖励时衰减较慢，负面奖励时衰减较快（避免错误反馈过度影响）
   */
  private updateLearningRate(reward: number): void {
    this.totalFeedbackCount++;
    const { decayFactor, min, max } = this.config.learningRate;

    // 负面奖励时加速衰减
    const effectiveDecay = reward >= 0 ? decayFactor : decayFactor * 0.95;

    this.currentLearningRate = Math.max(
      min,
      Math.min(max, this.currentLearningRate * effectiveDecay),
    );
  }

  /**
   * 创建修订日志条目
   */
  private createRevision(
    component: RevisionLogEntry['component'],
    entityId: string,
    event: FeedbackEvent,
    previousValue: Record<string, unknown>,
    newValue: Record<string, unknown>,
  ): RevisionLogEntry {
    return {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      component,
      entityId,
      previousValue,
      newValue,
      feedbackEventType: event.type,
      sessionId: event.sessionId,
      timestamp: new Date(),
      rolledBack: false,
    };
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(
    base: FeedbackLoopConfig,
    override?: Partial<FeedbackLoopConfig>,
  ): FeedbackLoopConfig {
    if (!override) return { ...base };
    return {
      minSamplesForUpdate: override.minSamplesForUpdate ?? base.minSamplesForUpdate,
      learningRate: { ...base.learningRate, ...override.learningRate },
      revisionLogRetentionDays: override.revisionLogRetentionDays ?? base.revisionLogRetentionDays,
      enableAutoFeedback: override.enableAutoFeedback ?? base.enableAutoFeedback,
    };
  }
}
