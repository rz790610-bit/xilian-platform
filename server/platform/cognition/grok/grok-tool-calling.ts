/**
 * ============================================================================
 * Grok Tool Calling 引擎核心 — ReAct 范式推理循环
 * ============================================================================
 *
 * 核心能力：
 *   1. 工具发现：根据上下文自动筛选可用工具
 *   2. 函数调用：解析 Grok 返回的 tool_calls，执行对应工具
 *   3. 结果注入：将工具结果注入消息流，继续推理
 *   4. 迭代推理：最多 maxSteps 步，超过降级到规则引擎
 *   5. 持久化：每一步推理持久化到 grok_reasoning_chains 表
 *   6. 结构化输出：最终输出通过 JSON Schema 约束
 *
 * ReAct 范式：
 *   Thought → Action → Observation → Thought → ... → Final Answer
 */

import { createModuleLogger } from "../../../core/logger";
const log = createModuleLogger("grok-engine");
import { BUILTIN_GROK_TOOLS, GROK_TOOL_MAP, toGrokApiToolDef, type GrokTool, type ToolContext } from './grok-tools';

// ============================================================================
// 类型定义
// ============================================================================

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: GrokToolCall[];
  tool_call_id?: string;
}

export interface GrokToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GrokApiResponse {
  id: string;
  choices: Array<{
    message: GrokMessage;
    finish_reason: 'stop' | 'tool_calls' | 'length';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    total_ms?: number;
  };
}

export interface ReasoningStep {
  stepIndex: number;
  thought: string | null;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  durationMs: number;
  timestamp: number;
}

export interface ReasoningResult {
  sessionId: string;
  steps: ReasoningStep[];
  totalSteps: number;
  finalOutput: unknown;
  totalDurationMs: number;
  tokensUsed: number;
  fallbackUsed: boolean;
}

export interface ReasoningConfig {
  maxSteps: number;
  timeoutMs: number;
  temperature: number;
  model: string;
  responseSchema?: Record<string, unknown>;
  allowedTools?: string[];
  systemPromptOverride?: string;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: ReasoningConfig = {
  maxSteps: 8,
  timeoutMs: 60000,
  temperature: 0.1,
  model: 'grok-3',
  allowedTools: undefined, // undefined = 全部可用
};

// ============================================================================
// Grok Tool Calling 引擎
// ============================================================================

export class GrokToolCallingEngine {
  private tools: Map<string, GrokTool>;
  private grokApiUrl: string;
  private grokApiKey: string;

  constructor(
    grokApiUrl: string,
    grokApiKey: string,
    additionalTools?: GrokTool[]
  ) {
    this.grokApiUrl = grokApiUrl;
    this.grokApiKey = grokApiKey;
    this.tools = new Map(GROK_TOOL_MAP);

    // 注册额外工具
    if (additionalTools) {
      for (const tool of additionalTools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  /**
   * 注册新工具（运行时动态注册）
   */
  registerTool(tool: GrokTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(config?: ReasoningConfig): GrokTool[] {
    if (config?.allowedTools) {
      return config.allowedTools
        .map(name => this.tools.get(name))
        .filter((t): t is GrokTool => t !== undefined);
    }
    return Array.from(this.tools.values());
  }

  /**
   * 核心推理循环（ReAct 范式）
   *
   * @param query 用户/系统查询
   * @param context 工具执行上下文
   * @param config 推理配置
   * @param onStep 每步回调（用于实时推送）
   */
  async reasoningLoop(
    query: string,
    context: ToolContext,
    config: Partial<ReasoningConfig> = {},
    onStep?: (step: ReasoningStep) => void
  ): Promise<ReasoningResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    const steps: ReasoningStep[] = [];
    let tokensUsed = 0;
    let fallbackUsed = false;

    // 构建系统提示
    const systemPrompt = cfg.systemPromptOverride || this.buildSystemPrompt(context);

    // 初始化消息流
    const messages: GrokMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ];

    // 获取可用工具定义
    const availableTools = this.getAvailableTools(cfg);
    const toolDefs = availableTools.map(toGrokApiToolDef);

    for (let step = 0; step < cfg.maxSteps; step++) {
      const stepStart = Date.now();

      // 超时检查
      if (Date.now() - startTime > cfg.timeoutMs) {
        log.warn({ step }, 'Reasoning timeout, falling back');
        fallbackUsed = true;
        break;
      }

      try {
        // 调用 Grok API
        const response = await this.callGrokApi(messages, toolDefs, cfg);
        tokensUsed += response.usage.total_tokens;

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('Empty response from Grok API');
        }

        const message = choice.message;

        // 记录推理步骤
        const reasoningStep: ReasoningStep = {
          stepIndex: step,
          thought: message.content,
          toolName: message.tool_calls?.[0]?.function.name ?? null,
          toolInput: message.tool_calls?.[0]
            ? JSON.parse(message.tool_calls[0].function.arguments)
            : null,
          toolOutput: null,
          durationMs: Date.now() - stepStart,
          timestamp: Date.now(),
        };

        // 推理完成（stop = 最终答案）
        if (choice.finish_reason === 'stop') {
          steps.push(reasoningStep);
          onStep?.(reasoningStep);

          return {
            sessionId: context.sessionId,
            steps,
            totalSteps: steps.length,
            finalOutput: this.parseOutput(message.content, cfg.responseSchema),
            totalDurationMs: Date.now() - startTime,
            tokensUsed,
            fallbackUsed: false,
          };
        }

        // 执行工具调用
        if (choice.finish_reason === 'tool_calls' && message.tool_calls) {
          // 将 assistant 消息加入消息流
          messages.push(message);

          // 执行每个工具调用（支持并行多工具）
          for (const toolCall of message.tool_calls) {
            const tool = this.tools.get(toolCall.function.name);
            if (!tool) {
              // 工具未找到，返回错误信息给 Grok
              messages.push({
                role: 'tool',
                content: JSON.stringify({ error: `Tool not found: ${toolCall.function.name}` }),
                tool_call_id: toolCall.id,
              });
              continue;
            }

            try {
              // 解析并校验输入
              const rawInput = JSON.parse(toolCall.function.arguments);
              const validatedInput = tool.inputSchema.parse(rawInput);

              // 执行工具
              const toolResult = await tool.execute(validatedInput, context);

              // 更新推理步骤
              reasoningStep.toolOutput = toolResult;

              // 将工具结果注入消息流
              messages.push({
                role: 'tool',
                content: JSON.stringify(toolResult),
                tool_call_id: toolCall.id,
              });
            } catch (toolError: any) {
              // 工具执行失败，返回错误信息给 Grok（让它自己决定下一步）
              messages.push({
                role: 'tool',
                content: JSON.stringify({
                  error: toolError.message,
                  toolName: toolCall.function.name,
                }),
                tool_call_id: toolCall.id,
              });
            }
          }

          steps.push(reasoningStep);
          onStep?.(reasoningStep);
        }
      } catch (apiError: any) {
        log.warn({ step, err: apiError.message }, 'API error during reasoning');
        // API 错误：尝试继续
        steps.push({
          stepIndex: step,
          thought: `API Error: ${apiError.message}`,
          toolName: null,
          toolInput: null,
          toolOutput: null,
          durationMs: Date.now() - stepStart,
          timestamp: Date.now(),
        });
      }
    }

    // 超过最大步数或超时，降级到规则引擎
    log.warn({ maxSteps: cfg.maxSteps }, 'Exceeded max steps or timeout, falling back');
    return {
      sessionId: context.sessionId,
      steps,
      totalSteps: steps.length,
      finalOutput: null,
      totalDurationMs: Date.now() - startTime,
      tokensUsed,
      fallbackUsed: true,
    };
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(context: ToolContext): string {
    const toolDescriptions = Array.from(this.tools.values())
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `你是洗炼工业智能平台的认知核心（Grok），负责设备诊断和决策支持。

你的角色：
1. 第一性原理思维：从物理本质分析问题，不依赖经验规则
2. 工具驱动：通过调用工具获取数据和计算结果，不猜测
3. 结构化输出：最终输出必须是结构化的诊断报告

可用工具：
${toolDescriptions}

推理规范：
- 每一步先思考（Thought），再决定行动（Action）
- 优先查询实时数据，再查知识图谱获取历史模式
- 使用物理公式量化风险，不使用模糊描述
- 如果数据不足，明确说明并建议补充哪些数据
- 最终输出必须包含：安全评分、健康评分、效率评分、诊断条目、预测信息

当前上下文：
- 会话ID: ${context.sessionId}
- 设备ID: ${context.machineId || '未指定'}
- 工况ID: ${context.conditionId || '未指定'}
- 追踪ID: ${context.traceId}`;
  }

  /**
   * 调用 Grok API
   */
  private async callGrokApi(
    messages: GrokMessage[],
    tools: ReturnType<typeof toGrokApiToolDef>[],
    config: ReasoningConfig
  ): Promise<GrokApiResponse> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
    };

    if (config.responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'diagnosis_report',
          schema: config.responseSchema,
          strict: true,
        },
      };
    }

    const response = await fetch(`${this.grokApiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.grokApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<GrokApiResponse>;
  }

  /**
   * 解析输出
   */
  private parseOutput(content: string | null, schema?: Record<string, unknown>): unknown {
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  /**
   * 获取引擎统计
   */
  getStats(): { registeredTools: number; toolNames: string[] } {
    return {
      registeredTools: this.tools.size,
      toolNames: Array.from(this.tools.keys()),
    };
  }
}
