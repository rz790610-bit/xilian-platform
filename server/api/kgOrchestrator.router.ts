/**
 * 知识图谱编排器 tRPC 路由
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../core/trpc";
import * as kgService from "../services/kg-orchestrator.service";

export const kgOrchestratorRouter = router({
  // ============ 图谱 CRUD ============

  /** 列表 */
  list: publicProcedure.input(z.object({
    scenario: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  }).optional()).query(({ input }) => kgService.listGraphs(input ?? {})),

  /** 获取完整图谱（含节点和边） */
  get: publicProcedure.input(z.object({ graphId: z.string() }))
    .query(({ input }) => kgService.getGraph(input.graphId)),

  /** 创建 — S0-2: mutation 改为 protectedProcedure */
  create: protectedProcedure.input(z.object({
    name: z.string(),
    description: z.string().optional(),
    scenario: z.string(),
    templateId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    nodes: z.array(z.object({
      nodeId: z.string(),
      category: z.string(),
      subType: z.string(),
      label: z.string(),
      x: z.number(),
      y: z.number(),
      config: z.record(z.string(), z.unknown()).default({}),
      nodeStatus: z.enum(["normal", "pending_confirm", "deprecated"]).default("normal"),
    })).optional(),
    edges: z.array(z.object({
      edgeId: z.string(),
      sourceNodeId: z.string(),
      targetNodeId: z.string(),
      relationType: z.string(),
      label: z.string().optional(),
      weight: z.number().default(1),
      config: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
  })).mutation(({ input }) => kgService.createGraph(input as any)),

  /** 更新基本信息 — S0-2 */
  update: protectedProcedure.input(z.object({
    graphId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    viewportConfig: z.object({ zoom: z.number(), panX: z.number(), panY: z.number() }).optional(),
  })).mutation(({ input }) => {
    const { graphId, ...data } = input;
    return kgService.updateGraph(graphId, data);
  }),

  /** 删除 — S0-2 */
  delete: protectedProcedure.input(z.object({ graphId: z.string() }))
    .mutation(({ input }) => kgService.deleteGraph(input.graphId)),

  /** 保存画布状态 — S0-2 */
  saveCanvas: protectedProcedure.input(z.object({
    graphId: z.string(),
    nodes: z.array(z.object({
      nodeId: z.string(),
      category: z.string(),
      subType: z.string(),
      label: z.string(),
      x: z.number(),
      y: z.number(),
      config: z.record(z.string(), z.unknown()).default({}),
      nodeStatus: z.enum(["normal", "pending_confirm", "deprecated"]).default("normal"),
      hitCount: z.number().optional(),
      accuracy: z.number().optional(),
    })),
    edges: z.array(z.object({
      edgeId: z.string(),
      sourceNodeId: z.string(),
      targetNodeId: z.string(),
      relationType: z.string(),
      label: z.string().optional(),
      weight: z.number().default(1),
      config: z.record(z.string(), z.unknown()).optional(),
      pathAccuracy: z.number().optional(),
      hitCount: z.number().optional(),
    })),
  })).mutation(({ input }) => kgService.saveCanvasState(input.graphId, input.nodes as any, input.edges as any)),

  // ============ 诊断推理 ============

  /** 运行诊断 — S0-2 */
  runDiagnosis: protectedProcedure.input(z.object({
    graphId: z.string(),
    inputData: z.record(z.string(), z.unknown()),
    startNodeId: z.string().optional(),
    maxDepth: z.number().optional(),
  })).mutation(({ input }) => kgService.runDiagnosis(input as any)),

  /** 诊断运行列表 */
  diagnosisRuns: publicProcedure.input(z.object({
    graphId: z.string(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  })).query(({ input }) => kgService.listDiagnosisRuns(input.graphId, input)),

  /** 提交诊断反馈 — S0-2 */
  submitFeedback: protectedProcedure.input(z.object({
    runId: z.string(),
    feedback: z.enum(["correct", "incorrect", "partial"]),
    note: z.string().optional(),
  })).mutation(({ input }) => kgService.submitDiagnosisFeedback(input.runId, input.feedback, input.note)),

  // ============ 自进化 ============

  /** 进化日志 */
  evolutionLogs: publicProcedure.input(z.object({
    graphId: z.string(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  })).query(({ input }) => kgService.listEvolutionLogs(input.graphId, input)),

  /** 审核进化事件 — S0-2 */
  reviewEvolution: protectedProcedure.input(z.object({
    logId: z.number(),
    action: z.enum(["applied", "rejected"]),
    reviewedBy: z.string().optional(),
  })).mutation(({ input }) => kgService.reviewEvolution(input.logId, input.action, input.reviewedBy)),

  // ============ 统计 ============

  /** 图谱统计 */
  stats: publicProcedure.input(z.object({ graphId: z.string() }))
    .query(({ input }) => kgService.getGraphStats(input.graphId)),
});
