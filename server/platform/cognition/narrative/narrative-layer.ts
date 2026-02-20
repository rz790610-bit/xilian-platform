/**
 * ============================================================================
 * NarrativeLayer — 叙事生成层
 * ============================================================================
 *
 * 将四维并行执行的认知结果映射为"好奇→假设→实验→验证"四阶段叙事。
 *
 * 架构：
 *   - 外层叙事：面向人类的四阶段故事线
 *   - 内层执行：四维并行高效执行（不受叙事影响）
 *
 * NarrativeLayer 是纯观察层，不修改 CognitionUnit 的执行逻辑，
 * 仅根据四维输出生成叙事摘要。
 *
 * 映射规则：
 *   感知维输出 → 好奇阶段（"我们注意到了什么？"）
 *   推演维输出 → 假设阶段（"我们猜测原因是什么？"）
 *   融合维输出 → 实验阶段（"证据支持哪个假设？"）
 *   决策维输出 → 验证阶段（"我们应该怎么做？"）
 */

import type {
  CognitionResult,
  NarrativeSummary,
  PerceptionOutput,
  ReasoningOutput,
  FusionOutput,
  DecisionOutput,
} from '../types';
import type { NarrativeGenerator } from '../engines/cognition-unit';

// v5.0: 进化模块叙事扩展接口
interface V5NarrativeExtension {
  /** Grok 推理链叙事 */
  grokReasoning?: string;
  /** WorldModel 预测叙事 */
  worldModelPrediction?: string;
  /** 护栏检查叙事 */
  guardrailCheck?: string;
  /** 进化飞轮状态 */
  evolutionStatus?: string;
}

// ============================================================================
// 叙事模板
// ============================================================================

interface NarrativeTemplate {
  curiosity: (perception?: PerceptionOutput) => string;
  hypothesis: (reasoning?: ReasoningOutput) => string;
  experiment: (fusion?: FusionOutput) => string;
  verification: (decision?: DecisionOutput) => string;
}

/**
 * 默认叙事模板 — 中文工业场景
 */
const DEFAULT_TEMPLATE: NarrativeTemplate = {
  curiosity: (perception) => {
    if (!perception?.success) {
      return '感知维度未能成功执行，无法获取环境感知信息。';
    }
    const { anomalies, highEntropyDimensions, questionChain, darkDataFlows } = perception.data;

    const parts: string[] = [];

    if (anomalies.length > 0) {
      const topAnomalies = anomalies.slice(0, 3);
      const anomalyDesc = topAnomalies
        .map(a => `${a.source}检测到${a.type}异常（严重度${(a.severity * 100).toFixed(0)}%）`)
        .join('；');
      parts.push(`系统检测到${anomalies.length}个异常信号：${anomalyDesc}`);
    } else {
      parts.push('当前未检测到明显异常信号');
    }

    if (highEntropyDimensions.length > 0) {
      const topDims = highEntropyDimensions.slice(0, 2);
      const dimDesc = topDims
        .map(d => `${d.name}（偏差${(d.deviation * 100).toFixed(1)}%）`)
        .join('、');
      parts.push(`高信息量维度：${dimDesc}`);
    }

    if (darkDataFlows.length > 0) {
      parts.push(`发现${darkDataFlows.length}个潜在暗数据流`);
    }

    if (questionChain.length > 0) {
      parts.push(`核心问题：${questionChain[0]}`);
    }

    return parts.join('。') + '。';
  },

  hypothesis: (reasoning) => {
    if (!reasoning?.success) {
      return '推演维度未能成功执行，无法生成假设。';
    }
    const { hypotheses, causalPaths, shadowEvaluation } = reasoning.data;

    const parts: string[] = [];

    if (hypotheses.length > 0) {
      const topHypotheses = hypotheses.slice(0, 3);
      const hypDesc = topHypotheses
        .map((h, i) => `假设${i + 1}：${h.description}（先验概率${(h.priorProbability * 100).toFixed(0)}%）`)
        .join('；');
      parts.push(`生成${hypotheses.length}个候选假设：${hypDesc}`);
    } else {
      parts.push('未能生成有效假设');
    }

    if (causalPaths.length > 0) {
      const topPath = causalPaths[0];
      parts.push(`主要因果路径：${topPath.from} → ${topPath.to}（强度${(topPath.strength * 100).toFixed(0)}%，机制：${topPath.mechanism}）`);
    }

    if (shadowEvaluation) {
      parts.push(`影子评估覆盖${shadowEvaluation.scenarioCount}个场景`);
    }

    return parts.join('。') + '。';
  },

  experiment: (fusion) => {
    if (!fusion?.success) {
      return '融合维度未能成功执行，无法完成证据融合。';
    }
    const { dsFusionResult, consistencyScore, conflictAnalysis, informationGain } = fusion.data;

    const parts: string[] = [];

    parts.push(
      `DS融合引擎判定：${dsFusionResult.decision}（置信度${(dsFusionResult.confidence * 100).toFixed(1)}%，` +
      `使用${dsFusionResult.strategyUsed}策略）`,
    );

    if (conflictAnalysis.hasConflict) {
      parts.push(
        `检测到证据冲突（冲突度${(conflictAnalysis.conflictDegree * 100).toFixed(1)}%），` +
        `涉及${conflictAnalysis.conflictingSources.length}对证据源`,
      );
    } else {
      parts.push('各证据源一致，无冲突');
    }

    parts.push(`证据一致性评分：${(consistencyScore * 100).toFixed(1)}%`);

    if (informationGain > 0) {
      parts.push(`本次认知的信息增益：${informationGain.toFixed(3)} bits`);
    }

    return parts.join('。') + '。';
  },

  verification: (decision) => {
    if (!decision?.success) {
      return '决策维度未能成功执行，无法生成行动建议。';
    }
    const { recommendedActions, resourceAllocation, entropyRanking } = decision.data;

    const parts: string[] = [];

    if (recommendedActions.length > 0) {
      const topActions = recommendedActions.slice(0, 3);
      const actionDesc = topActions
        .map((a, i) => `${i + 1}. ${a.description}（类型：${a.type}，优先级${(a.priority * 100).toFixed(0)}%）`)
        .join('；');
      parts.push(`推荐${recommendedActions.length}项行动：${actionDesc}`);
    } else {
      parts.push('当前无需采取行动');
    }

    if (entropyRanking.length > 0) {
      const topRank = entropyRanking[0];
      parts.push(`熵排序第一：${topRank.actionId}（预期熵减少${topRank.entropyReduction.toFixed(3)}）`);
    }

    parts.push(
      `资源预算：计算${resourceAllocation.computeBudget}单位、` +
      `时间${resourceAllocation.timeBudget}秒、` +
      `数据${resourceAllocation.dataBudget}条`,
    );

    return parts.join('。') + '。';
  },
};

// ============================================================================
// NarrativeLayer 实现
// ============================================================================

export class NarrativeLayer implements NarrativeGenerator {
  private readonly template: NarrativeTemplate;

  constructor(template?: Partial<NarrativeTemplate>) {
    this.template = { ...DEFAULT_TEMPLATE, ...template };
  }

  /**
   * 生成叙事摘要
   */
  generate(result: Omit<CognitionResult, 'narrative'>): NarrativeSummary {
    const { dimensions } = result;

    // 四阶段叙事
    const phases = {
      curiosity: this.template.curiosity(dimensions.perception),
      hypothesis: this.template.hypothesis(dimensions.reasoning),
      experiment: this.template.experiment(dimensions.fusion),
      verification: this.template.verification(dimensions.decision),
    };

    // 关键发现
    const keyFindings = this.extractKeyFindings(result);

    // 建议行动
    const suggestedActions = this.extractSuggestedActions(result);

    // 人类可读摘要
    const humanReadableSummary = this.composeHumanReadableSummary(
      phases, keyFindings, result,
    );

    // v5.0: 提取进化模块叙事
    const v5Extension = this.extractV5Narrative(result);

    return {
      phases,
      humanReadableSummary,
      keyFindings,
      suggestedActions,
      // v5.0 扩展字段
      ...(Object.keys(v5Extension).length > 0 ? { _v5: v5Extension } : {}),
    };
  }

  /**
   * v5.0: 提取进化模块叙事
   */
  private extractV5Narrative(result: Omit<CognitionResult, 'narrative'>): V5NarrativeExtension {
    const ext: V5NarrativeExtension = {};
    const dims = result.dimensions as any;

    // Grok 推理链叙事
    if (dims.reasoning?.data?.hypotheses?.some((h: any) => h.id?.startsWith('hyp_grok_'))) {
      const grokHyps = dims.reasoning.data.hypotheses.filter((h: any) => h.id?.startsWith('hyp_grok_'));
      ext.grokReasoning = `Grok 深度推理生成${grokHyps.length}个假设：${grokHyps.map((h: any) => h.description).join('；')}`;
    }

    // WorldModel 预测叙事
    if (dims.perception?.data?._pipelineResult) {
      ext.worldModelPrediction = '感知管线已执行全链路处理（采集→融合→编码）';
    }
    if (dims.perception?.data?._stateVector) {
      ext.worldModelPrediction = (ext.worldModelPrediction || '') + '，已生成统一状态向量';
    }

    // 护栏检查叙事
    if (dims.decision?.data?._guardrailResult) {
      const gr = dims.decision.data._guardrailResult;
      if (gr.violations?.length > 0) {
        ext.guardrailCheck = `护栏检测到${gr.violations.length}个违规：${gr.violations.map((v: any) => v.ruleId || v.message).join('、')}`;
      } else {
        ext.guardrailCheck = '护栏检查通过，无违规';
      }
    }

    return ext;
  }

  /**
   * 提取关键发现
   */
  private extractKeyFindings(result: Omit<CognitionResult, 'narrative'>): string[] {
    const findings: string[] = [];
    const { dimensions, crossValidation, convergence } = result;

    // 从感知维提取
    if (dimensions.perception?.success) {
      const anomalyCount = dimensions.perception.data.anomalies.length;
      if (anomalyCount > 0) {
        findings.push(`检测到${anomalyCount}个异常信号`);
      }
      if (dimensions.perception.data.darkDataFlows.length > 0) {
        findings.push(`发现${dimensions.perception.data.darkDataFlows.length}个暗数据流`);
      }
    }

    // 从融合维提取
    if (dimensions.fusion?.success) {
      const { decision, confidence } = dimensions.fusion.data.dsFusionResult;
      if (decision !== 'unknown' && decision !== 'normal') {
        findings.push(`融合诊断：${decision}（置信度${(confidence * 100).toFixed(1)}%）`);
      }
      if (dimensions.fusion.data.conflictAnalysis.hasConflict) {
        findings.push(`证据冲突度：${(dimensions.fusion.data.conflictAnalysis.conflictDegree * 100).toFixed(1)}%`);
      }
    }

    // 交叉验证结果
    if (crossValidation.inconsistencies.length > 0) {
      findings.push(`${crossValidation.inconsistencies.length}处维度间不一致`);
    }

    // 收敛状态
    if (!convergence.converged) {
      findings.push(`认知未收敛（综合置信度${(convergence.overallConfidence * 100).toFixed(1)}%）`);
    }

    return findings;
  }

  /**
   * 提取建议行动
   */
  private extractSuggestedActions(result: Omit<CognitionResult, 'narrative'>): string[] {
    const actions: string[] = [];

    if (result.dimensions.decision?.success) {
      const topActions = result.dimensions.decision.data.recommendedActions.slice(0, 5);
      for (const action of topActions) {
        actions.push(`[${action.type}] ${action.description}`);
      }
    }

    // 如果未收敛，建议进一步调查
    if (!result.convergence.converged) {
      actions.push('[investigate] 认知未收敛，建议人工复核或触发链式认知');
    }

    return actions;
  }

  /**
   * 组合人类可读摘要
   */
  private composeHumanReadableSummary(
    phases: NarrativeSummary['phases'],
    keyFindings: string[],
    result: Omit<CognitionResult, 'narrative'>,
  ): string {
    const lines: string[] = [];

    lines.push(`【认知报告】 ${new Date().toISOString()}`);
    lines.push(`状态：${result.state} | 耗时：${result.totalDurationMs}ms | 模式：${result.degradationMode}`);
    lines.push('');

    lines.push(`▸ 好奇：${phases.curiosity}`);
    lines.push(`▸ 假设：${phases.hypothesis}`);
    lines.push(`▸ 实验：${phases.experiment}`);
    lines.push(`▸ 验证：${phases.verification}`);

    if (keyFindings.length > 0) {
      lines.push('');
      lines.push('关键发现：');
      for (const finding of keyFindings) {
        lines.push(`  · ${finding}`);
      }
    }

    lines.push('');
    lines.push(
      `综合置信度：${(result.convergence.overallConfidence * 100).toFixed(1)}% | ` +
      `收敛：${result.convergence.converged ? '是' : '否'} | ` +
      `一致性：${(result.crossValidation.consistencyScore * 100).toFixed(1)}%`,
    );

    return lines.join('\n');
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建默认叙事层 */
export function createNarrativeLayer(template?: Partial<NarrativeTemplate>): NarrativeLayer {
  return new NarrativeLayer(template);
}
