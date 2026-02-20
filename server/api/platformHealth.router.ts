/**
 * ============================================================================
 * v3.1 平台健康 API 路由
 * ============================================================================
 * 
 * 统一暴露 L1 契约基层 + L2 自省层的所有 API 端点：
 *   - ModuleRegistry: 模块列表、完整度报告、依赖图谱
 *   - StubTracker: 桩函数统计
 *   - ModuleFeatureFlags: 模块级开关管理
 *   - DataFlowTracer: 数据流图谱
 *   - GrokPlatformAgent: 平台自诊断
 * 
 * 架构位置: server/api/platformHealth.router.ts
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { moduleRegistry } from '../core/registries/module.registry';
import { stubTracker } from '../core/stub';
import { moduleFeatureFlags } from '../core/moduleFeatureFlags';
import { dataFlowTracer } from '../platform/services/dataFlowTracer';
import { grokPlatformAgent } from '../services/grokPlatformAgent.service';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('platformHealthRouter');

export const platformHealthRouter = router({

  // ============ ModuleRegistry 端点 ============

  /** 列出所有模块 Manifest */
  listModules: publicProcedure.query(() => {
    return moduleRegistry.listItems().map(m => ({
      ...m,
      completeness: moduleRegistry.getCompleteness(m.id),
    }));
  }),

  /** 获取单个模块详情 */
  getModule: publicProcedure
    .input(z.object({ moduleId: z.string() }))
    .query(({ input }) => {
      const m = moduleRegistry.get(input.moduleId);
      if (!m) return null;
      return {
        ...m,
        completeness: moduleRegistry.getCompleteness(m.id),
        featureEnabled: moduleFeatureFlags.isEnabled(m.id),
      };
    }),

  /** 获取按域聚合的完整度报告 */
  completenessReport: publicProcedure.query(() => {
    return {
      overall: moduleRegistry.getOverallCompleteness(),
      byDomain: moduleRegistry.getCompletenessReport(),
    };
  }),

  /** 获取模块依赖图谱 */
  dependencyGraph: publicProcedure.query(() => {
    return moduleRegistry.getDependencyGraph();
  }),

  // ============ StubTracker 端点 ============

  /** 获取桩函数统计 */
  stubStats: publicProcedure
    .input(z.object({ topN: z.number().optional() }).optional())
    .query(({ input }) => {
      return stubTracker.getStats(input?.topN || 20);
    }),

  // ============ ModuleFeatureFlags 端点 ============

  /** 获取所有模块 Flag */
  featureFlags: publicProcedure.query(() => {
    return {
      summary: moduleFeatureFlags.getSummary(),
      flags: moduleFeatureFlags.getAll(),
    };
  }),

  /** 设置模块启停 — S0-2: Feature Flag 修改必须认证 */
  setModuleEnabled: protectedProcedure
    .input(z.object({
      moduleId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      await moduleFeatureFlags.setEnabled(input.moduleId, input.enabled, 'api');
      return { success: true, moduleId: input.moduleId, enabled: input.enabled };
    }),

  /** 获取 Flag 变更历史 */
  flagHistory: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => {
      return moduleFeatureFlags.getHistory(input?.limit || 50);
    }),

  // ============ DataFlowTracer 端点 ============

  /** 获取数据流图谱 */
  dataFlowGraph: publicProcedure.query(() => {
    return dataFlowTracer.getFlowGraph();
  }),

  /** 获取数据流异常 */
  dataFlowAnomalies: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => {
      return dataFlowTracer.getAnomalies(input?.limit || 20);
    }),

  /** 获取指定模块的数据流 */
  moduleDataFlow: publicProcedure
    .input(z.object({ moduleId: z.string() }))
    .query(({ input }) => {
      return dataFlowTracer.getModuleFlows(input.moduleId);
    }),

  /** 获取 DataFlowTracer 摘要 */
  dataFlowSummary: publicProcedure.query(() => {
    return dataFlowTracer.getSummary();
  }),

  // ============ Grok 平台诊断 Agent 端点 ============

  /** 执行平台自诊断 — S0-2: 诊断报告暴露内部架构信息 */
  diagnose: protectedProcedure
    .input(z.object({ question: z.string().optional() }).optional())
    .mutation(async ({ input }) => {
      log.info('[PlatformDiagnosis] Starting diagnosis...');
      const result = await grokPlatformAgent.diagnose(input?.question);
      log.info(`[PlatformDiagnosis] Completed in ${result.mode} mode, ${result.toolCallCount} tool calls`);
      return result;
    }),

  /** 获取诊断 Agent 状态 */
  agentStatus: publicProcedure.query(() => {
    return grokPlatformAgent.getStatus();
  }),

  // ============ 综合健康检查 ============

  /** 平台健康总览 — S0-2: 包含内部架构信息，需认证 */
  overview: protectedProcedure.query(() => {
    return {
      modules: {
        total: moduleRegistry.size,
        overall: moduleRegistry.getOverallCompleteness(),
      },
      stubs: {
        registered: stubTracker.getRegisteredCount(),
        totalCalls: stubTracker.getTotalCalls(),
      },
      featureFlags: moduleFeatureFlags.getSummary(),
      dataFlow: dataFlowTracer.getSummary(),
      agent: grokPlatformAgent.getStatus(),
      timestamp: new Date(),
    };
  }),
});

export type PlatformHealthRouter = typeof platformHealthRouter;
