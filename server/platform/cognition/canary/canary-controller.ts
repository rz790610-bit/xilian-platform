/**
 * ============================================================================
 * 金丝雀发布控制器 — CanaryController
 * ============================================================================
 *
 * 管理模型的渐进式发布流程：
 *   1. 创建金丝雀会话
 *   2. 按阶梯比例分配流量（5% → 20% → 50% → 100%）
 *   3. 每个阶段观察指标（错误率、延迟、业务指标）
 *   4. 自动/手动决策是否推进到下一阶段
 *   5. 异常时自动回滚
 *
 * 与 Champion-Challenger 的关系：
 *   - Champion-Challenger 的 Gate 3 调用本控制器
 *   - 金丝雀验证通过后，回调 Champion-Challenger 的 completeGate3()
 *
 * 对应 v3.0 方案任务 U-18
 */

import { createModuleLogger } from '../../../core/logger';
import { getCognitionEventEmitter } from '../events/emitter';

const log = createModuleLogger('canaryController');

// ============================================================================
// 类型定义
// ============================================================================

/** 金丝雀阶段 */
export interface CanaryStage {
  /** 阶段序号（从 1 开始） */
  stageNumber: number;
  /** 流量比例 [0, 1] */
  trafficRatio: number;
  /** 观察时长（毫秒） */
  observationDurationMs: number;
  /** 错误率阈值 — 超过此值自动回滚 */
  maxErrorRate: number;
  /** 延迟退化阈值 — 超过此比例自动回滚 */
  maxLatencyDegradation: number;
}

/** 金丝雀会话状态 */
export type CanarySessionStatus =
  | 'initializing'
  | 'running'
  | 'observing'
  | 'advancing'
  | 'completed'
  | 'rolled_back'
  | 'failed';

/** 金丝雀会话 */
export interface CanarySession {
  id: string;
  /** Challenger 模型 ID */
  challengerModelId: string;
  /** Champion 模型 ID */
  championModelId: string;
  /** 关联的挑战赛 ID */
  challengeId?: string;
  /** 工况 ID */
  ocProfileId?: string;
  /** 当前状态 */
  status: CanarySessionStatus;
  /** 阶梯配置 */
  stages: CanaryStage[];
  /** 当前阶段索引 */
  currentStageIndex: number;
  /** 各阶段的观察结果 */
  stageResults: CanaryStageResult[];
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 完成时间 */
  completedAt?: Date;
}

/** 金丝雀阶段观察结果 */
export interface CanaryStageResult {
  stageNumber: number;
  trafficRatio: number;
  /** 观察开始时间 */
  startedAt: Date;
  /** 观察结束时间 */
  endedAt: Date;
  /** 总请求数 */
  totalRequests: number;
  /** Challenger 处理的请求数 */
  challengerRequests: number;
  /** Challenger 错误数 */
  challengerErrors: number;
  /** Challenger 错误率 */
  errorRate: number;
  /** Challenger 平均延迟（毫秒） */
  challengerAvgLatencyMs: number;
  /** Champion 平均延迟（毫秒） */
  championAvgLatencyMs: number;
  /** 延迟退化比例 */
  latencyDegradation: number;
  /** 是否通过 */
  passed: boolean;
  /** 未通过原因 */
  failureReason?: string;
}

/** 金丝雀配置 */
export interface CanaryConfig {
  /** 阶梯配置 */
  stages: CanaryStage[];
  /** 自动推进（每个阶段通过后自动进入下一阶段） */
  autoAdvance: boolean;
  /** 全局超时（毫秒） */
  globalTimeoutMs: number;
}

/** 默认四阶梯配置 */
const DEFAULT_STAGES: CanaryStage[] = [
  {
    stageNumber: 1,
    trafficRatio: 0.05,
    observationDurationMs: 300_000,  // 5 分钟
    maxErrorRate: 0.01,
    maxLatencyDegradation: 0.2,
  },
  {
    stageNumber: 2,
    trafficRatio: 0.20,
    observationDurationMs: 600_000,  // 10 分钟
    maxErrorRate: 0.01,
    maxLatencyDegradation: 0.15,
  },
  {
    stageNumber: 3,
    trafficRatio: 0.50,
    observationDurationMs: 900_000,  // 15 分钟
    maxErrorRate: 0.005,
    maxLatencyDegradation: 0.10,
  },
  {
    stageNumber: 4,
    trafficRatio: 1.00,
    observationDurationMs: 600_000,  // 10 分钟
    maxErrorRate: 0.005,
    maxLatencyDegradation: 0.10,
  },
];

const DEFAULT_CONFIG: CanaryConfig = {
  stages: DEFAULT_STAGES,
  autoAdvance: true,
  globalTimeoutMs: 3_600_000, // 1 小时
};

// ============================================================================
// 流量路由适配器接口
// ============================================================================

/**
 * 流量路由适配器 — 控制推理流量在 Champion 和 Challenger 之间的分配
 */
export interface TrafficRouterAdapter {
  /**
   * 设置流量分配比例
   *
   * @param challengerModelId Challenger 模型 ID
   * @param championModelId Champion 模型 ID
   * @param challengerRatio Challenger 流量比例 [0, 1]
   */
  setTrafficSplit(
    challengerModelId: string,
    championModelId: string,
    challengerRatio: number,
  ): Promise<void>;

  /**
   * 获取当前流量指标
   */
  getTrafficMetrics(
    challengerModelId: string,
    championModelId: string,
    sinceTimestamp: Date,
  ): Promise<TrafficMetrics>;

  /**
   * 回滚流量（全部切回 Champion）
   */
  rollbackTraffic(
    challengerModelId: string,
    championModelId: string,
  ): Promise<void>;
}

/** 流量指标 */
export interface TrafficMetrics {
  totalRequests: number;
  challengerRequests: number;
  challengerErrors: number;
  challengerAvgLatencyMs: number;
  championAvgLatencyMs: number;
}

// ============================================================================
// 金丝雀控制器实现
// ============================================================================

export class CanaryController {
  private readonly config: CanaryConfig;
  private readonly trafficRouter: TrafficRouterAdapter;
  private readonly emitter = getCognitionEventEmitter();

  // 活跃会话
  private readonly sessions: Map<string, CanarySession> = new Map();
  private sessionCounter = 0;

  // 定时器管理
  private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    trafficRouter: TrafficRouterAdapter,
    config?: Partial<CanaryConfig>,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      stages: config?.stages ?? DEFAULT_STAGES,
    };
    this.trafficRouter = trafficRouter;
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 启动金丝雀发布
   */
  async startCanary(
    challengerModelId: string,
    championModelId: string,
    challengeId?: string,
    ocProfileId?: string,
    config?: Partial<CanaryConfig>,
  ): Promise<CanarySession> {
    const sessionId = this.generateSessionId();
    const mergedConfig = {
      ...this.config,
      ...config,
      stages: config?.stages ?? this.config.stages,
    };

    const session: CanarySession = {
      id: sessionId,
      challengerModelId,
      championModelId,
      challengeId,
      ocProfileId,
      status: 'initializing',
      stages: mergedConfig.stages,
      currentStageIndex: 0,
      stageResults: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    log.info({
      sessionId,
      challengerModelId,
      championModelId,
      stageCount: mergedConfig.stages.length,
    }, 'Canary session started');

    // 设置全局超时
    const globalTimer = setTimeout(() => {
      this.handleGlobalTimeout(sessionId);
    }, mergedConfig.globalTimeoutMs);
    this.timers.set(`${sessionId}:global`, globalTimer);

    // 启动第一个阶段
    await this.advanceToStage(session, 0);

    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): CanarySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): CanarySession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'running' || s.status === 'observing' || s.status === 'advancing');
  }

  /**
   * 手动推进到下一阶段
   */
  async manualAdvance(sessionId: string): Promise<CanarySession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Canary session ${sessionId} not found`);
    if (session.status !== 'observing') {
      throw new Error(`Session ${sessionId} is not in observing status, current: ${session.status}`);
    }

    // 收集当前阶段指标
    await this.collectStageMetrics(session);

    const lastResult = session.stageResults[session.stageResults.length - 1];
    if (!lastResult?.passed) {
      throw new Error(`Current stage did not pass, cannot advance`);
    }

    // 推进到下一阶段
    const nextIndex = session.currentStageIndex + 1;
    if (nextIndex >= session.stages.length) {
      await this.completeCanary(session, true);
    } else {
      await this.advanceToStage(session, nextIndex);
    }

    return session;
  }

  /**
   * 手动回滚
   */
  async manualRollback(sessionId: string, reason: string): Promise<CanarySession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Canary session ${sessionId} not found`);

    await this.rollback(session, reason);
    return session;
  }

  /**
   * 销毁控制器（清理所有定时器）
   */
  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // ==========================================================================
  // 内部执行
  // ==========================================================================

  /**
   * 推进到指定阶段
   */
  private async advanceToStage(session: CanarySession, stageIndex: number): Promise<void> {
    const stage = session.stages[stageIndex];
    if (!stage) {
      await this.completeCanary(session, true);
      return;
    }

    session.currentStageIndex = stageIndex;
    session.status = 'running';
    session.updatedAt = new Date();

    log.info({
      sessionId: session.id,
      stageNumber: stage.stageNumber,
      trafficRatio: stage.trafficRatio,
      observationDurationMs: stage.observationDurationMs,
    }, 'Advancing to canary stage');

    // 设置流量分配
    try {
      await this.trafficRouter.setTrafficSplit(
        session.challengerModelId,
        session.championModelId,
        stage.trafficRatio,
      );
    } catch (err) {
      log.warn({
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Failed to set traffic split');
      await this.rollback(session, `Traffic split failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    session.status = 'observing';
    session.updatedAt = new Date();

    // 设置观察定时器
    const observationTimer = setTimeout(async () => {
      await this.onObservationComplete(session);
    }, stage.observationDurationMs);
    this.timers.set(`${session.id}:stage_${stageIndex}`, observationTimer);
  }

  /**
   * 观察期结束回调
   */
  private async onObservationComplete(session: CanarySession): Promise<void> {
    if (session.status !== 'observing') return;

    // 收集指标
    await this.collectStageMetrics(session);

    const lastResult = session.stageResults[session.stageResults.length - 1];

    if (!lastResult?.passed) {
      // 阶段未通过 → 回滚
      await this.rollback(session, lastResult?.failureReason ?? 'Stage metrics check failed');
      return;
    }

    // 阶段通过
    const nextIndex = session.currentStageIndex + 1;

    if (nextIndex >= session.stages.length) {
      // 所有阶段通过
      await this.completeCanary(session, true);
    } else if (this.config.autoAdvance) {
      // 自动推进
      session.status = 'advancing';
      session.updatedAt = new Date();
      await this.advanceToStage(session, nextIndex);
    } else {
      // 等待手动推进
      log.info({
        sessionId: session.id,
        stageNumber: session.stages[session.currentStageIndex].stageNumber,
      }, 'Stage passed, waiting for manual advance');
    }
  }

  /**
   * 收集阶段指标
   */
  private async collectStageMetrics(session: CanarySession): Promise<void> {
    const stage = session.stages[session.currentStageIndex];
    const stageStartedAt = session.stageResults.length > 0
      ? session.stageResults[session.stageResults.length - 1].endedAt
      : session.createdAt;

    let metrics: TrafficMetrics;
    try {
      metrics = await this.trafficRouter.getTrafficMetrics(
        session.challengerModelId,
        session.championModelId,
        stageStartedAt,
      );
    } catch (err) {
      log.warn({
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Failed to collect traffic metrics');

      session.stageResults.push({
        stageNumber: stage.stageNumber,
        trafficRatio: stage.trafficRatio,
        startedAt: stageStartedAt,
        endedAt: new Date(),
        totalRequests: 0,
        challengerRequests: 0,
        challengerErrors: 0,
        errorRate: 1,
        challengerAvgLatencyMs: 0,
        championAvgLatencyMs: 0,
        latencyDegradation: 1,
        passed: false,
        failureReason: `Metrics collection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // 计算指标
    const errorRate = metrics.challengerRequests > 0
      ? metrics.challengerErrors / metrics.challengerRequests
      : 0;

    const latencyDegradation = metrics.championAvgLatencyMs > 0
      ? (metrics.challengerAvgLatencyMs - metrics.championAvgLatencyMs) / metrics.championAvgLatencyMs
      : 0;

    // 判断是否通过
    let passed = true;
    let failureReason: string | undefined;

    if (errorRate > stage.maxErrorRate) {
      passed = false;
      failureReason = `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(stage.maxErrorRate * 100).toFixed(2)}%`;
    } else if (latencyDegradation > stage.maxLatencyDegradation) {
      passed = false;
      failureReason = `Latency degradation ${(latencyDegradation * 100).toFixed(1)}% exceeds threshold ${(stage.maxLatencyDegradation * 100).toFixed(1)}%`;
    } else if (metrics.challengerRequests === 0) {
      passed = false;
      failureReason = 'No challenger requests received during observation';
    }

    const stageResult: CanaryStageResult = {
      stageNumber: stage.stageNumber,
      trafficRatio: stage.trafficRatio,
      startedAt: stageStartedAt,
      endedAt: new Date(),
      totalRequests: metrics.totalRequests,
      challengerRequests: metrics.challengerRequests,
      challengerErrors: metrics.challengerErrors,
      errorRate,
      challengerAvgLatencyMs: metrics.challengerAvgLatencyMs,
      championAvgLatencyMs: metrics.championAvgLatencyMs,
      latencyDegradation,
      passed,
      failureReason,
    };

    session.stageResults.push(stageResult);

    log.info({
      sessionId: session.id,
      stageNumber: stage.stageNumber,
      errorRate,
      latencyDegradation,
      passed,
    }, 'Stage metrics collected');
  }

  /**
   * 完成金丝雀发布
   */
  private async completeCanary(session: CanarySession, success: boolean): Promise<void> {
    session.status = success ? 'completed' : 'failed';
    session.completedAt = new Date();
    session.updatedAt = new Date();

    // 清理定时器
    this.clearSessionTimers(session.id);

    if (success) {
      log.info({
        sessionId: session.id,
        stagesCompleted: session.stageResults.length,
        totalDurationMs: session.completedAt.getTime() - session.createdAt.getTime(),
      }, 'Canary completed successfully');

      this.emitter.emitCanaryCompleted({
        modelId: session.challengerModelId,
        success: true,
        completedAt: session.completedAt || new Date(),
      });
    }
  }

  /**
   * 回滚
   */
  private async rollback(session: CanarySession, reason: string): Promise<void> {
    log.warn({
      sessionId: session.id,
      reason,
      currentStage: session.stages[session.currentStageIndex]?.stageNumber,
    }, 'Canary rollback triggered');

    // 回滚流量
    try {
      await this.trafficRouter.rollbackTraffic(
        session.challengerModelId,
        session.championModelId,
      );
    } catch (err) {
      log.warn({
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Traffic rollback failed');
    }

    session.status = 'rolled_back';
    session.completedAt = new Date();
    session.updatedAt = new Date();

    // 清理定时器
    this.clearSessionTimers(session.id);

    this.emitter.emitCanaryCompleted({
      modelId: session.challengerModelId,
      success: false,
      completedAt: session.completedAt || new Date(),
    });
  }

  /**
   * 全局超时处理
   */
  private handleGlobalTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'completed' || session.status === 'rolled_back') return;

    log.warn({ sessionId }, 'Canary global timeout');
    this.rollback(session, 'Global timeout exceeded').catch(err => {
      log.warn({
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      }, 'Rollback after global timeout failed');
    });
  }

  /**
   * 清理会话相关的所有定时器
   */
  private clearSessionTimers(sessionId: string): void {
    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(sessionId)) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }

  /** 生成会话 ID */
  private generateSessionId(): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36).padStart(4, '0');
    return `cn_${timestamp}_${counter}`;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建金丝雀控制器 */
export function createCanaryController(
  trafficRouter: TrafficRouterAdapter,
  config?: Partial<CanaryConfig>,
): CanaryController {
  return new CanaryController(trafficRouter, config);
}
