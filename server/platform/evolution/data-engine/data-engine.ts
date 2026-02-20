/**
 * ============================================================================
 * 数据发现引擎 — DataDiscoveryEngine
 * ============================================================================
 *
 * 自进化飞轮第 1 步：从历史数据中发现模式、异常、趋势
 *
 * 职责：
 *   1. 扫描时序数据发现统计异常
 *   2. 挖掘周期性模式和趋势
 *   3. 检测特征漂移
 *   4. 生成数据发现报告供 MetaLearner 消费
 */

// ============================================================================
// 数据发现类型
// ============================================================================

export interface DataDiscoveryConfig {
  /** 扫描窗口大小 */
  windowSizeMs: number;
  /** 异常检测灵敏度 (0-1) */
  anomalySensitivity: number;
  /** 最小模式出现次数 */
  minPatternOccurrences: number;
  /** 特征漂移检测阈值 */
  driftThreshold: number;
  /** 最大并行扫描数 */
  maxParallelScans: number;
}

export const DEFAULT_DISCOVERY_CONFIG: DataDiscoveryConfig = {
  windowSizeMs: 24 * 60 * 60 * 1000, // 24小时
  anomalySensitivity: 0.8,
  minPatternOccurrences: 3,
  driftThreshold: 0.15,
  maxParallelScans: 4,
};

export interface Discovery {
  id: string;
  type: 'anomaly' | 'pattern' | 'trend' | 'drift' | 'correlation';
  /** 发现时间 */
  discoveredAt: number;
  /** 涉及的数据源 */
  sourceIds: string[];
  /** 涉及的特征 */
  features: string[];
  /** 描述 */
  description: string;
  /** 置信度 */
  confidence: number;
  /** 严重程度 (0-1) */
  severity: number;
  /** 详细数据 */
  details: Record<string, unknown>;
  /** 建议的后续动作 */
  suggestedActions: string[];
}

export interface DiscoveryReport {
  id: string;
  /** 扫描时间范围 */
  scanWindow: { start: number; end: number };
  /** 扫描的数据源数量 */
  sourcesScanned: number;
  /** 扫描的数据点数量 */
  dataPointsScanned: number;
  /** 发现列表 */
  discoveries: Discovery[];
  /** 统计摘要 */
  summary: {
    totalDiscoveries: number;
    byType: Record<string, number>;
    avgConfidence: number;
    topSeverity: Discovery | null;
  };
  /** 生成时间 */
  generatedAt: number;
}

// ============================================================================
// 数据发现引擎实现
// ============================================================================

export class DataDiscoveryEngine {
  private config: DataDiscoveryConfig;
  private reports: DiscoveryReport[] = [];
  private maxReports = 100;

  constructor(config?: Partial<DataDiscoveryConfig>) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  }

  /**
   * 执行数据发现扫描
   */
  async scan(data: {
    sourceId: string;
    timeseries: Array<{ timestamp: number; values: Record<string, number> }>;
  }[]): Promise<DiscoveryReport> {
    const now = Date.now();
    const discoveries: Discovery[] = [];
    let totalPoints = 0;

    for (const source of data) {
      totalPoints += source.timeseries.length;

      // 1. 异常检测
      const anomalies = this.detectAnomalies(source.sourceId, source.timeseries);
      discoveries.push(...anomalies);

      // 2. 模式挖掘
      const patterns = this.detectPatterns(source.sourceId, source.timeseries);
      discoveries.push(...patterns);

      // 3. 趋势检测
      const trends = this.detectTrends(source.sourceId, source.timeseries);
      discoveries.push(...trends);

      // 4. 特征漂移检测
      const drifts = this.detectDrift(source.sourceId, source.timeseries);
      discoveries.push(...drifts);
    }

    // 5. 跨源相关性分析
    if (data.length > 1) {
      const correlations = this.detectCorrelations(data);
      discoveries.push(...correlations);
    }

    // 生成报告
    const report: DiscoveryReport = {
      id: `dr_${now}_${Math.random().toString(36).slice(2, 8)}`,
      scanWindow: {
        start: now - this.config.windowSizeMs,
        end: now,
      },
      sourcesScanned: data.length,
      dataPointsScanned: totalPoints,
      discoveries,
      summary: this.summarize(discoveries),
      generatedAt: now,
    };

    this.reports.push(report);
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(-this.maxReports);
    }

    return report;
  }

  /**
   * 获取历史报告
   */
  getReports(limit?: number): DiscoveryReport[] {
    return limit ? this.reports.slice(-limit) : [...this.reports];
  }

  /**
   * 获取最新报告
   */
  getLatestReport(): DiscoveryReport | null {
    return this.reports.length > 0 ? this.reports[this.reports.length - 1] : null;
  }

  // --------------------------------------------------------------------------
  // 检测算法
  // --------------------------------------------------------------------------

  private detectAnomalies(
    sourceId: string,
    timeseries: Array<{ timestamp: number; values: Record<string, number> }>,
  ): Discovery[] {
    const discoveries: Discovery[] = [];
    if (timeseries.length < 10) return discoveries;

    const features = Object.keys(timeseries[0].values);

    for (const feature of features) {
      const values = timeseries.map(t => t.values[feature]).filter(v => v !== undefined);
      if (values.length < 10) continue;

      // Z-score 异常检测
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      if (std === 0) continue;

      const threshold = 2 + (1 - this.config.anomalySensitivity) * 2; // 2-4 sigma
      const anomalyIndices: number[] = [];

      for (let i = 0; i < values.length; i++) {
        const zScore = Math.abs((values[i] - mean) / std);
        if (zScore > threshold) {
          anomalyIndices.push(i);
        }
      }

      if (anomalyIndices.length > 0) {
        discoveries.push({
          id: `disc_anomaly_${sourceId}_${feature}_${Date.now()}`,
          type: 'anomaly',
          discoveredAt: Date.now(),
          sourceIds: [sourceId],
          features: [feature],
          description: `特征 ${feature} 在数据源 ${sourceId} 中检测到 ${anomalyIndices.length} 个异常点（Z-score > ${threshold.toFixed(1)}σ）`,
          confidence: Math.min(0.95, 0.7 + anomalyIndices.length * 0.02),
          severity: Math.min(1, anomalyIndices.length / values.length * 10),
          details: {
            mean,
            std,
            threshold,
            anomalyCount: anomalyIndices.length,
            anomalyRatio: anomalyIndices.length / values.length,
          },
          suggestedActions: [
            `检查数据源 ${sourceId} 的 ${feature} 传感器是否正常`,
            `分析异常时间点的工况上下文`,
          ],
        });
      }
    }

    return discoveries;
  }

  private detectPatterns(
    sourceId: string,
    timeseries: Array<{ timestamp: number; values: Record<string, number> }>,
  ): Discovery[] {
    const discoveries: Discovery[] = [];
    if (timeseries.length < 20) return discoveries;

    // 简化的周期性检测：通过自相关函数
    const features = Object.keys(timeseries[0].values);

    for (const feature of features) {
      const values = timeseries.map(t => t.values[feature]).filter(v => v !== undefined);
      if (values.length < 20) continue;

      const period = this.findDominantPeriod(values);
      if (period && period.strength > 0.5) {
        discoveries.push({
          id: `disc_pattern_${sourceId}_${feature}_${Date.now()}`,
          type: 'pattern',
          discoveredAt: Date.now(),
          sourceIds: [sourceId],
          features: [feature],
          description: `特征 ${feature} 存在周期性模式，周期约 ${period.length} 个采样点，强度 ${(period.strength * 100).toFixed(0)}%`,
          confidence: period.strength,
          severity: 0.3,
          details: {
            periodLength: period.length,
            periodStrength: period.strength,
          },
          suggestedActions: [
            `利用周期性模式优化采样策略`,
            `建立基于周期的预测模型`,
          ],
        });
      }
    }

    return discoveries;
  }

  private detectTrends(
    sourceId: string,
    timeseries: Array<{ timestamp: number; values: Record<string, number> }>,
  ): Discovery[] {
    const discoveries: Discovery[] = [];
    if (timeseries.length < 10) return discoveries;

    const features = Object.keys(timeseries[0].values);

    for (const feature of features) {
      const values = timeseries.map(t => t.values[feature]).filter(v => v !== undefined);
      if (values.length < 10) continue;

      // 线性回归检测趋势
      const n = values.length;
      const xMean = (n - 1) / 2;
      const yMean = values.reduce((s, v) => s + v, 0) / n;

      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (values[i] - yMean);
        denominator += (i - xMean) ** 2;
      }

      const slope = denominator !== 0 ? numerator / denominator : 0;
      const rSquared = this.calculateRSquared(values, slope, yMean);

      // 显著趋势：R² > 0.5 且斜率有意义
      if (rSquared > 0.5 && Math.abs(slope) > yMean * 0.001) {
        const direction = slope > 0 ? '上升' : '下降';
        const changeRate = Math.abs(slope * n / yMean * 100);

        discoveries.push({
          id: `disc_trend_${sourceId}_${feature}_${Date.now()}`,
          type: 'trend',
          discoveredAt: Date.now(),
          sourceIds: [sourceId],
          features: [feature],
          description: `特征 ${feature} 呈${direction}趋势，变化率约 ${changeRate.toFixed(1)}%，R²=${rSquared.toFixed(3)}`,
          confidence: rSquared,
          severity: Math.min(1, changeRate / 50),
          details: {
            slope,
            rSquared,
            direction,
            changeRate,
            startValue: values[0],
            endValue: values[n - 1],
          },
          suggestedActions: [
            `监控 ${feature} 的${direction}趋势是否持续`,
            slope > 0 ? `检查是否需要设置上限告警` : `检查是否存在退化风险`,
          ],
        });
      }
    }

    return discoveries;
  }

  private detectDrift(
    sourceId: string,
    timeseries: Array<{ timestamp: number; values: Record<string, number> }>,
  ): Discovery[] {
    const discoveries: Discovery[] = [];
    if (timeseries.length < 20) return discoveries;

    const features = Object.keys(timeseries[0].values);
    const halfPoint = Math.floor(timeseries.length / 2);

    for (const feature of features) {
      const values = timeseries.map(t => t.values[feature]).filter(v => v !== undefined);
      if (values.length < 20) continue;

      const firstHalf = values.slice(0, halfPoint);
      const secondHalf = values.slice(halfPoint);

      const mean1 = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const mean2 = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      const std1 = Math.sqrt(firstHalf.reduce((s, v) => s + (v - mean1) ** 2, 0) / firstHalf.length);
      const std2 = Math.sqrt(secondHalf.reduce((s, v) => s + (v - mean2) ** 2, 0) / secondHalf.length);

      // 均值漂移检测
      const pooledStd = Math.sqrt((std1 ** 2 + std2 ** 2) / 2);
      const meanDrift = pooledStd > 0 ? Math.abs(mean2 - mean1) / pooledStd : 0;

      // 方差漂移检测
      const varianceDrift = std1 > 0 ? Math.abs(std2 - std1) / std1 : 0;

      if (meanDrift > this.config.driftThreshold * 10 || varianceDrift > this.config.driftThreshold) {
        discoveries.push({
          id: `disc_drift_${sourceId}_${feature}_${Date.now()}`,
          type: 'drift',
          discoveredAt: Date.now(),
          sourceIds: [sourceId],
          features: [feature],
          description: `特征 ${feature} 检测到分布漂移：均值漂移 ${meanDrift.toFixed(2)}σ，方差变化 ${(varianceDrift * 100).toFixed(1)}%`,
          confidence: Math.min(0.95, Math.max(meanDrift / 5, varianceDrift)),
          severity: Math.min(1, Math.max(meanDrift / 3, varianceDrift * 2)),
          details: {
            firstHalfMean: mean1,
            secondHalfMean: mean2,
            firstHalfStd: std1,
            secondHalfStd: std2,
            meanDrift,
            varianceDrift,
          },
          suggestedActions: [
            `检查 ${feature} 传感器是否需要校准`,
            `更新该特征的基线模型`,
            `通知证据权重自学习引擎重新评估`,
          ],
        });
      }
    }

    return discoveries;
  }

  private detectCorrelations(
    data: Array<{ sourceId: string; timeseries: Array<{ timestamp: number; values: Record<string, number> }> }>,
  ): Discovery[] {
    const discoveries: Discovery[] = [];

    // 跨源相关性：取每个源的第一个特征做 Pearson 相关
    for (let i = 0; i < data.length - 1; i++) {
      for (let j = i + 1; j < data.length; j++) {
        const src1 = data[i];
        const src2 = data[j];
        const features1 = Object.keys(src1.timeseries[0]?.values || {});
        const features2 = Object.keys(src2.timeseries[0]?.values || {});

        for (const f1 of features1.slice(0, 3)) {
          for (const f2 of features2.slice(0, 3)) {
            const v1 = src1.timeseries.map(t => t.values[f1]).filter(v => v !== undefined);
            const v2 = src2.timeseries.map(t => t.values[f2]).filter(v => v !== undefined);
            const minLen = Math.min(v1.length, v2.length);
            if (minLen < 10) continue;

            const correlation = this.pearsonCorrelation(v1.slice(0, minLen), v2.slice(0, minLen));
            if (Math.abs(correlation) > 0.7) {
              discoveries.push({
                id: `disc_corr_${src1.sourceId}_${src2.sourceId}_${Date.now()}`,
                type: 'correlation',
                discoveredAt: Date.now(),
                sourceIds: [src1.sourceId, src2.sourceId],
                features: [f1, f2],
                description: `${src1.sourceId}.${f1} 与 ${src2.sourceId}.${f2} 存在${correlation > 0 ? '正' : '负'}相关（r=${correlation.toFixed(3)}）`,
                confidence: Math.abs(correlation),
                severity: 0.2,
                details: { correlation, sampleSize: minLen },
                suggestedActions: [
                  `利用相关性建立跨源预测模型`,
                  `检查是否存在因果关系`,
                ],
              });
            }
          }
        }
      }
    }

    return discoveries;
  }

  // --------------------------------------------------------------------------
  // 统计工具
  // --------------------------------------------------------------------------

  private findDominantPeriod(values: number[]): { length: number; strength: number } | null {
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const maxLag = Math.floor(n / 2);
    let bestLag = 0;
    let bestCorr = 0;

    for (let lag = 2; lag < maxLag; lag++) {
      let num = 0, den1 = 0, den2 = 0;
      for (let i = 0; i < n - lag; i++) {
        const a = values[i] - mean;
        const b = values[i + lag] - mean;
        num += a * b;
        den1 += a * a;
        den2 += b * b;
      }
      const corr = den1 > 0 && den2 > 0 ? num / Math.sqrt(den1 * den2) : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    return bestLag > 0 && bestCorr > 0.5
      ? { length: bestLag, strength: bestCorr }
      : null;
  }

  private calculateRSquared(values: number[], slope: number, yMean: number): number {
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < values.length; i++) {
      const predicted = yMean + slope * (i - (values.length - 1) / 2);
      ssRes += (values[i] - predicted) ** 2;
      ssTot += (values[i] - yMean) ** 2;
    }
    return ssTot > 0 ? 1 - ssRes / ssTot : 0;
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const xMean = x.reduce((s, v) => s + v, 0) / n;
    const yMean = y.reduce((s, v) => s + v, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - xMean;
      const dy = y[i] - yMean;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
  }

  private summarize(discoveries: Discovery[]): DiscoveryReport['summary'] {
    const byType: Record<string, number> = {};
    for (const d of discoveries) {
      byType[d.type] = (byType[d.type] || 0) + 1;
    }

    const avgConfidence = discoveries.length > 0
      ? discoveries.reduce((s, d) => s + d.confidence, 0) / discoveries.length
      : 0;

    const topSeverity = discoveries.length > 0
      ? discoveries.reduce((max, d) => d.severity > max.severity ? d : max, discoveries[0])
      : null;

    return {
      totalDiscoveries: discoveries.length,
      byType,
      avgConfidence,
      topSeverity,
    };
  }
}
