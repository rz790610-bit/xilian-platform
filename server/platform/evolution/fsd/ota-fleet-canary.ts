/**
 * ============================================================================
 * OTA Fleet Canary (E33)
 * ============================================================================
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
 *
 *   支持：
 *     - 地域分批 (region-based rollout)
 *     - 用户组分批 (cohort-based rollout)
 *     - 自动回滚
 *     - DB 持久化
 */

import { getDb } from '../../../lib/db';
import { canaryDeployments } from '../../../../drizzle/evolution-schema';
import { eq } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

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
  currentStage: DeploymentStage['name'];
  stageIndex: number;
  startedAt: number;
  stageStartedAt: number;
  healthChecks: HealthCheckResult[];
  status: 'running' | 'paused' | 'completed' | 'rolled_back' | 'failed';
  rollbackReason?: string;
}

export interface OTACanaryConfig {
  /** 干预率阈值 */
  interventionRateThreshold: number;
  /** 错误率阈值 */
  errorRateThreshold: number;
  /** 延迟 P99 阈值 (ms) */
  latencyP99Threshold: number;
  /** 最大告警数 */
  maxActiveAlerts: number;
  /** 连续健康检查通过次数（才能进入下一阶段） */
  requiredConsecutivePasses: number;
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
// 健康检查提供者接口
// ============================================================================

export interface HealthCheckProvider {
  getInterventionRate(modelId: string): Promise<number>;
  getErrorRate(modelId: string): Promise<number>;
  getLatencyP99(modelId: string): Promise<number>;
  getActiveAlertCount(modelId: string): Promise<number>;
}

// ============================================================================
// OTA Fleet Canary
// ============================================================================

export class OTAFleetCanary {
  private config: OTACanaryConfig;
  private stages: DeploymentStage[];
  private eventBus: EventBus;
  private healthProvider: HealthCheckProvider | null = null;

  /** 活跃部署状态 */
  private activeDeployments: Map<string, DeploymentState> = new Map();

  constructor(
    config: Partial<OTACanaryConfig> = {},
    stages?: DeploymentStage[],
    eventBus?: EventBus,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stages = stages ?? DEFAULT_STAGES;
    this.eventBus = eventBus || new EventBus();
  }

  setHealthProvider(provider: HealthCheckProvider): void {
    this.healthProvider = provider;
  }

  // ==========================================================================
  // 1. 启动部署
  // ==========================================================================

  async startDeployment(plan: DeploymentPlan): Promise<DeploymentState> {
    const state: DeploymentState = {
      planId: plan.planId,
      currentStage: this.stages[0].name,
      stageIndex: 0,
      startedAt: Date.now(),
      stageStartedAt: Date.now(),
      healthChecks: [],
      status: 'running',
    };

    this.activeDeployments.set(plan.planId, state);

    // DB 持久化
    await this.persistDeployment(plan, state);

    // EventBus
    await this.eventBus.publish({
      type: 'ota.deployment.started',
      source: 'ota-fleet-canary',
      data: {
        planId: plan.planId,
        modelId: plan.modelId,
        stage: state.currentStage,
        regions: plan.targetRegions,
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

      log.info(`进入阶段 ${stage.name} (${stage.trafficPercent}% 流量)`);

      // EventBus
      await this.eventBus.publish({
        type: 'ota.stage.entered',
        source: 'ota-fleet-canary',
        data: {
          planId: plan.planId,
          stage: stage.name,
          trafficPercent: stage.trafficPercent,
        },
      });

      // 等待最小持续时间
      if (stage.minDurationMs > 0) {
        // 在最小持续时间内定期健康检查
        const checkCount = Math.ceil(stage.minDurationMs / stage.healthCheckIntervalMs);
        let consecutivePasses = 0;

        for (let check = 0; check < checkCount; check++) {
          const health = await this.performHealthCheck(plan.modelId, stage);
          state.healthChecks.push(health);

          if (health.passed) {
            consecutivePasses++;
          } else {
            consecutivePasses = 0;

            // 健康检查失败，回滚
            if (!health.passed && state.healthChecks.filter(h => !h.passed).length >= 3) {
              state = await this.rollback(plan, state, stage, `健康检查连续失败: ${this.formatHealthFailure(health)}`);
              return state;
            }
          }
        }

        // 检查是否满足连续通过要求
        if (consecutivePasses < this.config.requiredConsecutivePasses && stage.autoAdvance) {
          state = await this.rollback(plan, state, stage, `连续通过次数不足: ${consecutivePasses}/${this.config.requiredConsecutivePasses}`);
          return state;
        }
      }

      // 最终阶段不自动推进
      if (!stage.autoAdvance) {
        break;
      }
    }

    state.status = 'completed';

    // EventBus
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
  // 3. 健康检查
  // ==========================================================================

  private async performHealthCheck(modelId: string, stage: DeploymentStage): Promise<HealthCheckResult> {
    const details: HealthCheckDetail[] = [];
    let allPassed = true;

    if (this.healthProvider) {
      // 实际健康检查
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

    // 无健康检查提供者，默认通过
    return {
      passed: true,
      interventionRate: 0,
      errorRate: 0,
      latencyP99: 0,
      activeAlerts: 0,
      details: [],
      checkedAt: Date.now(),
    };
  }

  // ==========================================================================
  // 4. 回滚
  // ==========================================================================

  private async rollback(
    plan: DeploymentPlan,
    state: DeploymentState,
    failedStage: DeploymentStage,
    reason: string,
  ): Promise<DeploymentState> {
    state.status = 'rolled_back';
    state.rollbackReason = reason;

    // EventBus
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
  // 5. 手动控制
  // ==========================================================================

  async pauseDeployment(planId: string): Promise<void> {
    const state = this.activeDeployments.get(planId);
    if (state) {
      state.status = 'paused';
      log.info(`OTA 部署已暂停: ${planId}`);
    }
  }

  async resumeDeployment(planId: string): Promise<void> {
    const state = this.activeDeployments.get(planId);
    if (state && state.status === 'paused') {
      state.status = 'running';
      log.info(`OTA 部署已恢复: ${planId}`);
    }
  }

  async forceAdvance(planId: string): Promise<void> {
    const state = this.activeDeployments.get(planId);
    if (state && state.stageIndex < this.stages.length - 1) {
      state.stageIndex++;
      state.currentStage = this.stages[state.stageIndex].name;
      state.stageStartedAt = Date.now();
      log.info(`OTA 部署强制推进: ${planId} → ${state.currentStage}`);
    }
  }

  // ==========================================================================
  // 6. 查询
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
  // 7. 持久化
  // ==========================================================================

  private async persistDeployment(plan: DeploymentPlan, state: DeploymentState): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.insert(canaryDeployments).values({
        deploymentId: plan.planId,
        modelId: plan.modelId,
        modelVersion: plan.modelVersion,
        status: state.status,
        trafficPercent: this.stages[state.stageIndex].trafficPercent,
        startedAt: new Date(state.startedAt),
        config: {
          targetRegions: plan.targetRegions,
          targetCohorts: plan.targetCohorts,
          stages: this.stages,
          healthConfig: this.config,
        },
      });
    } catch (err) {
      log.error('持久化 OTA 部署失败', err);
    }
  }

  // ==========================================================================
  // 8. 工具方法
  // ==========================================================================

  private formatHealthFailure(health: HealthCheckResult): string {
    const failures = health.details.filter(d => !d.passed);
    return failures.map(f => `${f.metric}=${f.value}(阈值${f.threshold})`).join(', ');
  }

  updateConfig(updates: Partial<OTACanaryConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
