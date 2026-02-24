/**
 * ============================================================================
 * End-to-End Evolution Agent (E29-E31)
 * ============================================================================
 *
 * 借鉴 FSD MindVLA 端到端架构：
 *   - 多模态输入（传感器数据 + 上下文 + 历史）→ 统一决策输出
 *   - 世界模型集成（预测未来 N 步状态）
 *   - Grok Agent 推理增强
 *   - 模型合并（SLERP 风格权重插值）
 *   - 决策链路全程可追溯
 *
 * 架构：
 *   ┌──────────────────────────────────────────────────────┐
 *   │              Multi-Modal Input                       │
 *   │   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐      │
 *   │   │Sensor│  │Context│  │History│  │KG Context│      │
 *   │   └──┬───┘  └──┬───┘  └──┬───┘  └────┬─────┘      │
 *   │      └──────────┼────────┼────────────┘             │
 *   │                 │                                    │
 *   │        ┌───────▼────────┐                           │
 *   │        │ Feature Fusion │                           │
 *   │        └───────┬────────┘                           │
 *   │                │                                    │
 *   │    ┌──────────▼───────────┐                        │
 *   │    │   World Model        │                        │
 *   │    │   (Future Prediction) │                        │
 *   │    └──────────┬───────────┘                        │
 *   │               │                                     │
 *   │    ┌─────────▼──────────┐                          │
 *   │    │  Neural Planner    │                          │
 *   │    │  (Decision Output) │                          │
 *   │    └────────────────────┘                          │
 *   └──────────────────────────────────────────────────────┘
 */

import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('e2e-evolution-agent');

// ============================================================================
// 类型定义
// ============================================================================

export interface MultiModalInput {
  /** 传感器数据 */
  sensorData: Record<string, number[]>;
  /** 上下文信息 */
  context: Record<string, unknown>;
  /** 历史决策序列 */
  historyDecisions: HistoricalDecision[];
  /** 知识图谱上下文 */
  kgContext: KGContext;
  /** 时间戳 */
  timestamp: number;
  /** 设备 ID */
  deviceId: string;
}

export interface HistoricalDecision {
  timestamp: number;
  decision: Record<string, unknown>;
  outcome: Record<string, unknown>;
  reward: number;
}

export interface KGContext {
  /** 相关实体 */
  entities: string[];
  /** 关系 */
  relations: { from: string; to: string; type: string }[];
  /** 推理路径 */
  reasoningPaths: string[];
}

export interface DecisionOutput {
  /** 决策 ID */
  decisionId: string;
  /** 主决策 */
  action: Record<string, number>;
  /** 置信度 */
  confidence: number;
  /** 未来状态预测 */
  futurePrediction: FuturePrediction[];
  /** 推理链路 */
  reasoningChain: ReasoningStep[];
  /** 决策元数据 */
  metadata: DecisionMetadata;
}

export interface FuturePrediction {
  stepAhead: number;
  predictedState: Record<string, number>;
  probability: number;
}

export interface ReasoningStep {
  stepIndex: number;
  module: string;
  input: string;
  output: string;
  confidence: number;
  latencyMs: number;
}

export interface DecisionMetadata {
  modelVersion: string;
  fusionMethod: string;
  worldModelUsed: boolean;
  totalLatencyMs: number;
  featureDimensions: number;
}

export interface E2EAgentConfig {
  /** 未来预测步数 */
  futureSteps: number;
  /** 特征融合方法 */
  fusionMethod: 'early' | 'late' | 'attention';
  /** 是否启用世界模型 */
  enableWorldModel: boolean;
  /** 决策超时 (ms) */
  decisionTimeoutMs: number;
  /** 历史窗口大小 */
  historyWindowSize: number;
  /** 最小置信度阈值 */
  minConfidence: number;
}

// ============================================================================
// 模型合并配置 (E30 - SLERP)
// ============================================================================

export interface ModelMergeConfig {
  /** 合并方法 */
  method: 'slerp' | 'linear' | 'task_arithmetic';
  /** 插值系数 (0=modelA, 1=modelB) */
  interpolationFactor: number;
  /** 层级选择性合并 */
  layerSelection: Record<string, number>;
}

export interface ModelWeights {
  modelId: string;
  version: string;
  weights: Float64Array | number[];
  metadata: Record<string, unknown>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: E2EAgentConfig = {
  futureSteps: 5,
  fusionMethod: 'attention',
  enableWorldModel: true,
  decisionTimeoutMs: 2000,
  historyWindowSize: 20,
  minConfidence: 0.6,
};

// ============================================================================
// 世界模型接口
// ============================================================================

export interface WorldModelProvider {
  getState(): Promise<Record<string, unknown>>;
  predictFuture(steps: number): Promise<FuturePrediction[]>;
  simulate(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// ============================================================================
// 推理引擎接口
// ============================================================================

export interface ReasoningProvider {
  reason(input: Record<string, unknown>, context: Record<string, unknown>): Promise<{
    decision: Record<string, number>;
    confidence: number;
    reasoning: string;
  }>;
}

// ============================================================================
// End-to-End Evolution Agent
// ============================================================================

export class EndToEndEvolutionAgent {
  private config: E2EAgentConfig;
  private worldModel: WorldModelProvider | null = null;
  private reasoningProvider: ReasoningProvider | null = null;
  private eventBus: EventBus;

  /** 决策历史缓存 */
  private decisionHistory: DecisionOutput[] = [];
  private readonly MAX_HISTORY = 500;

  constructor(config: Partial<E2EAgentConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 注入依赖
  // ==========================================================================

  setWorldModel(provider: WorldModelProvider): void {
    this.worldModel = provider;
  }

  setReasoningProvider(provider: ReasoningProvider): void {
    this.reasoningProvider = provider;
  }

  // ==========================================================================
  // 2. 端到端预测
  // ==========================================================================

  async predictMultiModal(input: MultiModalInput): Promise<DecisionOutput> {
    const startTime = Date.now();
    const decisionId = crypto.randomUUID();
    const reasoningChain: ReasoningStep[] = [];

    try {
      // Step 1: 特征融合
      const fusionStart = Date.now();
      const fusedFeatures = await this.fuseFeatures(input);
      reasoningChain.push({
        stepIndex: 0,
        module: 'feature_fusion',
        input: `${Object.keys(input.sensorData).length} sensor channels`,
        output: `${fusedFeatures.length} fused dimensions`,
        confidence: 1.0,
        latencyMs: Date.now() - fusionStart,
      });

      // Step 2: 世界模型预测
      let futurePrediction: FuturePrediction[] = [];
      if (this.config.enableWorldModel && this.worldModel) {
        const wmStart = Date.now();
        futurePrediction = await this.worldModel.predictFuture(this.config.futureSteps);
        reasoningChain.push({
          stepIndex: 1,
          module: 'world_model',
          input: `predict ${this.config.futureSteps} steps`,
          output: `${futurePrediction.length} predictions`,
          confidence: futurePrediction.length > 0 ? futurePrediction[0].probability : 0,
          latencyMs: Date.now() - wmStart,
        });
      }

      // Step 3: 神经规划器
      const plannerStart = Date.now();
      const plannerResult = await this.neuralPlanner(fusedFeatures, futurePrediction, input);
      reasoningChain.push({
        stepIndex: 2,
        module: 'neural_planner',
        input: `${fusedFeatures.length} features + ${futurePrediction.length} predictions`,
        output: `${Object.keys(plannerResult.action).length} action dimensions`,
        confidence: plannerResult.confidence,
        latencyMs: Date.now() - plannerStart,
      });

      // Step 4: Grok 推理增强（可选）
      if (this.reasoningProvider && plannerResult.confidence < this.config.minConfidence) {
        const grokStart = Date.now();
        const grokResult = await this.reasoningProvider.reason(
          { features: fusedFeatures, plannerDecision: plannerResult.action },
          input.context,
        );
        reasoningChain.push({
          stepIndex: 3,
          module: 'grok_reasoning',
          input: 'low confidence decision',
          output: grokResult.reasoning,
          confidence: grokResult.confidence,
          latencyMs: Date.now() - grokStart,
        });

        // 如果 Grok 置信度更高，使用 Grok 的决策
        if (grokResult.confidence > plannerResult.confidence) {
          plannerResult.action = grokResult.decision;
          plannerResult.confidence = grokResult.confidence;
        }
      }

      const totalLatencyMs = Date.now() - startTime;

      const decision: DecisionOutput = {
        decisionId,
        action: plannerResult.action,
        confidence: plannerResult.confidence,
        futurePrediction,
        reasoningChain,
        metadata: {
          modelVersion: '2.0.0',
          fusionMethod: this.config.fusionMethod,
          worldModelUsed: this.config.enableWorldModel && !!this.worldModel,
          totalLatencyMs,
          featureDimensions: fusedFeatures.length,
        },
      };

      // 缓存
      this.cacheDecision(decision);

      // EventBus
      await this.eventBus.publish({
        type: 'e2e_agent.decision.made',
        source: 'e2e-evolution-agent',
        data: {
          decisionId,
          confidence: decision.confidence,
          latencyMs: totalLatencyMs,
          deviceId: input.deviceId,
        },
      });

      return decision;
    } catch (err) {
      log.error('端到端预测失败', err);
      // 降级：返回安全默认决策
      return {
        decisionId,
        action: { safe_mode: 1.0 },
        confidence: 0.1,
        futurePrediction: [],
        reasoningChain,
        metadata: {
          modelVersion: '2.0.0-fallback',
          fusionMethod: this.config.fusionMethod,
          worldModelUsed: false,
          totalLatencyMs: Date.now() - startTime,
          featureDimensions: 0,
        },
      };
    }
  }

  // ==========================================================================
  // 3. 特征融合
  // ==========================================================================

  private async fuseFeatures(input: MultiModalInput): Promise<number[]> {
    const features: number[] = [];

    switch (this.config.fusionMethod) {
      case 'early':
        // 早期融合：直接拼接所有传感器数据
        for (const [, values] of Object.entries(input.sensorData)) {
          features.push(...values);
        }
        break;

      case 'late':
        // 晚期融合：每个通道独立编码后拼接
        for (const [, values] of Object.entries(input.sensorData)) {
          const encoded = this.encodeChannel(values);
          features.push(...encoded);
        }
        break;

      case 'attention':
      default:
        // 注意力融合：加权组合
        const channelFeatures: number[][] = [];
        for (const [, values] of Object.entries(input.sensorData)) {
          channelFeatures.push(this.encodeChannel(values));
        }
        const attentionWeights = this.computeAttentionWeights(channelFeatures);
        const fusedDim = channelFeatures[0]?.length ?? 0;
        for (let d = 0; d < fusedDim; d++) {
          let weightedSum = 0;
          for (let c = 0; c < channelFeatures.length; c++) {
            weightedSum += (channelFeatures[c][d] ?? 0) * attentionWeights[c];
          }
          features.push(weightedSum);
        }
        break;
    }

    // 添加历史特征
    const historyFeatures = this.extractHistoryFeatures(input.historyDecisions);
    features.push(...historyFeatures);

    // 添加 KG 特征
    features.push(input.kgContext.entities.length);
    features.push(input.kgContext.relations.length);

    return features;
  }

  private encodeChannel(values: number[]): number[] {
    // 简化编码：统计特征
    if (values.length === 0) return [0, 0, 0, 0];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [mean, Math.sqrt(variance), min, max];
  }

  private computeAttentionWeights(channelFeatures: number[][]): number[] {
    if (channelFeatures.length === 0) return [];
    // 简化注意力：基于特征方差的权重
    const variances = channelFeatures.map(ch => {
      const mean = ch.reduce((a, b) => a + b, 0) / ch.length;
      return ch.reduce((a, b) => a + (b - mean) ** 2, 0) / ch.length;
    });
    const totalVar = variances.reduce((a, b) => a + b, 0) || 1;
    return variances.map(v => v / totalVar);
  }

  private extractHistoryFeatures(history: HistoricalDecision[]): number[] {
    const recent = history.slice(-this.config.historyWindowSize);
    if (recent.length === 0) return [0, 0, 0];
    const avgReward = recent.reduce((s, h) => s + h.reward, 0) / recent.length;
    const rewardTrend = recent.length > 1
      ? (recent[recent.length - 1].reward - recent[0].reward) / recent.length
      : 0;
    return [avgReward, rewardTrend, recent.length];
  }

  // ==========================================================================
  // 4. 神经规划器
  // ==========================================================================

  private async neuralPlanner(
    features: number[],
    futurePredictions: FuturePrediction[],
    input: MultiModalInput,
  ): Promise<{ action: Record<string, number>; confidence: number }> {
    // 基于特征和未来预测生成决策
    // 实际生产中这里接入真实的 ML 模型推理
    const featureMean = features.length > 0
      ? features.reduce((a, b) => a + b, 0) / features.length
      : 0;

    const featureStd = features.length > 0
      ? Math.sqrt(features.reduce((a, b) => a + (b - featureMean) ** 2, 0) / features.length)
      : 1;

    // 归一化决策
    const normalizedMean = Math.tanh(featureMean);
    const confidence = Math.min(1.0, 1.0 / (1.0 + featureStd));

    // 考虑未来预测
    let futureAdjustment = 0;
    if (futurePredictions.length > 0) {
      const avgFutureProb = futurePredictions.reduce((s, p) => s + p.probability, 0) / futurePredictions.length;
      futureAdjustment = (avgFutureProb - 0.5) * 0.2;
    }

    return {
      action: {
        primary_action: normalizedMean + futureAdjustment,
        secondary_action: normalizedMean * 0.5,
        safety_margin: Math.max(0.1, 1.0 - Math.abs(normalizedMean)),
      },
      confidence,
    };
  }

  // ==========================================================================
  // 5. 模型合并 (E30 - SLERP)
  // ==========================================================================

  static mergeModels(
    modelA: ModelWeights,
    modelB: ModelWeights,
    config: ModelMergeConfig,
  ): ModelWeights {
    const weightsA = Array.from(modelA.weights);
    const weightsB = Array.from(modelB.weights);
    const minLen = Math.min(weightsA.length, weightsB.length);
    const merged = new Float64Array(minLen);

    switch (config.method) {
      case 'slerp': {
        // 球面线性插值
        const dotProduct = weightsA.slice(0, minLen).reduce((s, a, i) => s + a * weightsB[i], 0);
        const normA = Math.sqrt(weightsA.slice(0, minLen).reduce((s, a) => s + a * a, 0));
        const normB = Math.sqrt(weightsB.slice(0, minLen).reduce((s, b) => s + b * b, 0));
        const cosTheta = Math.max(-1, Math.min(1, dotProduct / (normA * normB || 1)));
        const theta = Math.acos(cosTheta);
        const sinTheta = Math.sin(theta) || 1;
        const t = config.interpolationFactor;

        const factorA = Math.sin((1 - t) * theta) / sinTheta;
        const factorB = Math.sin(t * theta) / sinTheta;

        for (let i = 0; i < minLen; i++) {
          merged[i] = factorA * weightsA[i] + factorB * weightsB[i];
        }
        break;
      }

      case 'linear': {
        const t = config.interpolationFactor;
        for (let i = 0; i < minLen; i++) {
          merged[i] = (1 - t) * weightsA[i] + t * weightsB[i];
        }
        break;
      }

      case 'task_arithmetic': {
        // Task Arithmetic: base + t * (finetuned - base)
        const t = config.interpolationFactor;
        for (let i = 0; i < minLen; i++) {
          const taskVector = weightsB[i] - weightsA[i];
          merged[i] = weightsA[i] + t * taskVector;
        }
        break;
      }
    }

    return {
      modelId: `merged_${modelA.modelId}_${modelB.modelId}`,
      version: `${modelA.version}+${modelB.version}`,
      weights: merged,
      metadata: {
        mergeMethod: config.method,
        interpolationFactor: config.interpolationFactor,
        sourceA: modelA.modelId,
        sourceB: modelB.modelId,
        mergedAt: Date.now(),
      },
    };
  }

  // ==========================================================================
  // 6. 缓存管理
  // ==========================================================================

  private cacheDecision(decision: DecisionOutput): void {
    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > this.MAX_HISTORY) {
      this.decisionHistory = this.decisionHistory.slice(-this.MAX_HISTORY);
    }
  }

  getRecentDecisions(limit = 20): DecisionOutput[] {
    return this.decisionHistory.slice(-limit);
  }

  getConfig(): E2EAgentConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<E2EAgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
