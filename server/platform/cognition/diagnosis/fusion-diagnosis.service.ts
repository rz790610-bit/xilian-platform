/**
 * ============================================================================
 * 四维融合诊断服务 — 安全·健康·高效·预测
 * ============================================================================
 *
 * 四维处理流：
 *   1. 安全诊断：反事实推演（如果继续高风+偏心，倾覆概率？阈值>20%触发警戒）
 *   2. 健康诊断：疲劳累积预测（S-N曲线 + Bayesian更新：维修历史估N寿命，盐雾腐蚀加速）
 *   3. 高效诊断：周期瓶颈分析（开闭锁延时因摩擦大，建议调吊具压力）
 *   4. 预测诊断：端到端神经模型（Transformer输入状态向量，输出未来轨迹）
 *
 * 输出：
 *   DiagnosisReport（JSON）：
 *   {
 *     safetyScore: 0.95,
 *     healthRemainingLife: 72,  // days
 *     efficiencySuggestion: '限速10%',
 *     predictedTrajectory: [...],
 *     overallRiskLevel: 'medium',
 *     recommendations: [...]
 *   }
 */

import { WorldModel, type StateVector, type AnomalyAnticipation } from '../worldmodel/world-model';

// ============================================================================
// 类型定义
// ============================================================================

export interface DiagnosisReport {
  /** 报告 ID */
  reportId: string;
  /** 设备 ID */
  machineId: string;
  /** 时间戳 */
  timestamp: number;
  /** 工况阶段 */
  cyclePhase: string;

  /** 安全维度 */
  safety: SafetyDiagnosis;
  /** 健康维度 */
  health: HealthDiagnosis;
  /** 高效维度 */
  efficiency: EfficiencyDiagnosis;
  /** 预测维度 */
  prediction: PredictionDiagnosis;

  /** 综合风险等级 */
  overallRiskLevel: 'safe' | 'caution' | 'warning' | 'danger' | 'critical';
  /** 综合分数 (0-100) */
  overallScore: number;
  /** 综合建议 */
  recommendations: Recommendation[];
  /** 诊断耗时 (ms) */
  durationMs: number;
}

export interface SafetyDiagnosis {
  /** 安全分数 (0-1) */
  score: number;
  /** 倾覆风险 */
  overturningRisk: number;
  /** 风载力矩 (kN·m) */
  windLoadMoment: number;
  /** 货物偏心力矩 (kN·m) */
  eccentricityMoment: number;
  /** 安全系数 K */
  safetyFactor: number;
  /** 反事实分析结果 */
  counterfactualAnalysis: {
    scenario: string;
    baselineRisk: number;
    worstCaseRisk: number;
    riskIncrease: number;
  }[];
  /** 警戒状态 */
  alertLevel: 'none' | 'watch' | 'warning' | 'alarm';
}

export interface HealthDiagnosis {
  /** 健康分数 (0-1) */
  score: number;
  /** 疲劳累积 (%) */
  fatigueAccumPercent: number;
  /** 疲劳增量 (MPa) */
  fatigueIncrementMPa: number;
  /** 剩余寿命 (天) */
  remainingLifeDays: number;
  /** S-N 曲线剩余循环数 */
  remainingCycles: number;
  /** 腐蚀指数 (0-1) */
  corrosionIndex: number;
  /** 腐蚀速率 (mm/year) */
  corrosionRateMmPerYear: number;
  /** 轴承健康 */
  bearingHealth: {
    temperature: number;
    vibrationRms: number;
    status: 'good' | 'fair' | 'poor' | 'critical';
  };
  /** 维修建议时间 */
  suggestedMaintenanceDate: string | null;
}

export interface EfficiencyDiagnosis {
  /** 效率分数 (0-1) */
  score: number;
  /** 当前周期时间 (秒) */
  currentCycleTime: number;
  /** 基准周期时间 (秒) */
  baselineCycleTime: number;
  /** 偏差百分比 */
  deviationPercent: number;
  /** 瓶颈分析 */
  bottlenecks: BottleneckAnalysis[];
  /** 功率因数 */
  powerFactor: number;
  /** 能耗评估 */
  energyEfficiency: number;
  /** 优化建议 */
  optimizationSuggestions: string[];
}

export interface BottleneckAnalysis {
  phase: string;
  actualDuration: number;
  expectedDuration: number;
  deviationPercent: number;
  rootCause: string;
  suggestion: string;
}

export interface PredictionDiagnosis {
  /** 预测置信度 */
  confidence: number;
  /** 异常预判 */
  anomalyAnticipation: AnomalyAnticipation;
  /** 未来状态摘要 */
  futureStateSummary: {
    step: number;
    timestamp: number;
    riskLevel: string;
    keyMetrics: Record<string, number>;
  }[];
  /** 预测方法 */
  method: string;
}

export interface Recommendation {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  dimension: 'safety' | 'health' | 'efficiency' | 'prediction';
  action: string;
  reason: string;
  deadline: string;
  estimatedImpact: string;
}

// ============================================================================
// 融合诊断服务
// ============================================================================

export class FusionDiagnosisService {
  private worldModel: WorldModel;

  // 基准参数（可配置）
  private baselineCycleTime: number = 120; // 秒
  private physicsParams = {
    airDensity: 1.225,
    windwardArea: 120,
    boomHeight: 45,
    sectionModulus: 0.05,
    stressConcentrationFactor: 2.5,
    snCurveC: 1e12,
    snCurveM: 3,
    corrosionRateConstant: 0.001,
    stabilizingMoment: 50000,
  };

  constructor(worldModel?: WorldModel) {
    this.worldModel = worldModel || new WorldModel();
  }

  /**
   * 执行四维融合诊断
   */
  async diagnose(
    machineId: string,
    stateValues: Record<string, number>,
    cyclePhase: string
  ): Promise<DiagnosisReport> {
    const startTime = Date.now();
    const stateVector: StateVector = { timestamp: Date.now(), values: stateValues };

    // 并行执行四维诊断
    const [safety, health, efficiency, prediction] = await Promise.all([
      this.diagnoseSafety(stateVector),
      this.diagnoseHealth(stateVector),
      this.diagnoseEfficiency(stateVector, cyclePhase),
      this.diagnosePrediction(stateVector),
    ]);

    // 综合评估
    const overallScore = this.computeOverallScore(safety, health, efficiency, prediction);
    const overallRiskLevel = this.computeRiskLevel(overallScore);
    const recommendations = this.generateRecommendations(safety, health, efficiency, prediction);

    return {
      reportId: `diag_${machineId}_${Date.now()}`,
      machineId,
      timestamp: Date.now(),
      cyclePhase,
      safety,
      health,
      efficiency,
      prediction,
      overallRiskLevel,
      overallScore,
      recommendations,
      durationMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // 安全诊断
  // ============================================================================

  private async diagnoseSafety(state: StateVector): Promise<SafetyDiagnosis> {
    const v = state.values;
    const pp = this.physicsParams;

    // 风载力矩 M_wind = ½ρv²·A·h/2
    const windSpeed = v['windSpeedMean'] ?? 0;
    const windLoadMoment = 0.5 * pp.airDensity * Math.pow(windSpeed, 2) * pp.windwardArea * pp.boomHeight / 2;

    // 偏心力矩
    const loadWeight = v['loadWeight'] ?? 0;
    const eccentricity = v['loadEccentricity'] ?? 0;
    const eccentricityMoment = loadWeight * 9.81 * eccentricity * pp.boomHeight;

    // 倾覆风险
    const totalOverturningMoment = windLoadMoment + eccentricityMoment;
    const overturningRisk = totalOverturningMoment / pp.stabilizingMoment;
    const safetyFactor = pp.stabilizingMoment / Math.max(totalOverturningMoment, 1);

    // 反事实分析：如果风速增加 30%
    const cfWindSpeed = windSpeed * 1.3;
    const cfWindMoment = 0.5 * pp.airDensity * Math.pow(cfWindSpeed, 2) * pp.windwardArea * pp.boomHeight / 2;
    const cfRisk = (cfWindMoment + eccentricityMoment) / pp.stabilizingMoment;

    // 反事实分析：如果偏心增加 50%
    const cfEccentricity = eccentricity * 1.5;
    const cfEccMoment = loadWeight * 9.81 * cfEccentricity * pp.boomHeight;
    const cfEccRisk = (windLoadMoment + cfEccMoment) / pp.stabilizingMoment;

    const counterfactualAnalysis = [
      {
        scenario: '风速增加30%',
        baselineRisk: overturningRisk,
        worstCaseRisk: cfRisk,
        riskIncrease: cfRisk - overturningRisk,
      },
      {
        scenario: '偏心增加50%',
        baselineRisk: overturningRisk,
        worstCaseRisk: cfEccRisk,
        riskIncrease: cfEccRisk - overturningRisk,
      },
    ];

    // 安全分数
    const score = Math.max(0, 1 - overturningRisk);

    // 警戒等级
    let alertLevel: SafetyDiagnosis['alertLevel'] = 'none';
    if (overturningRisk > 0.20) alertLevel = 'alarm';
    else if (overturningRisk > 0.15) alertLevel = 'warning';
    else if (overturningRisk > 0.10) alertLevel = 'watch';

    return {
      score,
      overturningRisk,
      windLoadMoment: windLoadMoment / 1000, // kN·m
      eccentricityMoment: eccentricityMoment / 1000,
      safetyFactor,
      counterfactualAnalysis,
      alertLevel,
    };
  }

  // ============================================================================
  // 健康诊断
  // ============================================================================

  private async diagnoseHealth(state: StateVector): Promise<HealthDiagnosis> {
    const v = state.values;
    const pp = this.physicsParams;

    // 疲劳
    const fatigueAccum = v['fatigueAccumPercent'] ?? 0;
    const windSpeed = v['windSpeedMean'] ?? 0;
    const windMoment = 0.5 * pp.airDensity * Math.pow(windSpeed, 2) * pp.windwardArea * pp.boomHeight / 2;
    const loadMoment = (v['loadWeight'] ?? 0) * 9.81 * (v['loadEccentricity'] ?? 0) * pp.boomHeight;
    const totalMoment = windMoment + loadMoment;
    const fatigueIncrement = pp.stressConcentrationFactor * totalMoment / (pp.sectionModulus * 1e6);

    // S-N 曲线剩余寿命
    const remainingFatiguePercent = 100 - fatigueAccum;
    const cyclesPerDay = v['totalCycles'] ?? 0 > 0
      ? (v['totalCycles'] ?? 200) / Math.max((v['hoursSinceLastMaintenance'] ?? 720) / 24, 1)
      : 200;
    const fatiguePercentPerCycle = fatigueAccum > 0 && (v['totalCycles'] ?? 0) > 0
      ? fatigueAccum / (v['totalCycles'] ?? 1)
      : 0.001;
    const remainingCycles = fatiguePercentPerCycle > 0
      ? Math.floor(remainingFatiguePercent / fatiguePercentPerCycle)
      : 999999;
    const remainingLifeDays = cyclesPerDay > 0
      ? Math.floor(remainingCycles / cyclesPerDay)
      : 9999;

    // 腐蚀
    const chloride = v['chlorideConcentration'] ?? 10;
    const humidity = v['ambientHumidity'] ?? 60;
    const corrosionRate = pp.corrosionRateConstant * chloride * (humidity / 100);
    const corrosionIndex = v['corrosionIndex'] ?? 0;
    const corrosionRateMmPerYear = corrosionRate * 8760; // 年化

    // 轴承健康
    const bearingTemp = v['temperatureBearing'] ?? 30;
    const vibRms = v['vibrationRms'] ?? 1;
    let bearingStatus: HealthDiagnosis['bearingHealth']['status'] = 'good';
    if (bearingTemp > 80 || vibRms > 4.5) bearingStatus = 'critical';
    else if (bearingTemp > 60 || vibRms > 2.8) bearingStatus = 'poor';
    else if (bearingTemp > 45 || vibRms > 1.8) bearingStatus = 'fair';

    // 健康分数
    const fatigueScore = Math.max(0, 1 - fatigueAccum / 100);
    const corrosionScore = Math.max(0, 1 - corrosionIndex);
    const bearingScore = bearingStatus === 'good' ? 1 : bearingStatus === 'fair' ? 0.7 : bearingStatus === 'poor' ? 0.4 : 0.1;
    const score = 0.4 * fatigueScore + 0.3 * corrosionScore + 0.3 * bearingScore;

    // 维修建议
    let suggestedMaintenanceDate: string | null = null;
    if (remainingLifeDays < 30) {
      const date = new Date(Date.now() + remainingLifeDays * 0.7 * 86400000);
      suggestedMaintenanceDate = date.toISOString().split('T')[0];
    }

    return {
      score,
      fatigueAccumPercent: fatigueAccum,
      fatigueIncrementMPa: fatigueIncrement,
      remainingLifeDays,
      remainingCycles,
      corrosionIndex,
      corrosionRateMmPerYear,
      bearingHealth: { temperature: bearingTemp, vibrationRms: vibRms, status: bearingStatus },
      suggestedMaintenanceDate,
    };
  }

  // ============================================================================
  // 高效诊断
  // ============================================================================

  private async diagnoseEfficiency(state: StateVector, cyclePhase: string): Promise<EfficiencyDiagnosis> {
    const v = state.values;

    const currentCycleTime = v['cycleTimeSec'] ?? 120;
    const deviationPercent = ((currentCycleTime - this.baselineCycleTime) / this.baselineCycleTime) * 100;
    const powerFactor = v['powerFactor'] ?? 0.85;

    // 瓶颈分析
    const bottlenecks: BottleneckAnalysis[] = [];

    // 开闭锁延时分析
    const hydraulicPressure = v['hydraulicPressureMean'] ?? 20;
    const friction = v['spreaderFriction'] ?? 0.15;
    if (friction > 0.25) {
      const expectedLockTime = 15;
      const actualLockTime = expectedLockTime * (1 + (friction - 0.15) * 5);
      bottlenecks.push({
        phase: 'locking',
        actualDuration: actualLockTime,
        expectedDuration: expectedLockTime,
        deviationPercent: ((actualLockTime - expectedLockTime) / expectedLockTime) * 100,
        rootCause: `吊具摩擦系数偏高 (${friction.toFixed(3)})，导致开闭锁延时`,
        suggestion: `调整吊具液压压力至 ${(hydraulicPressure * 1.1).toFixed(1)} MPa 或润滑吊具导轨`,
      });
    }

    // 联动延时分析
    const motorCurrent = v['motorCurrentMean'] ?? 60;
    if (motorCurrent > 90) {
      bottlenecks.push({
        phase: 'traversing',
        actualDuration: 90,
        expectedDuration: 75,
        deviationPercent: 20,
        rootCause: `电机电流偏高 (${motorCurrent.toFixed(1)}A)，可能负载过重或机械阻力增大`,
        suggestion: '检查轨道清洁度，确认载荷是否超出最优范围',
      });
    }

    // 效率分数
    const cycleScore = Math.max(0, 1 - Math.abs(deviationPercent) / 50);
    const powerScore = powerFactor;
    const bottleneckPenalty = Math.min(0.3, bottlenecks.length * 0.1);
    const score = Math.max(0, 0.5 * cycleScore + 0.3 * powerScore - bottleneckPenalty + 0.2);

    // 能耗评估
    const energyEfficiency = powerFactor * cycleScore;

    // 优化建议
    const suggestions: string[] = [];
    if (deviationPercent > 10) suggestions.push(`周期时间偏长 ${deviationPercent.toFixed(1)}%，建议优化作业流程`);
    if (powerFactor < 0.8) suggestions.push(`功率因数偏低 (${powerFactor.toFixed(2)})，建议检查电气系统`);
    if (friction > 0.25) suggestions.push('吊具摩擦系数偏高，建议润滑或更换导轨');

    return {
      score,
      currentCycleTime,
      baselineCycleTime: this.baselineCycleTime,
      deviationPercent,
      bottlenecks,
      powerFactor,
      energyEfficiency,
      optimizationSuggestions: suggestions,
    };
  }

  // ============================================================================
  // 预测诊断
  // ============================================================================

  private async diagnosePrediction(state: StateVector): Promise<PredictionDiagnosis> {
    // 使用 WorldModel 预测
    const prediction = this.worldModel.predict(state, 10);
    const anomaly = this.worldModel.anticipateAnomaly(state);

    // 未来状态摘要
    const futureStateSummary = prediction.trajectory.map((s, i) => ({
      step: i,
      timestamp: s.timestamp,
      riskLevel: this.assessStepRisk(s),
      keyMetrics: {
        vibrationRms: s.values['vibrationRms'] ?? 0,
        fatigueAccumPercent: s.values['fatigueAccumPercent'] ?? 0,
        overturningRisk: s.values['overturningRisk'] ?? 0,
        temperatureBearing: s.values['temperatureBearing'] ?? 0,
      },
    }));

    return {
      confidence: prediction.confidences.reduce((s, c) => s + c, 0) / prediction.confidences.length,
      anomalyAnticipation: anomaly,
      futureStateSummary,
      method: prediction.method,
    };
  }

  // ============================================================================
  // 综合评估
  // ============================================================================

  private computeOverallScore(
    safety: SafetyDiagnosis,
    health: HealthDiagnosis,
    efficiency: EfficiencyDiagnosis,
    prediction: PredictionDiagnosis
  ): number {
    // 加权综合（安全权重最高）
    return Math.round(
      (safety.score * 0.35 + health.score * 0.30 + efficiency.score * 0.20 + prediction.confidence * 0.15) * 100
    );
  }

  private computeRiskLevel(score: number): DiagnosisReport['overallRiskLevel'] {
    if (score >= 85) return 'safe';
    if (score >= 70) return 'caution';
    if (score >= 50) return 'warning';
    if (score >= 30) return 'danger';
    return 'critical';
  }

  private assessStepRisk(state: StateVector): string {
    const overturning = state.values['overturningRisk'] ?? 0;
    const fatigue = state.values['fatigueAccumPercent'] ?? 0;
    if (overturning > 0.2 || fatigue > 80) return 'critical';
    if (overturning > 0.15 || fatigue > 60) return 'warning';
    if (overturning > 0.1 || fatigue > 40) return 'caution';
    return 'safe';
  }

  private generateRecommendations(
    safety: SafetyDiagnosis,
    health: HealthDiagnosis,
    efficiency: EfficiencyDiagnosis,
    prediction: PredictionDiagnosis
  ): Recommendation[] {
    const recs: Recommendation[] = [];

    // 安全建议
    if (safety.alertLevel === 'alarm') {
      recs.push({
        priority: 'P0', dimension: 'safety',
        action: '立即启动紧急停机程序',
        reason: `倾覆风险 ${(safety.overturningRisk * 100).toFixed(1)}% 超过安全阈值 20%`,
        deadline: '立即', estimatedImpact: '防止设备倾覆事故',
      });
    } else if (safety.alertLevel === 'warning') {
      recs.push({
        priority: 'P1', dimension: 'safety',
        action: '降低作业速度至 70%，限制臂架仰角',
        reason: `倾覆风险 ${(safety.overturningRisk * 100).toFixed(1)}% 处于警戒区间`,
        deadline: '10分钟内', estimatedImpact: '降低倾覆风险 40%',
      });
    }

    // 健康建议
    if (health.remainingLifeDays < 30) {
      recs.push({
        priority: 'P1', dimension: 'health',
        action: `安排结构检测和维修，建议日期：${health.suggestedMaintenanceDate}`,
        reason: `剩余寿命仅 ${health.remainingLifeDays} 天，疲劳累积 ${health.fatigueAccumPercent.toFixed(1)}%`,
        deadline: '1周内', estimatedImpact: '延长设备寿命 50%+',
      });
    }
    if (health.bearingHealth.status === 'critical') {
      recs.push({
        priority: 'P0', dimension: 'health',
        action: '立即检查轴承状态，准备更换备件',
        reason: `轴承温度 ${health.bearingHealth.temperature}°C，振动 ${health.bearingHealth.vibrationRms} mm/s`,
        deadline: '立即', estimatedImpact: '防止轴承烧毁',
      });
    }

    // 效率建议
    for (const bn of efficiency.bottlenecks) {
      recs.push({
        priority: 'P2', dimension: 'efficiency',
        action: bn.suggestion,
        reason: bn.rootCause,
        deadline: '下次维护时', estimatedImpact: `提升周期效率 ${bn.deviationPercent.toFixed(0)}%`,
      });
    }

    // 预测建议
    if (prediction.anomalyAnticipation.anomalyDetected) {
      const anomaly = prediction.anomalyAnticipation;
      recs.push({
        priority: anomaly.severity === 'critical' ? 'P0' : 'P1',
        dimension: 'prediction',
        action: anomaly.suggestedActions[0] || '加强监测',
        reason: `预测 ${anomaly.estimatedStepToAnomaly} 步后出现 ${anomaly.anomalyType} 异常`,
        deadline: anomaly.severity === 'critical' ? '立即' : '1小时内',
        estimatedImpact: '提前预防，避免非计划停机',
      });
    }

    // 按优先级排序
    recs.sort((a, b) => a.priority.localeCompare(b.priority));
    return recs;
  }

  /**
   * 更新基准参数
   */
  updateBaseline(params: { baselineCycleTime?: number; physicsParams?: Partial<Record<string, number>> }): void {
    if (params.baselineCycleTime) this.baselineCycleTime = params.baselineCycleTime;
    if (params.physicsParams) Object.assign(this.physicsParams, params.physicsParams);
  }
}
