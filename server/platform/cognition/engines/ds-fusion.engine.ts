/**
 * ============================================================================
 * DS 融合引擎统一版 — Dempster-Shafer Evidence Fusion Engine
 * ============================================================================
 *
 * 从 fusionDiagnosis.service.ts 中的 DSEvidence 类抽取并增强。
 *
 * 增强点：
 *   1. 三种冲突处理策略：Dempster（经典）、Murphy（平均证据）、Yager（冲突转移）
 *   2. 证据源可靠性管理：动态调整证据源权重
 *   3. 融合过程日志：每步记录输入/输出/冲突/策略
 *   4. 自适应策略切换：冲突度超阈值自动切换策略
 *
 * 兼容性保障：
 *   - 保持与原 DSEvidence 完全一致的 dempsterCombination() 接口
 *   - 保持与原 DSEvidence 完全一致的 fuseMultiple() 返回格式
 *   - 保持与原 DSEvidence 完全一致的 getDecision() 行为
 *   - 原 fusionDiagnosis.service.ts 通过 re-export 继续工作
 *
 * 设计原则：
 *   - 算法核心与 Python 版本保持一致
 *   - 所有计算均为同步纯函数，无外部 IO 依赖
 *   - 通过配置驱动行为，不硬编码任何阈值
 */

import { createModuleLogger } from '../../../core/logger';
import type {
  DSConflictStrategy,
  DSEvidenceSourceConfig,
  DSFusionEngineConfig,
  DSEvidenceInput,
  DSFusionOutput,
  DSFusionLogEntry,
} from '../types';

const log = createModuleLogger('dsFusionEngine');

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: DSFusionEngineConfig = {
  frameOfDiscernment: [
    'bearing_damage', 'gear_wear', 'misalignment',
    'imbalance', 'looseness', 'electrical_fault', 'normal',
  ],
  defaultStrategy: 'dempster',
  highConflictThreshold: 0.7,
  extremeConflictThreshold: 0.95,
  conflictPenaltyFactor: 0.3,
  sources: [],
};

// ============================================================================
// DS 融合引擎
// ============================================================================

export class DSFusionEngine {
  private readonly config: DSFusionEngineConfig;
  private readonly sourceMap: Map<string, DSEvidenceSourceConfig>;

  constructor(config?: Partial<DSFusionEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sourceMap = new Map();
    for (const source of this.config.sources) {
      this.sourceMap.set(source.id, { ...source });
    }
  }

  // ==========================================================================
  // 公共 API — 与原 DSEvidence 兼容
  // ==========================================================================

  /**
   * Dempster 组合规则 — 两个证据源融合
   *
   * 与原 DSEvidence.dempsterCombination() 完全一致：
   *   m(A) = Σ{B∩C=A} m1(B)·m2(C) / (1 - K)
   *   K = Σ{B∩C=∅} m1(B)·m2(C)
   *
   * @returns [融合后的信念质量, 冲突度]
   */
  dempsterCombination(
    m1: Record<string, number>,
    m2: Record<string, number>,
  ): [Record<string, number>, number] {
    const combined: Record<string, number> = {};
    let conflict = 0;

    for (const [a1, mass1] of Object.entries(m1)) {
      for (const [a2, mass2] of Object.entries(m2)) {
        const intersection = this.computeIntersection(a1, a2);
        const product = mass1 * mass2;

        if (intersection === null) {
          conflict += product;
        } else {
          combined[intersection] = (combined[intersection] || 0) + product;
        }
      }
    }

    // 冲突度 >= 1 时退化为完全不确定
    if (conflict >= 1.0) {
      return [{ theta: 1.0 }, 1.0];
    }

    // 归一化
    const normalizing = 1.0 - conflict;
    for (const key of Object.keys(combined)) {
      combined[key] /= normalizing;
    }

    return [combined, conflict];
  }

  /**
   * Murphy 平均证据法 — 先平均再 Dempster 组合
   *
   * 适用于高冲突场景：先将所有证据取算术平均，
   * 然后将平均证据与自身进行 (n-1) 次 Dempster 组合。
   * 这样可以有效缓解单个异常证据源的影响。
   *
   * @returns [融合后的信念质量, 冲突度]
   */
  murphyCombination(
    evidenceList: Array<Record<string, number>>,
  ): [Record<string, number>, number] {
    if (evidenceList.length === 0) {
      return [{ theta: 1.0 }, 0];
    }
    if (evidenceList.length === 1) {
      return [{ ...evidenceList[0] }, 0];
    }

    // Step 1: 计算所有证据的算术平均
    const allKeys = new Set<string>();
    for (const evidence of evidenceList) {
      for (const key of Object.keys(evidence)) {
        allKeys.add(key);
      }
    }

    const averaged: Record<string, number> = {};
    for (const key of allKeys) {
      let sum = 0;
      for (const evidence of evidenceList) {
        sum += evidence[key] || 0;
      }
      averaged[key] = sum / evidenceList.length;
    }

    // Step 2: 将平均证据与自身进行 (n-1) 次 Dempster 组合
    let result = { ...averaged };
    let totalConflict = 0;

    for (let i = 1; i < evidenceList.length; i++) {
      const [fused, conflict] = this.dempsterCombination(result, averaged);
      result = fused;
      totalConflict = 1 - (1 - totalConflict) * (1 - conflict);
    }

    return [result, totalConflict];
  }

  /**
   * Yager 冲突转移法 — 将冲突质量转移到全集 theta
   *
   * 与 Dempster 规则的区别：不做归一化，而是将冲突质量
   * 分配给 theta（完全不确定性），更加保守。
   *
   * @returns [融合后的信念质量, 冲突度]
   */
  yagerCombination(
    m1: Record<string, number>,
    m2: Record<string, number>,
  ): [Record<string, number>, number] {
    const combined: Record<string, number> = {};
    let conflict = 0;

    for (const [a1, mass1] of Object.entries(m1)) {
      for (const [a2, mass2] of Object.entries(m2)) {
        const intersection = this.computeIntersection(a1, a2);
        const product = mass1 * mass2;

        if (intersection === null) {
          conflict += product;
        } else {
          combined[intersection] = (combined[intersection] || 0) + product;
        }
      }
    }

    // Yager: 将冲突质量转移到 theta，不做归一化
    combined.theta = (combined.theta || 0) + conflict;

    return [combined, conflict];
  }

  /**
   * 多证据源融合 — 兼容原 DSEvidence.fuseMultiple()
   *
   * 增强：支持自适应策略切换和融合过程日志
   */
  fuseMultiple(
    evidenceList: Array<Record<string, number>>,
    strategy?: DSConflictStrategy,
  ): { beliefMass: Record<string, number>; conflict: number } {
    if (evidenceList.length === 0) {
      return { beliefMass: { theta: 1.0 }, conflict: 0 };
    }

    const effectiveStrategy = strategy || this.config.defaultStrategy;
    const [fusedMass, totalConflict] = this.fuseWithStrategy(evidenceList, effectiveStrategy);

    // 确保 theta 存在
    if (!('theta' in fusedMass)) {
      fusedMass.theta = 0;
    }

    return { beliefMass: fusedMass, conflict: totalConflict };
  }

  /**
   * 增强版多证据源融合 — 支持证据源可靠性加权、自适应策略、完整日志
   */
  fuseWithReliability(inputs: DSEvidenceInput[]): DSFusionOutput {
    if (inputs.length === 0) {
      return this.createEmptyOutput();
    }

    // Step 1: 按证据源可靠性加权调整信念质量
    const adjustedEvidence: Array<Record<string, number>> = [];
    const sourceContributions: Record<string, number> = {};
    const fusionLog: DSFusionLogEntry[] = [];

    for (const input of inputs) {
      const sourceConfig = this.sourceMap.get(input.sourceId);
      const reliability = sourceConfig?.currentReliability ?? 1.0;

      // 可靠性加权：将 (1 - reliability) 的质量转移到 theta
      const adjusted = this.applyReliabilityDiscount(input.beliefMass, reliability);
      adjustedEvidence.push(adjusted);
      sourceContributions[input.sourceId] = reliability;
    }

    // Step 2: 确定融合策略
    let strategy = this.config.defaultStrategy;

    // Step 3: 逐步融合并记录日志
    let result = { ...adjustedEvidence[0] };
    let cumulativeConflict = 0;

    fusionLog.push({
      step: 0,
      sourceId: inputs[0].sourceId,
      inputMass: { ...adjustedEvidence[0] },
      outputMass: { ...result },
      stepConflict: 0,
      cumulativeConflict: 0,
      strategyUsed: strategy,
    });

    for (let i = 1; i < adjustedEvidence.length; i++) {
      // 自适应策略切换
      if (cumulativeConflict > this.config.highConflictThreshold && strategy === 'dempster') {
        strategy = 'murphy';
        log.info({
          step: i,
          conflict: cumulativeConflict,
          threshold: this.config.highConflictThreshold,
        }, 'Auto-switching to Murphy strategy due to high conflict');
      }

      if (cumulativeConflict > this.config.extremeConflictThreshold) {
        strategy = 'yager';
        log.warn({
          step: i,
          conflict: cumulativeConflict,
          threshold: this.config.extremeConflictThreshold,
        }, 'Auto-switching to Yager strategy due to extreme conflict');
      }

      const [fused, stepConflict] = this.combineTwoByStrategy(result, adjustedEvidence[i], strategy);
      result = fused;
      cumulativeConflict = 1 - (1 - cumulativeConflict) * (1 - stepConflict);

      fusionLog.push({
        step: i,
        sourceId: inputs[i].sourceId,
        inputMass: { ...adjustedEvidence[i] },
        outputMass: { ...result },
        stepConflict,
        cumulativeConflict,
        strategyUsed: strategy,
      });
    }

    // 确保 theta 存在
    if (!('theta' in result)) {
      result.theta = 0;
    }

    // Step 4: 决策
    const decision = this.getDecision(result);
    let confidence = result[decision] || 0;

    // 冲突惩罚
    if (cumulativeConflict > 0) {
      const penalty = cumulativeConflict * this.config.conflictPenaltyFactor;
      confidence *= (1 - penalty);
    }
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      fusedMass: result,
      totalConflict: cumulativeConflict,
      strategyUsed: strategy,
      decision,
      confidence,
      sourceContributions,
      fusionLog,
    };
  }

  /**
   * 从融合结果中选择最高信念的故障类型
   * 与原 DSEvidence.getDecision() 完全一致
   */
  getDecision(fusedMass: Record<string, number>): string {
    const candidates = Object.entries(fusedMass).filter(([k]) => k !== 'theta');
    if (candidates.length === 0) return 'unknown';
    candidates.sort((a, b) => b[1] - a[1]);
    return candidates[0][0];
  }

  // ==========================================================================
  // 证据源可靠性管理
  // ==========================================================================

  /** 注册证据源 */
  registerSource(config: DSEvidenceSourceConfig): void {
    this.sourceMap.set(config.id, { ...config });
    this.config.sources = Array.from(this.sourceMap.values());
    log.info({ sourceId: config.id, reliability: config.currentReliability }, 'Evidence source registered');
  }

  /** 注销证据源 */
  unregisterSource(sourceId: string): boolean {
    const removed = this.sourceMap.delete(sourceId);
    if (removed) {
      this.config.sources = Array.from(this.sourceMap.values());
      log.info({ sourceId }, 'Evidence source unregistered');
    }
    return removed;
  }

  /** 获取证据源配置 */
  getSource(sourceId: string): DSEvidenceSourceConfig | undefined {
    const source = this.sourceMap.get(sourceId);
    return source ? { ...source } : undefined;
  }

  /** 获取所有证据源 */
  getAllSources(): DSEvidenceSourceConfig[] {
    return Array.from(this.sourceMap.values()).map(s => ({ ...s }));
  }

  /**
   * 更新证据源可靠性 — 基于预测结果反馈
   *
   * @param sourceId 证据源 ID
   * @param correct 本次预测是否正确
   */
  updateSourceReliability(sourceId: string, correct: boolean): void {
    const source = this.sourceMap.get(sourceId);
    if (!source) {
      log.warn({ sourceId }, 'Cannot update reliability: source not found');
      return;
    }

    if (correct) {
      source.correctCount += 1;
      // 正确预测：向初始可靠性恢复
      source.currentReliability = source.currentReliability +
        (source.initialReliability - source.currentReliability) * source.recoveryFactor;
    } else {
      source.errorCount += 1;
      // 错误预测：乘以衰减因子
      source.currentReliability *= source.decayFactor;
    }

    // 确保在 [minReliability, 1.0] 范围内
    source.currentReliability = Math.max(
      source.minReliability,
      Math.min(1.0, source.currentReliability),
    );

    // 低于最小阈值自动禁用
    if (source.currentReliability <= source.minReliability) {
      source.enabled = false;
      log.warn({
        sourceId,
        reliability: source.currentReliability,
        minReliability: source.minReliability,
      }, 'Evidence source auto-disabled due to low reliability');
    }

    source.lastUpdatedAt = new Date();
    log.debug({
      sourceId,
      correct,
      reliability: source.currentReliability,
      correctCount: source.correctCount,
      errorCount: source.errorCount,
    }, 'Source reliability updated');
  }

  /** 重置证据源可靠性到初始值 */
  resetSourceReliability(sourceId: string): void {
    const source = this.sourceMap.get(sourceId);
    if (!source) return;

    source.currentReliability = source.initialReliability;
    source.correctCount = 0;
    source.errorCount = 0;
    source.enabled = true;
    source.lastUpdatedAt = new Date();
    log.info({ sourceId, reliability: source.initialReliability }, 'Source reliability reset');
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /** 获取当前配置（只读副本） */
  getConfig(): Readonly<DSFusionEngineConfig> {
    return { ...this.config, sources: this.getAllSources() };
  }

  /** 获取辨识框架 */
  getFrameOfDiscernment(): readonly string[] {
    return this.config.frameOfDiscernment;
  }

  /** 更新冲突惩罚因子 */
  setConflictPenaltyFactor(factor: number): void {
    this.config.conflictPenaltyFactor = Math.max(0, Math.min(1, factor));
  }

  /** 更新冲突阈值 */
  setConflictThresholds(high: number, extreme: number): void {
    this.config.highConflictThreshold = Math.max(0, Math.min(1, high));
    this.config.extremeConflictThreshold = Math.max(
      this.config.highConflictThreshold,
      Math.min(1, extreme),
    );
  }

  /** 更新默认策略 */
  setDefaultStrategy(strategy: DSConflictStrategy): void {
    this.config.defaultStrategy = strategy;
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  /**
   * 计算两个焦元的交集
   * theta 表示全集，与任何集合的交集为该集合本身
   */
  private computeIntersection(a1: string, a2: string): string | null {
    if (a1 === 'theta') return a2;
    if (a2 === 'theta') return a1;
    if (a1 === a2) return a1;
    return null; // 空交集
  }

  /**
   * 按策略融合两个证据
   */
  private combineTwoByStrategy(
    m1: Record<string, number>,
    m2: Record<string, number>,
    strategy: DSConflictStrategy,
  ): [Record<string, number>, number] {
    switch (strategy) {
      case 'dempster':
        return this.dempsterCombination(m1, m2);
      case 'yager':
        return this.yagerCombination(m1, m2);
      case 'murphy':
        // Murphy 是多证据方法，两两融合时退化为 Dempster
        return this.dempsterCombination(m1, m2);
      default: {
        log.warn({ strategy }, 'Unknown strategy, falling back to dempster');
        return this.dempsterCombination(m1, m2);
      }
    }
  }

  /**
   * 按策略融合多个证据
   */
  private fuseWithStrategy(
    evidenceList: Array<Record<string, number>>,
    strategy: DSConflictStrategy,
  ): [Record<string, number>, number] {
    if (strategy === 'murphy') {
      return this.murphyCombination(evidenceList);
    }

    // Dempster 和 Yager 都是逐步融合
    let result = { ...evidenceList[0] };
    let totalConflict = 0;

    for (let i = 1; i < evidenceList.length; i++) {
      const [fused, conflict] = this.combineTwoByStrategy(result, evidenceList[i], strategy);
      result = fused;
      totalConflict = 1 - (1 - totalConflict) * (1 - conflict);
    }

    return [result, totalConflict];
  }

  /**
   * 可靠性折扣 — 将 (1 - reliability) 的质量转移到 theta
   *
   * 原理：如果证据源可靠性为 r，则：
   *   m'(A) = r * m(A)          对于 A ≠ theta
   *   m'(theta) = 1 - r * (1 - m(theta))
   */
  private applyReliabilityDiscount(
    mass: Record<string, number>,
    reliability: number,
  ): Record<string, number> {
    if (reliability >= 1.0) return { ...mass };

    const discounted: Record<string, number> = {};
    let thetaTransfer = 0;

    for (const [key, value] of Object.entries(mass)) {
      if (key === 'theta') {
        discounted[key] = value; // theta 暂不处理
      } else {
        const discountedValue = value * reliability;
        discounted[key] = discountedValue;
        thetaTransfer += value - discountedValue;
      }
    }

    discounted.theta = (discounted.theta || 0) + thetaTransfer;
    return discounted;
  }

  /** 创建空输出 */
  private createEmptyOutput(): DSFusionOutput {
    return {
      fusedMass: { theta: 1.0 },
      totalConflict: 0,
      strategyUsed: this.config.defaultStrategy,
      decision: 'unknown',
      confidence: 0,
      sourceContributions: {},
      fusionLog: [],
    };
  }
}

// ============================================================================
// Legacy 适配器 — 确保与原 DSEvidence 接口完全兼容
// ============================================================================

/**
 * DSEvidenceLegacyAdapter
 *
 * 包装 DSFusionEngine，提供与原 fusionDiagnosis.service.ts 中
 * DSEvidence 类完全一致的接口，确保零回归。
 *
 * 用法：
 *   // 原代码
 *   const ds = new DSEvidence(faultTypes);
 *   // 替换为
 *   const ds = new DSEvidenceLegacyAdapter(faultTypes);
 *   // 所有方法签名和返回值完全一致
 */
export class DSEvidenceLegacyAdapter {
  private readonly engine: DSFusionEngine;

  constructor(frameOfDiscernment: string[]) {
    this.engine = new DSFusionEngine({ frameOfDiscernment });
  }

  /** 与原 DSEvidence.dempsterCombination() 完全一致 */
  dempsterCombination(
    m1: Record<string, number>,
    m2: Record<string, number>,
  ): [Record<string, number>, number] {
    return this.engine.dempsterCombination(m1, m2);
  }

  /** 与原 DSEvidence.fuseMultiple() 完全一致 */
  fuseMultiple(
    evidenceList: Array<Record<string, number>>,
  ): { beliefMass: Record<string, number>; conflict: number } {
    return this.engine.fuseMultiple(evidenceList);
  }

  /** 与原 DSEvidence.getDecision() 完全一致 */
  getDecision(fusedMass: Record<string, number>): string {
    return this.engine.getDecision(fusedMass);
  }

  /** 获取底层引擎（用于需要增强功能的场景） */
  getEngine(): DSFusionEngine {
    return this.engine;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建默认配置的 DS 融合引擎 */
export function createDSFusionEngine(config?: Partial<DSFusionEngineConfig>): DSFusionEngine {
  return new DSFusionEngine(config);
}

/** 创建兼容旧版的 DS 融合适配器 */
export function createLegacyDSEvidence(faultTypes: string[]): DSEvidenceLegacyAdapter {
  return new DSEvidenceLegacyAdapter(faultTypes);
}
