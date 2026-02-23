/**
 * ============================================================================
 * 认知领域路由聚合 — ②诊断闭环
 * ============================================================================
 * 职责边界：认知引擎全链路 + 世界模型 + Grok 推理 + 诊断报告
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { reasoningEngineRouter } from './reasoning.router';
import { z } from 'zod';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('cognition');
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
import {
  dataConnectors, kgNodes, kgEdges, pipelines, pipelineRuns,
  // 平台已有模块
  assetNodes, assetMeasurementPoints, assetSensors,
  models, modelFineTuneTasks,
  kbCollections, kbDocuments,
  pluginRegistry, pluginInstances,
  edgeGateways,
  algorithmDefinitions, algorithmCompositions, algorithmExecutions,
  diagnosisRules, diagnosisTasks,
  topoNodes, topoEdges,
  eventLogs,
} from '../../../drizzle/schema';

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
      } catch (e) { log.warn({ err: e }, '[cognition.trigger] session creation failed'); return { sessionId: '', status: 'failed' }; }
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
  reasoningEngine: reasoningEngineRouter,

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

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // ---- L0 数据契约层 ----
      const connectorRows = await db.select().from(dataConnectors);
      const connectorTotal = connectorRows.length;
      const connectorOnline = connectorRows.filter(c => c.status === 'active' || c.status === 'healthy').length;
      const connectorError = connectorRows.filter(c => c.status === 'error' || c.status === 'degraded').length;
      const connectors = connectorRows.map(c => ({
        id: c.connectorId,
        name: c.name,
        protocol: c.protocolType,
        status: c.status,
        lastCheck: c.lastHealthCheck?.toISOString() ?? null,
        lastError: c.lastError,
      }));

      // ---- L1 感知层 ----
      const [cpRow] = await db.select({ cnt: count() }).from(conditionProfiles);
      const [scRow] = await db.select({ cnt: count() }).from(samplingConfigs);
      const conditionProfileCount = cpRow.cnt;
      const samplingConfigCount = scRow.cnt;

      // ---- L2 认知诊断层 ----
      const [activeRow] = await db.select({ cnt: count() }).from(cognitionSessions).where(eq(cognitionSessions.status, 'running'));
      const [todayDiagRow] = await db.select({ cnt: count() }).from(cognitionSessions).where(gte(cognitionSessions.startedAt, todayStart));
      const [completedRow] = await db.select({ cnt: count() }).from(cognitionSessions).where(eq(cognitionSessions.status, 'completed'));
      const [failedRow] = await db.select({ cnt: count() }).from(cognitionSessions).where(eq(cognitionSessions.status, 'failed'));
      const [totalRow] = await db.select({ cnt: count() }).from(cognitionSessions);
      const [grokTotalRow] = await db.select({ cnt: count() }).from(grokReasoningChains);
      const [grokTodayRow] = await db.select({ cnt: count() }).from(grokReasoningChains).where(gte(grokReasoningChains.createdAt, todayStart));

      const activeSessions = activeRow.cnt;
      const todayDiagnosis = todayDiagRow.cnt;
      const completedSessions = completedRow.cnt;
      const failedSessions = failedRow.cnt;
      const totalSessionCount = totalRow.cnt;
      const grokChainsTotal = grokTotalRow.cnt;
      const grokChainsToday = grokTodayRow.cnt;

      // ---- L2 护栏层 ----
      const [ruleTotalRow] = await db.select({ cnt: count() }).from(guardrailRules);
      const [ruleEnabledRow] = await db.select({ cnt: count() }).from(guardrailRules).where(eq(guardrailRules.enabled, true));
      const [violTotalRow] = await db.select({ cnt: count() }).from(guardrailViolations);
      const [violTodayRow] = await db.select({ cnt: count() }).from(guardrailViolations).where(gte(guardrailViolations.createdAt, todayStart));

      const rulesTotal = ruleTotalRow.cnt;
      const rulesEnabled = ruleEnabledRow.cnt;
      const violationsTotal = violTotalRow.cnt;
      const violationsToday = violTodayRow.cnt;

      // ---- L3 知识层 ----
      const [crystalRow] = await db.select({ cnt: count() }).from(knowledgeCrystals);
      const [featureRow] = await db.select({ cnt: count() }).from(featureDefinitions);
      const [kgNodeRow] = await db.select({ cnt: count() }).from(kgNodes);
      const [kgEdgeRow] = await db.select({ cnt: count() }).from(kgEdges);

      const crystalsCount = crystalRow.cnt;
      const featuresCount = featureRow.cnt;
      const kgNodeCount = kgNodeRow.cnt;
      const kgEdgeCount = kgEdgeRow.cnt;

      // ---- L4 进化层 ----
      const [cycleRow] = await db.select({ cnt: count() }).from(evolutionCycles);
      const [shadowRow] = await db.select({ cnt: count() }).from(shadowEvalRecords);
      const [championRow] = await db.select({ cnt: count() }).from(championChallengerExperiments);
      const [edgeCaseRow] = await db.select({ cnt: count() }).from(edgeCases);

      const cyclesCount = cycleRow.cnt;
      const shadowEvalsCount = shadowRow.cnt;
      const championCount = championRow.cnt;
      const edgeCaseCount = edgeCaseRow.cnt;

      // ---- L5 工具层 ----
      const [toolRow] = await db.select({ cnt: count() }).from(toolDefinitions);
      const toolsCount = toolRow.cnt;

      // ---- L6 管线层 ----
      const [pipeRow] = await db.select({ cnt: count() }).from(pipelines);
      const [pipeRunRow] = await db.select({ cnt: count() }).from(pipelineRuns);
      const pipelinesCount = pipeRow.cnt;
      const pipelineRunsCount = pipeRunRow.cnt;

      // ---- L7 数字孪生 ----
      const [equipRow] = await db.select({ cnt: count() }).from(equipmentProfiles);
      const equipCount = equipRow.cnt;

      // ---- 平台已有模块 ----
      // 资产管理
      const [assetNodeRow] = await db.select({ cnt: count() }).from(assetNodes);
      const [assetMpRow] = await db.select({ cnt: count() }).from(assetMeasurementPoints);
      const [assetSensorRow] = await db.select({ cnt: count() }).from(assetSensors);
      const assetNodeCount = assetNodeRow.cnt;
      const assetMpCount = assetMpRow.cnt;
      const assetSensorCount = assetSensorRow.cnt;

      // 模型管理
      const [modelRow] = await db.select({ cnt: count() }).from(models);
      const [ftRow] = await db.select({ cnt: count() }).from(modelFineTuneTasks);
      const modelCount = modelRow.cnt;
      const fineTuneCount = ftRow.cnt;

      // 知识库
      const [kbCollRow] = await db.select({ cnt: count() }).from(kbCollections);
      const [kbDocRow] = await db.select({ cnt: count() }).from(kbDocuments);
      const kbCollectionCount = kbCollRow.cnt;
      const kbDocumentCount = kbDocRow.cnt;

      // 插件系统
      const [pluginRegRow] = await db.select({ cnt: count() }).from(pluginRegistry);
      const [pluginInstRow] = await db.select({ cnt: count() }).from(pluginInstances);
      const pluginRegCount = pluginRegRow.cnt;
      const pluginInstCount = pluginInstRow.cnt;

      // 边缘网关
      const [edgeGwRow] = await db.select({ cnt: count() }).from(edgeGateways);
      const edgeGwCount = edgeGwRow.cnt;

      // 算法引擎
      const [algoDefRow] = await db.select({ cnt: count() }).from(algorithmDefinitions);
      const [algoCompRow] = await db.select({ cnt: count() }).from(algorithmCompositions);
      const [algoExecRow] = await db.select({ cnt: count() }).from(algorithmExecutions);
      const algoDefCount = algoDefRow.cnt;
      const algoCompCount = algoCompRow.cnt;
      const algoExecCount = algoExecRow.cnt;

      // 诊断规则
      const [diagRuleRow] = await db.select({ cnt: count() }).from(diagnosisRules);
      const [diagTaskRow] = await db.select({ cnt: count() }).from(diagnosisTasks);
      const diagRuleCount = diagRuleRow.cnt;
      const diagTaskCount = diagTaskRow.cnt;

      // 系统拓扑
      const [topoNodeRow] = await db.select({ cnt: count() }).from(topoNodes);
      const [topoEdgeRow] = await db.select({ cnt: count() }).from(topoEdges);
      const topoNodeCount = topoNodeRow.cnt;
      const topoEdgeCount = topoEdgeRow.cnt;

      // 事件总线
      const [eventRow] = await db.select({ cnt: count() }).from(eventLogs);
      const eventCount = eventRow.cnt;

      return {
        timestamp: new Date().toISOString(),
        // ===== 认知中枢核心层 =====
        cognitiveLayers: {
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
        // ===== 平台已有模块 =====
        platformModules: {
          assetManagement: {
            label: '资产管理',
            status: assetNodeCount > 0 ? 'online' : 'idle',
            metrics: { nodes: assetNodeCount, measurementPoints: assetMpCount, sensors: assetSensorCount },
          },
          modelManagement: {
            label: '模型管理',
            status: modelCount > 0 ? 'online' : 'idle',
            metrics: { models: modelCount, fineTuneTasks: fineTuneCount },
          },
          knowledgeBase: {
            label: '知识库',
            status: kbCollectionCount > 0 ? 'online' : 'idle',
            metrics: { collections: kbCollectionCount, documents: kbDocumentCount },
          },
          pluginSystem: {
            label: '插件系统',
            status: pluginRegCount > 0 ? 'online' : 'idle',
            metrics: { registered: pluginRegCount, instances: pluginInstCount },
          },
          edgeGateway: {
            label: '边缘网关',
            status: edgeGwCount > 0 ? 'online' : 'idle',
            metrics: { gateways: edgeGwCount },
          },
          algorithmEngine: {
            label: '算法引擎',
            status: algoDefCount > 0 ? 'online' : 'idle',
            metrics: { definitions: algoDefCount, compositions: algoCompCount, executions: algoExecCount },
          },
          diagnosisEngine: {
            label: '诊断引擎',
            status: diagRuleCount > 0 ? 'online' : 'idle',
            metrics: { rules: diagRuleCount, tasks: diagTaskCount },
          },
          systemTopology: {
            label: '系统拓扑',
            status: topoNodeCount > 0 ? 'online' : 'idle',
            metrics: { nodes: topoNodeCount, edges: topoEdgeCount },
          },
          eventBus: {
            label: '事件总线',
            status: eventCount > 0 ? 'online' : 'idle',
            metrics: { totalEvents: eventCount },
          },
        },
        // ===== 认知中枢内部数据流 =====
        cognitiveDataFlow: [
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
        // ===== 认知中枢 ↔ 平台模块赋能连接 =====
        empowermentLinks: [
          { from: 'assetManagement', to: 'L0_contracts', label: '设备资产注册', active: assetNodeCount > 0, direction: 'platform→cognitive' },
          { from: 'edgeGateway', to: 'L0_contracts', label: '边缘数据采集', active: edgeGwCount > 0, direction: 'platform→cognitive' },
          { from: 'algorithmEngine', to: 'L2_cognition', label: '算法模型调用', active: algoDefCount > 0, direction: 'platform→cognitive' },
          { from: 'diagnosisEngine', to: 'L2_guardrail', label: '诊断规则同步', active: diagRuleCount > 0, direction: 'platform→cognitive' },
          { from: 'knowledgeBase', to: 'L3_knowledge', label: '知识文档注入', active: kbCollectionCount > 0, direction: 'platform→cognitive' },
          { from: 'modelManagement', to: 'L4_evolution', label: '模型训练/部署', active: modelCount > 0, direction: 'platform→cognitive' },
          { from: 'pluginSystem', to: 'L5_tooling', label: '插件工具注册', active: pluginRegCount > 0, direction: 'platform→cognitive' },
          { from: 'systemTopology', to: 'L7_digitalTwin', label: '拓扑结构同步', active: topoNodeCount > 0, direction: 'platform→cognitive' },
          { from: 'eventBus', to: 'L6_pipeline', label: '事件驱动编排', active: eventCount > 0, direction: 'platform→cognitive' },
          // 认知中枢反向赋能平台
          { from: 'L2_cognition', to: 'assetManagement', label: '健康评估反馈', active: totalSessionCount > 0, direction: 'cognitive→platform' },
          { from: 'L3_knowledge', to: 'knowledgeBase', label: '知识结晶回写', active: crystalsCount > 0, direction: 'cognitive→platform' },
          { from: 'L4_evolution', to: 'modelManagement', label: '模型迭代推送', active: cyclesCount > 0, direction: 'cognitive→platform' },
          { from: 'L4_evolution', to: 'algorithmEngine', label: '算法优化建议', active: shadowEvalsCount > 0, direction: 'cognitive→platform' },
          { from: 'L2_guardrail', to: 'eventBus', label: '告警事件发布', active: violationsTotal > 0, direction: 'cognitive→platform' },
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
