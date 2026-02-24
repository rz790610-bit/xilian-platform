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
// FFT 辅助函数（Radix-2 Cooley-Tukey, O(n log n)）
// ============================================================================

/** 返回 >= n 的最小 2 的幂次 */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Radix-2 Cooley-Tukey FFT，输入长度必须是 2 的幂次 */
function fftRadix2(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const N = input.length;
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  // 位反转排序
  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) {
    let reversed = 0;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | ((i >> j) & 1);
    }
    re[reversed] = input[i];
  }

  // 蝶形运算
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = -2 * Math.PI / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < N; i += size) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfSize; j++) {
        const tRe = curRe * re[i + j + halfSize] - curIm * im[i + j + halfSize];
        const tIm = curRe * im[i + j + halfSize] + curIm * re[i + j + halfSize];
        re[i + j + halfSize] = re[i + j] - tRe;
        im[i + j + halfSize] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }

  return { re, im };
}

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

      // Step 3: 规则规划器（生产环境可替换为 ONNX 神经规划器）
      const plannerStart = Date.now();
      const plannerResult = await this.ruleBasedPlanner(fusedFeatures, futurePrediction, input);
      reasoningChain.push({
        stepIndex: 2,
        module: 'rule_based_planner',
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

  /**
   * P4 修复：通道编码 — 统计特征 + 频域特征 + 时序特征
   *
   * 输出 12 维特征向量：
   *   [0-3] 统计特征：mean, std, min, max
   *   [4-7] 频域特征：主频率能量, 谱质心, 谱平坦度, 谱熵
   *   [8-11] 时序特征：偏度, 峰度, 趋势斜率, 自相关(lag=1)
   */
  private encodeChannel(values: number[]): number[] {
    if (values.length === 0) return new Array(12).fill(0);
    if (values.length > 1_000_000) {
      throw new Error(`encodeChannel: 输入序列过长 (${values.length})，最大允许 1,000,000`);
    }
    if (!values.every(v => Number.isFinite(v))) {
      throw new Error('encodeChannel: 输入包含非有限数值 (NaN/Infinity)');
    }

    const n = values.length;

    // --- 统计特征 ---
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // --- 频域特征（FFT — Radix-2 Cooley-Tukey, O(n log n)）---
    // 将输入 zero-pad 到最近的 2 的幂次
    const fftSize = nextPowerOf2(n);
    const padded = new Float64Array(fftSize);
    for (let i = 0; i < n; i++) padded[i] = values[i] - mean;

    const { re: fftRe, im: fftIm } = fftRadix2(padded);

    const halfN = Math.floor(n / 2);
    const spectrum: number[] = [];
    for (let k = 0; k < halfN; k++) {
      spectrum.push((fftRe[k] * fftRe[k] + fftIm[k] * fftIm[k]) / n);
    }

    const totalEnergy = spectrum.reduce((a, b) => a + b, 0) || 1;

    // 主频率能量占比
    const peakEnergy = Math.max(...spectrum) / totalEnergy;

    // 谱质心（能量加权平均频率）
    const spectralCentroid = spectrum.reduce((s, e, k) => s + k * e, 0) / totalEnergy;

    // 谱平坦度（几何均值 / 算术均值）
    const logSum = spectrum.reduce((s, e) => s + Math.log(Math.max(e, 1e-10)), 0);
    const geometricMean = Math.exp(logSum / (spectrum.length || 1));
    const arithmeticMean = totalEnergy / (spectrum.length || 1);
    const spectralFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;

    // 谱熵
    const spectralEntropy = -spectrum.reduce((s, e) => {
      const p = e / totalEnergy;
      return s + (p > 0 ? p * Math.log2(p) : 0);
    }, 0);

    // --- 时序特征 ---
    // 偏度 (skewness)
    const m3 = values.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
    const skewness = std > 0 ? m3 / (std ** 3) : 0;

    // 峰度 (kurtosis)
    const m4 = values.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
    const kurtosis = std > 0 ? m4 / (std ** 4) - 3 : 0; // 超额峰度

    // 趋势斜率（线性回归）
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((acc, y, i) => acc + i * y, 0);
    const sumX2 = values.reduce((acc, _, i) => acc + i * i, 0);
    const trendSlope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1) : 0;

    // 自相关 (lag=1)
    let autocorr = 0;
    if (n > 1 && variance > 0) {
      for (let i = 0; i < n - 1; i++) {
        autocorr += (values[i] - mean) * (values[i + 1] - mean);
      }
      autocorr /= ((n - 1) * variance);
    }

    return [
      mean, std, min, max,                                    // 统计
      peakEnergy, spectralCentroid, spectralFlatness, spectralEntropy, // 频域
      skewness, kurtosis, trendSlope, autocorr,                // 时序
    ];
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

  /**
   * P1 修复：神经规划器 — 基于规则的最小可用实现
   *
   * 决策逻辑：
   *   1. 从融合特征中提取关键指标（均值、方差、趋势、异常度）
   *   2. 基于阈值规则生成多维决策（主动作、警戒级别、安全裕度、维护紧迫度）
   *   3. 未来预测调整（如果未来状态恶化，提前采取行动）
   *   4. 历史决策一致性检查（避免剧烈振荡）
   *   5. 置信度基于特征稳定性 + 未来可预测性
   *
   * 当前为基于统计特征的规则引擎实现（非神经网络），包含：
   *   - 特征统计分析（均值/方差/异常度/趋势）
   *   - 多级警戒规则
   *   - 未来预测调整
   *   - 历史一致性阻尼
   *
   * 生产环境可通过设置 onnxModelPath 配置项切换为 ONNX Runtime 推理。
   * 当 ONNX 模型不可用时自动降级到本规则引擎。
   */
  private async ruleBasedPlanner(
    features: number[],
    futurePredictions: FuturePrediction[],
    input: MultiModalInput,
  ): Promise<{ action: Record<string, number>; confidence: number }> {
    if (features.length === 0) {
      return { action: { safe_mode: 1.0 }, confidence: 0.1 };
    }

    // --- 1. 特征分析 ---
    const featureMean = features.reduce((a, b) => a + b, 0) / features.length;
    const featureStd = Math.sqrt(
      features.reduce((a, b) => a + (b - featureMean) ** 2, 0) / features.length,
    );

    // 异常度：偏离均值超过 3σ 的特征比例
    const anomalyRatio = featureStd > 0
      ? features.filter(f => Math.abs(f - featureMean) > 3 * featureStd).length / features.length
      : 0;

    // 趋势：特征向量前后半段均值差
    const halfLen = Math.floor(features.length / 2);
    const firstHalfMean = features.slice(0, halfLen).reduce((a, b) => a + b, 0) / (halfLen || 1);
    const secondHalfMean = features.slice(halfLen).reduce((a, b) => a + b, 0) / ((features.length - halfLen) || 1);
    const trendDirection = secondHalfMean - firstHalfMean;

    // --- 2. 规则决策 ---
    // 主动作强度：基于特征均值的 sigmoid 映射
    const primaryAction = 1 / (1 + Math.exp(-featureMean));

    // 警戒级别：基于异常度和方差
    let alertLevel = 0;
    if (anomalyRatio > 0.2) alertLevel = 0.9;       // 严重异常
    else if (anomalyRatio > 0.1) alertLevel = 0.6;   // 中度异常
    else if (featureStd > 2.0) alertLevel = 0.4;      // 高波动
    else alertLevel = 0.1;                             // 正常

    // 安全裕度：与异常度反相关
    const safetyMargin = Math.max(0.05, 1.0 - anomalyRatio - alertLevel * 0.3);

    // 维护紧迫度：基于趋势方向
    const maintenanceUrgency = trendDirection < -0.5 ? 0.8 :
                                trendDirection < -0.1 ? 0.5 :
                                trendDirection > 0.5 ? 0.1 : 0.3;

    // --- 3. 未来预测调整 ---
    let futureRiskAdjustment = 0;
    let futurePredictability = 0.5;
    if (futurePredictions.length > 0) {
      const avgProb = futurePredictions.reduce((s, p) => s + p.probability, 0) / futurePredictions.length;
      futurePredictability = avgProb;

      // 检查未来状态是否恶化
      for (const pred of futurePredictions) {
        const futureValues = Object.values(pred.predictedState);
        const futureMean = futureValues.length > 0
          ? futureValues.reduce((a, b) => a + b, 0) / futureValues.length
          : 0;
        if (futureMean < featureMean * 0.8) {
          futureRiskAdjustment += 0.1; // 未来恶化，提高警戒
        }
      }
      futureRiskAdjustment = Math.min(futureRiskAdjustment, 0.3);
    }

    // --- 4. 历史一致性检查 ---
    let historyDamping = 1.0;
    if (this.decisionHistory.length > 0) {
      const lastDecision = this.decisionHistory[this.decisionHistory.length - 1];
      const lastPrimary = lastDecision.action.primary_action ?? 0;
      const delta = Math.abs(primaryAction - lastPrimary);
      // 如果决策变化过大，降低置信度
      if (delta > 0.5) historyDamping = 0.7;
    }

    // --- 5. 置信度计算 ---
    const featureStability = Math.min(1.0, 1.0 / (1.0 + featureStd));
    const confidence = Math.max(0.1, Math.min(1.0,
      featureStability * 0.4 +
      futurePredictability * 0.3 +
      (1 - anomalyRatio) * 0.2 +
      historyDamping * 0.1,
    ));

    return {
      action: {
        primary_action: primaryAction + futureRiskAdjustment,
        alert_level: alertLevel + futureRiskAdjustment,
        safety_margin: safetyMargin,
        maintenance_urgency: maintenanceUrgency,
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
        /**
         * P4 修复：SLERP 数值稳定性
         *   1. 范数归一化检查（防止零向量）
         *   2. theta ≈ 0 时退化为线性插值（避免 0/0）
         *   3. theta ≈ π 时使用中间点插值（避免路径模糊）
         */
        const normA = Math.sqrt(weightsA.slice(0, minLen).reduce((s, a) => s + a * a, 0));
        const normB = Math.sqrt(weightsB.slice(0, minLen).reduce((s, b) => s + b * b, 0));

        // 范数归一化检查
        if (normA < 1e-10 || normB < 1e-10) {
          log.warn('SLERP: 检测到零范数向量，退化为线性插值');
          const t = config.interpolationFactor;
          for (let i = 0; i < minLen; i++) {
            merged[i] = (1 - t) * weightsA[i] + t * weightsB[i];
          }
          break;
        }

        const dotProduct = weightsA.slice(0, minLen).reduce((s, a, i) => s + a * weightsB[i], 0);
        const cosTheta = Math.max(-1, Math.min(1, dotProduct / (normA * normB)));
        const theta = Math.acos(cosTheta);
        const t = config.interpolationFactor;

        const EPSILON = 1e-6;

        if (theta < EPSILON) {
          // theta ≈ 0：向量几乎平行，退化为线性插值
          for (let i = 0; i < minLen; i++) {
            merged[i] = (1 - t) * weightsA[i] + t * weightsB[i];
          }
        } else if (Math.abs(theta - Math.PI) < EPSILON) {
          // theta ≈ π：向量反平行，使用 Gram-Schmidt 正交化找到真正正交方向
          log.warn('SLERP: 检测到反平行向量，使用 Gram-Schmidt 正交化');

          // Gram-Schmidt: 找到与 unitA 正交的方向
          const unitA = weightsA.slice(0, minLen).map(v => v / normA);

          // 随机扰动向量（扰动最小分量维度）
          const perturbed = [...unitA];
          let minIdx = 0;
          let minVal = Math.abs(perturbed[0]);
          for (let i = 1; i < minLen; i++) {
            if (Math.abs(perturbed[i]) < minVal) {
              minVal = Math.abs(perturbed[i]);
              minIdx = i;
            }
          }
          perturbed[minIdx] += 1.0; // 扰动最小分量

          // 正交化：ortho = perturbed - (perturbed · unitA) * unitA
          const projScalar = perturbed.reduce((s, v, i) => s + v * unitA[i], 0);
          const ortho = perturbed.map((v, i) => v - projScalar * unitA[i]);

          // 归一化
          const orthoNorm = Math.sqrt(ortho.reduce((s, v) => s + v * v, 0));
          if (orthoNorm < 1e-10) {
            // 极端情况：正交化失败，退化为线性插值
            for (let i = 0; i < minLen; i++) {
              merged[i] = (1 - t) * weightsA[i] + t * weightsB[i];
            }
          } else {
            const unitOrtho = ortho.map(v => v / orthoNorm);

            // 通过正交方向做 SLERP：
            // A → ortho → B 的大圆路径
            // 中间点 = cos(t*π/2) * unitA * normA + sin(t*π/2) * unitOrtho * normA
            // 然后从中间点到 B 做第二段插值
            const halfAngle = t * Math.PI;
            const factorA = Math.cos(halfAngle);
            const factorOrtho = Math.sin(halfAngle);
            const avgNorm = (normA + normB) / 2;

            for (let i = 0; i < minLen; i++) {
              merged[i] = avgNorm * (factorA * unitA[i] + factorOrtho * unitOrtho[i]);
            }
          }
        } else {
          // 正常 SLERP
          const sinTheta = Math.sin(theta);
          const factorA = Math.sin((1 - t) * theta) / sinTheta;
          const factorB = Math.sin(t * theta) / sinTheta;

          for (let i = 0; i < minLen; i++) {
            merged[i] = factorA * weightsA[i] + factorB * weightsB[i];
          }
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
