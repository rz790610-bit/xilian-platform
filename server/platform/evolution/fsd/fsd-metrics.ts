/**
 * ============================================================================
 * FSD Metrics (E34) — P3 重写
 * ============================================================================
 *
 * 使用 prom-client 替代自建 MetricStore：
 *   - 所有指标可被 Prometheus 直接抓取（/metrics 端点）
 *   - Histogram 使用 prom-client 内置分位数算法（非全量排序）
 *   - 与 metricsCollector.ts 中的平台指标共享同一 Registry
 *   - 标签（labels）支持多维度查询
 *
 * 指标命名规范：
 *   - 前缀: evo_  (进化引擎命名空间)
 *   - Counter: _total 后缀
 *   - Histogram: _seconds / _ms 后缀
 *   - Gauge: 无特殊后缀
 */

import {
  Counter,
  Gauge,
  Histogram,
  register,
} from 'prom-client';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('fsd-metrics');

// ============================================================================
// 安全注册：防止热重载时重复注册
// ============================================================================

function safeCounter(config: ConstructorParameters<typeof Counter>[0]): Counter {
  const existing = register.getSingleMetric(config.name);
  if (existing) return existing as Counter;
  return new Counter(config);
}

function safeGauge(config: ConstructorParameters<typeof Gauge>[0]): Gauge {
  const existing = register.getSingleMetric(config.name);
  if (existing) return existing as Gauge;
  return new Gauge(config);
}

function safeHistogram(config: ConstructorParameters<typeof Histogram>[0]): Histogram {
  const existing = register.getSingleMetric(config.name);
  if (existing) return existing as Histogram;
  return new Histogram(config);
}

// ============================================================================
// 干预率指标
// ============================================================================

/** 实时干预率 (0-1) */
const interventionRate = safeGauge({
  name: 'evo_intervention_rate',
  help: '实时干预率 (0-1)',
  labelNames: ['model_id', 'window'] as const,
});

/** 干预总次数 */
const interventionsTotal = safeCounter({
  name: 'evo_interventions_total',
  help: '干预总次数',
  labelNames: ['model_id', 'severity'] as const,
});

/** 逆里程 (每 N 次决策发生一次干预) */
const inverseMileage = safeGauge({
  name: 'evo_inverse_mileage',
  help: '逆里程 — 每 N 次决策发生一次干预',
  labelNames: ['model_id'] as const,
});

// ============================================================================
// 虚拟里程指标
// ============================================================================

/** 虚拟里程总计 */
const virtualMileageTotal = safeCounter({
  name: 'evo_virtual_mileage_total',
  help: '虚拟里程总计（仿真 + 影子）',
  labelNames: ['source'] as const, // 'simulation' | 'shadow'
});

// ============================================================================
// 世界模型指标
// ============================================================================

/** 世界模型准确率 */
const worldModelAccuracy = safeGauge({
  name: 'evo_world_model_accuracy',
  help: '世界模型预测准确率',
  labelNames: ['model_version'] as const,
});

// ============================================================================
// RLfI 指标
// ============================================================================

/** RLfI 奖励累计 */
const rlfiRewardTotal = safeCounter({
  name: 'evo_rlfi_reward_total',
  help: 'RLfI 奖励累计',
  labelNames: ['model_id'] as const,
});

// ============================================================================
// 飞轮周期指标
// ============================================================================

/** 飞轮周期总数 */
const flywheelCyclesTotal = safeCounter({
  name: 'evo_flywheel_cycles_total',
  help: '飞轮周期总数',
  labelNames: ['status'] as const, // 'completed' | 'failed' | 'partial'
});

/** 飞轮周期耗时 (ms) */
const flywheelDurationMs = safeHistogram({
  name: 'evo_flywheel_duration_ms',
  help: '飞轮周期耗时 (ms)',
  buckets: [1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000],
});

// ============================================================================
// 仿真指标
// ============================================================================

/** 仿真场景总数 */
const simulationScenariosTotal = safeCounter({
  name: 'evo_simulation_scenarios_total',
  help: '仿真场景总数',
  labelNames: ['difficulty'] as const,
});

/** 仿真覆盖率 */
const simulationCoverageRate = safeGauge({
  name: 'evo_simulation_coverage_rate',
  help: '仿真回归测试覆盖率 (0-1)',
});

// ============================================================================
// 影子模式指标
// ============================================================================

/** 影子请求总数 */
const shadowRequestsTotal = safeCounter({
  name: 'evo_shadow_requests_total',
  help: '影子模式请求总数',
  labelNames: ['model_id'] as const,
});

/** 影子分歧度分布 */
const shadowDivergence = safeHistogram({
  name: 'evo_shadow_divergence',
  help: '影子模式决策分歧度分布',
  buckets: [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0],
});

/** 影子延迟 (ms) */
const shadowLatencyMs = safeHistogram({
  name: 'evo_shadow_latency_ms',
  help: '影子模式额外延迟 (ms)',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
});

// ============================================================================
// 难例指标
// ============================================================================

/** 难例总数 */
const hardCasesTotal = safeCounter({
  name: 'evo_hard_cases_total',
  help: '发现的难例总数',
  labelNames: ['severity'] as const, // 'critical' | 'high' | 'medium' | 'low'
});

// ============================================================================
// 标注指标
// ============================================================================

/** 自动标注总数 */
const autoLabeledTotal = safeCounter({
  name: 'evo_auto_labeled_total',
  help: '自动标注的轨迹总数',
  labelNames: ['label_type'] as const,
});

/** 标注置信度分布 */
const labelingConfidence = safeHistogram({
  name: 'evo_labeling_confidence',
  help: '自动标注置信度分布',
  buckets: [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99],
});

// ============================================================================
// 训练调度指标
// ============================================================================

/** 训练任务总数 */
const trainingJobsTotal = safeCounter({
  name: 'evo_training_jobs_total',
  help: '训练任务总数',
  labelNames: ['status', 'job_type'] as const,
});

/** 训练成本 (USD) */
const trainingCostUsd = safeCounter({
  name: 'evo_training_cost_usd',
  help: '训练成本累计 (USD)',
  labelNames: ['use_spot'] as const,
});

/** 碳排放节省 (gCO2) */
const carbonSavedGco2 = safeCounter({
  name: 'evo_carbon_saved_gco2',
  help: 'Carbon-aware 调度节省的碳排放 (gCO2)',
});

// ============================================================================
// 金丝雀部署指标
// ============================================================================

/** 金丝雀部署总数 */
const canaryDeploymentsTotal = safeCounter({
  name: 'evo_canary_deployments_total',
  help: '金丝雀部署总数',
  labelNames: ['status'] as const, // 'started' | 'advanced' | 'completed' | 'rolled_back'
});

/** 金丝雀部署当前阶段 */
const canaryCurrentStage = safeGauge({
  name: 'evo_canary_current_stage',
  help: '金丝雀部署当前阶段索引 (0-4)',
  labelNames: ['deployment_id'] as const,
});

// ============================================================================
// OTA 部署指标
// ============================================================================

/** OTA 部署总数 */
const otaDeploymentsTotal = safeCounter({
  name: 'evo_ota_deployments_total',
  help: 'OTA 车队部署总数',
  labelNames: ['stage'] as const,
});

// ============================================================================
// 进化引擎健康探针（P1: /api/metrics 端点可达性验证）
// ============================================================================

/** 进化引擎存活状态（1=运行中, 0=停止） */
const evolutionEngineUp = safeGauge({
  name: 'evo_engine_up',
  help: 'Evolution engine liveness (1=running, 0=stopped)',
});
// 启动时设为 1
evolutionEngineUp.set(1);

// ============================================================================
// 统一导出接口（保持向后兼容）
// ============================================================================

export const FSDMetrics = {
  // ── 干预率 ──
  interventionRate: {
    set: (rate: number, labels?: { model_id?: string; window?: string }) =>
      interventionRate.set(labels ?? {}, rate),
    get: async () => (await interventionRate.get()).values,
  },

  interventionTotal: {
    inc: (labels?: { model_id?: string; severity?: string }) =>
      interventionsTotal.inc(labels ?? {}),
  },

  inverseMileage: {
    set: (value: number, modelId = 'default') =>
      inverseMileage.set({ model_id: modelId }, value),
  },

  // ── 虚拟里程 ──
  virtualMileage: {
    inc: (value = 1, source: 'simulation' | 'shadow' = 'shadow') =>
      virtualMileageTotal.inc({ source }, value),
  },

  // ── 世界模型准确率 ──
  worldModelAccuracy: {
    set: (accuracy: number, modelVersion = 'current') =>
      worldModelAccuracy.set({ model_version: modelVersion }, accuracy),
  },

  // ── RLfI 奖励 ──
  rlfiReward: {
    inc: (value = 1, modelId = 'default') =>
      rlfiRewardTotal.inc({ model_id: modelId }, value),
  },

  // ── 飞轮周期 ──
  flywheelCycles: {
    inc: (status: 'completed' | 'failed' | 'partial' = 'completed') =>
      flywheelCyclesTotal.inc({ status }),
  },

  flywheelDuration: {
    observe: (durationMs: number) => flywheelDurationMs.observe(durationMs),
  },

  // ── 仿真 ──
  simulationScenarios: {
    inc: (value = 1, difficulty = 'medium') =>
      simulationScenariosTotal.inc({ difficulty }, value),
  },

  simulationCoverage: {
    set: (rate: number) => simulationCoverageRate.set(rate),
  },

  // ── 影子模式 ──
  shadowRequests: {
    inc: (modelId = 'default') => shadowRequestsTotal.inc({ model_id: modelId }),
  },

  shadowDivergence: {
    observe: (score: number) => shadowDivergence.observe(score),
  },

  shadowLatency: {
    observe: (latencyMs: number) => shadowLatencyMs.observe(latencyMs),
  },

  // ── 难例 ──
  hardCases: {
    inc: (severity: 'critical' | 'high' | 'medium' | 'low' = 'medium') =>
      hardCasesTotal.inc({ severity }),
  },

  // ── 标注 ──
  autoLabeled: {
    inc: (value = 1, labelType = 'auto') =>
      autoLabeledTotal.inc({ label_type: labelType }, value),
  },

  labelingConfidence: {
    observe: (confidence: number) => labelingConfidence.observe(confidence),
  },

  // ── 训练调度 ──
  trainingJobs: {
    inc: (status = 'scheduled', jobType = 'fine_tune') =>
      trainingJobsTotal.inc({ status, job_type: jobType }),
  },

  trainingCost: {
    inc: (value: number, useSpot = true) =>
      trainingCostUsd.inc({ use_spot: String(useSpot) }, value),
  },

  carbonSaved: {
    inc: (value: number) => carbonSavedGco2.inc(value),
  },

  // ── 金丝雀部署 ──
  canaryDeployments: {
    inc: (status = 'started') => canaryDeploymentsTotal.inc({ status }),
  },

  canaryCurrentStage: {
    set: (stageIndex: number, deploymentId: string) =>
      canaryCurrentStage.set({ deployment_id: deploymentId }, stageIndex),
  },

  // ── OTA 部署 ──
  otaDeployments: {
    inc: (stage = 'shadow') => otaDeploymentsTotal.inc({ stage }),
  },

  // ── 引擎健康 ──
  engineUp: {
    set: (value: 0 | 1) => evolutionEngineUp.set(value),
    get: async () => (await evolutionEngineUp.get()).values,
  },

  // ── 导出（兼容旧接口）──
  exportAll: async () => {
    const metrics = await register.getMetricsAsJSON();
    const evoMetrics = metrics.filter(m => m.name.startsWith('evo_'));
    return Object.fromEntries(evoMetrics.map(m => [m.name, m]));
  },

  /** 返回 Prometheus 文本格式（供 /metrics 端点使用） */
  exportPrometheus: async () => {
    return register.metrics();
  },
};

log.info('FSD Metrics 已注册到 prom-client Registry（共 21 个指标，含 evo_engine_up 健康探针）');
