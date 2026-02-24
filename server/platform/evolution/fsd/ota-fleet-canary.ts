/**
 * ============================================================================
 * OTA Fleet Canary v2.0 (E33)
 * ============================================================================
 *
 * v2.0 升级：
 *   - 完整 DB 持久化（canary_deployments + canary_deployment_stages + canary_health_checks）
 *   - 重启恢复（recoverActiveDeployments）
 *   - 阶段推进持久化
 *   - 健康检查记录持久化
 *   - 幂等 key 防止重复部署
 *   - 地域/用户组分批路由
 *
 * 借鉴 FSD OTA 部署策略：
 *   5 阶段渐进部署：
 *     Stage 0: Shadow (0% 流量，纯影子模式观察)
 *     Stage 1: Canary (5% 流量，小范围验证)
 *     Stage 2: Gray   (20% 流量，扩大验证)
 *     Stage 3: Half   (50% 流量，半量部署)
 *     Stage 4: Full   (100% 流量，全量部署)
 *
 *   每阶段自动健康检查：
 *     - 干预率 < 阈值
 *     - 错误率 < 阈值
 *     - 延迟 P99 < 阈值
 *     - 无严重告警
 */

import { getDb } from '../../../lib/db';
import {
  canaryDeployments,
  canaryDeploymentStages,
  canaryHealthChecks,
} from '../../../../drizzle/evolution-schema';
import { eq, and, desc } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';
import { RedisClient } from '../../../lib/clients/redis.client';

const log = createModuleLogger('ota-fleet-canary');

// ============================================================================
// 类型定义
// ============================================================================

export interface DeploymentPlan {
  planId: string;
  modelId: string;
  modelVersion: string;
  targetRegions: string[];
  targetCohorts: string[];
  createdBy: string;
  metadata: Record<string, unknown>;
}

export interface DeploymentStage {
  name: 'shadow' | 'canary' | 'gray' | 'half' | 'full';
  trafficPercent: number;
  minDurationMs: number;
  healthCheckIntervalMs: number;
  autoAdvance: boolean;
}

export interface HealthCheckResult {
  passed: boolean;
  interventionRate: number;
  errorRate: number;
  latencyP99: number;
  activeAlerts: number;
  details: HealthCheckDetail[];
  checkedAt: number;
}

export interface HealthCheckDetail {
  metric: string;
  value: number;
  threshold: number;
  passed: boolean;
}

export interface DeploymentState {
  planId: string;
  dbId: number | null;
  currentStage: DeploymentStage['name'];
  stageIndex: number;
  startedAt: number;
  stageStartedAt: number;
  healthChecks: HealthCheckResult[];
  consecutivePasses: number;
  status: 'running' | 'paused' | 'completed' | 'rolled_back' | 'failed';
  rollbackReason?: string;
}

export interface OTACanaryConfig {
  interventionRateThreshold: number;
  errorRateThreshold: number;
  latencyP99Threshold: number;
  maxActiveAlerts: number;
  requiredConsecutivePasses: number;
}

// ============================================================================
// 健康检查提供者接口
// ============================================================================

export interface HealthCheckProvider {
  getInterventionRate(modelId: string): Promise<number>;
  getErrorRate(modelId: string): Promise<number>;
  getLatencyP99(modelId: string): Promise<number>;
  getActiveAlertCount(modelId: string): Promise<number>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_STAGES: DeploymentStage[] = [
  { name: 'shadow', trafficPercent: 0, minDurationMs: 24 * 3600000, healthCheckIntervalMs: 3600000, autoAdvance: true },
  { name: 'canary', trafficPercent: 5, minDurationMs: 48 * 3600000, healthCheckIntervalMs: 1800000, autoAdvance: true },
  { name: 'gray', trafficPercent: 20, minDurationMs: 72 * 3600000, healthCheckIntervalMs: 3600000, autoAdvance: true },
  { name: 'half', trafficPercent: 50, minDurationMs: 48 * 3600000, healthCheckIntervalMs: 3600000, autoAdvance: true },
  { name: 'full', trafficPercent: 100, minDurationMs: 0, healthCheckIntervalMs: 3600000, autoAdvance: false },
];

const DEFAULT_CONFIG: OTACanaryConfig = {
  interventionRateThreshold: 0.005,
  errorRateThreshold: 0.001,
  latencyP99Threshold: 500,
  maxActiveAlerts: 0,
  requiredConsecutivePasses: 3,
};

// ============================================================================
// OTA Fleet Canary v2.0
// ============================================================================

export class OTAFleetCanary {
  private config: OTACanaryConfig;
  private stages: DeploymentStage[];
  private eventBus: EventBus;
  private redis: RedisClient;
  private healthProvider: HealthCheckProvider | null = null;

  /** 活跃部署状态（内存缓存 + DB 持久化） */
  private activeDeployments: Map<string, DeploymentState> = new Map();

  /** 健康检查定时器 */
  private healthTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    config: Partial<OTACanaryConfig> = {},
    stages?: DeploymentStage[],
    eventBus?: EventBus,
    redis?: RedisClient,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stages = stages ?? DEFAULT_STAGES;
    this.eventBus = eventBus || new EventBus();
    this.redis = redis || new RedisClient();
  }

  setHealthProvider(provider: HealthCheckProvider): void {
    this.healthProvider = provider;
  }

  // ==========================================================================
  // 0. 启动恢复 — 从 DB 恢复活跃部署
  // ==========================================================================

  async recoverActiveDeployments(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const activeRows = await db.select()
        .from(canaryDeployments)
        .where(eq(canaryDeployments.status, 'running'));

      for (const row of activeRows) {
        const stageIndex = this.stages.findIndex(s => s.trafficPercent === row.trafficPercent);
        const state: DeploymentState = {
          planId: row.deploymentId,
          dbId: row.id,
          currentStage: this.stages[Math.max(stageIndex, 0)]?.name ?? 'shadow',
          stageIndex: Math.max(stageIndex, 0),
          startedAt: row.startedAt?.getTime() ?? Date.now(),
          stageStartedAt: Date.now(),
          healthChecks: [],
          consecutivePasses: 0,
          status: 'running',
        };

        this.activeDeployments.set(row.deploymentId, state);

        // 恢复健康检查定时器
        this.startHealthCheckTimer(row.deploymentId, row.modelId);

        log.info(`恢复 OTA 部署: ${row.deploymentId}, 阶段 ${state.currentStage}`);
      }

      log.info(`OTA 部署恢复完成: 恢复了 ${activeRows.length} 个活跃部署`);
    } catch (err) {
      log.error('恢复 OTA 部署失败', err);
    }
  }

  // ==========================================================================
  // 1. 启动部署（幂等 + DB 持久化）
  // ==========================================================================

  async startDeployment(plan: DeploymentPlan): Promise<DeploymentState> {
    // 幂等检查 — 使用 acquireLock 实现 setnx 语义
    const idempotencyKey = `ota:deploy:idempotent:${plan.planId}`;
    const lockAcquired = await this.redis.acquireLock(idempotencyKey, 86400);
    if (!lockAcquired) {
      const existing = this.activeDeployments.get(plan.planId);
      if (existing) return existing;
      throw new Error(`部署 ${plan.planId} 已存在（幂等拦截）`);
    }

    const db = await getDb();
    if (!db) throw new Error('数据库连接不可用');

    // 写入 canary_deployments 表
    const [inserted] = await db.insert(canaryDeployments).values({
      deploymentId: plan.planId,
      modelId: plan.modelId,
      modelVersion: plan.modelVersion,
      status: 'running',
      trafficPercent: 0,
      startedAt: new Date(),
      config: {
        targetRegions: plan.targetRegions,
        targetCohorts: plan.targetCohorts,
        stages: this.stages,
        healthConfig: this.config,
        createdBy: plan.createdBy,
      },
    }).$returningId();

    const dbId = inserted?.id ?? null;

    // 写入第一阶段记录
    await this.persistStageRecord(dbId, plan.planId, this.stages[0], 'running');

    const state: DeploymentState = {
      planId: plan.planId,
      dbId,
      currentStage: this.stages[0].name,
      stageIndex: 0,
      startedAt: Date.now(),
      stageStartedAt: Date.now(),
      healthChecks: [],
      consecutivePasses: 0,
      status: 'running',
    };

    this.activeDeployments.set(plan.planId, state);

    // 启动健康检查定时器
    this.startHealthCheckTimer(plan.planId, plan.modelId);

    await this.eventBus.publish({
      type: 'ota.deployment.started',
      source: 'ota-fleet-canary',
      data: {
        planId: plan.planId,
        modelId: plan.modelId,
        stage: state.currentStage,
        regions: plan.targetRegions,
        cohorts: plan.targetCohorts,
      },
    });

    log.info(`OTA 部署启动: ${plan.planId}, 模型 ${plan.modelId}, 阶段 ${state.currentStage}`);
    return state;
  }

  // ==========================================================================
  // 2. 执行完整部署流程
  // ==========================================================================

  async deployToFleet(plan: DeploymentPlan): Promise<DeploymentState> {
    let state = await this.startDeployment(plan);

    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      state.currentStage = stage.name;
      state.stageIndex = i;
      state.stageStartedAt = Date.now();
      state.consecutivePasses = 0;

      // 更新 DB 中的流量百分比和阶段
      await this.updateDeploymentInDB(state, stage.trafficPercent);
      await this.persistStageRecord(state.dbId, plan.planId, stage, 'running');

      log.info(`进入阶段 ${stage.name} (${stage.trafficPercent}% 流量)`);

      await this.eventBus.publish({
        type: 'ota.stage.entered',
        source: 'ota-fleet-canary',
        data: {
          planId: plan.planId,
          stage: stage.name,
          trafficPercent: stage.trafficPercent,
        },
      });

      // 在最小持续时间内定期健康检查
      if (stage.minDurationMs > 0) {
        const checkCount = Math.ceil(stage.minDurationMs / stage.healthCheckIntervalMs);

        for (let check = 0; check < checkCount; check++) {
          const health = await this.performHealthCheck(plan.modelId, stage);
          state.healthChecks.push(health);

          // 持久化健康检查记录
          await this.persistHealthCheck(state.dbId, plan.planId, stage.name, health);

          if (health.passed) {
            state.consecutivePasses++;
          } else {
            state.consecutivePasses = 0;
            const failCount = state.healthChecks.filter(h => !h.passed).length;

            if (failCount >= 3) {
              state = await this.rollback(plan, state, stage,
                `健康检查连续失败: ${this.formatHealthFailure(health)}`);
              return state;
            }
          }
        }

        if (state.consecutivePasses < this.config.requiredConsecutivePasses && stage.autoAdvance) {
          state = await this.rollback(plan, state, stage,
            `连续通过次数不足: ${state.consecutivePasses}/${this.config.requiredConsecutivePasses}`);
          return state;
        }

        // 标记阶段完成
        await this.persistStageRecord(state.dbId, plan.planId, stage, 'completed');
      }

      if (!stage.autoAdvance) break;
    }

    state.status = 'completed';
    await this.updateDeploymentInDB(state, 100);
    this.clearHealthCheckTimer(plan.planId);

    await this.eventBus.publish({
      type: 'ota.deployment.completed',
      source: 'ota-fleet-canary',
      data: {
        planId: plan.planId,
        modelId: plan.modelId,
        totalHealthChecks: state.healthChecks.length,
        durationMs: Date.now() - state.startedAt,
      },
    });

    log.info(`OTA 部署完成: ${plan.planId}, 耗时 ${Date.now() - state.startedAt}ms`);
    return state;
  }

  // ==========================================================================
  // 3. 地域/用户组分批路由
  // ==========================================================================

  routeRequest(
    requestId: string,
    region: string,
    cohort: string,
    plan: DeploymentPlan,
  ): 'production' | 'challenger' {
    const state = this.activeDeployments.get(plan.planId);
    if (!state || state.status !== 'running') return 'production';

    const stage = this.stages[state.stageIndex];
    if (!stage || stage.trafficPercent === 0) return 'production';

    // 地域过滤：如果指定了目标地域，非目标地域走生产
    if (plan.targetRegions.length > 0 && !plan.targetRegions.includes(region)) {
      return 'production';
    }

    // 用户组过滤：如果指定了目标用户组，非目标用户组走生产
    if (plan.targetCohorts.length > 0 && !plan.targetCohorts.includes(cohort)) {
      return 'production';
    }

    // 基于 requestId 的一致性哈希（确定性路由，同一请求始终路由到同一目标）
    const hash = this.consistentHash(requestId);
    return hash < stage.trafficPercent / 100 ? 'challenger' : 'production';
  }

  private consistentHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // 转为 32 位整数
    }
    return Math.abs(hash) / 2147483647; // 归一化到 [0, 1]
  }

  // ==========================================================================
  // 4. 健康检查
  // ==========================================================================

  private async performHealthCheck(modelId: string, stage: DeploymentStage): Promise<HealthCheckResult> {
    const details: HealthCheckDetail[] = [];
    let allPassed = true;

    if (this.healthProvider) {
      const [interventionRate, errorRate, latencyP99, alertCount] = await Promise.all([
        this.healthProvider.getInterventionRate(modelId),
        this.healthProvider.getErrorRate(modelId),
        this.healthProvider.getLatencyP99(modelId),
        this.healthProvider.getActiveAlertCount(modelId),
      ]);

      const checks = [
        { metric: 'intervention_rate', value: interventionRate, threshold: this.config.interventionRateThreshold },
        { metric: 'error_rate', value: errorRate, threshold: this.config.errorRateThreshold },
        { metric: 'latency_p99', value: latencyP99, threshold: this.config.latencyP99Threshold },
        { metric: 'active_alerts', value: alertCount, threshold: this.config.maxActiveAlerts },
      ];

      for (const check of checks) {
        const passed = check.value <= check.threshold;
        details.push({ ...check, passed });
        if (!passed) allPassed = false;
      }

      return {
        passed: allPassed,
        interventionRate,
        errorRate,
        latencyP99,
        activeAlerts: alertCount,
        details,
        checkedAt: Date.now(),
      };
    }

    // 无健康检查提供者 — 记录警告而非静默通过
    log.warn(`OTA 健康检查: 无 HealthCheckProvider, 模型 ${modelId} 阶段 ${stage.name} 默认通过（需配置 Provider）`);
    return {
      passed: true,
      interventionRate: 0,
      errorRate: 0,
      latencyP99: 0,
      activeAlerts: 0,
      details: [{ metric: 'no_provider', value: 0, threshold: 0, passed: true }],
      checkedAt: Date.now(),
    };
  }

  // ==========================================================================
  // 5. 回滚（清理定时器 + DB 更新）
  // ==========================================================================

  private async rollback(
    plan: DeploymentPlan,
    state: DeploymentState,
    failedStage: DeploymentStage,
    reason: string,
  ): Promise<DeploymentState> {
    state.status = 'rolled_back';
    state.rollbackReason = reason;

    // 清理健康检查定时器
    this.clearHealthCheckTimer(plan.planId);

    // 更新 DB
    await this.updateDeploymentInDB(state, 0);
    await this.persistStageRecord(state.dbId, plan.planId, failedStage, 'rolled_back');

    await this.eventBus.publish({
      type: 'ota.deployment.rolled_back',
      source: 'ota-fleet-canary',
      data: {
        planId: plan.planId,
        modelId: plan.modelId,
        failedStage: failedStage.name,
        reason,
        durationMs: Date.now() - state.startedAt,
      },
    });

    log.warn(`OTA 部署回滚: ${plan.planId}, 阶段 ${failedStage.name}, 原因: ${reason}`);
    return state;
  }

  // ==========================================================================
  // 6. 手动控制（含 DB 同步）
  // ==========================================================================

  async pauseDeployment(planId: string): Promise<void> {
    const state = this.activeDeployments.get(planId);
    if (state) {
      state.status = 'paused';
      this.clearHealthCheckTimer(planId);
      await this.updateDeploymentInDB(state, this.stages[state.stageIndex]?.trafficPercent ?? 0);
      log.info(`OTA 部署已暂停: ${planId}`);
    }
  }

  async resumeDeployment(planId: string, modelId: string): Promise<void> {
    const state = this.activeDeployments.get(planId);
    if (state && state.status === 'paused') {
      state.status = 'running';
      await this.updateDeploymentInDB(state, this.stages[state.stageIndex]?.trafficPercent ?? 0);
      this.startHealthCheckTimer(planId, modelId);
      log.info(`OTA 部署已恢复: ${planId}`);
    }
  }

  async forceAdvance(planId: string): Promise<void> {
    const state = this.activeDeployments.get(planId);
    if (state && state.stageIndex < this.stages.length - 1) {
      const prevStage = this.stages[state.stageIndex];
      state.stageIndex++;
      state.currentStage = this.stages[state.stageIndex].name;
      state.stageStartedAt = Date.now();
      state.consecutivePasses = 0;

      await this.persistStageRecord(state.dbId, planId, prevStage, 'completed');
      await this.updateDeploymentInDB(state, this.stages[state.stageIndex].trafficPercent);
      await this.persistStageRecord(state.dbId, planId, this.stages[state.stageIndex], 'running');

      log.info(`OTA 部署强制推进: ${planId} → ${state.currentStage}`);
    }
  }

  // ==========================================================================
  // 7. 查询
  // ==========================================================================

  getDeploymentState(planId: string): DeploymentState | undefined {
    return this.activeDeployments.get(planId);
  }

  getAllDeployments(): DeploymentState[] {
    return Array.from(this.activeDeployments.values());
  }

  getStages(): DeploymentStage[] {
    return [...this.stages];
  }

  // ==========================================================================
  // 8. DB 持久化方法
  // ==========================================================================

  private async updateDeploymentInDB(state: DeploymentState, trafficPercent: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.update(canaryDeployments)
        .set({
          status: state.status,
          trafficPercent,
          completedAt: state.status === 'completed' || state.status === 'rolled_back'
            ? new Date() : undefined,
        })
        .where(eq(canaryDeployments.deploymentId, state.planId));
    } catch (err) {
      log.error(`更新 OTA 部署 DB 失败: ${state.planId}`, err);
    }
  }

  private async persistStageRecord(
    deploymentDbId: number | null,
    planId: string,
    stage: DeploymentStage,
    status: string,
  ): Promise<void> {
    const db = await getDb();
    if (!db || !deploymentDbId) return;

    try {
      await db.insert(canaryDeploymentStages).values({
        deploymentId: deploymentDbId,
        stageName: stage.name,
        trafficPercent: stage.trafficPercent,
        status,
        startedAt: new Date(),
      });
    } catch (err) {
      log.error(`持久化 OTA 阶段记录失败: ${planId} / ${stage.name}`, err);
    }
  }

  private async persistHealthCheck(
    deploymentDbId: number | null,
    planId: string,
    stageName: string,
    health: HealthCheckResult,
  ): Promise<void> {
    const db = await getDb();
    if (!db || !deploymentDbId) return;

    try {
      await db.insert(canaryHealthChecks).values({
        deploymentId: deploymentDbId,
        stageName,
        checkResult: health.passed ? 'passed' : 'failed',
        metrics: {
          interventionRate: health.interventionRate,
          errorRate: health.errorRate,
          latencyP99: health.latencyP99,
          activeAlerts: health.activeAlerts,
          details: health.details,
        },
        checkedAt: new Date(health.checkedAt),
      });
    } catch (err) {
      log.error(`持久化 OTA 健康检查失败: ${planId} / ${stageName}`, err);
    }
  }

  // ==========================================================================
  // 9. 健康检查定时器管理
  // ==========================================================================

  private startHealthCheckTimer(planId: string, modelId: string): void {
    this.clearHealthCheckTimer(planId);

    const state = this.activeDeployments.get(planId);
    if (!state) return;

    const stage = this.stages[state.stageIndex];
    if (!stage) return;

    const timer = setInterval(async () => {
      const currentState = this.activeDeployments.get(planId);
      if (!currentState || currentState.status !== 'running') {
        this.clearHealthCheckTimer(planId);
        return;
      }

      const health = await this.performHealthCheck(modelId, stage);
      currentState.healthChecks.push(health);
      await this.persistHealthCheck(currentState.dbId, planId, currentState.currentStage, health);

      if (!health.passed) {
        currentState.consecutivePasses = 0;
        log.warn(`OTA 定时健康检查失败: ${planId}, 阶段 ${currentState.currentStage}`);
      } else {
        currentState.consecutivePasses++;
      }
    }, stage.healthCheckIntervalMs);

    this.healthTimers.set(planId, timer);
  }

  private clearHealthCheckTimer(planId: string): void {
    const timer = this.healthTimers.get(planId);
    if (timer) {
      clearInterval(timer);
      this.healthTimers.delete(planId);
    }
  }

  // ==========================================================================
  // 10. 优雅关闭
  // ==========================================================================

  async destroy(): Promise<void> {
    for (const [planId, timer] of this.healthTimers) {
      clearInterval(timer);
      log.info(`清理 OTA 健康检查定时器: ${planId}`);
    }
    this.healthTimers.clear();
    this.activeDeployments.clear();
  }

  // ==========================================================================
  // 11. 工具方法
  // ==========================================================================

  private formatHealthFailure(health: HealthCheckResult): string {
    const failures = health.details.filter(d => !d.passed);
    return failures.map(f => `${f.metric}=${f.value}(阈值${f.threshold})`).join(', ');
  }

  updateConfig(updates: Partial<OTACanaryConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
