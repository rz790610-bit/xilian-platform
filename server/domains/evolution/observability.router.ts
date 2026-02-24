/**
 * ============================================================================
 * 可观测性子路由 — Phase 3
 * ============================================================================
 * 全链路追踪 + 性能指标仪表盘 + 告警规则引擎
 */
import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { TRPCError } from '@trpc/server';
import { getOrchestrator, EVOLUTION_TOPICS } from './evolution-orchestrator';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count, gte, and, lte, asc, sql, or } from 'drizzle-orm';
import {
  evolutionTraces,
  evolutionSpans,
  evolutionMetricSnapshots,
  evolutionAlertRules,
  evolutionAlerts,
  evolutionSelfHealingPolicies,
  evolutionSelfHealingLogs,
  evolutionCycles,
  evolutionStepLogs,
  shadowEvalRecords,
  championChallengerExperiments,
  canaryDeployments,
  dojoTrainingJobs,
  knowledgeCrystals,
  evolutionInterventions,
} from '../../../drizzle/evolution-schema';

// ============================================================================
// 引擎模块常量
// ============================================================================
const ENGINE_MODULES = [
  'shadowEvaluator', 'championChallenger', 'canaryDeployer', 'otaFleet',
  'fsdIntervention', 'simulationEngine', 'dataEngine', 'dualFlywheel',
  'dojoTrainer', 'autoLabeler', 'domainRouter', 'metaLearner',
  'fleetPlanner', 'e2eAgent', 'closedLoopTracker',
] as const;

// ============================================================================
// 可观测性路由
// ============================================================================
export const observabilityRouter = router({
  // ─── 全链路追踪 ───

  /** 创建追踪 */
  startTrace: protectedProcedure
    .input(z.object({
      name: z.string(),
      operationType: z.string(),
      cycleId: z.number().optional(),
      trigger: z.string().default('manual'),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const traceId = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.insert(evolutionTraces).values({
          traceId,
          name: input.name,
          operationType: input.operationType,
          cycleId: input.cycleId ?? null,
          trigger: input.trigger,
          status: 'running',
          metadata: input.metadata ?? {},
        });
        // EventBus: 追踪创建
        await getOrchestrator().publishEvent(EVOLUTION_TOPICS.TRACE_CREATED, { operationType: input.operationType, trigger: input.trigger });
        getOrchestrator().recordMetric('evolution.trace.created', 1, { operationType: input.operationType });

        return { traceId, status: 'running' };
      } catch (e: any) { return { traceId: '', error: e.message }; }
    }),

  /** 结束追踪 */
  endTrace: protectedProcedure
    .input(z.object({
      traceId: z.string(),
      status: z.enum(['completed', 'failed', 'timeout']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionTraces)
          .where(eq(evolutionTraces.traceId, input.traceId)).limit(1);
        if (rows.length === 0) return { success: false, error: 'Trace not found' };
        const trace = rows[0];
        const now = new Date();
        const durationMs = now.getTime() - (trace.startedAt?.getTime() ?? now.getTime());
        const spanStats = await db.select({
          cnt: count(),
          errCnt: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
        }).from(evolutionSpans).where(eq(evolutionSpans.traceId, input.traceId));
        await db.update(evolutionTraces).set({
          status: input.status,
          completedAt: now,
          durationMs,
          spanCount: spanStats[0]?.cnt ?? 0,
          errorCount: Number(spanStats[0]?.errCnt ?? 0),
        }).where(eq(evolutionTraces.traceId, input.traceId));
        // EventBus: 追踪完成
        await getOrchestrator().publishEvent(EVOLUTION_TOPICS.TRACE_COMPLETED, { traceId: input.traceId });

        return { success: true, durationMs };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 添加 Span */
  addSpan: protectedProcedure
    .input(z.object({
      traceId: z.string(),
      parentSpanId: z.string().optional(),
      name: z.string(),
      engineModule: z.string(),
      inputSummary: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const spanId = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.insert(evolutionSpans).values({
          spanId,
          traceId: input.traceId,
          parentSpanId: input.parentSpanId ?? null,
          name: input.name,
          engineModule: input.engineModule,
          status: 'running',
          inputSummary: input.inputSummary ?? {},
        });
        return { spanId, status: 'running' };
      } catch (e: any) { return { spanId: '', error: e.message }; }
    }),

  /** 结束 Span */
  endSpan: protectedProcedure
    .input(z.object({
      spanId: z.string(),
      status: z.enum(['completed', 'failed', 'timeout']),
      outputSummary: z.record(z.string(), z.unknown()).optional(),
      errorMessage: z.string().optional(),
      resourceUsage: z.object({
        cpuMs: z.number().optional(),
        memoryMb: z.number().optional(),
        gpuMs: z.number().optional(),
        dbQueries: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const rows = await db.select().from(evolutionSpans)
          .where(eq(evolutionSpans.spanId, input.spanId)).limit(1);
        if (rows.length === 0) return { success: false, error: 'Span not found' };
        const span = rows[0];
        const now = new Date();
        const durationMs = now.getTime() - (span.startedAt?.getTime() ?? now.getTime());
        await db.update(evolutionSpans).set({
          status: input.status,
          completedAt: now,
          durationMs,
          outputSummary: input.outputSummary ?? null,
          errorMessage: input.errorMessage ?? null,
          resourceUsage: input.resourceUsage ?? null,
        }).where(eq(evolutionSpans.spanId, input.spanId));
        // EventBus: Span 完成
        getOrchestrator().recordMetric('evolution.span.completed', 1, { status: input.status });
        return { success: true, durationMs };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 列出追踪记录 */
  listTraces: publicProcedure
    .input(z.object({
      operationType: z.string().optional(),
      status: z.enum(['running', 'completed', 'failed', 'timeout']).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const conditions = [];
        if (input?.operationType) conditions.push(eq(evolutionTraces.operationType, input.operationType));
        if (input?.status) conditions.push(eq(evolutionTraces.status, input.status));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(evolutionTraces)
          .where(where)
          .orderBy(desc(evolutionTraces.startedAt))
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0);
        const totalRows = await db.select({ cnt: count() }).from(evolutionTraces).where(where);
        return { traces: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch (e: any) { return { traces: [], total: 0, error: e.message }; }
    }),

  /** 获取单条追踪详情（含所有 Span） */
  getTrace: publicProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const traceRows = await db.select().from(evolutionTraces)
          .where(eq(evolutionTraces.traceId, input.traceId)).limit(1);
        if (traceRows.length === 0) return { trace: null, spans: [] };
        const spans = await db.select().from(evolutionSpans)
          .where(eq(evolutionSpans.traceId, input.traceId))
          .orderBy(asc(evolutionSpans.startedAt));
        return { trace: traceRows[0], spans };
      } catch (e: any) { return { trace: null, spans: [], error: e.message }; }
    }),

  /** 获取追踪统计 */
  getTraceStats: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const [total, running, completed, failed] = await Promise.all([
          db.select({ cnt: count() }).from(evolutionTraces),
          db.select({ cnt: count() }).from(evolutionTraces).where(eq(evolutionTraces.status, 'running')),
          db.select({ cnt: count() }).from(evolutionTraces).where(eq(evolutionTraces.status, 'completed')),
          db.select({ cnt: count() }).from(evolutionTraces).where(eq(evolutionTraces.status, 'failed')),
        ]);
        // 平均耗时
        const avgDuration = await db.select({
          avg: sql<number>`AVG(duration_ms)`,
        }).from(evolutionTraces).where(eq(evolutionTraces.status, 'completed'));
        // 按操作类型分组
        const byType = await db.select({
          operationType: evolutionTraces.operationType,
          cnt: count(),
        }).from(evolutionTraces).groupBy(evolutionTraces.operationType);
        return {
          total: total[0]?.cnt ?? 0,
          running: running[0]?.cnt ?? 0,
          completed: completed[0]?.cnt ?? 0,
          failed: failed[0]?.cnt ?? 0,
          avgDurationMs: Number(avgDuration[0]?.avg ?? 0),
          byType: byType.map(r => ({ type: r.operationType, count: r.cnt })),
        };
      } catch {
        return { total: 0, running: 0, completed: 0, failed: 0, avgDurationMs: 0, byType: [] };
      }
    }),

  // ─── 性能指标 ───

  /** 记录指标快照 */
  recordMetric: protectedProcedure
    .input(z.object({
      metricName: z.string(),
      engineModule: z.string(),
      metricType: z.enum(['counter', 'gauge', 'histogram', 'summary']),
      value: z.number(),
      aggregations: z.object({
        min: z.number().optional(), max: z.number().optional(),
        avg: z.number().optional(), sum: z.number().optional(),
        count: z.number().optional(),
        p50: z.number().optional(), p95: z.number().optional(), p99: z.number().optional(),
      }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.insert(evolutionMetricSnapshots).values({
          metricName: input.metricName,
          engineModule: input.engineModule,
          metricType: input.metricType,
          value: input.value,
          aggregations: input.aggregations ?? null,
          tags: input.tags ?? null,
        });
        // EventBus: 指标快照
        await getOrchestrator().publishEvent(EVOLUTION_TOPICS.METRIC_SNAPSHOT, { engineModule: input.engineModule, metricName: input.metricName });
        getOrchestrator().recordMetric('evolution.metric.recorded', 1, { engineModule: input.engineModule });

        // ── 告警规则自动检查 → 告警触发 → 自愈策略联动闭环 ──
        try {
          const matchedRules = await db.select().from(evolutionAlertRules)
            .where(and(
              eq(evolutionAlertRules.engineModule, input.engineModule),
              eq(evolutionAlertRules.metricName, input.metricName),
              eq(evolutionAlertRules.enabled, 1),
            ));
          for (const rule of matchedRules) {
            const ops: Record<string, (v: number, t: number) => boolean> = {
              gt: (v, t) => v > t, gte: (v, t) => v >= t,
              lt: (v, t) => v < t, lte: (v, t) => v <= t,
              eq: (v, t) => v === t, neq: (v, t) => v !== t,
            };
            const check = ops[rule.operator];
            if (!check || !check(input.value, rule.threshold)) continue;
            // 冷却检查
            if (rule.lastTriggeredAt) {
              const elapsed = (Date.now() - new Date(rule.lastTriggeredAt).getTime()) / 1000;
              if (elapsed < (rule.cooldownSeconds ?? 300)) continue;
            }
            // 创建告警事件
            await db.insert(evolutionAlerts).values({
              ruleId: rule.id,
              alertName: rule.name,
              engineModule: rule.engineModule,
              severity: rule.severity ?? 'warning',
              metricValue: input.value,
              threshold: rule.threshold,
              status: 'firing',
              message: `${rule.metricName} ${rule.operator} ${rule.threshold} (actual: ${input.value})`,
            });
            // 更新规则触发时间和计数
            await db.update(evolutionAlertRules).set({
              lastTriggeredAt: new Date(),
              triggerCount: sql`${evolutionAlertRules.triggerCount} + 1`,
            }).where(eq(evolutionAlertRules.id, rule.id));
            // EventBus: 告警触发
            await getOrchestrator().publishEvent(EVOLUTION_TOPICS.ALERT_FIRED, {
              ruleId: rule.id, ruleName: rule.name,
              engineModule: rule.engineModule, severity: rule.severity,
              metricValue: input.value, threshold: rule.threshold,
            });
            // ── 自愈策略自动匹配与执行 ──
            const policies = await db.select().from(evolutionSelfHealingPolicies)
              .where(and(
                eq(evolutionSelfHealingPolicies.enabled, 1),
                sql`JSON_EXTRACT(${evolutionSelfHealingPolicies.triggerCondition}, '$.metricName') = ${rule.metricName}`,
              ));
            for (const policy of policies) {
              const cond = policy.triggerCondition as any;
              if (cond.engineModule && cond.engineModule !== rule.engineModule) continue;
              const policyCheck = ops[cond.operator];
              if (!policyCheck || !policyCheck(input.value, cond.threshold)) continue;
              // 冷却检查
              if (policy.lastExecutedAt) {
                const pe = (Date.now() - new Date(policy.lastExecutedAt).getTime()) / 1000;
                if (pe < policy.cooldownSeconds) continue;
              }
              // 记录自愈执行日志
              await db.insert(evolutionSelfHealingLogs).values({
                policyId: policy.id,
                policyName: policy.name,
                policyType: policy.policyType,
                triggerReason: `Alert: ${rule.name} - ${rule.metricName} ${rule.operator} ${rule.threshold} (actual: ${input.value})`,
                triggerMetricValue: input.value,
                status: 'executing',
                affectedModules: [rule.engineModule],
              });
              // 更新策略执行时间
              await db.update(evolutionSelfHealingPolicies).set({
                lastExecutedAt: new Date(),
                totalExecutions: sql`${evolutionSelfHealingPolicies.totalExecutions} + 1`,
              }).where(eq(evolutionSelfHealingPolicies.id, policy.id));
              // EventBus: 自愈策略触发
              await getOrchestrator().recordHealingExecution({
                policyId: String(policy.id),
                alertId: String(rule.id),
                engineModule: rule.engineModule,
                action: policy.policyType,
                success: true,
                duration: 0,
              });
            }
          }
        } catch (_alertErr) {
          // 告警检查失败不影响指标记录主流程
          console.warn('[observability] alert check failed:', _alertErr);
        }

        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 获取指标历史 */
  getMetricHistory: publicProcedure
    .input(z.object({
      metricName: z.string(),
      engineModule: z.string().optional(),
      hours: z.number().default(24),
      limit: z.number().default(200),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const since = new Date(Date.now() - input.hours * 3600 * 1000);
        const conditions = [
          eq(evolutionMetricSnapshots.metricName, input.metricName),
          gte(evolutionMetricSnapshots.collectedAt, since),
        ];
        if (input.engineModule) {
          conditions.push(eq(evolutionMetricSnapshots.engineModule, input.engineModule));
        }
        const rows = await db.select().from(evolutionMetricSnapshots)
          .where(and(...conditions))
          .orderBy(asc(evolutionMetricSnapshots.collectedAt))
          .limit(input.limit);
        return { points: rows };
      } catch (e: any) { return { points: [], error: e.message }; }
    }),

  /** 获取引擎健康度概览 */
  getEngineHealth: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        // 从各表获取引擎活跃度指标
        const [cycleCount, evalCount, expCount, deployCount, dojoCount, crystalCount, intCount, traceCount, alertCount] = await Promise.all([
          db.select({ cnt: count() }).from(evolutionCycles),
          db.select({ cnt: count() }).from(shadowEvalRecords),
          db.select({ cnt: count() }).from(championChallengerExperiments),
          db.select({ cnt: count() }).from(canaryDeployments),
          db.select({ cnt: count() }).from(dojoTrainingJobs),
          db.select({ cnt: count() }).from(knowledgeCrystals),
          db.select({ cnt: count() }).from(evolutionInterventions),
          db.select({ cnt: count() }).from(evolutionTraces),
          db.select({ cnt: count() }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'firing')),
        ]);
        // 最近24小时的追踪统计
        const since24h = new Date(Date.now() - 24 * 3600 * 1000);
        const recent = await db.select({
          cnt: count(),
          avgDur: sql<number>`AVG(duration_ms)`,
          errCnt: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
        }).from(evolutionTraces).where(gte(evolutionTraces.startedAt, since24h));

        const engines = ENGINE_MODULES.map(mod => ({
          module: mod,
          status: 'healthy' as 'healthy' | 'warning' | 'critical',
          activeAlerts: 0,
        }));

        // 用活跃告警数更新引擎状态
        const activeAlerts = await db.select({
          module: evolutionAlerts.engineModule,
          cnt: count(),
        }).from(evolutionAlerts)
          .where(eq(evolutionAlerts.status, 'firing'))
          .groupBy(evolutionAlerts.engineModule);
        for (const a of activeAlerts) {
          const eng = engines.find(e => e.module === a.module);
          if (eng) {
            eng.activeAlerts = a.cnt;
            eng.status = a.cnt >= 3 ? 'critical' : a.cnt >= 1 ? 'warning' : 'healthy';
          }
        }

        return {
          engines,
          summary: {
            totalCycles: cycleCount[0]?.cnt ?? 0,
            totalEvals: evalCount[0]?.cnt ?? 0,
            totalExperiments: expCount[0]?.cnt ?? 0,
            totalDeployments: deployCount[0]?.cnt ?? 0,
            totalDojoJobs: dojoCount[0]?.cnt ?? 0,
            totalCrystals: crystalCount[0]?.cnt ?? 0,
            totalInterventions: intCount[0]?.cnt ?? 0,
            totalTraces: traceCount[0]?.cnt ?? 0,
            firingAlerts: alertCount[0]?.cnt ?? 0,
          },
          recent24h: {
            traceCount: recent[0]?.cnt ?? 0,
            avgDurationMs: Number(recent[0]?.avgDur ?? 0),
            errorCount: Number(recent[0]?.errCnt ?? 0),
            errorRate: (recent[0]?.cnt ?? 0) > 0
              ? Number(recent[0]?.errCnt ?? 0) / (recent[0]?.cnt ?? 1)
              : 0,
          },
        };
      } catch {
        return {
          engines: ENGINE_MODULES.map(mod => ({ module: mod, status: 'healthy' as const, activeAlerts: 0 })),
          summary: {
            totalCycles: 0, totalEvals: 0, totalExperiments: 0, totalDeployments: 0,
            totalDojoJobs: 0, totalCrystals: 0, totalInterventions: 0, totalTraces: 0, firingAlerts: 0,
          },
          recent24h: { traceCount: 0, avgDurationMs: 0, errorCount: 0, errorRate: 0 },
        };
      }
    }),

  /** 获取最新指标快照（按模块分组） */
  getLatestMetrics: publicProcedure
    .input(z.object({ engineModule: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        // 获取每个指标的最新值（使用子查询）
        const conditions = input?.engineModule
          ? [eq(evolutionMetricSnapshots.engineModule, input.engineModule)]
          : [];
        const rows = await db.select().from(evolutionMetricSnapshots)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(evolutionMetricSnapshots.collectedAt))
          .limit(200);
        // 按 metricName 去重，保留最新
        const latest = new Map<string, typeof rows[0]>();
        for (const row of rows) {
          const key = `${row.engineModule}:${row.metricName}`;
          if (!latest.has(key)) latest.set(key, row);
        }
        return { metrics: Array.from(latest.values()) };
      } catch (e: any) { return { metrics: [], error: e.message }; }
    }),

  // ─── 告警规则引擎 ───

  /** 列出告警规则 */
  listAlertRules: publicProcedure
    .input(z.object({
      engineModule: z.string().optional(),
      severity: z.enum(['info', 'warning', 'critical', 'fatal']).optional(),
      enabled: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const conditions = [];
        if (input?.engineModule) conditions.push(eq(evolutionAlertRules.engineModule, input.engineModule));
        if (input?.severity) conditions.push(eq(evolutionAlertRules.severity, input.severity));
        if (input?.enabled !== undefined) conditions.push(eq(evolutionAlertRules.enabled, input.enabled ? 1 : 0));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(evolutionAlertRules).where(where)
          .orderBy(asc(evolutionAlertRules.engineModule), asc(evolutionAlertRules.name));
        return { rules: rows };
      } catch (e: any) { return { rules: [], error: e.message }; }
    }),

  /** 创建告警规则 */
  createAlertRule: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      engineModule: z.string(),
      metricName: z.string(),
      operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
      threshold: z.number(),
      severity: z.enum(['info', 'warning', 'critical', 'fatal']).default('warning'),
      durationSeconds: z.number().default(60),
      cooldownSeconds: z.number().default(300),
      notifyChannels: z.array(z.string()).optional(),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.insert(evolutionAlertRules).values({
          name: input.name,
          description: input.description ?? null,
          engineModule: input.engineModule,
          metricName: input.metricName,
          operator: input.operator,
          threshold: input.threshold,
          severity: input.severity,
          durationSeconds: input.durationSeconds,
          cooldownSeconds: input.cooldownSeconds,
          notifyChannels: input.notifyChannels ?? [],
          enabled: input.enabled ? 1 : 0,
        });
        // EventBus: 告警规则创建
        await getOrchestrator().publishEvent(EVOLUTION_TOPICS.ALERT_FIRED, { ruleName: input.name, engineModule: input.engineModule, severity: input.severity || 'warning' });

        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 更新告警规则 */
  updateAlertRule: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']).optional(),
      threshold: z.number().optional(),
      severity: z.enum(['info', 'warning', 'critical', 'fatal']).optional(),
      durationSeconds: z.number().optional(),
      cooldownSeconds: z.number().optional(),
      notifyChannels: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const updates: Record<string, any> = { updatedAt: new Date() };
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.operator !== undefined) updates.operator = input.operator;
        if (input.threshold !== undefined) updates.threshold = input.threshold;
        if (input.severity !== undefined) updates.severity = input.severity;
        if (input.durationSeconds !== undefined) updates.durationSeconds = input.durationSeconds;
        if (input.cooldownSeconds !== undefined) updates.cooldownSeconds = input.cooldownSeconds;
        if (input.notifyChannels !== undefined) updates.notifyChannels = input.notifyChannels;
        if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;
        await db.update(evolutionAlertRules).set(updates).where(eq(evolutionAlertRules.id, input.id));
        // EventBus: 告警规则更新
        getOrchestrator().recordMetric('evolution.alertRule.updated', 1);
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),
  /** 删除告警规则 */
  deleteAlertRule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.delete(evolutionAlertRules).where(eq(evolutionAlertRules.id, input.id));
        // EventBus: 告警规则删除
        getOrchestrator().recordMetric('evolution.alertRule.deleted', 1);
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 列出告警事件 */
  listAlerts: publicProcedure
    .input(z.object({
      status: z.enum(['firing', 'acknowledged', 'resolved', 'silenced']).optional(),
      severity: z.enum(['info', 'warning', 'critical', 'fatal']).optional(),
      engineModule: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const conditions = [];
        if (input?.status) conditions.push(eq(evolutionAlerts.status, input.status));
        if (input?.severity) conditions.push(eq(evolutionAlerts.severity, input.severity));
        if (input?.engineModule) conditions.push(eq(evolutionAlerts.engineModule, input.engineModule));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(evolutionAlerts).where(where)
          .orderBy(desc(evolutionAlerts.firedAt))
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0);
        const totalRows = await db.select({ cnt: count() }).from(evolutionAlerts).where(where);
        return { alerts: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch (e: any) { return { alerts: [], total: 0, error: e.message }; }
    }),

  /** 确认告警 */
  acknowledgeAlert: protectedProcedure
    .input(z.object({ id: z.number(), acknowledgedBy: z.string().default('operator') }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
         await db.update(evolutionAlerts).set({
          status: 'acknowledged',
          acknowledgedBy: input.acknowledgedBy,
          acknowledgedAt: new Date(),
        }).where(eq(evolutionAlerts.id, input.id));
        // EventBus: 告警确认
        getOrchestrator().recordMetric('evolution.alert.acknowledged', 1);
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),
  /** 解决告警 */
  resolveAlert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(evolutionAlerts).set({
          status: 'resolved',
          resolvedAt: new Date(),
        }).where(eq(evolutionAlerts.id, input.id));
        // EventBus: 告警解决
        await getOrchestrator().publishEvent(EVOLUTION_TOPICS.ALERT_RESOLVED, { alertId: input.id });

        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),

  /** 静默告警 */
  silenceAlert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        await db.update(evolutionAlerts).set({ status: 'silenced' })
          .where(eq(evolutionAlerts.id, input.id));
        // EventBus: 告警静默
        getOrchestrator().recordMetric('evolution.alert.silenced', 1);
        return { success: true };
      } catch (e: any) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message ?? "Unknown error" }); }
    }),
  /** 获取告警统计 */
  getAlertStats: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      try {
        const [total, firing, acked, resolved, silenced] = await Promise.all([
          db.select({ cnt: count() }).from(evolutionAlerts),
          db.select({ cnt: count() }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'firing')),
          db.select({ cnt: count() }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'acknowledged')),
          db.select({ cnt: count() }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'resolved')),
          db.select({ cnt: count() }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'silenced')),
        ]);
        // 按严重级别分组
        const bySeverity = await db.select({
          severity: evolutionAlerts.severity,
          cnt: count(),
        }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'firing')).groupBy(evolutionAlerts.severity);
        // 按模块分组
        const byModule = await db.select({
          module: evolutionAlerts.engineModule,
          cnt: count(),
        }).from(evolutionAlerts).where(eq(evolutionAlerts.status, 'firing')).groupBy(evolutionAlerts.engineModule);
        return {
          total: total[0]?.cnt ?? 0,
          firing: firing[0]?.cnt ?? 0,
          acknowledged: acked[0]?.cnt ?? 0,
          resolved: resolved[0]?.cnt ?? 0,
          silenced: silenced[0]?.cnt ?? 0,
          bySeverity: bySeverity.map(r => ({ severity: r.severity, count: r.cnt })),
          byModule: byModule.map(r => ({ module: r.module, count: r.cnt })),
        };
      } catch {
        return { total: 0, firing: 0, acknowledged: 0, resolved: 0, silenced: 0, bySeverity: [], byModule: [] };
      }
    }),

  /** 种子化默认告警规则 */
  seedAlertRules: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const existing = await db.select({ cnt: count() }).from(evolutionAlertRules);
      if ((existing[0]?.cnt ?? 0) > 0) return { success: true, message: '告警规则已存在', seeded: 0 };

      const defaultRules = [
        { name: '影子评估失败率过高', engineModule: 'shadowEvaluator', metricName: 'shadow_eval.failure_rate', operator: 'gt' as const, threshold: 0.1, severity: 'critical' as const, description: '影子评估失败率超过10%' },
        { name: '影子评估延迟过高', engineModule: 'shadowEvaluator', metricName: 'shadow_eval.latency_p95', operator: 'gt' as const, threshold: 30000, severity: 'warning' as const, description: '影子评估P95延迟超过30秒' },
        { name: '冠军挑战实验超时', engineModule: 'championChallenger', metricName: 'champion.experiment_timeout_rate', operator: 'gt' as const, threshold: 0.05, severity: 'warning' as const, description: '冠军挑战实验超时率超过5%' },
        { name: '金丝雀部署回滚率', engineModule: 'canaryDeployer', metricName: 'canary.rollback_rate', operator: 'gt' as const, threshold: 0.2, severity: 'critical' as const, description: '金丝雀部署回滚率超过20%' },
        { name: '金丝雀健康检查失败', engineModule: 'canaryDeployer', metricName: 'canary.health_check_fail_rate', operator: 'gt' as const, threshold: 0.1, severity: 'warning' as const, description: '金丝雀健康检查失败率超过10%' },
        { name: 'FSD干预率异常', engineModule: 'fsdIntervention', metricName: 'fsd.intervention_rate', operator: 'gt' as const, threshold: 0.05, severity: 'critical' as const, description: 'FSD干预率超过5%' },
        { name: '仿真引擎通过率过低', engineModule: 'simulationEngine', metricName: 'simulation.pass_rate', operator: 'lt' as const, threshold: 0.8, severity: 'warning' as const, description: '仿真场景通过率低于80%' },
        { name: 'Dojo训练任务失败', engineModule: 'dojoTrainer', metricName: 'dojo.job_failure_rate', operator: 'gt' as const, threshold: 0.1, severity: 'critical' as const, description: 'Dojo训练任务失败率超过10%' },
        { name: 'Dojo GPU利用率过低', engineModule: 'dojoTrainer', metricName: 'dojo.gpu_utilization', operator: 'lt' as const, threshold: 0.5, severity: 'info' as const, description: 'Dojo GPU利用率低于50%' },
        { name: '自动标注置信度下降', engineModule: 'autoLabeler', metricName: 'labeler.avg_confidence', operator: 'lt' as const, threshold: 0.8, severity: 'warning' as const, description: '自动标注平均置信度低于80%' },
        { name: '进化周期超时', engineModule: 'closedLoopTracker', metricName: 'cycle.duration_hours', operator: 'gt' as const, threshold: 48, severity: 'warning' as const, description: '进化周期运行超过48小时' },
        { name: '知识结晶验证失败率', engineModule: 'closedLoopTracker', metricName: 'crystal.verification_fail_rate', operator: 'gt' as const, threshold: 0.3, severity: 'warning' as const, description: '知识结晶验证失败率超过30%' },
        { name: '领域路由错误率', engineModule: 'domainRouter', metricName: 'router.error_rate', operator: 'gt' as const, threshold: 0.05, severity: 'critical' as const, description: '领域路由错误率超过5%' },
        { name: '飞轮加速度下降', engineModule: 'dualFlywheel', metricName: 'flywheel.velocity', operator: 'lt' as const, threshold: 0.5, severity: 'info' as const, description: '飞轮迭代速度低于0.5次/天' },
        { name: 'OTA部署成功率下降', engineModule: 'otaFleet', metricName: 'ota.deploy_success_rate', operator: 'lt' as const, threshold: 0.95, severity: 'critical' as const, description: 'OTA部署成功率低于95%' },
      ];

      let seeded = 0;
      for (const rule of defaultRules) {
        try {
          await db.insert(evolutionAlertRules).values({
            name: rule.name,
            description: rule.description,
            engineModule: rule.engineModule,
            metricName: rule.metricName,
            operator: rule.operator,
            threshold: rule.threshold,
            severity: rule.severity,
            durationSeconds: 60,
            cooldownSeconds: 300,
            notifyChannels: ['webhook', 'email'],
            enabled: 1,
          });
          seeded++;
        } catch { /* ignore duplicates */ }
      }
      return { success: true, message: `已种子化 ${seeded} 条告警规则`, seeded };
    }),
});
