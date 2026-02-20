/**
 * ============================================================================
 * 工具领域路由聚合 — 横向工具化 API
 * ============================================================================
 * 职责边界：工具注册 + 数据采集 + 存储 + 标注 + 训练 + 调优 + 评估
 * 复用现有路由 + 新增工具注册路由
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
// 复用现有路由
import { algorithmRouter } from '../../api/algorithm.router';
import { advancedDistillationRouter } from '../../api/advancedDistillation.router';

// ============================================================================
// 工具注册路由（新增 — 供 Grok Tool Calling 发现和调用）
// ============================================================================

const toolRegistryRouter = router({
  /** 列出所有可用工具 */
  list: publicProcedure
    .input(z.object({
      loopStage: z.enum(['perception', 'diagnosis', 'guardrail', 'evolution', 'utility']).optional(),
      enabled: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      return { tools: [], total: 0 };
    }),

  /** 获取工具详情 */
  get: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return { tool: null };
    }),

  /** 注册新工具 */
  register: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: z.record(z.string(), z.unknown()),
      outputSchema: z.record(z.string(), z.unknown()),
      executor: z.string(),
      loopStage: z.enum(['perception', 'diagnosis', 'guardrail', 'evolution', 'utility']),
      permissions: z.object({
        requiredRoles: z.array(z.string()),
        maxCallsPerMinute: z.number().default(60),
        requiresApproval: z.boolean().default(false),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      return { id: 0, success: true };
    }),

  /** 调用工具（Grok 代理调用） */
  invoke: protectedProcedure
    .input(z.object({
      toolName: z.string(),
      input: z.record(z.string(), z.unknown()),
      context: z.object({
        sessionId: z.string().optional(),
        machineId: z.string().optional(),
        traceId: z.string(),
      }),
    }))
    .mutation(async ({ input }) => {
      return { output: null, durationMs: 0 };
    }),
});

// ============================================================================
// 工具领域聚合路由
// ============================================================================

export const toolingDomainRouter = router({
  /** 工具注册中心 */
  registry: toolRegistryRouter,
  /** 算法赋能（元数据/推荐/组合/桥接） */
  algorithm: algorithmRouter,
  /** 高级知识蒸馏 */
  distillation: advancedDistillationRouter,
});
