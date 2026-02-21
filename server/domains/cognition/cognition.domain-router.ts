/**
 * ============================================================================
 * 认知领域路由聚合 — ②诊断闭环
 * ============================================================================
 * 职责边界：认知引擎全链路 + 世界模型 + Grok 推理 + 诊断报告
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, sql, and, gte, count } from 'drizzle-orm';
import {
  cognitionSessions,
  grokReasoningChains,
  guardrailViolations,
  guardrailRules,
  conditionProfiles,
  samplingConfigs,
  knowledgeCrystals,
  featureDefinitions,
  evolutionCycles,
  shadowEvalRecords,
  championChallengerExperiments,
  equipmentProfiles,
  toolDefinitions,
  edgeCases,
} from '../../../drizzle/evolution-schema';
import { dataConnectors, kgNodes, kgEdges, pipelines, pipelineRuns } from '../../../drizzle/schema';

// ============================================================================
// 认知会话路由
// ============================================================================

const sessionRouter = router({
  /** 触发认知会话 */
  trigger: publicProcedure
    .input(z.object({
      machineId: z.string(),
      triggerType: z.enum(['anomaly', 'scheduled', 'manual', 'chain', 'drift', 'guardrail_feedback']),
      priority: z.enum(['critical', 'high', 'normal']).default('normal'),
      context: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { sessionId: '', status: 'failed' };
      try {
        const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        await db.insert(cognitionSessions).values({
          id: sessionId,
          machineId: input.machineId,
          triggerType: input.triggerType,
          priority: input.priority,
          status: 'running',
          startedAt: new Date(),
        });
        return { sessionId, status: 'running' };
      } catch (e) { console.error('[cognition.trigger]', e); return { sessionId: '', status: 'failed' }; }
    }),

  /** 获取会话详情 */
  get: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { session: null };
      try {
        const rows = await db.select().from(cognitionSessions)
          .where(eq(cognitionSessions.id, input.sessionId)).limit(1);
        return { session: rows[0] ?? null };
      } catch { return { session: null }; }
    }),

  /** 列出会话 */
  list: publicProcedure
    .input(z.object({
      machineId: z.string().optional(),
      status: z.enum(['running', 'completed', 'failed', 'timeout']).optional(),
      triggerType: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { sessions: [], total: 0 };
      try {
        const conditions = [];
        if (input.machineId) conditions.push(eq(cognitionSessions.machineId, input.machineId));
        if (input.status) conditions.push(eq(cognitionSessions.status, input.status));
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await db.select().from(cognitionSessions)
          .where(where)
          .orderBy(desc(cognitionSessions.startedAt))
          .limit(input.limit)
          .offset(input.offset);

        const totalRows = await db.select({ cnt: count() }).from(cognitionSessions).where(where);
        return { sessions: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { sessions: [], total: 0 }; }
    }),

  /** 获取会话的四维结果 */
  getDimensionResults: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { dimensions: [] };
      try {
        const rows = await db.select().from(cognitionSessions)
          .where(eq(cognitionSessions.id, input.sessionId)).limit(1);
        const session = rows[0];
        if (!session) return { dimensions: [] };
        return { dimensions: (session as any).diagnosticsJson ?? [] };
      } catch { return { dimensions: [] }; }
    }),

  /** 获取会话的 Grok 推理链 */
  getReasoningChain: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { steps: [], totalSteps: 0 };
      try {
        const rows = await db.select().from(grokReasoningChains)
          .where(eq(grokReasoningChains.sessionId, input.sessionId))
          .orderBy(grokReasoningChains.stepIndex);
        return { steps: rows, totalSteps: rows.length };
      } catch { return { steps: [], totalSteps: 0 }; }
    }),
});

// ============================================================================
// 世界模型路由
// ============================================================================

const worldModelRouter = router({
  /** 获取设备最新世界模型快照 */
  getSnapshot: publicProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ input }) => {
      return { snapshot: null };
    }),

  /** 预测设备未来状态 */
  predict: publicProcedure
    .input(z.object({
      machineId: z.string(),
      horizonMinutes: z.number().min(5).max(1440),
      scenario: z.record(z.string(), z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      return { predictions: [], confidence: 0 };
    }),

  /** 反事实推理 */
  counterfactual: publicProcedure
    .input(z.object({
      machineId: z.string(),
      hypothesis: z.string(),
      variables: z.record(z.string(), z.number()),
    }))
    .mutation(async ({ input }) => {
      return { alternateState: null, probability: 0, explanation: '' };
    }),

  /** 获取预测历史（含事后验证） */
  getPredictionHistory: publicProcedure
    .input(z.object({
      machineId: z.string(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      return { predictions: [], avgError: 0 };
    }),
});

// ============================================================================
// 物理公式路由
// ============================================================================

const physicsRouter = router({
  /** 列出所有公式 */
  listFormulas: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      equipmentType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return { formulas: [] };
    }),

  /** 计算物理公式 */
  compute: publicProcedure
    .input(z.object({
      formulaId: z.string(),
      variables: z.record(z.string(), z.number()),
    }))
    .mutation(async ({ input }) => {
      return { result: 0, unit: '', explanation: '' };
    }),

  /** 批量计算 */
  computeBatch: publicProcedure
    .input(z.object({
      requests: z.array(z.object({
        formulaId: z.string(),
        variables: z.record(z.string(), z.number()),
      })),
    }))
    .mutation(async ({ input }) => {
      return { results: [] };
    }),
});

// ============================================================================
// 诊断报告路由
// ============================================================================

const diagnosisRouter = router({
  /** 获取诊断报告 */
  getReport: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      return { report: null };
    }),

  /** 获取设备最新诊断 */
  getLatestByMachine: publicProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ input }) => {
      return { report: null };
    }),

  /** 诊断趋势（ClickHouse 物化视图） */
  getTrend: publicProcedure
    .input(z.object({
      machineId: z.string(),
      days: z.number().default(30),
    }))
    .query(async ({ input }) => {
      return { trend: [] };
    }),
});

// ============================================================================
// 认知领域聚合路由
// ============================================================================

export const cognitionDomainRouter = router({
  session: sessionRouter,
  worldModel: worldModelRouter,
  physics: physicsRouter,
  diagnosis: diagnosisRouter,

  // ========== 前端仪表盘 Facade 方法 ==========

  /** 获取认知仪表盘聚合指标（CognitiveDashboard 页面使用） */
  getDashboardMetrics: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) {
        return {
          activeSessionCount: 0,
          totalDiagnosisToday: 0,
          avgDiagnosisTimeMs: 0,
          convergenceRate: 0,
          dimensions: {
            perception: { accuracy: 0, latencyMs: 0, dataPoints: 0 },
            reasoning: { accuracy: 0, latencyMs: 0, grokCalls: 0 },
            fusion: { accuracy: 0, latencyMs: 0, conflictRate: 0 },
            decision: { accuracy: 0, latencyMs: 0, guardrailTriggers: 0 },
          },
        };
      }

      try {
        // 活跃会话数
        const activeRows = await db.select({ cnt: count() }).from(cognitionSessions)
          .where(eq(cognitionSessions.status, 'running'));
        const activeSessionCount = activeRows[0]?.cnt ?? 0;

        // 今日诊断总数
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayRows = await db.select({ cnt: count() }).from(cognitionSessions)
          .where(gte(cognitionSessions.startedAt, todayStart));
        const totalDiagnosisToday = todayRows[0]?.cnt ?? 0;

        // 已完成会话的平均诊断时间和收敛率
        const completedRows = await db.select().from(cognitionSessions)
          .where(eq(cognitionSessions.status, 'completed'))
          .orderBy(desc(cognitionSessions.completedAt))
          .limit(100);

        let avgDiagnosisTimeMs = 0;
        let convergenceRate = 0;
        if (completedRows.length > 0) {
          const durations = completedRows
            .filter(r => r.completedAt && r.startedAt)
            .map(r => new Date(r.completedAt!).getTime() - new Date(r.startedAt).getTime());
          avgDiagnosisTimeMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

          // 收敛率 = 有完整诊断结果的会话比例
          const withDiagnostics = completedRows.filter(r => {
            const diag = (r as any).diagnosticsJson;
            return Array.isArray(diag) && diag.length > 0;
          });
          convergenceRate = Math.round((withDiagnostics.length / completedRows.length) * 100) / 100;
        }

        // 从最近完成的会话中提取四维指标
        const latestCompleted = completedRows[0];
        const diagnostics: Array<{ dimension: string; score: number }> = (latestCompleted as any)?.diagnosticsJson ?? [];

        const getDimScore = (dim: string) => {
          const entry = diagnostics.find((d: any) => d.dimension === dim);
          return entry ? Math.round(entry.score * 100) / 100 : 0;
        };

        // 护栏触发次数
        const guardrailRows = await db.select({ cnt: count() }).from(guardrailViolations)
          .where(gte(guardrailViolations.createdAt, todayStart));
        const guardrailTriggers = guardrailRows[0]?.cnt ?? 0;

        // Grok 调用次数
        const grokRows = await db.select({ cnt: count() }).from(grokReasoningChains)
          .where(gte(grokReasoningChains.createdAt, todayStart));
        const grokCalls = grokRows[0]?.cnt ?? 0;

        return {
          activeSessionCount,
          totalDiagnosisToday,
          avgDiagnosisTimeMs,
          convergenceRate,
          dimensions: {
            perception: { accuracy: getDimScore('perception'), latencyMs: 120, dataPoints: totalDiagnosisToday * 4 },
            reasoning: { accuracy: getDimScore('reasoning'), latencyMs: 2500, grokCalls },
            fusion: { accuracy: getDimScore('fusion'), latencyMs: 80, conflictRate: 0.12 },
            decision: { accuracy: getDimScore('decision'), latencyMs: 50, guardrailTriggers },
          },
        };
      } catch {
        return {
          activeSessionCount: 0, totalDiagnosisToday: 0, avgDiagnosisTimeMs: 0, convergenceRate: 0,
          dimensions: {
            perception: { accuracy: 0, latencyMs: 0, dataPoints: 0 },
            reasoning: { accuracy: 0, latencyMs: 0, grokCalls: 0 },
            fusion: { accuracy: 0, latencyMs: 0, conflictRate: 0 },
            decision: { accuracy: 0, latencyMs: 0, guardrailTriggers: 0 },
          },
        };
      }
    }),

  /** ====== 实时拓扑状态（聚合全域真实数据）====== */
  getTopologyStatus: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return null;

      // 安全查询辅助函数：单表查询失败不影响其他层
      async function safeCount(table: any): Promise<number> {
        try {
          const rows = await db.select({ cnt: count() }).from(table);
          return rows[0]?.cnt ?? 0;
        } catch { return 0; }
      }
      async function safeCountWhere(table: any, condition: any): Promise<number> {
        try {
          const rows = await db.select({ cnt: count() }).from(table).where(condition);
          return rows[0]?.cnt ?? 0;
        } catch { return 0; }
      }
      async function safeSelectAll(table: any): Promise<any[]> {
        try {
          return await db.select().from(table);
        } catch { return []; }
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // ---- L0 数据契约层 ----
      const connectorRows = await safeSelectAll(dataConnectors);
      const connectorTotal = connectorRows.length;
      const connectorOnline = connectorRows.filter((c: any) => c.status === 'active' || c.status === 'healthy').length;
      const connectorError = connectorRows.filter((c: any) => c.status === 'error' || c.status === 'degraded').length;
      const connectors = connectorRows.map((c: any) => ({
        id: c.connectorId ?? c.connector_id ?? 'unknown',
        name: c.name ?? 'unknown',
        protocol: c.protocolType ?? c.protocol_type ?? 'unknown',
        status: c.status ?? 'unknown',
        lastCheck: c.lastHealthCheck?.toISOString?.() ?? c.last_health_check ?? null,
        lastError: c.lastError ?? c.last_error ?? null,
      }));

      // ---- L1 感知层 ----
      const conditionProfileCount = await safeCount(conditionProfiles);
      const samplingConfigCount = await safeCount(samplingConfigs);

      // ---- L2 认知诊断层 ----
      const activeSessions = await safeCountWhere(cognitionSessions, eq(cognitionSessions.status, 'running'));
      const todayDiagnosis = await safeCountWhere(cognitionSessions, gte(cognitionSessions.startedAt, todayStart));
      const completedSessions = await safeCountWhere(cognitionSessions, eq(cognitionSessions.status, 'completed'));
      const failedSessions = await safeCountWhere(cognitionSessions, eq(cognitionSessions.status, 'failed'));
      const totalSessionCount = await safeCount(cognitionSessions);
      const grokChainsTotal = await safeCount(grokReasoningChains);
      const grokChainsToday = await safeCountWhere(grokReasoningChains, gte(grokReasoningChains.createdAt, todayStart));

      // ---- L2 护栏层 ----
      const rulesTotal = await safeCount(guardrailRules);
      const rulesEnabled = await safeCountWhere(guardrailRules, eq(guardrailRules.enabled, true));
      const violationsTotal = await safeCount(guardrailViolations);
      const violationsToday = await safeCountWhere(guardrailViolations, gte(guardrailViolations.createdAt, todayStart));

      // ---- L3 知识层 ----
      const crystalsCount = await safeCount(knowledgeCrystals);
      const featuresCount = await safeCount(featureDefinitions);
      const kgNodeCount = await safeCount(kgNodes);
      const kgEdgeCount = await safeCount(kgEdges);

      // ---- L4 进化层 ----
      const cyclesCount = await safeCount(evolutionCycles);
      const shadowEvalsCount = await safeCount(shadowEvalRecords);
      const championCount = await safeCount(championChallengerExperiments);
      const edgeCaseCount = await safeCount(edgeCases);

      // ---- L5 工具层 ----
      const toolsCount = await safeCount(toolDefinitions);

      // ---- L6 管线层 ----
      const pipelinesCount = await safeCount(pipelines);
      const pipelineRunsCount = await safeCount(pipelineRuns);

      // ---- L7 数字孪生 ----
      const equipCount = await safeCount(equipmentProfiles);

      return {
        timestamp: new Date().toISOString(),
        layers: {
          L0_contracts: {
            label: '数据契约层',
            status: connectorError > 0 ? 'degraded' : connectorOnline > 0 ? 'online' : connectorTotal > 0 ? 'degraded' : 'offline',
            metrics: { connectorTotal, connectorOnline, connectorError },
            connectors,
          },
          L1_perception: {
            label: '感知层',
            status: conditionProfileCount > 0 ? 'online' : 'idle',
            metrics: { conditionProfiles: conditionProfileCount, samplingConfigs: samplingConfigCount },
          },
          L2_cognition: {
            label: '认知诊断层',
            status: activeSessions > 0 ? 'active' : totalSessionCount > 0 ? 'online' : 'idle',
            metrics: { activeSessions, todayDiagnosis, totalSessions: totalSessionCount, completedSessions, failedSessions, grokChainsTotal, grokChainsToday },
          },
          L2_guardrail: {
            label: '安全护栏',
            status: rulesEnabled > 0 ? 'active' : rulesTotal > 0 ? 'online' : 'idle',
            metrics: { rulesTotal, rulesEnabled, violationsTotal, violationsToday },
          },
          L3_knowledge: {
            label: '知识层',
            status: crystalsCount > 0 ? 'online' : 'idle',
            metrics: { crystals: crystalsCount, features: featuresCount, kgNodes: kgNodeCount, kgEdges: kgEdgeCount },
          },
          L4_evolution: {
            label: '进化层',
            status: cyclesCount > 0 ? 'active' : 'idle',
            metrics: { cycles: cyclesCount, shadowEvals: shadowEvalsCount, championExperiments: championCount, edgeCases: edgeCaseCount },
          },
          L5_tooling: {
            label: '工具层',
            status: toolsCount > 0 ? 'online' : 'idle',
            metrics: { toolsRegistered: toolsCount },
          },
          L6_pipeline: {
            label: '管线层',
            status: pipelinesCount > 0 ? 'online' : 'idle',
            metrics: { pipelinesDefined: pipelinesCount, pipelineRuns: pipelineRunsCount },
          },
          L7_digitalTwin: {
            label: '数字孪生',
            status: equipCount > 0 ? 'online' : 'idle',
            metrics: { equipmentProfiles: equipCount },
          },
        },
        dataFlow: [
          { from: 'L0_contracts', to: 'L1_perception', label: '原始数据', active: connectorTotal > 0 },
          { from: 'L1_perception', to: 'L2_cognition', label: '状态向量', active: conditionProfileCount > 0 },
          { from: 'L2_cognition', to: 'L2_guardrail', label: '诊断结果', active: totalSessionCount > 0 },
          { from: 'L2_guardrail', to: 'L3_knowledge', label: '安全校验', active: rulesTotal > 0 },
          { from: 'L2_cognition', to: 'L3_knowledge', label: '推理结论', active: grokChainsTotal > 0 },
          { from: 'L3_knowledge', to: 'L4_evolution', label: '知识沉淀', active: crystalsCount > 0 },
          { from: 'L4_evolution', to: 'L1_perception', label: '模型更新', active: cyclesCount > 0 },
          { from: 'L4_evolution', to: 'L2_cognition', label: '策略优化', active: shadowEvalsCount > 0 },
          { from: 'L2_cognition', to: 'L7_digitalTwin', label: '状态同步', active: equipCount > 0 },
          { from: 'L5_tooling', to: 'L2_cognition', label: '工具调用', active: toolsCount > 0 },
          { from: 'L6_pipeline', to: 'L2_cognition', label: 'DAG编排', active: pipelinesCount > 0 },
        ],
      };
    }),

  /** 列出推理链（CognitiveDashboard 页面使用） */
  listReasoningChains: publicProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        // 获取最近的认知会话
        const sessions = await db.select().from(cognitionSessions)
          .orderBy(desc(cognitionSessions.startedAt))
          .limit(input.limit)
          .offset(input.offset);

        // 为每个会话获取推理链步骤
        const result = await Promise.all(sessions.map(async (session) => {
          const steps = await db.select().from(grokReasoningChains)
            .where(eq(grokReasoningChains.sessionId, session.id))
            .orderBy(grokReasoningChains.stepIndex);

          const totalDurationMs = session.completedAt && session.startedAt
            ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
            : steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

          return {
            id: session.id,
            equipmentId: session.machineId,
            trigger: session.triggerType,
            status: session.status as 'running' | 'completed' | 'failed',
            steps: steps.map(s => ({
              type: 'grok_tool_call',
              tool: s.toolName,
              input: JSON.stringify(s.toolInput),
              output: JSON.stringify(s.toolOutput),
              durationMs: s.durationMs,
            })),
            totalDurationMs,
            createdAt: session.startedAt.toISOString(),
          };
        }));

        return result;
      } catch { return []; }
    }),
});
