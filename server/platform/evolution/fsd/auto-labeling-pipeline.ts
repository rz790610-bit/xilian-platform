/**
 * ============================================================================
 * Auto-Labeling Pipeline (E27)
 * ============================================================================
 *
 * 借鉴 FSD Auto-Labeling：
 *   - 使用 Grok Agent + World Model 自动标注干预轨迹
 *   - 多级置信度评估
 *   - 批量标注 + 人工审核队列
 *   - 标注结果回写 edge_cases 表
 *   - 支持多种标注类型（分类、回归、序列）
 */

import { getDb } from '../../../lib/db';
import { evolutionInterventions, edgeCases } from '../../../../drizzle/evolution-schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
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
  labeledAt: number;
}

export interface AutoLabel {
  /** 干预原因分类 */
  interventionReason: string;
  /** 根因分析 */
  rootCause: string;
  /** 建议的修正方向 */
  suggestedFix: string;
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 影响范围 */
  impactScope: string[];
  /** 关联的知识图谱节点 */
  relatedKGNodes: string[];
}

export interface LabelingConfig {
  /** 自动标注置信度阈值（低于此值需人工审核） */
  confidenceThreshold: number;
  /** 批量标注大小 */
  batchSize: number;
  /** 是否启用集成标注（多模型投票） */
  enableEnsemble: boolean;
  /** 标注超时 (ms) */
  timeoutMs: number;
}

export interface LabelingReport {
  totalProcessed: number;
  autoLabeled: number;
  needsReview: number;
  avgConfidence: number;
  labelDistribution: Record<string, number>;
  durationMs: number;
}

// ============================================================================
// 标注器接口
// ============================================================================

export interface LabelingProvider {
  /** 使用 AI 标注单条干预 */
  labelIntervention(trajectory: Record<string, unknown>): Promise<{
    label: AutoLabel;
    confidence: number;
  }>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: LabelingConfig = {
  confidenceThreshold: 0.85,
  batchSize: 50,
  enableEnsemble: true,
  timeoutMs: 30000,
};

// ============================================================================
// Auto-Labeling Pipeline
// ============================================================================

export class AutoLabelingPipeline {
  private config: LabelingConfig;
  private providers: Map<string, LabelingProvider> = new Map();
  private eventBus: EventBus;

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
  // 2. 标注单条干预
  // ==========================================================================

  async labelTrajectory(intervention: {
    id: number;
    sessionId: string;
    requestData: Record<string, unknown>;
    humanDecision: Record<string, unknown>;
    shadowDecision: Record<string, unknown>;
    divergenceScore: number;
  }): Promise<LabelResult> {
    const trajectory = {
      requestData: intervention.requestData,
      humanDecision: intervention.humanDecision,
      shadowDecision: intervention.shadowDecision,
      divergenceScore: intervention.divergenceScore,
    };

    let bestLabel: AutoLabel | null = null;
    let bestConfidence = 0;
    let labelSource: LabelResult['labelSource'] = 'rule_based';

    if (this.config.enableEnsemble && this.providers.size > 1) {
      // 集成标注：多提供者投票
      const results = await this.ensembleLabel(trajectory);
      bestLabel = results.label;
      bestConfidence = results.confidence;
      labelSource = 'ensemble';
    } else if (this.providers.size > 0) {
      // 单提供者标注
      const [providerName, provider] = this.providers.entries().next().value!;
      try {
        const result = await this.withTimeout(
          provider.labelIntervention(trajectory),
          this.config.timeoutMs,
        );
        bestLabel = result.label;
        bestConfidence = result.confidence;
        labelSource = providerName === 'grok' ? 'grok_agent' : 'world_model';
      } catch (err) {
        log.warn(`标注提供者 ${providerName} 失败，降级到规则标注`, err);
      }
    }

    // 降级：规则标注
    if (!bestLabel) {
      bestLabel = this.ruleBasedLabel(intervention);
      bestConfidence = 0.6;
      labelSource = 'rule_based';
    }

    const needsHumanReview = bestConfidence < this.config.confidenceThreshold;

    const labelResult: LabelResult = {
      interventionId: intervention.id,
      sessionId: intervention.sessionId,
      autoLabel: bestLabel,
      confidence: bestConfidence,
      labelSource,
      needsHumanReview,
      labeledAt: Date.now(),
    };

    // 持久化标注结果
    await this.persistLabel(labelResult);

    // EventBus
    await this.eventBus.publish({
      type: needsHumanReview ? 'labeling.review_needed' : 'labeling.auto_completed',
      source: 'auto-labeling-pipeline',
      data: {
        interventionId: intervention.id,
        confidence: bestConfidence,
        labelSource,
        severity: bestLabel.severity,
      },
    });

    return labelResult;
  }

  // ==========================================================================
  // 3. 批量标注
  // ==========================================================================

  async batchLabel(limit?: number): Promise<LabelingReport> {
    const startTime = Date.now();
    const batchSize = limit ?? this.config.batchSize;

    const db = await getDb();
    if (!db) {
      return { totalProcessed: 0, autoLabeled: 0, needsReview: 0, avgConfidence: 0, labelDistribution: {}, durationMs: 0 };
    }

    try {
      // 查询未标注的干预记录
      const unlabeled = await db.select().from(evolutionInterventions)
        .where(eq(evolutionInterventions.isIntervention, 1))
        .orderBy(desc(evolutionInterventions.createdAt))
        .limit(batchSize);

      const results: LabelResult[] = [];
      const labelDistribution: Record<string, number> = {};

      for (const intervention of unlabeled) {
        try {
          const result = await this.labelTrajectory({
            id: intervention.id,
            sessionId: intervention.sessionId ?? '',
            requestData: (intervention.requestData as Record<string, unknown>) ?? {},
            humanDecision: (intervention.humanDecision as Record<string, unknown>) ?? {},
            shadowDecision: (intervention.shadowDecision as Record<string, unknown>) ?? {},
            divergenceScore: intervention.divergenceScore ?? 0,
          });
          results.push(result);

          // 统计标签分布
          const reason = result.autoLabel.interventionReason;
          labelDistribution[reason] = (labelDistribution[reason] || 0) + 1;
        } catch (err) {
          log.error(`标注干预 #${intervention.id} 失败`, err);
        }
      }

      const autoLabeled = results.filter(r => !r.needsHumanReview).length;
      const needsReview = results.filter(r => r.needsHumanReview).length;
      const avgConfidence = results.length > 0
        ? results.reduce((s, r) => s + r.confidence, 0) / results.length
        : 0;

      const report: LabelingReport = {
        totalProcessed: results.length,
        autoLabeled,
        needsReview,
        avgConfidence,
        labelDistribution,
        durationMs: Date.now() - startTime,
      };

      log.info(`批量标注完成: ${report.totalProcessed} 条, 自动 ${autoLabeled}, 待审 ${needsReview}`);
      return report;
    } catch (err) {
      log.error('批量标注失败', err);
      return { totalProcessed: 0, autoLabeled: 0, needsReview: 0, avgConfidence: 0, labelDistribution: {}, durationMs: Date.now() - startTime };
    }
  }

  // ==========================================================================
  // 4. 集成标注（多模型投票）
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
          weight: name === 'grok' ? 1.5 : 1.0, // Grok 权重更高
        });
      } catch (err) {
        log.warn(`集成标注: 提供者 ${name} 失败`, err);
      }
    }

    if (providerResults.length === 0) {
      return {
        label: this.ruleBasedLabel({ divergenceScore: 0.5 } as any),
        confidence: 0.5,
      };
    }

    // 加权投票选择最佳标签
    const severityVotes: Record<string, number> = {};
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const result of providerResults) {
      severityVotes[result.label.severity] = (severityVotes[result.label.severity] || 0) + result.weight;
      weightedConfidence += result.confidence * result.weight;
      totalWeight += result.weight;
    }

    // 选择票数最高的严重程度
    const bestSeverity = Object.entries(severityVotes)
      .sort(([, a], [, b]) => b - a)[0][0] as AutoLabel['severity'];

    // 选择与最佳严重程度匹配的最高置信度标签
    const bestResult = providerResults
      .filter(r => r.label.severity === bestSeverity)
      .sort((a, b) => b.confidence - a.confidence)[0];

    return {
      label: bestResult.label,
      confidence: weightedConfidence / totalWeight,
    };
  }

  // ==========================================================================
  // 5. 规则标注（降级方案）
  // ==========================================================================

  private ruleBasedLabel(intervention: {
    divergenceScore: number;
    requestData?: Record<string, unknown>;
    humanDecision?: Record<string, unknown>;
    shadowDecision?: Record<string, unknown>;
  }): AutoLabel {
    const score = intervention.divergenceScore;

    let severity: AutoLabel['severity'] = 'low';
    let reason = 'minor_divergence';
    let rootCause = '影子模型与生产模型存在轻微差异';
    let suggestedFix = '继续观察，收集更多数据';

    if (score > 0.7) {
      severity = 'critical';
      reason = 'critical_divergence';
      rootCause = '影子模型决策与生产模型严重偏离，可能存在模型缺陷';
      suggestedFix = '立即审查影子模型训练数据和特征工程';
    } else if (score > 0.4) {
      severity = 'high';
      reason = 'significant_divergence';
      rootCause = '影子模型在特定场景下表现不稳定';
      suggestedFix = '增加该场景的训练样本，调整模型超参数';
    } else if (score > 0.2) {
      severity = 'medium';
      reason = 'moderate_divergence';
      rootCause = '影子模型在边界条件下存在偏差';
      suggestedFix = '优化特征工程，增加边界条件覆盖';
    }

    return {
      interventionReason: reason,
      rootCause,
      suggestedFix,
      severity,
      impactScope: ['prediction_accuracy'],
      relatedKGNodes: [],
    };
  }

  // ==========================================================================
  // 6. 持久化标注结果
  // ==========================================================================

  private async persistLabel(result: LabelResult): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      // 更新 edge_cases 表的标注结果
      await db.update(edgeCases)
        .set({
          status: result.needsHumanReview ? 'analyzing' : 'labeled',
          labelResult: {
            autoLabel: result.autoLabel,
            confidence: result.confidence,
            labelSource: result.labelSource,
            needsHumanReview: result.needsHumanReview,
          },
          labeledAt: new Date(),
        })
        .where(eq(edgeCases.id, result.interventionId));
    } catch (err) {
      log.error('持久化标注结果失败', err);
    }
  }

  // ==========================================================================
  // 7. 工具方法
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
