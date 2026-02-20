/**
 * ============================================================================
 * CognitionUnit — 认知活动执行单元
 * ============================================================================
 *
 * 一次完整的认知活动，由触发信号激活，执行以下流程：
 *   1. 预处理（StimulusPreprocessor）
 *   2. 四维并行处理（感知/推演/融合/决策）
 *   3. 交叉验证
 *   4. 收敛决策
 *   5. 动作执行
 *   6. 叙事生成（NarrativeLayer）
 *
 * 设计原则：
 *   - 每个 CognitionUnit 是一次性的（执行后不可复用）
 *   - 四维并行处理通过 Promise.allSettled 实现
 *   - 状态流转通过 CognitionStateMachine 管理
 *   - 所有事件通过 CognitionEventEmitter 发布
 *   - 支持超时和降级
 */

import { createModuleLogger } from '../../../core/logger';
import { CognitionStateMachine } from './cognition-state-machine';
import { getCognitionEventEmitter } from '../events/emitter';
import type {
  CognitionStimulus,
  CognitionResult,
  CognitionDimension,
  DimensionOutput,
  PerceptionOutput,
  ReasoningOutput,
  FusionOutput,
  DecisionOutput,
  DegradationMode,
  NarrativeSummary,
} from '../types';

const log = createModuleLogger('cognitionUnit');

// ============================================================================
// 维度处理器接口
// ============================================================================

/**
 * 维度处理器 — 每个认知维度必须实现此接口
 */
export interface DimensionProcessor<T extends DimensionOutput = DimensionOutput> {
  readonly dimension: CognitionDimension;
  /**
   * 执行维度处理
   * @param stimulus 认知刺激
   * @param context 共享上下文（其他维度的中间结果）
   */
  process(stimulus: CognitionStimulus, context: DimensionContext): Promise<T>;
}

/**
 * 维度共享上下文 — 用于维度间交叉引用
 */
export interface DimensionContext {
  /** 已完成的维度输出 */
  completedDimensions: Map<CognitionDimension, DimensionOutput>;
  /** 工况配置 */
  ocProfileId?: string;
  /** 设备树节点ID */
  nodeId?: string;
  /** @deprecated 使用 nodeId 代替 */
  deviceId?: string;
  /** 降级模式 */
  degradationMode: DegradationMode;
}

/**
 * 刺激预处理器接口
 */
export interface StimulusPreprocessor {
  /**
   * 预处理刺激信号
   * 包括：高熵维度识别、暗数据流发现、事件流摘要
   */
  preprocess(stimulus: CognitionStimulus): Promise<CognitionStimulus>;
}

/**
 * 叙事生成器接口
 */
export interface NarrativeGenerator {
  /**
   * 根据认知结果生成叙事摘要
   */
  generate(result: Omit<CognitionResult, 'narrative'>): NarrativeSummary;
}

// ============================================================================
// CognitionUnit 配置
// ============================================================================

export interface CognitionUnitConfig {
  /** 总超时时间（毫秒） */
  timeoutMs: number;
  /** 单维度超时时间（毫秒） */
  dimensionTimeoutMs: number;
  /** 交叉验证一致性阈值 [0, 1] */
  crossValidationThreshold: number;
  /** 最大收敛迭代次数 */
  maxConvergenceIterations: number;
  /** 收敛置信度阈值 [0, 1] */
  convergenceConfidenceThreshold: number;
  /** 当前降级模式 */
  degradationMode: DegradationMode;
}

const DEFAULT_CONFIG: CognitionUnitConfig = {
  timeoutMs: 60_000,
  dimensionTimeoutMs: 15_000,
  crossValidationThreshold: 0.6,
  maxConvergenceIterations: 3,
  convergenceConfidenceThreshold: 0.7,
  degradationMode: 'normal',
};

// ============================================================================
// CognitionUnit 实现
// ============================================================================

export class CognitionUnit {
  private readonly id: string;
  private readonly stimulus: CognitionStimulus;
  private readonly config: CognitionUnitConfig;
  private readonly stateMachine: CognitionStateMachine;
  private readonly emitter = getCognitionEventEmitter();

  // 维度处理器
  private perceptionProcessor?: DimensionProcessor<PerceptionOutput>;
  private reasoningProcessor?: DimensionProcessor<ReasoningOutput>;
  private fusionProcessor?: DimensionProcessor<FusionOutput>;
  private decisionProcessor?: DimensionProcessor<DecisionOutput>;

  // 可选组件
  private preprocessor?: StimulusPreprocessor;
  private narrativeGenerator?: NarrativeGenerator;

  // ========== v5.0 进化模块钩子 ==========
  /** Grok 推理服务（在 reasoning 维度完成后触发深度推理） */
  private grokReasoningHook?: (stimulus: CognitionStimulus, reasoningOutput: ReasoningOutput) => Promise<{ enhancedHypotheses?: any[]; toolCallResults?: any[] }>;
  /** WorldModel 预测钩子（在感知维度完成后触发状态预测） */
  private worldModelHook?: (stimulus: CognitionStimulus, perceptionOutput: PerceptionOutput) => Promise<{ predictions?: any[]; anomalyPredict?: any[] }>;
  /** Guardrail 护栏钩子（在决策维度完成后触发护栏检查） */
  private guardrailHook?: (stimulus: CognitionStimulus, decisionOutput: DecisionOutput) => Promise<{ blocked: boolean; violations?: any[]; adjustedActions?: any[] }>;
  /** 进化飞轮反馈钩子（认知完成后将结果反馈给飞轮） */
  private evolutionFeedbackHook?: (result: CognitionResult) => Promise<void>;

  // 执行状态
  private startedAt?: Date;
  private completedAt?: Date;
  private result?: CognitionResult;
  private executed = false;

  constructor(
    id: string,
    stimulus: CognitionStimulus,
    config?: Partial<CognitionUnitConfig>,
  ) {
    this.id = id;
    this.stimulus = stimulus;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateMachine = new CognitionStateMachine('idle');
  }

  // ==========================================================================
  // 组件注册
  // ==========================================================================

  setPerceptionProcessor(processor: DimensionProcessor<PerceptionOutput>): this {
    this.perceptionProcessor = processor;
    return this;
  }

  setReasoningProcessor(processor: DimensionProcessor<ReasoningOutput>): this {
    this.reasoningProcessor = processor;
    return this;
  }

  setFusionProcessor(processor: DimensionProcessor<FusionOutput>): this {
    this.fusionProcessor = processor;
    return this;
  }

  setDecisionProcessor(processor: DimensionProcessor<DecisionOutput>): this {
    this.decisionProcessor = processor;
    return this;
  }

  setPreprocessor(preprocessor: StimulusPreprocessor): this {
    this.preprocessor = preprocessor;
    return this;
  }

  setNarrativeGenerator(generator: NarrativeGenerator): this {
    this.narrativeGenerator = generator;
    return this;
  }

  // ========== v5.0 进化模块钩子注册 ==========

  setGrokReasoningHook(hook: CognitionUnit['grokReasoningHook']): this {
    this.grokReasoningHook = hook;
    return this;
  }

  setWorldModelHook(hook: CognitionUnit['worldModelHook']): this {
    this.worldModelHook = hook;
    return this;
  }

  setGuardrailHook(hook: CognitionUnit['guardrailHook']): this {
    this.guardrailHook = hook;
    return this;
  }

  setEvolutionFeedbackHook(hook: CognitionUnit['evolutionFeedbackHook']): this {
    this.evolutionFeedbackHook = hook;
    return this;
  }

  // ==========================================================================
  // 执行
  // ==========================================================================

  /**
   * 执行认知活动 — 核心方法
   *
   * 流程：
   *   idle → stimulus_received → preprocessing → dimensions_running
   *     → cross_validating → converging → action_executing
   *     → narrative_generating → completed
   */
  async execute(): Promise<CognitionResult> {
    if (this.executed) {
      throw new Error(`CognitionUnit ${this.id} has already been executed`);
    }
    this.executed = true;
    this.startedAt = new Date();

    log.info({ unitId: this.id, stimulusId: this.stimulus.id }, 'CognitionUnit starting');

    // 设置总超时
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('CognitionUnit timeout')), this.config.timeoutMs);
    });

    try {
      const resultPromise = this.executeInternal();
      this.result = await Promise.race([resultPromise, timeoutPromise]);
      return this.result;
    } catch (err) {
      return this.handleError(err);
    }
  }

  /** 获取执行结果 */
  getResult(): CognitionResult | undefined {
    return this.result;
  }

  /** 获取状态机 */
  getStateMachine(): CognitionStateMachine {
    return this.stateMachine;
  }

  // ==========================================================================
  // 内部执行流程
  // ==========================================================================

  private async executeInternal(): Promise<CognitionResult> {
    // Step 1: 接收刺激
    this.stateMachine.transition('STIMULUS_ARRIVED');
    this.emitter.emitUnitActivated({
      stimulusId: this.stimulus.id,
      stimulus: this.stimulus,
      activatedAt: this.startedAt!,
    });

    // Step 2: 预处理
    let processedStimulus = this.stimulus;
    if (this.preprocessor) {
      processedStimulus = await this.preprocessor.preprocess(this.stimulus);
    }
    this.stateMachine.transition('PREPROCESS_DONE');

    // Step 3: 四维并行处理
    this.stateMachine.transition('DIMENSIONS_STARTED');
    const dimensionOutputs = await this.executeDimensions(processedStimulus);
    this.stateMachine.transition('DIMENSIONS_DONE');

    // Step 4: 交叉验证
    const crossValidation = this.crossValidate(dimensionOutputs);
    this.stateMachine.transition('CROSS_VALIDATION_DONE');
    this.emitter.emitCrossValidationDone({
      stimulusId: this.stimulus.id,
      consistencyScore: crossValidation.consistencyScore,
      completedAt: new Date(),
    });

    // Step 5: 收敛决策
    const convergence = this.converge(dimensionOutputs, crossValidation);
    this.stateMachine.transition('CONVERGENCE_DONE');
    this.emitter.emitConvergenceDone({
      stimulusId: this.stimulus.id,
      converged: convergence.converged,
      iterations: convergence.iterations,
      overallConfidence: convergence.overallConfidence,
      completedAt: new Date(),
    });

    // Step 6: v5.0 进化钩子执行
    await this.executeEvolutionHooks(dimensionOutputs, processedStimulus);
    this.stateMachine.transition('ACTION_DONE');

    // Step 7: 叙事生成
    this.completedAt = new Date();
    const partialResult: Omit<CognitionResult, 'narrative'> = {
      id: this.id,
      stimulusId: this.stimulus.id,
      state: 'completed',
      dimensions: {
        perception: dimensionOutputs.get('perception') as PerceptionOutput | undefined,
        reasoning: dimensionOutputs.get('reasoning') as ReasoningOutput | undefined,
        fusion: dimensionOutputs.get('fusion') as FusionOutput | undefined,
        decision: dimensionOutputs.get('decision') as DecisionOutput | undefined,
      },
      crossValidation,
      convergence,
      totalDurationMs: this.completedAt.getTime() - this.startedAt!.getTime(),
      startedAt: this.startedAt!,
      completedAt: this.completedAt,
      degradationMode: this.config.degradationMode,
    };

    let narrative: NarrativeSummary | undefined;
    if (this.narrativeGenerator) {
      narrative = this.narrativeGenerator.generate(partialResult);
      this.emitter.emitNarrativeGenerated({
        stimulusId: this.stimulus.id,
        narrative,
        generatedAt: new Date(),
      });
    }
    this.stateMachine.transition('NARRATIVE_DONE');

    const finalResult: CognitionResult = {
      ...partialResult,
      narrative,
    };

    this.emitter.emitUnitCompleted({
      resultId: this.id,
      stimulusId: this.stimulus.id,
      result: finalResult,
      completedAt: this.completedAt,
    });

    // Step 8: v5.0 进化飞轮反馈（异步非阻塞）
    if (this.evolutionFeedbackHook) {
      this.evolutionFeedbackHook(finalResult).catch((err) => {
        log.warn({ stimulusId: this.stimulus.id, error: err instanceof Error ? err.message : String(err) }, 'Evolution feedback hook failed (non-fatal)');
      });
    }

    log.info({
      unitId: this.id,
      durationMs: finalResult.totalDurationMs,
      converged: convergence.converged,
      confidence: convergence.overallConfidence,
    }, 'CognitionUnit completed');

    return finalResult;
  }

  /**
   * 四维并行处理
   *
   * 在 normal 模式下四维并行执行；
   * 在 high_pressure 模式下跳过推演维；
   * 在 emergency 模式下仅执行感知维和决策维。
   */
  private async executeDimensions(
    stimulus: CognitionStimulus,
  ): Promise<Map<CognitionDimension, DimensionOutput>> {
    const results = new Map<CognitionDimension, DimensionOutput>();
    const context: DimensionContext = {
      completedDimensions: results,
      ocProfileId: stimulus.ocProfileId,
      nodeId: stimulus.nodeId || stimulus.deviceId,
      deviceId: stimulus.deviceId,  // @deprecated 兼容
      degradationMode: this.config.degradationMode,
    };

    // 根据降级模式确定要执行的维度
    const processorsToRun = this.getProcessorsForMode();

    if (processorsToRun.length === 0) {
      log.warn({ unitId: this.id }, 'No dimension processors registered');
      return results;
    }

    // 并行执行所有维度，每个维度有独立超时
    const promises = processorsToRun.map(async (processor) => {
      const startTime = Date.now();
      try {
        const output = await this.executeWithTimeout(
          processor.process(stimulus, context),
          this.config.dimensionTimeoutMs,
          `Dimension ${processor.dimension} timeout`,
        );
        results.set(processor.dimension, output);

        this.emitter.emitDimensionDone({
          stimulusId: stimulus.id,
          dimension: processor.dimension,
          output,
          completedAt: new Date(),
        });

        return output;
      } catch (err) {
        const errorOutput: DimensionOutput = {
          dimension: processor.dimension,
          success: false,
          durationMs: Date.now() - startTime,
          data: {},
          error: err instanceof Error ? err.message : String(err),
        };
        results.set(processor.dimension, errorOutput);
        log.error({
          unitId: this.id,
          dimension: processor.dimension,
          error: errorOutput.error,
        }, 'Dimension processing failed');
        return errorOutput;
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * 根据降级模式获取要执行的处理器列表
   */
  private getProcessorsForMode(): DimensionProcessor[] {
    const all: DimensionProcessor[] = [];
    if (this.perceptionProcessor) all.push(this.perceptionProcessor);
    if (this.reasoningProcessor) all.push(this.reasoningProcessor);
    if (this.fusionProcessor) all.push(this.fusionProcessor);
    if (this.decisionProcessor) all.push(this.decisionProcessor);

    switch (this.config.degradationMode) {
      case 'normal':
        return all;

      case 'high_pressure':
        // 跳过推演维（最耗时）
        log.warn({ unitId: this.id, mode: 'high_pressure', skipped: ['reasoning'] },
          'CognitionUnit 降级运行：跳过推演维，诊断结果可能缺少因果推理');
        return all.filter(p => p.dimension !== 'reasoning');

      case 'emergency':
        // 仅保留感知维和决策维
        log.warn({ unitId: this.id, mode: 'emergency', skipped: ['reasoning', 'fusion'] },
          'CognitionUnit 紧急降级：仅保留感知+决策，诊断结果可能不完整');
        return all.filter(p =>
          p.dimension === 'perception' || p.dimension === 'decision',
        );

      default:
        return all;
    }
  }

  /**
   * 交叉验证 — 检查四维输出的一致性
   *
   * 验证逻辑：
   *   1. 感知维检测到的异常是否与融合维的证据一致
   *   2. 推演维的假设是否被融合维的证据支持
   *   3. 决策维的动作是否与感知维的严重度匹配
   */
  private crossValidate(
    outputs: Map<CognitionDimension, DimensionOutput>,
  ): CognitionResult['crossValidation'] {
    const inconsistencies: CognitionResult['crossValidation']['inconsistencies'] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    const perception = outputs.get('perception') as PerceptionOutput | undefined;
    const reasoning = outputs.get('reasoning') as ReasoningOutput | undefined;
    const fusion = outputs.get('fusion') as FusionOutput | undefined;
    const decision = outputs.get('decision') as DecisionOutput | undefined;

    // Check 1: 感知维 vs 融合维 — 异常检测与证据融合是否一致
    if (perception?.success && fusion?.success) {
      totalChecks++;
      const hasAnomalies = perception.data.anomalies.length > 0;
      const hasHighConflict = fusion.data.conflictAnalysis.hasConflict;
      const fusionConfidence = fusion.data.dsFusionResult.confidence;

      // 如果感知到异常但融合置信度很低，可能不一致
      if (hasAnomalies && fusionConfidence < 0.3) {
        inconsistencies.push({
          dimension1: 'perception',
          dimension2: 'fusion',
          description: `Perception detected ${perception.data.anomalies.length} anomalies but fusion confidence is only ${(fusionConfidence * 100).toFixed(1)}%`,
        });
      } else {
        passedChecks++;
      }

      // 如果没有异常但融合有高冲突，也可能不一致
      if (!hasAnomalies && hasHighConflict && fusion.data.conflictAnalysis.conflictDegree > 0.5) {
        totalChecks++;
        inconsistencies.push({
          dimension1: 'perception',
          dimension2: 'fusion',
          description: `No anomalies detected but fusion shows high conflict (${(fusion.data.conflictAnalysis.conflictDegree * 100).toFixed(1)}%)`,
        });
      } else if (!hasAnomalies && hasHighConflict) {
        totalChecks++;
        passedChecks++;
      }
    }

    // Check 2: 推演维 vs 融合维 — 假设是否被证据支持
    if (reasoning?.success && fusion?.success) {
      totalChecks++;
      const topHypothesis = reasoning.data.hypotheses[0];
      if (topHypothesis && fusion.data.dsFusionResult.confidence > 0.5) {
        passedChecks++;
      } else if (topHypothesis) {
        inconsistencies.push({
          dimension1: 'reasoning',
          dimension2: 'fusion',
          description: `Top hypothesis "${topHypothesis.description}" lacks sufficient evidence support (fusion confidence: ${(fusion.data.dsFusionResult.confidence * 100).toFixed(1)}%)`,
        });
      }
    }

    // Check 3: 感知维 vs 决策维 — 严重度与动作匹配
    if (perception?.success && decision?.success) {
      totalChecks++;
      const maxSeverity = perception.data.anomalies.reduce(
        (max, a) => Math.max(max, a.severity), 0,
      );
      const hasUrgentAction = decision.data.recommendedActions.some(
        a => a.priority > 0.8,
      );

      if (maxSeverity > 0.8 && !hasUrgentAction) {
        inconsistencies.push({
          dimension1: 'perception',
          dimension2: 'decision',
          description: `High severity anomaly (${(maxSeverity * 100).toFixed(1)}%) detected but no urgent action recommended`,
        });
      } else {
        passedChecks++;
      }
    }

    const consistencyScore = totalChecks > 0 ? passedChecks / totalChecks : 1.0;

    return { consistencyScore, inconsistencies };
  }

  /**
   * 收敛决策 — 综合四维输出得出最终结论
   */
  private converge(
    outputs: Map<CognitionDimension, DimensionOutput>,
    crossValidation: CognitionResult['crossValidation'],
  ): CognitionResult['convergence'] {
    // 收集各维度的置信度
    const confidences: number[] = [];

    const fusion = outputs.get('fusion') as FusionOutput | undefined;
    if (fusion?.success) {
      confidences.push(fusion.data.dsFusionResult.confidence);
    }

    const perception = outputs.get('perception') as PerceptionOutput | undefined;
    if (perception?.success) {
      // 感知维置信度基于异常检测的覆盖度
      const anomalyConfidence = perception.data.anomalies.length > 0
        ? Math.min(1.0, perception.data.anomalies.reduce((sum, a) => sum + a.severity, 0) / perception.data.anomalies.length)
        : 0.5; // 无异常时中等置信度
      confidences.push(anomalyConfidence);
    }

    const reasoning = outputs.get('reasoning') as ReasoningOutput | undefined;
    if (reasoning?.success && reasoning.data.hypotheses.length > 0) {
      confidences.push(reasoning.data.hypotheses[0].priorProbability);
    }

    // 综合置信度 = 各维度置信度加权平均 × 交叉验证一致性
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
    const overallConfidence = avgConfidence * crossValidation.consistencyScore;

    // 判断是否收敛
    const converged = overallConfidence >= this.config.convergenceConfidenceThreshold
      && crossValidation.consistencyScore >= this.config.crossValidationThreshold;

    return {
      converged,
      iterations: 1, // 当前版本单次迭代
      overallConfidence: Math.max(0, Math.min(1, overallConfidence)),
    };
  }

  /**
   * 错误处理 — 生成失败结果
   */
  private handleError(err: unknown): CognitionResult {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMessage.includes('timeout');

    if (isTimeout) {
      this.stateMachine.tryTransition('TIMEOUT');
      this.emitter.emitUnitTimeout({
        stimulusId: this.stimulus.id,
        timeoutAt: new Date(),
      });
    } else {
      this.stateMachine.tryTransition('ERROR');
      this.emitter.emitUnitFailed({
        stimulusId: this.stimulus.id,
        error: errorMessage,
        failedAt: new Date(),
      });
    }

    this.completedAt = new Date();

    log.error({
      unitId: this.id,
      error: errorMessage,
      isTimeout,
      durationMs: this.completedAt.getTime() - (this.startedAt?.getTime() || 0),
    }, 'CognitionUnit failed');

    return {
      id: this.id,
      stimulusId: this.stimulus.id,
      state: isTimeout ? 'timeout' : 'failed',
      dimensions: {},
      crossValidation: { consistencyScore: 0, inconsistencies: [] },
      convergence: { converged: false, iterations: 0, overallConfidence: 0 },
      totalDurationMs: this.completedAt.getTime() - (this.startedAt?.getTime() || 0),
      startedAt: this.startedAt || this.completedAt,
      completedAt: this.completedAt,
      degradationMode: this.config.degradationMode,
    };
  }

  // ==========================================================================
  // v5.0 进化钩子执行
  // ==========================================================================

  /**
   * 执行 v5.0 进化模块钩子
   * 
   * 顺序：
   *   1. WorldModel 预测（基于感知输出）
   *   2. Grok 深度推理（基于推演输出）
   *   3. Guardrail 护栏检查（基于决策输出）
   * 
   * 每个钩子独立容错，不影响主流程
   */
  private async executeEvolutionHooks(
    outputs: Map<CognitionDimension, DimensionOutput>,
    stimulus: CognitionStimulus,
  ): Promise<void> {
    const perception = outputs.get('perception') as PerceptionOutput | undefined;
    const reasoning = outputs.get('reasoning') as ReasoningOutput | undefined;
    const decision = outputs.get('decision') as DecisionOutput | undefined;

    // Hook 1: WorldModel 状态预测
    if (this.worldModelHook && perception?.success) {
      try {
        const wmResult = await this.executeWithTimeout(
          this.worldModelHook(stimulus, perception),
          5000,
          'WorldModel hook timeout',
        );
        // 将预测结果附加到 perception 输出的 metadata 中
        if (wmResult.predictions || wmResult.anomalyPredict) {
          (perception.data as any)._worldModelPredictions = wmResult.predictions;
          (perception.data as any)._worldModelAnomalyPredict = wmResult.anomalyPredict;
        }
        log.debug({ stimulusId: stimulus.id, predictions: wmResult.predictions?.length }, 'WorldModel hook executed');
      } catch (err) {
        log.warn({ stimulusId: stimulus.id, error: err instanceof Error ? err.message : String(err) }, 'WorldModel hook failed (non-fatal)');
      }
    }

    // Hook 2: Grok 深度推理
    if (this.grokReasoningHook && reasoning?.success) {
      try {
        const grokResult = await this.executeWithTimeout(
          this.grokReasoningHook(stimulus, reasoning),
          10000,
          'Grok reasoning hook timeout',
        );
        // 将 Grok 增强的假设附加到 reasoning 输出
        if (grokResult.enhancedHypotheses) {
          (reasoning.data as any)._grokEnhancedHypotheses = grokResult.enhancedHypotheses;
        }
        if (grokResult.toolCallResults) {
          (reasoning.data as any)._grokToolCallResults = grokResult.toolCallResults;
        }
        log.debug({ stimulusId: stimulus.id, toolCalls: grokResult.toolCallResults?.length }, 'Grok reasoning hook executed');
      } catch (err) {
        log.warn({ stimulusId: stimulus.id, error: err instanceof Error ? err.message : String(err) }, 'Grok reasoning hook failed (non-fatal)');
      }
    }

    // Hook 3: Guardrail 护栏检查
    if (this.guardrailHook && decision?.success) {
      try {
        const grResult = await this.executeWithTimeout(
          this.guardrailHook(stimulus, decision),
          3000,
          'Guardrail hook timeout',
        );
        if (grResult.blocked) {
          log.warn({ stimulusId: stimulus.id, violations: grResult.violations?.length }, 'Guardrail BLOCKED decision actions');
          // 替换决策输出中的推荐动作为护栏调整后的动作
          if (grResult.adjustedActions) {
            (decision.data as any).recommendedActions = grResult.adjustedActions;
          }
          (decision.data as any)._guardrailViolations = grResult.violations;
          (decision.data as any)._guardrailBlocked = true;
        } else {
          (decision.data as any)._guardrailBlocked = false;
        }
        log.debug({ stimulusId: stimulus.id, blocked: grResult.blocked }, 'Guardrail hook executed');
      } catch (err) {
        log.warn({ stimulusId: stimulus.id, error: err instanceof Error ? err.message : String(err) }, 'Guardrail hook failed (non-fatal)');
      }
    }
  }

  /**
   * 带超时的 Promise 执行
   */
  private executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise
        .then((val) => { clearTimeout(timer); resolve(val); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

let unitCounter = 0;

/** 生成唯一的 CognitionUnit ID */
function generateUnitId(): string {
  unitCounter++;
  const timestamp = Date.now().toString(36);
  const counter = unitCounter.toString(36).padStart(4, '0');
  return `cu_${timestamp}_${counter}`;
}

/** 创建 CognitionUnit */
export function createCognitionUnit(
  stimulus: CognitionStimulus,
  config?: Partial<CognitionUnitConfig>,
): CognitionUnit {
  const id = generateUnitId();
  return new CognitionUnit(id, stimulus, config);
}
