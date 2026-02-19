/**
 * ============================================================================
 * 知识结晶器 — KnowledgeCrystallizer
 * ============================================================================
 *
 * 将每次认知活动的结果自动沉淀为结构化知识，存入 KG。
 *
 * 结晶类型：
 *   - anomaly_pattern     异常模式（从感知维提取）
 *   - causal_relation     因果关系（从推演维提取）
 *   - hypothesis_result   假设验证结果（从融合维提取）
 *   - source_reliability  证据源可靠性（从融合维提取）
 *   - oc_transition_rule  工况切换规则（从决策维提取）
 *
 * 设计原则：
 *   - 自动提取，无需人工干预
 *   - 幂等性：相同认知结果多次结晶不产生重复知识
 *   - 与平台 KG Orchestrator 集成
 */

import { createModuleLogger } from '../../../core/logger';
import { getCognitionEventEmitter } from '../events/emitter';
import type {
  CognitionResult,
  KnowledgeCrystal,
  KnowledgeCrystalType,
  PerceptionOutput,
  ReasoningOutput,
  FusionOutput,
  DecisionOutput,
} from '../types';

const log = createModuleLogger('knowledgeCrystallizer');

// ============================================================================
// 知识存储接口（与 KG Orchestrator 对接）
// ============================================================================

/**
 * 知识存储接口 — 抽象 KG 操作
 *
 * 实现此接口以对接平台 KG Orchestrator 或其他知识存储后端。
 */
export interface KnowledgeStore {
  /** 保存知识结晶 */
  save(crystal: KnowledgeCrystal): Promise<void>;
  /** 查找已有的相似知识（用于去重和增强） */
  findSimilar(type: KnowledgeCrystalType, content: Record<string, unknown>): Promise<KnowledgeCrystal | null>;
  /** 更新已有知识的验证次数 */
  incrementVerification(crystalId: string): Promise<void>;
}

// ============================================================================
// 结晶规则
// ============================================================================

interface CrystallizationRule {
  type: KnowledgeCrystalType;
  /** 最低置信度阈值 — 低于此值不结晶 */
  minConfidence: number;
  /** 提取函数 */
  extract: (result: CognitionResult) => Array<Omit<KnowledgeCrystal, 'id' | 'createdAt' | 'lastVerifiedAt' | 'verificationCount'>>;
}

// ============================================================================
// 知识结晶器实现
// ============================================================================

export class KnowledgeCrystallizer {
  private readonly store: KnowledgeStore;
  private readonly emitter = getCognitionEventEmitter();
  private readonly rules: CrystallizationRule[];
  private crystalCounter = 0;

  constructor(store: KnowledgeStore) {
    this.store = store;
    this.rules = this.buildDefaultRules();
  }

  /**
   * 从认知结果中提取并保存知识结晶
   */
  async crystallize(result: CognitionResult): Promise<KnowledgeCrystal[]> {
    if (result.state !== 'completed') {
      log.debug({ resultId: result.id, state: result.state }, 'Skipping crystallization for non-completed result');
      return [];
    }

    const crystals: KnowledgeCrystal[] = [];

    for (const rule of this.rules) {
      try {
        const candidates = rule.extract(result);

        for (const candidate of candidates) {
          if (candidate.confidence < rule.minConfidence) {
            continue;
          }

          // 检查是否已有相似知识
          const existing = await this.store.findSimilar(candidate.type, candidate.content);

          if (existing) {
            // 已有相似知识 → 增强（增加验证次数）
            await this.store.incrementVerification(existing.id);
            log.debug({
              existingId: existing.id,
              type: candidate.type,
              verificationCount: existing.verificationCount + 1,
            }, 'Knowledge crystal verification incremented');
          } else {
            // 新知识 → 保存
            const crystal: KnowledgeCrystal = {
              ...candidate,
              id: this.generateCrystalId(),
              verificationCount: 1,
              createdAt: new Date(),
              lastVerifiedAt: new Date(),
            };

            await this.store.save(crystal);
            crystals.push(crystal);

            this.emitter.emitKnowledgeCrystallized({
              crystal,
              crystallizedAt: new Date(),
            });

            log.info({
              crystalId: crystal.id,
              type: crystal.type,
              confidence: crystal.confidence,
              cognitionResultId: crystal.cognitionResultId,
            }, 'Knowledge crystal created');
          }
        }
      } catch (err) {
        log.error({
          ruleType: rule.type,
          resultId: result.id,
          error: err instanceof Error ? err.message : String(err),
        }, 'Crystallization rule failed');
      }
    }

    return crystals;
  }

  // ==========================================================================
  // 默认结晶规则
  // ==========================================================================

  private buildDefaultRules(): CrystallizationRule[] {
    return [
      this.anomalyPatternRule(),
      this.causalRelationRule(),
      this.hypothesisResultRule(),
      this.sourceReliabilityRule(),
      this.ocTransitionRuleRule(),
    ];
  }

  /** 异常模式提取规则 */
  private anomalyPatternRule(): CrystallizationRule {
    return {
      type: 'anomaly_pattern',
      minConfidence: 0.5,
      extract: (result) => {
        const perception = result.dimensions.perception as PerceptionOutput | undefined;
        if (!perception?.success) return [];

        return perception.data.anomalies
          .filter(a => a.severity >= 0.3)
          .map(anomaly => ({
            type: 'anomaly_pattern' as const,
            cognitionResultId: result.id,
            content: {
              anomalyType: anomaly.type,
              source: anomaly.source,
              severity: anomaly.severity,
              description: anomaly.description,
              highEntropyDimensions: perception.data.highEntropyDimensions.map(d => ({
                name: d.name,
                entropy: d.entropy,
                deviation: d.deviation,
              })),
              detectedAt: result.startedAt.toISOString(),
            },
            confidence: anomaly.severity,
          }));
      },
    };
  }

  /** 因果关系提取规则 */
  private causalRelationRule(): CrystallizationRule {
    return {
      type: 'causal_relation',
      minConfidence: 0.4,
      extract: (result) => {
        const reasoning = result.dimensions.reasoning as ReasoningOutput | undefined;
        if (!reasoning?.success) return [];

        return reasoning.data.causalPaths
          .filter(p => p.strength >= 0.3)
          .map(path => ({
            type: 'causal_relation' as const,
            cognitionResultId: result.id,
            content: {
              from: path.from,
              to: path.to,
              strength: path.strength,
              mechanism: path.mechanism,
              discoveredAt: result.startedAt.toISOString(),
            },
            confidence: path.strength,
          }));
      },
    };
  }

  /** 假设验证结果提取规则 */
  private hypothesisResultRule(): CrystallizationRule {
    return {
      type: 'hypothesis_result',
      minConfidence: 0.5,
      extract: (result) => {
        const reasoning = result.dimensions.reasoning as ReasoningOutput | undefined;
        const fusion = result.dimensions.fusion as FusionOutput | undefined;
        if (!reasoning?.success || !fusion?.success) return [];

        // 将假设与融合结果对照
        return reasoning.data.hypotheses.map(hypothesis => ({
          type: 'hypothesis_result' as const,
          cognitionResultId: result.id,
          content: {
            hypothesisId: hypothesis.id,
            description: hypothesis.description,
            priorProbability: hypothesis.priorProbability,
            fusionDecision: fusion.data.dsFusionResult.decision,
            fusionConfidence: fusion.data.dsFusionResult.confidence,
            supported: fusion.data.dsFusionResult.confidence > 0.5,
            verifiedAt: result.completedAt.toISOString(),
          },
          confidence: fusion.data.dsFusionResult.confidence,
        }));
      },
    };
  }

  /** 证据源可靠性提取规则 */
  private sourceReliabilityRule(): CrystallizationRule {
    return {
      type: 'source_reliability',
      minConfidence: 0.0, // 始终记录
      extract: (result) => {
        const fusion = result.dimensions.fusion as FusionOutput | undefined;
        if (!fusion?.success) return [];

        const { sourceContributions } = fusion.data.dsFusionResult;
        return Object.entries(sourceContributions).map(([sourceId, reliability]) => ({
          type: 'source_reliability' as const,
          cognitionResultId: result.id,
          content: {
            sourceId,
            reliability,
            fusionConflict: fusion.data.dsFusionResult.totalConflict,
            strategyUsed: fusion.data.dsFusionResult.strategyUsed,
            recordedAt: result.completedAt.toISOString(),
          },
          confidence: reliability,
        }));
      },
    };
  }

  /** 工况切换规则提取 */
  private ocTransitionRuleRule(): CrystallizationRule {
    return {
      type: 'oc_transition_rule',
      minConfidence: 0.6,
      extract: (result) => {
        const decision = result.dimensions.decision as DecisionOutput | undefined;
        if (!decision?.success) return [];

        // 从决策维中提取与工况相关的动作
        const ocActions = decision.data.recommendedActions.filter(
          a => a.type === 'recollect' || a.type === 'retrain',
        );

        if (ocActions.length === 0) return [];

        return [{
          type: 'oc_transition_rule' as const,
          cognitionResultId: result.id,
          content: {
            actions: ocActions.map(a => ({
              type: a.type,
              description: a.description,
              priority: a.priority,
            })),
            convergence: result.convergence,
            degradationMode: result.degradationMode,
            recordedAt: result.completedAt.toISOString(),
          },
          confidence: result.convergence.overallConfidence,
        }];
      },
    };
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  private generateCrystalId(): string {
    this.crystalCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.crystalCounter.toString(36).padStart(4, '0');
    return `kc_${timestamp}_${counter}`;
  }
}

// ============================================================================
// 内存知识存储（开发/测试用）
// ============================================================================

/**
 * InMemoryKnowledgeStore — 内存实现
 *
 * 用于开发和测试阶段。生产环境应替换为 KG Orchestrator 适配器。
 */
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly crystals: Map<string, KnowledgeCrystal> = new Map();

  async save(crystal: KnowledgeCrystal): Promise<void> {
    this.crystals.set(crystal.id, { ...crystal });
  }

  async findSimilar(
    type: KnowledgeCrystalType,
    content: Record<string, unknown>,
  ): Promise<KnowledgeCrystal | null> {
    // 简单的相似性匹配：类型相同且关键字段匹配
    for (const crystal of this.crystals.values()) {
      if (crystal.type !== type) continue;

      switch (type) {
        case 'anomaly_pattern': {
          if (
            crystal.content.anomalyType === content.anomalyType &&
            crystal.content.source === content.source
          ) {
            return { ...crystal };
          }
          break;
        }
        case 'causal_relation': {
          if (
            crystal.content.from === content.from &&
            crystal.content.to === content.to
          ) {
            return { ...crystal };
          }
          break;
        }
        case 'source_reliability': {
          if (crystal.content.sourceId === content.sourceId) {
            return { ...crystal };
          }
          break;
        }
        default:
          break;
      }
    }
    return null;
  }

  async incrementVerification(crystalId: string): Promise<void> {
    const crystal = this.crystals.get(crystalId);
    if (crystal) {
      crystal.verificationCount++;
      crystal.lastVerifiedAt = new Date();
    }
  }

  /** 获取所有结晶（测试用） */
  getAll(): KnowledgeCrystal[] {
    return Array.from(this.crystals.values());
  }

  /** 按类型查询（测试用） */
  getByType(type: KnowledgeCrystalType): KnowledgeCrystal[] {
    return Array.from(this.crystals.values()).filter(c => c.type === type);
  }

  /** 清空（测试用） */
  clear(): void {
    this.crystals.clear();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建知识结晶器 */
export function createKnowledgeCrystallizer(store: KnowledgeStore): KnowledgeCrystallizer {
  return new KnowledgeCrystallizer(store);
}

/** 创建内存知识存储（开发/测试用） */
export function createInMemoryKnowledgeStore(): InMemoryKnowledgeStore {
  return new InMemoryKnowledgeStore();
}
