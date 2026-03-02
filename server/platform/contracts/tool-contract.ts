/**
 * ============================================================================
 * FIX-081/123: 统一工具契约 — ToolContract
 * ============================================================================
 *
 * 两套工具系统的抽象层：
 *   1. GrokTool (server/platform/cognition/grok/grok-tools.ts) — 14 个 LLM 推理工具
 *   2. ToolDefinition (server/platform/tooling/framework/tool-framework.ts) — 7+4 个平台工具
 *
 * ToolContract 是超集接口，两套系统通过适配器函数双向转换。
 * 新增工具建议直接实现 ToolContract，然后通过适配器注册到需要的系统中。
 *
 * 使用方式：
 *   import { ToolContract, adaptGrokTool, adaptToolDefinition } from '@/server/platform/contracts/tool-contract';
 */

import type { z } from 'zod';

// ============================================================================
// 统一上下文
// ============================================================================

/** 统一工具执行上下文 — 覆盖两套系统的所有字段 */
export interface UnifiedToolContext {
  /** 调用来源 */
  source: 'grok' | 'api' | 'pipeline' | 'manual';
  /** 会话 ID */
  sessionId?: string;
  /** 设备编码 */
  machineId?: string;
  /** 分布式追踪 ID */
  traceId: string;
  /** 工况 ID */
  conditionId?: string;
  /** 用户/调用者 ID */
  callerId?: string;
  /** 权限列表 */
  permissions?: string[];
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 统一工具契约
// ============================================================================

/** 工具所属领域 — 映射 loopStage + category */
export type ToolDomain =
  | 'perception'   // 感知域 (GrokTool.loopStage = 'perception')
  | 'diagnosis'    // 诊断域 (GrokTool.loopStage = 'diagnosis')
  | 'guardrail'    // 护栏域 (GrokTool.loopStage = 'guardrail')
  | 'evolution'    // 进化域 (GrokTool.loopStage = 'evolution')
  | 'query'        // 查询类 (ToolDefinition.category = 'query')
  | 'analyze'      // 分析类 (ToolDefinition.category = 'analyze')
  | 'execute'      // 执行类 (ToolDefinition.category = 'execute')
  | 'integrate'    // 集成类 (ToolDefinition.category = 'integrate')
  | 'utility';     // 通用工具 (GrokTool.loopStage = 'utility')

/** 统一工具契约 — 两套系统的超集 */
export interface ToolContract {
  /** 工具唯一标识 (推荐 snake_case，如 'query_sensor_realtime') */
  id: string;
  /** 工具显示名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 所属领域 */
  domain: ToolDomain;
  /** 版本号 (默认 '1.0.0') */
  version: string;
  /** 标签 (用于发现和过滤) */
  tags: string[];

  // --- Schema ---
  /** 输入 Zod Schema */
  inputSchema: z.ZodType<any>;
  /** 输出 Zod Schema */
  outputSchema: z.ZodType<any>;

  // --- 安全与限制 ---
  /** 所需权限 (空数组 = 无权限要求) */
  requiredPermissions: string[];
  /** 超时 (ms) */
  timeoutMs: number;
  /** 是否需要人工确认 */
  requiresConfirmation: boolean;

  // --- 执行 ---
  /** 工具执行函数 */
  execute: (input: unknown, context: UnifiedToolContext) => Promise<unknown>;
}

// ============================================================================
// GrokTool → ToolContract 适配器
// ============================================================================

/** GrokTool 接口（最小定义，避免循环依赖） */
interface GrokToolShape {
  name: string;
  description: string;
  loopStage: 'perception' | 'diagnosis' | 'guardrail' | 'evolution' | 'utility';
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  execute: (input: any, context: { sessionId: string; machineId?: string; traceId: string; conditionId?: string; userId?: string }) => Promise<any>;
}

/**
 * 将 GrokTool 适配为 ToolContract
 *
 * 映射规则：
 *   - id = name (GrokTool.name 已经是 snake_case)
 *   - domain = loopStage (完全对齐)
 *   - 无权限要求 (GrokTool 在 LLM 推理上下文中运行)
 *   - timeoutMs = 30s 默认
 */
export function adaptGrokTool(tool: GrokToolShape): ToolContract {
  return {
    id: tool.name,
    name: tool.name,
    description: tool.description,
    domain: tool.loopStage,
    version: '1.0.0',
    tags: ['grok', tool.loopStage],
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    requiredPermissions: [],
    timeoutMs: 30_000,
    requiresConfirmation: false,
    execute: (input, ctx) => tool.execute(input, {
      sessionId: ctx.sessionId || '',
      machineId: ctx.machineId,
      traceId: ctx.traceId,
      conditionId: ctx.conditionId,
      userId: ctx.callerId,
    }),
  };
}

// ============================================================================
// ToolDefinition → ToolContract 适配器
// ============================================================================

/** ToolDefinition 接口（最小定义，避免循环依赖） */
interface ToolDefinitionShape {
  id: string;
  name: string;
  description: string;
  category: 'query' | 'analyze' | 'execute' | 'integrate';
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  requiredPermissions: string[];
  timeoutMs: number;
  requiresConfirmation: boolean;
  tags: string[];
  version: string;
  execute: (input: unknown, context: { callerId: string; source: string; sessionId?: string; permissions: string[]; traceId: string; metadata?: Record<string, unknown> }) => Promise<unknown>;
}

/**
 * 将 ToolDefinition 适配为 ToolContract
 *
 * 映射规则：
 *   - domain = category (完全对齐)
 *   - 保留所有平台工具特性 (权限/超时/确认)
 */
export function adaptToolDefinition(tool: ToolDefinitionShape): ToolContract {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    domain: tool.category,
    version: tool.version,
    tags: tool.tags,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    requiredPermissions: tool.requiredPermissions,
    timeoutMs: tool.timeoutMs,
    requiresConfirmation: tool.requiresConfirmation,
    execute: (input, ctx) => tool.execute(input, {
      callerId: ctx.callerId || 'system',
      source: ctx.source,
      sessionId: ctx.sessionId,
      permissions: ctx.permissions || [],
      traceId: ctx.traceId,
      metadata: ctx.metadata,
    }),
  };
}

// ============================================================================
// 统一注册表
// ============================================================================

/** 工具注册表 — 两套系统通过此注册表实现统一访问 */
export class UnifiedToolRegistry {
  private tools = new Map<string, ToolContract>();

  /** 注册工具 */
  register(tool: ToolContract): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool '${tool.id}' already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  /** 批量注册 GrokTool */
  registerGrokTools(grokTools: GrokToolShape[]): void {
    for (const gt of grokTools) {
      const contract = adaptGrokTool(gt);
      if (!this.tools.has(contract.id)) {
        this.tools.set(contract.id, contract);
      }
    }
  }

  /** 批量注册 ToolDefinition */
  registerToolDefinitions(defs: ToolDefinitionShape[]): void {
    for (const td of defs) {
      const contract = adaptToolDefinition(td);
      if (!this.tools.has(contract.id)) {
        this.tools.set(contract.id, contract);
      }
    }
  }

  /** 获取工具 */
  get(id: string): ToolContract | undefined {
    return this.tools.get(id);
  }

  /** 按领域过滤 */
  findByDomain(domain: ToolDomain): ToolContract[] {
    return Array.from(this.tools.values()).filter(t => t.domain === domain);
  }

  /** 按标签过滤 */
  findByTag(tag: string): ToolContract[] {
    return Array.from(this.tools.values()).filter(t => t.tags.includes(tag));
  }

  /** 搜索 (名称/描述匹配) */
  search(query: string): ToolContract[] {
    const q = query.toLowerCase();
    return Array.from(this.tools.values()).filter(
      t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }

  /** 获取所有工具 */
  listAll(): ToolContract[] {
    return Array.from(this.tools.values());
  }

  /** 工具数量 */
  get size(): number {
    return this.tools.size;
  }

  /** 重置 (测试用) */
  reset(): void {
    this.tools.clear();
  }
}

// ============================================================================
// 单例
// ============================================================================

let _registry: UnifiedToolRegistry | null = null;

/** 获取统一工具注册表单例 */
export function getUnifiedToolRegistry(): UnifiedToolRegistry {
  if (!_registry) {
    _registry = new UnifiedToolRegistry();
  }
  return _registry;
}

/** 重置注册表 (测试用) */
export function resetUnifiedToolRegistry(): void {
  _registry?.reset();
  _registry = null;
}

// ============================================================================
// FIX-125: EventBus 集成 — 工具执行后发布事件
// ============================================================================

/**
 * 带事件发布的工具执行包装器
 *
 * 执行工具后自动通过 EventBus 发布 tool.executed 事件。
 * eventBus 通过回调注入（避免直接引入产生循环依赖）。
 */
export async function executeToolWithEvent(
  tool: ToolContract,
  input: unknown,
  context: UnifiedToolContext,
  publishEvent?: (topic: string, eventType: string, payload: Record<string, unknown>) => void,
): Promise<unknown> {
  const start = Date.now();
  let success = true;
  let error: string | undefined;
  let result: unknown;

  try {
    result = await tool.execute(input, context);
  } catch (err: any) {
    success = false;
    error = err?.message || 'unknown error';
    throw err;
  } finally {
    if (publishEvent) {
      try {
        publishEvent('tool.execution', 'tool_executed', {
          toolId: tool.id,
          domain: tool.domain,
          success,
          durationMs: Date.now() - start,
          traceId: context.traceId,
          callerId: context.callerId || 'unknown',
          ...(error ? { error } : {}),
        });
      } catch {
        // EventBus 发布失败不影响工具执行
      }
    }
  }

  return result;
}
