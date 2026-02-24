/**
 * 进化引擎 EventBus 业务消费者
 *
 * 监听进化事件后触发实际业务动作，形成事件驱动的闭环：
 *
 * 1. intervention.detected → 自动创建仿真场景 + 触发 Auto-Labeling
 * 2. canary.stage.completed → 推进部署阶段 / 触发飞轮周期
 * 3. canary.rollback → 记录回滚事件 + 通知告警
 * 4. flywheel.cycle.completed → 更新干预率指标 + 触发趋势分析
 * 5. shadow.divergence.high → 自动难例挖掘
 *
 * 架构位置: server/platform/evolution/audit/
 * 依赖: EventBus, HighFidelitySimulationEngine, AutoLabelingPipeline, FSDMetrics
 */

import { subscribe } from '../../../services/eventBus.service';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('evo-event-consumers');

// ============================================================
// 类型定义
// ============================================================

interface EventConsumerConfig {
  /** 是否启用干预事件消费 */
  enableInterventionConsumer: boolean;
  /** 是否启用部署事件消费 */
  enableDeploymentConsumer: boolean;
  /** 是否启用飞轮事件消费 */
  enableFlywheelConsumer: boolean;
  /** 是否启用影子分歧事件消费 */
  enableDivergenceConsumer: boolean;
  /** 仿真场景生成的最大并发数 */
  maxConcurrentSimCreation: number;
  /** 事件处理失败后的重试次数 */
  maxRetries: number;
  /** 重试间隔(ms) */
  retryDelayMs: number;
}

const DEFAULT_CONFIG: EventConsumerConfig = {
  enableInterventionConsumer: true,
  enableDeploymentConsumer: true,
  enableFlywheelConsumer: true,
  enableDivergenceConsumer: true,
  maxConcurrentSimCreation: 5,
  maxRetries: 3,
  retryDelayMs: 2000,
};

// ============================================================
// 业务消费者注册器
// ============================================================

export class EvolutionEventConsumers {
  private config: EventConsumerConfig;
  private unsubscribers: Array<() => void> = [];
  private pendingSimCreations = 0;
  private started = false;

  constructor(config: Partial<EventConsumerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动所有业务消费者
   */
  start(): void {
    if (this.started) {
      log.warn('业务消费者已启动，跳过重复启动');
      return;
    }

    if (this.config.enableInterventionConsumer) {
      this.registerInterventionConsumer();
    }

    if (this.config.enableDeploymentConsumer) {
      this.registerDeploymentConsumer();
    }

    if (this.config.enableFlywheelConsumer) {
      this.registerFlywheelConsumer();
    }

    if (this.config.enableDivergenceConsumer) {
      this.registerDivergenceConsumer();
    }

    this.started = true;
    log.info(`进化引擎业务消费者已启动，注册 ${this.unsubscribers.length} 个事件监听器`);
  }

  /**
   * 停止所有业务消费者
   */
  stop(): void {
    for (const unsub of this.unsubscribers) {
      try {
        unsub();
      } catch (err) {
        log.warn('取消订阅失败', err);
      }
    }
    this.unsubscribers = [];
    this.started = false;
    log.info('进化引擎业务消费者已停止');
  }

  // ============================================================
  // 1. 干预事件消费者
  // ============================================================

  private registerInterventionConsumer(): void {
    const unsub = subscribe('intervention.detected', async (event: any) => {
      const { trajectory, divergence } = event.payload || {};
      if (!trajectory) return;

      log.info(`[干预消费者] 检测到干预事件，分歧度=${divergence?.toFixed(4)}，开始处理`);

      // 1a. 异步创建仿真场景（限制并发）
      if (this.pendingSimCreations < this.config.maxConcurrentSimCreation) {
        this.pendingSimCreations++;
        this.withRetry(
          () => this.createSimulationFromIntervention(trajectory),
          '创建仿真场景',
        ).finally(() => {
          this.pendingSimCreations--;
        });
      } else {
        log.warn('[干预消费者] 仿真场景创建并发已满，跳过');
      }

      // 1b. 异步触发 Auto-Labeling
      this.withRetry(
        () => this.triggerAutoLabeling(trajectory),
        'Auto-Labeling',
      );
    });
    this.unsubscribers.push(unsub);
  }

  private async createSimulationFromIntervention(trajectory: any): Promise<void> {
    try {
      // 延迟导入避免循环依赖
      const { HighFidelitySimulationEngine } = await import('../simulation/simulation-engine');
      const engine = new HighFidelitySimulationEngine();
      // @ts-ignore
      const scenario = await engine.createScenarioFromIntervention({
        id: trajectory.sessionId,
        requestData: trajectory.request,
        humanDecision: trajectory.humanDecision,
        shadowDecision: trajectory.shadowDecision,
      });
      log.info(`[干预消费者] 仿真场景已创建: ${scenario.id}，变异数=${scenario.variations?.length || 0}`);
    } catch (err) {
      log.error('[干预消费者] 创建仿真场景失败', err);
      throw err; // 让 withRetry 捕获
    }
  }

  private async triggerAutoLabeling(trajectory: any): Promise<void> {
    try {
      const { AutoLabelingPipeline } = await import('../fsd/auto-labeling-pipeline');
      const pipeline = new AutoLabelingPipeline();
      const result = await pipeline.labelTrajectory(trajectory);
      log.info(`[干预消费者] Auto-Labeling 完成: label=${result.autoLabel?.severity}`);
    } catch (err) {
      log.error('[干预消费者] Auto-Labeling 失败', err);
      throw err;
    }
  }

  // ============================================================
  // 2. 部署事件消费者
  // ============================================================

  private registerDeploymentConsumer(): void {
    // 部署阶段完成
    const unsub1 = subscribe('canary.stage.completed', async (event: any) => {
      const { deploymentId, stage, modelId } = event.payload || {};
      log.info(`[部署消费者] 部署 ${deploymentId} 阶段 ${stage} 完成，模型=${modelId}`);

      // 如果是最终阶段（full），触发飞轮周期
      if (stage === 'full' || stage === 'production') {
        log.info('[部署消费者] 全量部署完成，触发飞轮周期');
        this.withRetry(
          () => this.triggerFlywheelAfterDeployment(deploymentId, modelId),
          '部署后飞轮触发',
        );
      }
    });
    this.unsubscribers.push(unsub1);

    // 部署回滚
    const unsub2 = subscribe('canary.rollback', async (event: any) => {
      const { deploymentId, stage, reason } = event.payload || {};
      log.warn(`[部署消费者] 部署 ${deploymentId} 在阶段 ${stage} 回滚，原因: ${reason}`);

      // 回滚后更新干预率指标
      this.withRetry(
        () => this.recordRollbackMetrics(deploymentId, stage, reason),
        '回滚指标记录',
      );
    });
    this.unsubscribers.push(unsub2);
  }

  private async triggerFlywheelAfterDeployment(deploymentId: string, modelId: string): Promise<void> {
    try {
      const { FSDMetrics } = await import('../fsd/fsd-metrics');
      FSDMetrics.canaryDeployments.inc('completed');
      log.info(`[部署消费者] 飞轮触发信号已发送: deployment=${deploymentId}`);
    } catch (err) {
      log.error('[部署消费者] 飞轮触发失败', err);
      throw err;
    }
  }

  private async recordRollbackMetrics(deploymentId: string, stage: string, reason: string): Promise<void> {
    try {
      const { FSDMetrics } = await import('../fsd/fsd-metrics');
      FSDMetrics.canaryDeployments.inc('rolled_back');
      log.info(`[部署消费者] 回滚指标已记录: deployment=${deploymentId}, stage=${stage}`);
    } catch (err) {
      log.error('[部署消费者] 回滚指标记录失败', err);
      throw err;
    }
  }

  // ============================================================
  // 3. 飞轮事件消费者
  // ============================================================

  private registerFlywheelConsumer(): void {
    const unsub = subscribe('flywheel.cycle.completed', async (event: any) => {
      const { cycleId, report } = event.payload || {};
      log.info(`[飞轮消费者] 飞轮周期 ${cycleId} 完成，结果: ${report?.recommendation || 'unknown'}`);

      // 更新全局干预率指标
      this.withRetry(
        () => this.updateGlobalMetrics(report),
        '全局指标更新',
      );
    });
    this.unsubscribers.push(unsub);
  }

  private async updateGlobalMetrics(report: any): Promise<void> {
    try {
      const { FSDMetrics } = await import('../fsd/fsd-metrics');
      if (report?.trendAnalysis) {
        const trend = report.trendAnalysis;
        if (typeof trend.currentRate === 'number') {
          FSDMetrics.interventionRate.set(trend.currentRate);
        }
        if (typeof trend.accuracy === 'number') {
          FSDMetrics.worldModelAccuracy.set(trend.accuracy);
        }
      }
      FSDMetrics.flywheelCycles.inc((report?.recommendation as any) || 'completed');
      log.info('[飞轮消费者] 全局指标已更新');
    } catch (err) {
      log.error('[飞轮消费者] 全局指标更新失败', err);
      throw err;
    }
  }

  // ============================================================
  // 4. 影子分歧事件消费者
  // ============================================================

  private registerDivergenceConsumer(): void {
    const unsub = subscribe('shadow.divergence.high', async (event: any) => {
      const { trajectory, divergenceScore } = event.payload || {};
      log.warn(`[分歧消费者] 高分歧事件: score=${divergenceScore?.toFixed(4)}`);

      // 触发难例挖掘 — 将高分歧轨迹标记为难例
      if (trajectory) {
        this.withRetry(
          () => this.markAsHardCase(trajectory, divergenceScore),
          '难例标记',
        );
      }
    });
    this.unsubscribers.push(unsub);
  }

  private async markAsHardCase(trajectory: any, divergenceScore: number): Promise<void> {
    try {
      const { getProtectedDb } = await import('../infra/protected-clients');
      const { evolutionInterventions } = await import('../../../../drizzle/evolution-schema');
      const { eq } = await import('drizzle-orm');
      const db = await getProtectedDb();
      if (!db || !trajectory.sessionId) return;

      // 更新干预记录的难度标记
      await db.update(evolutionInterventions)
        .set({
          divergenceScore: divergenceScore,
        })
        .where(eq(evolutionInterventions.sessionId, trajectory.sessionId));

      log.info(`[分歧消费者] 难例已标记: session=${trajectory.sessionId}, score=${divergenceScore.toFixed(4)}`);
    } catch (err) {
      log.error('[分歧消费者] 难例标记失败', err);
      throw err;
    }
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 带重试的异步操作执行器
   */
  private async withRetry(
    fn: () => Promise<void>,
    operationName: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        if (attempt === this.config.maxRetries) {
          log.error(`[重试] ${operationName} 在 ${this.config.maxRetries} 次重试后仍然失败`, err);
          return; // 最终失败不抛异常，避免阻塞事件循环
        }
        log.warn(`[重试] ${operationName} 第 ${attempt} 次失败，${this.config.retryDelayMs}ms 后重试`);
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
      }
    }
  }
}
