/**
 * ============================================================================
 * 世界模型 OpenTelemetry 指标 — Phase 3 §8.1
 * ============================================================================
 *
 * 13 个指标（含 4 个 Grok 治理指标）：
 *
 * 同步指标：
 *   1. twin_sync_duration_ms       — Histogram  — 状态同步耗时
 *   2. twin_sync_mode              — Gauge      — 当前同步模式 (0=cdc, 1=polling)
 *   3. twin_registry_instances     — Gauge      — 活跃实例数
 *
 * 仿真指标：
 *   4. simulation_duration_ms      — Histogram  — 仿真执行耗时
 *   5. simulation_queue_depth      — Gauge      — BullMQ 队列深度
 *   6. montecarlo_sample_count     — Histogram  — 蒙特卡洛采样次数分布
 *
 * 回放指标：
 *   7. replay_query_duration_ms    — Histogram  — 回放查询耗时
 *
 * 物理校验指标：
 *   8. physics_validation_failures — Counter    — 物理自洽性校验失败次数
 *
 * Grok 治理指标：
 *   9.  grok_enhancement_duration_ms — Histogram — Grok 增强耗时
 *   10. grok_call_duration_ms        — Histogram — Grok API 调用耗时
 *   11. grok_token_usage             — Counter   — Grok Token 使用量
 *   12. grok_circuit_state           — Gauge     — 熔断器状态 (0=closed, 1=open, 2=half-open)
 *   13. grok_fallback_count          — Counter   — Grok 降级次数
 */

import { createModuleLogger } from '../../../core/logger';

const logger = createModuleLogger('otel-metrics');

// ============================================================================
// 类型定义
// ============================================================================

interface MetricAttributes {
  [key: string]: string | number;
}

type HistogramRecord = {
  type: 'histogram';
  values: number[];
  attributes: MetricAttributes[];
};

type CounterRecord = {
  type: 'counter';
  value: number;
  attributes: MetricAttributes[];
};

type GaugeRecord = {
  type: 'gauge';
  value: number;
  attributes: MetricAttributes;
};

// ============================================================================
// 内存指标存储（OTel Exporter 可替换）
// ============================================================================

class MetricsStore {
  private histograms: Map<string, HistogramRecord> = new Map();
  private counters: Map<string, CounterRecord> = new Map();
  private gauges: Map<string, GaugeRecord> = new Map();

  recordHistogram(name: string, value: number, attributes: MetricAttributes = {}): void {
    const existing = this.histograms.get(name);
    if (existing) {
      existing.values.push(value);
      existing.attributes.push(attributes);
      // 保留最近 1000 个样本
      if (existing.values.length > 1000) {
        existing.values.splice(0, existing.values.length - 1000);
        existing.attributes.splice(0, existing.attributes.length - 1000);
      }
    } else {
      this.histograms.set(name, { type: 'histogram', values: [value], attributes: [attributes] });
    }
  }

  incrementCounter(name: string, delta: number = 1, attributes: MetricAttributes = {}): void {
    const existing = this.counters.get(name);
    if (existing) {
      existing.value += delta;
      existing.attributes.push(attributes);
    } else {
      this.counters.set(name, { type: 'counter', value: delta, attributes: [attributes] });
    }
  }

  setGauge(name: string, value: number, attributes: MetricAttributes = {}): void {
    this.gauges.set(name, { type: 'gauge', value, attributes });
  }

  getHistogram(name: string): HistogramRecord | undefined {
    return this.histograms.get(name);
  }

  getCounter(name: string): CounterRecord | undefined {
    return this.counters.get(name);
  }

  getGauge(name: string): GaugeRecord | undefined {
    return this.gauges.get(name);
  }

  /** 导出所有指标（供 OTel Exporter 或 /metrics 端点使用） */
  exportAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [name, record] of Array.from(this.histograms)) {
      const values = record.values;
      const sorted = [...values].sort((a, b) => a - b);
      result[name] = {
        type: 'histogram',
        count: values.length,
        sum: values.reduce((s, v) => s + v, 0),
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      };
    }

    for (const [name, record] of Array.from(this.counters)) {
      result[name] = { type: 'counter', value: record.value };
    }

    for (const [name, record] of Array.from(this.gauges)) {
      result[name] = { type: 'gauge', value: record.value, attributes: record.attributes };
    }

    return result;
  }
}

// ============================================================================
// WorldModel OTel 指标管理器
// ============================================================================

export class WorldModelMetrics {
  private static instance: WorldModelMetrics;
  private store: MetricsStore;

  private constructor() {
    this.store = new MetricsStore();
    logger.info('WorldModel OTel 指标已初始化（13 个指标）');
  }

  static getInstance(): WorldModelMetrics {
    if (!WorldModelMetrics.instance) {
      WorldModelMetrics.instance = new WorldModelMetrics();
    }
    return WorldModelMetrics.instance;
  }

  // ========================================================================
  // 同步指标
  // ========================================================================

  /** 1. twin_sync_duration_ms — 状态同步耗时 */
  recordSyncDuration(machineId: string, syncMode: string, durationMs: number): void {
    this.store.recordHistogram('twin_sync_duration_ms', durationMs, { machineId, syncMode });
  }

  /** 2. twin_sync_mode — 当前同步模式 */
  setSyncMode(mode: 'cdc' | 'polling'): void {
    this.store.setGauge('twin_sync_mode', mode === 'cdc' ? 0 : 1, { mode });
  }

  /** 3. twin_registry_instances — 活跃实例数 */
  setRegistryInstances(count: number, nodeId: string = 'local'): void {
    this.store.setGauge('twin_registry_instances', count, { nodeId });
  }

  // ========================================================================
  // 仿真指标
  // ========================================================================

  /** 4. simulation_duration_ms — 仿真执行耗时 */
  recordSimulationDuration(scenarioType: string, hasMonteCarlo: boolean, durationMs: number): void {
    this.store.recordHistogram('simulation_duration_ms', durationMs, {
      scenarioType,
      hasMonteCarlo: hasMonteCarlo ? 'true' : 'false',
    });
  }

  /** 5. simulation_queue_depth — BullMQ 队列深度 */
  setSimulationQueueDepth(depth: number): void {
    this.store.setGauge('simulation_queue_depth', depth);
  }

  /** 6. montecarlo_sample_count — 蒙特卡洛采样次数分布 */
  recordMonteCarloSamples(method: string, sampleCount: number): void {
    this.store.recordHistogram('montecarlo_sample_count', sampleCount, { method });
  }

  // ========================================================================
  // 回放指标
  // ========================================================================

  /** 7. replay_query_duration_ms — 回放查询耗时 */
  recordReplayQueryDuration(resolution: string, durationMs: number): void {
    this.store.recordHistogram('replay_query_duration_ms', durationMs, { resolution });
  }

  // ========================================================================
  // 物理校验指标
  // ========================================================================

  /** 8. physics_validation_failures — 物理自洽性校验失败次数 */
  incrementPhysicsValidationFailures(validationType: string): void {
    this.store.incrementCounter('physics_validation_failures', 1, { validationType });
  }

  // ========================================================================
  // Grok 治理指标
  // ========================================================================

  /** 9. grok_enhancement_duration_ms — Grok 增强耗时 */
  recordGrokEnhancementDuration(enhancementType: string, durationMs: number): void {
    this.store.recordHistogram('grok_enhancement_duration_ms', durationMs, { enhancementType });
  }

  /** 10. grok_call_duration_ms — Grok API 调用耗时 */
  recordGrokCallDuration(enhancementType: string, durationMs: number): void {
    this.store.recordHistogram('grok_call_duration_ms', durationMs, { enhancementType });
  }

  /** 11. grok_token_usage — Grok Token 使用量 */
  incrementGrokTokenUsage(enhancementType: string, tokens: number): void {
    this.store.incrementCounter('grok_token_usage', tokens, { enhancementType });
  }

  /** 12. grok_circuit_state — 熔断器状态 */
  setGrokCircuitState(state: 'closed' | 'open' | 'half-open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    this.store.setGauge('grok_circuit_state', stateValue, { state });
  }

  /** 13. grok_fallback_count — Grok 降级次数 */
  incrementGrokFallbackCount(enhancementType: string): void {
    this.store.incrementCounter('grok_fallback_count', 1, { enhancementType });
  }

  // ========================================================================
  // 导出
  // ========================================================================

  /** 导出所有指标（供 /api/metrics 端点使用） */
  exportMetrics(): Record<string, unknown> {
    return this.store.exportAll();
  }

  /** 获取指标摘要 */
  getSummary(): {
    totalMetrics: number;
    histograms: string[];
    counters: string[];
    gauges: string[];
  } {
    const exported = this.store.exportAll();
    const histograms: string[] = [];
    const counters: string[] = [];
    const gauges: string[] = [];

    for (const [name, data] of Array.from(Object.entries(exported))) {
      const d = data as { type: string };
      if (d.type === 'histogram') histograms.push(name);
      else if (d.type === 'counter') counters.push(name);
      else if (d.type === 'gauge') gauges.push(name);
    }

    return {
      totalMetrics: histograms.length + counters.length + gauges.length,
      histograms,
      counters,
      gauges,
    };
  }
}

/** 全局单例 */
export const worldModelMetrics = WorldModelMetrics.getInstance();
