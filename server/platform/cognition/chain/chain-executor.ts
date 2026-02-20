/**
 * ============================================================================
 * 链式认知执行器 — ChainExecutor
 * ============================================================================
 *
 * 职责：
 *   1. 按 ChainPlan 的执行顺序逐层执行步骤
 *   2. 并行执行同层无依赖步骤
 *   3. 步骤间数据传递（输出→输入映射）
 *   4. 失败处理（重试/跳过/替代/中止）
 *   5. 执行追踪（每步的耗时/状态/输出）
 */

import type { ChainPlan, ChainStep } from './chain-planner';

// ============================================================================
// 执行类型
// ============================================================================

export interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  outputs: Record<string, unknown>;
  durationMs: number;
  retryCount: number;
  error: string | null;
  startedAt: number;
  completedAt: number;
}

export interface ChainExecution {
  id: string;
  planId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  stepResults: Map<string, StepResult>;
  currentLayer: number;
  totalLayers: number;
  totalDurationMs: number;
  startedAt: number;
  completedAt: number | null;
}

export type StepExecutorFn = (
  step: ChainStep,
  inputs: Record<string, unknown>,
  context: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

// ============================================================================
// 链式认知执行器
// ============================================================================

export class ChainExecutor {
  private executors = new Map<string, StepExecutorFn>();
  private executions = new Map<string, ChainExecution>();
  private defaultTimeoutMs = 30_000;

  /**
   * 注册步骤执行器
   */
  registerExecutor(stepType: string, executor: StepExecutorFn): void {
    this.executors.set(stepType, executor);
  }

  /**
   * 执行链式计划
   */
  async execute(
    plan: ChainPlan,
    context: Record<string, unknown> = {},
  ): Promise<ChainExecution> {
    const execution: ChainExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      planId: plan.id,
      status: 'running',
      stepResults: new Map(),
      currentLayer: 0,
      totalLayers: plan.executionOrder.length,
      totalDurationMs: 0,
      startedAt: Date.now(),
      completedAt: null,
    };

    this.executions.set(execution.id, execution);

    try {
      // 逐层执行
      for (let layerIdx = 0; layerIdx < plan.executionOrder.length; layerIdx++) {
        execution.currentLayer = layerIdx;
        const layer = plan.executionOrder[layerIdx];
        const layerSteps = plan.steps.filter(s => layer.includes(s.id));

        // 同层并行执行
        const results = await Promise.allSettled(
          layerSteps.map(step => this.executeStep(step, execution, plan, context)),
        );

        // 检查是否有关键步骤失败
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const step = layerSteps[i];

          if (result.status === 'rejected' || execution.stepResults.get(step.id)?.status === 'failed') {
            if (step.priority === 'critical' && step.fallback.strategy === 'abort') {
              execution.status = 'aborted';
              execution.completedAt = Date.now();
              execution.totalDurationMs = Date.now() - execution.startedAt;
              return execution;
            }
          }
        }
      }

      execution.status = 'completed';
    } catch (err) {
      execution.status = 'failed';
    }

    execution.completedAt = Date.now();
    execution.totalDurationMs = Date.now() - execution.startedAt;
    return execution;
  }

  /**
   * 获取执行状态
   */
  getExecution(executionId: string): ChainExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * 中止执行
   */
  abort(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') return false;

    execution.status = 'aborted';
    execution.completedAt = Date.now();
    execution.totalDurationMs = Date.now() - execution.startedAt;
    return true;
  }

  /**
   * 获取执行摘要
   */
  getSummary(executionId: string): {
    status: string;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalDurationMs: number;
    stepDetails: Array<{ id: string; name: string; status: string; durationMs: number }>;
  } | null {
    const execution = this.executions.get(executionId);
    if (!execution) return null;

    const stepDetails: Array<{ id: string; name: string; status: string; durationMs: number }> = [];
    let completed = 0;
    let failed = 0;
    let skipped = 0;

    for (const [stepId, result] of execution.stepResults) {
      stepDetails.push({
        id: stepId,
        name: stepId,
        status: result.status,
        durationMs: result.durationMs,
      });
      if (result.status === 'success') completed++;
      else if (result.status === 'failed') failed++;
      else if (result.status === 'skipped') skipped++;
    }

    return {
      status: execution.status,
      totalSteps: stepDetails.length,
      completedSteps: completed,
      failedSteps: failed,
      skippedSteps: skipped,
      totalDurationMs: execution.totalDurationMs,
      stepDetails,
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  /**
   * 执行单个步骤（含重试和降级）
   */
  private async executeStep(
    step: ChainStep,
    execution: ChainExecution,
    plan: ChainPlan,
    context: Record<string, unknown>,
  ): Promise<void> {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = step.fallback.strategy === 'retry' ? (step.fallback.maxRetries || 3) : 0;

    // 收集输入
    const inputs = this.resolveInputs(step, execution);

    while (retryCount <= maxRetries) {
      try {
        const executor = this.executors.get(step.type);
        if (!executor) {
          throw new Error(`未注册步骤类型 ${step.type} 的执行器`);
        }

        // 带超时执行
        const outputs = await this.withTimeout(
          executor(step, inputs, context),
          step.estimatedDurationMs * 3 || this.defaultTimeoutMs,
        );

        execution.stepResults.set(step.id, {
          stepId: step.id,
          status: 'success',
          outputs,
          durationMs: Date.now() - startTime,
          retryCount,
          error: null,
          startedAt: startTime,
          completedAt: Date.now(),
        });
        return;
      } catch (err) {
        retryCount++;
        if (retryCount > maxRetries) {
          // 尝试降级策略
          if (step.fallback.strategy === 'skip') {
            execution.stepResults.set(step.id, {
              stepId: step.id,
              status: 'skipped',
              outputs: {},
              durationMs: Date.now() - startTime,
              retryCount,
              error: String(err),
              startedAt: startTime,
              completedAt: Date.now(),
            });
            return;
          }

          if (step.fallback.strategy === 'alternative' && step.fallback.alternativeStepId) {
            const altStep = plan.steps.find(s => s.id === step.fallback.alternativeStepId);
            if (altStep) {
              return this.executeStep(altStep, execution, plan, context);
            }
          }

          execution.stepResults.set(step.id, {
            stepId: step.id,
            status: 'failed',
            outputs: {},
            durationMs: Date.now() - startTime,
            retryCount,
            error: String(err),
            startedAt: startTime,
            completedAt: Date.now(),
          });
          return;
        }

        // 等待后重试（指数退避）
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retryCount), 10000)));
      }
    }
  }

  /**
   * 解析步骤输入（从前序步骤输出中获取）
   */
  private resolveInputs(step: ChainStep, execution: ChainExecution): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    for (const [paramName, source] of Object.entries(step.inputs)) {
      const [sourceStepId, outputName] = source.split('.');
      const sourceResult = execution.stepResults.get(sourceStepId);
      if (sourceResult?.status === 'success' && sourceResult.outputs[outputName] !== undefined) {
        inputs[paramName] = sourceResult.outputs[outputName];
      }
    }

    return inputs;
  }

  /**
   * 超时包装
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`步骤执行超时 (${timeoutMs}ms)`)), timeoutMs);
      promise
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }
}
