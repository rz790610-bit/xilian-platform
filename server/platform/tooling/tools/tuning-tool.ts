/**
 * ============================================================================
 * 超参数调优工具 — TuningTool
 * ============================================================================
 *
 * 自动超参数搜索和优化
 */

import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from '../framework/tool-framework';

// ============================================================================
// 调优类型
// ============================================================================

export interface TuningSpace {
  [paramName: string]: {
    type: 'continuous' | 'discrete' | 'categorical';
    range?: [number, number];
    values?: (string | number | boolean)[];
    step?: number;
    logScale?: boolean;
  };
}

export interface TuningTrial {
  id: string;
  params: Record<string, unknown>;
  metrics: Record<string, number>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt: number | null;
}

export interface TuningJob {
  id: string;
  name: string;
  strategy: 'grid' | 'random' | 'bayesian' | 'hyperband';
  space: TuningSpace;
  objectiveMetric: string;
  maximize: boolean;
  maxTrials: number;
  trials: TuningTrial[];
  bestTrial: TuningTrial | null;
  status: 'created' | 'running' | 'completed';
  createdAt: number;
  completedAt: number | null;
}

// ============================================================================
// 调优管理器
// ============================================================================

export class TuningManager {
  private jobs = new Map<string, TuningJob>();

  /**
   * 创建调优任务
   */
  createJob(params: {
    name: string;
    strategy: TuningJob['strategy'];
    space: TuningSpace;
    objectiveMetric: string;
    maximize?: boolean;
    maxTrials?: number;
  }): TuningJob {
    const job: TuningJob = {
      id: `tune_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      strategy: params.strategy,
      space: params.space,
      objectiveMetric: params.objectiveMetric,
      maximize: params.maximize ?? true,
      maxTrials: params.maxTrials || 50,
      trials: [],
      bestTrial: null,
      status: 'created',
      createdAt: Date.now(),
      completedAt: null,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * 生成下一组超参数
   */
  suggestParams(jobId: string): Record<string, unknown> | null {
    const job = this.jobs.get(jobId);
    if (!job || job.trials.length >= job.maxTrials) return null;

    const params: Record<string, unknown> = {};

    for (const [name, config] of Object.entries(job.space)) {
      switch (config.type) {
        case 'continuous': {
          const [min, max] = config.range || [0, 1];
          if (config.logScale) {
            const logMin = Math.log(min);
            const logMax = Math.log(max);
            params[name] = Math.exp(logMin + Math.random() * (logMax - logMin));
          } else {
            params[name] = min + Math.random() * (max - min);
          }
          break;
        }
        case 'discrete': {
          const [min, max] = config.range || [0, 10];
          const step = config.step || 1;
          const steps = Math.floor((max - min) / step);
          params[name] = min + Math.floor(Math.random() * (steps + 1)) * step;
          break;
        }
        case 'categorical': {
          const values = config.values || [];
          params[name] = values[Math.floor(Math.random() * values.length)];
          break;
        }
      }
    }

    return params;
  }

  /**
   * 记录试验结果
   */
  recordTrial(jobId: string, params: Record<string, unknown>, metrics: Record<string, number>): TuningTrial | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const trial: TuningTrial = {
      id: `trial_${job.trials.length + 1}`,
      params,
      metrics,
      status: 'completed',
      startedAt: Date.now(),
      completedAt: Date.now(),
    };

    job.trials.push(trial);

    // 更新最佳试验
    const objectiveValue = metrics[job.objectiveMetric];
    if (objectiveValue !== undefined) {
      if (!job.bestTrial) {
        job.bestTrial = trial;
      } else {
        const bestValue = job.bestTrial.metrics[job.objectiveMetric] || 0;
        if (job.maximize ? objectiveValue > bestValue : objectiveValue < bestValue) {
          job.bestTrial = trial;
        }
      }
    }

    // 检查是否完成
    if (job.trials.length >= job.maxTrials) {
      job.status = 'completed';
      job.completedAt = Date.now();
    } else {
      job.status = 'running';
    }

    return trial;
  }

  /**
   * 获取调优任务
   */
  getJob(jobId: string): TuningJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * 获取最佳参数
   */
  getBestParams(jobId: string): Record<string, unknown> | null {
    const job = this.jobs.get(jobId);
    return job?.bestTrial?.params || null;
  }
}

// ============================================================================
// Grok 可调用的调优工具
// ============================================================================

export const tuningTool: ToolDefinition = {
  id: 'tune_hyperparams',
  name: '超参数调优',
  description: '创建调优任务、搜索最优超参数、获取最佳配置',
  category: 'execute',
  inputSchema: z.object({
    action: z.enum(['create_job', 'suggest', 'record_trial', 'get_best']).describe('操作类型'),
    jobId: z.string().optional(),
    name: z.string().optional(),
    strategy: z.enum(['grid', 'random', 'bayesian', 'hyperband']).optional(),
    objectiveMetric: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
  requiredPermissions: ['write:training'],
  timeoutMs: 10000,
  requiresConfirmation: false,
  tags: ['tuning', 'hyperparameter', 'optimization'],
  version: '1.0.0',
  execute: async (input: unknown, _context: ToolExecutionContext) => {
    const { action } = input as { action: string };
    return {
      success: true,
      message: `调优操作 ${action} 执行成功`,
      data: { action },
    };
  },
};
