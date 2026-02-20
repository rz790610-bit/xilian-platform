/**
 * ============================================================================
 * 决策维处理器 — DecisionProcessor
 * ============================================================================
 *
 * 认知闭环四维之四：决策维（EntropyRanker）
 *
 * 职责：
 *   1. 候选动作生成 — 基于融合结果生成候选动作列表
 *   2. 熵排序 — 基于预期信息增益（熵减少）对动作排序
 *   3. 资源分配 — 根据降级模式和优先级分配资源
 *   4. 约束检查 — 确保推荐动作满足资源和业务约束
 *
 * 与平台现有组件的对接：
 *   - 使用 MetaLearner 获取历史经验指导决策
 *   - 使用 DS 融合结果作为决策依据
 *   - 输出动作列表供流水线执行
 *
 * 对应 v3.0 方案 U-15（决策维部分）
 */

import { createModuleLogger } from '../../../core/logger';
import type { DimensionProcessor, DimensionContext } from '../engines/cognition-unit';
import type {
  CognitionStimulus,
  DecisionOutput,
  PerceptionOutput,
  ReasoningOutput,
  FusionOutput,
  DegradationMode,
} from '../types';

const log = createModuleLogger('decisionProcessor');

// ============================================================================
// 决策维处理器配置
// ============================================================================

export interface DecisionConfig {
  /** 最大推荐动作数 */
  maxActions: number;
  /** 资源预算 */
  resourceBudget: {
    /** 计算预算（GPU 小时） */
    compute: number;
    /** 时间预算（秒） */
    time: number;
    /** 数据预算（样本数） */
    data: number;
  };
  /** 各降级模式下的资源缩放因子 */
  degradationScaling: Record<DegradationMode, number>;
  /** 最小动作优先级 */
  minActionPriority: number;
}

const DEFAULT_CONFIG: DecisionConfig = {
  maxActions: 10,
  resourceBudget: {
    compute: 100,
    time: 3600,
    data: 10000,
  },
  degradationScaling: {
    normal: 1.0,
    high_pressure: 0.5,
    emergency: 0.2,
  },
  minActionPriority: 0.1,
};

// ============================================================================
// 动作类型定义
// ============================================================================

type ActionType = DecisionOutput['data']['recommendedActions'][number]['type'];

/** 动作模板 — 预定义的动作生成规则 */
interface ActionTemplate {
  type: ActionType;
  description: string;
  /** 触发条件 */
  trigger: (context: ActionContext) => boolean;
  /** 优先级计算 */
  priorityFn: (context: ActionContext) => number;
  /** 预估成本 */
  costFn: (context: ActionContext) => number;
  /** 预估收益 */
  benefitFn: (context: ActionContext) => number;
  /** 约束条件 */
  constraints: string[];
}

/** 动作生成上下文 */
interface ActionContext {
  stimulus: CognitionStimulus;
  perception?: PerceptionOutput;
  reasoning?: ReasoningOutput;
  fusion?: FusionOutput;
  degradationMode: DegradationMode;
}

// ============================================================================
// 决策维处理器实现
// ============================================================================

export class DecisionProcessor implements DimensionProcessor<DecisionOutput> {
  readonly dimension = 'decision' as const;
  private readonly config: DecisionConfig;
  private readonly actionTemplates: ActionTemplate[];

  constructor(config?: Partial<DecisionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.actionTemplates = this.buildActionTemplates();
  }

  /**
   * 执行决策维处理
   */
  async process(
    stimulus: CognitionStimulus,
    dimContext: DimensionContext,
  ): Promise<DecisionOutput> {
    // P0-CODE-4: 统一签名为 (stimulus, context)
    const degradationMode = dimContext.degradationMode;
    const perceptionOutput = dimContext.completedDimensions.get('perception') as PerceptionOutput | undefined;
    const reasoningOutput = dimContext.completedDimensions.get('reasoning') as ReasoningOutput | undefined;
    const fusionOutput = dimContext.completedDimensions.get('fusion') as FusionOutput | undefined;
    const startTime = Date.now();

    try {
      const context: ActionContext = {
        stimulus,
        perception: perceptionOutput,
        reasoning: reasoningOutput,
        fusion: fusionOutput,
        degradationMode,
      };

      // 1. 生成候选动作
      const candidateActions = this.generateCandidateActions(context);

      // 2. 熵排序
      const entropyRanking = this.computeEntropyRanking(candidateActions, context);

      // 3. 资源分配
      const scalingFactor = this.config.degradationScaling[degradationMode];
      const resourceAllocation = {
        computeBudget: Math.round(this.config.resourceBudget.compute * scalingFactor),
        timeBudget: Math.round(this.config.resourceBudget.time * scalingFactor),
        dataBudget: Math.round(this.config.resourceBudget.data * scalingFactor),
      };

      // 4. 约束检查和最终排序
      const recommendedActions = this.applyConstraintsAndRank(
        candidateActions,
        entropyRanking,
        resourceAllocation,
      );

      return {
        dimension: 'decision',
        success: true,
        durationMs: Date.now() - startTime,
        data: {
          recommendedActions,
          resourceAllocation,
          entropyRanking,
        },
      };
    } catch (err) {
      log.error({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Decision processing failed');

      return {
        dimension: 'decision',
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
        data: {
          recommendedActions: [],
          resourceAllocation: { computeBudget: 0, timeBudget: 0, dataBudget: 0 },
          entropyRanking: [],
        },
      };
    }
  }

  // ==========================================================================
  // 核心算法
  // ==========================================================================

  /**
   * 生成候选动作
   */
  private generateCandidateActions(
    context: ActionContext,
  ): DecisionOutput['data']['recommendedActions'] {
    const actions: DecisionOutput['data']['recommendedActions'] = [];
    let actionCounter = 0;

    for (const template of this.actionTemplates) {
      if (template.trigger(context)) {
        actionCounter++;
        const priority = template.priorityFn(context);

        if (priority >= this.config.minActionPriority) {
          actions.push({
            id: `act_${actionCounter}`,
            type: template.type,
            description: template.description,
            priority,
            estimatedCost: template.costFn(context),
            estimatedBenefit: template.benefitFn(context),
            constraints: template.constraints,
          });
        }
      }
    }

    return actions;
  }

  /**
   * 熵排序 — 基于预期信息增益对动作排序
   *
   * 核心思想：选择执行后能最大程度减少系统不确定性的动作。
   *
   * 预期熵减少 = 当前熵 - 执行动作后的预期熵
   */
  private computeEntropyRanking(
    actions: DecisionOutput['data']['recommendedActions'],
    context: ActionContext,
  ): DecisionOutput['data']['entropyRanking'] {
    // 计算当前系统熵
    const currentEntropy = this.computeCurrentEntropy(context);

    const ranking: DecisionOutput['data']['entropyRanking'] = [];

    for (const action of actions) {
      // 估计执行动作后的熵减少
      const entropyReduction = this.estimateEntropyReduction(action, currentEntropy, context);

      ranking.push({
        actionId: action.id,
        entropyReduction,
        rank: 0, // 稍后排序
      });
    }

    // 按熵减少降序排序
    ranking.sort((a, b) => b.entropyReduction - a.entropyReduction);

    // 分配排名
    for (let i = 0; i < ranking.length; i++) {
      ranking[i].rank = i + 1;
    }

    return ranking;
  }

  /**
   * 计算当前系统熵
   */
  private computeCurrentEntropy(context: ActionContext): number {
    if (!context.fusion?.success) return 1.0; // 最大不确定性

    const { dsFusionResult } = context.fusion.data;
    const masses = Object.entries(dsFusionResult.fusedMass)
      .filter(([key]) => key !== 'theta')
      .map(([, v]) => v);

    if (masses.length === 0) return 1.0;

    const total = masses.reduce((s, v) => s + v, 0);
    if (total === 0) return 1.0;

    // Shannon 熵
    let entropy = 0;
    for (const m of masses) {
      const p = m / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // 归一化到 [0, 1]
    const maxEntropy = Math.log2(masses.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * 估计动作执行后的熵减少
   */
  private estimateEntropyReduction(
    action: DecisionOutput['data']['recommendedActions'][number],
    currentEntropy: number,
    _context: ActionContext,
  ): number {
    // 不同动作类型的预期熵减少系数
    const entropyReductionCoefficients: Record<ActionType, number> = {
      retrain: 0.4,     // 重训练能显著减少模型不确定性
      relabel: 0.3,     // 重标注能改善数据质量
      recollect: 0.25,  // 重采集能补充缺失数据
      alert: 0.05,      // 告警本身不减少熵
      deploy: 0.15,     // 部署新模型可能减少预测不确定性
      rollback: 0.2,    // 回滚到已知良好状态
      investigate: 0.35, // 调查能获取新信息
    };

    const coefficient = entropyReductionCoefficients[action.type] ?? 0.1;

    // 预期熵减少 = 当前熵 × 系数 × 优先级 × 收益/成本比
    const costBenefitRatio = action.estimatedCost > 0
      ? Math.min(2.0, action.estimatedBenefit / action.estimatedCost)
      : 1.0;

    return currentEntropy * coefficient * action.priority * costBenefitRatio;
  }

  /**
   * 约束检查和最终排序
   */
  private applyConstraintsAndRank(
    actions: DecisionOutput['data']['recommendedActions'],
    entropyRanking: DecisionOutput['data']['entropyRanking'],
    resourceAllocation: DecisionOutput['data']['resourceAllocation'],
  ): DecisionOutput['data']['recommendedActions'] {
    // 创建熵排名查找表
    const entropyMap = new Map(entropyRanking.map(r => [r.actionId, r]));

    // 按综合分数排序：70% 熵排序 + 30% 原始优先级
    const scored = actions.map(action => {
      const entropy = entropyMap.get(action.id);
      const entropyScore = entropy ? entropy.entropyReduction : 0;
      const compositeScore = 0.7 * entropyScore + 0.3 * action.priority;
      return { action, compositeScore };
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    // 资源约束检查：累计成本不超过预算
    const result: DecisionOutput['data']['recommendedActions'] = [];
    let cumulativeCost = 0;

    for (const { action } of scored) {
      if (result.length >= this.config.maxActions) break;

      // 简化的资源检查：成本不超过计算预算
      if (cumulativeCost + action.estimatedCost <= resourceAllocation.computeBudget) {
        result.push(action);
        cumulativeCost += action.estimatedCost;
      }
    }

    return result;
  }

  // ==========================================================================
  // 动作模板
  // ==========================================================================

  /**
   * 构建预定义的动作模板
   */
  private buildActionTemplates(): ActionTemplate[] {
    return [
      // 重训练
      {
        type: 'retrain',
        description: '触发模型重训练以适应新的数据分布',
        trigger: (ctx) => {
          if (!ctx.fusion?.success) return false;
          const { decision } = ctx.fusion.data.dsFusionResult;
          return decision === 'degraded' || decision === 'faulty';
        },
        priorityFn: (ctx) => {
          const confidence = ctx.fusion?.data.dsFusionResult.confidence ?? 0;
          return confidence * 0.8;
        },
        costFn: () => 50, // GPU 小时
        benefitFn: (ctx) => {
          const confidence = ctx.fusion?.data.dsFusionResult.confidence ?? 0;
          return confidence * 100;
        },
        constraints: ['需要足够的训练数据', '需要 GPU 资源'],
      },

      // 重标注
      {
        type: 'relabel',
        description: '对疑似标注错误的数据进行重新标注',
        trigger: (ctx) => {
          if (!ctx.perception?.success) return false;
          return ctx.perception.data.anomalies.some(a => a.type.includes('label'));
        },
        priorityFn: (ctx) => {
          const anomalyCount = ctx.perception?.data.anomalies.length ?? 0;
          return Math.min(1.0, anomalyCount / 10);
        },
        costFn: () => 20,
        benefitFn: () => 60,
        constraints: ['需要标注人员', '需要标注规范'],
      },

      // 重采集
      {
        type: 'recollect',
        description: '针对数据缺失或分布不均的维度重新采集数据',
        trigger: (ctx) => {
          if (!ctx.perception?.success) return false;
          return ctx.perception.data.darkDataFlows.length > 0;
        },
        priorityFn: (ctx) => {
          const darkFlows = ctx.perception?.data.darkDataFlows.length ?? 0;
          return Math.min(1.0, darkFlows / 5) * 0.6;
        },
        costFn: () => 10,
        benefitFn: () => 40,
        constraints: ['需要数据采集通道可用'],
      },

      // 告警
      {
        type: 'alert',
        description: '向运维人员发送异常告警',
        trigger: (ctx) => {
          if (!ctx.fusion?.success) return false;
          return ctx.fusion.data.dsFusionResult.decision === 'faulty';
        },
        priorityFn: (ctx) => {
          const confidence = ctx.fusion?.data.dsFusionResult.confidence ?? 0;
          return confidence > 0.7 ? 0.9 : 0.5;
        },
        costFn: () => 1,
        benefitFn: () => 30,
        constraints: [],
      },

      // 回滚
      {
        type: 'rollback',
        description: '回滚到上一个稳定版本的模型',
        trigger: (ctx) => {
          if (!ctx.fusion?.success) return false;
          const { decision, confidence } = ctx.fusion.data.dsFusionResult;
          return decision === 'faulty' && confidence > 0.8;
        },
        priorityFn: (ctx) => {
          const confidence = ctx.fusion?.data.dsFusionResult.confidence ?? 0;
          return confidence > 0.8 ? 0.95 : 0.6;
        },
        costFn: () => 5,
        benefitFn: () => 80,
        constraints: ['需要有可回滚的模型版本'],
      },

      // 调查
      {
        type: 'investigate',
        description: '深入调查异常根因，收集更多证据',
        trigger: (ctx) => {
          if (!ctx.fusion?.success) return true; // 融合失败时也需要调查
          return ctx.fusion.data.conflictAnalysis.hasConflict;
        },
        priorityFn: (ctx) => {
          const conflictDegree = ctx.fusion?.data.conflictAnalysis.conflictDegree ?? 0;
          return Math.min(1.0, conflictDegree + 0.3);
        },
        costFn: () => 15,
        benefitFn: () => 50,
        constraints: ['需要人工参与'],
      },

      // 部署
      {
        type: 'deploy',
        description: '部署新训练的模型到生产环境',
        trigger: (ctx) => {
          return ctx.stimulus.type === 'training_completed';
        },
        priorityFn: () => 0.7,
        costFn: () => 10,
        benefitFn: () => 70,
        constraints: ['需要通过 Champion-Challenger 评估', '需要通过金丝雀验证'],
      },
    ];
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createDecisionProcessor(
  config?: Partial<DecisionConfig>,
): DecisionProcessor {
  return new DecisionProcessor(config);
}
