/**
 * ============================================================================
 * 世界模型 (World Model) — 设备数字孪生的"大脑"
 * ============================================================================
 *
 * 核心能力：
 *   1. 状态预测 (predict)：输入当前状态向量 → 输出未来 N 步状态轨迹
 *   2. 反事实推理 (counterfactual)：如果改变某参数，结果会怎样？
 *   3. 异常预判 (anticipate)：基于预测轨迹提前发现潜在风险
 *   4. 场景模拟 (simulate)：模拟极端工况（高风+偏心+疲劳叠加）
 *
 * 物理约束：
 *   - 风载力矩：M_wind = ½ρv²·A·h/2
 *   - 疲劳增量：Δσ = k × M / W
 *   - S-N 曲线寿命：N = C / (Δσ)^m
 *   - 腐蚀速率：r = k·[Cl⁻]·[humidity]
 *   - 倾覆安全系数：K = M_stabilizing / M_overturning
 *
 * 架构：
 *   物理引擎（确定性） + 统计模型（不确定性） + Grok 推理（解释性）
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface WorldModelConfig {
  /** 预测步长 (秒) */
  predictionStepSec: number;
  /** 预测范围 (步数) */
  predictionHorizon: number;
  /** 物理模型参数 */
  physicsParams: PhysicsModelParams;
  /** 统计模型参数 */
  statisticalParams: StatisticalModelParams;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 异常预判提前量 (步数) */
  anomalyLookahead: number;
}

export interface PhysicsModelParams {
  /** 空气密度 (kg/m³) */
  airDensity: number;
  /** 迎风面积 (m²) */
  windwardArea: number;
  /** 臂架高度 (m) */
  boomHeight: number;
  /** 结构截面模量 (m³) */
  sectionModulus: number;
  /** 应力集中系数 */
  stressConcentrationFactor: number;
  /** S-N 曲线参数 C */
  snCurveC: number;
  /** S-N 曲线参数 m */
  snCurveM: number;
  /** 腐蚀速率常数 */
  corrosionRateConstant: number;
  /** 稳定力矩 (kN·m) */
  stabilizingMoment: number;
  /** 摩擦系数 */
  frictionCoefficient: number;
}

export interface StatisticalModelParams {
  /** 状态转移矩阵权重 */
  transitionWeights: number[];
  /** 噪声方差 */
  processNoise: number;
  /** 观测噪声 */
  observationNoise: number;
  /** 衰减因子 */
  decayFactor: number;
}

export interface StateVector {
  timestamp: number;
  values: Record<string, number>;
}

export interface PredictionResult {
  /** 预测轨迹 */
  trajectory: StateVector[];
  /** 各步置信度 */
  confidences: number[];
  /** 预测方法 */
  method: 'physics' | 'statistical' | 'hybrid';
  /** 预测耗时 (ms) */
  durationMs: number;
}

export interface CounterfactualResult {
  /** 原始预测 */
  baseline: PredictionResult;
  /** 反事实预测 */
  counterfactual: PredictionResult;
  /** 差异分析 */
  delta: Record<string, number[]>;
  /** 影响评估 */
  impact: {
    affectedDimensions: string[];
    maxDeltaPercent: number;
    riskChange: 'increased' | 'decreased' | 'unchanged';
    explanation: string;
  };
}

export interface AnomalyAnticipation {
  /** 是否预判到异常 */
  anomalyDetected: boolean;
  /** 预计发生时间 (步数) */
  estimatedStepToAnomaly: number | null;
  /** 异常类型 */
  anomalyType: string | null;
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  /** 触发维度 */
  triggerDimensions: string[];
  /** 物理解释 */
  physicsExplanation: string;
  /** 建议动作 */
  suggestedActions: string[];
}

export interface SimulationScenario {
  name: string;
  description: string;
  /** 参数覆盖 */
  parameterOverrides: Record<string, number>;
  /** 持续时间 (步数) */
  durationSteps: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: WorldModelConfig = {
  predictionStepSec: 60,
  predictionHorizon: 30,
  physicsParams: {
    airDensity: 1.225,
    windwardArea: 120,
    boomHeight: 45,
    sectionModulus: 0.05,
    stressConcentrationFactor: 2.5,
    snCurveC: 1e12,
    snCurveM: 3,
    corrosionRateConstant: 0.001,
    stabilizingMoment: 50000,
    frictionCoefficient: 0.15,
  },
  statisticalParams: {
    transitionWeights: [0.7, 0.2, 0.1],
    processNoise: 0.01,
    observationNoise: 0.05,
    decayFactor: 0.95,
  },
  confidenceThreshold: 0.6,
  anomalyLookahead: 10,
};

// ============================================================================
// 阈值定义
// ============================================================================

const ANOMALY_THRESHOLDS: Record<string, { warning: number; critical: number; unit: string }> = {
  vibrationRms: { warning: 2.8, critical: 4.5, unit: 'mm/s' },
  motorCurrentMean: { warning: 80, critical: 100, unit: 'A' },
  windSpeedMean: { warning: 9, critical: 13, unit: 'm/s' },
  fatigueAccumPercent: { warning: 60, critical: 80, unit: '%' },
  corrosionIndex: { warning: 0.5, critical: 0.7, unit: '' },
  temperatureBearing: { warning: 60, critical: 80, unit: '°C' },
  overturningRisk: { warning: 0.15, critical: 0.20, unit: '' },
};

// ============================================================================
// 世界模型
// ============================================================================

export class WorldModel {
  private config: WorldModelConfig;
  private stateHistory: StateVector[] = [];
  private maxHistoryLength: number = 1000;

  constructor(config: Partial<WorldModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 状态预测 — 输入当前状态，输出未来 N 步轨迹
   */
  predict(currentState: StateVector, horizon?: number): PredictionResult {
    const startTime = Date.now();
    const steps = horizon ?? this.config.predictionHorizon;
    const trajectory: StateVector[] = [currentState];
    const confidences: number[] = [1.0];

    let prevState = currentState;

    for (let step = 1; step <= steps; step++) {
      const nextState = this.predictNextStep(prevState, step);
      trajectory.push(nextState);

      // 置信度随步数衰减
      const confidence = Math.pow(this.config.statisticalParams.decayFactor, step);
      confidences.push(confidence);

      prevState = nextState;
    }

    return {
      trajectory,
      confidences,
      method: 'hybrid',
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 反事实推理 — 如果改变某参数，结果会怎样？
   */
  counterfactual(
    currentState: StateVector,
    parameterChanges: Record<string, number>,
    horizon?: number
  ): CounterfactualResult {
    // 基线预测
    const baseline = this.predict(currentState, horizon);

    // 构建反事实初始状态
    const cfState: StateVector = {
      timestamp: currentState.timestamp,
      values: { ...currentState.values, ...parameterChanges },
    };

    // 反事实预测
    const counterfactual = this.predict(cfState, horizon);

    // 差异分析
    const delta: Record<string, number[]> = {};
    const allKeys = new Set([
      ...Object.keys(baseline.trajectory[0]?.values || {}),
      ...Object.keys(counterfactual.trajectory[0]?.values || {}),
    ]);

    for (const key of allKeys) {
      delta[key] = [];
      for (let i = 0; i < baseline.trajectory.length; i++) {
        const bv = baseline.trajectory[i]?.values[key] ?? 0;
        const cv = counterfactual.trajectory[i]?.values[key] ?? 0;
        delta[key].push(cv - bv);
      }
    }

    // 影响评估
    const affectedDimensions: string[] = [];
    let maxDeltaPercent = 0;

    for (const [key, deltas] of Object.entries(delta)) {
      const maxDelta = Math.max(...deltas.map(Math.abs));
      const baselineMax = Math.max(...baseline.trajectory.map(s => Math.abs(s.values[key] ?? 0)), 1);
      const pct = (maxDelta / baselineMax) * 100;
      if (pct > 5) {
        affectedDimensions.push(key);
        maxDeltaPercent = Math.max(maxDeltaPercent, pct);
      }
    }

    // 风险变化判断
    const baselineRisk = this.assessOverallRisk(baseline.trajectory[baseline.trajectory.length - 1]);
    const cfRisk = this.assessOverallRisk(counterfactual.trajectory[counterfactual.trajectory.length - 1]);
    const riskChange = cfRisk > baselineRisk + 0.05 ? 'increased'
      : cfRisk < baselineRisk - 0.05 ? 'decreased'
      : 'unchanged';

    return {
      baseline,
      counterfactual,
      delta,
      impact: {
        affectedDimensions,
        maxDeltaPercent,
        riskChange,
        explanation: this.generateCounterfactualExplanation(parameterChanges, affectedDimensions, riskChange),
      },
    };
  }

  /**
   * 异常预判 — 基于预测轨迹提前发现潜在风险
   */
  anticipateAnomaly(currentState: StateVector): AnomalyAnticipation {
    const prediction = this.predict(currentState, this.config.anomalyLookahead);

    for (let step = 0; step < prediction.trajectory.length; step++) {
      const state = prediction.trajectory[step];
      const anomaly = this.checkAnomalyThresholds(state);

      if (anomaly) {
        return {
          anomalyDetected: true,
          estimatedStepToAnomaly: step,
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          triggerDimensions: anomaly.dimensions,
          physicsExplanation: this.generatePhysicsExplanation(state, anomaly),
          suggestedActions: this.generateSuggestedActions(anomaly),
        };
      }
    }

    return {
      anomalyDetected: false,
      estimatedStepToAnomaly: null,
      anomalyType: null,
      severity: null,
      triggerDimensions: [],
      physicsExplanation: '当前状态在预测范围内保持正常',
      suggestedActions: [],
    };
  }

  /**
   * 场景模拟 — 模拟极端工况
   */
  simulate(currentState: StateVector, scenario: SimulationScenario): PredictionResult {
    const modifiedState: StateVector = {
      timestamp: currentState.timestamp,
      values: { ...currentState.values, ...scenario.parameterOverrides },
    };

    return this.predict(modifiedState, scenario.durationSteps);
  }

  /**
   * 记录状态历史
   */
  recordState(state: StateVector): void {
    this.stateHistory.push(state);
    if (this.stateHistory.length > this.maxHistoryLength) {
      this.stateHistory.shift();
    }
  }

  // ============================================================================
  // 物理模型
  // ============================================================================

  /**
   * 预测下一步状态
   */
  private predictNextStep(current: StateVector, stepIndex: number): StateVector {
    const pp = this.config.physicsParams;
    const sp = this.config.statisticalParams;
    const v = current.values;
    const next: Record<string, number> = { ...v };
    const dt = this.config.predictionStepSec;

    // 风速预测（AR(1) + 随机扰动）
    const windSpeed = v['windSpeedMean'] ?? 0;
    next['windSpeedMean'] = windSpeed * 0.98 + sp.processNoise * (Math.random() - 0.5) * 2;

    // 风载力矩 M_wind = ½ρv²·A·h/2
    const windMoment = 0.5 * pp.airDensity * Math.pow(next['windSpeedMean'], 2) * pp.windwardArea * pp.boomHeight / 2;
    next['windMoment'] = windMoment;

    // 倾覆安全系数 K = M_stab / M_overturn
    const loadMoment = (v['loadWeight'] ?? 0) * 9.81 * (v['loadEccentricity'] ?? 0) * pp.boomHeight;
    const totalOverturningMoment = windMoment + loadMoment;
    next['overturningRisk'] = totalOverturningMoment > 0
      ? totalOverturningMoment / pp.stabilizingMoment
      : 0;

    // 疲劳增量 Δσ = k × M / W
    const totalMoment = windMoment + loadMoment;
    const fatigueIncrement = pp.stressConcentrationFactor * totalMoment / (pp.sectionModulus * 1e6);
    const currentFatigue = v['fatigueAccumPercent'] ?? 0;
    // S-N 曲线寿命消耗
    const nCycles = pp.snCurveC / Math.pow(Math.max(fatigueIncrement, 0.1), pp.snCurveM);
    const fatigueIncrementPercent = (1 / nCycles) * 100 * (dt / 120); // 按周期比例
    next['fatigueAccumPercent'] = Math.min(100, currentFatigue + fatigueIncrementPercent);

    // 腐蚀速率 r = k·[Cl⁻]·[humidity]
    const chloride = v['chlorideConcentration'] ?? 10;
    const humidity = v['ambientHumidity'] ?? 60;
    const corrosionRate = pp.corrosionRateConstant * chloride * (humidity / 100);
    next['corrosionIndex'] = Math.min(1, (v['corrosionIndex'] ?? 0) + corrosionRate * dt / 3600);

    // 轴承温度预测（热传导简化模型）
    const motorCurrent = v['motorCurrentMean'] ?? 0;
    const heatGeneration = motorCurrent * motorCurrent * 0.001; // I²R 简化
    const heatDissipation = ((v['temperatureBearing'] ?? 25) - 25) * 0.05;
    next['temperatureBearing'] = (v['temperatureBearing'] ?? 25) + (heatGeneration - heatDissipation) * dt / 60;

    // 振动预测（基于负载和磨损）
    const baseVibration = v['vibrationRms'] ?? 1;
    const wearFactor = 1 + (v['fatigueAccumPercent'] ?? 0) / 200;
    next['vibrationRms'] = baseVibration * wearFactor + sp.processNoise * (Math.random() - 0.5);

    // 电机电流预测
    const baseCurrent = v['motorCurrentMean'] ?? 60;
    const loadFactor = 1 + (v['loadWeight'] ?? 0) / 50;
    next['motorCurrentMean'] = baseCurrent * loadFactor * (1 + sp.processNoise * (Math.random() - 0.5) * 0.1);

    next['timestamp'] = current.timestamp + dt * 1000;

    return {
      timestamp: current.timestamp + dt * 1000,
      values: next,
    };
  }

  /**
   * 检查异常阈值
   */
  private checkAnomalyThresholds(state: StateVector): {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    dimensions: string[];
  } | null {
    const criticalDimensions: string[] = [];
    const warningDimensions: string[] = [];

    for (const [key, thresholds] of Object.entries(ANOMALY_THRESHOLDS)) {
      const value = state.values[key];
      if (value === undefined) continue;

      if (value >= thresholds.critical) {
        criticalDimensions.push(key);
      } else if (value >= thresholds.warning) {
        warningDimensions.push(key);
      }
    }

    if (criticalDimensions.length > 0) {
      return {
        type: criticalDimensions.length > 1 ? 'multi_dimension_critical' : `${criticalDimensions[0]}_critical`,
        severity: criticalDimensions.length > 1 ? 'critical' : 'high',
        dimensions: criticalDimensions,
      };
    }

    if (warningDimensions.length >= 2) {
      return {
        type: 'multi_dimension_warning',
        severity: 'medium',
        dimensions: warningDimensions,
      };
    }

    return null;
  }

  /**
   * 评估总体风险
   */
  private assessOverallRisk(state: StateVector): number {
    let risk = 0;
    let count = 0;

    for (const [key, thresholds] of Object.entries(ANOMALY_THRESHOLDS)) {
      const value = state.values[key];
      if (value === undefined) continue;

      const normalizedRisk = Math.min(1, value / thresholds.critical);
      risk += normalizedRisk;
      count++;
    }

    return count > 0 ? risk / count : 0;
  }

  /**
   * 生成物理解释
   */
  private generatePhysicsExplanation(
    state: StateVector,
    anomaly: { type: string; dimensions: string[] }
  ): string {
    const explanations: string[] = [];

    for (const dim of anomaly.dimensions) {
      const value = state.values[dim];
      switch (dim) {
        case 'overturningRisk':
          explanations.push(
            `倾覆风险 ${(value * 100).toFixed(1)}%：风载力矩 M_wind = ½×${this.config.physicsParams.airDensity}×v²×${this.config.physicsParams.windwardArea}×${this.config.physicsParams.boomHeight}/2，` +
            `叠加货物偏心力矩，总倾覆力矩/稳定力矩 = ${value.toFixed(3)}`
          );
          break;
        case 'fatigueAccumPercent':
          explanations.push(
            `疲劳累积 ${value.toFixed(1)}%：基于 S-N 曲线 N = ${this.config.physicsParams.snCurveC}/(Δσ)^${this.config.physicsParams.snCurveM}，` +
            `应力集中系数 k=${this.config.physicsParams.stressConcentrationFactor}`
          );
          break;
        case 'vibrationRms':
          explanations.push(`振动 RMS ${value.toFixed(2)} mm/s：超过 ISO 10816-3 标准阈值`);
          break;
        case 'temperatureBearing':
          explanations.push(`轴承温度 ${value.toFixed(1)}°C：I²R 热效应累积`);
          break;
        case 'corrosionIndex':
          explanations.push(
            `腐蚀指数 ${value.toFixed(3)}：r = ${this.config.physicsParams.corrosionRateConstant}×[Cl⁻]×[humidity]`
          );
          break;
        default:
          explanations.push(`${dim} = ${value}`);
      }
    }

    return explanations.join('；');
  }

  /**
   * 生成反事实解释
   */
  private generateCounterfactualExplanation(
    changes: Record<string, number>,
    affected: string[],
    riskChange: string
  ): string {
    const changeDesc = Object.entries(changes)
      .map(([k, v]) => `${k}→${v}`)
      .join(', ');

    return `参数变更 [${changeDesc}] 影响 ${affected.length} 个维度 (${affected.join(', ')})，` +
      `总体风险${riskChange === 'increased' ? '上升' : riskChange === 'decreased' ? '下降' : '不变'}`;
  }

  /**
   * 生成建议动作
   */
  private generateSuggestedActions(anomaly: { type: string; severity: string; dimensions: string[] }): string[] {
    const actions: string[] = [];

    if (anomaly.dimensions.includes('overturningRisk')) {
      actions.push('立即降低作业速度或暂停作业');
      actions.push('检查货物偏心状态，必要时重新对位');
    }
    if (anomaly.dimensions.includes('fatigueAccumPercent')) {
      actions.push('安排结构检测（超声/磁粉探伤）');
      actions.push('降低作业载荷或缩短连续作业时间');
    }
    if (anomaly.dimensions.includes('vibrationRms')) {
      actions.push('检查轴承润滑状态');
      actions.push('检查齿轮箱啮合间隙');
    }
    if (anomaly.dimensions.includes('temperatureBearing')) {
      actions.push('检查冷却系统运行状态');
      actions.push('降低电机负载');
    }
    if (anomaly.dimensions.includes('windSpeedMean')) {
      actions.push('启动防风锚定程序');
      actions.push('限制臂架仰角');
    }

    if (anomaly.severity === 'critical') {
      actions.unshift('触发紧急停机程序');
    }

    return actions;
  }

  /**
   * 获取内置模拟场景
   */
  static getBuiltinScenarios(): SimulationScenario[] {
    return [
      {
        name: '台风场景',
        description: '模拟台风来袭时的设备状态（风速 15-25 m/s + 阵风）',
        parameterOverrides: { windSpeedMean: 18, windGustMax: 25, vesselMotion: 5 },
        durationSteps: 60,
      },
      {
        name: '重载偏心场景',
        description: '模拟货物严重偏心（偏心度 0.6 + 重载 40 吨）',
        parameterOverrides: { loadWeight: 40, loadEccentricity: 0.6 },
        durationSteps: 30,
      },
      {
        name: '疲劳极限场景',
        description: '模拟疲劳累积接近极限（80%+）时的连续作业',
        parameterOverrides: { fatigueAccumPercent: 82, vibrationRms: 3.5 },
        durationSteps: 60,
      },
      {
        name: '盐雾腐蚀加速场景',
        description: '模拟高盐雾环境下的加速腐蚀',
        parameterOverrides: { chlorideConcentration: 80, ambientHumidity: 95 },
        durationSteps: 120,
      },
      {
        name: '多因素叠加极端场景',
        description: '模拟高风+偏心+疲劳+高温多因素叠加',
        parameterOverrides: {
          windSpeedMean: 12, loadEccentricity: 0.4,
          fatigueAccumPercent: 70, temperatureBearing: 65,
        },
        durationSteps: 30,
      },
    ];
  }

  /**
   * 更新物理参数
   */
  updatePhysicsParams(params: Partial<PhysicsModelParams>): void {
    Object.assign(this.config.physicsParams, params);
  }

  /**
   * 获取状态历史
   */
  getStateHistory(): StateVector[] {
    return [...this.stateHistory];
  }
}
