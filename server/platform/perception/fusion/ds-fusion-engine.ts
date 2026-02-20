/**
 * ============================================================================
 * Dempster-Shafer 证据融合引擎 — 多源不确定性融合
 * ============================================================================
 *
 * 核心算法：
 *   1. Dempster 合成规则：m₁₂(C) = Σ{A∩B=C} m₁(A)·m₂(B) / (1-K)
 *      其中 K = Σ{A∩B=∅} m₁(A)·m₂(B) 为冲突因子
 *   2. Bayesian 权重自调：维修历史调优不确定性权重
 *   3. 冲突处理：当 K > 0.7 时启用 Yager 修正规则
 *
 * 证据源（日照港场景）：
 *   - 振动数据（加速度计）
 *   - 电气数据（电流/电压/功率）
 *   - 环境数据（风速/温度/湿度/盐雾）
 *   - 维修历史（CMMS 记录）
 *   - 生产数据（周期时间/吊次）
 *
 * 融合输出：
 *   统一信度分配 BPA (Basic Probability Assignment)
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 信度分配（Basic Probability Assignment） */
export interface BPA {
  /** 假设集合 → 信度值 */
  masses: Map<string, number>;
  /** 证据源名称 */
  sourceName: string;
  /** 证据权重（Bayesian 自调） */
  weight: number;
  /** 可靠度（0-1） */
  reliability: number;
  /** 时间戳 */
  timestamp: number;
}

/** 融合结果 */
export interface FusionResult {
  /** 融合后的信度分配 */
  fusedBPA: Map<string, number>;
  /** 冲突因子 K */
  conflictFactor: number;
  /** 信任度（Belief） */
  belief: Map<string, number>;
  /** 似真度（Plausibility） */
  plausibility: Map<string, number>;
  /** 不确定性区间 */
  uncertaintyInterval: Map<string, { lower: number; upper: number }>;
  /** 融合方法 */
  method: 'dempster' | 'yager' | 'murphy';
  /** 参与融合的证据源 */
  sources: string[];
  /** 融合耗时 (ms) */
  durationMs: number;
}

/** 证据源配置 */
export interface EvidenceSourceConfig {
  name: string;
  /** 初始权重 */
  initialWeight: number;
  /** 可靠度衰减半衰期（小时） */
  reliabilityHalfLife: number;
  /** 贡献度上限 */
  maxContribution: number;
  /** 是否启用 Bayesian 自调 */
  bayesianAdaptive: boolean;
}

/** 框架（辨识框架 Θ） */
export interface DiscernmentFrame {
  /** 框架名称 */
  name: string;
  /** 基本假设集合 */
  hypotheses: string[];
  /** 幂集（所有子集） */
  powerSet: string[][];
}

// ============================================================================
// DS 融合引擎
// ============================================================================

export class DSFusionEngine {
  private frame: DiscernmentFrame;
  private sourceConfigs: Map<string, EvidenceSourceConfig> = new Map();
  private historicalAccuracy: Map<string, number[]> = new Map();

  constructor(hypotheses: string[], sourceConfigs?: EvidenceSourceConfig[]) {
    this.frame = this.buildFrame(hypotheses);
    if (sourceConfigs) {
      for (const cfg of sourceConfigs) {
        this.sourceConfigs.set(cfg.name, cfg);
      }
    }
  }

  /**
   * 构建辨识框架
   */
  private buildFrame(hypotheses: string[]): DiscernmentFrame {
    const powerSet: string[][] = [];
    const n = hypotheses.length;
    for (let i = 1; i < (1 << n); i++) {
      const subset: string[] = [];
      for (let j = 0; j < n; j++) {
        if (i & (1 << j)) subset.push(hypotheses[j]);
      }
      powerSet.push(subset);
    }
    return { name: 'default', hypotheses, powerSet };
  }

  /**
   * 多源证据融合（核心方法）
   *
   * @param evidences 证据列表
   * @param conflictThreshold 冲突阈值（超过则切换 Yager 规则）
   */
  fuse(evidences: BPA[], conflictThreshold: number = 0.7): FusionResult {
    const startTime = Date.now();

    if (evidences.length === 0) {
      throw new Error('At least one evidence is required');
    }

    if (evidences.length === 1) {
      return this.singleEvidenceResult(evidences[0], startTime);
    }

    // 应用 Bayesian 权重调整
    const adjustedEvidences = evidences.map(e => this.applyBayesianWeight(e));

    // Murphy 平均法预处理（减少高冲突影响）
    const avgBPA = this.murphyAverage(adjustedEvidences);

    // 计算初始冲突因子
    const initialConflict = this.computeConflict(adjustedEvidences[0], adjustedEvidences[1]);

    let fusedBPA: Map<string, number>;
    let method: FusionResult['method'];

    if (initialConflict > conflictThreshold) {
      // 高冲突：使用 Murphy 平均 + 多次 Dempster 合成
      fusedBPA = this.murphyFusion(adjustedEvidences);
      method = 'murphy';
    } else {
      // 正常冲突：逐步 Dempster 合成
      fusedBPA = adjustedEvidences[0].masses;
      for (let i = 1; i < adjustedEvidences.length; i++) {
        fusedBPA = this.dempsterCombine(fusedBPA, adjustedEvidences[i].masses);
      }
      method = 'dempster';
    }

    // 计算 Belief 和 Plausibility
    const belief = this.computeBelief(fusedBPA);
    const plausibility = this.computePlausibility(fusedBPA);
    const uncertaintyInterval = this.computeUncertaintyInterval(belief, plausibility);

    // 最终冲突因子
    const conflictFactor = adjustedEvidences.length >= 2
      ? this.computeConflict(
          { masses: fusedBPA, sourceName: 'fused', weight: 1, reliability: 1, timestamp: Date.now() },
          adjustedEvidences[adjustedEvidences.length - 1]
        )
      : 0;

    return {
      fusedBPA,
      conflictFactor,
      belief,
      plausibility,
      uncertaintyInterval,
      method,
      sources: evidences.map(e => e.sourceName),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Dempster 合成规则
   */
  private dempsterCombine(m1: Map<string, number>, m2: Map<string, number>): Map<string, number> {
    const combined = new Map<string, number>();
    let conflict = 0;

    for (const [a, ma] of m1) {
      for (const [b, mb] of m2) {
        const intersection = this.intersect(a, b);
        const product = ma * mb;

        if (intersection === '') {
          // 空集 → 冲突
          conflict += product;
        } else {
          combined.set(intersection, (combined.get(intersection) || 0) + product);
        }
      }
    }

    // 归一化
    const normFactor = 1 - conflict;
    if (normFactor <= 0) {
      throw new Error(`Total conflict detected (K=${conflict.toFixed(4)}), cannot combine`);
    }

    const normalized = new Map<string, number>();
    for (const [key, value] of combined) {
      normalized.set(key, value / normFactor);
    }

    return normalized;
  }

  /**
   * Murphy 平均融合（高冲突场景）
   */
  private murphyFusion(evidences: BPA[]): Map<string, number> {
    const avg = this.murphyAverage(evidences);
    // 用平均 BPA 自身合成 n-1 次
    let result = avg;
    for (let i = 1; i < evidences.length; i++) {
      result = this.dempsterCombine(result, avg);
    }
    return result;
  }

  /**
   * Murphy 平均
   */
  private murphyAverage(evidences: BPA[]): Map<string, number> {
    const avg = new Map<string, number>();
    const totalWeight = evidences.reduce((sum, e) => sum + e.weight * e.reliability, 0);

    for (const evidence of evidences) {
      const w = (evidence.weight * evidence.reliability) / totalWeight;
      for (const [key, value] of evidence.masses) {
        avg.set(key, (avg.get(key) || 0) + value * w);
      }
    }

    return avg;
  }

  /**
   * 计算冲突因子
   */
  private computeConflict(e1: BPA, e2: BPA): number {
    let conflict = 0;
    for (const [a, ma] of e1.masses) {
      for (const [b, mb] of e2.masses) {
        if (this.intersect(a, b) === '') {
          conflict += ma * mb;
        }
      }
    }
    return conflict;
  }

  /**
   * 计算 Belief（信任度）
   */
  private computeBelief(bpa: Map<string, number>): Map<string, number> {
    const belief = new Map<string, number>();
    for (const hypothesis of this.frame.hypotheses) {
      let bel = 0;
      for (const [key, mass] of bpa) {
        if (this.isSubset(key, hypothesis)) {
          bel += mass;
        }
      }
      belief.set(hypothesis, bel);
    }
    return belief;
  }

  /**
   * 计算 Plausibility（似真度）
   */
  private computePlausibility(bpa: Map<string, number>): Map<string, number> {
    const plausibility = new Map<string, number>();
    for (const hypothesis of this.frame.hypotheses) {
      let pl = 0;
      for (const [key, mass] of bpa) {
        if (this.intersect(key, hypothesis) !== '') {
          pl += mass;
        }
      }
      plausibility.set(hypothesis, pl);
    }
    return plausibility;
  }

  /**
   * 计算不确定性区间 [Bel, Pl]
   */
  private computeUncertaintyInterval(
    belief: Map<string, number>,
    plausibility: Map<string, number>
  ): Map<string, { lower: number; upper: number }> {
    const intervals = new Map<string, { lower: number; upper: number }>();
    for (const h of this.frame.hypotheses) {
      intervals.set(h, {
        lower: belief.get(h) || 0,
        upper: plausibility.get(h) || 0,
      });
    }
    return intervals;
  }

  /**
   * 应用 Bayesian 权重自调
   */
  private applyBayesianWeight(evidence: BPA): BPA {
    const config = this.sourceConfigs.get(evidence.sourceName);
    if (!config || !config.bayesianAdaptive) return evidence;

    // 基于历史准确率调整权重
    const history = this.historicalAccuracy.get(evidence.sourceName) || [];
    if (history.length > 0) {
      const recentAccuracy = history.slice(-10).reduce((s, v) => s + v, 0) / Math.min(history.length, 10);
      evidence.weight = config.initialWeight * recentAccuracy;
    }

    return evidence;
  }

  /**
   * 更新证据源历史准确率（用于 Bayesian 自调）
   */
  updateSourceAccuracy(sourceName: string, accuracy: number): void {
    if (!this.historicalAccuracy.has(sourceName)) {
      this.historicalAccuracy.set(sourceName, []);
    }
    const history = this.historicalAccuracy.get(sourceName)!;
    history.push(accuracy);
    // 保留最近 100 条
    if (history.length > 100) history.shift();
  }

  // ============================================================================
  // 集合操作辅助
  // ============================================================================

  /**
   * 集合交集（用逗号分隔的字符串表示集合）
   */
  private intersect(a: string, b: string): string {
    const setA = new Set(a.split(','));
    const setB = new Set(b.split(','));
    const result = [...setA].filter(x => setB.has(x));
    return result.join(',');
  }

  /**
   * 子集判断
   */
  private isSubset(subset: string, superset: string): boolean {
    const subItems = new Set(subset.split(','));
    const superItems = new Set(superset.split(','));
    return [...subItems].every(item => superItems.has(item));
  }

  /**
   * 单证据结果
   */
  private singleEvidenceResult(evidence: BPA, startTime: number): FusionResult {
    const belief = this.computeBelief(evidence.masses);
    const plausibility = this.computePlausibility(evidence.masses);
    return {
      fusedBPA: evidence.masses,
      conflictFactor: 0,
      belief,
      plausibility,
      uncertaintyInterval: this.computeUncertaintyInterval(belief, plausibility),
      method: 'dempster',
      sources: [evidence.sourceName],
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 注册证据源配置
   */
  registerSource(config: EvidenceSourceConfig): void {
    this.sourceConfigs.set(config.name, config);
  }

  /**
   * 获取框架信息
   */
  getFrame(): DiscernmentFrame {
    return this.frame;
  }
}
