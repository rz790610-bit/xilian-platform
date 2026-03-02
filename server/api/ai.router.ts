/**
 * ============================================================================
 * P2-9 大模型价值发挥 — tRPC 路由
 * ============================================================================
 *
 * 4 个子路由，将 AI 模块暴露给前端：
 *   - diagnostic: 诊断增强引擎
 *   - nl: 自然语言交互层
 *   - intelligence: 技术情报系统
 *   - lab: 进化实验室
 *
 * 遵循 hdeDiagnostic.router.ts 的路由模式。
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { createModuleLogger } from '../core/logger';
import {
  getDiagnosticEnhancer,
  getNLInterface,
  getTechIntelligence,
  getEvolutionLab,
  getAIConfig,
  getAIConfigSnapshot,
} from '../platform/ai';

const log = createModuleLogger('aiRouter');

// ============================================================
// Zod Schemas
// ============================================================

const algorithmResultInputSchema = z.object({
  algorithmId: z.string(),
  algorithmName: z.string(),
  output: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  executedAt: z.number(),
});

const sensorFeatureInputSchema = z.object({
  sensorId: z.string(),
  sensorType: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.number(),
  quality: z.number().optional(),
});

const enhanceDiagnosisInputSchema = z.object({
  machineId: z.string(),
  algorithmResults: z.array(algorithmResultInputSchema),
  sensorFeatures: z.array(sensorFeatureInputSchema),
  conditionId: z.string().optional(),
  depth: z.enum(['quick', 'standard', 'deep']),
  requestId: z.string().optional(),
});

const nlQueryInputSchema = z.object({
  query: z.string().min(1),
  sessionId: z.string(),
  userId: z.string().optional(),
  machineId: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const nlConversationInputSchema = nlQueryInputSchema.extend({
  conversationId: z.string(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});

const nlSuggestionInputSchema = z.object({
  machineId: z.string().optional(),
  recentQueries: z.array(z.string()).optional(),
  currentAlerts: z.number().optional(),
});

const experimentTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scheduled'), cycleId: z.string() }),
  z.object({ type: z.literal('intelligence'), findingIds: z.array(z.string()) }),
  z.object({ type: z.literal('feedback'), feedbackIds: z.array(z.string()) }),
  z.object({ type: z.literal('performance'), degradationSignal: z.string() }),
  z.object({ type: z.literal('manual'), description: z.string(), userId: z.string() }),
]);

const reviewApprovalSchema = z.object({
  reviewId: z.string(),
  approved: z.boolean(),
  approvedBy: z.string(),
  comment: z.string().optional(),
  approvedAt: z.number(),
});

const labInsightInputSchema = z.object({
  source: z.enum(['scheduled', 'intelligence', 'feedback', 'performance', 'manual']),
  title: z.string(),
  description: z.string(),
  priority: z.number(),
  metadata: z.record(z.string(), z.unknown()),
});

// ============================================================
// 子路由：诊断增强
// ============================================================

const diagnosticRouter = router({
  /** 执行诊断增强 */
  enhance: protectedProcedure
    .input(enhanceDiagnosisInputSchema)
    .mutation(async ({ input }) => {
      log.info({ machineId: input.machineId, depth: input.depth }, 'AI 诊断增强请求');
      const enhancer = getDiagnosticEnhancer();
      const report = await enhancer.enhance(input);
      log.info({ reportId: report.reportId, riskLevel: report.riskLevel }, 'AI 诊断增强完成');
      return report;
    }),

  /** 获取诊断增强配置 */
  getConfig: publicProcedure.query(() => {
    return getAIConfig().diagnostic;
  }),
});

// ============================================================
// 子路由：自然语言交互
// ============================================================

const nlRouter = router({
  /** 单次查询 */
  query: protectedProcedure
    .input(nlQueryInputSchema)
    .mutation(async ({ input }) => {
      log.info({ query: input.query, sessionId: input.sessionId }, 'NL 查询');
      const nl = getNLInterface();
      return nl.query(input);
    }),

  /** 多轮对话 */
  converse: protectedProcedure
    .input(nlConversationInputSchema)
    .mutation(async ({ input }) => {
      log.info({ query: input.query, conversationId: input.conversationId }, 'NL 对话');
      const nl = getNLInterface();
      return nl.converse(input);
    }),

  /** 智能建议 */
  suggest: publicProcedure
    .input(nlSuggestionInputSchema)
    .query(async ({ input }) => {
      const nl = getNLInterface();
      return nl.suggest(input);
    }),
});

// ============================================================
// 子路由：技术情报
// ============================================================

const intelligenceRouter = router({
  /** 执行一次完整扫描周期 */
  runScan: protectedProcedure
    .mutation(async () => {
      log.info('技术情报扫描启动');
      const intel = getTechIntelligence();
      return intel.runScanCycle();
    }),

  /** 主题搜索 */
  searchTopic: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .mutation(async ({ input }) => {
      log.info({ query: input.query }, '主题搜索');
      const intel = getTechIntelligence();
      return intel.searchTopic(input.query);
    }),

  /** 生成差距分析报告 */
  generateGapReport: protectedProcedure
    .input(z.object({ focusAreas: z.array(z.string()).optional() }))
    .mutation(async ({ input }) => {
      log.info({ focusAreas: input.focusAreas }, '生成差距报告');
      const intel = getTechIntelligence();
      return intel.generateGapReport(input.focusAreas);
    }),

  /** 推荐算法候选 */
  suggestAlgorithms: publicProcedure.query(async () => {
    const intel = getTechIntelligence();
    return intel.suggestAlgorithms();
  }),

  /** 获取扫描历史 */
  getScanHistory: publicProcedure.query(() => {
    const intel = getTechIntelligence();
    return intel.getScanHistory();
  }),
});

// ============================================================
// 子路由：进化实验室
// ============================================================

const labRouter = router({
  /** 提交洞察 */
  submitInsight: protectedProcedure
    .input(labInsightInputSchema)
    .mutation(async ({ input }) => {
      log.info({ title: input.title }, '提交实验洞察');
      const lab = getEvolutionLab();
      const insightId = await lab.submitInsight(input);
      return { insightId };
    }),

  /** 设计实验 */
  designExperiment: protectedProcedure
    .input(z.object({ insightId: z.string() }))
    .mutation(async ({ input }) => {
      log.info({ insightId: input.insightId }, '设计实验');
      const lab = getEvolutionLab();
      return lab.designExperiment(input.insightId);
    }),

  /** 运行影子验证 */
  runShadowValidation: protectedProcedure
    .input(z.object({ experimentId: z.string() }))
    .mutation(async ({ input }) => {
      log.info({ experimentId: input.experimentId }, '运行影子验证');
      const lab = getEvolutionLab();
      return lab.runShadowValidation(input.experimentId);
    }),

  /** 提交人工审核 */
  submitForReview: protectedProcedure
    .input(z.object({ experimentId: z.string() }))
    .mutation(async ({ input }) => {
      log.info({ experimentId: input.experimentId }, '提交审核');
      const lab = getEvolutionLab();
      return lab.submitForReview(input.experimentId);
    }),

  /** 批准并应用实验 */
  applyExperiment: protectedProcedure
    .input(z.object({
      experimentId: z.string(),
      approval: reviewApprovalSchema,
    }))
    .mutation(async ({ input }) => {
      log.info({ experimentId: input.experimentId }, '应用实验');
      const lab = getEvolutionLab();
      return lab.applyExperiment(input.experimentId, input.approval);
    }),

  /** 运行完整实验周期 */
  runCycle: protectedProcedure
    .input(z.object({ trigger: experimentTriggerSchema }))
    .mutation(async ({ input }) => {
      log.info({ triggerType: input.trigger.type }, '运行实验周期');
      const lab = getEvolutionLab();
      return lab.runExperimentCycle(input.trigger);
    }),

  /** 列出所有实验 */
  listExperiments: publicProcedure.query(() => {
    const lab = getEvolutionLab();
    return lab.listExperiments();
  }),

  /** 获取单个实验详情 */
  getExperiment: publicProcedure
    .input(z.object({ experimentId: z.string() }))
    .query(({ input }) => {
      const lab = getEvolutionLab();
      return lab.getExperiment(input.experimentId) ?? null;
    }),

  /** 获取周期历史 */
  getCycleHistory: publicProcedure.query(() => {
    const lab = getEvolutionLab();
    return lab.getCycleHistory();
  }),
});

// ============================================================
// 主路由
// ============================================================

export const aiRouter = router({
  diagnostic: diagnosticRouter,
  nl: nlRouter,
  intelligence: intelligenceRouter,
  lab: labRouter,

  /** 获取完整配置快照 */
  getConfig: publicProcedure.query(() => {
    return getAIConfigSnapshot();
  }),
});
