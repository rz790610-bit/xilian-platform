/**
 * 回滚 Saga - 实现设备规则/配置的批量回滚
 * 支持检查点、分批处理、补偿机制
 */

import { registerSaga, SagaStep, SagaContext } from './saga.orchestrator';
import { getDb } from '../lib/db';
import { rollbackExecutions } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { redisClient } from '../lib/clients/redis.client';
import { outboxPublisher } from './outbox.publisher';

// ============ 类型定义 ============

export interface RollbackInput {
  triggerId: string;
  targetType: 'rule' | 'model' | 'config' | 'firmware';
  targetId: string;
  fromVersion: string;
  toVersion: string;
  reason?: string;
  deviceCodes?: string[]; // 指定设备，不指定则自动获取
  stopOnError?: boolean;
  batchSize?: number;
}

export interface RollbackOutput {
  executionId: string;
  total: number;
  succeeded: number;
  failed: number;
  details: Array<{
    deviceId: string;
    status: string;
    error?: string;
  }>;
}

// ============ 辅助函数 ============

async function getAffectedDevices(input: RollbackInput): Promise<string[]> {
  if (input.deviceCodes && input.deviceCodes.length > 0) {
    return input.deviceCodes;
  }

  // 模拟获取受影响的设备列表
  // 实际实现应该从数据库查询
  const db = await getDb();
  if (!db) return [];

  // 这里返回模拟数据，实际应该根据 targetType 和 targetId 查询
  return ['XC001', 'XC002', 'XC003', 'XC004', 'XC005'];
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============ Saga 步骤定义 ============

const prepareRollbackStep: SagaStep<RollbackInput, { executionId: string; devices: string[]; batches: string[][] }> = {
  name: 'prepare_rollback',
  timeout: 30000,
  retryable: true,
  maxRetries: 3,

  async execute(input, context) {
    console.log(`[RollbackSaga] Preparing rollback for ${input.targetType}:${input.targetId}`);

    const executionId = `rollback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const devices = await getAffectedDevices(input);
    const batchSize = input.batchSize || 10;
    const batches = chunk(devices, batchSize);

    // 创建回滚执行记录
    const db = await getDb();
    if (db) {
      await db.insert(rollbackExecutions).values({
        executionId,
        sagaId: context.sagaId,
        triggerId: input.triggerId,
        targetType: input.targetType,
        targetId: input.targetId,
        fromVersion: input.fromVersion,
        toVersion: input.toVersion,
        triggerReason: input.reason,
        status: 'executing',
        totalDevices: devices.length,
        completedDevices: 0,
        failedDevices: 0,
        checkpoint: { processed: [], failed: [] },
      });
    }

    console.log(`[RollbackSaga] Prepared: ${devices.length} devices in ${batches.length} batches`);

    return { executionId, devices, batches };
  },

  async compensate(input, output, context) {
    console.log(`[RollbackSaga] Compensating prepare step: ${output.executionId}`);

    const db = await getDb();
    if (db) {
      await db.update(rollbackExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(rollbackExecutions.executionId, output.executionId));
    }
  },
};

const executeRollbackStep: SagaStep<
  { input: RollbackInput; prepare: { executionId: string; devices: string[]; batches: string[][] } },
  { succeeded: string[]; failed: Array<{ device: string; error: string }> }
> = {
  name: 'execute_rollback',
  timeout: 300000, // 5 分钟
  retryable: false, // 不重试整个步骤，内部分批重试

  async execute({ input, prepare }, context) {
    console.log(`[RollbackSaga] Executing rollback for ${prepare.devices.length} devices`);

    const succeeded: string[] = [];
    const failed: Array<{ device: string; error: string }> = [];
    const db = await getDb();

    for (let batchIndex = 0; batchIndex < prepare.batches.length; batchIndex++) {
      const batch = prepare.batches[batchIndex];
      console.log(`[RollbackSaga] Processing batch ${batchIndex + 1}/${prepare.batches.length}`);

      // 并行处理批次内的设备
      const results = await Promise.allSettled(
        batch.map(async (deviceCode) => {
          try {
            // 1. 模拟更新设备的规则/配置版本
            // 实际实现应该调用设备服务
            await simulateDeviceRollback(deviceCode, input);

            // 2. 清除设备缓存
            await redisClient.del(`${input.targetType}:${input.targetId}:${deviceCode}`);

            // 3. 发送回滚事件
            await outboxPublisher.addEvent({
              eventType: 'DeviceRolledBack',
              aggregateType: 'Device',
              aggregateId: deviceCode,
              payload: {
                deviceCode,
                targetType: input.targetType,
                targetId: input.targetId,
                fromVersion: input.fromVersion,
                toVersion: input.toVersion,
              },
            });

            return { deviceCode, success: true };
          } catch (error) {
            return { deviceCode, success: false, error: String(error) };
          }
        })
      );

      // 统计结果
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            succeeded.push(result.value.deviceCode);
          } else {
            failed.push({ device: result.value.deviceCode, error: result.value.error || 'Unknown error' });
          }
        } else {
          // Promise rejected
          failed.push({ device: 'unknown', error: result.reason?.message || 'Unknown error' });
        }
      }

      // 更新检查点
      if (db) {
        await db.update(rollbackExecutions)
          .set({
            completedDevices: succeeded.length,
            failedDevices: failed.length,
            checkpoint: { processed: succeeded, failed },
          })
          .where(eq(rollbackExecutions.executionId, prepare.executionId));
      }

      // 如果配置了遇错停止，检查是否有失败
      if (input.stopOnError && failed.length > 0) {
        console.warn(`[RollbackSaga] Stopping due to errors (stopOnError=true)`);
        break;
      }
    }

    return { succeeded, failed };
  },

  async compensate({ input, prepare }, output, context) {
    console.log(`[RollbackSaga] Compensating rollback: reverting ${output.succeeded.length} devices`);

    // 对已成功回滚的设备进行反向回滚
    for (const deviceCode of output.succeeded) {
      try {
        // 反向回滚：从 toVersion 回到 fromVersion
        await simulateDeviceRollback(deviceCode, {
          ...input,
          fromVersion: input.toVersion,
          toVersion: input.fromVersion,
        });

        console.log(`[RollbackSaga] Reverted device: ${deviceCode}`);
      } catch (error) {
        console.error(`[RollbackSaga] Failed to revert device ${deviceCode}:`, error);
      }
    }
  },
};

const finalizeRollbackStep: SagaStep<
  {
    input: RollbackInput;
    prepare: { executionId: string; devices: string[]; batches: string[][] };
    execute: { succeeded: string[]; failed: Array<{ device: string; error: string }> };
  },
  RollbackOutput
> = {
  name: 'finalize_rollback',
  timeout: 30000,
  retryable: true,

  async execute({ input, prepare, execute }, context) {
    console.log(`[RollbackSaga] Finalizing rollback: ${execute.succeeded.length} succeeded, ${execute.failed.length} failed`);

    const db = await getDb();
    const status = execute.failed.length > 0
      ? (execute.succeeded.length > 0 ? 'partial' : 'failed')
      : 'completed';

    const result: RollbackOutput = {
      executionId: prepare.executionId,
      total: prepare.devices.length,
      succeeded: execute.succeeded.length,
      failed: execute.failed.length,
      details: [
        ...execute.succeeded.map(d => ({ deviceId: d, status: 'success' })),
        ...execute.failed.map(f => ({ deviceId: f.device, status: 'failed', error: f.error })),
      ],
    };

    if (db) {
      await db.update(rollbackExecutions)
        .set({
          status,
          result,
          completedAt: new Date(),
        })
        .where(eq(rollbackExecutions.executionId, prepare.executionId));
    }

    // 发送完成事件
    await outboxPublisher.addEvent({
      eventType: 'BatchRollbackCompleted',
      aggregateType: 'Rollback',
      aggregateId: prepare.executionId,
      payload: result as unknown as Record<string, unknown>,
    });

    return result;
  },

  async compensate({ input, prepare, execute }, output, context) {
    // 最终步骤的补偿：标记为已补偿
    const db = await getDb();
    if (db) {
      await db.update(rollbackExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(rollbackExecutions.executionId, prepare.executionId));
    }
  },
};

// ============ 模拟函数 ============

async function simulateDeviceRollback(deviceCode: string, input: RollbackInput): Promise<void> {
  // 模拟设备回滚操作
  // 实际实现应该调用设备管理服务
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

  // 模拟 5% 的失败率
  if (Math.random() < 0.05) {
    throw new Error(`Device ${deviceCode} rollback failed: Connection timeout`);
  }
}

// ============ 注册 Saga ============

export function registerRollbackSaga(): void {
  registerSaga<RollbackInput, RollbackOutput>({
    type: 'rule_rollback',
    timeout: 600000, // 10 分钟
    steps: [
      prepareRollbackStep as SagaStep,
      {
        ...executeRollbackStep,
        execute: async (input: any, context) => {
          const prepareOutput = context.stepOutputs.get('prepare_rollback') as { executionId: string; devices: string[]; batches: string[][] };
          return executeRollbackStep.execute({ input, prepare: prepareOutput }, context);
        },
        compensate: async (input: any, output: any, context) => {
          const prepareOutput = context.stepOutputs.get('prepare_rollback') as { executionId: string; devices: string[]; batches: string[][] };
          return executeRollbackStep.compensate?.({ input, prepare: prepareOutput }, output, context);
        },
      } as SagaStep,
      {
        ...finalizeRollbackStep,
        execute: async (input: any, context) => {
          const prepareOutput = context.stepOutputs.get('prepare_rollback') as { executionId: string; devices: string[]; batches: string[][] };
          const executeOutput = context.stepOutputs.get('execute_rollback') as { succeeded: string[]; failed: Array<{ device: string; error: string }> };
          return finalizeRollbackStep.execute({ input, prepare: prepareOutput, execute: executeOutput }, context);
        },
        compensate: async (input: any, output: any, context) => {
          const prepareOutput = context.stepOutputs.get('prepare_rollback') as { executionId: string; devices: string[]; batches: string[][] };
          const executeOutput = context.stepOutputs.get('execute_rollback') as { succeeded: string[]; failed: Array<{ device: string; error: string }> };
          return finalizeRollbackStep.compensate?.({ input, prepare: prepareOutput, execute: executeOutput }, output, context);
        },
      } as SagaStep,
    ],
    onComplete: async (input, output) => {
      console.log(`[RollbackSaga] Completed: ${output.succeeded}/${output.total} devices rolled back`);
    },
    onFailed: async (input, error) => {
      console.error(`[RollbackSaga] Failed:`, error.message);
    },
  });

  console.log('[RollbackSaga] Registered rule_rollback saga');
}
