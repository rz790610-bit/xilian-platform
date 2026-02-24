/**
 * ============================================================================
 * MetaLearner — Grok 元学习裁判
 * ============================================================================
 *
 * 自进化飞轮的"大脑"：
 *   1. 数据发现：分析数据质量，发现新的训练数据源
 *   2. 假设生成：基于诊断历史生成改进假设（Grok → LLM → 规则 三层降级）
 *   3. 实验设计：设计 A/B 实验验证假设
 *   4. 参数优化：优化模型超参数和物理参数
 *   5. 策略调度：决定下一步进化方向
 *
 * MetaLearner 是 Grok 的最高级应用：
 *   不是执行具体诊断，而是"学习如何更好地学习"
 *
 * AI 集成架构（v2 — P0 LLM/Grok 注入）：
 *   - 第一层：GrokReasoningService.diagnose() — 工具调用 + 多步推理（最强）
 *   - 第二层：invokeLLM() — Forge API 结构化输出（兜底）
 *   - 第三层：generateHypothesesWithRules() — 原有 if-else 规则引擎（最终兜底）
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM, type InvokeResult } from '../../../core/llm';
import { grokReasoningService, type DiagnoseRequest } from '../../cognition/grok/grok-reasoning.service';

const log = createModuleLogger('meta-learner');

// ============================================================================
// 类型定义
// ============================================================================

export interface MetaLearnerConfig {
  /** 学习率 */
  learningRate: number;
  /** 探索率 (ε-greedy) */
  explorationRate: number;
  /** 记忆容量 */
  memoryCapacity: number;
  /** 评估窗口大小 */
  evaluationWindowSize: number;
  /** 最小改进阈值 */
  minImprovementThreshold: number;
  /** 是否启用 LLM 假设生成（默认 true，可降级关闭） */
  enableLLMHypothesis?: boolean;
}

export interface DataDiscovery {
  discoveryId: string;
  timestamp: number;
  /** 数据源 */
  source: string;
  /** 数据质量评估 */
  qualityScore: number;
  /** 缺失维度 */
  missingDimensions: string[];
  /** 异常数据比例 */
  anomalyRatio: number;
  /** 建议 */
  suggestions: string[];
}

export interface Hypothesis {
  hypothesisId: string;
  timestamp: number;
  /** 假设描述 */
  description: string;
  /** 假设类型 */
  type: 'parameter_tuning' | 'feature_engineering' | 'model_architecture' | 'data_augmentation' | 'rule_update';
  /** 预期改进 */
  expectedImprovement: number;
  /** 置信度 */
  confidence: number;
  /** 具体参数 */
  parameters: Record<string, unknown>;
  /** 状态 */
  status: 'proposed' | 'testing' | 'validated' | 'rejected' | 'applied';
  /** 实际结果 */
  actualResult?: number;
  /** 生成策略（标记来源） */
  generatedBy?: 'grok' | 'llm' | 'rules';
}

export interface ExperimentDesign {
  experimentId: string;
  hypothesisId: string;
  /** 实验名称 */
  name: string;
  /** 控制组配置 */
  controlConfig: Record<string, unknown>;
  /** 实验组配置 */
  treatmentConfig: Record<string, unknown>;
  /** 评估指标 */
  evaluationMetrics: string[];
  /** 样本量 */
  sampleSize: number;
  /** 持续时间 (小时) */
  durationHours: number;
  /** 状态 */
  status: 'designed' | 'running' | 'completed' | 'cancelled';
  /** 结果 */
  results?: {
    controlMetrics: Record<string, number>;
    treatmentMetrics: Record<string, number>;
    improvement: Record<string, number>;
    significant: boolean;
  };
}

export interface EvolutionStrategy {
  strategyId: string;
  timestamp: number;
  /** 当前焦点 */
  focus: 'accuracy' | 'safety' | 'efficiency' | 'robustness' | 'generalization';
  /** 优先行动 */
  prioritizedActions: {
    action: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
    rationale: string;
  }[];
  /** 资源分配 */
  resourceAllocation: Record<string, number>;
}

export interface MetaLearnerState {
  /** 累积经验 */
  totalExperiences: number;
  /** 成功率 */
  successRate: number;
  /** 当前策略 */
  currentStrategy: EvolutionStrategy | null;
  /** 假设历史 */
  hypothesisHistory: Hypothesis[];
  /** 实验历史 */
  experimentHistory: ExperimentDesign[];
  /** 性能趋势 */
  performanceTrend: { timestamp: number; score: number }[];
}

/** 假设生成上下文（供 LLM 使用） */
export interface HypothesisGenerationContext {
  /** 引擎模块标识 */
  engineModule?: string;
  /** 模块中文标签 */
  engineModuleLabel?: string;
  /** 性能历史摘要 */
  recentPerformance: { score: number; context: Record<string, number> }[];
  /** 当前参数 */
  currentParams?: Record<string, unknown>;
  /** 约束条件 */
  constraints?: Record<string, unknown>;
  /** 作业 ID（用于事件追踪） */
  jobId?: string;
  /** 用户 ID */
  userId?: string;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: MetaLearnerConfig = {
  learningRate: 0.01,
  explorationRate: 0.2,
  memoryCapacity: 10000,
  evaluationWindowSize: 100,
  minImprovementThreshold: 0.02,
  enableLLMHypothesis: true,
};

// ============================================================================
// MetaLearner
// ============================================================================

export class MetaLearner {
  private config: MetaLearnerConfig;
  private state: MetaLearnerState;
  private performanceMemory: { timestamp: number; score: number; context: Record<string, number> }[] = [];

  constructor(config: Partial<MetaLearnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      totalExperiences: 0,
      successRate: 0,
      currentStrategy: null,
      hypothesisHistory: [],
      experimentHistory: [],
      performanceTrend: [],
    };
  }

  /**
   * 数据发现 — 分析数据质量
   */
  discoverData(
    dataPoints: Record<string, number>[],
    expectedDimensions: string[]
  ): DataDiscovery {
    const n = dataPoints.length;
    const missingDimensions: string[] = [];
    const anomalyCount: Record<string, number> = {};

    // 检查缺失维度
    for (const dim of expectedDimensions) {
      const present = dataPoints.filter(dp => dp[dim] !== undefined && dp[dim] !== null);
      if (present.length < n * 0.5) {
        missingDimensions.push(dim);
      }
    }

    // 检查异常值（IQR 方法）
    let totalAnomalies = 0;
    for (const dim of expectedDimensions) {
      const values = dataPoints.map(dp => dp[dim]).filter(v => v !== undefined && v !== null) as number[];
      if (values.length < 10) continue;

      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;

      const anomalies = values.filter(v => v < lower || v > upper).length;
      if (anomalies > 0) {
        anomalyCount[dim] = anomalies;
        totalAnomalies += anomalies;
      }
    }

    const anomalyRatio = n > 0 ? totalAnomalies / (n * expectedDimensions.length) : 0;

    // 质量评分
    const completenessScore = 1 - missingDimensions.length / expectedDimensions.length;
    const cleanlinessScore = 1 - anomalyRatio;
    const qualityScore = 0.6 * completenessScore + 0.4 * cleanlinessScore;

    // 建议
    const suggestions: string[] = [];
    if (missingDimensions.length > 0) {
      suggestions.push(`补充缺失维度数据：${missingDimensions.join(', ')}`);
    }
    if (anomalyRatio > 0.05) {
      suggestions.push(`清洗异常数据（异常率 ${(anomalyRatio * 100).toFixed(1)}%）`);
    }
    if (n < 100) {
      suggestions.push(`数据量不足（${n} 条），建议收集更多历史数据`);
    }

    return {
      discoveryId: `discovery_${Date.now()}`,
      timestamp: Date.now(),
      source: 'diagnosis_history',
      qualityScore,
      missingDimensions,
      anomalyRatio,
      suggestions,
    };
  }

  // ==========================================================================
  // 假设生成 — 三层降级架构（Grok → LLM → 规则）
  // ==========================================================================

  /**
   * 假设生成 — 公开入口（兼容原有签名 + 新增 context 参数）
   *
   * 调用优先级：
   *   1. Grok 推理链（GrokReasoningService.diagnose）— 最强推理能力
   *   2. LLM 结构化输出（invokeLLM + JSON Schema）— 兜底
   *   3. 规则引擎（原有 if-else）— 最终兜底
   */
  async generateHypotheses(
    recentPerformance: { score: number; context: Record<string, number> }[],
    generationContext?: HypothesisGenerationContext
  ): Promise<Hypothesis[]> {
    const context: HypothesisGenerationContext = generationContext ?? {
      recentPerformance,
    };

    // 如果禁用 LLM，直接走规则
    if (!this.config.enableLLMHypothesis) {
      log.debug('[MetaLearner] LLM 已禁用，使用规则引擎生成假设');
      return this.generateHypothesesWithRules(recentPerformance);
    }

    // 第一层：Grok 推理链
    try {
      log.debug('[MetaLearner] 尝试 Grok 推理链生成假设...');
      const hypotheses = await this.generateHypothesesWithGrok(context);
      if (hypotheses.length > 0) {
        log.debug(`[MetaLearner] Grok 成功生成 ${hypotheses.length} 个假设`);
        this.state.hypothesisHistory.push(...hypotheses);
        return hypotheses;
      }
      log.debug('[MetaLearner] Grok 返回空结果，降级到 LLM');
    } catch (err) {
      log.warn('[MetaLearner] Grok 推理链失败，降级到 LLM', { error: String(err) });
    }

    // 第二层：LLM 结构化输出
    try {
      log.debug('[MetaLearner] 尝试 LLM 结构化输出生成假设...');
      const hypotheses = await this.generateHypothesesWithLLM(context);
      if (hypotheses.length > 0) {
        log.debug(`[MetaLearner] LLM 成功生成 ${hypotheses.length} 个假设`);
        this.state.hypothesisHistory.push(...hypotheses);
        return hypotheses;
      }
      log.debug('[MetaLearner] LLM 返回空结果，降级到规则引擎');
    } catch (err) {
      log.warn('[MetaLearner] LLM 调用失败，降级到规则引擎', { error: String(err) });
    }

    // 第三层：规则引擎（原有 if-else）
    log.debug('[MetaLearner] 使用规则引擎生成假设（最终兜底）');
    const hypotheses = this.generateHypothesesWithRules(recentPerformance);
    this.state.hypothesisHistory.push(...hypotheses);
    return hypotheses;
  }

  /**
   * 第一层：Grok 推理链生成假设
   *
   * 利用 GrokReasoningService 的多步推理 + 工具调用能力，
   * 将假设生成建模为一次"诊断"任务。
   */
  private async generateHypothesesWithGrok(context: HypothesisGenerationContext): Promise<Hypothesis[]> {
    const scores = context.recentPerformance.map(p => p.score);
    const avgScore = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    const trend = this.computeTrend(scores);

    // 构建 Grok 诊断请求
    const diagnoseRequest: DiagnoseRequest = {
      machineId: `meta-learner-${context.engineModule || 'global'}`,
      triggerType: 'manual',
      query: `
习联平台进化引擎 MetaLearner 假设生成任务。
当前优化场景：${context.engineModule || '全局'}（${context.engineModuleLabel || '进化引擎'}）
性能趋势：平均分 ${avgScore.toFixed(3)}，趋势斜率 ${trend.toFixed(4)}
最近 ${scores.length} 次评估数据：${JSON.stringify(scores.slice(-10))}
维度上下文：${JSON.stringify(context.recentPerformance.slice(-5).map(p => p.context))}
${context.currentParams ? `当前参数：${JSON.stringify(context.currentParams)}` : ''}
${context.constraints ? `约束条件：${JSON.stringify(context.constraints)}` : ''}

请生成 3 个可验证的优化假设。每个假设必须包含：
1. hypothesisId（格式：hyp_<type>_<timestamp>）
2. description（中文，≤80 字）
3. type（parameter_tuning | feature_engineering | model_architecture | data_augmentation | rule_update）
4. expectedImprovement（百分比，0.01~0.80）
5. confidence（0~1）
6. parameters（JSON，可直接用于仿真的实验设计参数）

只返回合法 JSON 数组。
`,
      priority: 'normal' as const,
      config: {
        maxSteps: 5,
        timeoutMs: 30000,
        temperature: 0.3,
      },
    };

    const response = await grokReasoningService.diagnose(diagnoseRequest);

    // 解析 Grok 推理结果
    const rawOutput = typeof response.result.finalOutput === 'string'
      ? response.result.finalOutput
      : JSON.stringify(response.result.finalOutput);

    // 尝试从推理输出中提取 JSON 数组
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log.debug('[MetaLearner] Grok 输出无法解析为 JSON 数组');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    // 标准化为 Hypothesis 类型
    return parsed.map(raw => this.normalizeHypothesis(raw, 'grok')).filter(Boolean) as Hypothesis[];
  }

  /**
   * 第二层：LLM 结构化输出生成假设
   *
   * 使用平台核心 invokeLLM（Forge API），通过 JSON Schema 约束输出格式。
   */
  private async generateHypothesesWithLLM(context: HypothesisGenerationContext): Promise<Hypothesis[]> {
    const scores = context.recentPerformance.map(p => p.score);
    const avgScore = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    const trend = this.computeTrend(scores);

    const systemPrompt = `你是习联平台进化引擎的 MetaLearner 专家。你的任务是基于性能数据生成可验证的优化假设。
规则：
- 每个假设必须有明确的实验设计参数
- expectedImprovement 必须在 0.01 ~ 0.80 之间
- confidence 必须在 0 ~ 1 之间
- description 使用中文，≤80 字
- 只返回 JSON 数组，不要任何解释`;

    const userPrompt = `当前优化场景：${context.engineModule || '全局'}（${context.engineModuleLabel || '进化引擎'}）
性能趋势：平均分 ${avgScore.toFixed(3)}，趋势斜率 ${trend.toFixed(4)}
最近评估：${JSON.stringify(scores.slice(-10))}
维度上下文：${JSON.stringify(context.recentPerformance.slice(-5).map(p => p.context))}
${context.currentParams ? `当前参数：${JSON.stringify(context.currentParams)}` : ''}

请生成 3 个优化假设，每个包含 hypothesisId, description, type, expectedImprovement, confidence, parameters 字段。`;

    const result: InvokeResult = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'grok-2-1212',
      maxTokens: 1500,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'hypotheses_output',
          schema: {
            type: 'object',
            properties: {
              hypotheses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hypothesisId: { type: 'string' },
                    description: { type: 'string' },
                    type: { type: 'string', enum: ['parameter_tuning', 'feature_engineering', 'model_architecture', 'data_augmentation', 'rule_update'] },
                    expectedImprovement: { type: 'number' },
                    confidence: { type: 'number' },
                    parameters: { type: 'object' },
                  },
                  required: ['hypothesisId', 'description', 'type', 'expectedImprovement', 'confidence', 'parameters'],
                },
              },
            },
            required: ['hypotheses'],
          },
          strict: true,
        },
      },
    });

    // 解析 LLM 响应
    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return [];

    const parsed = JSON.parse(content);
    const hypothesesArr = parsed.hypotheses || parsed;
    if (!Array.isArray(hypothesesArr)) return [];

    return hypothesesArr.map(raw => this.normalizeHypothesis(raw, 'llm')).filter(Boolean) as Hypothesis[];
  }

  /**
   * 第三层：规则引擎生成假设（原有 if-else 逻辑，保持不变）
   */
  private generateHypothesesWithRules(
    recentPerformance: { score: number; context: Record<string, number> }[]
  ): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];

    // 分析性能趋势
    const scores = recentPerformance.map(p => p.score);
    const trend = this.computeTrend(scores);

    // 假设 1：如果性能下降，可能需要参数调优
    if (trend < -0.01) {
      hypotheses.push({
        hypothesisId: `hyp_param_tune_${Date.now()}`,
        timestamp: Date.now(),
        description: '性能呈下降趋势，建议调优物理模型参数',
        type: 'parameter_tuning',
        expectedImprovement: 0.05,
        confidence: 0.7,
        parameters: {
          target: 'physics_params',
          method: 'bayesian_optimization',
          searchSpace: {
            stressConcentrationFactor: [2.0, 3.0],
            corrosionRateConstant: [0.0005, 0.002],
          },
        },
        status: 'proposed',
        generatedBy: 'rules',
      });
    }

    // 假设 2：如果某些维度持续低分，可能需要特征工程
    const dimScores: Record<string, number[]> = {};
    for (const p of recentPerformance) {
      for (const [key, value] of Object.entries(p.context)) {
        if (!dimScores[key]) dimScores[key] = [];
        dimScores[key].push(value);
      }
    }

    for (const [dim, values] of Object.entries(dimScores)) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      if (avg < 0.5) {
        hypotheses.push({
          hypothesisId: `hyp_feature_${dim}_${Date.now()}`,
          timestamp: Date.now(),
          description: `维度 ${dim} 持续低分（平均 ${avg.toFixed(2)}），建议增加交叉特征`,
          type: 'feature_engineering',
          expectedImprovement: 0.08,
          confidence: 0.6,
          parameters: {
            targetDimension: dim,
            suggestedFeatures: [`${dim}_rolling_mean`, `${dim}_rate_of_change`, `${dim}_interaction`],
          },
          status: 'proposed',
          generatedBy: 'rules',
        });
      }
    }

    // 假设 3：探索性假设（ε-greedy）
    if (Math.random() < this.config.explorationRate) {
      hypotheses.push({
        hypothesisId: `hyp_explore_${Date.now()}`,
        timestamp: Date.now(),
        description: '探索性假设：尝试增加数据增强（时间序列扰动）',
        type: 'data_augmentation',
        expectedImprovement: 0.03,
        confidence: 0.4,
        parameters: {
          method: 'time_series_perturbation',
          noiseLevel: 0.05,
          augmentationRatio: 2,
        },
        status: 'proposed',
        generatedBy: 'rules',
      });
    }

    return hypotheses;
  }

  /**
   * 标准化 LLM/Grok 输出为 Hypothesis 类型
   */
  private normalizeHypothesis(raw: Record<string, unknown>, source: 'grok' | 'llm'): Hypothesis | null {
    try {
      const validTypes = ['parameter_tuning', 'feature_engineering', 'model_architecture', 'data_augmentation', 'rule_update'];
      const type = validTypes.includes(raw.type as string) ? raw.type as Hypothesis['type'] : 'parameter_tuning';

      let expectedImprovement = Number(raw.expectedImprovement ?? raw.predicted_improvement ?? 0.05);
      if (expectedImprovement > 1) expectedImprovement /= 100; // 百分比 → 小数
      expectedImprovement = Math.max(0.01, Math.min(0.80, expectedImprovement));

      let confidence = Number(raw.confidence ?? 0.5);
      confidence = Math.max(0, Math.min(1, confidence));

      return {
        hypothesisId: String(raw.hypothesisId || raw.hypothesis_id || `hyp_${source}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
        timestamp: Date.now(),
        description: String(raw.description || ''),
        type,
        expectedImprovement,
        confidence,
        parameters: (raw.parameters || raw.experimentDesign || {}) as Record<string, unknown>,
        status: 'proposed',
        generatedBy: source,
      };
    } catch (err) {
      log.warn(`[MetaLearner] 标准化 ${source} 假设失败`, { error: String(err), raw });
      return null;
    }
  }

  // ==========================================================================
  // 实验设计（保持原有逻辑）
  // ==========================================================================

  /**
   * 设计实验
   */
  designExperiment(hypothesis: Hypothesis): ExperimentDesign {
    const experiment: ExperimentDesign = {
      experimentId: `exp_${Date.now()}`,
      hypothesisId: hypothesis.hypothesisId,
      name: `验证：${hypothesis.description.substring(0, 50)}`,
      controlConfig: { useCurrentModel: true },
      treatmentConfig: hypothesis.parameters,
      evaluationMetrics: ['accuracy.mae', 'accuracy.rmse', 'safety.missedAlarmRate'],
      sampleSize: Math.max(100, this.config.evaluationWindowSize),
      durationHours: 24,
      status: 'designed',
    };

    this.state.experimentHistory.push(experiment);
    return experiment;
  }

  /**
   * 决定进化策略
   */
  decideStrategy(): EvolutionStrategy {
    const recentPerformance = this.state.performanceTrend.slice(-this.config.evaluationWindowSize);

    // 确定焦点
    let focus: EvolutionStrategy['focus'] = 'accuracy';
    const avgScore = recentPerformance.length > 0
      ? recentPerformance.reduce((s, p) => s + p.score, 0) / recentPerformance.length
      : 0.5;

    if (avgScore < 0.5) focus = 'accuracy';
    else if (avgScore < 0.7) focus = 'robustness';
    else if (avgScore < 0.85) focus = 'efficiency';
    else focus = 'generalization';

    // 优先行动
    const actions: EvolutionStrategy['prioritizedActions'] = [];

    const successfulHypotheses = this.state.hypothesisHistory.filter(h => h.status === 'validated');

    if (successfulHypotheses.length > 0) {
      const bestHyp = successfulHypotheses.sort((a, b) => (b.actualResult || 0) - (a.actualResult || 0))[0];
      actions.push({
        action: `应用已验证假设：${bestHyp.description}`,
        expectedImpact: bestHyp.actualResult || bestHyp.expectedImprovement,
        effort: 'low',
        rationale: '已通过实验验证',
      });
    }

    actions.push({
      action: '收集更多训练数据（扩大时间范围和工况覆盖）',
      expectedImpact: 0.05,
      effort: 'medium',
      rationale: '数据量是模型性能的基础',
    });

    if (focus === 'generalization') {
      actions.push({
        action: '启动跨工况迁移学习',
        expectedImpact: 0.1,
        effort: 'high',
        rationale: '当前场景已接近上限，需要跨域知识',
      });
    }

    // 资源分配
    const resourceAllocation: Record<string, number> = {
      data_collection: focus === 'accuracy' ? 0.4 : 0.2,
      model_training: focus === 'accuracy' ? 0.3 : 0.2,
      experiment_validation: 0.2,
      knowledge_crystallization: focus === 'generalization' ? 0.3 : 0.1,
      monitoring: 0.1,
    };

    const strategy: EvolutionStrategy = {
      strategyId: `strategy_${Date.now()}`,
      timestamp: Date.now(),
      focus,
      prioritizedActions: actions,
      resourceAllocation,
    };

    this.state.currentStrategy = strategy;
    return strategy;
  }

  /**
   * 记录性能
   */
  recordPerformance(score: number, context: Record<string, number> = {}): void {
    const entry = { timestamp: Date.now(), score, context };
    this.performanceMemory.push(entry);
    this.state.performanceTrend.push({ timestamp: Date.now(), score });
    this.state.totalExperiences++;

    if (this.performanceMemory.length > this.config.memoryCapacity) {
      this.performanceMemory.shift();
    }
    if (this.state.performanceTrend.length > this.config.memoryCapacity) {
      this.state.performanceTrend.shift();
    }

    // 更新成功率
    const validated = this.state.hypothesisHistory.filter(h => h.status === 'validated').length;
    const total = this.state.hypothesisHistory.filter(h => h.status !== 'proposed').length;
    this.state.successRate = total > 0 ? validated / total : 0;
  }

  /**
   * 获取状态
   */
  getState(): MetaLearnerState {
    return { ...this.state };
  }

  /**
   * 计算趋势（线性回归斜率）
   */
  private computeTrend(values: number[]): number {
    if (values.length < 3) return 0;
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }

    return denominator > 0 ? numerator / denominator : 0;
  }
}
