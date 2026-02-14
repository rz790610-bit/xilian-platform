/**
 * ============================================================================
 * 内置算法 — 分析与诊断（Analytics & Diagnostics）
 * ============================================================================
 * 
 * 涵盖：
 * 1. 统计特征提取（时域 + 频域 24 维特征向量）
 * 2. 相关性分析
 * 3. 分布检验（正态性 / 平稳性）
 * 4. RUL 预测（指数退化模型）
 * 5. 健康指数计算
 * 6. 自适应阈值优化
 * 7. K-Means 聚类
 * 8. 趋势分析（线性回归 + Mann-Kendall）
 */

// ============================================================================
// 1. 统计特征提取
// ============================================================================

export async function statistical_features(
  inputData: { data: number[]; sampleRate?: number },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const N = data.length;

  if (N === 0) return { features: {}, metadata: { error: 'Empty input data' } };

  // 基础统计
  const mean = data.reduce((s, v) => s + v, 0) / N;
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
  const std = Math.sqrt(variance);
  const sorted = [...data].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[N - 1];
  const median = N % 2 === 0 ? (sorted[N / 2 - 1] + sorted[N / 2]) / 2 : sorted[Math.floor(N / 2)];
  const range = max - min;

  // RMS
  const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / N);

  // 峰值
  const peak = Math.max(Math.abs(min), Math.abs(max));

  // 峰峰值
  const peakToPeak = range;

  // 波形因子（Form Factor）
  const meanAbs = data.reduce((s, v) => s + Math.abs(v), 0) / N;
  const formFactor = meanAbs > 0 ? rms / meanAbs : 0;

  // 峰值因子（Crest Factor）
  const crestFactor = rms > 0 ? peak / rms : 0;

  // 脉冲因子（Impulse Factor）
  const impulseFactor = meanAbs > 0 ? peak / meanAbs : 0;

  // 裕度因子（Clearance Factor）
  const sqrtMean = data.reduce((s, v) => s + Math.sqrt(Math.abs(v)), 0) / N;
  const clearanceFactor = sqrtMean > 0 ? peak / (sqrtMean ** 2) : 0;

  // 偏度（Skewness）
  const skewness = std > 0 ? data.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / N : 0;

  // 峰度（Kurtosis）
  const kurtosis = std > 0 ? data.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / N : 0;

  // 能量
  const energy = data.reduce((s, v) => s + v * v, 0);

  // 过零率
  let zeroCrossings = 0;
  for (let i = 1; i < N; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  const zeroCrossingRate = zeroCrossings / (N - 1);

  // 自相关（lag-1）
  let autoCorr = 0;
  for (let i = 1; i < N; i++) {
    autoCorr += (data[i] - mean) * (data[i - 1] - mean);
  }
  autoCorr = variance > 0 ? autoCorr / ((N - 1) * variance) : 0;

  // 百分位数
  const p25 = sorted[Math.floor(N * 0.25)];
  const p75 = sorted[Math.floor(N * 0.75)];
  const iqr = p75 - p25;

  const features = {
    // 时域特征（16 维）
    mean, std, variance, rms, peak, peakToPeak,
    min, max, median, range,
    skewness, kurtosis, energy,
    formFactor, crestFactor, impulseFactor, clearanceFactor,
    zeroCrossingRate, autoCorrelation: autoCorr,
    p25, p75, iqr,
    // 元信息
    sampleCount: N,
  };

  return {
    features,
    featureVector: Object.values(features).slice(0, 22), // 22 维特征向量
    metadata: {
      dimensions: 22,
      sampleCount: N,
    },
  };
}

// ============================================================================
// 2. 相关性分析
// ============================================================================

export async function correlation_analysis(
  inputData: { channels: number[][] },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const channels = inputData.channels;
  if (!channels || channels.length < 2) {
    return { error: 'Need at least 2 channels for correlation analysis' };
  }

  const numChannels = channels.length;
  const correlationMatrix: number[][] = [];

  for (let i = 0; i < numChannels; i++) {
    const row: number[] = [];
    for (let j = 0; j < numChannels; j++) {
      row.push(pearsonCorrelation(channels[i], channels[j]));
    }
    correlationMatrix.push(row);
  }

  // 找出高相关性对
  const highCorrelations: Array<{ ch1: number; ch2: number; correlation: number }> = [];
  const threshold = (config.threshold as number) || 0.8;

  for (let i = 0; i < numChannels; i++) {
    for (let j = i + 1; j < numChannels; j++) {
      if (Math.abs(correlationMatrix[i][j]) >= threshold) {
        highCorrelations.push({
          ch1: i, ch2: j,
          correlation: correlationMatrix[i][j],
        });
      }
    }
  }

  return {
    correlationMatrix,
    highCorrelations,
    metadata: {
      numChannels,
      threshold,
    },
  };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let cov = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  return denom > 0 ? cov / denom : 0;
}

// ============================================================================
// 3. 分布检验
// ============================================================================

export async function distribution_test(
  inputData: { data: number[] },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const N = data.length;

  if (N < 8) return { error: 'Need at least 8 samples for distribution test' };

  const mean = data.reduce((s, v) => s + v, 0) / N;
  const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / N);

  // Jarque-Bera 正态性检验
  const skewness = std > 0 ? data.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / N : 0;
  const kurtosis = std > 0 ? data.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / N : 0;
  const jbStatistic = (N / 6) * (skewness ** 2 + (kurtosis - 3) ** 2 / 4);
  // 近似 p 值（chi-squared with 2 df）
  const jbPValue = Math.exp(-jbStatistic / 2);
  const isNormal = jbPValue > 0.05;

  // 平稳性检验（简化版 ADF — 基于一阶差分的方差比）
  const diffs: number[] = [];
  for (let i = 1; i < N; i++) {
    diffs.push(data[i] - data[i - 1]);
  }
  const diffMean = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const diffVar = diffs.reduce((s, v) => s + (v - diffMean) ** 2, 0) / diffs.length;
  const originalVar = data.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
  const varianceRatio = originalVar > 0 ? diffVar / originalVar : 1;
  // 平稳信号的差分方差应接近 2 倍原始方差
  const isStationary = varianceRatio > 1.5 && varianceRatio < 2.5;

  // 直方图
  const bins = (config.bins as number) || 20;
  const binWidth = (Math.max(...data) - Math.min(...data)) / bins || 1;
  const histogram: Array<{ binStart: number; binEnd: number; count: number }> = [];
  const minVal = Math.min(...data);

  for (let i = 0; i < bins; i++) {
    const binStart = minVal + i * binWidth;
    const binEnd = binStart + binWidth;
    const count = data.filter(v => v >= binStart && (i === bins - 1 ? v <= binEnd : v < binEnd)).length;
    histogram.push({ binStart, binEnd, count });
  }

  return {
    normalityTest: {
      method: 'Jarque-Bera',
      statistic: jbStatistic,
      pValue: jbPValue,
      isNormal,
      skewness,
      kurtosis,
    },
    stationarityTest: {
      method: 'Variance-Ratio (simplified ADF)',
      varianceRatio,
      isStationary,
    },
    histogram,
    metadata: {
      sampleCount: N,
      mean, std,
    },
  };
}

// ============================================================================
// 4. RUL 预测（指数退化模型）
// ============================================================================

export async function rul_prediction(
  inputData: { data: number[]; timestamps?: number[] },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const N = data.length;
  const failureThreshold = (config.failure_threshold as number) || (Math.max(...data) * 1.5);
  const confidenceLevel = (config.confidence_level as number) || 0.95;

  if (N < 10) return { error: 'Need at least 10 data points for RUL prediction' };

  // 时间轴（归一化）
  const t = inputData.timestamps || Array.from({ length: N }, (_, i) => i);

  // 指数退化模型：y = a * exp(b * t) + c
  // 简化为线性回归 ln(y - c) = ln(a) + b * t
  const minVal = Math.min(...data);
  const offset = minVal > 0 ? 0 : Math.abs(minVal) + 1;
  const logData = data.map(v => Math.log(v + offset));

  // 线性回归 logData = slope * t + intercept
  const tMean = t.reduce((s, v) => s + v, 0) / N;
  const logMean = logData.reduce((s, v) => s + v, 0) / N;

  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    num += (t[i] - tMean) * (logData[i] - logMean);
    den += (t[i] - tMean) ** 2;
  }

  const slope = den > 0 ? num / den : 0;
  const intercept = logMean - slope * tMean;

  // 预测 RUL
  const logThreshold = Math.log(failureThreshold + offset);
  let predictedFailureTime: number | null = null;

  if (slope > 0) {
    predictedFailureTime = (logThreshold - intercept) / slope;
  }

  const currentTime = t[N - 1];
  const rul = predictedFailureTime !== null ? Math.max(0, predictedFailureTime - currentTime) : null;

  // 置信区间（基于残差标准差）
  const residuals = data.map((v, i) => v - Math.exp(intercept + slope * t[i]) + offset);
  const residualStd = Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / N);
  const zScore = confidenceLevel === 0.95 ? 1.96 : 2.576;

  // 趋势预测（未来 20 步）
  const forecastSteps = (config.forecast_steps as number) || 20;
  const forecast: Array<{ time: number; predicted: number; lower: number; upper: number }> = [];

  for (let i = 1; i <= forecastSteps; i++) {
    const futureT = currentTime + i;
    const predicted = Math.exp(intercept + slope * futureT) - offset;
    const uncertainty = residualStd * Math.sqrt(1 + 1 / N + (futureT - tMean) ** 2 / den) * zScore;

    forecast.push({
      time: futureT,
      predicted,
      lower: predicted - uncertainty,
      upper: predicted + uncertainty,
    });
  }

  // 健康状态评估
  const currentValue = data[N - 1];
  const healthRatio = failureThreshold > 0 ? 1 - currentValue / failureThreshold : 1;
  let healthStatus: string;
  if (healthRatio > 0.7) healthStatus = 'good';
  else if (healthRatio > 0.4) healthStatus = 'warning';
  else if (healthRatio > 0.1) healthStatus = 'critical';
  else healthStatus = 'failure';

  return {
    rul,
    predictedFailureTime,
    healthStatus,
    healthRatio: Math.max(0, Math.min(1, healthRatio)),
    degradationModel: {
      type: 'exponential',
      slope,
      intercept,
      r_squared: 1 - residuals.reduce((s, v) => s + v * v, 0) / data.reduce((s, v) => s + (v - data.reduce((a, b) => a + b, 0) / N) ** 2, 0),
    },
    forecast,
    metadata: {
      sampleCount: N,
      failureThreshold,
      confidenceLevel,
      currentValue,
      residualStd,
    },
  };
}

// ============================================================================
// 5. 健康指数计算
// ============================================================================

export async function health_index(
  inputData: { features: Record<string, number>; weights?: Record<string, number> },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const features = inputData.features;
  const weights = inputData.weights || {};
  const method = (config.method as string) || 'weighted_sum';
  const thresholds = (config.thresholds as Record<string, { warning: number; critical: number }>) || {};

  // 默认权重
  const defaultWeights: Record<string, number> = {
    rms: 0.25,
    kurtosis: 0.2,
    crestFactor: 0.15,
    skewness: 0.1,
    peak: 0.15,
    energy: 0.15,
  };

  const effectiveWeights = { ...defaultWeights, ...weights };

  // 归一化特征值到 [0, 1]
  const normalizedFeatures: Record<string, number> = {};
  const featureStatus: Record<string, string> = {};

  for (const [key, value] of Object.entries(features)) {
    const threshold = thresholds[key];
    if (threshold) {
      // 基于阈值归一化
      if (value <= threshold.warning) {
        normalizedFeatures[key] = value / threshold.warning;
        featureStatus[key] = 'normal';
      } else if (value <= threshold.critical) {
        normalizedFeatures[key] = 0.5 + 0.5 * (value - threshold.warning) / (threshold.critical - threshold.warning);
        featureStatus[key] = 'warning';
      } else {
        normalizedFeatures[key] = 1;
        featureStatus[key] = 'critical';
      }
    } else {
      normalizedFeatures[key] = Math.min(1, Math.abs(value) / 100);
      featureStatus[key] = 'unknown';
    }
  }

  // 计算健康指数
  let hi = 0;
  let totalWeight = 0;

  if (method === 'weighted_sum') {
    for (const [key, normValue] of Object.entries(normalizedFeatures)) {
      const w = effectiveWeights[key] || 0.1;
      hi += (1 - normValue) * w; // 1 - normValue 使得值越小越健康
      totalWeight += w;
    }
    hi = totalWeight > 0 ? hi / totalWeight : 0;
  }

  // 健康等级
  let grade: string;
  if (hi >= 0.8) grade = 'A';
  else if (hi >= 0.6) grade = 'B';
  else if (hi >= 0.4) grade = 'C';
  else if (hi >= 0.2) grade = 'D';
  else grade = 'F';

  return {
    healthIndex: Math.round(hi * 1000) / 10, // 0-100 分
    grade,
    featureContributions: Object.entries(normalizedFeatures).map(([key, value]) => ({
      feature: key,
      normalizedValue: value,
      weight: effectiveWeights[key] || 0.1,
      status: featureStatus[key],
      contribution: (1 - value) * (effectiveWeights[key] || 0.1),
    })),
    metadata: {
      method,
      featureCount: Object.keys(features).length,
    },
  };
}

// ============================================================================
// 6. 自适应阈值优化
// ============================================================================

export async function adaptive_threshold(
  inputData: { data: number[]; labels?: number[] },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const N = data.length;
  const method = (config.method as string) || 'statistical'; // statistical / percentile / otsu
  const sensitivity = (config.sensitivity as number) || 1.0;

  const mean = data.reduce((s, v) => s + v, 0) / N;
  const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / N);
  const sorted = [...data].sort((a, b) => a - b);

  let warningThreshold: number;
  let criticalThreshold: number;

  switch (method) {
    case 'statistical': {
      // 基于均值 + k*σ
      warningThreshold = mean + 2 * std * sensitivity;
      criticalThreshold = mean + 3 * std * sensitivity;
      break;
    }
    case 'percentile': {
      const warningPercentile = (config.warning_percentile as number) || 95;
      const criticalPercentile = (config.critical_percentile as number) || 99;
      warningThreshold = sorted[Math.floor(N * warningPercentile / 100)];
      criticalThreshold = sorted[Math.floor(N * criticalPercentile / 100)];
      break;
    }
    case 'otsu': {
      // Otsu 方法（二值化阈值）
      const bins = 256;
      const range = sorted[N - 1] - sorted[0] || 1;
      const binWidth = range / bins;
      const histogram = new Array(bins).fill(0);

      for (const v of data) {
        const bin = Math.min(bins - 1, Math.floor((v - sorted[0]) / binWidth));
        histogram[bin]++;
      }

      let maxVariance = 0;
      let bestThreshold = 0;

      for (let t = 1; t < bins; t++) {
        const w0 = histogram.slice(0, t).reduce((s, v) => s + v, 0) / N;
        const w1 = 1 - w0;
        if (w0 === 0 || w1 === 0) continue;

        const m0 = histogram.slice(0, t).reduce((s, v, i) => s + v * (sorted[0] + i * binWidth), 0) / (w0 * N);
        const m1 = histogram.slice(t).reduce((s, v, i) => s + v * (sorted[0] + (t + i) * binWidth), 0) / (w1 * N);

        const variance = w0 * w1 * (m0 - m1) ** 2;
        if (variance > maxVariance) {
          maxVariance = variance;
          bestThreshold = sorted[0] + t * binWidth;
        }
      }

      warningThreshold = bestThreshold * sensitivity;
      criticalThreshold = bestThreshold * 1.5 * sensitivity;
      break;
    }
    default:
      warningThreshold = mean + 2 * std;
      criticalThreshold = mean + 3 * std;
  }

  // 统计超阈值样本
  const warningCount = data.filter(v => v >= warningThreshold && v < criticalThreshold).length;
  const criticalCount = data.filter(v => v >= criticalThreshold).length;

  return {
    thresholds: {
      warning: warningThreshold,
      critical: criticalThreshold,
    },
    statistics: {
      mean, std,
      warningCount,
      criticalCount,
      warningRate: warningCount / N,
      criticalRate: criticalCount / N,
    },
    metadata: {
      method,
      sensitivity,
      sampleCount: N,
    },
  };
}

// ============================================================================
// 7. K-Means 聚类
// ============================================================================

export async function kmeans_clustering(
  inputData: { data: number[][]; },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const k = (config.k as number) || 3;
  const maxIterations = (config.max_iterations as number) || 100;
  const tolerance = (config.tolerance as number) || 1e-4;

  if (data.length < k) return { error: `Need at least ${k} samples for ${k}-means clustering` };

  const dims = data[0].length;
  const N = data.length;

  // 初始化质心（K-Means++）
  const centroids: number[][] = [];
  centroids.push([...data[Math.floor(Math.random() * N)]]);

  for (let c = 1; c < k; c++) {
    const distances = data.map(point => {
      const minDist = Math.min(...centroids.map(cent => euclideanDist(point, cent)));
      return minDist * minDist;
    });
    const totalDist = distances.reduce((s, d) => s + d, 0);
    let r = Math.random() * totalDist;
    for (let i = 0; i < N; i++) {
      r -= distances[i];
      if (r <= 0) {
        centroids.push([...data[i]]);
        break;
      }
    }
    if (centroids.length <= c) centroids.push([...data[Math.floor(Math.random() * N)]]);
  }

  // 迭代
  let labels = new Array(N).fill(0);
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    // 分配
    const newLabels = data.map(point => {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDist(point, centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      return bestCluster;
    });

    // 更新质心
    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      const clusterPoints = data.filter((_, i) => newLabels[i] === c);
      if (clusterPoints.length === 0) continue;

      const newCentroid = new Array(dims).fill(0);
      for (const point of clusterPoints) {
        for (let d = 0; d < dims; d++) {
          newCentroid[d] += point[d];
        }
      }
      for (let d = 0; d < dims; d++) {
        newCentroid[d] /= clusterPoints.length;
      }

      maxShift = Math.max(maxShift, euclideanDist(centroids[c], newCentroid));
      centroids[c] = newCentroid;
    }

    labels = newLabels;

    if (maxShift < tolerance) break;
  }

  // 计算轮廓系数
  const silhouetteScores = data.map((point, i) => {
    const cluster = labels[i];
    const sameCluster = data.filter((_, j) => labels[j] === cluster && j !== i);
    const a = sameCluster.length > 0
      ? sameCluster.reduce((s, p) => s + euclideanDist(point, p), 0) / sameCluster.length
      : 0;

    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === cluster) continue;
      const otherCluster = data.filter((_, j) => labels[j] === c);
      if (otherCluster.length === 0) continue;
      const avgDist = otherCluster.reduce((s, p) => s + euclideanDist(point, p), 0) / otherCluster.length;
      b = Math.min(b, avgDist);
    }

    const maxAB = Math.max(a, b);
    return maxAB > 0 ? (b - a) / maxAB : 0;
  });

  const avgSilhouette = silhouetteScores.reduce((s, v) => s + v, 0) / N;

  // 聚类统计
  const clusterStats = Array.from({ length: k }, (_, c) => {
    const clusterPoints = data.filter((_, i) => labels[i] === c);
    return {
      cluster: c,
      size: clusterPoints.length,
      centroid: centroids[c],
      avgSilhouette: clusterPoints.length > 0
        ? silhouetteScores.filter((_, i) => labels[i] === c).reduce((s, v) => s + v, 0) / clusterPoints.length
        : 0,
    };
  });

  return {
    labels,
    centroids,
    clusterStats,
    avgSilhouetteScore: avgSilhouette,
    metadata: {
      k,
      iterations,
      sampleCount: N,
      dimensions: dims,
    },
  };
}

function euclideanDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - (b[i] || 0)) ** 2;
  }
  return Math.sqrt(sum);
}

// ============================================================================
// 8. 趋势分析
// ============================================================================

export async function trend_analysis(
  inputData: { data: number[]; timestamps?: number[] },
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = inputData.data;
  const N = data.length;
  const t = inputData.timestamps || Array.from({ length: N }, (_, i) => i);

  if (N < 5) return { error: 'Need at least 5 data points for trend analysis' };

  // 线性回归
  const tMean = t.reduce((s, v) => s + v, 0) / N;
  const yMean = data.reduce((s, v) => s + v, 0) / N;

  let num = 0, den = 0;
  for (let i = 0; i < N; i++) {
    num += (t[i] - tMean) * (data[i] - yMean);
    den += (t[i] - tMean) ** 2;
  }

  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * tMean;

  // R²
  const ssRes = data.reduce((s, v, i) => s + (v - (intercept + slope * t[i])) ** 2, 0);
  const ssTot = data.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Mann-Kendall 趋势检验
  let S = 0;
  for (let i = 0; i < N - 1; i++) {
    for (let j = i + 1; j < N; j++) {
      S += Math.sign(data[j] - data[i]);
    }
  }

  const varS = N * (N - 1) * (2 * N + 5) / 18;
  const Z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;

  // p 值近似（标准正态分布）
  const mkPValue = 2 * (1 - normalCDF(Math.abs(Z)));
  const hasTrend = mkPValue < 0.05;

  // 趋势方向
  let trendDirection: string;
  if (!hasTrend) trendDirection = 'stable';
  else if (slope > 0) trendDirection = 'increasing';
  else trendDirection = 'decreasing';

  // 变化率
  const changeRate = data[0] !== 0 ? ((data[N - 1] - data[0]) / Math.abs(data[0])) * 100 : 0;

  // 移动平均
  const windowSize = (config.moving_avg_window as number) || Math.max(3, Math.floor(N / 10));
  const movingAvg: number[] = [];
  for (let i = 0; i < N; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(N, i + Math.floor(windowSize / 2) + 1);
    const window = data.slice(start, end);
    movingAvg.push(window.reduce((s, v) => s + v, 0) / window.length);
  }

  return {
    linearRegression: {
      slope,
      intercept,
      rSquared,
    },
    mannKendall: {
      statistic: S,
      zScore: Z,
      pValue: mkPValue,
      hasTrend,
    },
    trendDirection,
    changeRate,
    movingAverage: movingAvg.slice(0, 1000),
    metadata: {
      sampleCount: N,
      movingAvgWindow: windowSize,
    },
  };
}

/** 标准正态分布 CDF 近似 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// ============================================================================
// 统一导出
// ============================================================================

export const analyticsAlgorithms: Record<string, (inputData: any, config: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  statistical_features,
  correlation_analysis,
  distribution_test,
  rul_prediction,
  health_index,
  adaptive_threshold,
  kmeans_clustering,
  trend_analysis,
};
