/**
 * ============================================================================
 * 工况运行时服务 — ConditionRuntimeService
 * ============================================================================
 *
 * 实时工况检测与自动切换
 *
 * 职责：
 *   1. 基于实时数据流自动检测当前工况阶段
 *   2. 触发工况切换事件
 *   3. 记录工况转换历史
 *   4. 提供工况相关的采样策略建议
 */

import { ConditionProfileManager, type ConditionProfile } from './condition-profile-manager';

// ============================================================================
// 工况运行时状态
// ============================================================================

export interface ConditionRuntimeState {
  /** 当前活跃工况配置 ID */
  activeProfileId: string;
  /** 当前工况阶段 */
  currentPhase: string;
  /** 上一个工况阶段 */
  previousPhase: string | null;
  /** 阶段切换时间 */
  phaseChangedAt: number;
  /** 阶段持续时间（ms） */
  phaseDurationMs: number;
  /** 当前采样率（Hz） */
  currentSamplingRateHz: number;
  /** 检测置信度 */
  detectionConfidence: number;
  /** 是否处于过渡态 */
  isTransitioning: boolean;
}

export interface PhaseTransition {
  timestamp: number;
  fromPhase: string;
  toPhase: string;
  confidence: number;
  trigger: 'auto_detect' | 'manual' | 'event' | 'threshold';
  metadata?: Record<string, unknown>;
}

export interface PhaseDetectionRule {
  /** 规则 ID */
  id: string;
  /** 目标阶段名称 */
  targetPhase: string;
  /** 检测条件 */
  conditions: Array<{
    /** 数据点 ID */
    pointId: string;
    /** 比较操作 */
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'change_rate';
    /** 阈值 */
    value: number | [number, number];
    /** 权重 */
    weight: number;
  }>;
  /** 最小满足条件数（加权） */
  minWeightedScore: number;
  /** 最小持续时间（ms）——防止抖动 */
  minDurationMs: number;
  /** 优先级 */
  priority: number;
}

// ============================================================================
// 工况运行时服务实现
// ============================================================================

export class ConditionRuntimeService {
  private profileManager: ConditionProfileManager;
  private state: ConditionRuntimeState;
  private transitionHistory: PhaseTransition[] = [];
  private detectionRules: PhaseDetectionRule[] = [];
  private pendingTransition: { phase: string; since: number; confidence: number } | null = null;
  private onTransitionCallbacks: Array<(transition: PhaseTransition) => void> = [];
  private maxHistorySize = 5_000;

  constructor(profileManager?: ConditionProfileManager) {
    this.profileManager = profileManager || new ConditionProfileManager();
    this.state = {
      activeProfileId: '',
      currentPhase: 'unknown',
      previousPhase: null,
      phaseChangedAt: Date.now(),
      phaseDurationMs: 0,
      currentSamplingRateHz: 1,
      detectionConfidence: 0,
      isTransitioning: false,
    };
  }

  /**
   * 初始化运行时（绑定工况配置）
   */
  initialize(profileId: number): void {
    const profile = this.profileManager.getProfile(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);

    this.state.activeProfileId = String(profileId);

    // 设置初始阶段为第一个 cyclePhase
    if (profile.cyclePhases && profile.cyclePhases.length > 0) {
      this.state.currentPhase = profile.cyclePhases[0].name;
      this.state.currentSamplingRateHz = 1;
    }
  }

  /**
   * 注册阶段检测规则
   */
  registerDetectionRule(rule: PhaseDetectionRule): void {
    this.detectionRules.push(rule);
    this.detectionRules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 批量注册检测规则
   */
  registerDetectionRules(rules: PhaseDetectionRule[]): void {
    for (const rule of rules) {
      this.registerDetectionRule(rule);
    }
  }

  /**
   * 输入实时数据，检测工况阶段
   */
  detect(dataPoints: Map<string, number>): ConditionRuntimeState {
    const now = Date.now();
    this.state.phaseDurationMs = now - this.state.phaseChangedAt;

    // 评估每条检测规则
    let bestMatch: { phase: string; score: number; confidence: number } | null = null;

    for (const rule of this.detectionRules) {
      let totalWeight = 0;
      let matchedWeight = 0;

      for (const condition of rule.conditions) {
        totalWeight += condition.weight;
        const value = dataPoints.get(condition.pointId);
        if (value === undefined) continue;

        if (this.evaluateCondition(value, condition.operator, condition.value)) {
          matchedWeight += condition.weight;
        }
      }

      const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
      if (score >= rule.minWeightedScore) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { phase: rule.targetPhase, score, confidence: score };
        }
      }
    }

    // 处理阶段切换（带防抖）
    if (bestMatch && bestMatch.phase !== this.state.currentPhase) {
      if (this.pendingTransition?.phase === bestMatch.phase) {
        // 持续检测到同一个新阶段
        const pendingDuration = now - this.pendingTransition.since;
        const rule = this.detectionRules.find(r => r.targetPhase === bestMatch!.phase);
        const minDuration = rule?.minDurationMs || 1000;

        if (pendingDuration >= minDuration) {
          // 确认切换
          this.executeTransition(bestMatch.phase, bestMatch.confidence, 'auto_detect');
          this.pendingTransition = null;
        } else {
          this.state.isTransitioning = true;
        }
      } else {
        // 新的待定切换
        this.pendingTransition = { phase: bestMatch.phase, since: now, confidence: bestMatch.confidence };
        this.state.isTransitioning = true;
      }
    } else {
      // 没有检测到需要切换，清除待定
      this.pendingTransition = null;
      this.state.isTransitioning = false;
    }

    if (bestMatch) {
      this.state.detectionConfidence = bestMatch.confidence;
    }

    return { ...this.state };
  }

  /**
   * 手动切换工况阶段
   */
  manualTransition(phase: string, metadata?: Record<string, unknown>): void {
    this.executeTransition(phase, 1.0, 'manual', metadata);
    this.pendingTransition = null;
    this.state.isTransitioning = false;
  }

  /**
   * 注册阶段切换回调
   */
  onTransition(callback: (transition: PhaseTransition) => void): void {
    this.onTransitionCallbacks.push(callback);
  }

  /**
   * 获取当前运行时状态
   */
  getState(): ConditionRuntimeState {
    return { ...this.state };
  }

  /**
   * 获取阶段转换历史
   */
  getTransitionHistory(limit?: number): PhaseTransition[] {
    const history = [...this.transitionHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * 获取当前阶段的采样建议
   */
  getSamplingRecommendation(): {
    rateHz: number;
    retentionPolicy: string;
    features: string[];
  } {
    const profileId = Number(this.state.activeProfileId);
    const profile = profileId ? this.profileManager.getProfile(profileId) : undefined;
    if (!profile) {
      return { rateHz: 1, retentionPolicy: 'all', features: [] };
    }

    const phase = profile.cyclePhases?.find((p: { name: string }) => p.name === this.state.currentPhase);
    if (!phase) {
      return { rateHz: 1, retentionPolicy: 'all', features: [] };
    }

    return {
      rateHz: 1,
      retentionPolicy: 'all',
      features: [],
    };
  }

  /**
   * 获取工况统计
   */
  getPhaseStats(): Record<string, { count: number; totalDurationMs: number; avgDurationMs: number }> {
    const stats: Record<string, { count: number; totalDurationMs: number; avgDurationMs: number }> = {};

    for (let i = 0; i < this.transitionHistory.length; i++) {
      const transition = this.transitionHistory[i];
      const nextTransition = this.transitionHistory[i + 1];
      const duration = nextTransition
        ? nextTransition.timestamp - transition.timestamp
        : Date.now() - transition.timestamp;

      if (!stats[transition.toPhase]) {
        stats[transition.toPhase] = { count: 0, totalDurationMs: 0, avgDurationMs: 0 };
      }
      stats[transition.toPhase].count++;
      stats[transition.toPhase].totalDurationMs += duration;
    }

    for (const phase of Object.keys(stats)) {
      stats[phase].avgDurationMs = stats[phase].count > 0
        ? stats[phase].totalDurationMs / stats[phase].count
        : 0;
    }

    return stats;
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private executeTransition(
    newPhase: string,
    confidence: number,
    trigger: PhaseTransition['trigger'],
    metadata?: Record<string, unknown>,
  ): void {
    const transition: PhaseTransition = {
      timestamp: Date.now(),
      fromPhase: this.state.currentPhase,
      toPhase: newPhase,
      confidence,
      trigger,
      metadata,
    };

    this.state.previousPhase = this.state.currentPhase;
    this.state.currentPhase = newPhase;
    this.state.phaseChangedAt = Date.now();
    this.state.phaseDurationMs = 0;
    this.state.detectionConfidence = confidence;

    // 更新采样率
    const profileId = Number(this.state.activeProfileId);
    const profile = profileId ? this.profileManager.getProfile(profileId) : undefined;
    if (profile) {
      const phase = profile.cyclePhases?.find((p: { name: string }) => p.name === newPhase);
      if (phase) {
        this.state.currentSamplingRateHz = 1;
      }
    }

    // 记录历史
    this.transitionHistory.push(transition);
    if (this.transitionHistory.length > this.maxHistorySize) {
      this.transitionHistory = this.transitionHistory.slice(-this.maxHistorySize);
    }

    // 通知回调
    for (const cb of this.onTransitionCallbacks) {
      try { cb(transition); } catch { /* ignore */ }
    }
  }

  private evaluateCondition(
    value: number,
    operator: string,
    threshold: number | [number, number],
  ): boolean {
    switch (operator) {
      case 'gt': return value > (threshold as number);
      case 'lt': return value < (threshold as number);
      case 'gte': return value >= (threshold as number);
      case 'lte': return value <= (threshold as number);
      case 'eq': return Math.abs(value - (threshold as number)) < 0.001;
      case 'between': {
        const [low, high] = threshold as [number, number];
        return value >= low && value <= high;
      }
      default: return false;
    }
  }
}
