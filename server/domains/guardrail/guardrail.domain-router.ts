/**
 * ============================================================================
 * 护栏领域路由聚合 — ③护栏闭环
 * ============================================================================
 *
 * Phase 4 v5.0 升级：
 *   - G3：效果评估引擎（byRule 查预计算表 + overview 实际统计 + dailyStats 服务端预聚合）
 *   - G10：效果评估批处理任务入口
 *   - G11：护栏↔结晶协同事件流
 *   - 升级链管理路由（resolveEscalation）
 *   - 效果日志写入路由（logEffectiveness）
 *
 * 职责边界：安全/健康/高效干预规则管理 + 触发记录 + 效果评估 + 协同事件
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('guardrail');
import { getDb } from '../../lib/db';
import { eq, desc, count, and, gte, sql } from 'drizzle-orm';
import {
  guardrailRules,
  guardrailViolations,
  guardrailEffectivenessLogs,
  knowledgeCrystals,
  crystalApplications,
} from '../../../drizzle/evolution-schema';

// ============================================================================
// 护栏规则管理路由
// ============================================================================

const ruleRouter = router({
  list: publicProcedure
    .input(z.object({
      type: z.enum(['safety', 'health', 'efficiency']).optional(),
      enabled: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rules: [], total: 0 };
      try {
        const conditions = [];
        if (input?.type) conditions.push(eq(guardrailRules.type, input.type));
        if (input?.enabled !== undefined) conditions.push(eq(guardrailRules.enabled, input.enabled));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(guardrailRules).where(where).orderBy(guardrailRules.priority);
        const totalRows = await db.select({ cnt: count() }).from(guardrailRules).where(where);
        return { rules: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { rules: [], total: 0 }; }
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rule: null };
      try {
        const rows = await db.select().from(guardrailRules).where(eq(guardrailRules.id, input.id)).limit(1);
        return { rule: rows[0] ?? null };
      } catch { return { rule: null }; }
    }),

  create: publicProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(['safety', 'health', 'efficiency']),
      description: z.string().optional(),
      condition: z.object({
        field: z.string(),
        operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'between', 'and', 'or']),
        threshold: z.number().optional(),
        thresholds: z.tuple([z.number(), z.number()]).optional(),
        physicalBasis: z.string().optional(),
      }),
      action: z.object({
        action: z.string(),
        params: z.record(z.string(), z.unknown()),
        escalation: z.object({
          action: z.string(),
          params: z.record(z.string(), z.unknown()),
          delayMs: z.number(),
        }).optional(),
      }),
      priority: z.number().default(100),
      physicalBasis: z.string().optional(),
      cooldownMs: z.number().default(60000),
      escalationConfig: z.object({
        levels: z.array(z.object({
          action: z.enum(['alert', 'throttle', 'halt']),
          delayMs: z.number(),
        })),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0, success: false };
      try {
        const result = await db.insert(guardrailRules).values({
          name: input.name,
          type: input.type,
          description: input.description ?? null,
          condition: input.condition,
          action: input.action,
          priority: input.priority,
          physicalBasis: input.physicalBasis ?? null,
          enabled: true,
          version: '1.0.0',
          cooldownMs: input.cooldownMs,
          escalationConfig: input.escalationConfig ? JSON.stringify(input.escalationConfig) : null,
        } as any);
        return { id: Number(result[0].insertId), success: true };
      } catch (e) { log.warn({ err: e }, '[guardrail.create] rule creation failed'); return { id: 0, success: false }; }
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      type: z.enum(['safety', 'health', 'efficiency']).optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      condition: z.object({
        field: z.string(),
        operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'between', 'and', 'or']),
        threshold: z.number().optional(),
        thresholds: z.tuple([z.number(), z.number()]).optional(),
        physicalBasis: z.string().optional(),
      }).optional(),
      action: z.object({
        action: z.string(),
        params: z.record(z.string(), z.unknown()),
        escalation: z.object({
          action: z.string(),
          params: z.record(z.string(), z.unknown()),
          delayMs: z.number(),
        }).optional(),
      }).optional(),
      priority: z.number().optional(),
      physicalBasis: z.string().optional(),
      cooldownMs: z.number().optional(),
      escalationConfig: z.object({
        levels: z.array(z.object({
          action: z.enum(['alert', 'throttle', 'halt']),
          delayMs: z.number(),
        })),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        const updateSet: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) updateSet.name = input.name;
        if (input.type !== undefined) updateSet.type = input.type;
        if (input.description !== undefined) updateSet.description = input.description;
        if (input.enabled !== undefined) updateSet.enabled = input.enabled;
        if (input.condition !== undefined) updateSet.condition = input.condition;
        if (input.action !== undefined) updateSet.action = input.action;
        if (input.priority !== undefined) updateSet.priority = input.priority;
        if (input.physicalBasis !== undefined) updateSet.physicalBasis = input.physicalBasis;
        if (input.cooldownMs !== undefined) updateSet.cooldownMs = input.cooldownMs;
        if (input.escalationConfig !== undefined) updateSet.escalationConfig = JSON.stringify(input.escalationConfig);
        await db.update(guardrailRules).set(updateSet).where(eq(guardrailRules.id, input.id));
        return { success: true };
      } catch (e) { log.warn({ err: e }, '[guardrail.update] rule update failed'); return { success: false }; }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.delete(guardrailRules).where(eq(guardrailRules.id, input.id));
        return { success: true };
      } catch { return { success: false }; }
    }),
});

// ============================================================================
// 护栏触发记录路由
// ============================================================================

const violationRouter = router({
  list: publicProcedure
    .input(z.object({
      machineId: z.string().optional(),
      ruleId: z.number().optional(),
      outcome: z.enum(['executed', 'overridden', 'failed', 'pending']).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { violations: [], total: 0 };
      try {
        const conditions = [];
        if (input.machineId) conditions.push(eq(guardrailViolations.machineId, input.machineId));
        if (input.ruleId) conditions.push(eq(guardrailViolations.ruleId, input.ruleId));
        if (input.outcome) conditions.push(eq(guardrailViolations.outcome, input.outcome));
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await db.select().from(guardrailViolations)
          .where(where)
          .orderBy(desc(guardrailViolations.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const totalRows = await db.select({ cnt: count() }).from(guardrailViolations).where(where);
        return { violations: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { violations: [], total: 0 }; }
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { violation: null };
      try {
        const rows = await db.select().from(guardrailViolations).where(eq(guardrailViolations.id, input.id)).limit(1);
        return { violation: rows[0] ?? null };
      } catch { return { violation: null }; }
    }),

  override: publicProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(guardrailViolations)
          .set({ outcome: 'overridden' })
          .where(eq(guardrailViolations.id, input.id));
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** G3 新增：解除升级链（resolve escalation） */
  resolve: publicProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(guardrailViolations)
          .set({
            outcome: 'executed',
            resolvedAt: new Date(),
          } as any)
          .where(eq(guardrailViolations.id, input.id));
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** G3 新增：服务端预聚合每日统计 */
  dailyStats: publicProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - input.days);

        const stats = await db.select({
          date: sql`DATE(created_at)`.as('date'),
          count: count(),
          avgSeverity: sql`COALESCE(AVG(severity), 0)`.as('avgSeverity'),
        })
        .from(guardrailViolations)
        .where(gte(guardrailViolations.createdAt, cutoffDate))
        .groupBy(sql`DATE(created_at)`)
        .orderBy(sql`DATE(created_at)`);

        return stats;
      } catch { return []; }
    }),
});

// ============================================================================
// G3：护栏效果评估路由（重写）
// ============================================================================

const effectivenessRouter = router({
  /** 按规则查效果（查预计算表 guardrail_effectiveness_logs） */
  byRule: publicProcedure
    .input(z.object({
      days: z.number().default(30),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { stats: [] };
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - input.days);

        const stats = await db.select()
          .from(guardrailEffectivenessLogs)
          .where(gte(guardrailEffectivenessLogs.periodEnd, cutoffDate.toISOString().slice(0, 10)))
          .orderBy(desc(guardrailEffectivenessLogs.computedAt));

        // 按 ruleId 取最新一条记录
        const latestByRule = new Map<number, any>();
        for (const s of stats) {
          if (!latestByRule.has(s.ruleId)) {
            // 查规则名称
            const ruleRows = await db.select().from(guardrailRules)
              .where(eq(guardrailRules.id, s.ruleId)).limit(1);
            latestByRule.set(s.ruleId, {
              ...s,
              ruleName: ruleRows[0]?.name ?? `规则 #${s.ruleId}`,
              ruleType: ruleRows[0]?.type ?? 'safety',
              precision: s.totalTriggers > 0
                ? s.truePositives / s.totalTriggers
                : 0,
            });
          }
        }
        return { stats: Array.from(latestByRule.values()) };
      } catch { return { stats: [] }; }
    }),

  /** 全局概览（实际统计，不再硬编码） */
  overview: publicProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalTriggers: 0, executionRate: 0, falsePositiveRate: 0, dataAsOf: null };
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - input.days);

        // 总触发次数
        const totalRows = await db.select({ cnt: count() }).from(guardrailViolations)
          .where(gte(guardrailViolations.createdAt, cutoffDate));
        const total = totalRows[0]?.cnt ?? 0;

        // 已执行次数
        const executedRows = await db.select({ cnt: count() }).from(guardrailViolations)
          .where(and(
            gte(guardrailViolations.createdAt, cutoffDate),
            eq(guardrailViolations.outcome, 'executed'),
          ));
        const executed = executedRows[0]?.cnt ?? 0;

        // 覆盖次数（视为误报近似）
        const overriddenRows = await db.select({ cnt: count() }).from(guardrailViolations)
          .where(and(
            gte(guardrailViolations.createdAt, cutoffDate),
            eq(guardrailViolations.outcome, 'overridden'),
          ));
        const overridden = overriddenRows[0]?.cnt ?? 0;

        // 从效果日志获取最新计算时间
        const latestLog = await db.select().from(guardrailEffectivenessLogs)
          .orderBy(desc(guardrailEffectivenessLogs.computedAt))
          .limit(1);

        return {
          totalTriggers: total,
          executionRate: total > 0 ? Math.round((executed / total) * 100) / 100 : 0,
          falsePositiveRate: total > 0 ? Math.round((overridden / total) * 100) / 100 : 0,
          dataAsOf: latestLog[0]?.computedAt?.toISOString() ?? null,
        };
      } catch { return { totalTriggers: 0, executionRate: 0, falsePositiveRate: 0, dataAsOf: null }; }
    }),

  /** G10：手动触发效果评估批处理 */
  runBatchEvaluation: publicProcedure
    .input(z.object({ days: z.number().default(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, processed: 0 };
      try {
        const periodEnd = new Date();
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - input.days);

        // 获取所有规则
        const rules = await db.select().from(guardrailRules);
        let processed = 0;

        for (const rule of rules) {
          // 统计该规则在时间段内的触发情况
          const totalRows = await db.select({ cnt: count() }).from(guardrailViolations)
            .where(and(
              eq(guardrailViolations.ruleId, rule.id),
              gte(guardrailViolations.createdAt, periodStart),
            ));
          const total = totalRows[0]?.cnt ?? 0;

          const executedRows = await db.select({ cnt: count() }).from(guardrailViolations)
            .where(and(
              eq(guardrailViolations.ruleId, rule.id),
              gte(guardrailViolations.createdAt, periodStart),
              eq(guardrailViolations.outcome, 'executed'),
            ));
          const truePositives = executedRows[0]?.cnt ?? 0;

          const overriddenRows = await db.select({ cnt: count() }).from(guardrailViolations)
            .where(and(
              eq(guardrailViolations.ruleId, rule.id),
              gte(guardrailViolations.createdAt, periodStart),
              eq(guardrailViolations.outcome, 'overridden'),
            ));
          const falsePositives = overriddenRows[0]?.cnt ?? 0;

          // 计算平均严重度
          const severityResult = await db.select({
            avg: sql`COALESCE(AVG(severity), 0)`.as('avg'),
          }).from(guardrailViolations)
            .where(and(
              eq(guardrailViolations.ruleId, rule.id),
              gte(guardrailViolations.createdAt, periodStart),
            ));

          // 写入效果日志
          await db.insert(guardrailEffectivenessLogs).values({
            ruleId: rule.id,
            periodStart: periodStart.toISOString().slice(0, 10),
            periodEnd: periodEnd.toISOString().slice(0, 10),
            totalTriggers: total,
            truePositives,
            falsePositives,
            avgSeverity: Number(severityResult[0]?.avg ?? 0),
          } as any);

          processed++;
        }

        log.info(`[G10] 效果评估批处理完成: ${processed} 条规则已处理`);
        return { success: true, processed };
      } catch (e) {
        log.error({ err: e }, '[G10] 效果评估批处理失败');
        return { success: false, processed: 0 };
      }
    }),
});

// ============================================================================
// G11：护栏↔结晶协同事件路由
// ============================================================================

const synergisticRouter = router({
  /**
   * 协同流 1：violation 确认 → 自动生成结晶候选
   * 当 violation 被确认（executed）时，自动提取模式并创建 draft 结晶
   */
  generateCrystalFromViolation: publicProcedure
    .input(z.object({
      violationId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, crystalId: null };
      try {
        // 获取 violation 详情
        const violations = await db.select().from(guardrailViolations)
          .where(eq(guardrailViolations.id, input.violationId)).limit(1);
        if (!violations[0]) return { success: false, crystalId: null };

        const v = violations[0];
        // 获取关联规则
        const rules = await db.select().from(guardrailRules)
          .where(eq(guardrailRules.id, v.ruleId)).limit(1);
        const rule = rules[0];

        // 生成结晶 pattern
        const pattern = {
          sourceType: 'guardrail_violation',
          ruleId: v.ruleId,
          ruleName: rule?.name ?? `规则 #${v.ruleId}`,
          ruleType: rule?.type ?? 'safety',
          machineId: v.machineId,
          condition: rule?.condition ?? {},
          triggerContext: v.context ?? {},
          severity: (v as any).severity ?? 0.5,
          discoveredAt: v.createdAt.toISOString(),
        };

        const crypto = await import('crypto');
        const contentHash = crypto.createHash('md5').update(JSON.stringify(pattern)).digest('hex');

        const [result] = await db.insert(knowledgeCrystals).values({
          name: `[护栏触发] ${rule?.name ?? '未知规则'} @ ${v.machineId}`,
          type: 'anomaly_signature',
          pattern: JSON.stringify(pattern),
          confidence: (v as any).severity ?? 0.5,
          sourceType: 'guardrail',
          status: 'draft',
          contentHash,
          createdBy: 'system:guardrail',
          applicationCount: 0,
          negativeFeedbackRate: 0,
        } as any).onDuplicateKeyUpdate({
          set: {
            verificationCount: sql`verification_count + 1`,
            lastVerifiedAt: new Date(),
          },
        });

        const crystalId = (result as any).insertId;
        log.info(`[G11] 协同结晶生成: violation=${input.violationId} → crystal=${crystalId}`);
        return { success: true, crystalId };
      } catch (e) {
        log.error({ err: e }, '[G11] 协同结晶生成失败');
        return { success: false, crystalId: null };
      }
    }),

  /**
   * 协同流 2：threshold_update 结晶 approved → 规则阈值修订建议
   */
  suggestThresholdRevision: publicProcedure
    .input(z.object({
      crystalId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { suggestions: [] };
      try {
        const crystals = await db.select().from(knowledgeCrystals)
          .where(eq(knowledgeCrystals.id, input.crystalId)).limit(1);
        if (!crystals[0] || crystals[0].type !== 'threshold_update') {
          return { suggestions: [], note: '仅 threshold_update 类型结晶支持阈值修订建议' };
        }

        const crystal = crystals[0];
        const pattern = typeof crystal.pattern === 'string'
          ? JSON.parse(crystal.pattern)
          : crystal.pattern;

        // 查找关联的护栏规则
        const allRules = await db.select().from(guardrailRules);
        const suggestions = [];

        for (const rule of allRules) {
          const condition = rule.condition as any;
          if (!condition?.field) continue;

          // 检查 pattern 中是否有对应字段的阈值更新
          const updates = pattern.updates ?? pattern.thresholds ?? [];
          for (const update of updates) {
            if (update.field === condition.field) {
              suggestions.push({
                ruleId: rule.id,
                ruleName: rule.name,
                field: update.field,
                currentThreshold: condition.threshold,
                suggestedThreshold: update.suggestedThreshold ?? update.adaptedValue,
                reason: update.reason ?? `基于结晶 #${crystal.id} 的阈值更新建议`,
                confidence: crystal.confidence,
              });
            }
          }
        }

        return { suggestions };
      } catch { return { suggestions: [] }; }
    }),

  /**
   * 协同流 3：crystal outcome 更新 → 修订规则误报率
   * 当结晶应用效果为 negative 时，关联规则的误报率应更新
   */
  updateRuleFPRFromCrystal: publicProcedure
    .input(z.object({
      crystalId: z.number(),
      outcome: z.enum(['positive', 'negative', 'neutral']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        // 记录应用
        await db.insert(crystalApplications).values({
          crystalId: input.crystalId,
          appliedIn: 'guardrail_synergy',
          outcome: input.outcome,
        } as any);

        // 更新结晶的 negativeFeedbackRate
        if (input.outcome === 'negative') {
          await db.update(knowledgeCrystals).set({
            negativeFeedbackRate: sql`(negative_feedback_rate * application_count + 1) / (application_count + 1)`,
            applicationCount: sql`application_count + 1`,
          } as any).where(eq(knowledgeCrystals.id, input.crystalId));
        } else {
          await db.update(knowledgeCrystals).set({
            negativeFeedbackRate: sql`(negative_feedback_rate * application_count) / (application_count + 1)`,
            applicationCount: sql`application_count + 1`,
          } as any).where(eq(knowledgeCrystals.id, input.crystalId));
        }

        return { success: true };
      } catch { return { success: false }; }
    }),
});

// ============================================================================
// 护栏领域聚合路由
// ============================================================================

export const guardrailDomainRouter = router({
  rule: ruleRouter,
  violation: violationRouter,
  effectiveness: effectivenessRouter,
  /** G11：护栏↔结晶协同 */
  synergy: synergisticRouter,

  // ========== 前端仪表盘 Facade 方法 ==========

  /** 列出护栏规则（GuardrailConsole 页面使用） */
  listRules: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const rules = await db.select().from(guardrailRules).orderBy(guardrailRules.priority);
        const result = await Promise.all(rules.map(async (rule) => {
          const triggerRows = await db.select({ cnt: count() }).from(guardrailViolations)
            .where(eq(guardrailViolations.ruleId, rule.id));
          const lastTrigger = await db.select().from(guardrailViolations)
            .where(eq(guardrailViolations.ruleId, rule.id))
            .orderBy(desc(guardrailViolations.createdAt))
            .limit(1);

          return {
            id: String(rule.id),
            name: rule.name,
            category: rule.type as 'safety' | 'health' | 'efficiency',
            enabled: rule.enabled,
            severity: (rule.priority <= 50 ? 'critical' : rule.priority <= 100 ? 'high' : 'medium') as 'critical' | 'high' | 'medium' | 'low',
            description: rule.description ?? '',
            conditionSummary: JSON.stringify(rule.condition),
            triggerCount: triggerRows[0]?.cnt ?? 0,
            lastTriggeredAt: lastTrigger[0]?.createdAt?.toISOString() ?? null,
            cooldownMs: (rule as any).cooldownMs ?? 60000,
            escalationConfig: (rule as any).escalationConfig ?? null,
          };
        }));
        return result;
      } catch { return []; }
    }),

  /** 列出告警历史（GuardrailConsole 页面使用） */
  listAlertHistory: publicProcedure
    .input(z.object({
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const violations = await db.select().from(guardrailViolations)
          .orderBy(desc(guardrailViolations.createdAt))
          .limit(input.limit);

        const ruleIds = [...new Set(violations.map(v => v.ruleId))];
        const rulesMap = new Map<number, typeof guardrailRules.$inferSelect>();
        for (const ruleId of ruleIds) {
          const rows = await db.select().from(guardrailRules).where(eq(guardrailRules.id, ruleId)).limit(1);
          if (rows[0]) rulesMap.set(ruleId, rows[0]);
        }

        return violations.map(v => {
          const rule = rulesMap.get(v.ruleId);
          return {
            id: String(v.id),
            ruleId: String(v.ruleId),
            ruleName: rule?.name ?? `规则 #${v.ruleId}`,
            category: (rule?.type ?? 'safety') as 'safety' | 'health' | 'efficiency',
            severity: (rule ? (rule.priority <= 50 ? 'critical' : rule.priority <= 100 ? 'high' : 'medium') : 'medium') as 'critical' | 'high' | 'medium' | 'low',
            equipmentId: v.machineId,
            message: `${rule?.name ?? '规则'} 触发于设备 ${v.machineId}`,
            action: v.action ?? 'alert',
            acknowledged: v.outcome === 'executed' || v.outcome === 'overridden',
            createdAt: v.createdAt.toISOString(),
            acknowledgedAt: v.outcome === 'executed' ? v.createdAt.toISOString() : null,
            escalationLevel: (v as any).escalationLevel ?? 1,
            violationSeverity: (v as any).severity ?? null,
            resolvedAt: (v as any).resolvedAt?.toISOString() ?? null,
          };
        });
      } catch { return []; }
    }),

  /** 列出未确认告警（CognitiveDashboard 页面使用） */
  listAlerts: publicProcedure
    .input(z.object({
      limit: z.number().default(50),
      acknowledged: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input.acknowledged === false) {
          conditions.push(eq(guardrailViolations.outcome, 'pending'));
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const violations = await db.select().from(guardrailViolations)
          .where(where)
          .orderBy(desc(guardrailViolations.createdAt))
          .limit(input.limit);

        const ruleIds = [...new Set(violations.map(v => v.ruleId))];
        const rulesMap = new Map<number, typeof guardrailRules.$inferSelect>();
        for (const ruleId of ruleIds) {
          const rows = await db.select().from(guardrailRules).where(eq(guardrailRules.id, ruleId)).limit(1);
          if (rows[0]) rulesMap.set(ruleId, rows[0]);
        }

        return violations.map(v => {
          const rule = rulesMap.get(v.ruleId);
          return {
            id: String(v.id),
            ruleId: String(v.ruleId),
            category: (rule?.type ?? 'safety') as 'safety' | 'health' | 'efficiency',
            severity: (rule ? (rule.priority <= 50 ? 'critical' : rule.priority <= 100 ? 'high' : 'medium') : 'medium') as 'critical' | 'high' | 'medium' | 'low',
            equipmentId: v.machineId,
            message: `${rule?.name ?? '规则'} 触发于设备 ${v.machineId}`,
            acknowledged: v.outcome === 'executed' || v.outcome === 'overridden',
            createdAt: v.createdAt.toISOString(),
            escalationLevel: (v as any).escalationLevel ?? 1,
          };
        });
      } catch { return []; }
    }),

  /** 切换规则启用状态（GuardrailConsole 页面使用） */
  toggleRule: publicProcedure
    .input(z.object({
      ruleId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(guardrailRules)
          .set({ enabled: input.enabled })
          .where(eq(guardrailRules.id, Number(input.ruleId)));
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** 确认告警（CognitiveDashboard 页面使用） */
  acknowledgeAlert: publicProcedure
    .input(z.object({
      alertId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(guardrailViolations)
          .set({
            outcome: 'executed',
            resolvedAt: new Date(),
          } as any)
          .where(eq(guardrailViolations.id, Number(input.alertId)));
        return { success: true };
      } catch { return { success: false }; }
    }),
});
