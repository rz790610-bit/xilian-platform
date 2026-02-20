/**
 * ============================================================================
 * 工具化 API 框架 (Tool Framework)
 * ============================================================================
 *
 * 统一的工具注册、发现、执行框架：
 *   - 所有工具遵循统一接口（Tool Protocol）
 *   - 支持 Grok Tool Calling 自动发现
 *   - 支持权限控制、审计日志、超时管理
 *   - 支持工具组合（Pipeline / Chain）
 *
 * 工具分类：
 *   1. 数据查询工具（query_*）：只读，查询数据
 *   2. 分析计算工具（analyze_*）：计算，不修改状态
 *   3. 操作执行工具（execute_*）：修改状态，需要权限
 *   4. 外部集成工具（integrate_*）：调用外部服务
 */

import { z, type ZodSchema } from 'zod';

// ============================================================================
// 类型定义
// ============================================================================

export interface ToolDefinition {
  /** 工具 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具描述（供 Grok 理解） */
  description: string;
  /** 工具分类 */
  category: 'query' | 'analyze' | 'execute' | 'integrate';
  /** 输入 Schema (Zod) */
  inputSchema: ZodSchema;
  /** 输出 Schema (Zod) */
  outputSchema: ZodSchema;
  /** 所需权限 */
  requiredPermissions: string[];
  /** 超时 (ms) */
  timeoutMs: number;
  /** 是否需要确认 */
  requiresConfirmation: boolean;
  /** 标签 */
  tags: string[];
  /** 版本 */
  version: string;
  /** 执行函数 */
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>;
}

export interface ToolExecutionContext {
  /** 调用者 ID */
  callerId: string;
  /** 调用来源 */
  source: 'grok' | 'api' | 'pipeline' | 'manual';
  /** 会话 ID */
  sessionId?: string;
  /** 权限列表 */
  permissions: string[];
  /** 追踪 ID */
  traceId: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionResult {
  toolId: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
  traceId: string;
  timestamp: number;
}

export interface ToolAuditLog {
  timestamp: number;
  toolId: string;
  callerId: string;
  source: string;
  input: unknown;
  output: unknown;
  success: boolean;
  durationMs: number;
  traceId: string;
  error?: string;
}

// ============================================================================
// 工具框架
// ============================================================================

export class ToolFramework {
  private tools: Map<string, ToolDefinition> = new Map();
  private auditLogs: ToolAuditLog[] = [];
  private maxAuditLogs: number = 10000;

  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  /**
   * 批量注册
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 发现工具（供 Grok 使用）
   */
  discover(filter?: {
    category?: string;
    tags?: string[];
    search?: string;
  }): { id: string; name: string; description: string; inputSchema: unknown }[] {
    let tools = Array.from(this.tools.values());

    if (filter?.category) {
      tools = tools.filter(t => t.category === filter.category);
    }
    if (filter?.tags && filter.tags.length > 0) {
      tools = tools.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
    }
    if (filter?.search) {
      const search = filter.search.toLowerCase();
      tools = tools.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search)
      );
    }

    return tools.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      inputSchema: this.zodToJsonSchema(t.inputSchema),
    }));
  }

  /**
   * 执行工具
   */
  async execute(
    toolId: string,
    input: unknown,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        toolId, success: false, output: null,
        error: `Tool not found: ${toolId}`,
        durationMs: 0, traceId: context.traceId, timestamp: Date.now(),
      };
    }

    // 权限检查
    const missingPerms = tool.requiredPermissions.filter(p => !context.permissions.includes(p));
    if (missingPerms.length > 0) {
      return {
        toolId, success: false, output: null,
        error: `Missing permissions: ${missingPerms.join(', ')}`,
        durationMs: 0, traceId: context.traceId, timestamp: Date.now(),
      };
    }

    // 输入校验
    const parseResult = tool.inputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        toolId, success: false, output: null,
        error: `Input validation failed: ${parseResult.error.message}`,
        durationMs: 0, traceId: context.traceId, timestamp: Date.now(),
      };
    }

    // 执行（带超时）
    const startTime = Date.now();
    try {
      const output = await Promise.race([
        tool.execute(parseResult.data, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool timeout after ${tool.timeoutMs}ms`)), tool.timeoutMs)
        ),
      ]);

      const result: ToolExecutionResult = {
        toolId, success: true, output,
        durationMs: Date.now() - startTime,
        traceId: context.traceId, timestamp: Date.now(),
      };

      this.recordAudit(tool, context, input, output, true, result.durationMs);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const result: ToolExecutionResult = {
        toolId, success: false, output: null,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        traceId: context.traceId, timestamp: Date.now(),
      };

      this.recordAudit(tool, context, input, null, false, result.durationMs, errorMsg);
      return result;
    }
  }

  /**
   * 链式执行多个工具
   */
  async executeChain(
    toolIds: string[],
    initialInput: unknown,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    let currentInput = initialInput;

    for (const toolId of toolIds) {
      const result = await this.execute(toolId, currentInput, context);
      results.push(result);

      if (!result.success) break;
      currentInput = result.output;
    }

    return results;
  }

  /**
   * 获取工具定义（供 Grok function calling）
   */
  getToolDefinitionsForGrok(): {
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.inputSchema),
      },
    }));
  }

  /**
   * 获取审计日志
   */
  getAuditLogs(filter?: { toolId?: string; callerId?: string; limit?: number }): ToolAuditLog[] {
    let logs = [...this.auditLogs];
    if (filter?.toolId) logs = logs.filter(l => l.toolId === filter.toolId);
    if (filter?.callerId) logs = logs.filter(l => l.callerId === filter.callerId);
    return logs.slice(-(filter?.limit || 100));
  }

  /**
   * 获取工具统计
   */
  getStats(): Record<string, { calls: number; successRate: number; avgDurationMs: number }> {
    const stats: Record<string, { calls: number; successes: number; totalDuration: number }> = {};

    for (const log of this.auditLogs) {
      if (!stats[log.toolId]) stats[log.toolId] = { calls: 0, successes: 0, totalDuration: 0 };
      stats[log.toolId].calls++;
      if (log.success) stats[log.toolId].successes++;
      stats[log.toolId].totalDuration += log.durationMs;
    }

    const result: Record<string, { calls: number; successRate: number; avgDurationMs: number }> = {};
    for (const [id, s] of Object.entries(stats)) {
      result[id] = {
        calls: s.calls,
        successRate: s.calls > 0 ? s.successes / s.calls : 0,
        avgDurationMs: s.calls > 0 ? s.totalDuration / s.calls : 0,
      };
    }
    return result;
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  private recordAudit(
    tool: ToolDefinition, context: ToolExecutionContext,
    input: unknown, output: unknown,
    success: boolean, durationMs: number, error?: string
  ): void {
    this.auditLogs.push({
      timestamp: Date.now(),
      toolId: tool.id,
      callerId: context.callerId,
      source: context.source,
      input, output, success, durationMs,
      traceId: context.traceId,
      error,
    });

    if (this.auditLogs.length > this.maxAuditLogs) {
      this.auditLogs = this.auditLogs.slice(-this.maxAuditLogs * 0.8);
    }
  }

  private zodToJsonSchema(schema: ZodSchema): unknown {
    // 简化的 Zod → JSON Schema 转换
    try {
      const description = schema.description || '';
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          const zodValue = value as ZodSchema;
          properties[key] = {
            type: this.getZodType(zodValue),
            description: zodValue.description || key,
          };
          if (!(zodValue instanceof z.ZodOptional)) {
            required.push(key);
          }
        }

        return { type: 'object', properties, required, description };
      }
      return { type: 'object', description };
    } catch {
      return { type: 'object' };
    }
  }

  private getZodType(schema: ZodSchema): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) return 'array';
    if (schema instanceof z.ZodObject) return 'object';
    if (schema instanceof z.ZodOptional) return this.getZodType((schema as z.ZodOptional<ZodSchema>).unwrap());
    return 'string';
  }
}
