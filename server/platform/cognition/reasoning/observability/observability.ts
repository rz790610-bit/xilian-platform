/**
 * ============================================================================
 * Phase 2 — Observability 收集器
 * ============================================================================
 *
 * 统一可观测性基础设施，为所有 Phase 2 模块提供：
 *   1. 12 项核心指标的实时采集与滑动窗口统计
 *   2. 决策日志的结构化记录
 *   3. 阶段耗时追踪（兼容 OpenTelemetry span 语义）
 *   4. Prometheus exporter 格式的指标导出
 *
 * 设计原则：
 *   - 零外部依赖（纯内存实现，避免引入 prom-client 等重量级库）
 *   - 线程安全（单线程 Node.js 无需锁，但 API 设计为幂等）
 *   - 低开销（所有操作 O(1) 或 O(窗口大小)）
 *   - 可注入（构造函数接受配置，支持测试替换）
 */

import { createModuleLogger } from '../../../../core/logger';
import type {
  ReasoningMetrics,
  DecisionLogEntry,
  ReasoningRoute,
  OrchestratorPhase,
  ModuleExecutionSummary,
} from '../reasoning.types';

const logger = createModuleLogger('observability');

// ============================================================================
// 配置
// ============================================================================

export interface ObservabilityConfig {
  /** 滑动窗口大小（用于计算率指标） */
  windowSize: number;
  /** 决策日志最大保留条数 */
  maxDecisionLogs: number;
  /** 指标快照间隔 (ms)，用于定时刷新 */
  snapshotIntervalMs: number;
  /** 是否启用详细日志 */
  verbose: boolean;
}

const DEFAULT_CONFIG: ObservabilityConfig = {
  windowSize: 100,
  maxDecisionLogs: 500,
  snapshotIntervalMs: 60_000,
  verbose: false,
};

// ============================================================================
// 内部数据结构
// ============================================================================

/** 滑动窗口计数器 — 用于计算率指标 */
class SlidingWindowCounter {
  private readonly maxSize: number;
  private readonly values: number[] = [];

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  /** 计算均值 */
  mean(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  /** 计算 P95 */
  p95(): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  }

  /** 计算率（value=1 的比例） */
  rate(): number {
    if (this.values.length === 0) return 0;
    return this.values.filter((v) => v === 1).length / this.values.length;
  }

  /** 当前窗口大小 */
  size(): number {
    return this.values.length;
  }

  /** 清空 */
  clear(): void {
    this.values.length = 0;
  }
}

// ============================================================================
// Observability 收集器
// ============================================================================

export class Observability {
  private readonly config: ObservabilityConfig;

  // --- 滑动窗口计数器 ---
  private readonly hypothesisHits: SlidingWindowCounter;
  private readonly physicsVerifications: SlidingWindowCounter;
  private readonly causalCoverage: SlidingWindowCounter;
  private readonly experienceHits: SlidingWindowCounter;
  private readonly grokCalls: SlidingWindowCounter;
  private readonly latencies: SlidingWindowCounter;
  private readonly fallbacks: SlidingWindowCounter;
  private readonly feedbackLoops: SlidingWindowCounter;
  private readonly costGateBlocks: SlidingWindowCounter;
  private readonly uncertainties: SlidingWindowCounter;
  private readonly shortCircuits: SlidingWindowCounter;

  // --- 决策日志 ---
  private readonly decisionLogs: DecisionLogEntry[] = [];

  // --- 阶段耗时追踪 ---
  private readonly activeSpans: Map<string, { phase: string; startMs: number }> = new Map();

  // --- 累计计数器（不受窗口限制） ---
  private totalSessions = 0;
  private totalGrokCalls = 0;

  constructor(config?: Partial<ObservabilityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const ws = this.config.windowSize;

    this.hypothesisHits = new SlidingWindowCounter(ws);
    this.physicsVerifications = new SlidingWindowCounter(ws);
    this.causalCoverage = new SlidingWindowCounter(ws);
    this.experienceHits = new SlidingWindowCounter(ws);
    this.grokCalls = new SlidingWindowCounter(ws);
    this.latencies = new SlidingWindowCounter(ws);
    this.fallbacks = new SlidingWindowCounter(ws);
    this.feedbackLoops = new SlidingWindowCounter(ws);
    this.costGateBlocks = new SlidingWindowCounter(ws);
    this.uncertainties = new SlidingWindowCounter(ws);
    this.shortCircuits = new SlidingWindowCounter(ws);

    logger.info({ windowSize: ws }, '[Observability] 初始化完成');
  }

  // =========================================================================
  // 指标记录 API
  // =========================================================================

  /** 记录一次推理会话的结果 */
  recordSession(params: {
    route: ReasoningRoute;
    hypothesisHit: boolean;
    physicsVerified: boolean;
    causalCovered: boolean;
    experienceHit: boolean;
    grokUsed: boolean;
    grokCallCount: number;
    latencyMs: number;
    fellBack: boolean;
    feedbackLooped: boolean;
    costGateBlocked: boolean;
    uncertainty: number;
    shortCircuited: boolean;
  }): void {
    this.totalSessions++;
    this.hypothesisHits.push(params.hypothesisHit ? 1 : 0);
    this.physicsVerifications.push(params.physicsVerified ? 1 : 0);
    this.causalCoverage.push(params.causalCovered ? 1 : 0);
    this.experienceHits.push(params.experienceHit ? 1 : 0);
    this.grokCalls.push(params.grokUsed ? 1 : 0);
    this.latencies.push(params.latencyMs);
    this.fallbacks.push(params.fellBack ? 1 : 0);
    this.feedbackLoops.push(params.feedbackLooped ? 1 : 0);
    this.costGateBlocks.push(params.costGateBlocked ? 1 : 0);
    this.uncertainties.push(params.uncertainty);
    this.shortCircuits.push(params.shortCircuited ? 1 : 0);

    if (params.grokUsed) {
      this.totalGrokCalls += params.grokCallCount;
    }

    if (this.config.verbose) {
      logger.debug({
        route: params.route,
        latencyMs: params.latencyMs,
        totalSessions: this.totalSessions,
      }, '[Observability] 会话记录');
    }
  }

  /** 记录 CostGate 拦截事件 */
  recordCostGateBlock(): void {
    this.costGateBlocks.push(1);
  }

  /** 通用指标记录 — 用于模块级自定义指标（不影响核心 12 项） */
  recordMetric(name: string, value: number): void {
    if (this.config.verbose) {
      logger.debug({ name, value }, '[Observability] 自定义指标记录');
    }
    // 自定义指标暂存到内存（后续可扩展为持久化）
    // 当前仅用于日志追踪，不影响核心滑动窗口
  }

  // =========================================================================
  // 决策日志 API
  // =========================================================================

  /** 记录一条决策日志 */
  logDecision(entry: DecisionLogEntry): void {
    this.decisionLogs.push(entry);
    if (this.decisionLogs.length > this.config.maxDecisionLogs) {
      this.decisionLogs.shift();
    }
  }

  /** 获取最近 N 条决策日志 */
  getRecentDecisionLogs(count: number = 20): DecisionLogEntry[] {
    return this.decisionLogs.slice(-count);
  }

  // =========================================================================
  // Span 追踪 API（轻量级，兼容 OpenTelemetry 语义）
  // =========================================================================

  /** 开始一个阶段 span */
  startSpan(spanId: string, phase: string): void {
    this.activeSpans.set(spanId, { phase, startMs: Date.now() });
  }

  /** 结束一个阶段 span，返回耗时 (ms) */
  endSpan(spanId: string): number {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      logger.warn({ spanId }, '[Observability] 尝试结束不存在的 span');
      return 0;
    }
    const durationMs = Date.now() - span.startMs;
    this.activeSpans.delete(spanId);
    return durationMs;
  }

  // =========================================================================
  // 指标快照 API
  // =========================================================================

  /** 获取当前 12 项核心指标快照 */
  getMetrics(): ReasoningMetrics {
    return {
      hypothesisHitRate: this.hypothesisHits.rate(),
      physicsVerificationRate: this.physicsVerifications.rate(),
      causalCoverageRate: this.causalCoverage.rate(),
      experienceHitRate: this.experienceHits.rate(),
      grokCallRate: this.grokCalls.rate(),
      avgLatencyMs: this.latencies.mean(),
      p95LatencyMs: this.latencies.p95(),
      fallbackRate: this.fallbacks.rate(),
      feedbackLoopRate: this.feedbackLoops.rate(),
      costGateBlockRate: this.costGateBlocks.rate(),
      avgUncertainty: this.uncertainties.mean(),
      shortCircuitRate: this.shortCircuits.rate(),
    };
  }

  /** 获取累计统计 */
  getCumulativeStats(): { totalSessions: number; totalGrokCalls: number; windowSize: number } {
    return {
      totalSessions: this.totalSessions,
      totalGrokCalls: this.totalGrokCalls,
      windowSize: this.latencies.size(),
    };
  }

  // =========================================================================
  // Prometheus Exporter 格式
  // =========================================================================

  /** 导出为 Prometheus text format */
  exportPrometheus(): string {
    const m = this.getMetrics();
    const lines: string[] = [
      '# HELP reasoning_hypothesis_hit_rate 假设命中率',
      '# TYPE reasoning_hypothesis_hit_rate gauge',
      `reasoning_hypothesis_hit_rate ${m.hypothesisHitRate.toFixed(4)}`,
      '',
      '# HELP reasoning_physics_verification_rate 物理验证通过率',
      '# TYPE reasoning_physics_verification_rate gauge',
      `reasoning_physics_verification_rate ${m.physicsVerificationRate.toFixed(4)}`,
      '',
      '# HELP reasoning_causal_coverage_rate 因果路径覆盖率',
      '# TYPE reasoning_causal_coverage_rate gauge',
      `reasoning_causal_coverage_rate ${m.causalCoverageRate.toFixed(4)}`,
      '',
      '# HELP reasoning_experience_hit_rate 经验命中率',
      '# TYPE reasoning_experience_hit_rate gauge',
      `reasoning_experience_hit_rate ${m.experienceHitRate.toFixed(4)}`,
      '',
      '# HELP reasoning_grok_call_rate Grok调用率',
      '# TYPE reasoning_grok_call_rate gauge',
      `reasoning_grok_call_rate ${m.grokCallRate.toFixed(4)}`,
      '',
      '# HELP reasoning_avg_latency_ms 平均推理延迟',
      '# TYPE reasoning_avg_latency_ms gauge',
      `reasoning_avg_latency_ms ${m.avgLatencyMs.toFixed(1)}`,
      '',
      '# HELP reasoning_p95_latency_ms P95推理延迟',
      '# TYPE reasoning_p95_latency_ms gauge',
      `reasoning_p95_latency_ms ${m.p95LatencyMs.toFixed(1)}`,
      '',
      '# HELP reasoning_fallback_rate 降级触发率',
      '# TYPE reasoning_fallback_rate gauge',
      `reasoning_fallback_rate ${m.fallbackRate.toFixed(4)}`,
      '',
      '# HELP reasoning_feedback_loop_rate 知识反馈闭环率',
      '# TYPE reasoning_feedback_loop_rate gauge',
      `reasoning_feedback_loop_rate ${m.feedbackLoopRate.toFixed(4)}`,
      '',
      '# HELP reasoning_cost_gate_block_rate CostGate拦截率',
      '# TYPE reasoning_cost_gate_block_rate gauge',
      `reasoning_cost_gate_block_rate ${m.costGateBlockRate.toFixed(4)}`,
      '',
      '# HELP reasoning_avg_uncertainty 端到端不确定性均值',
      '# TYPE reasoning_avg_uncertainty gauge',
      `reasoning_avg_uncertainty ${m.avgUncertainty.toFixed(4)}`,
      '',
      '# HELP reasoning_short_circuit_rate 短路率',
      '# TYPE reasoning_short_circuit_rate gauge',
      `reasoning_short_circuit_rate ${m.shortCircuitRate.toFixed(4)}`,
      '',
      '# HELP reasoning_total_sessions 总会话数',
      '# TYPE reasoning_total_sessions counter',
      `reasoning_total_sessions ${this.totalSessions}`,
      '',
      '# HELP reasoning_total_grok_calls 总Grok调用数',
      '# TYPE reasoning_total_grok_calls counter',
      `reasoning_total_grok_calls ${this.totalGrokCalls}`,
    ];
    return lines.join('\n');
  }

  // =========================================================================
  // 重置
  // =========================================================================

  /** 重置所有指标（测试用） */
  reset(): void {
    this.hypothesisHits.clear();
    this.physicsVerifications.clear();
    this.causalCoverage.clear();
    this.experienceHits.clear();
    this.grokCalls.clear();
    this.latencies.clear();
    this.fallbacks.clear();
    this.feedbackLoops.clear();
    this.costGateBlocks.clear();
    this.uncertainties.clear();
    this.shortCircuits.clear();
    this.decisionLogs.length = 0;
    this.activeSpans.clear();
    this.totalSessions = 0;
    this.totalGrokCalls = 0;
    logger.info('[Observability] 指标已重置');
  }
}
