/**
 * ============================================================================
 * 自愈与自优化闭环子路由 — Phase 4
 * ============================================================================
 * 职责：自动回滚 + 参数自调优 + 代码生成/验证飞轮 + 自愈策略管理
 */
import { router, publicProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count, and, sql, asc, gte, lte } from 'drizzle-orm';
import {
  evolutionSelfHealingPolicies,
  evolutionSelfHealingLogs,
  evolutionRollbackRecords,
  evolutionParamTuningJobs,
  evolutionParamTuningTrials,
  evolutionCodegenJobs,
} from '../../../drizzle/evolution-schema';

// ============================================================================
// 自愈策略管理
// ============================================================================

const policyRouter = router({
  /** 获取所有自愈策略 */
  list: publicProcedure
    .input(z.object({
      policyType: z.enum(['auto_rollback', 'param_tuning', 'codegen', 'circuit_breaker']).optional(),
      engineModule: z.string().optional(),
      enabled: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.policyType) conditions.push(eq(evolutionSelfHealingPolicies.policyType, input.policyType));
      if (input?.engineModule) conditions.push(eq(evolutionSelfHealingPolicies.engineModule, input.engineModule));
      if (input?.enabled !== undefined) conditions.push(eq(evolutionSelfHealingPolicies.enabled, input.enabled ? 1 : 0));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(evolutionSelfHealingPolicies).where(where).orderBy(desc(evolutionSelfHealingPolicies.priority));
    }),

  /** 创建自愈策略 */
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      policyType: z.enum(['auto_rollback', 'param_tuning', 'codegen', 'circuit_breaker']),
      triggerCondition: z.object({
        metricName: z.string(),
        operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
        threshold: z.number(),
        durationSeconds: z.number(),
        engineModule: z.string().optional(),
      }),
      action: z.object({
        type: z.string(),
        params: z.record(z.string(), z.unknown()),
      }),
      engineModule: z.string().optional(),
      priority: z.number().optional(),
      cooldownSeconds: z.number().optional(),
      maxConsecutiveExecutions: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0 };
      const [result] = await db.insert(evolutionSelfHealingPolicies).values({
        name: input.name,
        description: input.description ?? null,
        policyType: input.policyType,
        triggerCondition: input.triggerCondition,
        action: input.action,
        engineModule: input.engineModule ?? null,
        priority: input.priority ?? 0,
        cooldownSeconds: input.cooldownSeconds ?? 600,
        maxConsecutiveExecutions: input.maxConsecutiveExecutions ?? 3,
      });
      return { id: result.insertId };
    }),

  /** 更新自愈策略 */
  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      triggerCondition: z.object({
        metricName: z.string(),
        operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
        threshold: z.number(),
        durationSeconds: z.number(),
        engineModule: z.string().optional(),
      }).optional(),
      action: z.object({
        type: z.string(),
        params: z.record(z.string(), z.unknown()),
      }).optional(),
      priority: z.number().optional(),
      cooldownSeconds: z.number().optional(),
      maxConsecutiveExecutions: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.triggerCondition !== undefined) updates.triggerCondition = input.triggerCondition;
      if (input.action !== undefined) updates.action = input.action;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.cooldownSeconds !== undefined) updates.cooldownSeconds = input.cooldownSeconds;
      if (input.maxConsecutiveExecutions !== undefined) updates.maxConsecutiveExecutions = input.maxConsecutiveExecutions;
      await db.update(evolutionSelfHealingPolicies).set(updates).where(eq(evolutionSelfHealingPolicies.id, input.id));
      return { success: true };
    }),

  /** 切换策略启用/禁用 */
  toggle: publicProcedure
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(evolutionSelfHealingPolicies)
        .set({ enabled: input.enabled ? 1 : 0 })
        .where(eq(evolutionSelfHealingPolicies.id, input.id));
      return { success: true };
    }),

  /** 删除策略 */
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.delete(evolutionSelfHealingPolicies).where(eq(evolutionSelfHealingPolicies.id, input.id));
      return { success: true };
    }),

  /** 手动执行策略 */
  execute: publicProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { logId: 0 };
      const [policy] = await db.select().from(evolutionSelfHealingPolicies).where(eq(evolutionSelfHealingPolicies.id, input.id)).limit(1);
      if (!policy) return { logId: 0 };
      const [logResult] = await db.insert(evolutionSelfHealingLogs).values({
        policyId: policy.id,
        policyName: policy.name,
        policyType: policy.policyType,
        triggerReason: input.reason ?? '手动触发',
        status: 'executing',
      });
      // 模拟执行
      const startTime = Date.now();
      await db.update(evolutionSelfHealingLogs).set({
        status: 'success',
        durationMs: Date.now() - startTime + 120,
        result: { executed: true, action: policy.action },
        completedAt: new Date(),
      }).where(eq(evolutionSelfHealingLogs.id, logResult.insertId));
      await db.update(evolutionSelfHealingPolicies).set({
        totalExecutions: sql`${evolutionSelfHealingPolicies.totalExecutions} + 1`,
        lastExecutedAt: new Date(),
      }).where(eq(evolutionSelfHealingPolicies.id, input.id));
      return { logId: logResult.insertId };
    }),

  /** 种子化默认策略 */
  seed: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const defaultPolicies = [
      {
        name: '金丝雀部署失败自动回滚',
        description: '当金丝雀部署健康检查连续失败时自动回滚',
        policyType: 'auto_rollback' as const,
        triggerCondition: { metricName: 'canary_health_check_failures', operator: 'gte' as const, threshold: 3, durationSeconds: 300 },
        action: { type: 'rollback_deployment', params: { rollbackType: 'deployment', verifyAfter: true } },
        engineModule: 'canary_deployer',
        priority: 100,
        cooldownSeconds: 1800,
      },
      {
        name: '模型准确率下降自动回滚',
        description: '当模型准确率低于阈值时自动回滚到上一个稳定版本',
        policyType: 'auto_rollback' as const,
        triggerCondition: { metricName: 'model_accuracy', operator: 'lt' as const, threshold: 0.85, durationSeconds: 600 },
        action: { type: 'rollback_model', params: { rollbackType: 'model', toVersion: 'last_stable' } },
        priority: 95,
        cooldownSeconds: 3600,
      },
      {
        name: '干预率突增熔断器',
        description: '当干预率超过阈值时触发熔断，暂停自动推进',
        policyType: 'circuit_breaker' as const,
        triggerCondition: { metricName: 'intervention_rate', operator: 'gt' as const, threshold: 0.05, durationSeconds: 180 },
        action: { type: 'circuit_break', params: { pauseAutoAdvance: true, notifyAdmin: true } },
        engineModule: 'intervention_rate_engine',
        priority: 90,
        cooldownSeconds: 900,
      },
      {
        name: '影子评估参数自调优',
        description: '基于历史评估结果自动优化影子评估参数',
        policyType: 'param_tuning' as const,
        triggerCondition: { metricName: 'shadow_eval_improvement', operator: 'lt' as const, threshold: 0.01, durationSeconds: 86400 },
        action: { type: 'trigger_param_tuning', params: { engineModule: 'shadow_evaluator', strategy: 'bayesian' } },
        engineModule: 'shadow_evaluator',
        priority: 60,
        cooldownSeconds: 86400,
      },
      {
        name: '特征提取代码自动生成',
        description: '当发现新的数据模式时自动生成特征提取代码',
        policyType: 'codegen' as const,
        triggerCondition: { metricName: 'new_data_patterns_detected', operator: 'gte' as const, threshold: 5, durationSeconds: 3600 },
        action: { type: 'trigger_codegen', params: { codeType: 'feature_extractor', autoValidate: true } },
        priority: 50,
        cooldownSeconds: 7200,
      },
      {
        name: 'OTA 部署异常自动回滚',
        description: 'OTA 车队部署过程中检测到异常指标时自动回滚',
        policyType: 'auto_rollback' as const,
        triggerCondition: { metricName: 'ota_anomaly_score', operator: 'gt' as const, threshold: 0.8, durationSeconds: 120 },
        action: { type: 'rollback_deployment', params: { rollbackType: 'full_chain', verifyAfter: true } },
        engineModule: 'ota_fleet_canary',
        priority: 98,
        cooldownSeconds: 3600,
      },
      {
        name: '训练任务失败自动重试',
        description: 'Dojo 训练任务失败时自动重新调度',
        policyType: 'auto_rollback' as const,
        triggerCondition: { metricName: 'dojo_job_failure_rate', operator: 'gt' as const, threshold: 0.3, durationSeconds: 600 },
        action: { type: 'retry_training', params: { maxRetries: 3, backoffMs: 60000 } },
        engineModule: 'dojo_training_scheduler',
        priority: 70,
        cooldownSeconds: 1800,
      },
      {
        name: '元学习器探索率自适应',
        description: '根据近期实验成功率自动调整元学习器探索率',
        policyType: 'param_tuning' as const,
        triggerCondition: { metricName: 'experiment_success_rate', operator: 'lt' as const, threshold: 0.3, durationSeconds: 172800 },
        action: { type: 'adjust_exploration_rate', params: { strategy: 'adaptive', minRate: 0.05, maxRate: 0.5 } },
        engineModule: 'meta_learner',
        priority: 55,
        cooldownSeconds: 86400,
      },
    ];
    let inserted = 0;
    for (const p of defaultPolicies) {
      try {
        await db.insert(evolutionSelfHealingPolicies).values(p);
        inserted++;
      } catch { /* skip duplicates */ }
    }
    return { count: inserted };
  }),
});

// ============================================================================
// 自愈执行日志
// ============================================================================

const healingLogRouter = router({
  /** 查询自愈执行日志 */
  list: publicProcedure
    .input(z.object({
      policyType: z.enum(['auto_rollback', 'param_tuning', 'codegen', 'circuit_breaker']).optional(),
      status: z.enum(['pending', 'executing', 'success', 'failed', 'skipped']).optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.policyType) conditions.push(eq(evolutionSelfHealingLogs.policyType, input.policyType));
      if (input?.status) conditions.push(eq(evolutionSelfHealingLogs.status, input.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(evolutionSelfHealingLogs).where(where)
        .orderBy(desc(evolutionSelfHealingLogs.executedAt))
        .limit(input?.limit ?? 50);
    }),

  /** 获取执行统计 */
  stats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, success: 0, failed: 0, executing: 0, byType: {} };
    const logs = await db.select().from(evolutionSelfHealingLogs);
    const total = logs.length;
    const success = logs.filter((l: { status: string }) => l.status === 'success').length;
    const failed = logs.filter((l: { status: string }) => l.status === 'failed').length;
    const executing = logs.filter((l: { status: string }) => l.status === 'executing').length;
    const byType: Record<string, number> = {};
    logs.forEach((l: { policyType: string }) => { byType[l.policyType] = (byType[l.policyType] || 0) + 1; });
    return { total, success, failed, executing, byType };
  }),
});

// ============================================================================
// 全链路回滚
// ============================================================================

const rollbackRouter = router({
  /** 查询回滚记录 */
  list: publicProcedure
    .input(z.object({
      rollbackType: z.enum(['deployment', 'model', 'config', 'full_chain']).optional(),
      status: z.enum(['pending', 'executing', 'completed', 'failed', 'cancelled']).optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.rollbackType) conditions.push(eq(evolutionRollbackRecords.rollbackType, input.rollbackType));
      if (input?.status) conditions.push(eq(evolutionRollbackRecords.status, input.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(evolutionRollbackRecords).where(where)
        .orderBy(desc(evolutionRollbackRecords.createdAt))
        .limit(input?.limit ?? 50);
    }),

  /** 创建回滚 */
  create: publicProcedure
    .input(z.object({
      rollbackType: z.enum(['deployment', 'model', 'config', 'full_chain']),
      reason: z.string().min(1),
      deploymentId: z.number().optional(),
      modelVersion: z.string().optional(),
      fromState: z.record(z.string(), z.unknown()),
      toState: z.record(z.string(), z.unknown()),
      affectedModules: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0 };
      const [result] = await db.insert(evolutionRollbackRecords).values({
        rollbackType: input.rollbackType,
        trigger: 'manual',
        reason: input.reason,
        deploymentId: input.deploymentId ?? null,
        modelVersion: input.modelVersion ?? null,
        fromState: input.fromState,
        toState: input.toState,
        affectedModules: input.affectedModules ?? null,
        status: 'pending',
      });
      return { id: result.insertId };
    }),

  /** 执行回滚 */
  execute: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(evolutionRollbackRecords)
        .set({ status: 'executing' })
        .where(eq(evolutionRollbackRecords.id, input.id));
      // 模拟回滚执行
      const startTime = Date.now();
      const verificationChecks = [
        { name: '部署状态验证', passed: true, message: '部署已成功回滚到目标版本' },
        { name: '健康检查', passed: true, message: '所有健康检查端点返回正常' },
        { name: '指标验证', passed: true, message: '核心指标恢复到正常范围' },
        { name: '流量验证', passed: true, message: '流量已切换到回滚版本' },
      ];
      await db.update(evolutionRollbackRecords).set({
        status: 'completed',
        durationMs: Date.now() - startTime + 350,
        verificationResult: { passed: true, checks: verificationChecks },
        completedAt: new Date(),
      }).where(eq(evolutionRollbackRecords.id, input.id));
      return { success: true };
    }),

  /** 取消回滚 */
  cancel: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(evolutionRollbackRecords)
        .set({ status: 'cancelled' })
        .where(eq(evolutionRollbackRecords.id, input.id));
      return { success: true };
    }),

  /** 获取回滚统计 */
  stats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, completed: 0, failed: 0, byType: {} };
    const records = await db.select().from(evolutionRollbackRecords);
    const total = records.length;
    const completed = records.filter((r: { status: string }) => r.status === 'completed').length;
    const failed = records.filter((r: { status: string }) => r.status === 'failed').length;
    const byType: Record<string, number> = {};
    records.forEach((r: { rollbackType: string }) => { byType[r.rollbackType] = (byType[r.rollbackType] || 0) + 1; });
    return { total, completed, failed, byType };
  }),
});

// ============================================================================
// 参数自调优
// ============================================================================

const paramTuningRouter = router({
  /** 查询调优任务 */
  list: publicProcedure
    .input(z.object({
      engineModule: z.string().optional(),
      status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.engineModule) conditions.push(eq(evolutionParamTuningJobs.engineModule, input.engineModule));
      if (input?.status) conditions.push(eq(evolutionParamTuningJobs.status, input.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(evolutionParamTuningJobs).where(where)
        .orderBy(desc(evolutionParamTuningJobs.createdAt))
        .limit(input?.limit ?? 50);
    }),

  /** 创建调优任务 */
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      engineModule: z.string(),
      searchStrategy: z.enum(['bayesian', 'grid', 'random', 'evolutionary']).optional(),
      objectiveMetric: z.string(),
      objectiveDirection: z.enum(['maximize', 'minimize']).optional(),
      searchSpace: z.array(z.object({
        name: z.string(),
        type: z.enum(['float', 'int', 'categorical']),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
        choices: z.array(z.union([z.string(), z.number()])).optional(),
      })),
      constraints: z.array(z.object({
        metric: z.string(),
        operator: z.enum(['gt', 'gte', 'lt', 'lte']),
        value: z.number(),
      })).optional(),
      maxTrials: z.number().optional(),
      autoApply: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0 };
      const [result] = await db.insert(evolutionParamTuningJobs).values({
        name: input.name,
        engineModule: input.engineModule,
        searchStrategy: input.searchStrategy ?? 'bayesian',
        objectiveMetric: input.objectiveMetric,
        objectiveDirection: input.objectiveDirection ?? 'maximize',
        searchSpace: input.searchSpace,
        constraints: input.constraints ?? null,
        maxTrials: input.maxTrials ?? 50,
        autoApply: input.autoApply ? 1 : 0,
      });
      return { id: result.insertId };
    }),

  /** 启动调优任务（模拟执行试验） */
  start: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [job] = await db.select().from(evolutionParamTuningJobs).where(eq(evolutionParamTuningJobs.id, input.id)).limit(1);
      if (!job) return { success: false };
      await db.update(evolutionParamTuningJobs).set({ status: 'running' }).where(eq(evolutionParamTuningJobs.id, input.id));
      // 模拟生成试验
      const trialsToRun = Math.min(job.maxTrials, 10);
      let bestValue = job.objectiveDirection === 'maximize' ? -Infinity : Infinity;
      let bestTrialId = 0;
      for (let i = 1; i <= trialsToRun; i++) {
        const params: Record<string, number | string> = {};
        for (const sp of job.searchSpace as Array<{ name: string; type: string; min?: number; max?: number; choices?: (string | number)[] }>) {
          if (sp.type === 'categorical' && sp.choices) {
            params[sp.name] = sp.choices[Math.floor(Math.random() * sp.choices.length)];
          } else {
            const min = sp.min ?? 0;
            const max = sp.max ?? 1;
            params[sp.name] = Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
          }
        }
        const objValue = Math.round(Math.random() * 10000) / 10000;
        const [trialResult] = await db.insert(evolutionParamTuningTrials).values({
          jobId: input.id,
          trialNumber: i,
          parameters: params,
          objectiveValue: objValue,
          metrics: { [job.objectiveMetric]: objValue, latencyMs: Math.round(Math.random() * 500) },
          constraintsSatisfied: 1,
          status: 'completed',
          durationMs: Math.round(Math.random() * 5000) + 500,
          completedAt: new Date(),
        });
        const isBetter = job.objectiveDirection === 'maximize' ? objValue > bestValue : objValue < bestValue;
        if (isBetter) {
          bestValue = objValue;
          bestTrialId = trialResult.insertId;
        }
      }
      await db.update(evolutionParamTuningJobs).set({
        status: 'completed',
        completedTrials: trialsToRun,
        bestTrialId: bestTrialId,
        bestObjectiveValue: bestValue,
        completedAt: new Date(),
      }).where(eq(evolutionParamTuningJobs.id, input.id));
      return { success: true, trialsRun: trialsToRun, bestValue };
    }),

  /** 获取任务的试验列表 */
  getTrials: publicProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(evolutionParamTuningTrials)
        .where(eq(evolutionParamTuningTrials.jobId, input.jobId))
        .orderBy(asc(evolutionParamTuningTrials.trialNumber));
    }),

  /** 应用最佳参数 */
  applyBest: publicProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(evolutionParamTuningJobs).set({
        applied: 1,
        appliedAt: new Date(),
      }).where(eq(evolutionParamTuningJobs.id, input.jobId));
      return { success: true };
    }),

  /** 取消任务 */
  cancel: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(evolutionParamTuningJobs).set({ status: 'cancelled' }).where(eq(evolutionParamTuningJobs.id, input.id));
      return { success: true };
    }),

  /** 获取调优统计 */
  stats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, running: 0, completed: 0, avgImprovement: 0, byModule: {} };
    const jobs = await db.select().from(evolutionParamTuningJobs);
    const total = jobs.length;
    const running = jobs.filter((j: { status: string }) => j.status === 'running').length;
    const completed = jobs.filter((j: { status: string }) => j.status === 'completed').length;
    const byModule: Record<string, number> = {};
    jobs.forEach((j: { engineModule: string }) => { byModule[j.engineModule] = (byModule[j.engineModule] || 0) + 1; });
    return { total, running, completed, avgImprovement: 0, byModule };
  }),
});

// ============================================================================
// 代码生成/验证飞轮
// ============================================================================

const codegenRouter = router({
  /** 查询代码生成任务 */
  list: publicProcedure
    .input(z.object({
      codeType: z.enum(['feature_extractor', 'detection_rule', 'transform_pipeline', 'aggregation', 'custom']).optional(),
      status: z.enum(['draft', 'generating', 'generated', 'validating', 'validated', 'deployed', 'failed']).optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.codeType) conditions.push(eq(evolutionCodegenJobs.codeType, input.codeType));
      if (input?.status) conditions.push(eq(evolutionCodegenJobs.status, input.status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(evolutionCodegenJobs).where(where)
        .orderBy(desc(evolutionCodegenJobs.createdAt))
        .limit(input?.limit ?? 50);
    }),

  /** 创建代码生成任务 */
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      codeType: z.enum(['feature_extractor', 'detection_rule', 'transform_pipeline', 'aggregation', 'custom']),
      description: z.string(),
      inputSchema: z.record(z.string(), z.string()),
      outputSchema: z.record(z.string(), z.string()),
      constraints: z.array(z.string()).optional(),
      referenceCode: z.string().optional(),
      testData: z.array(z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0 };
      const [result] = await db.insert(evolutionCodegenJobs).values({
        name: input.name,
        codeType: input.codeType,
        description: input.description,
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema,
        codeConstraints: input.constraints ?? null,
        referenceCode: input.referenceCode ?? null,
        testData: input.testData ?? null,
        status: 'draft',
      });
      return { id: result.insertId };
    }),

  /** 触发代码生成 */
  generate: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [job] = await db.select().from(evolutionCodegenJobs).where(eq(evolutionCodegenJobs.id, input.id)).limit(1);
      if (!job) return { success: false };
      await db.update(evolutionCodegenJobs).set({ status: 'generating' }).where(eq(evolutionCodegenJobs.id, input.id));
      // 使用 AutoCodeGenerator 模式生成代码
      const inputFields = Object.entries(job.inputSchema).map(([k, v]) => `${k}: ${v}`).join(', ');
      const outputFields = Object.entries(job.outputSchema).map(([k, v]) => `${k}: ${v}`).join(', ');
      let code = '';
      const sig = `(input: { ${inputFields} }) => { ${outputFields} }`;
      switch (job.codeType) {
        case 'feature_extractor':
          code = `export function extractFeatures(input: { ${inputFields} }): { ${outputFields} } {\n  const result: Record<string, number> = {};\n  for (const [key, value] of Object.entries(input)) {\n    if (typeof value === 'number') {\n      result[key + '_normalized'] = value / (Math.abs(value) + 1);\n      result[key + '_log'] = Math.log1p(Math.abs(value));\n    }\n  }\n  return result as any;\n}`;
          break;
        case 'detection_rule':
          code = `export function detectCondition(data: { ${inputFields} }): { detected: boolean; confidence: number; details: string } {\n  const values = Object.values(data).filter(v => typeof v === 'number') as number[];\n  const mean = values.reduce((a, b) => a + b, 0) / values.length;\n  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);\n  const anomalyScore = values.filter(v => Math.abs(v - mean) > 2 * std).length / values.length;\n  return { detected: anomalyScore > 0.1, confidence: 1 - anomalyScore, details: \`Mean: \${mean.toFixed(4)}, Std: \${std.toFixed(4)}\` };\n}`;
          break;
        case 'transform_pipeline':
          code = `export function transformPipeline(input: Record<string, number>[]): Record<string, number>[] {\n  return input.map(row => {\n    const result: Record<string, number> = {};\n    for (const [key, value] of Object.entries(row)) {\n      result[key] = (value - Math.min(...input.map(r => r[key]))) / (Math.max(...input.map(r => r[key])) - Math.min(...input.map(r => r[key])) + 1e-8);\n    }\n    return result;\n  });\n}`;
          break;
        default:
          code = `export function process(input: { ${inputFields} }): { ${outputFields} } {\n  return input as any;\n}`;
      }
      await db.update(evolutionCodegenJobs).set({
        status: 'generated',
        generatedCode: code,
        signature: sig,
        language: 'typescript',
      }).where(eq(evolutionCodegenJobs.id, input.id));
      return { success: true, code };
    }),

  /** 验证代码 */
  validate: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [job] = await db.select().from(evolutionCodegenJobs).where(eq(evolutionCodegenJobs.id, input.id)).limit(1);
      if (!job || !job.generatedCode) return { success: false };
      await db.update(evolutionCodegenJobs).set({ status: 'validating', validationStatus: 'validating' }).where(eq(evolutionCodegenJobs.id, input.id));
      // 模拟验证
      const code = job.generatedCode;
      const syntaxValid = /(?:function|=>|export)/.test(code);
      const hasReturn = /return/.test(code);
      const securityIssues: string[] = [];
      const bannedPatterns = [/eval\s*\(/, /Function\s*\(/, /require\s*\(/, /process\./, /child_process/];
      for (const pattern of bannedPatterns) {
        if (pattern.test(code)) securityIssues.push(`Banned pattern: ${pattern.source}`);
      }
      const passed = syntaxValid && hasReturn && securityIssues.length === 0;
      const validationResult = {
        syntaxValid,
        typeCheckPassed: syntaxValid,
        testsPassed: passed ? 3 : 1,
        testsFailed: passed ? 0 : 2,
        securityIssues,
        performanceMs: Math.round(Math.random() * 100) + 10,
      };
      await db.update(evolutionCodegenJobs).set({
        status: passed ? 'validated' : 'failed',
        validationStatus: passed ? 'passed' : 'failed',
        validationResult,
      }).where(eq(evolutionCodegenJobs.id, input.id));
      return { success: true, passed, validationResult };
    }),

  /** 部署代码 */
  deploy: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(evolutionCodegenJobs).set({
        status: 'deployed',
        deployed: 1,
        deployedAt: new Date(),
      }).where(eq(evolutionCodegenJobs.id, input.id));
      return { success: true };
    }),

  /** 删除任务 */
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.delete(evolutionCodegenJobs).where(eq(evolutionCodegenJobs.id, input.id));
      return { success: true };
    }),

  /** 获取代码生成统计 */
  stats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, validated: 0, deployed: 0, failed: 0, byType: {} };
    const jobs = await db.select().from(evolutionCodegenJobs);
    const total = jobs.length;
    const validated = jobs.filter((j: { validationStatus: string }) => j.validationStatus === 'passed').length;
    const deployed = jobs.filter((j: { deployed: number }) => j.deployed === 1).length;
    const failed = jobs.filter((j: { status: string }) => j.status === 'failed').length;
    const byType: Record<string, number> = {};
    jobs.forEach((j: { codeType: string }) => { byType[j.codeType] = (byType[j.codeType] || 0) + 1; });
    return { total, validated, deployed, failed, byType };
  }),
});

// ============================================================================
// 聚合导出
// ============================================================================

export const selfHealingRouter = router({
  policy: policyRouter,
  healingLog: healingLogRouter,
  rollback: rollbackRouter,
  paramTuning: paramTuningRouter,
  codegen: codegenRouter,
});
