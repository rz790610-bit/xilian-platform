/**
 * ============================================================================
 * Auto-Labeling Pipeline (E27) — v3.1 多维特征规则矩阵
 * ============================================================================
 *
 * v3.1 整改：
 *   - 规则标注从 4 行 if-else 升级为多维特征规则矩阵（6 维度 × 4 严重级别）
 *   - 新增不确定性标记（uncertainty flag）当多维度评分冲突时
 *   - 置信度衰减：规则标注基础置信度 0.6，随特征维度一致性提升
 *   - 标注结果附带特征向量，便于后续分析
 *   - Grok 集成保持 try-catch 降级，但明确标注来源
 *
 * 架构：
 *   LabelingProvider (Grok/WorldModel) → 集成投票 → 规则矩阵降级 → 持久化
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import { evolutionInterventions, edgeCases } from '../../../../drizzle/evolution-schema';
import { eq, desc } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('auto-labeling-pipeline');

// ============================================================================
// 类型定义
// ============================================================================

export interface LabelResult {
  interventionId: number;
  sessionId: string;
  autoLabel: AutoLabel;
  confidence: number;
  labelSource: 'grok_agent' | 'world_model' | 'rule_based' | 'ensemble';
  needsHumanReview: boolean;
  /** 不确定性标记：当多维度评分冲突时为 true */
  isUncertain: boolean;
  /** 特征向量（用于后续分析） */
  featureVector: FeatureVector;
  labeledAt: number;
}

export interface AutoLabel {
  interventionReason: string;
  rootCause: string;
  suggestedFix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impactScope: string[];
  relatedKGNodes: string[];
}

/** 6 维特征向量 */
export interface FeatureVector {
  /** 决策差异分数 (0-1) */
  divergenceScore: number;
  /** 决策类型差异（不同类型=1，相同=0） */
  decisionTypeMismatch: number;
  /** 置信度差距（生产模型与影子模型的置信度差） */
  confidenceGap: number;
  /** 请求复杂度（基于输入特征数量归一化） */
  requestComplexity: number;
  /** 时间衰减因子（越新的干预权重越高） */
  recencyFactor: number;
  /** 历史重复率（相似干预在历史中出现的频率） */
  historicalRepeatRate: number;
}

export interface LabelingConfig {
  confidenceThreshold: number;
  batchSize: number;
  enableEnsemble: boolean;
  timeoutMs: number;
  /** 特征维度一致性阈值（低于此值标记为 uncertain） */
  dimensionConsistencyThreshold: number;
  /** 时间衰减半衰期（毫秒） */
  recencyHalfLifeMs: number;
}

export interface LabelingReport {
  totalProcessed: number;
  autoLabeled: number;
  needsReview: number;
  uncertain: number;
  avgConfidence: number;
  labelDistribution: Record<string, number>;
  severityDistribution: Record<string, number>;
  durationMs: number;
}

export interface LabelingProvider {
  labelIntervention(trajectory: Record<string, unknown>): Promise<{
    label: AutoLabel;
    confidence: number;
  }>;
}

// ============================================================================
// 规则矩阵定义（6 维度 × 4 严重级别）
// ============================================================================

interface RuleMatrixEntry {
  severity: AutoLabel['severity'];
  reason: string;
  rootCause: string;
  suggestedFix: string;
  /** 各维度的权重阈值（满足多少维度才触发此规则） */
  minDimensionsMatched: number;
  /** 各维度的条件 */
  conditions: {
    divergenceScore?: { min?: number; max?: number };
    decisionTypeMismatch?: { equals: number };
    confidenceGap?: { min?: number; max?: number };
    requestComplexity?: { min?: number; max?: number };
    recencyFactor?: { min?: number; max?: number };
    historicalRepeatRate?: { min?: number; max?: number };
  };
}

/**
 * 规则矩阵：按严重程度降序排列，优先匹配高严重级别
 * 每条规则需要至少 minDimensionsMatched 个维度条件满足才触发
 */
const RULE_MATRIX: RuleMatrixEntry[] = [
  // === CRITICAL ===
  {
    severity: 'critical',
    reason: 'critical_type_mismatch_high_divergence',
    rootCause: '影子模型决策类型与生产模型完全不同，且差异分数极高，模型可能存在根本性缺陷',
    suggestedFix: '立即暂停影子模型评估，审查训练数据分布和特征工程，检查是否存在数据泄漏或标签错误',
    minDimensionsMatched: 3,
    conditions: {
      divergenceScore: { min: 0.7 },
      decisionTypeMismatch: { equals: 1 },
      confidenceGap: { min: 0.3 },
    },
  },
  {
    severity: 'critical',
    reason: 'critical_repeated_high_divergence',
    rootCause: '高差异干预反复出现，表明影子模型在特定模式下存在系统性偏差',
    suggestedFix: '提取重复干预的共同特征，构建针对性训练集，考虑模型架构调整',
    minDimensionsMatched: 2,
    conditions: {
      divergenceScore: { min: 0.6 },
      historicalRepeatRate: { min: 0.5 },
    },
  },
  // === HIGH ===
  {
    severity: 'high',
    reason: 'high_divergence_complex_request',
    rootCause: '影子模型在复杂请求场景下表现不稳定，可能缺少复杂场景的训练覆盖',
    suggestedFix: '增加复杂场景的训练样本，考虑引入注意力机制或增加模型容量',
    minDimensionsMatched: 2,
    conditions: {
      divergenceScore: { min: 0.4 },
      requestComplexity: { min: 0.7 },
    },
  },
  {
    severity: 'high',
    reason: 'high_confidence_gap',
    rootCause: '影子模型对自身决策的置信度远低于生产模型，表明模型不确定性过高',
    suggestedFix: '检查模型校准（calibration），增加训练数据多样性，考虑温度缩放',
    minDimensionsMatched: 2,
    conditions: {
      confidenceGap: { min: 0.4 },
      divergenceScore: { min: 0.3 },
    },
  },
  {
    severity: 'high',
    reason: 'high_divergence_recent',
    rootCause: '近期出现的高差异干预，可能与最近的模型更新或数据分布漂移有关',
    suggestedFix: '对比最近模型版本的变更日志，检查输入数据分布是否发生漂移',
    minDimensionsMatched: 2,
    conditions: {
      divergenceScore: { min: 0.5 },
      recencyFactor: { min: 0.8 },
    },
  },
  // === MEDIUM ===
  {
    severity: 'medium',
    reason: 'moderate_divergence_type_mismatch',
    rootCause: '影子模型决策类型不同但差异分数中等，可能是决策边界附近的不稳定',
    suggestedFix: '增加决策边界附近的训练样本，考虑使用软标签或标签平滑',
    minDimensionsMatched: 2,
    conditions: {
      divergenceScore: { min: 0.2, max: 0.5 },
      decisionTypeMismatch: { equals: 1 },
    },
  },
  {
    severity: 'medium',
    reason: 'moderate_divergence_repeated',
    rootCause: '中等差异的干预有一定重复率，表明存在可识别的模式',
    suggestedFix: '分析重复干预的特征模式，构建专项训练集',
    minDimensionsMatched: 2,
    conditions: {
      divergenceScore: { min: 0.2, max: 0.5 },
      historicalRepeatRate: { min: 0.3 },
    },
  },
  {
    severity: 'medium',
    reason: 'moderate_divergence_general',
    rootCause: '影子模型在边界条件下存在偏差',
    suggestedFix: '优化特征工程，增加边界条件覆盖',
    minDimensionsMatched: 1,
    conditions: {
      divergenceScore: { min: 0.2, max: 0.5 },
    },
  },
  // === LOW ===
  {
    severity: 'low',
    reason: 'minor_divergence',
    rootCause: '影子模型与生产模型存在轻微差异，属于正常波动范围',
    suggestedFix: '继续观察，收集更多数据以确认是否为系统性偏差',
    minDimensionsMatched: 0,
    conditions: {
      divergenceScore: { max: 0.2 },
    },
  },
];

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: LabelingConfig = {
  confidenceThreshold: 0.85,
  batchSize: 50,
  enableEnsemble: true,
  timeoutMs: 30000,
  dimensionConsistencyThreshold: 0.6,
  recencyHalfLifeMs: 7 * 24 * 3600 * 1000, // 7 天半衰期
};

// ============================================================================
// Auto-Labeling Pipeline
// ============================================================================

export class AutoLabelingPipeline {
  private config: LabelingConfig;
  private providers: Map<string, LabelingProvider> = new Map();
  private eventBus: EventBus;
  /** 历史干预指纹缓存（用于计算重复率） */
  private interventionFingerprints: Map<string, number> = new Map();

  constructor(config: Partial<LabelingConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 注册标注提供者
  // ==========================================================================

  registerProvider(name: string, provider: LabelingProvider): void {
    this.providers.set(name, provider);
    log.info(`标注提供者已注册: ${name}`);
  }

  // ==========================================================================
  // 2. 标注单条干预（核心入口）
  // ==========================================================================

  async labelTrajectory(intervention: {
    id: number;
    sessionId: string;
    requestData: Record<string, unknown>;
    humanDecision: Record<string, unknown>;
    shadowDecision: Record<string, unknown>;
    divergenceScore: number;
    createdAt?: Date | number;
  }): Promise<LabelResult> {
    // 2a. 提取特征向量
    const featureVector = this.extractFeatureVector(intervention);

    // 2b. 尝试 AI 标注（Grok / WorldModel）
    let bestLabel: AutoLabel | null = null;
    let bestConfidence = 0;
    let labelSource: LabelResult['labelSource'] = 'rule_based';

    if (this.config.enableEnsemble && this.providers.size > 1) {
      const results = await this.ensembleLabel({
        ...intervention,
        featureVector,
      });
      bestLabel = results.label;
      bestConfidence = results.confidence;
      labelSource = 'ensemble';
    } else if (this.providers.size > 0) {
      const [providerName, provider] = this.providers.entries().next().value!;
      try {
        const result = await this.withTimeout(
          provider.labelIntervention({ ...intervention, featureVector }),
          this.config.timeoutMs,
        );
        bestLabel = result.label;
        bestConfidence = result.confidence;
        labelSource = providerName === 'grok' ? 'grok_agent' : 'world_model';
      } catch (err) {
        log.warn(`标注提供者 ${providerName} 失败，降级到规则矩阵标注`, err);
      }
    }

    // 2c. 降级：多维特征规则矩阵标注
    if (!bestLabel) {
      const ruleResult = this.ruleMatrixLabel(featureVector);
      bestLabel = ruleResult.label;
      bestConfidence = ruleResult.confidence;
      labelSource = 'rule_based';
    }

    // 2d. 不确定性检测
    const isUncertain = this.detectUncertainty(featureVector);
    if (isUncertain) {
      // 不确定时置信度衰减 20%
      bestConfidence *= 0.8;
    }

    const needsHumanReview = bestConfidence < this.config.confidenceThreshold || isUncertain;

    const labelResult: LabelResult = {
      interventionId: intervention.id,
      sessionId: intervention.sessionId,
      autoLabel: bestLabel,
      confidence: bestConfidence,
      labelSource,
      needsHumanReview,
      isUncertain,
      featureVector,
      labeledAt: Date.now(),
    };

    // 2e. 更新指纹缓存
    this.updateFingerprint(intervention);

    // 2f. 持久化
    await this.persistLabel(labelResult);

    // 2g. EventBus
    await this.eventBus.publish(
      needsHumanReview ? 'labeling.review_needed' : 'labeling.auto_completed',
      {
        interventionId: intervention.id,
        confidence: bestConfidence,
        labelSource,
        severity: bestLabel.severity,
        isUncertain,
        featureVector,
      },
      { source: 'auto-labeling-pipeline' },
    );

    return labelResult;
  }

  // ==========================================================================
  // 3. 特征向量提取（6 维度）
  // ==========================================================================

  private extractFeatureVector(intervention: {
    divergenceScore: number;
    humanDecision: Record<string, unknown>;
    shadowDecision: Record<string, unknown>;
    requestData: Record<string, unknown>;
    createdAt?: Date | number;
  }): FeatureVector {
    // 维度 1: 决策差异分数（直接使用）
    const divergenceScore = Math.min(1, Math.max(0, intervention.divergenceScore));

    // 维度 2: 决策类型差异
    const humanType = this.extractDecisionType(intervention.humanDecision);
    const shadowType = this.extractDecisionType(intervention.shadowDecision);
    const decisionTypeMismatch = humanType !== shadowType ? 1 : 0;

    // 维度 3: 置信度差距
    const humanConf = this.extractConfidence(intervention.humanDecision);
    const shadowConf = this.extractConfidence(intervention.shadowDecision);
    const confidenceGap = Math.abs(humanConf - shadowConf);

    // 维度 4: 请求复杂度（基于输入特征数量归一化）
    const requestComplexity = this.computeRequestComplexity(intervention.requestData);

    // 维度 5: 时间衰减因子
    const createdAt = intervention.createdAt
      ? (intervention.createdAt instanceof Date ? intervention.createdAt.getTime() : intervention.createdAt)
      : Date.now();
    const ageMs = Date.now() - createdAt;
    const recencyFactor = Math.exp(-0.693 * ageMs / this.config.recencyHalfLifeMs); // 指数衰减

    // 维度 6: 历史重复率
    const fingerprint = this.computeFingerprint(intervention.requestData);
    const repeatCount = this.interventionFingerprints.get(fingerprint) || 0;
    const historicalRepeatRate = Math.min(1, repeatCount / 10); // 归一化到 0-1

    return {
      divergenceScore,
      decisionTypeMismatch,
      confidenceGap,
      requestComplexity,
      recencyFactor,
      historicalRepeatRate,
    };
  }

  /** 从决策对象中提取决策类型 */
  private extractDecisionType(decision: Record<string, unknown>): string {
    if (decision.type && typeof decision.type === 'string') return decision.type;
    if (decision.action && typeof decision.action === 'string') return decision.action;
    if (decision.category && typeof decision.category === 'string') return decision.category;
    // 基于键集合生成类型签名
    return Object.keys(decision).sort().join(',');
  }

  /** 从决策对象中提取置信度 */
  private extractConfidence(decision: Record<string, unknown>): number {
    if (typeof decision.confidence === 'number') return decision.confidence;
    if (typeof decision.score === 'number') return decision.score;
    if (typeof decision.probability === 'number') return decision.probability;
    return 0.5; // 默认中等置信度
  }

  /** 计算请求复杂度（基于输入特征的深度和广度） */
  private computeRequestComplexity(requestData: Record<string, unknown>): number {
    const flattenCount = this.countFields(requestData);
    // 归一化：假设 50 个字段为最大复杂度
    return Math.min(1, flattenCount / 50);
  }

  /** 递归计算对象字段数量 */
  private countFields(obj: Record<string, unknown>, depth = 0): number {
    if (depth > 5) return 0; // 防止无限递归
    let count = 0;
    for (const value of Object.values(obj)) {
      count++;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        count += this.countFields(value as Record<string, unknown>, depth + 1);
      } else if (Array.isArray(value)) {
        count += value.length;
      }
    }
    return count;
  }

  /** 计算请求指纹（用于重复率统计） */
  private computeFingerprint(requestData: Record<string, unknown>): string {
    // 提取关键特征生成指纹（不使用全量 JSON.stringify 避免噪声）
    const keys = Object.keys(requestData).sort();
    const typeSignature = keys.map(k => `${k}:${typeof requestData[k]}`).join('|');
    // 简单哈希
    let hash = 0;
    for (let i = 0; i < typeSignature.length; i++) {
      const char = typeSignature.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `fp_${hash.toString(36)}`;
  }

  /** 更新指纹缓存 */
  private updateFingerprint(intervention: { requestData: Record<string, unknown> }): void {
    const fp = this.computeFingerprint(intervention.requestData);
    const current = this.interventionFingerprints.get(fp) || 0;
    this.interventionFingerprints.set(fp, current + 1);

    // 限制缓存大小（LRU 简化版：超过 10000 条时清理一半）
    if (this.interventionFingerprints.size > 10000) {
      const entries = Array.from(this.interventionFingerprints.entries());
      this.interventionFingerprints.clear();
      // 保留后半部分（较新的）
      entries.slice(entries.length / 2).forEach(([k, v]) => this.interventionFingerprints.set(k, v));
    }
  }

  // ==========================================================================
  // 4. 多维特征规则矩阵标注
  // ==========================================================================

  private ruleMatrixLabel(features: FeatureVector): { label: AutoLabel; confidence: number } {
    let bestMatch: RuleMatrixEntry | null = null;
    let bestMatchScore = -1;

    for (const rule of RULE_MATRIX) {
      const matchResult = this.evaluateRule(rule, features);
      if (matchResult.matched && matchResult.score > bestMatchScore) {
        bestMatch = rule;
        bestMatchScore = matchResult.score;
      }
    }

    // 默认 fallback
    if (!bestMatch) {
      bestMatch = RULE_MATRIX[RULE_MATRIX.length - 1]; // low severity
      bestMatchScore = 0.3;
    }

    // 置信度计算：基础 0.6 + 维度一致性加成（最高到 0.82）
    const dimensionConsistency = bestMatchScore;
    const confidence = Math.min(0.82, 0.6 + dimensionConsistency * 0.22);

    return {
      label: {
        interventionReason: bestMatch.reason,
        rootCause: bestMatch.rootCause,
        suggestedFix: bestMatch.suggestedFix,
        severity: bestMatch.severity,
        impactScope: this.inferImpactScope(features),
        relatedKGNodes: [],
      },
      confidence,
    };
  }

  /** 评估单条规则是否匹配 */
  private evaluateRule(rule: RuleMatrixEntry, features: FeatureVector): { matched: boolean; score: number } {
    let dimensionsMatched = 0;
    let totalConditions = 0;

    const { conditions } = rule;

    if (conditions.divergenceScore) {
      totalConditions++;
      if (this.checkRange(features.divergenceScore, conditions.divergenceScore)) dimensionsMatched++;
    }
    if (conditions.decisionTypeMismatch) {
      totalConditions++;
      if (features.decisionTypeMismatch === conditions.decisionTypeMismatch.equals) dimensionsMatched++;
    }
    if (conditions.confidenceGap) {
      totalConditions++;
      if (this.checkRange(features.confidenceGap, conditions.confidenceGap)) dimensionsMatched++;
    }
    if (conditions.requestComplexity) {
      totalConditions++;
      if (this.checkRange(features.requestComplexity, conditions.requestComplexity)) dimensionsMatched++;
    }
    if (conditions.recencyFactor) {
      totalConditions++;
      if (this.checkRange(features.recencyFactor, conditions.recencyFactor)) dimensionsMatched++;
    }
    if (conditions.historicalRepeatRate) {
      totalConditions++;
      if (this.checkRange(features.historicalRepeatRate, conditions.historicalRepeatRate)) dimensionsMatched++;
    }

    const matched = dimensionsMatched >= rule.minDimensionsMatched;
    const score = totalConditions > 0 ? dimensionsMatched / totalConditions : 0;

    return { matched, score };
  }

  /** 检查数值是否在范围内 */
  private checkRange(value: number, range: { min?: number; max?: number }): boolean {
    if (range.min !== undefined && value < range.min) return false;
    if (range.max !== undefined && value > range.max) return false;
    return true;
  }

  /** 根据特征向量推断影响范围 */
  private inferImpactScope(features: FeatureVector): string[] {
    const scope: string[] = ['prediction_accuracy'];
    if (features.decisionTypeMismatch === 1) scope.push('decision_type_consistency');
    if (features.confidenceGap > 0.3) scope.push('model_calibration');
    if (features.requestComplexity > 0.7) scope.push('complex_scenario_handling');
    if (features.historicalRepeatRate > 0.3) scope.push('systematic_bias');
    return scope;
  }

  // ==========================================================================
  // 5. 不确定性检测
  // ==========================================================================

  /**
   * 检测多维度评分是否冲突（不确定性）
   *
   * 冲突定义：各维度暗示的严重程度不一致
   * 例如：divergenceScore 很低（暗示 low）但 decisionTypeMismatch=1（暗示 high）
   */
  private detectUncertainty(features: FeatureVector): boolean {
    const severitySignals: number[] = [];

    // 各维度独立评估严重程度（0=low, 1=medium, 2=high, 3=critical）
    severitySignals.push(
      features.divergenceScore > 0.7 ? 3 :
      features.divergenceScore > 0.4 ? 2 :
      features.divergenceScore > 0.2 ? 1 : 0
    );

    severitySignals.push(features.decisionTypeMismatch === 1 ? 2 : 0);

    severitySignals.push(
      features.confidenceGap > 0.5 ? 3 :
      features.confidenceGap > 0.3 ? 2 :
      features.confidenceGap > 0.1 ? 1 : 0
    );

    // 计算维度间的一致性（标准差）
    if (severitySignals.length < 2) return false;

    const mean = severitySignals.reduce((s, v) => s + v, 0) / severitySignals.length;
    const variance = severitySignals.reduce((s, v) => s + (v - mean) ** 2, 0) / severitySignals.length;
    const stdDev = Math.sqrt(variance);

    // 标准差 > 1.0 表示维度间严重冲突
    return stdDev > 1.0;
  }

  // ==========================================================================
  // 6. 批量标注
  // ==========================================================================

  async batchLabel(limit?: number): Promise<LabelingReport> {
    const startTime = Date.now();
    const batchSize = limit ?? this.config.batchSize;

    const db = await getDb();
    if (!db) {
      return this.emptyReport(startTime);
    }

    try {
      const unlabeled = await db.select().from(evolutionInterventions)
        .where(eq(evolutionInterventions.isIntervention, 1))
        .orderBy(desc(evolutionInterventions.createdAt))
        .limit(batchSize);

      if (unlabeled.length === 0) {
        log.info('批量标注：无待标注记录');
        return this.emptyReport(startTime);
      }

      const results: LabelResult[] = [];
      const labelDistribution: Record<string, number> = {};
      const severityDistribution: Record<string, number> = {};

      for (const intervention of unlabeled) {
        try {
          const result = await this.labelTrajectory({
            id: intervention.id,
            sessionId: intervention.sessionId ?? '',
            requestData: (intervention.requestData as Record<string, unknown>) ?? {},
            humanDecision: (intervention.humanDecision as Record<string, unknown>) ?? {},
            shadowDecision: (intervention.shadowDecision as Record<string, unknown>) ?? {},
            divergenceScore: intervention.divergenceScore ?? 0,
            createdAt: intervention.createdAt,
          });
          results.push(result);

          const reason = result.autoLabel.interventionReason;
          labelDistribution[reason] = (labelDistribution[reason] || 0) + 1;

          const sev = result.autoLabel.severity;
          severityDistribution[sev] = (severityDistribution[sev] || 0) + 1;
        } catch (err) {
          log.error(`标注干预 #${intervention.id} 失败`, err);
        }
      }

      const autoLabeled = results.filter(r => !r.needsHumanReview).length;
      const needsReview = results.filter(r => r.needsHumanReview).length;
      const uncertain = results.filter(r => r.isUncertain).length;
      const avgConfidence = results.length > 0
        ? results.reduce((s, r) => s + r.confidence, 0) / results.length
        : 0;

      const report: LabelingReport = {
        totalProcessed: results.length,
        autoLabeled,
        needsReview,
        uncertain,
        avgConfidence,
        labelDistribution,
        severityDistribution,
        durationMs: Date.now() - startTime,
      };

      log.info(`批量标注完成: ${report.totalProcessed} 条, 自动 ${autoLabeled}, 待审 ${needsReview}, 不确定 ${uncertain}`);
      return report;
    } catch (err) {
      log.error('批量标注失败', err);
      return this.emptyReport(startTime);
    }
  }

  private emptyReport(startTime: number): LabelingReport {
    return {
      totalProcessed: 0, autoLabeled: 0, needsReview: 0, uncertain: 0,
      avgConfidence: 0, labelDistribution: {}, severityDistribution: {},
      durationMs: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // 7. 集成标注（多模型投票）
  // ==========================================================================

  private async ensembleLabel(trajectory: Record<string, unknown>): Promise<{
    label: AutoLabel;
    confidence: number;
  }> {
    const providerResults: { label: AutoLabel; confidence: number; weight: number }[] = [];

    for (const [name, provider] of this.providers) {
      try {
        const result = await this.withTimeout(
          provider.labelIntervention(trajectory),
          this.config.timeoutMs,
        );
        providerResults.push({
          ...result,
          weight: name === 'grok' ? 1.5 : 1.0,
        });
      } catch (err) {
        log.warn(`集成标注: 提供者 ${name} 失败`, err);
      }
    }

    if (providerResults.length === 0) {
      // 所有 AI 提供者失败，降级到规则矩阵
      const features = (trajectory as any).featureVector as FeatureVector;
      if (features) {
        return this.ruleMatrixLabel(features);
      }
      return {
        label: this.fallbackLabel(),
        confidence: 0.5,
      };
    }

    // 加权投票
    const severityVotes: Record<string, number> = {};
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const result of providerResults) {
      severityVotes[result.label.severity] = (severityVotes[result.label.severity] || 0) + result.weight;
      weightedConfidence += result.confidence * result.weight;
      totalWeight += result.weight;
    }

    const bestSeverity = Object.entries(severityVotes)
      .sort(([, a], [, b]) => b - a)[0][0] as AutoLabel['severity'];

    const bestResult = providerResults
      .filter(r => r.label.severity === bestSeverity)
      .sort((a, b) => b.confidence - a.confidence)[0];

    return {
      label: bestResult.label,
      confidence: weightedConfidence / totalWeight,
    };
  }

  private fallbackLabel(): AutoLabel {
    return {
      interventionReason: 'unknown_all_providers_failed',
      rootCause: '所有标注提供者均失败，无法确定根因',
      suggestedFix: '需要人工审核',
      severity: 'medium',
      impactScope: ['unknown'],
      relatedKGNodes: [],
    };
  }

  // ==========================================================================
  // 8. 持久化标注结果
  // ==========================================================================

  private async persistLabel(result: LabelResult): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.update(edgeCases)
        .set({
          status: result.needsHumanReview ? 'analyzing' : 'labeled',
          labelResult: {
            autoLabel: result.autoLabel,
            confidence: result.confidence,
            labelSource: result.labelSource,
            needsHumanReview: result.needsHumanReview,
            isUncertain: result.isUncertain,
            featureVector: result.featureVector,
          },
          discoveredAt: new Date(),
        })
        .where(eq(edgeCases.id, result.interventionId));
    } catch (err) {
      log.error('持久化标注结果失败', err);
    }
  }

  // ==========================================================================
  // 9. 工具方法
  // ==========================================================================

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`标注超时 (${timeoutMs}ms)`)), timeoutMs);
      promise
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }
}
