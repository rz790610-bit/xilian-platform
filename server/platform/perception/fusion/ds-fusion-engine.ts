/**
 * ============================================================================
 * 感知层 DS 融合引擎 — 统一适配器
 * ============================================================================
 *
 * 设计决策（C1 合并）：
 *   - 认知层 DSFusionEngine（634 行）为权威实现，包含三种策略、可靠性管理、日志
 *   - 本文件作为感知层适配器，桥接两种 BPA 格式：
 *     · 感知层格式：Map<string, number> masses + weight/reliability
 *     · 认知层格式：Record<string, number> beliefMass
 *   - 保持感知层原有接口不变（BPA, FusionResult, fuse()），确保零回归
 *   - 新增 fuseWithBPABuilder() 方法，接受 BPABuilder 输出的 BasicProbabilityAssignment
 *
 * 数据流：
 *   BPABuilder.buildAll() → BasicProbabilityAssignment[]
 *     → toPerceptionBPA() → BPA[] → DSFusionEngine.fuse()
 *     或
 *     → toCognitionEvidence() → DSEvidenceInput[] → CognitiveDSEngine.fuseWithReliability()
 *
 * 向后兼容：
 *   - 原 perception-pipeline.ts 中的 this.fusionEngine.fuse(evidences) 继续工作
 *   - 原 BPA 接口（masses: Map<string, number>）继续工作
 *   - 新代码推荐使用 fuseWithBPABuilder() 获得更丰富的输出
 */

import { createModuleLogger } from '../../../core/logger';
import {
  DSFusionEngine as CognitiveDSFusionEngine,
} from '../../cognition/engines/ds-fusion.engine';
import type {
  DSConflictStrategy,
  DSEvidenceInput,
  DSFusionOutput,
  DSFusionLogEntry,
} from '../../cognition/types';
import type { BasicProbabilityAssignment } from './bpa.types';
import { toCognitionEvidence } from './bpa.types';

const log = createModuleLogger('perception-ds-fusion');

// ============================================================================
// 感知层 BPA 格式（保持向后兼容）
// ============================================================================

/** 信度分配（Basic Probability Assignment）— 感知层格式 */
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

/** 融合结果 — 感知层格式 */
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
// 增强融合结果（包含认知层引擎的完整输出）
// ============================================================================

export interface EnhancedFusionResult extends FusionResult {
  /** 认知层引擎的完整输出 */
  cognitiveOutput?: DSFusionOutput;
  /** 最高信念的假设 */
  decision: string;
  /** 决策置信度 */
  confidence: number;
}

// ============================================================================
// 感知层 DS 融合引擎（统一适配器）
// ============================================================================

export class DSFusionEngine {
  private readonly cognitiveEngine: CognitiveDSFusionEngine;
  private readonly frame: DiscernmentFrame;
  private sourceConfigs: Map<string, EvidenceSourceConfig> = new Map();

  constructor(hypotheses: string[], sourceConfigs?: EvidenceSourceConfig[]) {
    // 构建辨识框架
    this.frame = this.buildFrame(hypotheses);

    // 初始化认知层引擎
    this.cognitiveEngine = new CognitiveDSFusionEngine({
      frameOfDiscernment: hypotheses,
      defaultStrategy: 'dempster',
      highConflictThreshold: 0.7,
      extremeConflictThreshold: 0.95,
      conflictPenaltyFactor: 0.3,
      sources: (sourceConfigs || []).map(sc => ({
        id: sc.name,
        name: sc.name,
        type: 'sensor' as const,
        initialReliability: 1.0,
        currentReliability: 1.0,
        decayFactor: 0.95,
        recoveryFactor: 0.1,
        minReliability: 0.1,
        enabled: true,
        correctCount: 0,
        errorCount: 0,
        lastUpdatedAt: new Date(),
      })),
    });

    if (sourceConfigs) {
      for (const cfg of sourceConfigs) {
        this.sourceConfigs.set(cfg.name, cfg);
      }
    }

    log.info({
      hypotheses,
      sourceCount: sourceConfigs?.length ?? 0,
    }, 'Perception DS fusion engine initialized (unified adapter)');
  }

  // ==========================================================================
  // 原有接口（向后兼容）
  // ==========================================================================

  /**
   * 多源证据融合（原有接口，保持兼容）
   *
   * 内部委托给认知层引擎，然后转换回感知层格式
   */
  fuse(evidences: BPA[], conflictThreshold: number = 0.7): FusionResult {
    const startTime = Date.now();

    if (evidences.length === 0) {
      throw new Error('At least one evidence is required');
    }

    // 转换为认知层格式
    const cognitiveInputs: Array<Record<string, number>> = evidences.map(e => {
      const beliefMass: Record<string, number> = {};
      for (const [key, value] of e.masses) {
        beliefMass[key] = value;
      }
      return beliefMass;
    });

    // 使用认知层引擎融合
    const { beliefMass, conflict } = this.cognitiveEngine.fuseMultiple(cognitiveInputs);

    // 转换回感知层格式
    const fusedBPA = new Map<string, number>();
    for (const [key, value] of Object.entries(beliefMass)) {
      fusedBPA.set(key, value);
    }

    // 计算 Belief 和 Plausibility
    const belief = this.computeBelief(fusedBPA);
    const plausibility = this.computePlausibility(fusedBPA);
    const uncertaintyInterval = this.computeUncertaintyInterval(belief, plausibility);

    // 确定融合方法
    let method: FusionResult['method'] = 'dempster';
    if (conflict > conflictThreshold) {
      method = 'murphy';
    }

    return {
      fusedBPA,
      conflictFactor: conflict,
      belief,
      plausibility,
      uncertaintyInterval,
      method,
      sources: evidences.map(e => e.sourceName),
      durationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // 新增接口 — 与 BPABuilder 集成
  // ==========================================================================

  /**
   * 使用 BPABuilder 输出进行融合（推荐新代码使用）
   *
   * @param bpaMap BPABuilder.buildAll() 的输出
   * @param sourceWeights 可选的证据源权重覆盖
   * @returns 增强融合结果
   */
  fuseWithBPABuilder(
    bpaMap: Map<string, BasicProbabilityAssignment>,
    sourceWeights?: Record<string, number>,
  ): EnhancedFusionResult {
    const startTime = Date.now();

    if (bpaMap.size === 0) {
      return this.createEmptyResult(startTime);
    }

    // 转换为认知层 DSEvidenceInput 格式
    const inputs: DSEvidenceInput[] = [];
    for (const [source, bpa] of bpaMap) {
      const evidence = toCognitionEvidence(bpa, source);
      inputs.push(evidence);
    }

    // 使用认知层引擎的增强融合
    const cognitiveOutput = this.cognitiveEngine.fuseWithReliability(inputs);

    // 转换为感知层 FusionResult 格式
    const fusedBPA = new Map<string, number>();
    for (const [key, value] of Object.entries(cognitiveOutput.fusedMass)) {
      fusedBPA.set(key, value);
    }

    const belief = this.computeBelief(fusedBPA);
    const plausibility = this.computePlausibility(fusedBPA);
    const uncertaintyInterval = this.computeUncertaintyInterval(belief, plausibility);

    return {
      fusedBPA,
      conflictFactor: cognitiveOutput.totalConflict,
      belief,
      plausibility,
      uncertaintyInterval,
      method: cognitiveOutput.strategyUsed as FusionResult['method'],
      sources: [...bpaMap.keys()],
      durationMs: Date.now() - startTime,
      cognitiveOutput,
      decision: cognitiveOutput.decision,
      confidence: cognitiveOutput.confidence,
    };
  }

  // ==========================================================================
  // 证据源管理（委托给认知层引擎）
  // ==========================================================================

  /**
   * 更新证据源可靠性
   */
  updateSourceAccuracy(sourceName: string, accuracy: number): void {
    const correct = accuracy >= 0.5;
    this.cognitiveEngine.updateSourceReliability(sourceName, correct);
  }

  /**
   * 注册证据源配置
   */
  registerSource(config: EvidenceSourceConfig): void {
    this.sourceConfigs.set(config.name, config);
    this.cognitiveEngine.registerSource({
      id: config.name,
      name: config.name,
      type: 'sensor',
      initialReliability: 1.0,
      currentReliability: 1.0,
      decayFactor: 0.95,
      recoveryFactor: 0.1,
      minReliability: 0.1,
      enabled: true,
      correctCount: 0,
      errorCount: 0,
      lastUpdatedAt: new Date(),
    });
  }

  /**
   * 获取框架信息
   */
  getFrame(): DiscernmentFrame {
    return this.frame;
  }

  /**
   * 获取底层认知引擎（用于高级操作）
   */
  getCognitiveEngine(): CognitiveDSFusionEngine {
    return this.cognitiveEngine;
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

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

  private computeUncertaintyInterval(
    belief: Map<string, number>,
    plausibility: Map<string, number>,
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

  private intersect(a: string, b: string): string {
    if (a === 'theta') return b;
    if (b === 'theta') return a;
    const setA = new Set(a.split(','));
    const setB = new Set(b.split(','));
    const result = [...setA].filter(x => setB.has(x));
    return result.join(',');
  }

  private isSubset(subset: string, superset: string): boolean {
    if (subset === 'theta') return false;
    const subItems = new Set(subset.split(','));
    const superItems = new Set(superset.split(','));
    return [...subItems].every(item => superItems.has(item));
  }

  private createEmptyResult(startTime: number): EnhancedFusionResult {
    return {
      fusedBPA: new Map([['theta', 1.0]]),
      conflictFactor: 0,
      belief: new Map(),
      plausibility: new Map(),
      uncertaintyInterval: new Map(),
      method: 'dempster',
      sources: [],
      durationMs: Date.now() - startTime,
      decision: 'unknown',
      confidence: 0,
    };
  }
}
