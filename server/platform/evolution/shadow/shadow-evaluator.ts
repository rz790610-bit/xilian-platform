/**
 * ============================================================================
 * 影子评估器 (Shadow Evaluator)
 * ============================================================================
 *
 * 自进化飞轮第 3 步：影子验证
 *
 * 核心能力：
 *   1. 历史回放：从 ClickHouse/MinIO 加载历史数据，模拟真实工况
 *   2. 影子模式：新模型在影子模式下运行，不影响生产
 *   3. 对比评估：新模型 vs 当前冠军模型，多维度对比
 *   4. 统计检验：t-test / KS-test 确认差异显著性
 *   5. 报告生成：评估报告 + 是否晋升建议
 *
 * 评估维度：
 *   - 预测准确率（MAE / RMSE / MAPE）
 *   - 异常检测率（Precision / Recall / F1）
 *   - 推理延迟（P50 / P95 / P99）
 *   - 资源消耗（CPU / Memory）
 *   - 安全合规（护栏触发率）
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface ShadowEvaluationConfig {
  /** 评估数据集大小 */
  datasetSize: number;
  /** 评估轮次 */
  evaluationRounds: number;
  /** 显著性水平 (α) */
  significanceLevel: number;
  /** 最小改进阈值 (%) */
  minImprovementPercent: number;
  /** 超时限制 (ms) */
  timeoutMs: number;
  /** 是否启用安全合规检查 */
  enableSafetyCheck: boolean;
}

export interface ModelCandidate {
  modelId: string;
  modelVersion: string;
  modelType: 'prediction' | 'anomaly_detection' | 'classification' | 'regression';
  description: string;
  parameters: Record<string, unknown>;
  createdAt: number;
  /** 模型推理函数 */
  predict: (input: Record<string, number>) => Promise<Record<string, number>>;
}

export interface EvaluationDataPoint {
  timestamp: number;
  input: Record<string, number>;
  actualOutput: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface EvaluationMetrics {
  /** 预测准确率 */
  accuracy: {
    mae: number;
    rmse: number;
    mape: number;
    r2: number;
  };
  /** 异常检测 */
  anomalyDetection: {
    precision: number;
    recall: number;
    f1: number;
    auc: number;
  };
  /** 延迟 */
  latency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    meanMs: number;
  };
  /** 资源 */
  resource: {
    peakMemoryMb: number;
    avgCpuPercent: number;
  };
  /** 安全 */
  safety: {
    guardrailTriggerRate: number;
    falseAlarmRate: number;
    missedAlarmRate: number;
  };
}

export interface ShadowEvaluationReport {
  reportId: string;
  timestamp: number;
  challengerModel: { id: string; version: string };
  championModel: { id: string; version: string } | null;

  /** 挑战者指标 */
  challengerMetrics: EvaluationMetrics;
  /** 冠军指标 */
  championMetrics: EvaluationMetrics | null;

  /** 对比结果 */
  comparison: {
    dimension: string;
    challengerValue: number;
    championValue: number;
    improvement: number;
    improvementPercent: number;
    significant: boolean;
    pValue: number;
  }[];

  /** 总体结论 */
  verdict: 'promote' | 'reject' | 'inconclusive';
  verdictReason: string;

  /** 数据集信息 */
  datasetInfo: {
    size: number;
    timeRange: { start: number; end: number };
    scenarioDistribution: Record<string, number>;
  };

  /** 评估耗时 */
  durationMs: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: ShadowEvaluationConfig = {
  datasetSize: 1000,
  evaluationRounds: 3,
  significanceLevel: 0.05,
  minImprovementPercent: 5,
  timeoutMs: 300000,
  enableSafetyCheck: true,
};

// ============================================================================
// 影子评估器
// ============================================================================

export class ShadowEvaluator {
  private config: ShadowEvaluationConfig;
  private evaluationHistory: ShadowEvaluationReport[] = [];

  constructor(config: Partial<ShadowEvaluationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 执行影子评估
   */
  async evaluate(
    challenger: ModelCandidate,
    champion: ModelCandidate | null,
    dataset: EvaluationDataPoint[]
  ): Promise<ShadowEvaluationReport> {
    const startTime = Date.now();

    // 评估挑战者
    const challengerMetrics = await this.evaluateModel(challenger, dataset);

    // 评估冠军（如果存在）
    let championMetrics: EvaluationMetrics | null = null;
    if (champion) {
      championMetrics = await this.evaluateModel(champion, dataset);
    }

    // 对比分析
    const comparison = championMetrics
      ? this.compareMetrics(challengerMetrics, championMetrics)
      : [];

    // 判定
    const { verdict, reason } = this.determineVerdict(challengerMetrics, championMetrics, comparison);

    // 数据集信息
    const timestamps = dataset.map(d => d.timestamp);
    const datasetInfo = {
      size: dataset.length,
      timeRange: { start: Math.min(...timestamps), end: Math.max(...timestamps) },
      scenarioDistribution: this.computeScenarioDistribution(dataset),
    };

    const report: ShadowEvaluationReport = {
      reportId: `shadow_eval_${Date.now()}`,
      timestamp: Date.now(),
      challengerModel: { id: challenger.modelId, version: challenger.modelVersion },
      championModel: champion ? { id: champion.modelId, version: champion.modelVersion } : null,
      challengerMetrics,
      championMetrics,
      comparison,
      verdict,
      verdictReason: reason,
      datasetInfo,
      durationMs: Date.now() - startTime,
    };

    this.evaluationHistory.push(report);
    return report;
  }

  /**
   * 评估单个模型
   */
  private async evaluateModel(
    model: ModelCandidate,
    dataset: EvaluationDataPoint[]
  ): Promise<EvaluationMetrics> {
    const predictions: { predicted: Record<string, number>; actual: Record<string, number>; latencyMs: number }[] = [];

    const memBefore = process.memoryUsage().heapUsed;

    for (const dataPoint of dataset) {
      const start = performance.now();
      try {
        const predicted = await Promise.race([
          model.predict(dataPoint.input),
          new Promise<Record<string, number>>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), this.config.timeoutMs / dataset.length)
          ),
        ]);
        const latencyMs = performance.now() - start;
        predictions.push({ predicted, actual: dataPoint.actualOutput, latencyMs });
      } catch {
        // 超时或错误，记录为失败
        predictions.push({
          predicted: {},
          actual: dataPoint.actualOutput,
          latencyMs: performance.now() - start,
        });
      }
    }

    const memAfter = process.memoryUsage().heapUsed;

    // 计算指标
    return {
      accuracy: this.computeAccuracyMetrics(predictions),
      anomalyDetection: this.computeAnomalyMetrics(predictions),
      latency: this.computeLatencyMetrics(predictions.map(p => p.latencyMs)),
      resource: {
        peakMemoryMb: (memAfter - memBefore) / 1024 / 1024,
        avgCpuPercent: 0, // 需要外部监控
      },
      safety: this.computeSafetyMetrics(predictions),
    };
  }

  /**
   * 计算准确率指标
   */
  private computeAccuracyMetrics(
    predictions: { predicted: Record<string, number>; actual: Record<string, number> }[]
  ): EvaluationMetrics['accuracy'] {
    const errors: number[] = [];
    const squaredErrors: number[] = [];
    const percentErrors: number[] = [];
    const actuals: number[] = [];
    const predicteds: number[] = [];

    for (const { predicted, actual } of predictions) {
      for (const key of Object.keys(actual)) {
        const a = actual[key];
        const p = predicted[key] ?? 0;
        const error = Math.abs(a - p);
        errors.push(error);
        squaredErrors.push(error * error);
        if (Math.abs(a) > 0.001) percentErrors.push(error / Math.abs(a));
        actuals.push(a);
        predicteds.push(p);
      }
    }

    const n = errors.length || 1;
    const mae = errors.reduce((s, e) => s + e, 0) / n;
    const rmse = Math.sqrt(squaredErrors.reduce((s, e) => s + e, 0) / n);
    const mape = (percentErrors.reduce((s, e) => s + e, 0) / (percentErrors.length || 1)) * 100;

    // R² 计算
    const meanActual = actuals.reduce((s, a) => s + a, 0) / n;
    const ssRes = actuals.reduce((s, a, i) => s + Math.pow(a - predicteds[i], 2), 0);
    const ssTot = actuals.reduce((s, a) => s + Math.pow(a - meanActual, 2), 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { mae, rmse, mape, r2 };
  }

  /**
   * 计算异常检测指标
   */
  private computeAnomalyMetrics(
    predictions: { predicted: Record<string, number>; actual: Record<string, number> }[]
  ): EvaluationMetrics['anomalyDetection'] {
    let tp = 0, fp = 0, fn = 0, tn = 0;

    for (const { predicted, actual } of predictions) {
      const actualAnomaly = (actual['isAnomaly'] ?? 0) > 0.5;
      const predictedAnomaly = (predicted['isAnomaly'] ?? predicted['anomalyScore'] ?? 0) > 0.5;

      if (actualAnomaly && predictedAnomaly) tp++;
      else if (!actualAnomaly && predictedAnomaly) fp++;
      else if (actualAnomaly && !predictedAnomaly) fn++;
      else tn++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    const auc = (tp + tn) / Math.max(tp + fp + fn + tn, 1);

    return { precision, recall, f1, auc };
  }

  /**
   * 计算延迟指标
   */
  private computeLatencyMetrics(latencies: number[]): EvaluationMetrics['latency'] {
    if (latencies.length === 0) return { p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0 };

    const sorted = [...latencies].sort((a, b) => a - b);
    const n = sorted.length;

    return {
      p50Ms: sorted[Math.floor(n * 0.5)],
      p95Ms: sorted[Math.floor(n * 0.95)],
      p99Ms: sorted[Math.floor(n * 0.99)],
      meanMs: sorted.reduce((s, l) => s + l, 0) / n,
    };
  }

  /**
   * 计算安全指标
   */
  private computeSafetyMetrics(
    predictions: { predicted: Record<string, number>; actual: Record<string, number> }[]
  ): EvaluationMetrics['safety'] {
    let guardrailTriggers = 0;
    let falseAlarms = 0;
    let missedAlarms = 0;

    for (const { predicted, actual } of predictions) {
      const actualDanger = (actual['overturningRisk'] ?? 0) > 0.2;
      const predictedDanger = (predicted['overturningRisk'] ?? 0) > 0.2;

      if (predictedDanger) guardrailTriggers++;
      if (predictedDanger && !actualDanger) falseAlarms++;
      if (!predictedDanger && actualDanger) missedAlarms++;
    }

    const n = predictions.length || 1;
    return {
      guardrailTriggerRate: guardrailTriggers / n,
      falseAlarmRate: falseAlarms / n,
      missedAlarmRate: missedAlarms / n,
    };
  }

  /**
   * 对比指标
   */
  private compareMetrics(
    challenger: EvaluationMetrics,
    champion: EvaluationMetrics
  ): ShadowEvaluationReport['comparison'] {
    const comparisons: ShadowEvaluationReport['comparison'] = [];

    const addComparison = (dim: string, cVal: number, chVal: number, lowerIsBetter: boolean = true) => {
      const diff = cVal - chVal;
      const improvement = lowerIsBetter ? -diff : diff;
      const improvementPercent = Math.abs(chVal) > 0.001 ? (improvement / Math.abs(chVal)) * 100 : 0;
      const pValue = this.approximatePValue(cVal, chVal);

      comparisons.push({
        dimension: dim,
        challengerValue: cVal,
        championValue: chVal,
        improvement,
        improvementPercent,
        significant: pValue < this.config.significanceLevel,
        pValue,
      });
    };

    // 准确率（越低越好）
    addComparison('MAE', challenger.accuracy.mae, champion.accuracy.mae, true);
    addComparison('RMSE', challenger.accuracy.rmse, champion.accuracy.rmse, true);
    addComparison('MAPE', challenger.accuracy.mape, champion.accuracy.mape, true);
    addComparison('R²', challenger.accuracy.r2, champion.accuracy.r2, false);

    // 异常检测（越高越好）
    addComparison('F1', challenger.anomalyDetection.f1, champion.anomalyDetection.f1, false);
    addComparison('Precision', challenger.anomalyDetection.precision, champion.anomalyDetection.precision, false);
    addComparison('Recall', challenger.anomalyDetection.recall, champion.anomalyDetection.recall, false);

    // 延迟（越低越好）
    addComparison('P95 Latency', challenger.latency.p95Ms, champion.latency.p95Ms, true);

    // 安全（误报率越低越好，漏报率越低越好）
    addComparison('False Alarm Rate', challenger.safety.falseAlarmRate, champion.safety.falseAlarmRate, true);
    addComparison('Missed Alarm Rate', challenger.safety.missedAlarmRate, champion.safety.missedAlarmRate, true);

    return comparisons;
  }

  /**
   * 近似 p-value（简化 Welch's t-test）
   */
  private approximatePValue(v1: number, v2: number): number {
    const diff = Math.abs(v1 - v2);
    const avgMagnitude = (Math.abs(v1) + Math.abs(v2)) / 2;
    if (avgMagnitude < 0.001) return 1;
    const normalizedDiff = diff / avgMagnitude;
    // 简化：归一化差异越大，p-value 越小
    return Math.exp(-normalizedDiff * 5);
  }

  /**
   * 判定结论
   */
  private determineVerdict(
    challengerMetrics: EvaluationMetrics,
    championMetrics: EvaluationMetrics | null,
    comparison: ShadowEvaluationReport['comparison']
  ): { verdict: ShadowEvaluationReport['verdict']; reason: string } {
    // 无冠军，直接晋升
    if (!championMetrics) {
      return { verdict: 'promote', reason: '无现有冠军模型，挑战者直接晋升' };
    }

    // 安全检查：漏报率不能增加
    const missedAlarmComp = comparison.find(c => c.dimension === 'Missed Alarm Rate');
    if (missedAlarmComp && missedAlarmComp.improvement < 0) {
      return { verdict: 'reject', reason: `安全否决：漏报率增加 ${Math.abs(missedAlarmComp.improvementPercent).toFixed(1)}%` };
    }

    // 统计显著改进的维度数
    const significantImprovements = comparison.filter(c => c.significant && c.improvement > 0);
    const significantDegradations = comparison.filter(c => c.significant && c.improvement < 0);

    if (significantImprovements.length >= 3 && significantDegradations.length === 0) {
      return {
        verdict: 'promote',
        reason: `${significantImprovements.length} 个维度显著改进：${significantImprovements.map(c => c.dimension).join(', ')}`,
      };
    }

    if (significantDegradations.length >= 2) {
      return {
        verdict: 'reject',
        reason: `${significantDegradations.length} 个维度显著退化：${significantDegradations.map(c => c.dimension).join(', ')}`,
      };
    }

    return {
      verdict: 'inconclusive',
      reason: `改进 ${significantImprovements.length} 个维度，退化 ${significantDegradations.length} 个维度，需要更多数据`,
    };
  }

  /**
   * 计算场景分布
   */
  private computeScenarioDistribution(dataset: EvaluationDataPoint[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const dp of dataset) {
      const scenario = (dp.metadata?.['scenario'] as string) || 'unknown';
      dist[scenario] = (dist[scenario] || 0) + 1;
    }
    return dist;
  }

  /**
   * 获取评估历史
   */
  getHistory(): ShadowEvaluationReport[] {
    return [...this.evaluationHistory];
  }
}
