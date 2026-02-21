/**
 * ============================================================================
 * 推演维处理器 — ReasoningProcessor (Phase 2 增强版)
 * ============================================================================
 *
 * 认知闭环四维之二：推演维（假设引擎）
 *
 * Phase 2 增强：
 *   - Champion-Challenger Shadow Mode（旧引擎 vs HybridReasoningOrchestrator）
 *   - 自动晋升机制（100 次 + 5pp + p<0.05 + 延迟≤120% + 降级<3）
 *   - 完整决策日志持久化
 *   - 平滑降级到原有模板路径
 *
 * 职责：
 *   1. 假设生成 — 基于感知维的异常信号，生成候选假设
 *   2. 因果推理 — 利用 KG / BuiltinCausalGraph 推导可能的根因
 *   3. 影子评估 — 对关键假设进行快速影子推演
 *   4. 假设排序 — 基于先验概率和证据需求排序
 *   5. [Phase 2] 物理验证 + 经验检索 + 结构化推理
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import type { DimensionProcessor, DimensionContext } from '../engines/cognition-unit';
import type { GrokReasoningService } from '../grok/grok-reasoning.service';
import type {
  CognitionStimulus,
  ReasoningOutput,
  PerceptionOutput,
  DegradationMode,
} from '../types';
import type { HybridReasoningOrchestrator } from '../reasoning/orchestrator/hybrid-orchestrator';
import type { OrchestratorResult } from '../reasoning/reasoning.types';

const log = createModuleLogger('reasoningProcessor');

// ============================================================================
// KG 查询适配器
// ============================================================================

export interface KGQueryAdapter {
  queryCausalPaths(anomalyType: string, maxDepth: number): Promise<CausalPath[]>;
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
// Shadow Mode 统计
// ============================================================================

interface ShadowStats {
  totalSessions: number;
  championHits: number;
  challengerHits: number;
  challengerFallbacks: number;
  avgChampionLatency: number;
  avgChallengerLatency: number;
  /** 累计延迟比（Challenger / Champion） */
  latencyRatioSum: number;
}

interface PromotionCriteria {
  /** 最少会话数 */
  minSessions: number;
  /** 命中率提升最少百分点 */
  minHitRateImprovement: number;
  /** p 值阈值（Fisher 精确检验近似） */
  maxPValue: number;
  /** 延迟比上限 */
  maxLatencyRatio: number;
  /** 最大降级次数 */
  maxFallbacks: number;
}

const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minSessions: 100,
  minHitRateImprovement: 0.05,
  maxPValue: 0.05,
  maxLatencyRatio: 1.2,
  maxFallbacks: 3,
};

// ============================================================================
// 推演维处理器配置
// ============================================================================

export interface ReasoningConfig {
  maxHypotheses: number;
  maxCausalDepth: number;
  maxHistoricalCases: number;
  quickShadowScenarios: number;
  minPriorProbability: number;
  enableLLMReasoning: boolean;
  llmMaxTokens: number;
  enableGrokDeepReasoning: boolean;
  /** Phase 2: Shadow Mode 开关 */
  enableShadowMode: boolean;
  /** Phase 2: 是否已晋升（Challenger 成为主引擎） */
  challengerPromoted: boolean;
  /** Phase 2: 晋升标准 */
  promotionCriteria: PromotionCriteria;
}

const DEFAULT_CONFIG: ReasoningConfig = {
  maxHypotheses: 10,
  maxCausalDepth: 5,
  maxHistoricalCases: 20,
  quickShadowScenarios: 50,
  minPriorProbability: 0.05,
  enableLLMReasoning: true,
  llmMaxTokens: 1024,
  enableGrokDeepReasoning: false,
  enableShadowMode: true,
  challengerPromoted: false,
  promotionCriteria: DEFAULT_PROMOTION_CRITERIA,
};

// ============================================================================
// 推演维处理器实现
// ============================================================================

export class ReasoningProcessor implements DimensionProcessor<ReasoningOutput> {
  readonly dimension = 'reasoning' as const;
  private readonly config: ReasoningConfig;
  private readonly kgAdapter: KGQueryAdapter;
  private grokService?: GrokReasoningService;

  /** Phase 2: HybridReasoningOrchestrator 实例 */
  private orchestrator?: HybridReasoningOrchestrator;
  /** Phase 2: Shadow Mode 统计 */
  private shadowStats: ShadowStats = {
    totalSessions: 0,
    championHits: 0,
    challengerHits: 0,
    challengerFallbacks: 0,
    avgChampionLatency: 0,
    avgChallengerLatency: 0,
    latencyRatioSum: 0,
  };
  /** Phase 2: Shadow 对比日志回调 */
  private onShadowComparison?: (comparison: ShadowComparisonRecord) => Promise<void>;

  constructor(kgAdapter: KGQueryAdapter, config?: Partial<ReasoningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.kgAdapter = kgAdapter;
  }

  /** v5.0: 注入 Grok 推理服务 */
  setGrokService(service: GrokReasoningService): void {
    this.grokService = service;
    this.config.enableGrokDeepReasoning = true;
  }

  /** Phase 2: 注入 HybridReasoningOrchestrator */
  setOrchestrator(orchestrator: HybridReasoningOrchestrator): void {
    this.orchestrator = orchestrator;
    log.info('HybridReasoningOrchestrator injected — Shadow Mode enabled');
  }

  /** Phase 2: 注册 Shadow 对比日志回调 */
  onShadowCompare(callback: (record: ShadowComparisonRecord) => Promise<void>): void {
    this.onShadowComparison = callback;
  }

  /** Phase 2: 获取当前 Shadow 统计 */
  getShadowStats(): ShadowStats & { mode: 'champion' | 'challenger' | 'shadow' } {
    const mode = this.config.challengerPromoted
      ? 'challenger'
      : (this.config.enableShadowMode && this.orchestrator ? 'shadow' : 'champion');
    return { ...this.shadowStats, mode };
  }

  /** Phase 2: 手动触发晋升检查 */
  checkPromotion(): PromotionCheckResult {
    return this.evaluatePromotion();
  }

  /** Phase 2: 手动强制晋升 */
  forcePromote(): void {
    this.config.challengerPromoted = true;
    log.info({
      totalSessions: this.shadowStats.totalSessions,
    }, 'Challenger force-promoted to primary engine');
  }

  /** Phase 2: 手动回退到 Champion */
  forceRollback(): void {
    this.config.challengerPromoted = false;
    log.info('Rolled back to Champion engine');
  }

  // ==========================================================================
  // 主入口
  // ==========================================================================

  async process(
    stimulus: CognitionStimulus,
    context: DimensionContext,
  ): Promise<ReasoningOutput> {
    const degradationMode = context.degradationMode;
    const perceptionOutput = context.completedDimensions.get('perception') as PerceptionOutput | undefined;
    const startTime = Date.now();

    // Phase 2: 如果 Challenger 已晋升，直接使用 Orchestrator
    if (this.config.challengerPromoted && this.orchestrator) {
      return this.runChallengerAsPrimary(stimulus, perceptionOutput, degradationMode, startTime);
    }

    // Phase 2: Shadow Mode — 同时运行 Champion 和 Challenger
    if (this.config.enableShadowMode && this.orchestrator) {
      return this.runShadowMode(stimulus, context, perceptionOutput, degradationMode, startTime);
    }

    // 原有 Champion 路径
    return this.runChampion(stimulus, perceptionOutput, degradationMode, startTime);
  }

  // ==========================================================================
  // Phase 2: Shadow Mode 执行
  // ==========================================================================

  /**
   * Shadow Mode — Champion 结果返回给调用方，Challenger 在后台异步执行
   */
  private async runShadowMode(
    stimulus: CognitionStimulus,
    context: DimensionContext,
    perceptionOutput: PerceptionOutput | undefined,
    degradationMode: DegradationMode,
    startTime: number,
  ): Promise<ReasoningOutput> {
    // Champion 同步执行
    const championResult = await this.runChampion(stimulus, perceptionOutput, degradationMode, startTime);

    // Challenger 异步执行（不阻塞主流程）
    this.runChallengerInBackground(stimulus, perceptionOutput, championResult).catch(err => {
      log.warn({
        error: err instanceof Error ? err.message : String(err),
      }, 'Shadow challenger execution failed');
    });

    return championResult;
  }

  /**
   * 后台异步运行 Challenger 并记录对比结果
   */
  private async runChallengerInBackground(
    stimulus: CognitionStimulus,
    perceptionOutput: PerceptionOutput | undefined,
    championResult: ReasoningOutput,
  ): Promise<void> {
    if (!this.orchestrator) return;

    const challengerStart = Date.now();
    let challengerResult: OrchestratorResult | null = null;

    try {
      // 5s 超时保护
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000),
      );

      challengerResult = await Promise.race([
        this.orchestrator.orchestrate(
          stimulus,
          perceptionOutput,
          0.5, // deviceImportance 默认中等
          0.3, // currentLoad 默认低负载
        ),
        timeoutPromise,
      ]);
    } catch (err) {
      this.shadowStats.challengerFallbacks++;
      log.warn({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Challenger failed in shadow mode');
      return;
    }

    const challengerDuration = Date.now() - challengerStart;

    if (!challengerResult) {
      this.shadowStats.challengerFallbacks++;
      log.warn({ stimulusId: stimulus.id }, 'Challenger timed out in shadow mode');
      return;
    }

    // 更新统计
    this.shadowStats.totalSessions++;
    const championDuration = championResult.durationMs;
    this.shadowStats.avgChampionLatency =
      (this.shadowStats.avgChampionLatency * (this.shadowStats.totalSessions - 1) + championDuration)
      / this.shadowStats.totalSessions;
    this.shadowStats.avgChallengerLatency =
      (this.shadowStats.avgChallengerLatency * (this.shadowStats.totalSessions - 1) + challengerDuration)
      / this.shadowStats.totalSessions;
    this.shadowStats.latencyRatioSum += (championDuration > 0 ? challengerDuration / championDuration : 1);

    // 记录对比（命中率需要人工标注后更新）
    const comparison: ShadowComparisonRecord = {
      sessionId: stimulus.id,
      championResult: {
        hypothesis: championResult.data.hypotheses[0]?.description ?? 'none',
        confidence: championResult.data.hypotheses[0]?.priorProbability ?? 0,
        durationMs: championDuration,
      },
      challengerResult: {
        hypothesis: challengerResult.hypotheses[0]?.description ?? 'none',
        confidence: challengerResult.hypotheses[0]?.confidence ?? 0,
        durationMs: challengerDuration,
        route: challengerResult.route,
        grokUsed: challengerResult.grokUsed,
      },
      latencyRatio: championDuration > 0 ? challengerDuration / championDuration : 1,
      createdAt: new Date(),
    };

    // 持久化回调
    if (this.onShadowComparison) {
      try {
        await this.onShadowComparison(comparison);
      } catch (err) {
        log.warn({
          error: err instanceof Error ? err.message : String(err),
        }, 'Failed to persist shadow comparison');
      }
    }

    // 自动晋升检查
    if (this.shadowStats.totalSessions >= this.config.promotionCriteria.minSessions) {
      const promotion = this.evaluatePromotion();
      if (promotion.shouldPromote) {
        this.config.challengerPromoted = true;
        log.info({
          ...promotion,
          totalSessions: this.shadowStats.totalSessions,
        }, '🎉 Challenger auto-promoted to primary engine!');
      }
    }
  }

  /**
   * 晋升评估 — 5 项硬性指标
   */
  private evaluatePromotion(): PromotionCheckResult {
    const s = this.shadowStats;
    const c = this.config.promotionCriteria;

    const championHitRate = s.totalSessions > 0 ? s.championHits / s.totalSessions : 0;
    const challengerHitRate = s.totalSessions > 0 ? s.challengerHits / s.totalSessions : 0;
    const hitRateImprovement = challengerHitRate - championHitRate;
    const avgLatencyRatio = s.totalSessions > 0 ? s.latencyRatioSum / s.totalSessions : 1;

    // Fisher 精确检验近似（正态近似 z-test）
    const pValue = this.computePValue(
      s.challengerHits, s.totalSessions,
      s.championHits, s.totalSessions,
    );

    const checks = {
      minSessions: s.totalSessions >= c.minSessions,
      hitRateImprovement: hitRateImprovement >= c.minHitRateImprovement,
      pValue: pValue <= c.maxPValue,
      latencyRatio: avgLatencyRatio <= c.maxLatencyRatio,
      fallbacks: s.challengerFallbacks <= c.maxFallbacks,
    };

    const shouldPromote = Object.values(checks).every(Boolean);

    return {
      shouldPromote,
      checks,
      metrics: {
        championHitRate,
        challengerHitRate,
        hitRateImprovement,
        pValue,
        avgLatencyRatio,
        fallbacks: s.challengerFallbacks,
        totalSessions: s.totalSessions,
      },
    };
  }

  /**
   * 两比例 z-test p 值计算
   */
  private computePValue(
    successes1: number, n1: number,
    successes2: number, n2: number,
  ): number {
    if (n1 === 0 || n2 === 0) return 1;
    const p1 = successes1 / n1;
    const p2 = successes2 / n2;
    const pPooled = (successes1 + successes2) / (n1 + n2);
    if (pPooled === 0 || pPooled === 1) return 1;
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
    if (se === 0) return 1;
    const z = (p1 - p2) / se;
    // 单侧 p 值（Challenger > Champion）
    return 1 - this.normalCDF(z);
  }

  /** 标准正态 CDF 近似（Abramowitz & Stegun） */
  private normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
    return 0.5 * (1.0 + sign * y);
  }

  // ==========================================================================
  // Phase 2: Challenger 作为主引擎
  // ==========================================================================

  /**
   * Challenger 晋升后直接作为主推理引擎
   */
  private async runChallengerAsPrimary(
    stimulus: CognitionStimulus,
    perceptionOutput: PerceptionOutput | undefined,
    degradationMode: DegradationMode,
    startTime: number,
  ): Promise<ReasoningOutput> {
    if (!this.orchestrator) {
      // 降级到 Champion
      return this.runChampion(stimulus, perceptionOutput, degradationMode, startTime);
    }

    try {
      // 全局 8s 超时保护
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 8000),
      );

      const result = await Promise.race([
        this.orchestrator.orchestrate(
          stimulus,
          perceptionOutput,
          0.5, // deviceImportance 默认中等
          0.3, // currentLoad 默认低负载
        ),
        timeoutPromise,
      ]);

      if (!result) {
        log.warn({ stimulusId: stimulus.id }, 'Orchestrator timed out, falling back to Champion');
        return this.runChampion(stimulus, perceptionOutput, degradationMode, startTime);
      }

      // 将 OrchestratorResult 转换为 ReasoningOutput
      return this.convertOrchestratorResult(result, startTime);
    } catch (err) {
      log.error({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Orchestrator failed, falling back to Champion');
      return this.runChampion(stimulus, perceptionOutput, degradationMode, startTime);
    }
  }

  /**
   * OrchestratorResult → ReasoningOutput 适配
   */
  private convertOrchestratorResult(
    result: OrchestratorResult,
    startTime: number,
  ): ReasoningOutput {
    // 将 Orchestrator 的假设列表转换为 ReasoningOutput 格式
    const hypotheses: ReasoningOutput['data']['hypotheses'] = result.hypotheses.map((h, i) => ({
      id: `hyp_orch_${i + 1}`,
      description: `${h.description}${h.physicsVerified ? ' [物理验证✓]' : ''}`,
      priorProbability: h.confidence,
      evidenceRequired: h.sources ?? [],
      estimatedImpact: h.confidence,
    }));

    // 因果路径 — 从 explanationGraph 中提取
    const graphPaths = (result.explanationGraph as any)?.causalPaths as Array<{
      from: string; to: string; weight: number; mechanisms: string[];
    }> | undefined;
    const causalPaths: ReasoningOutput['data']['causalPaths'] = graphPaths?.map(p => ({
      from: p.from ?? '',
      to: p.to ?? '',
      strength: p.weight ?? 0,
      mechanism: (p.mechanisms ?? []).join(' → '),
    })) ?? [];

    return {
      dimension: 'reasoning',
      success: true,
      durationMs: Date.now() - startTime,
      data: {
        hypotheses,
        causalPaths,
      } as ReasoningOutput['data'],
    };
  }

  // ==========================================================================
  // Champion 路径（原有逻辑）
  // ==========================================================================

  private async runChampion(
    stimulus: CognitionStimulus,
    perceptionOutput: PerceptionOutput | undefined,
    degradationMode: DegradationMode,
    startTime: number,
  ): Promise<ReasoningOutput> {
    try {
      const anomalies = perceptionOutput?.success
        ? perceptionOutput.data.anomalies
        : [];

      const hypotheses = await this.generateHypotheses(anomalies, stimulus);

      const causalPaths: ReasoningOutput['data']['causalPaths'] = degradationMode === 'emergency'
        ? []
        : (await this.performCausalReasoning(anomalies)).map(p => ({
            from: p.from, to: p.to, strength: p.strength, mechanism: p.mechanism,
          }));

      const shadowEvaluation = degradationMode === 'normal'
        ? await this.performQuickShadowEval(hypotheses)
        : undefined;

      this.updateHypothesisProbabilities(hypotheses, causalPaths as any);

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
  // 核心算法（Champion 路径）
  // ==========================================================================

  private async generateHypotheses(
    anomalies: PerceptionOutput['data']['anomalies'],
    stimulus: CognitionStimulus,
  ): Promise<ReasoningOutput['data']['hypotheses']> {
    const hypotheses: ReasoningOutput['data']['hypotheses'] = [];
    let counter = 0;

    // 策略 1：基于每个异常生成直接假设
    for (const anomaly of anomalies) {
      counter++;
      hypotheses.push({
        id: `hyp_${counter}`,
        description: `${anomaly.source} 异常可能由 ${anomaly.type} 引起`,
        priorProbability: anomaly.severity * 0.6,
        evidenceRequired: [
          `${anomaly.source} 的历史趋势数据`,
          `相关传感器的交叉验证数据`,
        ],
        estimatedImpact: anomaly.severity,
      });
    }

    // 策略 2：基于 KG 历史案例生成假设
    for (const anomaly of anomalies.slice(0, 3)) {
      try {
        const historicalCases = await this.kgAdapter.querySimilarCases(
          anomaly.type,
          this.config.maxHistoricalCases,
        );
        for (const histCase of historicalCases.slice(0, 3)) {
          counter++;
          hypotheses.push({
            id: `hyp_${counter}`,
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
    if (stimulus.type === 'drift_alert') {
      counter++;
      hypotheses.push({
        id: `hyp_${counter}`,
        description: '数据分布漂移可能由工况切换或环境变化引起',
        priorProbability: 0.4,
        evidenceRequired: ['最近的工况切换记录', '环境参数变化趋势'],
        estimatedImpact: 0.6,
      });
    }

    if (stimulus.type === 'model_evaluation') {
      counter++;
      hypotheses.push({
        id: `hyp_${counter}`,
        description: '模型性能下降可能由训练数据与生产数据的分布差异引起',
        priorProbability: 0.5,
        evidenceRequired: ['训练集与生产数据的分布对比', '最近的标注质量报告'],
        estimatedImpact: 0.7,
      });
    }

    // v5.0: 策略 4 — Grok 深度推理 / LLM 增强推演
    if (this.config.enableGrokDeepReasoning && this.grokService && anomalies.length > 0) {
      try {
        const grokResult = await this.grokService.diagnose({
          question: `分析以下异常的根因和影响：${anomalies.slice(0, 3).map(a => `${a.source}/${a.type}(严重度${(a.severity * 100).toFixed(0)}%)`).join('; ')}`,
        } as any);
        if ((grokResult as any).reasoning?.steps) {
          for (const step of ((grokResult as any).reasoning.steps as any[]).slice(0, 3)) {
            counter++;
            hypotheses.push({
              id: `hyp_grok_${counter}`,
              description: `[Grok-ReAct] ${String(step.thought).slice(0, 200)}`,
              priorProbability: 0.6 + (step.toolResult ? 0.2 : 0),
              evidenceRequired: step.toolName ? [`工具验证: ${step.toolName}`] : ['需要人工确认'],
              estimatedImpact: 0.7,
            });
          }
        }
      } catch (err) {
        log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Grok reasoning failed, falling back to LLM');
        if (this.config.enableLLMReasoning && anomalies.length > 0) {
          try {
            const llmHypotheses = await this.generateLLMHypotheses(anomalies, stimulus);
            for (const llmHyp of llmHypotheses) {
              counter++;
              hypotheses.push({ ...llmHyp, id: `hyp_llm_${counter}` });
            }
          } catch (e2) {
            log.warn({ error: e2 instanceof Error ? e2.message : String(e2) }, 'LLM fallback also failed');
          }
        }
      }
    } else if (this.config.enableLLMReasoning && anomalies.length > 0) {
      try {
        const llmHypotheses = await this.generateLLMHypotheses(anomalies, stimulus);
        for (const llmHyp of llmHypotheses) {
          counter++;
          hypotheses.push({ ...llmHyp, id: `hyp_llm_${counter}` });
        }
      } catch (err) {
        log.warn({
          error: err instanceof Error ? err.message : String(err),
        }, 'LLM 增强推演失败，降级为纯规则推演');
      }
    }

    return hypotheses;
  }

  private async generateLLMHypotheses(
    anomalies: PerceptionOutput['data']['anomalies'],
    stimulus: CognitionStimulus,
  ): Promise<Array<Omit<ReasoningOutput['data']['hypotheses'][0], 'id'>>> {
    const anomalySummary = anomalies.slice(0, 5).map(a =>
      `- 来源: ${a.source}, 类型: ${a.type}, 严重度: ${(a.severity * 100).toFixed(0)}%`,
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

    return rawText.trim() ? [{
      description: `[LLM] ${rawText.slice(0, 200)}`,
      priorProbability: 0.4,
      evidenceRequired: ['需要人工验证 LLM 推理结果'],
      estimatedImpact: 0.5,
    }] : [];
  }

  private async performCausalReasoning(
    anomalies: PerceptionOutput['data']['anomalies'],
  ): Promise<CausalPath[]> {
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

    const uniquePaths = this.deduplicatePaths(allPaths);
    uniquePaths.sort((a, b) => b.strength - a.strength);
    return uniquePaths.slice(0, 20);
  }

  private async performQuickShadowEval(
    hypotheses: ReasoningOutput['data']['hypotheses'],
  ): Promise<ReasoningOutput['data']['shadowEvaluation'] | undefined> {
    if (hypotheses.length === 0) return undefined;

    const scenarioCount = Math.min(this.config.quickShadowScenarios, hypotheses.length * 10);
    const bestCase: Record<string, number> = {};
    const worstCase: Record<string, number> = {};
    const expectedCase: Record<string, number> = {};

    for (const hyp of hypotheses) {
      bestCase[hyp.id] = 1 - hyp.priorProbability;
      worstCase[hyp.id] = hyp.priorProbability * hyp.estimatedImpact;
      expectedCase[hyp.id] = hyp.priorProbability * hyp.estimatedImpact * 0.5;
    }

    return { scenarioCount, bestCase, worstCase, expectedCase };
  }

  private updateHypothesisProbabilities(
    hypotheses: ReasoningOutput['data']['hypotheses'],
    causalPaths: CausalPath[],
  ): void {
    for (const hyp of hypotheses) {
      const supportingPaths = causalPaths.filter(
        p => hyp.description.includes(p.from) || hyp.description.includes(p.to),
      );
      if (supportingPaths.length > 0) {
        const maxPathStrength = Math.max(...supportingPaths.map(p => p.strength));
        hyp.priorProbability = Math.min(
          0.95,
          hyp.priorProbability + (1 - hyp.priorProbability) * maxPathStrength * 0.3,
        );
      }
    }
  }

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
// Phase 2 类型定义
// ============================================================================

export interface ShadowComparisonRecord {
  sessionId: string;
  championResult: {
    hypothesis: string;
    confidence: number;
    durationMs: number;
  };
  challengerResult: {
    hypothesis: string;
    confidence: number;
    durationMs: number;
    route: string;
    grokUsed: boolean;
  };
  groundTruth?: string;
  championHit?: boolean;
  challengerHit?: boolean;
  latencyRatio: number;
  createdAt: Date;
}

export interface PromotionCheckResult {
  shouldPromote: boolean;
  checks: {
    minSessions: boolean;
    hitRateImprovement: boolean;
    pValue: boolean;
    latencyRatio: boolean;
    fallbacks: boolean;
  };
  metrics: {
    championHitRate: number;
    challengerHitRate: number;
    hitRateImprovement: number;
    pValue: number;
    avgLatencyRatio: number;
    fallbacks: number;
    totalSessions: number;
  };
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
