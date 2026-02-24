/**
 * ============================================================================
 * Dojo Training Scheduler (E35)
 * ============================================================================
 *
 * 借鉴 Tesla Dojo 训练调度：
 *   - Carbon-aware 调度（低碳窗口优先）
 *   - Spot 实例优先（成本优化）
 *   - 视频/序列数据优先（FSD 核心数据类型）
 *   - 多优先级队列
 *   - 训练任务生命周期管理
 *   - 资源预估和分配
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import { dojoTrainingJobs } from '../../../../drizzle/evolution-schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';
import { CarbonAwareClient } from '../../../lib/clients/carbon-aware.client';

const log = createModuleLogger('dojo-scheduler');

// ============================================================================
// 类型定义
// ============================================================================

export interface TrainingJob {
  id: string;
  name: string;
  modelId: string;
  /** 训练类型 */
  jobType: 'fine_tune' | 'full_train' | 'distillation' | 'rlfi' | 'auto_label';
  /** 数据类型优先级 */
  dataType: 'video' | 'timeseries' | 'tabular' | 'mixed';
  /** 预估训练时长 (ms) */
  estimatedDurationMs: number;
  /** 数据集大小 (MB) */
  datasetSizeMB: number;
  /** 优先级 (1=最高, 5=最低) */
  priority: 1 | 2 | 3 | 4 | 5;
  /** 资源需求 */
  resources: ResourceRequirement;
  /** 训练配置 */
  config: Record<string, unknown>;
  /** 提交时间 */
  submittedAt: number;
  /** 提交者 */
  submittedBy: string;
}

export interface ResourceRequirement {
  gpus: number;
  cpuCores: number;
  memoryGB: number;
  storageGB: number;
  preferSpot: boolean;
}

export interface ScheduledJob {
  job: TrainingJob;
  scheduledAt: number;
  estimatedStartAt: number;
  estimatedEndAt: number;
  carbonIntensity: number;
  costEstimate: CostEstimate;
  resourceAllocation: ResourceAllocation;
  status: 'queued' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface CostEstimate {
  onDemandCost: number;
  spotCost: number;
  selectedCost: number;
  useSpot: boolean;
  currency: string;
}

export interface ResourceAllocation {
  gpus: number;
  gpuType: string;
  cpuCores: number;
  memoryGB: number;
  storageGB: number;
  isSpot: boolean;
  region: string;
}

export interface CarbonWindow {
  start: number;
  end: number;
  carbonIntensity: number; // gCO2/kWh
  region: string;
  renewable: number; // 可再生能源比例 (0-1)
}

export interface SchedulerConfig {
  /** 是否启用 Carbon-aware 调度 */
  enableCarbonAware: boolean;
  /** 碳强度阈值 (gCO2/kWh) */
  carbonThreshold: number;
  /** 是否优先使用 Spot 实例 */
  preferSpot: boolean;
  /** Spot 实例折扣率 */
  spotDiscount: number;
  /** 最大并行训练任务数 */
  maxParallelJobs: number;
  /** 视频数据优先级加成 */
  videoPriorityBoost: number;
  /** GPU 单价 ($/hour) */
  gpuHourlyRate: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: SchedulerConfig = {
  enableCarbonAware: true,
  carbonThreshold: 200, // gCO2/kWh
  preferSpot: true,
  spotDiscount: 0.3, // 70% 折扣
  maxParallelJobs: 4,
  videoPriorityBoost: 2,
  gpuHourlyRate: 2.5,
};

// ============================================================================
// Dojo Training Scheduler
// ============================================================================

export class DojoTrainingScheduler {
  private config: SchedulerConfig;
  private eventBus: EventBus;

  /** 任务队列 */
  private jobQueue: ScheduledJob[] = [];

  /** 运行中的任务 */
  private runningJobs: Map<string, ScheduledJob> = new Map();

  /** 已完成的任务 */
  private completedJobs: ScheduledJob[] = [];
  private readonly MAX_COMPLETED = 200;

  private carbonClient: CarbonAwareClient;

  constructor(config: Partial<SchedulerConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
    this.carbonClient = new CarbonAwareClient();
  }

  // ==========================================================================
  // 0. P2 修复：启动时从 DB 恢复任务队列
  // ==========================================================================

  /**
   * 初始化：从 DB 恢复未完成的任务
   * 应在服务启动时调用
   */
  async initialize(): Promise<void> {
    const db = await getDb();
    if (!db) {
      log.warn('数据库不可用，跳过任务队列恢复');
      return;
    }

    try {
      // 恢复 pending 和 scheduled 状态的任务到队列
      const pendingRows = await db.select().from(dojoTrainingJobs)
        .where(inArray(dojoTrainingJobs.status, ['pending', 'scheduled']))
        .orderBy(dojoTrainingJobs.priority, dojoTrainingJobs.createdAt);

      for (const row of pendingRows) {
        const job: TrainingJob = {
          id: row.jobId,
          name: row.name,
          modelId: row.modelId,
          jobType: (row.config as any)?.jobType ?? 'fine_tune',
          dataType: (row.config as any)?.dataType ?? 'mixed',
          estimatedDurationMs: row.estimatedDurationMs ?? 3600000,
          datasetSizeMB: (row.config as any)?.datasetSizeMB ?? 0,
          priority: (row.priority ?? 5) as TrainingJob['priority'],
          resources: (row.config as any)?.resources ?? { gpus: 8, cpuCores: 32, memoryGB: 128, storageGB: 500, preferSpot: true },
          config: (row.config as any)?.trainConfig ?? {},
          submittedAt: row.createdAt.getTime(),
          submittedBy: (row.config as any)?.submittedBy ?? 'system',
        };

        const scheduledJob: ScheduledJob = {
          job,
          scheduledAt: row.scheduledAt?.getTime() ?? Date.now(),
          estimatedStartAt: row.scheduledAt?.getTime() ?? Date.now(),
          estimatedEndAt: (row.scheduledAt?.getTime() ?? Date.now()) + (row.estimatedDurationMs ?? 3600000),
          carbonIntensity: (row.carbonWindow as any)?.carbonIntensity ?? 200,
          costEstimate: (row.config as any)?.costEstimate ?? { onDemandCost: 0, spotCost: 0, selectedCost: 0, useSpot: true, currency: 'USD' },
          resourceAllocation: (row.config as any)?.resourceAllocation ?? { gpus: 8, gpuType: 'A100-40GB', cpuCores: 32, memoryGB: 128, storageGB: 500, isSpot: true, region: 'default' },
          status: row.status as ScheduledJob['status'],
        };

        this.insertIntoQueue(scheduledJob);
      }

      // 恢复 running 状态的任务（标记为需要重新检查）
      const runningRows = await db.select().from(dojoTrainingJobs)
        .where(eq(dojoTrainingJobs.status, 'running'));

      if (runningRows.length > 0) {
        log.warn(`发现 ${runningRows.length} 个运行中的任务，可能需要重新检查状态`);
        // 将崩溃时运行中的任务重新放入队列
        for (const row of runningRows) {
          await db.update(dojoTrainingJobs)
            .set({ status: 'pending', retryCount: (row.retryCount ?? 0) + 1 })
            .where(eq(dojoTrainingJobs.id, row.id));
        }
      }

      log.info(`从 DB 恢复任务队列: ${pendingRows.length} 个待执行, ${runningRows.length} 个重新排队`);
    } catch (err) {
      log.error('从 DB 恢复任务队列失败', err);
    }
  }

  // ==========================================================================
  // 1. 提交训练任务
  // ==========================================================================

  async schedule(job: TrainingJob): Promise<ScheduledJob> {
    // 查找最优调度窗口
    const carbonWindow = this.config.enableCarbonAware
      ? await this.findLowCarbonWindow(job.estimatedDurationMs)
      : this.getDefaultWindow(job.estimatedDurationMs);

    // 计算成本
    const costEstimate = this.estimateCost(job, carbonWindow);

    // 分配资源
    const resourceAllocation = this.allocateResources(job, carbonWindow);

    // 计算优先级（视频数据加成）
    const effectivePriority = job.dataType === 'video'
      ? Math.max(1, job.priority - this.config.videoPriorityBoost) as TrainingJob['priority']
      : job.priority;

    const scheduledJob: ScheduledJob = {
      job: { ...job, priority: effectivePriority },
      scheduledAt: Date.now(),
      estimatedStartAt: carbonWindow.start,
      estimatedEndAt: carbonWindow.start + job.estimatedDurationMs,
      carbonIntensity: carbonWindow.carbonIntensity,
      costEstimate,
      resourceAllocation,
      status: 'scheduled',
    };

    // 插入队列（按优先级排序）
    this.insertIntoQueue(scheduledJob);

    // DB 持久化
    await this.persistSchedule(scheduledJob);

    // EventBus
    await this.eventBus.publish('dojo.job.scheduled', {
        jobId: job.id,
        jobType: job.jobType,
        dataType: job.dataType,
        priority: effectivePriority,
        estimatedStartAt: carbonWindow.start,
        carbonIntensity: carbonWindow.carbonIntensity,
        costEstimate: costEstimate.selectedCost,
        useSpot: costEstimate.useSpot,
      }, { source: 'dojo-training-scheduler' });

    log.info(`训练任务已调度: ${job.id} (${job.jobType}), 优先级 ${effectivePriority}, 预计 ${new Date(carbonWindow.start).toISOString()} 启动`);
    return scheduledJob;
  }

  // ==========================================================================
  // 2. Carbon-Aware 窗口查找
  // ==========================================================================

  /**
   * P2 修复：接入 CarbonAwareClient 获取真实碳强度数据
   * 降级策略：API 不可用时使用基于太阳能的确定性估算
   */
  private async findLowCarbonWindow(durationMs: number): Promise<CarbonWindow> {
    const now = Date.now();
    const windows: CarbonWindow[] = [];

    try {
      // 尝试从 CarbonAwareClient 获取真实数据
      const forecast = await (this.carbonClient as any).getForecast(48);

      if (forecast && forecast.length > 0) {
        for (const entry of forecast) {
          windows.push({
            start: entry.timestamp instanceof Date ? entry.timestamp.getTime() : entry.timestamp,
            end: (entry.timestamp instanceof Date ? entry.timestamp.getTime() : entry.timestamp) + durationMs,
            carbonIntensity: entry.intensity,
            region: entry.region,
            renewable: 0 /* renewablePercentage not available */,
          });
        }
        log.info(`从 CarbonAwareClient 获取 ${forecast.length} 个碳强度预测窗口`);
      }
    } catch (err) {
      log.warn('CarbonAwareClient 不可用，使用确定性估算', err);
    }

    // 降级：基于太阳能的确定性估算（无随机数）
    if (windows.length === 0) {
      for (let hour = 0; hour < 48; hour++) {
        const start = now + hour * 3600000;
        const hourOfDay = new Date(start).getUTCHours();
        // 确定性太阳能模型：日间 8-18 点碳强度低
        const isSolar = hourOfDay >= 8 && hourOfDay <= 18;
        const solarFactor = isSolar
          ? Math.sin(Math.PI * (hourOfDay - 8) / 10) // 午间峰值
          : 0;
        const carbonIntensity = 300 - solarFactor * 200; // 100-300 gCO2/kWh
        const renewable = 0.2 + solarFactor * 0.5;       // 20%-70%

        windows.push({
          start,
          end: start + durationMs,
          carbonIntensity,
          region: 'default',
          renewable,
        });
      }
    }

    // 选择碳强度最低的窗口
    const bestWindow = windows
      .filter(w => w.carbonIntensity < this.config.carbonThreshold)
      .sort((a, b) => a.carbonIntensity - b.carbonIntensity)[0];

    return bestWindow ?? windows.sort((a, b) => a.carbonIntensity - b.carbonIntensity)[0];
  }

  private getDefaultWindow(durationMs: number): CarbonWindow {
    return {
      start: Date.now(),
      end: Date.now() + durationMs,
      carbonIntensity: 200,
      region: 'default',
      renewable: 0.3,
    };
  }

  // ==========================================================================
  // 3. 成本估算
  // ==========================================================================

  private estimateCost(job: TrainingJob, window: CarbonWindow): CostEstimate {
    const hours = job.estimatedDurationMs / 3600000;
    const gpuHours = hours * job.resources.gpus;
    const onDemandCost = gpuHours * this.config.gpuHourlyRate;
    const spotCost = onDemandCost * this.config.spotDiscount;

    const useSpot = this.config.preferSpot && job.resources.preferSpot;

    return {
      onDemandCost: Math.round(onDemandCost * 100) / 100,
      spotCost: Math.round(spotCost * 100) / 100,
      selectedCost: Math.round((useSpot ? spotCost : onDemandCost) * 100) / 100,
      useSpot,
      currency: 'USD',
    };
  }

  // ==========================================================================
  // 4. 资源分配
  // ==========================================================================

  private allocateResources(job: TrainingJob, window: CarbonWindow): ResourceAllocation {
    // GPU 类型选择
    let gpuType = 'A100-40GB';
    if (job.dataType === 'video' && job.datasetSizeMB > 10000) {
      gpuType = 'A100-80GB';
    } else if (job.jobType === 'distillation') {
      gpuType = 'A10G';
    }

    return {
      gpus: job.resources.gpus,
      gpuType,
      cpuCores: job.resources.cpuCores,
      memoryGB: job.resources.memoryGB,
      storageGB: job.resources.storageGB,
      isSpot: this.config.preferSpot && job.resources.preferSpot,
      region: window.region,
    };
  }

  // ==========================================================================
  // 5. 队列管理
  // ==========================================================================

  private insertIntoQueue(scheduledJob: ScheduledJob): void {
    // 按优先级 + 提交时间排序插入
    const insertIndex = this.jobQueue.findIndex(
      j => j.job.priority > scheduledJob.job.priority ||
        (j.job.priority === scheduledJob.job.priority && j.scheduledAt > scheduledJob.scheduledAt),
    );

    if (insertIndex === -1) {
      this.jobQueue.push(scheduledJob);
    } else {
      this.jobQueue.splice(insertIndex, 0, scheduledJob);
    }
  }

  async startNextJob(): Promise<ScheduledJob | null> {
    if (this.runningJobs.size >= this.config.maxParallelJobs) {
      log.debug('并行任务已满，等待空闲');
      return null;
    }

    const nextJob = this.jobQueue.shift();
    if (!nextJob) return null;

    nextJob.status = 'running';
    this.runningJobs.set(nextJob.job.id, nextJob);

    // P2 修复：同步状态到 DB
    await this.updateJobStatus(nextJob.job.id, 'running');

    await this.eventBus.publish('dojo.job.started', { jobId: nextJob.job.id, jobType: nextJob.job.jobType }, { source: 'dojo-training-scheduler' });

    log.info(`训练任务启动: ${nextJob.job.id}`);
    return nextJob;
  }

  async completeJob(jobId: string, success: boolean, result?: Record<string, unknown>): Promise<void> {
    const job = this.runningJobs.get(jobId);
    if (!job) return;

    job.status = success ? 'completed' : 'failed';
    this.runningJobs.delete(jobId);
    this.completedJobs.push(job);

    // P2 修复：同步状态到 DB
    await this.updateJobStatus(jobId, job.status, result ? { result } : undefined);

    if (this.completedJobs.length > this.MAX_COMPLETED) {
      this.completedJobs = this.completedJobs.slice(-this.MAX_COMPLETED);
    }

    await this.eventBus.publish(success ? 'dojo.job.completed' : 'dojo.job.failed', { jobId, status: job.status }, { source: 'dojo-training-scheduler' });

    log.info(`训练任务${success ? '完成' : '失败'}: ${jobId}`);
  }

  async cancelJob(jobId: string): Promise<boolean> {
    // 从队列中移除
    const queueIndex = this.jobQueue.findIndex(j => j.job.id === jobId);
    if (queueIndex !== -1) {
      this.jobQueue.splice(queueIndex, 1);
      return true;
    }

    // 从运行中取消
    const running = this.runningJobs.get(jobId);
    if (running) {
      running.status = 'cancelled';
      this.runningJobs.delete(jobId);
      this.completedJobs.push(running);
      return true;
    }

    return false;
  }

  // ==========================================================================
  // 6. 查询
  // ==========================================================================

  getQueueStatus(): {
    queued: number;
    running: number;
    completed: number;
    maxParallel: number;
    jobs: ScheduledJob[];
  } {
    return {
      queued: this.jobQueue.length,
      running: this.runningJobs.size,
      completed: this.completedJobs.length,
      maxParallel: this.config.maxParallelJobs,
      jobs: [
        ...this.jobQueue,
        ...Array.from(this.runningJobs.values()),
      ],
    };
  }

  getRunningJobs(): ScheduledJob[] {
    return Array.from(this.runningJobs.values());
  }

  getCompletedJobs(limit = 20): ScheduledJob[] {
    return this.completedJobs.slice(-limit);
  }

  // ==========================================================================
  // 7. 持久化
  // ==========================================================================

  /**
   * P2 修复：使用 dojoTrainingJobs 表持久化（替代 evolutionFlywheelSchedules）
   * 支持幂等 key 防止重复插入
   */
  private async persistSchedule(scheduledJob: ScheduledJob): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.insert(dojoTrainingJobs).values({
        jobId: scheduledJob.job.id,
        name: scheduledJob.job.name,
        modelId: scheduledJob.job.modelId,
        status: scheduledJob.status === 'queued' ? 'pending' : scheduledJob.status as any,
        priority: scheduledJob.job.priority,
        gpuCount: scheduledJob.resourceAllocation.gpus,
        useSpot: scheduledJob.resourceAllocation.isSpot ? 1 : 0,
        estimatedDurationMs: scheduledJob.job.estimatedDurationMs,
        scheduledAt: new Date(scheduledJob.estimatedStartAt),
        carbonWindow: {
          carbonIntensity: scheduledJob.carbonIntensity,
          region: scheduledJob.resourceAllocation.region,
        },
        config: {
          jobType: scheduledJob.job.jobType,
          dataType: scheduledJob.job.dataType,
          datasetSizeMB: scheduledJob.job.datasetSizeMB,
          resources: scheduledJob.job.resources,
          trainConfig: scheduledJob.job.config,
          costEstimate: scheduledJob.costEstimate,
          resourceAllocation: scheduledJob.resourceAllocation,
          submittedBy: scheduledJob.job.submittedBy,
        },
        idempotencyKey: `dojo_${scheduledJob.job.id}`,
      });
    } catch (err: any) {
      // 幂等检查：如果是唯一索引冲突，说明已存在
      if (err?.code === 'ER_DUP_ENTRY') {
        log.info(`训练任务已存在（幂等）: ${scheduledJob.job.id}`);
        return;
      }
      log.error('持久化训练调度失败', err);
    }
  }

  /**
   * P2 修复：任务状态变更时同步到 DB
   */
  private async updateJobStatus(jobId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const updates: Record<string, unknown> = { status, updatedAt: new Date() };
      if (status === 'running') updates.startedAt = new Date();
      if (status === 'completed' || status === 'failed') updates.completedAt = new Date();
      if (extra) Object.assign(updates, extra);

      await db.update(dojoTrainingJobs)
        .set(updates as any)
        .where(eq(dojoTrainingJobs.jobId, jobId));
    } catch (err) {
      log.error(`更新任务状态失败: ${jobId}`, err);
    }
  }

  updateConfig(updates: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
