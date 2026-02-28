/**
 * ============================================================================
 * HDE 统一知识结晶器 — UnifiedKnowledgeCrystallizer
 * ============================================================================
 *
 * Phase 0a 合并设计：
 *   - 策略模式支持两种输入源：
 *     · DiagnosisHistorySource: 从诊断历史挖掘模式（evolution层原实现）
 *     · CognitionResultSource: 从认知结果提取结构化知识（cognition层原实现）
 *   - 统一输出格式：UnifiedKnowledgeCrystal
 *   - 支持知识存储后端切换（内存/KG Orchestrator）
 *
 * 设计原则：
 *   - 物理约束优先：所有结晶知识必须包含物理解释
 *   - 验证闭环：结晶知识必须有验证机制
 *   - 复用现有模块：内部委托给原有的两个结晶器
 */

import { createModuleLogger } from '../../../core/logger';
import {
  KnowledgeCrystallizer as EvolutionCrystallizer,
  type DiagnosisHistoryEntry,
  type DiscoveredPattern,
  type CrystallizedKnowledge as EvolutionCrystal,
} from '../../evolution/crystallization/knowledge-crystallizer';
import {
  KnowledgeCrystallizer as CognitionCrystallizer,
  type KnowledgeStore,
  InMemoryKnowledgeStore,
} from '../../cognition/knowledge/knowledge-crystallizer';
import type { CognitionResult, KnowledgeCrystal as CognitionCrystal } from '../../cognition/types';

const log = createModuleLogger('hde-unified-crystallizer');

// ============================================================================
// 统一知识结晶类型
// ============================================================================

/**
 * 统一知识结晶 — 合并两种来源的输出格式
 */
export interface UnifiedKnowledgeCrystal {
  /** 唯一标识 */
  id: string;
  /** 结晶来源 */
  source: 'diagnosis_history' | 'cognition_result';
  /** 知识类型 */
  type: UnifiedCrystalType;
  /** 知识内容 */
  content: Record<string, unknown>;
  /** 置信度 (0-1) */
  confidence: number;
  /** 支持度（来源数据占比） */
  support?: number;
  /** 物理解释（必须） */
  physicalExplanation: string;
  /** 适用场景 */
  applicableScenarios: string[];
  /** 验证状态 */
  verificationStatus: 'pending' | 'validated' | 'approved' | 'rejected';
  /** 验证次数 */
  verificationCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后验证时间 */
  lastVerifiedAt?: Date;
  /** 原始结晶数据 */
  rawCrystal: EvolutionCrystal | CognitionCrystal;
}

export type UnifiedCrystalType =
  // Evolution 来源
  | 'guardrail_rule'
  | 'kg_triple'
  | 'feature_weight'
  | 'threshold_update'
  | 'migration_suggestion'
  // Cognition 来源
  | 'anomaly_pattern'
  | 'causal_relation'
  | 'hypothesis_result'
  | 'source_reliability'
  | 'oc_transition_rule';

// ============================================================================
// 结晶策略接口
// ============================================================================

/**
 * 结晶策略接口 — 策略模式核心
 */
export interface CrystallizationStrategy<TInput> {
  /** 策略名称 */
  readonly name: string;
  /** 策略来源类型 */
  readonly sourceType: 'diagnosis_history' | 'cognition_result';
  /** 执行结晶 */
  crystallize(input: TInput): Promise<UnifiedKnowledgeCrystal[]>;
  /** 验证结晶 */
  validate?(crystal: UnifiedKnowledgeCrystal): Promise<boolean>;
}

// ============================================================================
// 诊断历史结晶策略（委托给 Evolution 层）
// ============================================================================

export class DiagnosisHistoryStrategy implements CrystallizationStrategy<DiagnosisHistoryEntry[]> {
  readonly name = 'diagnosis_history';
  readonly sourceType = 'diagnosis_history' as const;
  private readonly delegate: EvolutionCrystallizer;
  private crystalCounter = 0;

  constructor() {
    this.delegate = new EvolutionCrystallizer();
  }

  async crystallize(history: DiagnosisHistoryEntry[]): Promise<UnifiedKnowledgeCrystal[]> {
    const unified: UnifiedKnowledgeCrystal[] = [];

    // Step 1: 发现模式
    const patterns = this.delegate.discoverPatterns(history);
    log.info({ patternCount: patterns.length }, 'Patterns discovered from diagnosis history');

    // Step 2: 将每个模式结晶为各种知识类型
    for (const pattern of patterns) {
      if (pattern.confidence < 0.5) continue;

      // 结晶为护栏规则
      const guardrailCrystal = this.delegate.crystallize(pattern.patternId, 'guardrail_rule');
      if (guardrailCrystal) {
        unified.push(this.toUnified(guardrailCrystal, pattern, 'guardrail_rule'));
      }

      // 结晶为 KG 三元组
      const kgCrystal = this.delegate.crystallize(pattern.patternId, 'kg_triple');
      if (kgCrystal) {
        unified.push(this.toUnified(kgCrystal, pattern, 'kg_triple'));
      }
    }

    return unified;
  }

  private toUnified(
    crystal: EvolutionCrystal,
    pattern: DiscoveredPattern,
    type: UnifiedCrystalType,
  ): UnifiedKnowledgeCrystal {
    this.crystalCounter++;
    return {
      id: `hde_dh_${Date.now()}_${this.crystalCounter}`,
      source: 'diagnosis_history',
      type,
      content: crystal.content,
      confidence: pattern.confidence,
      support: pattern.support,
      physicalExplanation: pattern.consequences[0]?.physicalExplanation || '待补充物理解释',
      applicableScenarios: crystal.applicableScenarios,
      verificationStatus: pattern.status === 'approved' ? 'approved' : 'pending',
      verificationCount: 1,
      createdAt: new Date(),
      rawCrystal: crystal,
    };
  }

  /** 获取底层结晶器（用于高级操作） */
  getDelegate(): EvolutionCrystallizer {
    return this.delegate;
  }
}

// ============================================================================
// 认知结果结晶策略（委托给 Cognition 层）
// ============================================================================

export class CognitionResultStrategy implements CrystallizationStrategy<CognitionResult> {
  readonly name = 'cognition_result';
  readonly sourceType = 'cognition_result' as const;
  private readonly delegate: CognitionCrystallizer;
  private readonly store: KnowledgeStore;

  constructor(store?: KnowledgeStore) {
    this.store = store || new InMemoryKnowledgeStore();
    this.delegate = new CognitionCrystallizer(this.store);
  }

  async crystallize(result: CognitionResult): Promise<UnifiedKnowledgeCrystal[]> {
    const crystals = await this.delegate.crystallize(result);
    log.info({ crystalCount: crystals.length, resultId: result.id }, 'Knowledge crystallized from cognition result');

    return crystals.map(c => this.toUnified(c));
  }

  private toUnified(crystal: CognitionCrystal): UnifiedKnowledgeCrystal {
    return {
      id: crystal.id,
      source: 'cognition_result',
      type: crystal.type as UnifiedCrystalType,
      content: crystal.content,
      confidence: crystal.confidence,
      physicalExplanation: this.extractPhysicalExplanation(crystal),
      applicableScenarios: ['port_crane'], // 默认场景，可从 cognitionResult 提取
      verificationStatus: 'validated',
      verificationCount: crystal.verificationCount,
      createdAt: crystal.createdAt,
      lastVerifiedAt: crystal.lastVerifiedAt,
      rawCrystal: crystal,
    };
  }

  private extractPhysicalExplanation(crystal: CognitionCrystal): string {
    // 从内容中提取物理解释，或生成默认说明
    if (crystal.content.mechanism) {
      return String(crystal.content.mechanism);
    }
    if (crystal.content.description) {
      return String(crystal.content.description);
    }
    switch (crystal.type) {
      case 'anomaly_pattern':
        return `异常模式 ${crystal.content.anomalyType} 来自 ${crystal.content.source}`;
      case 'causal_relation':
        return `因果关系 ${crystal.content.from} → ${crystal.content.to}`;
      case 'source_reliability':
        return `证据源 ${crystal.content.sourceId} 可靠性 ${crystal.content.reliability}`;
      default:
        return '待补充物理解释';
    }
  }

  /** 获取底层存储（用于测试和调试） */
  getStore(): KnowledgeStore {
    return this.store;
  }
}

// ============================================================================
// 统一知识结晶器
// ============================================================================

/**
 * HDE 统一知识结晶器
 *
 * 使用策略模式支持多种输入源，统一输出格式。
 *
 * @example
 * ```ts
 * const crystallizer = new UnifiedKnowledgeCrystallizer();
 *
 * // 从诊断历史结晶
 * const fromHistory = await crystallizer.crystallizeFromHistory(diagnosisHistory);
 *
 * // 从认知结果结晶
 * const fromCognition = await crystallizer.crystallizeFromCognition(cognitionResult);
 *
 * // 获取所有结晶
 * const all = crystallizer.getAllCrystals();
 * ```
 */
export class UnifiedKnowledgeCrystallizer {
  private readonly historyStrategy: DiagnosisHistoryStrategy;
  private readonly cognitionStrategy: CognitionResultStrategy;
  private readonly crystals: Map<string, UnifiedKnowledgeCrystal> = new Map();

  constructor(store?: KnowledgeStore) {
    this.historyStrategy = new DiagnosisHistoryStrategy();
    this.cognitionStrategy = new CognitionResultStrategy(store);
    log.info('UnifiedKnowledgeCrystallizer initialized');
  }

  /**
   * 从诊断历史结晶
   */
  async crystallizeFromHistory(history: DiagnosisHistoryEntry[]): Promise<UnifiedKnowledgeCrystal[]> {
    const crystals = await this.historyStrategy.crystallize(history);
    for (const c of crystals) {
      this.crystals.set(c.id, c);
    }
    return crystals;
  }

  /**
   * 从认知结果结晶
   */
  async crystallizeFromCognition(result: CognitionResult): Promise<UnifiedKnowledgeCrystal[]> {
    const crystals = await this.cognitionStrategy.crystallize(result);
    for (const c of crystals) {
      this.crystals.set(c.id, c);
    }
    return crystals;
  }

  /**
   * 获取所有结晶
   */
  getAllCrystals(): UnifiedKnowledgeCrystal[] {
    return Array.from(this.crystals.values());
  }

  /**
   * 按类型获取结晶
   */
  getCrystalsByType(type: UnifiedCrystalType): UnifiedKnowledgeCrystal[] {
    return this.getAllCrystals().filter(c => c.type === type);
  }

  /**
   * 按来源获取结晶
   */
  getCrystalsBySource(source: 'diagnosis_history' | 'cognition_result'): UnifiedKnowledgeCrystal[] {
    return this.getAllCrystals().filter(c => c.source === source);
  }

  /**
   * 审批结晶
   */
  approveCrystal(id: string): void {
    const crystal = this.crystals.get(id);
    if (crystal) {
      crystal.verificationStatus = 'approved';
      crystal.verificationCount++;
      crystal.lastVerifiedAt = new Date();
      log.info({ crystalId: id }, 'Crystal approved');
    }
  }

  /**
   * 拒绝结晶
   */
  rejectCrystal(id: string, reason?: string): void {
    const crystal = this.crystals.get(id);
    if (crystal) {
      crystal.verificationStatus = 'rejected';
      if (reason) {
        crystal.content.rejectionReason = reason;
      }
      log.info({ crystalId: id, reason }, 'Crystal rejected');
    }
  }

  /**
   * 获取待审批结晶
   */
  getPendingCrystals(): UnifiedKnowledgeCrystal[] {
    return this.getAllCrystals().filter(c => c.verificationStatus === 'pending');
  }

  /**
   * 导出结晶为护栏规则
   */
  exportAsGuardrailRules(): Array<{ ruleId: string; conditions: unknown[]; actions: unknown[] }> {
    return this.getCrystalsByType('guardrail_rule')
      .filter(c => c.verificationStatus === 'approved')
      .map(c => ({
        ruleId: String(c.content.ruleId || c.id),
        conditions: c.content.conditions as unknown[] || [],
        actions: c.content.actions as unknown[] || [],
      }));
  }

  /**
   * 导出结晶为 KG 三元组
   */
  exportAsKGTriples(): Array<{ subject: string; predicate: string; object: string; confidence: number }> {
    const triples: Array<{ subject: string; predicate: string; object: string; confidence: number }> = [];
    for (const crystal of this.getCrystalsByType('kg_triple')) {
      if (crystal.verificationStatus !== 'approved') continue;
      const content = crystal.content.triples as Array<{
        subject: string;
        predicate: string;
        object: string;
      }> || [];
      for (const t of content) {
        triples.push({ ...t, confidence: crystal.confidence });
      }
    }
    return triples;
  }

  /**
   * 获取诊断历史策略委托（用于高级模式操作）
   */
  getHistoryDelegate(): EvolutionCrystallizer {
    return this.historyStrategy.getDelegate();
  }

  /**
   * 清空所有结晶（测试用）
   */
  clear(): void {
    this.crystals.clear();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建统一知识结晶器 */
export function createUnifiedCrystallizer(store?: KnowledgeStore): UnifiedKnowledgeCrystallizer {
  return new UnifiedKnowledgeCrystallizer(store);
}

/** 创建诊断历史结晶策略 */
export function createDiagnosisHistoryStrategy(): DiagnosisHistoryStrategy {
  return new DiagnosisHistoryStrategy();
}

/** 创建认知结果结晶策略 */
export function createCognitionResultStrategy(store?: KnowledgeStore): CognitionResultStrategy {
  return new CognitionResultStrategy(store);
}

// Re-export 原有类型（向后兼容）
export type {
  DiagnosisHistoryEntry,
  DiscoveredPattern,
  CrystallizedKnowledge as EvolutionCrystal,
} from '../../evolution/crystallization/knowledge-crystallizer';
