/**
 * ============================================================================
 * FSD Metrics (E34)
 * ============================================================================
 *
 * 集中管理 FSD 进化引擎的所有 Prometheus 指标：
 *   - 干预率（实时 + 历史）
 *   - 虚拟里程（仿真 + 影子）
 *   - 世界模型准确率
 *   - RLfI 奖励累计
 *   - 飞轮周期统计
 *   - 仿真覆盖率
 *   - 训练调度统计
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('fsd-metrics');

// ============================================================================
// 指标存储
// ============================================================================

class MetricStore {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  // Counter
  incCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  getCounter(name: string, labels: Record<string, string> = {}): number {
    return this.counters.get(this.makeKey(name, labels)) || 0;
  }

  // Gauge
  setGauge(name: string, labels: Record<string, string> = {}, value: number): void {
    this.gauges.set(this.makeKey(name, labels), value);
  }

  getGauge(name: string, labels: Record<string, string> = {}): number {
    return this.gauges.get(this.makeKey(name, labels)) || 0;
  }

  // Histogram
  observeHistogram(name: string, value: number): void {
    const arr = this.histograms.get(name) || [];
    arr.push(value);
    if (arr.length > 10000) arr.splice(0, arr.length - 10000);
    this.histograms.set(name, arr);
  }

  getHistogramStats(name: string): { count: number; avg: number; p50: number; p95: number; p99: number } {
    const arr = this.histograms.get(name) || [];
    if (arr.length === 0) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0 };

    const sorted = [...arr].sort((a, b) => a - b);
    return {
      count: arr.length,
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}="${v}"`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  // 导出所有指标
  exportAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.counters.forEach((v, k) => { result[`counter:${k}`] = v; });
    this.gauges.forEach((v, k) => { result[`gauge:${k}`] = v; });
    this.histograms.forEach((_, k) => { result[`histogram:${k}`] = this.getHistogramStats(k); });
    return result;
  }
}

// ============================================================================
// FSD Metrics 单例
// ============================================================================

const store = new MetricStore();

export const FSDMetrics = {
  // ── 干预率 ──
  interventionRate: {
    set: (rate: number) => store.setGauge('evo_intervention_rate', {}, rate),
    get: () => store.getGauge('evo_intervention_rate'),
  },

  interventionTotal: {
    inc: (labels: { modelId: string } = { modelId: 'default' }) =>
      store.incCounter('evo_interventions_total', labels),
    get: (labels: { modelId: string } = { modelId: 'default' }) =>
      store.getCounter('evo_interventions_total', labels),
  },

  // ── 虚拟里程 ──
  virtualMileage: {
    inc: (value = 1) => store.incCounter('evo_virtual_mileage_total', {}, value),
    get: () => store.getCounter('evo_virtual_mileage_total'),
  },

  // ── 世界模型准确率 ──
  worldModelAccuracy: {
    set: (accuracy: number) => store.setGauge('evo_world_model_accuracy', {}, accuracy),
    get: () => store.getGauge('evo_world_model_accuracy'),
  },

  // ── RLfI 奖励 ──
  rlfiReward: {
    inc: (value = 1) => store.incCounter('evo_rlfi_reward_total', {}, value),
    get: () => store.getCounter('evo_rlfi_reward_total'),
  },

  // ── 飞轮周期 ──
  flywheelCycles: {
    inc: (labels: { status: string } = { status: 'completed' }) =>
      store.incCounter('evo_flywheel_cycles_total', labels),
    get: (labels: { status: string } = { status: 'completed' }) =>
      store.getCounter('evo_flywheel_cycles_total', labels),
  },

  flywheelDuration: {
    observe: (durationMs: number) => store.observeHistogram('evo_flywheel_duration_ms', durationMs),
    stats: () => store.getHistogramStats('evo_flywheel_duration_ms'),
  },

  // ── 仿真 ──
  simulationScenarios: {
    inc: (value = 1) => store.incCounter('evo_simulation_scenarios_total', {}, value),
    get: () => store.getCounter('evo_simulation_scenarios_total'),
  },

  simulationCoverage: {
    set: (rate: number) => store.setGauge('evo_simulation_coverage_rate', {}, rate),
    get: () => store.getGauge('evo_simulation_coverage_rate'),
  },

  // ── 影子模式 ──
  shadowRequests: {
    inc: () => store.incCounter('evo_shadow_requests_total'),
    get: () => store.getCounter('evo_shadow_requests_total'),
  },

  shadowDivergence: {
    observe: (score: number) => store.observeHistogram('evo_shadow_divergence', score),
    stats: () => store.getHistogramStats('evo_shadow_divergence'),
  },

  shadowLatency: {
    observe: (latencyMs: number) => store.observeHistogram('evo_shadow_latency_ms', latencyMs),
    stats: () => store.getHistogramStats('evo_shadow_latency_ms'),
  },

  // ── 难例 ──
  hardCases: {
    inc: (labels: { severity: string } = { severity: 'medium' }) =>
      store.incCounter('evo_hard_cases_total', labels),
    get: (labels: { severity: string } = { severity: 'medium' }) =>
      store.getCounter('evo_hard_cases_total', labels),
  },

  // ── 标注 ──
  autoLabeled: {
    inc: (value = 1) => store.incCounter('evo_auto_labeled_total', {}, value),
    get: () => store.getCounter('evo_auto_labeled_total'),
  },

  labelingConfidence: {
    observe: (confidence: number) => store.observeHistogram('evo_labeling_confidence', confidence),
    stats: () => store.getHistogramStats('evo_labeling_confidence'),
  },

  // ── 训练调度 ──
  trainingJobs: {
    inc: (labels: { status: string } = { status: 'scheduled' }) =>
      store.incCounter('evo_training_jobs_total', labels),
    get: (labels: { status: string } = { status: 'scheduled' }) =>
      store.getCounter('evo_training_jobs_total', labels),
  },

  trainingCost: {
    inc: (value: number) => store.incCounter('evo_training_cost_usd', {}, value),
    get: () => store.getCounter('evo_training_cost_usd'),
  },

  carbonSaved: {
    inc: (value: number) => store.incCounter('evo_carbon_saved_gco2', {}, value),
    get: () => store.getCounter('evo_carbon_saved_gco2'),
  },

  // ── 金丝雀部署 ──
  canaryDeployments: {
    inc: (labels: { status: string } = { status: 'started' }) =>
      store.incCounter('evo_canary_deployments_total', labels),
    get: (labels: { status: string } = { status: 'started' }) =>
      store.getCounter('evo_canary_deployments_total', labels),
  },

  // ── OTA 部署 ──
  otaDeployments: {
    inc: (labels: { stage: string } = { stage: 'shadow' }) =>
      store.incCounter('evo_ota_deployments_total', labels),
    get: (labels: { stage: string } = { stage: 'shadow' }) =>
      store.getCounter('evo_ota_deployments_total', labels),
  },

  // ── 导出 ──
  exportAll: () => store.exportAll(),
};
