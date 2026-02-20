/**
 * ============================================================================
 * 证据权重自学习引擎 — EvidenceLearner
 * ============================================================================
 *
 * 通用赋能平台感知层：Bayesian 权重自适应学习
 *
 * 职责：
 *   1. 追踪每个证据源的历史准确率
 *   2. 基于 Bayesian 更新动态调整证据权重
 *   3. 检测证据源退化（精度下降、漂移）
 *   4. 支持维修/校准事件后的权重重置
 *
 * 数学基础：
 *   - Beta 分布先验：Beta(α, β)
 *   - 后验更新：α' = α + successes, β' = β + failures
 *   - 期望权重：E[w] = α / (α + β)
 *   - 置信区间：通过 Beta 分位数计算
 */

// ============================================================================
// 配置
// ============================================================================

export interface EvidenceLearnerConfig {
  /** 先验 α（初始成功次数） */
  priorAlpha: number;
  /** 先验 β（初始失败次数） */
  priorBeta: number;
  /** 最小权重下限 */
  minWeight: number;
  /** 最大权重上限 */
  maxWeight: number;
  /** 退化检测窗口大小 */
  degradationWindowSize: number;
  /** 退化阈值（准确率低于此值触发告警） */
  degradationThreshold: number;
  /** 遗忘因子（0-1，越小越快遗忘旧数据） */
  forgettingFactor: number;
  /** 校准后重置为先验 */
  resetOnCalibration: boolean;
}

export const DEFAULT_EVIDENCE_LEARNER_CONFIG: EvidenceLearnerConfig = {
  priorAlpha: 2,
  priorBeta: 2,
  minWeight: 0.05,
  maxWeight: 0.95,
  degradationWindowSize: 50,
  degradationThreshold: 0.6,
  forgettingFactor: 0.99,
  resetOnCalibration: true,
};

// ============================================================================
// 证据源档案
// ============================================================================

export interface EvidenceSourceProfile {
  /** 证据源 ID */
  sourceId: string;
  /** 当前 α */
  alpha: number;
  /** 当前 β */
  beta: number;
  /** 当前权重 */
  weight: number;
  /** 95% 置信下界 */
  confidenceLower: number;
  /** 95% 置信上界 */
  confidenceUpper: number;
  /** 累计观测数 */
  totalObservations: number;
  /** 滑动窗口内的准确率 */
  recentAccuracy: number;
  /** 是否退化 */
  isDegraded: boolean;
  /** 上次校准时间 */
  lastCalibrationAt: number | null;
  /** 上次更新时间 */
  lastUpdateAt: number;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

// ============================================================================
// 学习结果
// ============================================================================

export interface LearningResult {
  sourceId: string;
  previousWeight: number;
  newWeight: number;
  delta: number;
  observation: 'success' | 'failure';
  isDegraded: boolean;
  totalObservations: number;
}

// ============================================================================
// 证据权重自学习引擎
// ============================================================================

export class EvidenceLearner {
  private readonly config: EvidenceLearnerConfig;
  private profiles = new Map<string, EvidenceSourceProfile>();
  private recentWindows = new Map<string, boolean[]>();

  constructor(config?: Partial<EvidenceLearnerConfig>) {
    this.config = { ...DEFAULT_EVIDENCE_LEARNER_CONFIG, ...config };
  }

  /**
   * 注册证据源
   */
  registerSource(sourceId: string, metadata?: Record<string, unknown>): EvidenceSourceProfile {
    const profile: EvidenceSourceProfile = {
      sourceId,
      alpha: this.config.priorAlpha,
      beta: this.config.priorBeta,
      weight: this.config.priorAlpha / (this.config.priorAlpha + this.config.priorBeta),
      confidenceLower: 0,
      confidenceUpper: 1,
      totalObservations: 0,
      recentAccuracy: 0.5,
      isDegraded: false,
      lastCalibrationAt: null,
      lastUpdateAt: Date.now(),
      metadata: metadata || {},
    };

    this.updateConfidenceInterval(profile);
    this.profiles.set(sourceId, profile);
    this.recentWindows.set(sourceId, []);

    return profile;
  }

  /**
   * 记录观测结果并更新权重
   */
  observe(sourceId: string, success: boolean): LearningResult {
    let profile = this.profiles.get(sourceId);
    if (!profile) {
      profile = this.registerSource(sourceId);
    }

    const previousWeight = profile.weight;

    // 1. 应用遗忘因子（衰减旧观测的影响）
    profile.alpha *= this.config.forgettingFactor;
    profile.beta *= this.config.forgettingFactor;

    // 2. Bayesian 更新
    if (success) {
      profile.alpha += 1;
    } else {
      profile.beta += 1;
    }

    // 3. 计算新权重
    profile.weight = this.clampWeight(profile.alpha / (profile.alpha + profile.beta));
    profile.totalObservations++;
    profile.lastUpdateAt = Date.now();

    // 4. 更新置信区间
    this.updateConfidenceInterval(profile);

    // 5. 更新滑动窗口
    const window = this.recentWindows.get(sourceId)!;
    window.push(success);
    if (window.length > this.config.degradationWindowSize) {
      window.shift();
    }
    profile.recentAccuracy = window.filter(Boolean).length / window.length;

    // 6. 退化检测
    profile.isDegraded = profile.recentAccuracy < this.config.degradationThreshold
      && window.length >= this.config.degradationWindowSize / 2;

    return {
      sourceId,
      previousWeight,
      newWeight: profile.weight,
      delta: profile.weight - previousWeight,
      observation: success ? 'success' : 'failure',
      isDegraded: profile.isDegraded,
      totalObservations: profile.totalObservations,
    };
  }

  /**
   * 批量观测
   */
  observeBatch(observations: Array<{ sourceId: string; success: boolean }>): LearningResult[] {
    return observations.map(obs => this.observe(obs.sourceId, obs.success));
  }

  /**
   * 校准重置（设备校准/维修后调用）
   */
  calibrate(sourceId: string): void {
    const profile = this.profiles.get(sourceId);
    if (!profile) return;

    if (this.config.resetOnCalibration) {
      profile.alpha = this.config.priorAlpha;
      profile.beta = this.config.priorBeta;
      profile.weight = this.config.priorAlpha / (this.config.priorAlpha + this.config.priorBeta);
      this.recentWindows.set(sourceId, []);
      profile.recentAccuracy = 0.5;
      profile.isDegraded = false;
    }

    profile.lastCalibrationAt = Date.now();
    profile.lastUpdateAt = Date.now();
    this.updateConfidenceInterval(profile);
  }

  /**
   * 获取所有证据源的当前权重
   */
  getWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    for (const [id, profile] of this.profiles) {
      weights.set(id, profile.weight);
    }
    return weights;
  }

  /**
   * 获取归一化权重（所有权重之和为 1）
   */
  getNormalizedWeights(): Map<string, number> {
    const weights = this.getWeights();
    const total = Array.from(weights.values()).reduce((sum, w) => sum + w, 0);
    if (total === 0) return weights;

    const normalized = new Map<string, number>();
    for (const [id, w] of weights) {
      normalized.set(id, w / total);
    }
    return normalized;
  }

  /**
   * 获取证据源档案
   */
  getProfile(sourceId: string): EvidenceSourceProfile | undefined {
    return this.profiles.get(sourceId);
  }

  /**
   * 获取所有退化的证据源
   */
  getDegradedSources(): EvidenceSourceProfile[] {
    return Array.from(this.profiles.values()).filter(p => p.isDegraded);
  }

  /**
   * 获取所有证据源档案
   */
  getAllProfiles(): EvidenceSourceProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * 导出状态（用于持久化）
   */
  exportState(): Record<string, any> {
    const state: Record<string, any> = {};
    for (const [id, profile] of this.profiles) {
      state[id] = {
        ...profile,
        recentWindow: this.recentWindows.get(id) || [],
      };
    }
    return state;
  }

  /**
   * 导入状态（从持久化恢复）
   */
  importState(state: Record<string, any>): void {
    for (const [id, data] of Object.entries(state)) {
      const { recentWindow, ...profileData } = data;
      this.profiles.set(id, profileData as EvidenceSourceProfile);
      this.recentWindows.set(id, recentWindow || []);
    }
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private clampWeight(w: number): number {
    return Math.max(this.config.minWeight, Math.min(this.config.maxWeight, w));
  }

  /**
   * 近似 Beta 分布的 95% 置信区间
   * 使用 Normal 近似：μ ± 1.96 * σ
   */
  private updateConfidenceInterval(profile: EvidenceSourceProfile): void {
    const { alpha, beta } = profile;
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const std = Math.sqrt(variance);

    profile.confidenceLower = Math.max(0, mean - 1.96 * std);
    profile.confidenceUpper = Math.min(1, mean + 1.96 * std);
  }
}
