/**
 * ============================================================================
 * 工具领域路由聚合 — 横向工具化 API
 * ============================================================================
 *
 * P3-3: 工具域完整实现（注册/发现/执行/沙箱）
 *
 * 职责边界：
 *   - 工具注册中心（registry）: list / get / register / invoke / chain
 *   - 沙箱执行（sandbox）: execute / securityCheck / logs / stats
 *   - Grok 集成（grok）: getToolDefinitions / getStats / getAuditLogs
 *   - 算法赋能: 复用 algorithmRouter
 *   - 知识蒸馏: 复用 advancedDistillationRouter
 *
 * 数据流：
 *   Grok Agent → registry.invoke() → ToolFramework.execute()
 *                                       ↓
 *     → 权限检查 → 输入校验 → 超时保护 → 审计日志
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { machineIdSchema, sessionIdSchema } from '../../../shared/contracts/schemas';
import { getToolFramework, getToolSandbox } from '../../platform/tooling/framework/tool-framework-singleton';
import type { ToolExecutionContext } from '../../platform/tooling/framework/tool-framework';
import { getDb } from '../../lib/db';
import { toolDefinitions } from '../../../drizzle/evolution-schema';
// 复用现有路由
import { algorithmRouter } from '../../api/algorithm.router';
import { advancedDistillationRouter } from '../../api/advancedDistillation.router';

// ============================================================================
// 工具注册路由
// ============================================================================

const toolRegistryRouter = router({
  /** 列出所有可用工具（支持分类/搜索过滤） */
  list: publicProcedure
    .input(z.object({
      category: z.enum(['query', 'analyze', 'execute', 'integrate']).optional(),
      tags: z.array(z.string()).optional(),
      search: z.string().optional(),
    }).optional())
    .query(({ input }) => {
      const fw = getToolFramework();
      const tools = fw.discover({
        category: input?.category,
        tags: input?.tags,
        search: input?.search,
      });
      return { tools, total: tools.length };
    }),

  /** 获取单个工具详情 */
  get: publicProcedure
    .input(z.object({ toolId: z.string() }))
    .query(({ input }) => {
      const fw = getToolFramework();
      const all = fw.discover();
      const tool = all.find(t => t.id === input.toolId) ?? null;
      return { tool };
    }),

  /** 注册新工具（动态注册，供外部插件/扩展） */
  register: protectedProcedure
    .input(z.object({
      id: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      category: z.enum(['query', 'analyze', 'execute', 'integrate']),
      tags: z.array(z.string()).default([]),
      version: z.string().default('1.0.0'),
      requiredPermissions: z.array(z.string()).default([]),
      timeoutMs: z.number().min(100).max(300000).default(10000),
      requiresConfirmation: z.boolean().default(false),
      /** 沙箱代码（将通过 ToolSandbox 执行） */
      sandboxCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const fw = getToolFramework();
      const sandbox = getToolSandbox();

      // 如果提供了沙箱代码，先做安全检查
      if (input.sandboxCode) {
        const check = sandbox.securityCheck(input.sandboxCode);
        if (!check.safe) {
          return {
            success: false,
            toolId: input.id,
            error: `安全检查失败: ${check.violations.join('; ')}`,
          };
        }
      }

      // 构建 ToolDefinition
      const sandboxCode = input.sandboxCode;
      fw.register({
        id: input.id,
        name: input.name,
        description: input.description,
        category: input.category,
        inputSchema: z.record(z.string(), z.unknown()),
        outputSchema: z.record(z.string(), z.unknown()),
        requiredPermissions: input.requiredPermissions,
        timeoutMs: input.timeoutMs,
        requiresConfirmation: input.requiresConfirmation,
        tags: input.tags,
        version: input.version,
        execute: sandboxCode
          ? async (toolInput: unknown) => {
              const result = await sandbox.execute(sandboxCode, toolInput);
              if (result.status !== 'success') {
                throw new Error(result.error ?? `Sandbox execution failed: ${result.status}`);
              }
              return result.output;
            }
          : async (toolInput: unknown) => {
              return { echo: toolInput, message: '工具已注册但未提供执行逻辑' };
            },
      });

      // 持久化到数据库
      try {
        const db = await getDb();
        if (db) {
          await db.insert(toolDefinitions).values({
            name: input.name,
            description: input.description,
            inputSchema: {},
            outputSchema: {},
            permissions: {
              requiredRoles: input.requiredPermissions,
              maxCallsPerMinute: 60,
              requiresApproval: input.requiresConfirmation,
            },
            version: input.version,
            executor: input.sandboxCode || 'echo',
            loopStage: 'utility',
            enabled: true,
          }).onDuplicateKeyUpdate({
            set: {
              description: input.description,
              version: input.version,
              executor: input.sandboxCode || 'echo',
              updatedAt: new Date(),
            },
          });
        }
      } catch {
        // DB 持久化失败不阻塞注册
      }

      return { success: true, toolId: input.id };
    }),

  /** 调用工具（Grok 代理调用 / 手动调用） */
  invoke: protectedProcedure
    .input(z.object({
      toolId: z.string(),
      input: z.record(z.string(), z.unknown()),
      context: z.object({
        sessionId: z.string().optional(),
        machineId: z.string().optional(),
        traceId: z.string(),
        source: z.enum(['grok', 'api', 'pipeline', 'manual']).default('api'),
      }),
    }))
    .mutation(async ({ input }) => {
      const fw = getToolFramework();

      const execContext: ToolExecutionContext = {
        callerId: 'api-user',
        source: input.context.source,
        sessionId: input.context.sessionId,
        permissions: ['read:device', 'read:diagnosis', 'read:analysis', 'read:knowledge',
                       'write:guardrail', 'write:diagnosis', 'write:knowledge'],
        traceId: input.context.traceId,
        metadata: input.context.machineId ? { machineId: input.context.machineId } : undefined,
      };

      const result = await fw.execute(input.toolId, input.input, execContext);
      return {
        toolId: result.toolId,
        success: result.success,
        output: result.output,
        error: result.error,
        durationMs: result.durationMs,
        traceId: result.traceId,
      };
    }),

  /** 链式执行多个工具 */
  chain: protectedProcedure
    .input(z.object({
      toolIds: z.array(z.string()).min(1).max(10),
      initialInput: z.record(z.string(), z.unknown()),
      context: z.object({
        traceId: z.string(),
        source: z.enum(['grok', 'api', 'pipeline', 'manual']).default('api'),
      }),
    }))
    .mutation(async ({ input }) => {
      const fw = getToolFramework();

      const execContext: ToolExecutionContext = {
        callerId: 'api-user',
        source: input.context.source,
        permissions: ['read:device', 'read:diagnosis', 'read:analysis', 'read:knowledge',
                       'write:guardrail', 'write:diagnosis', 'write:knowledge'],
        traceId: input.context.traceId,
      };

      const results = await fw.executeChain(input.toolIds, input.initialInput, execContext);
      return {
        results: results.map(r => ({
          toolId: r.toolId,
          success: r.success,
          output: r.output,
          error: r.error,
          durationMs: r.durationMs,
        })),
        allSucceeded: results.every(r => r.success),
        totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
      };
    }),
});

// ============================================================================
// 沙箱路由
// ============================================================================

const sandboxRouter = router({
  /** 在沙箱中执行代码 */
  execute: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(50000),
      input: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const sandbox = getToolSandbox();
      const result = await sandbox.execute(input.code, input.input ?? {});
      return {
        id: result.id,
        status: result.status,
        output: result.output,
        error: result.error,
        executionTimeMs: result.executionTimeMs,
        securityViolations: result.securityViolations,
      };
    }),

  /** 安全检查代码（不执行） */
  securityCheck: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const sandbox = getToolSandbox();
      return sandbox.securityCheck(input.code);
    }),

  /** 获取沙箱执行日志 */
  logs: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(({ input }) => {
      const sandbox = getToolSandbox();
      return sandbox.getExecutionLog(input?.limit ?? 20);
    }),

  /** 获取沙箱统计 */
  stats: publicProcedure.query(() => {
    const sandbox = getToolSandbox();
    return sandbox.getStats();
  }),
});

// ============================================================================
// Grok 集成路由
// ============================================================================

const grokRouter = router({
  /** 获取 Grok 可调用的工具定义（function calling 格式） */
  toolDefinitions: publicProcedure.query(() => {
    const fw = getToolFramework();
    return fw.getToolDefinitionsForGrok();
  }),

  /** 获取工具使用统计 */
  toolStats: publicProcedure.query(() => {
    const fw = getToolFramework();
    return fw.getStats();
  }),

  /** 获取审计日志 */
  auditLogs: publicProcedure
    .input(z.object({
      toolId: z.string().optional(),
      callerId: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(({ input }) => {
      const fw = getToolFramework();
      return fw.getAuditLogs({
        toolId: input?.toolId,
        callerId: input?.callerId,
        limit: input?.limit ?? 50,
      });
    }),
});

// ============================================================================
// 工具领域聚合路由
// ============================================================================

export const toolingDomainRouter = router({
  /** 工具注册中心 — 注册/发现/调用/链式执行 */
  registry: toolRegistryRouter,
  /** 安全沙箱 — 代码执行/安全检查/日志 */
  sandbox: sandboxRouter,
  /** Grok 集成 — function calling 定义/统计/审计 */
  grok: grokRouter,
  /** 算法赋能（元数据/推荐/组合/桥接） */
  algorithm: algorithmRouter,
  /** 高级知识蒸馏 */
  distillation: advancedDistillationRouter,
});
