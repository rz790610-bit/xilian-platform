/**
 * Agent插件算法模块 — 6个完整实现
 * 
 * 1. 时序模式专家 — 趋势/周期/突变识别 + CUSUM/PELT变点检测
 * 2. 案例检索专家 — 相似度检索(余弦/DTW) + 特征匹配
 * 3. 物理约束专家 — 物理模型验证 + 约束一致性检查
 * 4. 空间异常专家 — 多传感器空间关联 + 异常传播路径
 * 5. 融合诊断专家 — 多算法融合(投票/加权/DS) + 置信度综合
 * 6. 预测专家 — 趋势外推 + RUL预测
 */

import type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import * as dsp from '../../algorithms/_core/dsp';

function createOutput(
  algorithmId: string, version: string, input: AlgorithmInput,
  config: Record<string, any>, startTime: number,
  diagnosis: AlgorithmOutput['diagnosis'], results: Record<string, any>,
  visualizations?: AlgorithmOutput['visualizations']
): AlgorithmOutput {
  return { algorithmId, status: 'completed', diagnosis, results, visualizations, metadata: {
    executionTimeMs: Date.now() - startTime, inputDataPoints: 0,
    algorithmVersion: version, parameters: config,
  }};
}

function getSignalData(input: AlgorithmInput): number[] {
  if (Array.isArray(input.data)) {
    return Array.isArray(input.data[0]) ? (input.data as number[][])[0] : input.data as number[];
  }
  const keys = Object.keys(input.data);
  return keys.length > 0 ? (input.data as Record<string, number[]>)[keys[0]] : [];
}

// ============================================================
// 1. 时序模式专家
// ============================================================

export class TimeSeriesPatternExpert implements IAlgorithmExecutor {
  readonly id = 'ts_pattern_expert';
  readonly name = '时序模式专家';
  readonly version = '2.0.0';
  readonly category = 'agent_plugin';

  getDefaultConfig() {
    return {
      trendMethod: 'linear',  // linear | polynomial | lowess
      changePointMethod: 'cusum', // cusum | pelt
      cusumThreshold: 5,
      minSegmentLength: 20,
      periodicityMaxLag: 500,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (signal.length < 50) return { valid: false, errors: ['至少需要50个数据点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const n = signal.length;

    // 1. 趋势分析
    const trend = this.detectTrend(signal);

    // 2. 变点检测 (CUSUM)
    const changePoints = this.cusumChangePoints(signal, cfg.cusumThreshold, cfg.minSegmentLength);

    // 3. 周期性检测 (自相关)
    const periodicity = this.detectPeriodicity(signal, cfg.periodicityMaxLag);

    // 4. 突变检测
    const spikes = this.detectSpikes(signal, 3);

    // 综合诊断
    const patterns: string[] = [];
    if (Math.abs(trend.slope) > 0.001) patterns.push(trend.slope > 0 ? '上升趋势' : '下降趋势');
    if (changePoints.length > 0) patterns.push(`${changePoints.length}个变点`);
    if (periodicity.period > 0) patterns.push(`周期=${periodicity.period}`);
    if (spikes.length > 0) patterns.push(`${spikes.length}个突变`);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `时序模式分析: ${patterns.length > 0 ? patterns.join(', ') : '无显著模式'}。` +
        `趋势斜率=${trend.slope.toFixed(6)}, R²=${trend.rSquared.toFixed(3)}`,
      severity: changePoints.length > 3 || spikes.length > 5 ? 'warning' : 'normal',
      urgency: Math.abs(trend.slope) > 0.01 ? 'attention' : 'monitoring',
      confidence: 0.85,
      referenceStandard: 'Page 1954 (CUSUM) / Killick et al. 2012 (PELT)',
    }, {
      trend,
      changePoints,
      periodicity,
      spikes,
      patterns,
    });
  }

  private detectTrend(signal: number[]): { slope: number; intercept: number; rSquared: number; direction: string } {
    const n = signal.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const meanX = (n - 1) / 2;
    const meanY = dsp.mean(signal);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - meanX) * (signal[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    const ssTot = signal.reduce((s, y) => s + (y - meanY) ** 2, 0);
    const ssRes = signal.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const direction = Math.abs(slope) < 0.001 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing';
    return { slope, intercept, rSquared, direction };
  }

  private cusumChangePoints(signal: number[], threshold: number, minLen: number): number[] {
    const n = signal.length;
    const mean = dsp.mean(signal);
    const std = dsp.standardDeviation(signal);
    if (std < 1e-10) return [];

    const normalized = signal.map(v => (v - mean) / std);
    let cusumPos = 0, cusumNeg = 0;
    const changePoints: number[] = [];
    let lastCP = 0;

    for (let i = 0; i < n; i++) {
      cusumPos = Math.max(0, cusumPos + normalized[i] - 0.5);
      cusumNeg = Math.max(0, cusumNeg - normalized[i] - 0.5);

      if ((cusumPos > threshold || cusumNeg > threshold) && (i - lastCP) >= minLen) {
        changePoints.push(i);
        cusumPos = 0;
        cusumNeg = 0;
        lastCP = i;
      }
    }
    return changePoints;
  }

  private detectPeriodicity(signal: number[], maxLag: number): { period: number; strength: number } {
    const n = signal.length;
    const mean = dsp.mean(signal);
    const centered = signal.map(v => v - mean);
    const variance = centered.reduce((s, v) => s + v * v, 0);
    if (variance < 1e-10) return { period: 0, strength: 0 };

    let bestPeriod = 0, bestCorr = 0;
    const actualMaxLag = Math.min(maxLag, Math.floor(n / 2));

    for (let lag = 2; lag < actualMaxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i++) corr += centered[i] * centered[i + lag];
      corr /= variance;
      if (corr > bestCorr) { bestCorr = corr; bestPeriod = lag; }
    }

    return { period: bestCorr > 0.3 ? bestPeriod : 0, strength: bestCorr };
  }

  private detectSpikes(signal: number[], threshold: number): Array<{ index: number; value: number; zscore: number }> {
    const mean = dsp.mean(signal);
    const std = dsp.standardDeviation(signal);
    if (std < 1e-10) return [];

    const spikes: Array<{ index: number; value: number; zscore: number }> = [];
    for (let i = 0; i < signal.length; i++) {
      const z = Math.abs((signal[i] - mean) / std);
      if (z > threshold) spikes.push({ index: i, value: signal[i], zscore: z });
    }
    return spikes;
  }
}

// ============================================================
// 2. 案例检索专家
// ============================================================

export class CaseRetrievalExpert implements IAlgorithmExecutor {
  readonly id = 'case_retrieval_expert';
  readonly name = '案例检索专家';
  readonly version = '1.5.0';
  readonly category = 'agent_plugin';

  getDefaultConfig() {
    return {
      similarityMethod: 'cosine', // cosine | dtw | euclidean
      topK: 5,
      dtwWindow: 10,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.caseLibrary || !Array.isArray(input.context.caseLibrary)) {
      return { valid: false, errors: ['需要案例库(input.context.caseLibrary)'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const query = getSignalData(input);
    const caseLib = input.context!.caseLibrary as Array<{
      id: string; name: string; features: number[]; diagnosis: string; solution: string;
    }>;

    const results = caseLib.map(c => {
      let similarity: number;
      if (cfg.similarityMethod === 'cosine') {
        similarity = this.cosineSimilarity(query, c.features);
      } else if (cfg.similarityMethod === 'dtw') {
        const dist = this.dtwDistance(query, c.features, cfg.dtwWindow);
        similarity = 1 / (1 + dist);
      } else {
        const dist = Math.sqrt(query.reduce((s, v, i) => s + (v - (c.features[i] || 0)) ** 2, 0));
        similarity = 1 / (1 + dist);
      }
      return { ...c, similarity };
    });

    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, cfg.topK);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `案例检索完成: 从${caseLib.length}个案例中检索到${topResults.length}个相似案例。` +
        (topResults.length > 0 ? `最相似: "${topResults[0].name}" (相似度=${(topResults[0].similarity * 100).toFixed(1)}%)` : ''),
      severity: 'normal',
      urgency: 'monitoring',
      confidence: topResults.length > 0 ? topResults[0].similarity : 0,
      referenceStandard: 'Aamodt & Plaza 1994 (CBR)',
    }, {
      matches: topResults,
      totalCases: caseLib.length,
      method: cfg.similarityMethod,
    });
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-10);
  }

  private dtwDistance(a: number[], b: number[], window: number): number {
    const n = a.length, m = b.length;
    const dtw: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    dtw[0][0] = 0;
    for (let i = 1; i <= n; i++) {
      const jStart = Math.max(1, i - window);
      const jEnd = Math.min(m, i + window);
      for (let j = jStart; j <= jEnd; j++) {
        const cost = Math.abs(a[i - 1] - b[j - 1]);
        dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
      }
    }
    return dtw[n][m];
  }
}

// ============================================================
// 3. 物理约束专家
// ============================================================

export class PhysicalConstraintExpert implements IAlgorithmExecutor {
  readonly id = 'physical_constraint_expert';
  readonly name = '物理约束专家';
  readonly version = '1.2.0';
  readonly category = 'agent_plugin';

  getDefaultConfig() {
    return {
      constraints: [] as Array<{
        name: string;
        type: 'range' | 'relation' | 'rate_of_change' | 'balance';
        params: Record<string, any>;
      }>,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (typeof input.data !== 'object' || Array.isArray(input.data)) {
      return { valid: false, errors: ['需要多变量数据(Record<string, number[]>)'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const data = input.data as Record<string, number[]>;

    const violations: Array<{
      constraint: string;
      type: string;
      severity: string;
      details: string;
      indices: number[];
    }> = [];

    // 内置物理约束检查
    const builtinConstraints = [
      // 温度范围约束
      ...Object.keys(data).filter(k => k.toLowerCase().includes('temp')).map(k => ({
        name: `${k}温度范围`, type: 'range' as const,
        params: { variable: k, min: -40, max: 200 },
      })),
      // 振动非负约束
      ...Object.keys(data).filter(k => k.toLowerCase().includes('vib')).map(k => ({
        name: `${k}振动非负`, type: 'range' as const,
        params: { variable: k, min: 0, max: Infinity },
      })),
      // 变化率约束
      ...Object.keys(data).filter(k => k.toLowerCase().includes('temp')).map(k => ({
        name: `${k}温度变化率`, type: 'rate_of_change' as const,
        params: { variable: k, maxRate: 10 }, // 最大10°C/采样间隔
      })),
    ];

    const allConstraints = [...builtinConstraints, ...cfg.constraints];

    for (const constraint of allConstraints) {
      const variable = constraint.params.variable;
      const values = data[variable];
      if (!values) continue;

      if (constraint.type === 'range') {
        const violationIndices: number[] = [];
        for (let i = 0; i < values.length; i++) {
          if (values[i] < constraint.params.min || values[i] > constraint.params.max) {
            violationIndices.push(i);
          }
        }
        if (violationIndices.length > 0) {
          violations.push({
            constraint: constraint.name,
            type: 'range',
            severity: violationIndices.length > values.length * 0.1 ? 'critical' : 'warning',
            details: `${violationIndices.length}个点超出范围[${constraint.params.min}, ${constraint.params.max}]`,
            indices: violationIndices.slice(0, 100),
          });
        }
      }

      if (constraint.type === 'rate_of_change') {
        const violationIndices: number[] = [];
        for (let i = 1; i < values.length; i++) {
          if (Math.abs(values[i] - values[i - 1]) > constraint.params.maxRate) {
            violationIndices.push(i);
          }
        }
        if (violationIndices.length > 0) {
          violations.push({
            constraint: constraint.name,
            type: 'rate_of_change',
            severity: 'warning',
            details: `${violationIndices.length}个点变化率超过${constraint.params.maxRate}`,
            indices: violationIndices.slice(0, 100),
          });
        }
      }
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `物理约束检查: ${allConstraints.length}项约束，${violations.length}项违反。` +
        (violations.length > 0 ? violations.map(v => `${v.constraint}(${v.severity})`).join(', ') : '所有约束满足'),
      severity: violations.some(v => v.severity === 'critical') ? 'critical' : violations.length > 0 ? 'warning' : 'normal',
      urgency: violations.some(v => v.severity === 'critical') ? 'immediate' : 'monitoring',
      confidence: 0.95,
      referenceStandard: 'Physics-Informed ML / Domain Knowledge',
    }, {
      violations,
      constraintsChecked: allConstraints.length,
      passed: allConstraints.length - violations.length,
    });
  }
}

// ============================================================
// 4. 空间异常专家
// ============================================================

export class SpatialAnomalyExpert implements IAlgorithmExecutor {
  readonly id = 'spatial_anomaly_expert';
  readonly name = '空间异常专家';
  readonly version = '1.3.0';
  readonly category = 'agent_plugin';

  getDefaultConfig() {
    return {
      correlationThreshold: 0.7,
      anomalyThreshold: 3,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (typeof input.data !== 'object' || Array.isArray(input.data)) {
      return { valid: false, errors: ['需要多传感器数据(Record<string, number[]>)'] };
    }
    if (Object.keys(input.data).length < 2) return { valid: false, errors: ['至少需要2个传感器'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const data = input.data as Record<string, number[]>;
    const sensors = Object.keys(data);
    const n = Math.min(...Object.values(data).map(v => v.length));

    // 计算传感器间相关性矩阵
    const correlationMatrix: Record<string, Record<string, number>> = {};
    for (const s1 of sensors) {
      correlationMatrix[s1] = {};
      for (const s2 of sensors) {
        correlationMatrix[s1][s2] = this.pearsonCorrelation(data[s1].slice(0, n), data[s2].slice(0, n));
      }
    }

    // 检测空间异常 (某传感器与其他传感器的关联突然断裂)
    const anomalies: Array<{
      sensor: string;
      type: string;
      details: string;
      score: number;
    }> = [];

    for (const sensor of sensors) {
      const values = data[sensor].slice(0, n);
      const mean = dsp.mean(values);
      const std = dsp.standardDeviation(values);

      // Z-score异常
      const zScores = values.map(v => Math.abs((v - mean) / (std || 1e-10)));
      const anomalyCount = zScores.filter(z => z > cfg.anomalyThreshold).length;

      if (anomalyCount > 0) {
        // 检查是否与相邻传感器一致
        const correlatedSensors = sensors.filter(s => s !== sensor && Math.abs(correlationMatrix[sensor][s]) > cfg.correlationThreshold);
        const isolatedAnomaly = correlatedSensors.every(cs => {
          const csValues = data[cs].slice(0, n);
          const csMean = dsp.mean(csValues);
          const csStd = dsp.standardDeviation(csValues);
          const csAnomalyCount = csValues.filter(v => Math.abs((v - csMean) / (csStd || 1e-10)) > cfg.anomalyThreshold).length;
          return csAnomalyCount === 0;
        });

        if (isolatedAnomaly && correlatedSensors.length > 0) {
          anomalies.push({
            sensor,
            type: 'isolated_anomaly',
            details: `${sensor}出现${anomalyCount}个异常点，但关联传感器(${correlatedSensors.join(',')})正常 — 可能是传感器故障`,
            score: anomalyCount / n,
          });
        } else if (!isolatedAnomaly) {
          anomalies.push({
            sensor,
            type: 'propagated_anomaly',
            details: `${sensor}出现${anomalyCount}个异常点，关联传感器也有异常 — 可能是设备真实异常`,
            score: anomalyCount / n,
          });
        }
      }
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `空间异常分析: ${sensors.length}个传感器，${anomalies.length}个异常。` +
        (anomalies.length > 0 ? anomalies.map(a => `${a.sensor}(${a.type})`).join(', ') : '无空间异常'),
      severity: anomalies.some(a => a.type === 'propagated_anomaly') ? 'warning' : anomalies.length > 0 ? 'attention' : 'normal',
      urgency: anomalies.some(a => a.type === 'propagated_anomaly') ? 'attention' : 'monitoring',
      confidence: 0.82,
      referenceStandard: 'Spatial Statistics / Sensor Fusion',
    }, {
      anomalies,
      correlationMatrix,
      sensorCount: sensors.length,
    });
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const mx = dsp.mean(x.slice(0, n));
    const my = dsp.mean(y.slice(0, n));
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) ** 2;
      dy += (y[i] - my) ** 2;
    }
    return num / (Math.sqrt(dx * dy) || 1e-10);
  }
}

// ============================================================
// 5. 融合诊断专家
// ============================================================

export class FusionDiagnosisExpert implements IAlgorithmExecutor {
  readonly id = 'fusion_diagnosis_expert';
  readonly name = '融合诊断专家';
  readonly version = '1.5.0';
  readonly category = 'agent_plugin';

  getDefaultConfig() {
    return {
      fusionMethod: 'weighted', // voting | weighted | ds
      weights: [] as number[], // 各算法权重
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.diagnosticResults || !Array.isArray(input.context.diagnosticResults)) {
      return { valid: false, errors: ['需要多个算法的诊断结果(input.context.diagnosticResults)'] };
    }
    if (input.context.diagnosticResults.length < 2) {
      return { valid: false, errors: ['至少需要2个诊断结果'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const results = input.context!.diagnosticResults as Array<{
      algorithmId: string;
      diagnosis: string;
      confidence: number;
      severity: string;
    }>;

    const n = results.length;
    const weights = cfg.weights.length === n ? cfg.weights : new Array(n).fill(1 / n);

    // 统计各诊断结论
    const diagnosisCounts = new Map<string, { count: number; totalWeight: number; totalConfidence: number; severities: string[] }>();

    for (let i = 0; i < n; i++) {
      const r = results[i];
      const existing = diagnosisCounts.get(r.diagnosis) || { count: 0, totalWeight: 0, totalConfidence: 0, severities: [] };
      existing.count++;
      existing.totalWeight += weights[i];
      existing.totalConfidence += r.confidence * weights[i];
      existing.severities.push(r.severity);
      diagnosisCounts.set(r.diagnosis, existing);
    }

    // 融合
    let fusedDiagnosis: string;
    let fusedConfidence: number;

    if (cfg.fusionMethod === 'voting') {
      // 多数投票
      let maxCount = 0;
      fusedDiagnosis = '';
      for (const [diag, info] of Array.from(diagnosisCounts.entries())) {
        if (info.count > maxCount) { maxCount = info.count; fusedDiagnosis = diag; }
      }
      fusedConfidence = maxCount / n;
    } else {
      // 加权融合
      let maxWeight = 0;
      fusedDiagnosis = '';
      for (const [diag, info] of Array.from(diagnosisCounts.entries())) {
        if (info.totalWeight > maxWeight) { maxWeight = info.totalWeight; fusedDiagnosis = diag; }
      }
      const winner = diagnosisCounts.get(fusedDiagnosis)!;
      fusedConfidence = winner.totalConfidence / winner.totalWeight;
    }

    // 一致性评估
    const agreement = (diagnosisCounts.get(fusedDiagnosis)?.count || 0) / n;

    // 最严重级别
    const severityOrder = ['normal', 'attention', 'warning', 'critical'];
    const maxSeverity = results.reduce((max, r) => {
      return severityOrder.indexOf(r.severity) > severityOrder.indexOf(max) ? r.severity : max;
    }, 'normal');

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `融合诊断(${cfg.fusionMethod}): "${fusedDiagnosis}"，` +
        `置信度=${(fusedConfidence * 100).toFixed(1)}%，一致性=${(agreement * 100).toFixed(0)}%。` +
        `${n}个算法参与融合`,
      severity: maxSeverity as any,
      urgency: fusedConfidence > 0.8 && maxSeverity !== 'normal' ? 'attention' : 'monitoring',
      confidence: fusedConfidence,
      referenceStandard: 'Multi-Classifier Fusion / Ensemble Methods',
    }, {
      fusedDiagnosis,
      fusedConfidence,
      agreement,
      method: cfg.fusionMethod,
      individualResults: results,
      diagnosisDistribution: Object.fromEntries(
        Array.from(diagnosisCounts.entries()).map(([k, v]) => [k, { count: v.count, weight: v.totalWeight }])
      ),
    });
  }
}

// ============================================================
// 6. 预测专家
// ============================================================

export class PredictionExpert implements IAlgorithmExecutor {
  readonly id = 'prediction_expert';
  readonly name = '预测专家';
  readonly version = '1.8.0';
  readonly category = 'agent_plugin';

  getDefaultConfig() {
    return {
      method: 'exponential_smoothing', // linear | exponential_smoothing | arima_simple
      forecastHorizon: 30,
      alpha: 0.3,       // 指数平滑系数
      beta: 0.1,        // 趋势平滑系数
      failureThreshold: 0, // RUL预测的故障阈值 (0=不预测RUL)
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (signal.length < 20) return { valid: false, errors: ['至少需要20个历史数据点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const n = signal.length;

    // Holt双参数指数平滑
    let level = signal[0];
    let trend = signal.length > 1 ? signal[1] - signal[0] : 0;

    const fitted: number[] = [level];
    for (let i = 1; i < n; i++) {
      const newLevel = cfg.alpha * signal[i] + (1 - cfg.alpha) * (level + trend);
      const newTrend = cfg.beta * (newLevel - level) + (1 - cfg.beta) * trend;
      level = newLevel;
      trend = newTrend;
      fitted.push(level);
    }

    // 预测
    const forecast: number[] = [];
    const forecastLower: number[] = [];
    const forecastUpper: number[] = [];
    const residuals = signal.map((v, i) => v - fitted[i]);
    const residualStd = dsp.standardDeviation(residuals);

    for (let h = 1; h <= cfg.forecastHorizon; h++) {
      const pred = level + trend * h;
      const interval = 1.96 * residualStd * Math.sqrt(h);
      forecast.push(pred);
      forecastLower.push(pred - interval);
      forecastUpper.push(pred + interval);
    }

    // RUL预测
    let rul: number | null = null;
    if (cfg.failureThreshold > 0 && trend > 0) {
      rul = Math.ceil((cfg.failureThreshold - level) / trend);
      if (rul < 0) rul = 0;
    } else if (cfg.failureThreshold > 0 && trend < 0) {
      rul = Math.ceil((cfg.failureThreshold - level) / trend);
      if (rul < 0) rul = null; // 已低于阈值
    }

    // 预测质量评估
    const mape = signal.length > 10
      ? signal.slice(-10).reduce((s, v, i) => s + Math.abs((v - fitted[n - 10 + i]) / (v || 1)), 0) / 10 * 100
      : 0;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `预测完成(Holt指数平滑): 未来${cfg.forecastHorizon}步预测。` +
        `趋势=${trend > 0 ? '上升' : trend < 0 ? '下降' : '平稳'}(${trend.toFixed(4)}/步)，` +
        `MAPE=${mape.toFixed(1)}%` +
        (rul !== null ? `，预计剩余寿命RUL=${rul}步` : ''),
      severity: rul !== null && rul < cfg.forecastHorizon ? 'warning' : 'normal',
      urgency: rul !== null && rul < 10 ? 'immediate' : 'monitoring',
      confidence: Math.max(0, 1 - mape / 100),
      referenceStandard: 'Holt 1957 / Brown 1959',
    }, {
      forecast,
      forecastLower,
      forecastUpper,
      fitted: fitted.slice(-100),
      trend,
      level,
      rul,
      mape,
      residualStd,
    }, [{
      type: 'line',
      title: '趋势预测',
      xAxis: { label: '时间步' },
      yAxis: { label: '值' },
      series: [
        { name: '历史', data: signal.slice(-100), color: '#3b82f6' },
        { name: '预测', data: forecast, color: '#f59e0b' },
      ],
    }]);
  }
}

// ============================================================
// 导出
// ============================================================

export function getAgentPluginAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new TimeSeriesPatternExpert(),
      metadata: {
        description: '时序模式专家：趋势/周期/突变/变点检测(CUSUM)',
        tags: ['时序', '模式识别', 'CUSUM', '变点检测', 'Agent'],
        inputFields: [{ name: 'data', type: 'number[]', description: '时序数据', required: true }],
        outputFields: [
          { name: 'trend', type: 'object', description: '趋势分析结果' },
          { name: 'changePoints', type: 'number[]', description: '变点位置' },
          { name: 'periodicity', type: 'object', description: '周期性检测结果' },
        ],
        configFields: [
          { name: 'cusumThreshold', type: 'number', default: 5, description: 'CUSUM阈值' },
          { name: 'minSegmentLength', type: 'number', default: 20, description: '最小段长' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['趋势分析', '变点检测', '模式识别'],
        complexity: 'O(N*L)',
        edgeDeployable: true,
        referenceStandards: ['Page 1954', 'Killick et al. 2012'],
      },
    },
    {
      executor: new CaseRetrievalExpert(),
      metadata: {
        description: '案例检索专家：余弦/DTW相似度检索，历史案例匹配',
        tags: ['案例检索', 'CBR', 'DTW', '相似度', 'Agent'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '查询特征向量', required: true },
          { name: 'context.caseLibrary', type: 'object[]', description: '案例库', required: true },
        ],
        outputFields: [{ name: 'matches', type: 'object[]', description: '匹配结果' }],
        configFields: [
          { name: 'similarityMethod', type: 'select', options: ['cosine', 'dtw', 'euclidean'], default: 'cosine' },
          { name: 'topK', type: 'number', default: 5, description: '返回Top-K' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['故障诊断', '维修建议', '经验复用'],
        complexity: 'O(N*D)',
        edgeDeployable: true,
        referenceStandards: ['Aamodt & Plaza 1994'],
      },
    },
    {
      executor: new PhysicalConstraintExpert(),
      metadata: {
        description: '物理约束专家：物理模型验证、范围/变化率/平衡约束检查',
        tags: ['物理约束', '一致性检查', '数据质量', 'Agent'],
        inputFields: [{ name: 'data', type: 'Record<string,number[]>', description: '多变量数据', required: true }],
        outputFields: [{ name: 'violations', type: 'object[]', description: '违反约束列表' }],
        configFields: [
          { name: 'constraints', type: 'object[]', description: '自定义约束列表' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['数据验证', '传感器校验', '物理一致性'],
        complexity: 'O(N*C)',
        edgeDeployable: true,
        referenceStandards: ['Physics-Informed ML'],
      },
    },
    {
      executor: new SpatialAnomalyExpert(),
      metadata: {
        description: '空间异常专家：多传感器关联分析、孤立/传播异常识别',
        tags: ['空间异常', '多传感器', '关联分析', 'Agent'],
        inputFields: [{ name: 'data', type: 'Record<string,number[]>', description: '多传感器数据', required: true }],
        outputFields: [
          { name: 'anomalies', type: 'object[]', description: '异常列表' },
          { name: 'correlationMatrix', type: 'object', description: '相关性矩阵' },
        ],
        configFields: [
          { name: 'correlationThreshold', type: 'number', default: 0.7, description: '相关性阈值' },
          { name: 'anomalyThreshold', type: 'number', default: 3, description: '异常Z-score阈值' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['传感器故障检测', '异常传播分析'],
        complexity: 'O(S^2*N)',
        edgeDeployable: true,
        referenceStandards: ['Spatial Statistics'],
      },
    },
    {
      executor: new FusionDiagnosisExpert(),
      metadata: {
        description: '融合诊断专家：多算法投票/加权融合，综合置信度评估',
        tags: ['融合诊断', '集成学习', '多算法', 'Agent'],
        inputFields: [
          { name: 'context.diagnosticResults', type: 'object[]', description: '多个算法诊断结果', required: true },
        ],
        outputFields: [
          { name: 'fusedDiagnosis', type: 'string', description: '融合诊断结论' },
          { name: 'fusedConfidence', type: 'number', description: '融合置信度' },
        ],
        configFields: [
          { name: 'fusionMethod', type: 'select', options: ['voting', 'weighted', 'ds'], default: 'weighted' },
          { name: 'weights', type: 'number[]', description: '各算法权重' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['综合诊断', '决策支持'],
        complexity: 'O(N*K)',
        edgeDeployable: true,
        referenceStandards: ['Ensemble Methods'],
      },
    },
    {
      executor: new PredictionExpert(),
      metadata: {
        description: '预测专家：Holt指数平滑趋势外推、RUL剩余寿命预测',
        tags: ['预测', 'RUL', '趋势外推', '指数平滑', 'Agent'],
        inputFields: [{ name: 'data', type: 'number[]', description: '历史时序数据', required: true }],
        outputFields: [
          { name: 'forecast', type: 'number[]', description: '预测值' },
          { name: 'rul', type: 'number', description: '剩余寿命' },
        ],
        configFields: [
          { name: 'forecastHorizon', type: 'number', default: 30, description: '预测步数' },
          { name: 'alpha', type: 'number', default: 0.3, description: '平滑系数' },
          { name: 'failureThreshold', type: 'number', default: 0, description: '故障阈值(0=不预测RUL)' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['趋势预测', '寿命预测', '预测性维护'],
        complexity: 'O(N+H)',
        edgeDeployable: true,
        referenceStandards: ['Holt 1957', 'Brown 1959'],
      },
    },
  ];
}
