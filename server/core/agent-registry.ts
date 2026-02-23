/**
 * ============================================================================
 * 平台级 Agent 注册中心 (AgentRegistry)
 * ============================================================================
 *
 * 整改方案 v2.1 · B-07 · 与现有架构完全对齐
 *
 * 设计目标：
 *   1. 统一管理所有 AI Agent（诊断 Agent、平台自省 Agent、未来新增 Agent）
 *   2. 支持多 SDK 适配器（custom = 现有 grok-tool-calling、vercel-ai、langgraph）
 *   3. 与现有 BaseRegistry 模式一致（注册/发现/元数据/Observable）
 *   4. 与 GrokTool 接口兼容（loopStage 分组、ToolContext 传递）
 *   5. 支持流式输出（AsyncGenerator）和一次性输出
 *
 * 架构位置：
 *   server/core/agent-registry.ts
 *   ├── AgentManifest        — Agent 元数据声明
 *   ├── AgentInstance         — 运行时 Agent 实例
 *   ├── AgentRegistry         — 注册中心（单例）
 *   └── agentRegistry         — 导出的单例
 *
 * 与现有代码的关系：
 *   - grokDiagnosticAgent.service.ts → 注册为 'diagnostic-agent'
 *   - grokPlatformAgent.service.ts   → 注册为 'platform-agent'
 *   - grok-tools.ts (12 个工具)      → 通过 agent manifest 的 tools 字段关联
 *   - grok-tool-calling.ts           → custom adapter 的底层引擎
 *   - BaseRegistry (registry.ts)     → 遵循相同的设计原则，但 Agent 有独特的生命周期
 *
 * 使用方式：
 *   import { agentRegistry } from '../core/agent-registry';
 *
 *   // 注册 Agent
 *   agentRegistry.register({
 *     id: 'diagnostic-agent',
 *     name: '设备诊断 Agent',
 *     loopStage: 'diagnosis',
 *     sdkAdapter: 'custom',
 *     invoke: async (input, ctx) => { ... },
 *     invokeStream: async function*(input, ctx) { ... },
 *   });
 *
 *   // 发现 Agent
 *   const agents = agentRegistry.discoverByStage('diagnosis');
 *
 *   // 调用 Agent
 *   const result = await agentRegistry.invoke('diagnostic-agent', input, ctx);
 *
 *   // 流式调用
 *   for await (const chunk of agentRegistry.invokeStream('diagnostic-agent', input, ctx)) {
 *     process.stdout.write(chunk.content);
 *   }
 */

import { createModuleLogger } from './logger';

const log = createModuleLogger('agent-registry');

// ============================================================================
// 类型定义
// ============================================================================

/** 闭环阶段 — 与 GrokTool.loopStage 完全一致 */
export type LoopStage = 'perception' | 'diagnosis' | 'guardrail' | 'evolution' | 'utility';

/** SDK 适配器类型 */
export type SdkAdapter = 'custom' | 'vercel-ai' | 'langgraph' | 'mastra';

/** Agent 健康状态 */
export type AgentHealth = 'healthy' | 'degraded' | 'unavailable';

/** Agent 调用上下文 — 扩展自 ToolContext */
export interface AgentContext {
  /** 会话 ID */
  sessionId: string;
  /** 设备/机器 ID */
  machineId?: string;
  /** OTel trace ID（自动从活跃 span 获取） */
  traceId?: string;
  /** 工况 ID */
  conditionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 额外上下文数据 */
  metadata?: Record<string, unknown>;
}

/** 流式输出块 */
export interface StreamChunk {
  /** 内容文本 */
  content: string;
  /** 块类型 */
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'final';
  /** 工具调用信息（type='tool_call' 时） */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  /** 工具结果（type='tool_result' 时） */
  toolResult?: unknown;
}

/** Agent 调用结果 */
export interface AgentResult {
  /** Agent ID */
  agentId: string;
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output: unknown;
  /** 工具调用记录 */
  toolCalls?: Array<{
    tool: string;
    input: unknown;
    output: unknown;
    durationMs: number;
  }>;
  /** 总耗时（ms） */
  durationMs: number;
  /** 使用的 token 数 */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 错误信息（success=false 时） */
  error?: string;
}

/**
 * Agent 清单 — 注册时提供的完整元数据 + 执行函数
 *
 * 设计原则：
 *   - 自描述：包含所有元数据，无需查询其他注册表
 *   - 可发现：通过 loopStage/tags/capabilities 多维度检索
 *   - 可执行：invoke/invokeStream 是 Agent 的核心能力
 */
export interface AgentManifest {
  /** 唯一标识符（kebab-case） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 版本 */
  version: string;
  /** 闭环阶段 */
  loopStage: LoopStage;
  /** SDK 适配器 */
  sdkAdapter: SdkAdapter;
  /** 标签（用于搜索过滤） */
  tags?: string[];
  /** Agent 能力声明 */
  capabilities?: string[];
  /** 关联的工具名称列表（对应 GrokTool.name） */
  tools?: string[];
  /** 最大并发调用数 */
  maxConcurrency?: number;
  /** 超时时间（ms） */
  timeoutMs?: number;

  /**
   * 一次性调用（必须实现）
   * @param input - 输入数据（由 Agent 自行解析）
   * @param context - 调用上下文
   * @returns AgentResult
   */
  invoke: (input: unknown, context: AgentContext) => Promise<AgentResult>;

  /**
   * 流式调用（可选，不实现则自动降级为 invoke 的单块输出）
   * @param input - 输入数据
   * @param context - 调用上下文
   * @yields StreamChunk
   */
  invokeStream?: (input: unknown, context: AgentContext) => AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * 健康检查（可选，不实现则默认 healthy）
   * @returns 健康状态
   */
  healthCheck?: () => Promise<AgentHealth>;
}

// ============================================================================
// Agent 运行时实例
// ============================================================================

interface AgentRuntimeState {
  /** 注册时间 */
  registeredAt: Date;
  /** 最后调用时间 */
  lastInvokedAt: Date | null;
  /** 总调用次数 */
  totalInvocations: number;
  /** 失败次数 */
  failureCount: number;
  /** 当前并发数 */
  activeConcurrency: number;
  /** 最后健康状态 */
  lastHealth: AgentHealth;
}

// ============================================================================
// AgentRegistry 核心类
// ============================================================================

export class AgentRegistry {
  private agents: Map<string, AgentManifest> = new Map();
  private runtimeState: Map<string, AgentRuntimeState> = new Map();
  private listeners: Array<(event: RegistryEvent) => void> = [];

  /**
   * 注册一个 Agent
   * @throws 如果 ID 已存在
   */
  register(manifest: AgentManifest): void {
    if (this.agents.has(manifest.id)) {
      log.warn(
        { agentId: manifest.id, existingVersion: this.agents.get(manifest.id)!.version, newVersion: manifest.version },
        'Agent already registered, replacing'
      );
    }

    // 验证必要字段
    if (!manifest.id || !manifest.name || !manifest.invoke) {
      throw new Error(`[AgentRegistry] Invalid manifest: id=${manifest.id}, name=${manifest.name}, invoke=${!!manifest.invoke}`);
    }

    this.agents.set(manifest.id, manifest);
    this.runtimeState.set(manifest.id, {
      registeredAt: new Date(),
      lastInvokedAt: null,
      totalInvocations: 0,
      failureCount: 0,
      activeConcurrency: 0,
      lastHealth: 'healthy',
    });

    log.info(
      { agentId: manifest.id, stage: manifest.loopStage, adapter: manifest.sdkAdapter, tools: manifest.tools?.length ?? 0 },
      `Agent registered: ${manifest.name}`
    );

    this.emit({ type: 'registered', agentId: manifest.id, timestamp: new Date() });
  }

  /**
   * 注销一个 Agent
   */
  unregister(agentId: string): boolean {
    const existed = this.agents.delete(agentId);
    this.runtimeState.delete(agentId);
    if (existed) {
      log.info({ agentId }, 'Agent unregistered');
      this.emit({ type: 'unregistered', agentId, timestamp: new Date() });
    }
    return existed;
  }

  /**
   * 获取单个 Agent 的 manifest
   */
  get(agentId: string): AgentManifest | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有已注册 Agent
   */
  listAll(): AgentManifest[] {
    return Array.from(this.agents.values());
  }

  /**
   * 按闭环阶段发现 Agent
   */
  discoverByStage(stage: LoopStage): AgentManifest[] {
    return this.listAll().filter(a => a.loopStage === stage);
  }

  /**
   * 按 SDK 适配器发现 Agent
   */
  discoverByAdapter(adapter: SdkAdapter): AgentManifest[] {
    return this.listAll().filter(a => a.sdkAdapter === adapter);
  }

  /**
   * 按标签发现 Agent
   */
  discoverByTag(tag: string): AgentManifest[] {
    return this.listAll().filter(a => a.tags?.includes(tag));
  }

  /**
   * 按能力发现 Agent
   */
  discoverByCapability(capability: string): AgentManifest[] {
    return this.listAll().filter(a => a.capabilities?.includes(capability));
  }

  /**
   * 调用 Agent（一次性）
   * 包含并发控制、超时保护、错误处理、运行时统计
   */
  async invoke(agentId: string, input: unknown, context: AgentContext): Promise<AgentResult> {
    const manifest = this.agents.get(agentId);
    if (!manifest) {
      throw new Error(`[AgentRegistry] Agent not found: ${agentId}`);
    }

    const state = this.runtimeState.get(agentId)!;

    // 并发控制
    if (manifest.maxConcurrency && state.activeConcurrency >= manifest.maxConcurrency) {
      log.warn(
        { agentId, current: state.activeConcurrency, max: manifest.maxConcurrency },
        'Agent concurrency limit reached'
      );
      return {
        agentId,
        success: false,
        output: null,
        durationMs: 0,
        error: `Concurrency limit reached (${state.activeConcurrency}/${manifest.maxConcurrency})`,
      };
    }

    state.activeConcurrency++;
    state.totalInvocations++;
    state.lastInvokedAt = new Date();

    const startTime = Date.now();

    try {
      // 超时保护
      const timeoutMs = manifest.timeoutMs ?? 120_000; // 默认 2 分钟
      const result = await Promise.race([
        manifest.invoke(input, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Agent timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      result.durationMs = Date.now() - startTime;

      log.info(
        { agentId, durationMs: result.durationMs, success: result.success, toolCalls: result.toolCalls?.length ?? 0 },
        `Agent invocation completed: ${manifest.name}`
      );

      this.emit({ type: 'invoked', agentId, timestamp: new Date(), durationMs: result.durationMs, success: result.success });

      return result;
    } catch (err: any) {
      state.failureCount++;
      const durationMs = Date.now() - startTime;

      log.warn(
        { agentId, err: err.message, durationMs },
        `Agent invocation failed: ${manifest.name}`
      );

      this.emit({ type: 'invoked', agentId, timestamp: new Date(), durationMs, success: false });

      return {
        agentId,
        success: false,
        output: null,
        durationMs,
        error: err.message,
      };
    } finally {
      state.activeConcurrency--;
    }
  }

  /**
   * 流式调用 Agent
   * 如果 Agent 未实现 invokeStream，自动降级为 invoke 的单块输出
   */
  async *invokeStream(agentId: string, input: unknown, context: AgentContext): AsyncGenerator<StreamChunk, void, unknown> {
    const manifest = this.agents.get(agentId);
    if (!manifest) {
      throw new Error(`[AgentRegistry] Agent not found: ${agentId}`);
    }

    if (manifest.invokeStream) {
      // 使用原生流式实现
      const state = this.runtimeState.get(agentId)!;
      state.activeConcurrency++;
      state.totalInvocations++;
      state.lastInvokedAt = new Date();

      try {
        yield* manifest.invokeStream(input, context);
      } catch (err: any) {
        state.failureCount++;
        log.warn({ agentId, err: err.message }, `Agent stream failed: ${manifest.name}`);
        yield { content: `Error: ${err.message}`, type: 'final' };
      } finally {
        state.activeConcurrency--;
      }
    } else {
      // 降级：invoke → 单块 stream
      const result = await this.invoke(agentId, input, context);
      yield {
        content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
        type: 'final',
      };
    }
  }

  /**
   * 全量健康检查
   */
  async healthCheckAll(): Promise<Map<string, AgentHealth>> {
    const results = new Map<string, AgentHealth>();

    for (const [id, manifest] of this.agents) {
      try {
        if (manifest.healthCheck) {
          const health = await manifest.healthCheck();
          results.set(id, health);
          this.runtimeState.get(id)!.lastHealth = health;
        } else {
          results.set(id, 'healthy'); // 无 healthCheck 默认 healthy
        }
      } catch (err: any) {
        log.warn({ agentId: id, err: err.message }, 'Agent health check failed');
        results.set(id, 'unavailable');
        this.runtimeState.get(id)!.lastHealth = 'unavailable';
      }
    }

    return results;
  }

  /**
   * 获取 Agent 运行时状态
   */
  getStats(agentId: string): AgentRuntimeState | undefined {
    return this.runtimeState.get(agentId);
  }

  /**
   * 获取全局统计摘要
   */
  getSummary(): {
    totalAgents: number;
    byStage: Record<LoopStage, number>;
    byAdapter: Record<SdkAdapter, number>;
    totalInvocations: number;
    totalFailures: number;
  } {
    const byStage: Record<string, number> = {};
    const byAdapter: Record<string, number> = {};
    let totalInvocations = 0;
    let totalFailures = 0;

    for (const [id, manifest] of this.agents) {
      byStage[manifest.loopStage] = (byStage[manifest.loopStage] || 0) + 1;
      byAdapter[manifest.sdkAdapter] = (byAdapter[manifest.sdkAdapter] || 0) + 1;

      const state = this.runtimeState.get(id);
      if (state) {
        totalInvocations += state.totalInvocations;
        totalFailures += state.failureCount;
      }
    }

    return {
      totalAgents: this.agents.size,
      byStage: byStage as Record<LoopStage, number>,
      byAdapter: byAdapter as Record<SdkAdapter, number>,
      totalInvocations,
      totalFailures,
    };
  }

  /**
   * 注册事件监听器
   */
  onEvent(listener: (event: RegistryEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }
}

// ============================================================================
// 事件类型
// ============================================================================

export interface RegistryEvent {
  type: 'registered' | 'unregistered' | 'invoked';
  agentId: string;
  timestamp: Date;
  durationMs?: number;
  success?: boolean;
}

// ============================================================================
// 单例导出
// ============================================================================

/** 全局 Agent 注册中心单例 */
export const agentRegistry = new AgentRegistry();
