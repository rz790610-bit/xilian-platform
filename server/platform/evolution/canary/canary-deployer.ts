/**
 * ============================================================================
 * 金丝雀部署器 v3.0 — CanaryDeployer
 * ============================================================================
 *
 * 自进化飞轮：安全渐进式部署新模型/规则
 *
 * v3.0 整改（基于 v2.0）：
 *   P0-1. routeRequest 从 DB 缓存读取当前阶段流量百分比（替代硬编码 0.05）
 *   P0-2. createDeployment 新增 Redis 分布式锁（防止多实例并发创建）
 *   P0-3. createDeployment 新增幂等 key（experimentId + modelId 联合去重）
 *   P1-1. 阶段推进自动定时器（每阶段到期后自动检查并推进）
 *   P2-1. 重启后从 DB 恢复运行时状态（runtimeMetrics + healthCheck 定时器）
 *
 * 部署策略：
 *   ┌──────────┬────────┬──────────┬──────────┐
 *   │ 阶段     │ 流量   │ 持续时间 │ 回滚条件 │
 *   ├──────────┼────────┼──────────┼──────────┤
 *   │ shadow   │ 0%     │ 24h      │ 任何退化 │
 *   │ canary   │ 5%     │ 48h      │ >5%退化  │
 *   │ gray     │ 20%    │ 72h      │ >3%退化  │
 *   │ half     │ 50%    │ 48h      │ >2%退化  │
 *   │ full     │ 100%   │ -        │ >1%退化  │
 *   └──────────┴────────┴──────────┴──────────┘
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import {
  canaryDeployments,
  canaryDeploymentStages,
  canaryHealthChecks,
  canaryTrafficSplits,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';
import { RedisClient } from '../../../lib/clients/redis.client';

const log = createModuleLogger('canary-deployer');

// ============================================================================
// 类型定义
// ============================================================================

export interface CanaryDeployment {
  id: number;
  experimentId: number;
  modelId: string;
  championModelId: string;
  trafficPercent: number;
  status: 'active' | 'completed' | 'rolled_back' | 'failed';
  rollbackReason: string | null;
  metricsSnapshot: Record<string, number> | null;
  startedAt: Date;
  endedAt: Date | null;
}

export interface DeploymentStageConfig {
  name: string;
  trafficPercent: number;
  durationHours: number;
  rollbackThresholdPercent: number;
}

export interface DeploymentMetrics {
  requestCount: number;
  successCount: number;
  errorCount: number;
  accuracy: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastUpdatedAt: number;
}

export interface HealthCheckResult {
  passed: boolean;
  failureReason: string | null;
  championMetrics: Record<string, number>;
  challengerMetrics: Record<string, number>;
}

export interface CanaryDeployerConfig {
  /** 连续健康检查失败次数阈值，超过则自动回滚 */
  maxConsecutiveFailures: number;
  /** 健康检查间隔（ms） */
  healthCheckIntervalMs: number;
  /** 最小样本量（低于此值不做判断） */
  minSampleSize: number;
  /** 自定义阶段配置（覆盖默认 5 阶段） */
  stages?: DeploymentStageConfig[];
  /** 阶段推进检查间隔（ms），默认 5 分钟 */
  stageAdvanceCheckIntervalMs: number;
}

// ============================================================================
// 默认 5 阶段配置
// ============================================================================

const DEFAULT_STAGES: DeploymentStageConfig[] = [
  { name: 'shadow',  trafficPercent: 0,   durationHours: 24, rollbackThresholdPercent: 0 },
  { name: 'canary',  trafficPercent: 5,   durationHours: 48, rollbackThresholdPercent: 5 },
  { name: 'gray',    trafficPercent: 20,  durationHours: 72, rollbackThresholdPercent: 3 },
  { name: 'half',    trafficPercent: 50,  durationHours: 48, rollbackThresholdPercent: 2 },
  { name: 'full',    trafficPercent: 100, durationHours: 0,  rollbackThresholdPercent: 1 },
];

const DEFAULT_CONFIG: CanaryDeployerConfig = {
  maxConsecutiveFailures: 3,
  healthCheckIntervalMs: 60_000,
  minSampleSize: 10,
  stageAdvanceCheckIntervalMs: 300_000, // 5 分钟
};

// ============================================================================
// Prometheus 指标（内存计数器，与平台 PrometheusClient 兼容）
// ============================================================================

class CanaryMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();

  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = `${name}${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  set(name: string, labels: Record<string, string> = {}, value: number): void {
    const key = `${name}${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    this.counters.forEach((v, k) => { result[`counter_${k}`] = v; });
    this.gauges.forEach((v, k) => { result[`gauge_${k}`] = v; });
    return result;
  }
}

// ============================================================================
// 金丝雀部署器 v3.0
// ============================================================================

export class CanaryDeployer {
  private config: CanaryDeployerConfig;
  private stages: DeploymentStageConfig[];
  private metrics = new CanaryMetrics();
  private eventBus: EventBus;
  private redis: RedisClient;

  // 内存中的运行时指标（按 deploymentId 聚合）
  private runtimeMetrics = new Map<number, {
    champion: DeploymentMetrics;
    challenger: DeploymentMetrics;
  }>();

  // 健康检查定时器
  private checkIntervals = new Map<number, NodeJS.Timeout>();

  // 阶段推进定时器
  private advanceTimers = new Map<number, NodeJS.Timeout>();

  // 连续失败计数器
  private consecutiveFailures = new Map<number, number>();

  // 流量百分比缓存（deploymentId → trafficPercent），避免每次路由都查 DB
  private trafficCache = new Map<number, { percent: number; updatedAt: number }>();
  private readonly TRAFFIC_CACHE_TTL_MS = 10_000; // 10 秒缓存

  // 初始化标记
  private initialized = false;

  constructor(
    config: Partial<CanaryDeployerConfig> = {},
    eventBus?: EventBus,
    redis?: RedisClient,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stages = config.stages || DEFAULT_STAGES;
    this.eventBus = eventBus || new EventBus();
    this.redis = redis || new RedisClient();
  }

  // ==========================================================================
  // 0. 启动恢复（P2 修复：重启后从 DB 恢复运行时状态）
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const db = await getDb();
      if (!db) return;

      // 查询所有活跃部署
      const activeDeployments = await db.select().from(canaryDeployments)
        .where(eq(canaryDeployments.status, 'active'));

      for (const deployment of activeDeployments) {
        // 恢复运行时指标（从最近的健康检查记录重建）
        const recentChecks = await db.select().from(canaryHealthChecks)
          .where(eq(canaryHealthChecks.deploymentId, deployment.id))
          .orderBy(desc(canaryHealthChecks.checkedAt))
          .limit(1);

        if (recentChecks.length > 0) {
          const lastCheck = recentChecks[0];
          this.runtimeMetrics.set(deployment.id, {
            champion: this.metricsFromSnapshot(lastCheck.championMetrics as Record<string, number>),
            challenger: this.metricsFromSnapshot(lastCheck.challengerMetrics as Record<string, number>),
          });
          this.consecutiveFailures.set(deployment.id, lastCheck.consecutiveFails || 0);
        } else {
          this.runtimeMetrics.set(deployment.id, {
            champion: this.emptyMetrics(),
            challenger: this.emptyMetrics(),
          });
          this.consecutiveFailures.set(deployment.id, 0);
        }

        // 恢复流量缓存
        this.trafficCache.set(deployment.id, {
          percent: deployment.trafficPercent,
          updatedAt: Date.now(),
        });

        // 重启健康检查
        this.startHealthCheck(deployment.id);

        // 重启阶段推进检查
        this.startStageAdvanceTimer(deployment.id);

        log.info(`恢复活跃部署: deploymentId=${deployment.id}, traffic=${deployment.trafficPercent}%`);
      }

      this.initialized = true;
      log.info(`金丝雀部署器初始化完成，恢复 ${activeDeployments.length} 个活跃部署`);
    } catch (err) {
      log.error('金丝雀部署器初始化失败', err);
    }
  }

  private metricsFromSnapshot(snapshot: Record<string, number> | null): DeploymentMetrics {
    if (!snapshot) return this.emptyMetrics();
    return {
      requestCount: snapshot.requestCount || 0,
      successCount: Math.round((snapshot.accuracy || 0) * (snapshot.requestCount || 0)),
      errorCount: Math.round((snapshot.errorRate || 0) * (snapshot.requestCount || 0)),
      accuracy: snapshot.accuracy || 0,
      avgLatencyMs: snapshot.avgLatencyMs || 0,
      p95LatencyMs: snapshot.p95LatencyMs || 0,
      p99LatencyMs: snapshot.p99LatencyMs || 0,
      lastUpdatedAt: Date.now(),
    };
  }

  // ==========================================================================
  // 1. 创建金丝雀部署（P0 修复：分布式锁 + 幂等）
  // ==========================================================================

  async createDeployment(params: {
    experimentId: number;
    challengerModelId: string;
    championModelId: string;
    stages?: DeploymentStageConfig[];
  }): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('数据库不可用');

    // P0 修复：幂等 key（experimentId + challengerModelId）
    const idempotencyKey = `canary:create:${params.experimentId}:${params.challengerModelId}`;
    const isNew = await this.trySetIdempotencyKey(idempotencyKey, 3600);
    if (!isNew) {
      // 查找已存在的部署
      const existing = await db.select().from(canaryDeployments)
        .where(and(
          eq(canaryDeployments.experimentId, params.experimentId),
          eq(canaryDeployments.modelId, params.challengerModelId),
          eq(canaryDeployments.status, 'active'),
        ))
        .limit(1);

      if (existing.length > 0) {
        log.info(`幂等跳过: 部署已存在 deploymentId=${existing[0].id}`);
        return existing[0].id;
      }
    }

    // P0 修复：分布式锁（防止多实例并发创建同一实验的部署）
    const lockKey = `canary:lock:experiment:${params.experimentId}`;
    const lockAcquired = await this.redis.acquireLock(lockKey, 30);
    if (!lockAcquired) {
      throw new Error(`无法获取分布式锁: ${lockKey}，可能有其他实例正在创建部署`);
    }

    try {
      const stageConfigs = params.stages || this.stages;

      // 1. 写入 canary_deployments 主表
      const result = await db.insert(canaryDeployments).values({
        experimentId: params.experimentId,
        modelId: params.challengerModelId,
        trafficPercent: 0,
        status: 'active',
        metricsSnapshot: {},
        startedAt: new Date(),
      });

      const deploymentId = Number(result[0].insertId);

      // 2. 写入 canary_deployment_stages（5 阶段）
      for (let i = 0; i < stageConfigs.length; i++) {
        const stage = stageConfigs[i];
        await db.insert(canaryDeploymentStages).values({
          deploymentId,
          stageIndex: i,
          stageName: stage.name,
          trafficPercent: stage.trafficPercent,
          rollbackThresholdPct: stage.rollbackThresholdPercent,
          durationHours: stage.durationHours,
          status: i === 0 ? 'active' : 'pending',
          startedAt: i === 0 ? new Date() : null,
        });
      }

      // 3. 初始化运行时指标
      this.runtimeMetrics.set(deploymentId, {
        champion: this.emptyMetrics(),
        challenger: this.emptyMetrics(),
      });
      this.consecutiveFailures.set(deploymentId, 0);

      // 4. 初始化流量缓存
      this.trafficCache.set(deploymentId, { percent: 0, updatedAt: Date.now() });

      // 5. Prometheus 埋点
      this.metrics.inc('canary_deployments_created_total');
      this.metrics.set('canary_active_deployments', {}, await this.countActiveDeployments());

      // 6. EventBus 通知
      await this.eventBus.publish({
        type: 'canary.deployment.created',
        source: 'canary-deployer',
        data: { deploymentId, challengerModelId: params.challengerModelId, stages: stageConfigs.length },
      });

      log.info(`金丝雀部署创建成功: deploymentId=${deploymentId}, model=${params.challengerModelId}, stages=${stageConfigs.length}`);

      // 7. 启动健康检查
      this.startHealthCheck(deploymentId);

      // 8. 启动阶段推进定时器（P1 修复）
      this.startStageAdvanceTimer(deploymentId);

      return deploymentId;
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  // ==========================================================================
  // 2. 记录请求指标
  // ==========================================================================

  recordMetric(
    deploymentId: number,
    version: 'champion' | 'challenger',
    success: boolean,
    latencyMs: number,
  ): void {
    const runtime = this.runtimeMetrics.get(deploymentId);
    if (!runtime) return;

    const m = runtime[version];
    m.requestCount++;
    if (success) {
      m.successCount++;
    } else {
      m.errorCount++;
    }
    m.accuracy = m.requestCount > 0 ? m.successCount / m.requestCount : 0;

    // 增量式平均延迟（Welford 算法）
    m.avgLatencyMs = m.requestCount > 0
      ? m.avgLatencyMs + (latencyMs - m.avgLatencyMs) / m.requestCount
      : latencyMs;

    // P95/P99 近似（指数加权移动最大值）
    m.p95LatencyMs = Math.max(m.p95LatencyMs * 0.95, latencyMs);
    m.p99LatencyMs = Math.max(m.p99LatencyMs * 0.99, latencyMs);
    m.lastUpdatedAt = Date.now();

    // Prometheus
    this.metrics.inc('canary_requests_total', { version, success: String(success) });
    this.metrics.set('canary_latency_avg_ms', { version }, m.avgLatencyMs);
  }

  // ==========================================================================
  // 3. 流量路由（P0 修复：从 DB 缓存读取当前阶段流量百分比）
  // ==========================================================================

  async routeRequest(deploymentId: number, requestKey: string): Promise<'champion' | 'challenger'> {
    // 从缓存获取当前流量百分比
    const trafficPercent = await this.getCurrentTrafficPercent(deploymentId);

    if (trafficPercent <= 0) return 'champion';
    if (trafficPercent >= 100) return 'challenger';

    // 一致性哈希决定路由
    const hash = this.consistentHash(requestKey);
    return hash < (trafficPercent / 100) ? 'challenger' : 'champion';
  }

  /**
   * P0 修复：从 DB 缓存读取当前流量百分比
   * 使用 10 秒 TTL 缓存避免每次路由都查 DB
   */
  private async getCurrentTrafficPercent(deploymentId: number): Promise<number> {
    const cached = this.trafficCache.get(deploymentId);
    if (cached && (Date.now() - cached.updatedAt) < this.TRAFFIC_CACHE_TTL_MS) {
      return cached.percent;
    }

    // 缓存过期，从 DB 刷新
    try {
      const db = await getDb();
      if (!db) return cached?.percent ?? 0;

      const deployments = await db.select({ trafficPercent: canaryDeployments.trafficPercent })
        .from(canaryDeployments)
        .where(eq(canaryDeployments.id, deploymentId))
        .limit(1);

      const percent = deployments[0]?.trafficPercent ?? 0;
      this.trafficCache.set(deploymentId, { percent, updatedAt: Date.now() });
      return percent;
    } catch {
      return cached?.percent ?? 0;
    }
  }

  // ==========================================================================
  // 4. 推进部署阶段
  // ==========================================================================

  async advanceStage(deploymentId: number): Promise<{
    advanced: boolean;
    currentStage: string;
    trafficPercent: number;
    completed: boolean;
  }> {
    const db = await getDb();
    if (!db) throw new Error('数据库不可用');

    // 分布式锁（防止多实例同时推进同一部署）
    const lockKey = `canary:lock:advance:${deploymentId}`;
    const lockAcquired = await this.redis.acquireLock(lockKey, 15);
    if (!lockAcquired) {
      log.warn(`阶段推进锁竞争: deploymentId=${deploymentId}`);
      return { advanced: false, currentStage: 'locked', trafficPercent: 0, completed: false };
    }

    try {
      // 1. 获取当前活跃阶段
      const stages = await db.select().from(canaryDeploymentStages)
        .where(eq(canaryDeploymentStages.deploymentId, deploymentId))
        .orderBy(canaryDeploymentStages.stageIndex);

      const activeStage = stages.find(s => s.status === 'active');
      if (!activeStage) {
        return { advanced: false, currentStage: 'none', trafficPercent: 0, completed: true };
      }

      // 2. 完成当前阶段
      const runtime = this.runtimeMetrics.get(deploymentId);
      await db.update(canaryDeploymentStages)
        .set({
          status: 'completed',
          completedAt: new Date(),
          metricsSnapshot: runtime ? {
            champion_accuracy: runtime.champion.accuracy,
            champion_latency: runtime.champion.avgLatencyMs,
            champion_errorRate: runtime.champion.requestCount > 0 ? runtime.champion.errorCount / runtime.champion.requestCount : 0,
            champion_requestCount: runtime.champion.requestCount,
            challenger_accuracy: runtime.challenger.accuracy,
            challenger_latency: runtime.challenger.avgLatencyMs,
            challenger_errorRate: runtime.challenger.requestCount > 0 ? runtime.challenger.errorCount / runtime.challenger.requestCount : 0,
            challenger_requestCount: runtime.challenger.requestCount,
          } : null,
        })
        .where(eq(canaryDeploymentStages.id, activeStage.id));

      // 3. 查找下一阶段
      const nextStage = stages.find(s => s.stageIndex === activeStage.stageIndex + 1);

      if (!nextStage) {
        // 所有阶段完成 → 部署成功
        await this.completeDeployment(deploymentId);
        return { advanced: true, currentStage: 'completed', trafficPercent: 100, completed: true };
      }

      // 4. 激活下一阶段
      await db.update(canaryDeploymentStages)
        .set({ status: 'active', startedAt: new Date() })
        .where(eq(canaryDeploymentStages.id, nextStage.id));

      // 5. 更新主表流量百分比
      await db.update(canaryDeployments)
        .set({ trafficPercent: nextStage.trafficPercent })
        .where(eq(canaryDeployments.id, deploymentId));

      // 6. 刷新流量缓存
      this.trafficCache.set(deploymentId, { percent: nextStage.trafficPercent, updatedAt: Date.now() });

      // 7. Prometheus + EventBus
      this.metrics.set('canary_traffic_percent', { deploymentId: String(deploymentId) }, nextStage.trafficPercent);
      await this.eventBus.publish({
        type: 'canary.stage.advanced',
        source: 'canary-deployer',
        data: {
          deploymentId,
          fromStage: activeStage.stageName,
          toStage: nextStage.stageName,
          trafficPercent: nextStage.trafficPercent,
        },
      });

      log.info(`金丝雀阶段推进: ${activeStage.stageName} → ${nextStage.stageName}, 流量 ${nextStage.trafficPercent}%`);

      // 8. 重置连续失败计数
      this.consecutiveFailures.set(deploymentId, 0);

      return {
        advanced: true,
        currentStage: nextStage.stageName,
        trafficPercent: nextStage.trafficPercent,
        completed: false,
      };
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  // ==========================================================================
  // 4b. 自动阶段推进定时器（P1 修复）
  // ==========================================================================

  private startStageAdvanceTimer(deploymentId: number): void {
    if (this.advanceTimers.has(deploymentId)) return;

    const timer = setInterval(async () => {
      try {
        await this.checkAndAdvanceStage(deploymentId);
      } catch (err) {
        log.error(`自动阶段推进检查异常: deploymentId=${deploymentId}`, err);
      }
    }, this.config.stageAdvanceCheckIntervalMs);

    this.advanceTimers.set(deploymentId, timer);
  }

  private stopStageAdvanceTimer(deploymentId: number): void {
    const timer = this.advanceTimers.get(deploymentId);
    if (timer) {
      clearInterval(timer);
      this.advanceTimers.delete(deploymentId);
    }
  }

  /**
   * 检查当前阶段是否已到期，如果到期且健康检查通过则自动推进
   */
  private async checkAndAdvanceStage(deploymentId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // 获取当前活跃阶段
    const stages = await db.select().from(canaryDeploymentStages)
      .where(and(
        eq(canaryDeploymentStages.deploymentId, deploymentId),
        eq(canaryDeploymentStages.status, 'active'),
      ))
      .limit(1);

    const activeStage = stages[0];
    if (!activeStage || !activeStage.startedAt) return;

    // 检查是否到期
    const elapsedMs = Date.now() - new Date(activeStage.startedAt).getTime();
    const durationMs = activeStage.durationHours * 3600000;

    if (durationMs > 0 && elapsedMs < durationMs) {
      // 未到期，跳过
      return;
    }

    // 到期了，检查最近健康检查是否通过
    const consecutiveFails = this.consecutiveFailures.get(deploymentId) || 0;
    if (consecutiveFails > 0) {
      log.info(`阶段 ${activeStage.stageName} 已到期但有 ${consecutiveFails} 次连续失败，暂不推进`);
      return;
    }

    // 自动推进
    log.info(`阶段 ${activeStage.stageName} 已到期且健康，自动推进`);
    const result = await this.advanceStage(deploymentId);

    if (result.completed) {
      this.stopStageAdvanceTimer(deploymentId);
    }
  }

  // ==========================================================================
  // 5. 健康检查 + 自动回滚
  // ==========================================================================

  private startHealthCheck(deploymentId: number): void {
    if (this.checkIntervals.has(deploymentId)) return;

    const interval = setInterval(async () => {
      try {
        await this.performHealthCheck(deploymentId);
      } catch (err) {
        log.error(`健康检查异常: deploymentId=${deploymentId}`, err);
      }
    }, this.config.healthCheckIntervalMs);

    this.checkIntervals.set(deploymentId, interval);
  }

  private stopHealthCheck(deploymentId: number): void {
    const interval = this.checkIntervals.get(deploymentId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(deploymentId);
    }
  }

  async performHealthCheck(deploymentId: number): Promise<HealthCheckResult> {
    if (this.isShuttingDown) {
      return { passed: true, metrics: {}, timestamp: Date.now() };
    }
    this.activeChecks.add(deploymentId);
    try {
      return await this._performHealthCheckInner(deploymentId);
    } finally {
      this.activeChecks.delete(deploymentId);
    }
  }

  private async _performHealthCheckInner(deploymentId: number): Promise<HealthCheckResult> {
    const db = await getDb();
    if (!db) throw new Error('数据库不可用');

    const runtime = this.runtimeMetrics.get(deploymentId);
    if (!runtime) {
      return { passed: true, failureReason: null, championMetrics: {}, challengerMetrics: {} };
    }

    const { champion, challenger } = runtime;

    // 样本不足，跳过判断
    if (challenger.requestCount < this.config.minSampleSize) {
      return { passed: true, failureReason: null, championMetrics: {}, challengerMetrics: {} };
    }

    // 获取当前阶段的回滚阈值
    const stages = await db.select().from(canaryDeploymentStages)
      .where(and(
        eq(canaryDeploymentStages.deploymentId, deploymentId),
        eq(canaryDeploymentStages.status, 'active'),
      ))
      .limit(1);

    const activeStage = stages[0];
    if (!activeStage) return { passed: true, failureReason: null, championMetrics: {}, challengerMetrics: {} };

    const threshold = activeStage.rollbackThresholdPct / 100;

    // 多维度健康检查
    const checks: { dimension: string; passed: boolean; reason: string }[] = [];

    // 准确率检查
    if (champion.accuracy > 0) {
      const accuracyDegradation = (champion.accuracy - challenger.accuracy) / champion.accuracy;
      const accuracyPassed = accuracyDegradation <= threshold;
      checks.push({
        dimension: 'accuracy',
        passed: accuracyPassed,
        reason: accuracyPassed ? '' : `准确率退化 ${(accuracyDegradation * 100).toFixed(2)}% > 阈值 ${(threshold * 100).toFixed(1)}%`,
      });
    }

    // 延迟检查
    if (champion.avgLatencyMs > 0) {
      const latencyIncrease = (challenger.avgLatencyMs - champion.avgLatencyMs) / champion.avgLatencyMs;
      const latencyPassed = latencyIncrease <= threshold;
      checks.push({
        dimension: 'latency',
        passed: latencyPassed,
        reason: latencyPassed ? '' : `延迟增加 ${(latencyIncrease * 100).toFixed(2)}% > 阈值 ${(threshold * 100).toFixed(1)}%`,
      });
    }

    // 错误率检查
    const championErrorRate = champion.requestCount > 0 ? champion.errorCount / champion.requestCount : 0;
    const challengerErrorRate = challenger.requestCount > 0 ? challenger.errorCount / challenger.requestCount : 0;
    if (challengerErrorRate > championErrorRate + threshold) {
      checks.push({
        dimension: 'error_rate',
        passed: false,
        reason: `错误率 ${(challengerErrorRate * 100).toFixed(2)}% 超过冠军 ${(championErrorRate * 100).toFixed(2)}% + 阈值 ${(threshold * 100).toFixed(1)}%`,
      });
    } else {
      checks.push({ dimension: 'error_rate', passed: true, reason: '' });
    }

    // P95 延迟检查（新增）
    if (champion.p95LatencyMs > 0 && challenger.p95LatencyMs > 0) {
      const p95Increase = (challenger.p95LatencyMs - champion.p95LatencyMs) / champion.p95LatencyMs;
      const p95Passed = p95Increase <= threshold * 2; // P95 容忍度放宽一倍
      checks.push({
        dimension: 'p95_latency',
        passed: p95Passed,
        reason: p95Passed ? '' : `P95 延迟增加 ${(p95Increase * 100).toFixed(2)}% > 阈值 ${(threshold * 200).toFixed(1)}%`,
      });
    }

    const failedChecks = checks.filter(c => !c.passed);
    const passed = failedChecks.length === 0;
    const failureReason = failedChecks.map(c => c.reason).join('; ') || null;

    // 构建指标快照
    const championSnapshot: Record<string, number> = {
      accuracy: champion.accuracy,
      avgLatencyMs: champion.avgLatencyMs,
      p95LatencyMs: champion.p95LatencyMs,
      errorRate: championErrorRate,
      requestCount: champion.requestCount,
    };
    const challengerSnapshot: Record<string, number> = {
      accuracy: challenger.accuracy,
      avgLatencyMs: challenger.avgLatencyMs,
      p95LatencyMs: challenger.p95LatencyMs,
      errorRate: challengerErrorRate,
      requestCount: challenger.requestCount,
    };

    // 持久化健康检查记录
    const currentFails = this.consecutiveFailures.get(deploymentId) || 0;
    const newFails = passed ? 0 : currentFails + 1;
    this.consecutiveFailures.set(deploymentId, newFails);

    await db.insert(canaryHealthChecks).values({
      deploymentId,
      stageId: activeStage.id,
      checkType: 'periodic',
      championMetrics: championSnapshot,
      challengerMetrics: challengerSnapshot,
      passed: passed ? 1 : 0,
      failureReason,
      consecutiveFails: newFails,
    });

    // Prometheus
    this.metrics.inc('canary_health_checks_total', { passed: String(passed) });

    // 连续失败自动回滚
    if (newFails >= this.config.maxConsecutiveFailures) {
      const rollbackReason = `连续 ${newFails} 次健康检查失败: ${failureReason}`;
      log.warn(`触发自动回滚: deploymentId=${deploymentId}, reason=${rollbackReason}`);
      await this.rollback(deploymentId, rollbackReason);
    }

    return { passed, failureReason, championMetrics: championSnapshot, challengerMetrics: challengerSnapshot };
  }

  // ==========================================================================
  // 6. 回滚
  // ==========================================================================

  async rollback(deploymentId: number, reason: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    // 分布式锁
    const lockKey = `canary:lock:rollback:${deploymentId}`;
    const lockAcquired = await this.redis.acquireLock(lockKey, 15);
    if (!lockAcquired) {
      log.warn(`回滚锁竞争: deploymentId=${deploymentId}`);
      return false;
    }

    try {
      // 1. 更新主表
      await db.update(canaryDeployments)
        .set({
          status: 'rolled_back',
          rollbackReason: reason,
          trafficPercent: 0,
          endedAt: new Date(),
        })
        .where(eq(canaryDeployments.id, deploymentId));

      // 2. 标记当前活跃阶段为 rolled_back
      const stages = await db.select().from(canaryDeploymentStages)
        .where(and(
          eq(canaryDeploymentStages.deploymentId, deploymentId),
          eq(canaryDeploymentStages.status, 'active'),
        ));

      for (const stage of stages) {
        await db.update(canaryDeploymentStages)
          .set({ status: 'rolled_back', rollbackReason: reason, completedAt: new Date() })
          .where(eq(canaryDeploymentStages.id, stage.id));
      }

      // 3. 停止所有定时器
      this.stopHealthCheck(deploymentId);
      this.stopStageAdvanceTimer(deploymentId);

      // 4. 清理运行时状态
      this.runtimeMetrics.delete(deploymentId);
      this.consecutiveFailures.delete(deploymentId);
      this.trafficCache.delete(deploymentId);

      // 5. Prometheus + EventBus
      this.metrics.inc('canary_rollbacks_total');
      this.metrics.set('canary_active_deployments', {}, await this.countActiveDeployments());

      await this.eventBus.publish({
        type: 'canary.deployment.rolled_back',
        source: 'canary-deployer',
        data: { deploymentId, reason },
      });

      log.warn(`金丝雀回滚完成: deploymentId=${deploymentId}, reason=${reason}`);
      return true;
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  // ==========================================================================
  // 7. 完成部署
  // ==========================================================================

  private async completeDeployment(deploymentId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // 获取最终指标快照
    const runtime = this.runtimeMetrics.get(deploymentId);
    const metricsSnapshot = runtime ? {
      champion_accuracy: runtime.champion.accuracy,
      champion_latency: runtime.champion.avgLatencyMs,
      champion_p95: runtime.champion.p95LatencyMs,
      challenger_accuracy: runtime.challenger.accuracy,
      challenger_latency: runtime.challenger.avgLatencyMs,
      challenger_p95: runtime.challenger.p95LatencyMs,
      total_requests: runtime.champion.requestCount + runtime.challenger.requestCount,
    } : {};

    await db.update(canaryDeployments)
      .set({
        status: 'completed',
        trafficPercent: 100,
        endedAt: new Date(),
        metricsSnapshot,
      })
      .where(eq(canaryDeployments.id, deploymentId));

    // 清理所有定时器和状态
    this.stopHealthCheck(deploymentId);
    this.stopStageAdvanceTimer(deploymentId);
    this.runtimeMetrics.delete(deploymentId);
    this.consecutiveFailures.delete(deploymentId);
    this.trafficCache.delete(deploymentId);

    // Prometheus + EventBus
    this.metrics.inc('canary_deployments_completed_total');
    this.metrics.set('canary_active_deployments', {}, await this.countActiveDeployments());

    await this.eventBus.publish({
      type: 'canary.deployment.completed',
      source: 'canary-deployer',
      data: { deploymentId, metricsSnapshot },
    });

    log.info(`金丝雀部署完成: deploymentId=${deploymentId}, Challenger 成为新 Champion`);
  }

  // ==========================================================================
  // 8. 查询方法
  // ==========================================================================

  async getDeployment(deploymentId: number): Promise<{
    deployment: typeof canaryDeployments.$inferSelect | null;
    stages: typeof canaryDeploymentStages.$inferSelect[];
    recentChecks: typeof canaryHealthChecks.$inferSelect[];
  }> {
    const db = await getDb();
    if (!db) return { deployment: null, stages: [], recentChecks: [] };

    const deployments = await db.select().from(canaryDeployments)
      .where(eq(canaryDeployments.id, deploymentId)).limit(1);

    const stages = await db.select().from(canaryDeploymentStages)
      .where(eq(canaryDeploymentStages.deploymentId, deploymentId))
      .orderBy(canaryDeploymentStages.stageIndex);

    const recentChecks = await db.select().from(canaryHealthChecks)
      .where(eq(canaryHealthChecks.deploymentId, deploymentId))
      .orderBy(desc(canaryHealthChecks.checkedAt))
      .limit(20);

    return {
      deployment: deployments[0] || null,
      stages,
      recentChecks,
    };
  }

  async getActiveDeployments(): Promise<typeof canaryDeployments.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeployments)
      .where(eq(canaryDeployments.status, 'active'))
      .orderBy(desc(canaryDeployments.startedAt));
  }

  async getDeploymentHistory(limit = 20): Promise<typeof canaryDeployments.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeployments)
      .orderBy(desc(canaryDeployments.startedAt))
      .limit(limit);
  }

  getRuntimeMetrics(deploymentId: number): { champion: DeploymentMetrics; challenger: DeploymentMetrics } | null {
    return this.runtimeMetrics.get(deploymentId) || null;
  }

  getPrometheusMetrics(): Record<string, number> {
    return this.metrics.getAll();
  }

  // ==========================================================================
  // 内部工具方法
  // ==========================================================================

  private emptyMetrics(): DeploymentMetrics {
    return {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      accuracy: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * 一致性哈希：DJB2 变体，确保相同 key 始终路由到同一版本
   */
  private consistentHash(key: string): number {
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
    }
    return hash / 0x7fffffff;
  }

  private async countActiveDeployments(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    const rows = await db.select({ cnt: count() }).from(canaryDeployments)
      .where(eq(canaryDeployments.status, 'active'));
    return rows[0]?.cnt ?? 0;
  }

  /**
   * 幂等 key 管理
   */
  private async trySetIdempotencyKey(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.setnx(key, '1');
      if (result) {
        await this.redis.expire(key, ttlSeconds);
      }
      return result;
    } catch {
      return true; // Redis 不可用时降级为允许
    }
  }

  /**
   * 优雅停止：
   *   1. 停止所有定时器（不再触发新的检查）
   *   2. 等待正在执行的检查完成（最多等待 drainTimeoutMs）
   *   3. 清理内存状态
   */
  private isShuttingDown = false;
  private activeChecks = new Set<number>();

  async destroy(drainTimeoutMs = 10000): Promise<void> {
    this.isShuttingDown = true;
    log.info('金丝雀部署器开始优雅停止...');

    // Step 1: 停止所有定时器
    this.checkIntervals.forEach((interval) => clearInterval(interval));
    this.checkIntervals.clear();
    this.advanceTimers.forEach((timer) => clearInterval(timer));
    this.advanceTimers.clear();

    // Step 2: 等待正在执行的检查完成
    if (this.activeChecks.size > 0) {
      log.info(`等待 ${this.activeChecks.size} 个正在执行的检查完成...`);
      const drainStart = Date.now();
      while (this.activeChecks.size > 0 && Date.now() - drainStart < drainTimeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (this.activeChecks.size > 0) {
        log.warn(`优雅停止超时，仍有 ${this.activeChecks.size} 个检查未完成，强制清理`);
      }
    }

    // Step 3: 清理内存状态
    this.runtimeMetrics.clear();
    this.consecutiveFailures.clear();
    this.trafficCache.clear();
    this.activeChecks.clear();
    this.isShuttingDown = false;

    log.info('金丝雀部署器已优雅停止');
  }
}
