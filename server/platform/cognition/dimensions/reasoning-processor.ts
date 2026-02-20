/**
 * ============================================================================
 * 推演维处理器 — ReasoningProcessor
 * ============================================================================
 *
 * 认知闭环四维之二：推演维（假设引擎）
 *
 * 职责：
 *   1. 假设生成 — 基于感知维的异常信号，生成候选假设
 *   2. 因果推理 — 利用 KG 中的因果关系推导可能的根因
 *   3. 影子评估 — 对关键假设进行快速影子推演
 *   4. 假设排序 — 基于先验概率和证据需求排序
 *
 * 与平台现有组件的对接：
 *   - 使用 KG Orchestrator 查询因果关系
 *   - 使用 MetaLearner 获取历史经验
 *   - 结果传递给融合维进行证据整合
 *
 * 对应 v3.0 方案 U-15（推演维部分）
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import type { DimensionProcessor } from '../engines/cognition-unit';
import type {
  CognitionStimulus,
  ReasoningOutput,
  PerceptionOutput,
  DegradationMode,
} from '../types';

const log = createModuleLogger('reasoningProcessor');

// ============================================================================
// KG 查询适配器
// ============================================================================

/**
 * KG 查询适配器 — 查询知识图谱中的因果关系
 */
export interface KGQueryAdapter {
  /** 查询与异常类型相关的因果路径 */
  queryCausalPaths(anomalyType: string, maxDepth: number): Promise<CausalPath[]>;
  /** 查询历史相似案例 */
  querySimilarCases(anomalyType: string, topK: number): Promise<HistoricalCase[]>;
}

export interface CausalPath {
  from: string;
  to: string;
  strength: number;
  mechanism: string;
  evidenceCount: number;
}

export interface HistoricalCase {
  id: string;
  anomalyType: string;
  rootCause: string;
  resolution: string;
  confidence: number;
  occurredAt: Date;
}

// ============================================================================
// 推演维处理器配置
// ============================================================================

export interface ReasoningConfig {
  /** 最大假设数量 */
  maxHypotheses: number;
  /** 因果路径最大搜索深度 */
  maxCausalDepth: number;
  /** 历史案例最大查询数 */
  maxHistoricalCases: number;
  /** 影子评估场景数（快速模式） */
  quickShadowScenarios: number;
  /** 最小假设先验概率 */
  minPriorProbability: number;
  /** P1 修复：是否启用 LLM 增强推演 */
  enableLLMReasoning: boolean;
  /** LLM 推演的最大 token 数 */
  llmMaxTokens: number;
}

const DEFAULT_CONFIG: ReasoningConfig = {
  maxHypotheses: 10,
  maxCausalDepth: 5,
  maxHistoricalCases: 20,
  quickShadowScenarios: 50,
  minPriorProbability: 0.05,
  enableLLMReasoning: true,
  llmMaxTokens: 1024,
};

// ============================================================================
// 推演维处理器实现
// ============================================================================

export class ReasoningProcessor implements DimensionProcessor<ReasoningOutput> {
  readonly dimension = 'reasoning' as const;
  private readonly config: ReasoningConfig;
  private readonly kgAdapter: KGQueryAdapter;

  constructor(kgAdapter: KGQueryAdapter, config?: Partial<ReasoningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.kgAdapter = kgAdapter;
  }

  /**
   * 执行推演维处理
   *
   * @param stimulus 刺激信号
   * @param degradationMode 降级模式
   * @param perceptionOutput 感知维输出（用于指导假设方向）
   */
  async process(
    stimulus: CognitionStimulus,
    degradationMode: DegradationMode,
    perceptionOutput?: PerceptionOutput,
  ): Promise<ReasoningOutput> {
    const startTime = Date.now();

    try {
      // 1. 从感知维提取异常信号
      const anomalies = perceptionOutput?.success
        ? perceptionOutput.data.anomalies
        : [];

      // 2. 生成假设
      const hypotheses = await this.generateHypotheses(anomalies, stimulus);

      // 3. 因果推理（紧急模式下跳过）
      const causalPaths = degradationMode === 'emergency'
        ? []
        : await this.performCausalReasoning(anomalies);

      // 4. 影子评估（仅正常模式下执行）
      const shadowEvaluation = degradationMode === 'normal'
        ? await this.performQuickShadowEval(hypotheses)
        : undefined;

      // 5. 基于因果路径和历史案例更新假设概率
      this.updateHypothesisProbabilities(hypotheses, causalPaths);

      // 6. 排序并截断
      hypotheses.sort((a, b) => b.priorProbability - a.priorProbability);
      const filteredHypotheses = hypotheses
        .filter(h => h.priorProbability >= this.config.minPriorProbability)
        .slice(0, this.config.maxHypotheses);

      return {
        dimension: 'reasoning',
        success: true,
        durationMs: Date.now() - startTime,
        data: {
          hypotheses: filteredHypotheses,
          shadowEvaluation,
          causalPaths,
        },
      };
    } catch (err) {
      log.error({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Reasoning processing failed');

      return {
        dimension: 'reasoning',
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
        data: {
          hypotheses: [],
          causalPaths: [],
        },
      };
    }
  }

  // ==========================================================================
  // 核心算法
  // ==========================================================================

  /**
   * 假设生成
   *
   * 基于异常信号和 KG 历史案例，生成候选假设。
   */
  private async generateHypotheses(
    anomalies: PerceptionOutput['data']['anomalies'],
    stimulus: CognitionStimulus,
  ): Promise<ReasoningOutput['data']['hypotheses']> {
    const hypotheses: ReasoningOutput['data']['hypotheses'] = [];
    let hypothesisCounter = 0;

    // 策略 1：基于每个异常生成直接假设
    for (const anomaly of anomalies) {
      hypothesisCounter++;
      hypotheses.push({
        id: `hyp_${hypothesisCounter}`,
        description: `${anomaly.source} 异常可能由 ${anomaly.type} 引起`,
        priorProbability: anomaly.severity * 0.6, // 严重度越高，先验概率越高
        evidenceRequired: [
          `${anomaly.source} 的历史趋势数据`,
          `相关传感器的交叉验证数据`,
        ],
        estimatedImpact: anomaly.severity,
      });
    }

    // 策略 2：基于 KG 历史案例生成假设
    for (const anomaly of anomalies.slice(0, 3)) { // 只对前 3 个最严重的异常查询
      try {
        const historicalCases = await this.kgAdapter.querySimilarCases(
          anomaly.type,
          this.config.maxHistoricalCases,
        );

        for (const histCase of historicalCases.slice(0, 3)) {
          hypothesisCounter++;
          hypotheses.push({
            id: `hyp_${hypothesisCounter}`,
            description: `历史案例表明 ${anomaly.type} 的根因可能是 ${histCase.rootCause}`,
            priorProbability: histCase.confidence * 0.8,
            evidenceRequired: [
              `验证 ${histCase.rootCause} 是否在当前环境中成立`,
              `检查 ${histCase.resolution} 是否适用`,
            ],
            estimatedImpact: anomaly.severity * histCase.confidence,
          });
        }
      } catch (err) {
        log.warn({
          anomalyType: anomaly.type,
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to query historical cases');
      }
    }

    // 策略 3：基于刺激类型生成通用假设
    if (stimulus.type === 'drift_detected') {
      hypothesisCounter++;
      hypotheses.push({
        id: `hyp_${hypothesisCounter}`,
        description: '数据分布漂移可能由工况切换或环境变化引起',
        priorProbability: 0.4,
        evidenceRequired: [
          '最近的工况切换记录',
          '环境参数变化趋势',
        ],
        estimatedImpact: 0.6,
      });
    }

    if (stimulus.type === 'performance_degraded') {
      hypothesisCounter++;
      hypotheses.push({
        id: `hyp_${hypothesisCounter}`,
        description: '模型性能下降可能由训练数据与生产数据的分布差异引起',
        priorProbability: 0.5,
        evidenceRequired: [
          '训练集与生产数据的分布对比',
          '最近的标注质量报告',
        ],
        estimatedImpact: 0.7,
      });
    }

    // P1 修复：策略 4 — LLM 增强推演（异常关联分析和深层因果推理）
    if (this.config.enableLLMReasoning && anomalies.length > 0) {
      try {
        const llmHypotheses = await this.generateLLMHypotheses(anomalies, stimulus);
        for (const llmHyp of llmHypotheses) {
          hypothesisCounter++;
          hypotheses.push({
            ...llmHyp,
            id: `hyp_llm_${hypothesisCounter}`,
          });
        }
      } catch (err) {
        log.warn({
          error: err instanceof Error ? err.message : String(err),
        }, 'LLM 增强推演失败，降级为纯规则推演');
      }
    }

    return hypotheses;
  }

  /**
   * P1 修复：LLM 增强假设生成
   * 利用 LLM 的跨域知识进行深层因果推理，生成传统规则难以覆盖的假设
   */
  private async generateLLMHypotheses(
    anomalies: PerceptionOutput['data']['anomalies'],
    stimulus: CognitionStimulus,
  ): Promise<Array<Omit<ReasoningOutput['data']['hypotheses'][0], 'id'>>> {
    const anomalySummary = anomalies.slice(0, 5).map(a =>
      `- 来源: ${a.source}, 类型: ${a.type}, 严重度: ${(a.severity * 100).toFixed(0)}%`
    ).join('\n');

    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: '你是工业设备故障诊断专家。基于异常信号，生成可能的故障假设。'
            + '输出 JSON 数组，每个元素包含: description(假设描述), priorProbability(0-1), evidenceRequired(字符串数组), estimatedImpact(0-1)。'
            + '只输出 JSON，不要包含其他文字。最多生成 3 个假设。',
        },
        {
          role: 'user',
          content: `刺激类型: ${stimulus.type}\n异常信号:\n${anomalySummary}\n\n请生成故障假设：`,
        },
      ],
      maxTokens: this.config.llmMaxTokens,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const rawText = typeof rawContent === 'string' ? rawContent : '';

    try {
      const jsonMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          description: string;
          priorProbability: number;
          evidenceRequired: string[];
          estimatedImpact: number;
        }>;
        return parsed.map(h => ({
          description: `[LLM] ${h.description}`,
          priorProbability: Math.max(0.1, Math.min(0.9, h.priorProbability ?? 0.5)),
          evidenceRequired: h.evidenceRequired ?? [],
          estimatedImpact: Math.max(0.1, Math.min(1.0, h.estimatedImpact ?? 0.5)),
        }));
      }
    } catch {
      log.warn('LLM 假设解析失败，将原始文本作为单条假设');
    }

    // 解析失败时将原始文本作为单条假设
    return rawText.trim() ? [{
      description: `[LLM] ${rawText.slice(0, 200)}`,
      priorProbability: 0.4,
      evidenceRequired: ['需要人工验证 LLM 推理结果'],
      estimatedImpact: 0.5,
    }] : [];
  }

  /**
   * 因果推理 — 查询 KG 中的因果路径
   */
  private async performCausalReasoning(
    anomalies: PerceptionOutput['data']['anomalies'],
  ): Promise<ReasoningOutput['data']['causalPaths']> {
    const allPaths: CausalPath[] = [];

    for (const anomaly of anomalies.slice(0, 5)) {
      try {
        const paths = await this.kgAdapter.queryCausalPaths(
          anomaly.type,
          this.config.maxCausalDepth,
        );
        allPaths.push(...paths);
      } catch (err) {
        log.warn({
          anomalyType: anomaly.type,
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to query causal paths');
      }
    }

    // 去重并按强度排序
    const uniquePaths = this.deduplicatePaths(allPaths);
    uniquePaths.sort((a, b) => b.strength - a.strength);

    return uniquePaths.slice(0, 20);
  }

  /**
   * 快速影子评估 — 对关键假设进行简化的场景模拟
   */
  private async performQuickShadowEval(
    hypotheses: ReasoningOutput['data']['hypotheses'],
  ): Promise<ReasoningOutput['data']['shadowEvaluation'] | undefined> {
    if (hypotheses.length === 0) return undefined;

    // 简化的影子评估：基于假设的先验概率和影响估计，
    // 模拟最好/最坏/期望情况
    const scenarioCount = Math.min(this.config.quickShadowScenarios, hypotheses.length * 10);

    const bestCase: Record<string, number> = {};
    const worstCase: Record<string, number> = {};
    const expectedCase: Record<string, number> = {};

    for (const hyp of hypotheses) {
      // 最好情况：假设不成立
      bestCase[hyp.id] = 1 - hyp.priorProbability;
      // 最坏情况：假设成立且影响最大
      worstCase[hyp.id] = hyp.priorProbability * hyp.estimatedImpact;
      // 期望情况：概率加权
      expectedCase[hyp.id] = hyp.priorProbability * hyp.estimatedImpact * 0.5;
    }

    return {
      scenarioCount,
      bestCase,
      worstCase,
      expectedCase,
    };
  }

  /**
   * 更新假设概率 — 基于因果路径证据
   */
  private updateHypothesisProbabilities(
    hypotheses: ReasoningOutput['data']['hypotheses'],
    causalPaths: CausalPath[],
  ): void {
    for (const hyp of hypotheses) {
      // 查找支持该假设的因果路径
      const supportingPaths = causalPaths.filter(
        p => hyp.description.includes(p.from) || hyp.description.includes(p.to),
      );

      if (supportingPaths.length > 0) {
        // 有因果路径支持 → 提升先验概率
        const maxPathStrength = Math.max(...supportingPaths.map(p => p.strength));
        hyp.priorProbability = Math.min(
          0.95,
          hyp.priorProbability + (1 - hyp.priorProbability) * maxPathStrength * 0.3,
        );
      }
    }
  }

  /**
   * 因果路径去重
   */
  private deduplicatePaths(paths: CausalPath[]): CausalPath[] {
    const seen = new Set<string>();
    const unique: CausalPath[] = [];

    for (const path of paths) {
      const key = `${path.from}→${path.to}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(path);
      }
    }

    return unique;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createReasoningProcessor(
  kgAdapter: KGQueryAdapter,
  config?: Partial<ReasoningConfig>,
): ReasoningProcessor {
  return new ReasoningProcessor(kgAdapter, config);
}
