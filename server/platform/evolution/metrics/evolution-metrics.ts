/**
 * ============================================================================
 * 进化指标收集器 — EvolutionMetricsCollector
 * ============================================================================
 *
 * 收集和聚合自进化飞轮的全链路指标
 *
 * 指标维度：
 *   1. 飞轮速度（闭环周期时间）
 *   2. 改进幅度（每次迭代的指标提升）
 *   3. 模型健康度（准确率、漂移、退化）
 *   4. 知识积累（结晶数量、覆盖率）
 *   5. 系统效率（资源利用、吞吐量）
 */

// ============================================================================
// 指标类型
// ============================================================================

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  unit: string;
}

export interface MetricSeries {
  name: string;
  points: MetricPoint[];
  aggregations: {
    min: number;
    max: number;
    avg: number;
    sum: number;
    count: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface EvolutionDashboardData {
  /** 飞轮指标 */
  flywheel: {
    totalIterations: number;
    avgCycleTimeMs: number;
    avgImprovementPercent: number;
    currentVelocity: number; // 迭代/天
    accelerating: boolean;
  };
  /** 模型指标 */
  models: {
    totalModels: number;
    activeModels: number;
    avgAccuracy: number;
    driftDetected: number;
    lastTrainedAt: number | null;
  };
  /** 知识指标 */
  knowledge: {
    totalCrystals: number;
    totalPatterns: number;
    coveragePercent: number;
    lastCrystallizedAt: number | null;
  };
  /** 系统指标 */
  system: {
    uptimeMs: number;
    eventsProcessed: number;
    eventsPerSec: number;
    errorRate: number;
    avgLatencyMs: number;
  };
  /** 时间戳 */
  generatedAt: number;
}

// ============================================================================
// 进化指标收集器实现
// ============================================================================

export class EvolutionMetricsCollector {
  private metrics = new Map<string, MetricPoint[]>();
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private startTime = Date.now();
  private maxPointsPerMetric = 10_000;

  /**
   * 记录指标点
   */
  record(name: string, value: number, tags?: Record<string, string>, unit?: string): void {
    const point: MetricPoint = {
      name,
      value,
      timestamp: Date.now(),
      tags: tags || {},
      unit: unit || '',
    };

    let series = this.metrics.get(name);
    if (!series) {
      series = [];
      this.metrics.set(name, series);
    }
    series.push(point);

    // 限制存储
    if (series.length > this.maxPointsPerMetric) {
      this.metrics.set(name, series.slice(-this.maxPointsPerMetric));
    }
  }

  /**
   * 递增计数器
   */
  increment(name: string, delta: number = 1): number {
    const current = this.counters.get(name) || 0;
    const newValue = current + delta;
    this.counters.set(name, newValue);
    return newValue;
  }

  /**
   * 设置仪表值
   */
  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * 获取指标序列
   */
  getSeries(name: string, since?: number): MetricSeries | null {
    const points = this.metrics.get(name);
    if (!points || points.length === 0) return null;

    const filtered = since ? points.filter(p => p.timestamp >= since) : points;
    if (filtered.length === 0) return null;

    const values = filtered.map(p => p.value).sort((a, b) => a - b);

    return {
      name,
      points: filtered,
      aggregations: {
        min: values[0],
        max: values[values.length - 1],
        avg: values.reduce((s, v) => s + v, 0) / values.length,
        sum: values.reduce((s, v) => s + v, 0),
        count: values.length,
        p50: this.percentile(values, 50),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99),
      },
    };
  }

  /**
   * 获取计数器值
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * 获取仪表值
   */
  getGauge(name: string): number | undefined {
    return this.gauges.get(name);
  }

  /**
   * 生成仪表盘数据
   */
  getDashboardData(): EvolutionDashboardData {
    const now = Date.now();

    // 飞轮指标
    const cycleTimes = this.metrics.get('flywheel.cycle_time_ms') || [];
    const improvements = this.metrics.get('flywheel.improvement_percent') || [];
    const recentCycles = cycleTimes.filter(p => p.timestamp > now - 7 * 24 * 60 * 60 * 1000);
    const olderCycles = cycleTimes.filter(
      p => p.timestamp > now - 14 * 24 * 60 * 60 * 1000 && p.timestamp <= now - 7 * 24 * 60 * 60 * 1000,
    );

    const avgCycleTime = recentCycles.length > 0
      ? recentCycles.reduce((s, p) => s + p.value, 0) / recentCycles.length
      : 0;
    const olderAvgCycleTime = olderCycles.length > 0
      ? olderCycles.reduce((s, p) => s + p.value, 0) / olderCycles.length
      : avgCycleTime;

    return {
      flywheel: {
        totalIterations: this.getCounter('flywheel.iterations'),
        avgCycleTimeMs: avgCycleTime,
        avgImprovementPercent: improvements.length > 0
          ? improvements.reduce((s, p) => s + p.value, 0) / improvements.length
          : 0,
        currentVelocity: recentCycles.length / 7,
        accelerating: avgCycleTime < olderAvgCycleTime,
      },
      models: {
        totalModels: this.getCounter('models.total'),
        activeModels: this.getGauge('models.active') || 0,
        avgAccuracy: this.getGauge('models.avg_accuracy') || 0,
        driftDetected: this.getCounter('models.drift_detected'),
        lastTrainedAt: this.getGauge('models.last_trained_at') || null,
      },
      knowledge: {
        totalCrystals: this.getCounter('knowledge.crystals'),
        totalPatterns: this.getCounter('knowledge.patterns'),
        coveragePercent: this.getGauge('knowledge.coverage') || 0,
        lastCrystallizedAt: this.getGauge('knowledge.last_crystallized_at') || null,
      },
      system: {
        uptimeMs: now - this.startTime,
        eventsProcessed: this.getCounter('system.events_processed'),
        eventsPerSec: this.getGauge('system.events_per_sec') || 0,
        errorRate: this.getGauge('system.error_rate') || 0,
        avgLatencyMs: this.getGauge('system.avg_latency_ms') || 0,
      },
      generatedAt: now,
    };
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.startTime = Date.now();
  }

  /**
   * 导出所有指标（用于持久化）
   */
  exportAll(): {
    metrics: Record<string, MetricPoint[]>;
    counters: Record<string, number>;
    gauges: Record<string, number>;
  } {
    return {
      metrics: Object.fromEntries(this.metrics),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}
