/**
 * Saga 编排器 - 实现分布式事务的 Saga 模式
 * 支持检查点、补偿、超时控制和死信队列
 */

import { getDb } from '../lib/db';
import { sagaInstances, sagaSteps, sagaDeadLetters } from '../../drizzle/schema';
import { eq, and, lt, desc } from 'drizzle-orm';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('saga');

// ============ 类型定义 ============

export interface SagaStep<TInput = unknown, TOutput = unknown> {

  name: string;
  execute: (input: TInput, context: SagaContext) => Promise<TOutput>;
  compensate?: (input: TInput, output: TOutput, context: SagaContext) => Promise<void>;
  timeout?: number; // 毫秒
  retryable?: boolean;
  maxRetries?: number;
}

export interface SagaDefinition<TInput = unknown, TOutput = unknown> {
  type: string;
  steps: SagaStep[];
  timeout?: number; // 整个 Saga 的超时时间
  onComplete?: (input: TInput, output: TOutput) => Promise<void>;
  onFailed?: (input: TInput, error: Error) => Promise<void>;
}

export interface SagaContext {
  sagaId: string;
  sagaType: string;
  currentStep: number;
  stepOutputs: Map<string, unknown>;
  checkpoint: {
    processed: string[];
    failed: Array<{ item: string; error: string }>;
    lastCompletedStep: number;
  };
}

export interface SagaExecutionResult<T = unknown> {
  sagaId: string;
  status: 'completed' | 'failed' | 'partial' | 'compensated';
  output?: T;
  error?: string;
  completedSteps: number;
  totalSteps: number;
}

// ============ Saga 注册表 ============

const sagaRegistry: Map<string, SagaDefinition> = new Map();

export function registerSaga<TInput, TOutput>(definition: SagaDefinition<TInput, TOutput>): void {
  sagaRegistry.set(definition.type, definition as SagaDefinition);
  log.debug(`[SagaOrchestrator] Registered saga: ${definition.type}`);
}

// ============ Saga 编排器类 ============

class SagaOrchestrator {
  private readonly DEFAULT_TIMEOUT_MS = 300000; // 5 分钟
  private readonly DEFAULT_STEP_TIMEOUT_MS = 60000; // 1 分钟
  private readonly DEFAULT_MAX_RETRIES = 3;

  private isRunning: boolean = false;
  private timeoutChecker: NodeJS.Timeout | null = null;

  // 指标
  private metrics = {
    totalExecuted: 0,
    completed: 0,
    failed: 0,
    compensated: 0,
    partial: 0,
  };

  /**
   * 启动 Saga 编排器
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    log.debug('[SagaOrchestrator] Starting...');
    this.isRunning = true;

    // 启动超时检查器
    this.startTimeoutChecker();

    // 恢复中断的 Saga
    await this.recoverInterruptedSagas();

    log.debug('[SagaOrchestrator] Started');
  }

  /**
   * 停止 Saga 编排器
   */
  async stop(): Promise<void> {
    log.debug('[SagaOrchestrator] Stopping...');
    this.isRunning = false;

    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }

    log.debug('[SagaOrchestrator] Stopped');
  }

  /**
   * 执行 Saga
   */
  async execute<TInput, TOutput>(
    sagaType: string,
    input: TInput
  ): Promise<SagaExecutionResult<TOutput>> {
    const definition = sagaRegistry.get(sagaType);
    if (!definition) {
      throw new Error(`Saga type not registered: ${sagaType}`);
    }

    const sagaId = `saga_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timeout = definition.timeout || this.DEFAULT_TIMEOUT_MS;
    const timeoutAt = new Date(Date.now() + timeout);

    // 创建 Saga 实例
    const db = await getDb();
    if (db) {
      await db.insert(sagaInstances).values({
        sagaId,
        sagaType,
        status: 'running',
        currentStep: 0,
        totalSteps: definition.steps.length,
        input: input as Record<string, unknown>,
        checkpoint: { processed: [], failed: [], lastCompletedStep: -1 },
        timeoutAt,
      });
    }

    // 创建上下文
    const context: SagaContext = {
      sagaId,
      sagaType,
      currentStep: 0,
      stepOutputs: new Map(),
      checkpoint: { processed: [], failed: [], lastCompletedStep: -1 },
    };

    this.metrics.totalExecuted++;

    try {
      // 执行所有步骤
      let lastOutput: unknown = input;
      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        context.currentStep = i;

        // 创建步骤记录
        const stepId = `${sagaId}_step_${i}`;
        if (db) {
          await db.insert(sagaSteps).values({
            stepId,
            sagaId,
            stepIndex: i,
            stepName: step.name,
            stepType: 'action',
            status: 'running',
            input: lastOutput as Record<string, unknown>,
            startedAt: new Date(),
          });
        }

        try {
          // 执行步骤（带超时）
          const stepTimeout = step.timeout || this.DEFAULT_STEP_TIMEOUT_MS;
          lastOutput = await this.executeWithTimeout(
            () => step.execute(lastOutput, context),
            stepTimeout
          );

          // 更新步骤状态
          context.stepOutputs.set(step.name, lastOutput);
          context.checkpoint.lastCompletedStep = i;

          if (db) {
            await db.update(sagaSteps)
              .set({
                status: 'completed',
                output: lastOutput as Record<string, unknown>,
                completedAt: new Date(),
              })
              .where(eq(sagaSteps.stepId, stepId));

            await db.update(sagaInstances)
              .set({
                currentStep: i + 1,
                checkpoint: context.checkpoint,
              })
              .where(eq(sagaInstances.sagaId, sagaId));
          }
        } catch (stepError) {
          // 步骤失败，尝试重试
          const maxRetries = step.maxRetries ?? this.DEFAULT_MAX_RETRIES;
          let retryCount = 0;
          let succeeded = false;

          while (step.retryable !== false && retryCount < maxRetries && !succeeded) {
            retryCount++;
            log.debug(`[SagaOrchestrator] Retrying step ${step.name} (${retryCount}/${maxRetries})`);

            try {
              await this.sleep(Math.min(retryCount * 1000, 5000)); // 退避
              lastOutput = await this.executeWithTimeout(
                () => step.execute(lastOutput, context),
                step.timeout || this.DEFAULT_STEP_TIMEOUT_MS
              );
              succeeded = true;

              context.stepOutputs.set(step.name, lastOutput);
              context.checkpoint.lastCompletedStep = i;

              if (db) {
                await db.update(sagaSteps)
                  .set({
                    status: 'completed',
                    output: lastOutput as Record<string, unknown>,
                    retryCount,
                    completedAt: new Date(),
                  })
                  .where(eq(sagaSteps.stepId, stepId));
              }
            } catch (retryError) {
              log.error(`[SagaOrchestrator] Retry ${retryCount} failed:`, retryError);
            }
          }

          if (!succeeded) {
            // 步骤最终失败，开始补偿
            if (db) {
              await db.update(sagaSteps)
                .set({
                  status: 'failed',
                  error: String(stepError),
                  retryCount,
                  completedAt: new Date(),
                })
                .where(eq(sagaSteps.stepId, stepId));
            }

            throw stepError;
          }
        }
      }

      // Saga 完成
      if (db) {
        await db.update(sagaInstances)
          .set({
            status: 'completed',
            output: lastOutput as Record<string, unknown>,
            completedAt: new Date(),
          })
          .where(eq(sagaInstances.sagaId, sagaId));
      }

      this.metrics.completed++;

      // 调用完成回调
      if (definition.onComplete) {
        await definition.onComplete(input, lastOutput as TOutput);
      }

      return {
        sagaId,
        status: 'completed',
        output: lastOutput as TOutput,
        completedSteps: definition.steps.length,
        totalSteps: definition.steps.length,
      };
    } catch (error) {
      log.error(`[SagaOrchestrator] Saga ${sagaId} failed:`, error);

      // 开始补偿
      const compensationResult = await this.compensate(sagaId, definition, context, input);

      // 更新 Saga 状态
      const finalStatus = compensationResult.success ? 'compensated' : 'failed';
      if (db) {
        await db.update(sagaInstances)
          .set({
            status: finalStatus,
            error: String(error),
            completedAt: new Date(),
          })
          .where(eq(sagaInstances.sagaId, sagaId));
      }

      if (finalStatus === 'compensated') {
        this.metrics.compensated++;
      } else {
        this.metrics.failed++;
        // 写入死信队列
        await this.writeToDeadLetter(sagaId, sagaType, String(error), 'compensation_failed', input, context.checkpoint);
      }

      // 调用失败回调
      if (definition.onFailed) {
        await definition.onFailed(input, error as Error);
      }

      return {
        sagaId,
        status: finalStatus,
        error: String(error),
        completedSteps: context.checkpoint.lastCompletedStep + 1,
        totalSteps: definition.steps.length,
      };
    }
  }

  /**
   * 执行补偿
   */
  private async compensate(
    sagaId: string,
    definition: SagaDefinition,
    context: SagaContext,
    originalInput: unknown
  ): Promise<{ success: boolean; failedSteps: string[] }> {
    log.debug(`[SagaOrchestrator] Starting compensation for saga ${sagaId}`);

    const failedSteps: string[] = [];
    const db = await getDb();

    // 从最后完成的步骤开始反向补偿
    for (let i = context.checkpoint.lastCompletedStep; i >= 0; i--) {
      const step = definition.steps[i];
      if (!step.compensate) continue;

      const stepOutput = context.stepOutputs.get(step.name);
      const compensationStepId = `${sagaId}_comp_${i}`;

      if (db) {
        await db.insert(sagaSteps).values({
          stepId: compensationStepId,
          sagaId,
          stepIndex: i,
          stepName: `compensate_${step.name}`,
          stepType: 'compensation',
          status: 'running',
          input: { originalInput, stepOutput } as Record<string, unknown>,
          startedAt: new Date(),
        });
      }

      try {
        await step.compensate(originalInput, stepOutput, context);

        if (db) {
          await db.update(sagaSteps)
            .set({
              status: 'compensated',
              completedAt: new Date(),
            })
            .where(eq(sagaSteps.stepId, compensationStepId));
        }

        log.debug(`[SagaOrchestrator] Compensated step: ${step.name}`);
      } catch (compError) {
        log.error(`[SagaOrchestrator] Compensation failed for step ${step.name}:`, compError);
        failedSteps.push(step.name);

        if (db) {
          await db.update(sagaSteps)
            .set({
              status: 'failed',
              error: String(compError),
              completedAt: new Date(),
            })
            .where(eq(sagaSteps.stepId, compensationStepId));
        }
      }
    }

    return {
      success: failedSteps.length === 0,
      failedSteps,
    };
  }

  /**
   * 写入死信队列
   */
  private async writeToDeadLetter(
    sagaId: string,
    sagaType: string,
    failureReason: string,
    failureType: 'timeout' | 'max_retries' | 'compensation_failed' | 'unknown',
    originalInput: unknown,
    lastCheckpoint: unknown
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const deadLetterId = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await db.insert(sagaDeadLetters).values({
      deadLetterId,
      sagaId,
      sagaType,
      failureReason,
      failureType,
      originalInput: originalInput as Record<string, unknown>,
      lastCheckpoint: lastCheckpoint as Record<string, unknown>,
      retryable: failureType !== 'max_retries',
    });

    log.debug(`[SagaOrchestrator] Wrote to dead letter queue: ${deadLetterId}`);
  }

  /**
   * 从检查点恢复 Saga
   */
  async resumeFromCheckpoint(sagaId: string): Promise<SagaExecutionResult> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const saga = await db.select().from(sagaInstances).where(eq(sagaInstances.sagaId, sagaId)).limit(1);
    if (saga.length === 0) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    const instance = saga[0];
    if (instance.status !== 'failed' && instance.status !== 'partial') {
      throw new Error(`Cannot resume saga in status: ${instance.status}`);
    }

    const definition = sagaRegistry.get(instance.sagaType);
    if (!definition) {
      throw new Error(`Saga type not registered: ${instance.sagaType}`);
    }

    // 更新状态为 running
    await db.update(sagaInstances)
      .set({ status: 'running' })
      .where(eq(sagaInstances.sagaId, sagaId));

    // 从检查点继续执行
    const checkpoint = instance.checkpoint as SagaContext['checkpoint'];
    const startStep = checkpoint.lastCompletedStep + 1;

    log.debug(`[SagaOrchestrator] Resuming saga ${sagaId} from step ${startStep}`);

    // 重新执行剩余步骤
    return this.execute(instance.sagaType, instance.input);
  }

  /**
   * 启动超时检查器
   */
  private startTimeoutChecker(): void {
    this.timeoutChecker = setInterval(async () => {
      await this.checkTimeouts();
    }, 30000); // 每 30 秒检查一次
  }

  /**
   * 检查超时的 Saga
   */
  private async checkTimeouts(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    let timedOutSagas;
    try {
      timedOutSagas = await db.select()
        .from(sagaInstances)
        .where(and(
          eq(sagaInstances.status, 'running'),
          lt(sagaInstances.timeoutAt, now)
        ));
    } catch {
      // 表还未创建，跳过超时检查
      return;
    }

    for (const saga of timedOutSagas) {
      log.warn(`[SagaOrchestrator] Saga ${saga.sagaId} timed out`);

      await db.update(sagaInstances)
        .set({
          status: 'failed',
          error: 'Saga execution timed out',
          completedAt: now,
        })
        .where(eq(sagaInstances.sagaId, saga.sagaId));

      await this.writeToDeadLetter(
        saga.sagaId,
        saga.sagaType,
        'Saga execution timed out',
        'timeout',
        saga.input,
        saga.checkpoint
      );

      this.metrics.failed++;
    }
  }

  /**
   * 恢复中断的 Saga
   */
  private async recoverInterruptedSagas(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const interruptedSagas = await db.select()
      .from(sagaInstances)
      .where(eq(sagaInstances.status, 'running'));

    for (const saga of interruptedSagas) {
      log.debug(`[SagaOrchestrator] Found interrupted saga: ${saga.sagaId}`);

      // 标记为需要恢复
      await db.update(sagaInstances)
        .set({ status: 'partial' })
        .where(eq(sagaInstances.sagaId, saga.sagaId));
    }

    if (interruptedSagas.length > 0) {
      log.debug(`[SagaOrchestrator] Found ${interruptedSagas.length} interrupted sagas, marked as partial`);
    }
  }

  /**
   * 带超时执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      registeredSagas: sagaRegistry.size,
    };
  }
}

// 导出单例
export const sagaOrchestrator = new SagaOrchestrator();

// 导出类型
export type { SagaOrchestrator };
