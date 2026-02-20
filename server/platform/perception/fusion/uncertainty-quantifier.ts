/**
 * ============================================================================
 * 不确定性量化器 — 多维不确定性评估
 * ============================================================================
 *
 * 量化维度：
 *   1. 数据不确定性（传感器噪声、缺失、延迟）
 *   2. 模型不确定性（预测置信度、分布外检测）
 *   3. 环境不确定性（风速变化、温度梯度、盐雾）
 *   4. 操作不确定性（货物偏心、吊具摩擦、船舶晃动）
 *
 * 输出：
 *   综合不确定性分数 U ∈ [0, 1]
 *   各维度不确定性分解
 *   置信区间
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface UncertaintyInput {
  /** 数据质量指标 */
  dataQuality: {
    sensorNoise: number;         // 传感器噪声水平 (0-1)
    missingRate: number;         // 数据缺失率 (0-1)
    latencyMs: number;           // 数据延迟 (ms)
    outlierRate: number;         // 异常值比例 (0-1)
  };
  /** 环境因素 */
  environmental: {
    windSpeed: number;           // 风速 (m/s)
    windGust: number;            // 阵风 (m/s)
    temperature: number;         // 温度 (°C)
    humidity: number;            // 湿度 (%)
    chlorideConcentration: number; // 氯离子浓度 (mg/L)
  };
  /** 操作因素 */
  operational: {
    loadEccentricity: number;    // 货物偏心度 (0-1)
    spreaderFriction: number;    // 吊具摩擦系数
    vesselMotion: number;        // 船舶晃动幅度 (degrees)
    cyclePhase: string;          // 当前工况阶段
  };
  /** 模型因素 */
  model?: {
    predictionConfidence: number; // 预测置信度 (0-1)
    isOutOfDistribution: boolean; // 是否分布外
    calibrationError: number;     // 校准误差
  };
}

export interface UncertaintyResult {
  /** 综合不确定性分数 (0-1, 越高越不确定) */
  totalUncertainty: number;
  /** 各维度分解 */
  dimensions: {
    data: number;
    environmental: number;
    operational: number;
    model: number;
  };
  /** 各维度权重 */
  weights: {
    data: number;
    environmental: number;
    operational: number;
    model: number;
  };
  /** 置信区间 */
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
  /** 主要不确定性来源 */
  dominantSource: string;
  /** 建议 */
  recommendations: string[];
}

// ============================================================================
// 不确定性量化器
// ============================================================================

export class UncertaintyQuantifier {
  private weights: { data: number; environmental: number; operational: number; model: number };

  constructor(weights?: Partial<typeof UncertaintyQuantifier.prototype.weights>) {
    this.weights = {
      data: 0.25,
      environmental: 0.30,
      operational: 0.30,
      model: 0.15,
      ...weights,
    };
  }

  /**
   * 量化综合不确定性
   */
  quantify(input: UncertaintyInput): UncertaintyResult {
    // 各维度不确定性计算
    const dataU = this.quantifyData(input.dataQuality);
    const envU = this.quantifyEnvironmental(input.environmental);
    const opU = this.quantifyOperational(input.operational);
    const modelU = input.model ? this.quantifyModel(input.model) : 0.5;

    // 加权综合
    const totalUncertainty = this.clamp(
      this.weights.data * dataU +
      this.weights.environmental * envU +
      this.weights.operational * opU +
      this.weights.model * modelU
    );

    // 主要来源
    const sources = [
      { name: 'data', value: dataU * this.weights.data },
      { name: 'environmental', value: envU * this.weights.environmental },
      { name: 'operational', value: opU * this.weights.operational },
      { name: 'model', value: modelU * this.weights.model },
    ];
    sources.sort((a, b) => b.value - a.value);

    // 置信区间（基于 Beta 分布近似）
    const alpha = (1 - totalUncertainty) * 20;
    const beta = totalUncertainty * 20;
    const ci = this.betaConfidenceInterval(alpha, beta, 0.95);

    // 建议
    const recommendations = this.generateRecommendations(
      { data: dataU, environmental: envU, operational: opU, model: modelU }
    );

    return {
      totalUncertainty,
      dimensions: { data: dataU, environmental: envU, operational: opU, model: modelU },
      weights: { ...this.weights },
      confidenceInterval: { lower: ci.lower, upper: ci.upper, level: 0.95 },
      dominantSource: sources[0].name,
      recommendations,
    };
  }

  /**
   * 数据不确定性
   */
  private quantifyData(quality: UncertaintyInput['dataQuality']): number {
    const noiseU = quality.sensorNoise;
    const missingU = quality.missingRate;
    const latencyU = this.sigmoid(quality.latencyMs, 1000, 0.005); // 1000ms 为中点
    const outlierU = quality.outlierRate * 2; // 异常值影响放大

    return this.clamp(0.3 * noiseU + 0.3 * missingU + 0.2 * latencyU + 0.2 * outlierU);
  }

  /**
   * 环境不确定性
   */
  private quantifyEnvironmental(env: UncertaintyInput['environmental']): number {
    // 风速不确定性（>9m/s 显著增加）
    const windU = this.sigmoid(env.windSpeed, 9, 0.5);
    // 阵风不确定性
    const gustU = this.sigmoid(env.windGust - env.windSpeed, 3, 0.8);
    // 温度极端不确定性
    const tempU = Math.max(this.sigmoid(env.temperature, 40, 0.3), this.sigmoid(-env.temperature, -5, 0.3));
    // 盐雾腐蚀不确定性
    const corrosionU = this.sigmoid(env.chlorideConcentration, 50, 0.05);

    return this.clamp(0.4 * windU + 0.2 * gustU + 0.15 * tempU + 0.25 * corrosionU);
  }

  /**
   * 操作不确定性
   */
  private quantifyOperational(op: UncertaintyInput['operational']): number {
    const eccentricityU = op.loadEccentricity;
    const frictionU = this.sigmoid(op.spreaderFriction, 0.3, 10);
    const vesselU = this.sigmoid(op.vesselMotion, 2, 1);

    // 工况阶段影响
    const phaseMultiplier: Record<string, number> = {
      'idle': 0.3,
      'hoisting': 0.7,
      'traversing': 0.8,
      'traversing_end': 1.0,
      'locking': 0.6,
      'emergency_brake': 1.0,
    };
    const phaseFactor = phaseMultiplier[op.cyclePhase] ?? 0.5;

    return this.clamp(
      phaseFactor * (0.35 * eccentricityU + 0.30 * frictionU + 0.35 * vesselU)
    );
  }

  /**
   * 模型不确定性
   */
  private quantifyModel(model: NonNullable<UncertaintyInput['model']>): number {
    const confidenceU = 1 - model.predictionConfidence;
    const oodU = model.isOutOfDistribution ? 0.8 : 0;
    const calibrationU = model.calibrationError;

    return this.clamp(0.4 * confidenceU + 0.35 * oodU + 0.25 * calibrationU);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(dimensions: Record<string, number>): string[] {
    const recs: string[] = [];

    if (dimensions.data > 0.6) {
      recs.push('数据质量较差，建议检查传感器校准状态和网络连接');
    }
    if (dimensions.environmental > 0.7) {
      recs.push('环境不确定性高，建议增加采样频率并启用高频监测模式');
    }
    if (dimensions.operational > 0.7) {
      recs.push('操作不确定性高，建议降低作业速度或暂停高风险操作');
    }
    if (dimensions.model > 0.6) {
      recs.push('模型预测置信度低，建议使用规则引擎作为备份决策');
    }

    return recs;
  }

  // ============================================================================
  // 数学辅助
  // ============================================================================

  private sigmoid(x: number, midpoint: number, steepness: number): number {
    return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
  }

  private clamp(value: number, min: number = 0, max: number = 1): number {
    return Math.max(min, Math.min(max, value));
  }

  private betaConfidenceInterval(
    alpha: number,
    beta: number,
    level: number
  ): { lower: number; upper: number } {
    // 简化近似（正态近似 Beta 分布）
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const std = Math.sqrt(variance);
    const z = 1.96; // 95% CI

    return {
      lower: this.clamp(mean - z * std),
      upper: this.clamp(mean + z * std),
    };
  }

  /**
   * 更新权重
   */
  updateWeights(weights: Partial<typeof this.weights>): void {
    Object.assign(this.weights, weights);
    // 归一化
    const sum = this.weights.data + this.weights.environmental + this.weights.operational + this.weights.model;
    this.weights.data /= sum;
    this.weights.environmental /= sum;
    this.weights.operational /= sum;
    this.weights.model /= sum;
  }
}
