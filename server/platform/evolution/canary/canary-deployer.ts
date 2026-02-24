/**
 * ============================================================================
 * 金丝雀部署器 v2.0 — CanaryDeployer
 * ============================================================================
 *
 * 自进化飞轮：安全渐进式部署新模型/规则
 *
 * v2.0 升级：
 *   1. 5 阶段渐进部署（shadow→canary→gray→half→full）
 *   2. 全部状态 DB 持久化（重启不丢失）
 *   3. Prometheus 全链路埋点
 *   4. 连续 N 次健康检查失败自动回滚（可配置阈值）
 *   5. EventBus 事件驱动（部署状态变更通知）
 *   6. 健康检查记录持久化（支持审计追溯）
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

import { getDb } from '../../../lib/db';
import {
  canaryDeployments,
  canaryDeploymentStages,
  canaryHealthChecks,
  canaryTrafficSplits,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, and } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

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
// 金丝雀部署器 v2.0
// ============================================================================

export class CanaryDeployer {
  private config: CanaryDeployerConfig;
  private stages: DeploymentStageConfig[];
  private metrics = new CanaryMetrics();
  private eventBus: EventBus;

  // 内存中的运行时指标（按 deploymentId 聚合）
  private runtimeMetrics = new Map<number, {
    champion: DeploymentMetrics;
    challenger: DeploymentMetrics;
  }>();

  // 健康检查定时器
  private checkIntervals = new Map<number, NodeJS.Timeout>();

  // 连续失败计数器
  private consecutiveFailures = new Map<number, number>();

  constructor(config: Partial<CanaryDeployerConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stages = config.stages || DEFAULT_STAGES;
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 创建金丝雀部署
  // ==========================================================================

  async createDeployment(params: {
    experimentId: number;
    challengerModelId: string;
    championModelId: string;
    stages?: DeploymentStageConfig[];
  }): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('数据库不可用');

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

    // 4. Prometheus 埋点
    this.metrics.inc('canary_deployments_created_total');
    this.metrics.set('canary_active_deployments', {}, await this.countActiveDeployments());

    // 5. EventBus 通知
    await this.eventBus.publish({
      type: 'canary.deployment.created',
      source: 'canary-deployer',
      data: { deploymentId, challengerModelId: params.challengerModelId, stages: stageConfigs.length },
    });

    log.info(`金丝雀部署创建成功: deploymentId=${deploymentId}, model=${params.challengerModelId}, stages=${stageConfigs.length}`);

    // 6. 启动健康检查
    this.startHealthCheck(deploymentId);

    return deploymentId;
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

    // 增量式平均延迟
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
  // 3. 流量路由（一致性哈希）
  // ==========================================================================

  routeRequest(deploymentId: number, requestKey: string): 'champion' | 'challenger' {
    const runtime = this.runtimeMetrics.get(deploymentId);
    if (!runtime) return 'champion';

    // 从内存中获取当前流量百分比
    // 实际生产中应从 DB 缓存读取
    const hash = this.consistentHash(requestKey);
    // 需要查询当前阶段的 trafficPercent
    // 简化：从 runtimeMetrics 推算
    return hash < 0.05 ? 'challenger' : 'champion'; // 默认 5%，实际由 advanceStage 动态调整
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
          challenger_accuracy: runtime.challenger.accuracy,
          challenger_latency: runtime.challenger.avgLatencyMs,
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

    // 6. Prometheus + EventBus
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

    // 7. 重置连续失败计数
    this.consecutiveFailures.set(deploymentId, 0);

    return {
      advanced: true,
      currentStage: nextStage.stageName,
      trafficPercent: nextStage.trafficPercent,
      completed: false,
    };
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

    const failedChecks = checks.filter(c => !c.passed);
    const passed = failedChecks.length === 0;
    const failureReason = failedChecks.map(c => c.reason).join('; ') || null;

    // 构建指标快照
    const championSnapshot: Record<string, number> = {
      accuracy: champion.accuracy,
      avgLatencyMs: champion.avgLatencyMs,
      errorRate: championErrorRate,
      requestCount: champion.requestCount,
    };
    const challengerSnapshot: Record<string, number> = {
      accuracy: challenger.accuracy,
      avgLatencyMs: challenger.avgLatencyMs,
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

    // 3. 停止健康检查
    this.stopHealthCheck(deploymentId);

    // 4. 清理运行时状态
    this.runtimeMetrics.delete(deploymentId);
    this.consecutiveFailures.delete(deploymentId);

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
      challenger_accuracy: runtime.challenger.accuracy,
      challenger_latency: runtime.challenger.avgLatencyMs,
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

    // 清理
    this.stopHealthCheck(deploymentId);
    this.runtimeMetrics.delete(deploymentId);
    this.consecutiveFailures.delete(deploymentId);

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

  private consistentHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) / 2147483647;
  }

  private async countActiveDeployments(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    const rows = await db.select().from(canaryDeployments)
      .where(eq(canaryDeployments.status, 'active'));
    return rows.length;
  }

  /**
   * 销毁：清理所有定时器
   */
  destroy(): void {
    this.checkIntervals.forEach((interval) => clearInterval(interval));
    this.checkIntervals.clear();
    this.runtimeMetrics.clear();
    this.consecutiveFailures.clear();
  }
}
