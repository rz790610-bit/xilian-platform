/**
 * ============================================================================
 * GrokEnhancer — AI 增强治理门面
 * ============================================================================
 *
 * Phase 3 v1.3 — 为世界模型的 4 个 AI 增强点提供统一治理
 *
 * 治理组件：
 *   1. CircuitBreaker — 熔断器（5次失败 → 30s 熔断 → 半开探测）
 *   2. TokenBucket — 令牌桶限流（10 次/分钟，可配置）
 *   3. FallbackChain — 降级链（Grok → 本地模板 → 静默）
 *   4. CostMeter — 成本计量（token 消耗 + 调用次数 + 延迟统计）
 *   5. GlobalSwitch — 全局开关（ENABLE_GROK_ENHANCE 环境变量）
 *
 * 4 个增强点：
 *   1. enhanceSimulationScenario — 仿真场景智能生成
 *   2. enhancePredictionExplanation — 预测结果解释润色
 *   3. enhanceMaintenanceAdvice — 维护建议生成
 *   4. enhanceAnomalySummary — 异常事件摘要
 *
 * 架构位置：L7 世界模型层 → AI 增强子层
 * 依赖：grok 模块（现有 Grok 工具调用链）
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 增强请求 */
export interface EnhanceRequest {
  type: 'simulation_scenario' | 'prediction_explanation' | 'maintenance_advice' | 'anomaly_summary';
  machineId: string;
  context: Record<string, unknown>;
  /** Prompt 版本（用于 A/B 测试） */
  promptVersion?: string;
}

/** 增强结果 */
export interface EnhanceResult {
  content: string;
  source: 'grok' | 'local_template' | 'silent';
  tokensUsed: number;
  latencyMs: number;
  promptVersion: string;
  cached: boolean;
}

/** 熔断器状态 */
export enum CircuitState {
  CLOSED = 'closed',       // 正常
  OPEN = 'open',           // 熔断
  HALF_OPEN = 'half_open', // 半开探测
}

/** 成本统计 */
export interface CostStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  circuitBreaks: number;
  rateLimitHits: number;
  fallbackHits: number;
  costByType: Record<string, {
    calls: number;
    tokens: number;
    avgLatencyMs: number;
  }>;
}

/** GrokEnhancer 配置 */
export interface GrokEnhancerConfig {
  /** 全局开关 */
  enabled: boolean;
  /** 熔断器：连续失败次数阈值 */
  circuitBreakerThreshold: number;
  /** 熔断器：熔断持续时间 (ms) */
  circuitBreakerDurationMs: number;
  /** 令牌桶：每分钟最大请求数 */
  rateLimitPerMinute: number;
  /** 令牌桶：桶容量 */
  rateLimitBurst: number;
  /** 请求超时 (ms) */
  timeoutMs: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: GrokEnhancerConfig = {
  enabled: process.env['ENABLE_GROK_ENHANCE'] !== 'false', // 默认开启，设为 false 关闭
  circuitBreakerThreshold: 5,
  circuitBreakerDurationMs: 30_000,
  rateLimitPerMinute: 10,
  rateLimitBurst: 15,
  timeoutMs: 10_000,
};

// ============================================================================
// 1. CircuitBreaker — 熔断器
// ============================================================================

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureAt: number = 0;
  private threshold: number;
  private durationMs: number;
  private breakCount: number = 0;

  constructor(threshold: number, durationMs: number) {
    this.threshold = threshold;
    this.durationMs = durationMs;
  }

  /**
   * 检查是否允许通过
   */
  canPass(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // 检查是否到了半开时间
        if (Date.now() - this.lastFailureAt >= this.durationMs) {
          this.state = CircuitState.HALF_OPEN;
          return true; // 允许一次探测
        }
        return false;

      case CircuitState.HALF_OPEN:
        return true; // 半开状态允许通过（探测）
    }
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  /**
   * 记录失败
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // 半开探测失败 → 重新熔断
      this.state = CircuitState.OPEN;
      this.breakCount++;
    } else if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      this.breakCount++;
    }
  }

  getState(): CircuitState { return this.state; }
  getBreakCount(): number { return this.breakCount; }
}

// ============================================================================
// 2. TokenBucket — 令牌桶限流
// ============================================================================

class TokenBucket {
  private tokens: number;
  private capacity: number;
  private refillRate: number; // tokens per ms
  private lastRefillAt: number;
  private hitCount: number = 0;

  constructor(perMinute: number, burst: number) {
    this.capacity = burst;
    this.tokens = burst;
    this.refillRate = perMinute / 60_000; // 转换为每毫秒
    this.lastRefillAt = Date.now();
  }

  /**
   * 尝试获取一个令牌
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    this.hitCount++;
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefillAt = now;
  }

  getHitCount(): number { return this.hitCount; }
}

// ============================================================================
// 3. Prompt 模板（本地降级用）
// ============================================================================

const LOCAL_TEMPLATES: Record<EnhanceRequest['type'], (ctx: Record<string, unknown>) => string> = {
  simulation_scenario: (ctx) => {
    const name = ctx['scenarioName'] ?? '自定义场景';
    const params = ctx['parameters'] ?? {};
    return `仿真场景「${name}」已创建。参数设置：${JSON.stringify(params)}。` +
      `建议关注关键指标的变化趋势，特别是疲劳累积和倾覆风险。`;
  },

  prediction_explanation: (ctx) => {
    const horizon = ctx['horizonSteps'] ?? 30;
    const confidence = ctx['finalConfidence'] ?? 0.8;
    const method = ctx['method'] ?? 'hybrid';
    return `基于${method === 'hybrid' ? '物理-统计混合' : method}模型，` +
      `对未来 ${horizon} 步进行了预测，最终置信度 ${(Number(confidence) * 100).toFixed(1)}%。` +
      `预测结果综合考虑了风载力矩、疲劳累积和腐蚀退化等物理约束。`;
  },

  maintenance_advice: (ctx) => {
    const rulDays = ctx['rulDays'] ?? 365;
    const criticalIndicators = (ctx['criticalIndicators'] as Array<{ name: string; estimatedDaysToThreshold: number }>) ?? [];
    const urgent = criticalIndicators.filter((i) => i.estimatedDaysToThreshold < 30);

    if (urgent.length > 0) {
      return `紧急维护建议：${urgent.map((i) => `${i.name} 预计 ${i.estimatedDaysToThreshold} 天内达到阈值`).join('；')}。` +
        `建议立即安排检修。整体剩余寿命预估 ${rulDays} 天。`;
    }
    return `设备运行状态良好，剩余使用寿命预估 ${rulDays} 天。建议按常规维护计划执行。`;
  },

  anomaly_summary: (ctx) => {
    const anomalyType = ctx['anomalyType'] ?? '未知';
    const severity = ctx['severity'] ?? 'medium';
    const dimensions = (ctx['triggerDimensions'] as string[]) ?? [];
    return `检测到${severity === 'critical' ? '严重' : severity === 'high' ? '高风险' : ''}异常：${anomalyType}。` +
      `触发维度：${dimensions.join('、') || '无'}。建议立即关注相关指标变化。`;
  },
};

// ============================================================================
// 4. GrokEnhancer 主类
// ============================================================================

export class GrokEnhancer {
  private config: GrokEnhancerConfig;
  private circuitBreaker: CircuitBreaker;
  private tokenBucket: TokenBucket;
  private stats: CostStats;

  // 外部注入的 Grok 调用函数
  private grokCallFn: ((prompt: string, timeoutMs: number) => Promise<{ content: string; tokensUsed: number }>) | null = null;

  constructor(config: Partial<GrokEnhancerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreakerThreshold,
      this.config.circuitBreakerDurationMs,
    );
    this.tokenBucket = new TokenBucket(
      this.config.rateLimitPerMinute,
      this.config.rateLimitBurst,
    );
    this.stats = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      circuitBreaks: 0,
      rateLimitHits: 0,
      fallbackHits: 0,
      costByType: {},
    };
  }

  /**
   * 注入 Grok 调用函数
   */
  setGrokCallFn(fn: (prompt: string, timeoutMs: number) => Promise<{ content: string; tokensUsed: number }>): void {
    this.grokCallFn = fn;
  }

  /**
   * 更新配置（运行时动态调整）
   */
  updateConfig(config: Partial<GrokEnhancerConfig>): void {
    Object.assign(this.config, config);
    // 如果全局开关变更，记录日志
    if ('enabled' in config) {
      log.info({ enabled: config.enabled }, 'GrokEnhancer global switch toggled');
    }
  }

  // --------------------------------------------------------------------------
  // 4 个增强点
  // --------------------------------------------------------------------------

  /**
   * 增强点 1: 仿真场景智能生成
   */
  async enhanceSimulationScenario(
    machineId: string,
    context: Record<string, unknown>,
  ): Promise<EnhanceResult> {
    return this.enhance({
      type: 'simulation_scenario',
      machineId,
      context,
    });
  }

  /**
   * 增强点 2: 预测结果解释润色
   */
  async enhancePredictionExplanation(
    machineId: string,
    context: Record<string, unknown>,
  ): Promise<EnhanceResult> {
    return this.enhance({
      type: 'prediction_explanation',
      machineId,
      context,
    });
  }

  /**
   * 增强点 3: 维护建议生成
   */
  async enhanceMaintenanceAdvice(
    machineId: string,
    context: Record<string, unknown>,
  ): Promise<EnhanceResult> {
    return this.enhance({
      type: 'maintenance_advice',
      machineId,
      context,
    });
  }

  /**
   * 增强点 4: 异常事件摘要
   */
  async enhanceAnomalySummary(
    machineId: string,
    context: Record<string, unknown>,
  ): Promise<EnhanceResult> {
    return this.enhance({
      type: 'anomaly_summary',
      machineId,
      context,
    });
  }

  // --------------------------------------------------------------------------
  // 核心增强流程
  // --------------------------------------------------------------------------

  /**
   * 统一增强入口 — 降级链：Grok → 本地模板 → 静默
   */
  private async enhance(request: EnhanceRequest): Promise<EnhanceResult> {
    const startTime = Date.now();
    const promptVersion = request.promptVersion ?? 'v1';
    this.stats.totalCalls++;

    // --- Gate 1: 全局开关 ---
    if (!this.config.enabled) {
      return this.fallbackToTemplate(request, startTime, promptVersion, 'global_switch_off');
    }

    // --- Gate 2: 熔断器 ---
    if (!this.circuitBreaker.canPass()) {
      this.stats.circuitBreaks++;
      return this.fallbackToTemplate(request, startTime, promptVersion, 'circuit_open');
    }

    // --- Gate 3: 令牌桶限流 ---
    if (!this.tokenBucket.tryAcquire()) {
      this.stats.rateLimitHits++;
      return this.fallbackToTemplate(request, startTime, promptVersion, 'rate_limited');
    }

    // --- Gate 4: Grok 调用函数是否注入 ---
    if (!this.grokCallFn) {
      return this.fallbackToTemplate(request, startTime, promptVersion, 'no_grok_fn');
    }

    // --- 执行 Grok 调用 ---
    try {
      const prompt = this.buildPrompt(request);
      const result = await this.grokCallFn(prompt, this.config.timeoutMs);

      this.circuitBreaker.recordSuccess();
      this.stats.successCalls++;
      this.stats.totalTokens += result.tokensUsed;

      const latencyMs = Date.now() - startTime;
      this.stats.totalLatencyMs += latencyMs;
      this.stats.avgLatencyMs = this.stats.totalLatencyMs / this.stats.successCalls;

      this.updateCostByType(request.type, result.tokensUsed, latencyMs);

      return {
        content: result.content,
        source: 'grok',
        tokensUsed: result.tokensUsed,
        latencyMs,
        promptVersion,
        cached: false,
      };
    } catch (err) {
      this.circuitBreaker.recordFailure();
      this.stats.failedCalls++;
      log.warn({ err, requestType: request.type }, "Grok call failed (degraded)");

      return this.fallbackToTemplate(request, startTime, promptVersion, 'grok_error');
    }
  }

  /**
   * 降级到本地模板
   */
  private fallbackToTemplate(
    request: EnhanceRequest,
    startTime: number,
    promptVersion: string,
    reason: string,
  ): EnhanceResult {
    this.stats.fallbackHits++;

    const template = LOCAL_TEMPLATES[request.type];
    if (template) {
      const content = template(request.context);
      return {
        content,
        source: 'local_template',
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
        promptVersion,
        cached: false,
      };
    }

    // 静默降级
    return {
      content: '',
      source: 'silent',
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      promptVersion,
      cached: false,
    };
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(request: EnhanceRequest): string {
    const contextStr = JSON.stringify(request.context, null, 2);

    switch (request.type) {
      case 'simulation_scenario':
        return `你是一个工业设备数字孪生专家。请根据以下设备上下文，生成一个有价值的仿真场景描述和参数建议。\n\n设备ID: ${request.machineId}\n上下文:\n${contextStr}\n\n请用中文回答，简洁专业，不超过200字。`;

      case 'prediction_explanation':
        return `你是一个工业设备预测性维护专家。请用通俗易懂的语言解释以下预测结果的物理含义和潜在风险。\n\n设备ID: ${request.machineId}\n预测上下文:\n${contextStr}\n\n请用中文回答，简洁专业，不超过200字。`;

      case 'maintenance_advice':
        return `你是一个工业设备维护顾问。请根据以下设备状态和剩余寿命预测，给出具体的维护建议和优先级排序。\n\n设备ID: ${request.machineId}\n设备状态:\n${contextStr}\n\n请用中文回答，给出可操作的建议，不超过300字。`;

      case 'anomaly_summary':
        return `你是一个工业设备异常诊断专家。请对以下异常事件进行摘要分析，指出可能的根因和建议措施。\n\n设备ID: ${request.machineId}\n异常上下文:\n${contextStr}\n\n请用中文回答，简洁专业，不超过200字。`;

      default:
        return `请分析以下数据：\n${contextStr}`;
    }
  }

  /**
   * 更新分类成本统计
   */
  private updateCostByType(type: string, tokens: number, latencyMs: number): void {
    if (!this.stats.costByType[type]) {
      this.stats.costByType[type] = { calls: 0, tokens: 0, avgLatencyMs: 0 };
    }
    const entry = this.stats.costByType[type];
    entry.calls++;
    entry.tokens += tokens;
    entry.avgLatencyMs = (entry.avgLatencyMs * (entry.calls - 1) + latencyMs) / entry.calls;
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  /**
   * 获取成本统计
   */
  getCostStats(): CostStats {
    return { ...this.stats };
  }

  /**
   * 获取熔断器状态
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * 获取全局开关状态
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 获取完整状态（用于监控面板）
   */
  getStatus(): {
    enabled: boolean;
    circuitState: CircuitState;
    circuitBreaks: number;
    rateLimitHits: number;
    stats: CostStats;
  } {
    return {
      enabled: this.config.enabled,
      circuitState: this.circuitBreaker.getState(),
      circuitBreaks: this.circuitBreaker.getBreakCount(),
      rateLimitHits: this.tokenBucket.getHitCount(),
      stats: this.getCostStats(),
    };
  }

  /**
   * 重置统计（用于测试或定期清零）
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      circuitBreaks: 0,
      rateLimitHits: 0,
      fallbackHits: 0,
      costByType: {},
    };
  }
}

// ============================================================================
// 单例导出
// ============================================================================

/** 全局 GrokEnhancer 单例 */
export const grokEnhancer = new GrokEnhancer();
