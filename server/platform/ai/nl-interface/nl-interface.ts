/**
 * ============================================================================
 * NL 自然语言交互核心 — NLInterface
 * ============================================================================
 *
 * 港机设备智能运维平台的自然语言交互层核心模块。
 * 接受中文自然语言查询，返回结构化+自然语言混合回答。
 *
 * 核心能力：
 *   1. 单次查询 (query)     — 意图分类 → 路由 → 执行 → 格式化
 *   2. 流式查询 (queryStream) — 逐步流式返回思考过程和结果
 *   3. 多轮对话 (converse)   — 维护上下文的连续对话
 *   4. 智能建议 (suggest)    — 基于当前上下文推荐后续问题
 *
 * 架构特征：
 *   - 单例模式 + 工厂函数 (getNLInterface / resetNLInterface)
 *   - 注册为 AgentRegistry 中的 'nl-interface-agent'
 *   - 所有工具调用失败时降级为 LLM 直接回答
 *   - 事件驱动：通过 EventBus 发布查询完成事件
 *
 * 依赖：
 *   - NLIntentRouter: 意图分类和路由
 *   - NL_INTERFACE_TOOLS: 6 个 NL 专用工具
 *   - GrokToolCallingEngine: ReAct 推理循环（复杂诊断查询）
 *   - invokeLLM: LLM 直接调用（简单查询和降级）
 *   - EventBus: 事件发布
 *   - AgentRegistry: Agent 注册
 */

import * as crypto from 'crypto';
import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { eventBus } from '../../../services/eventBus.service';
import { agentRegistry, type AgentContext } from '../../../core/agent-registry';
import { GrokToolCallingEngine } from '../../cognition/grok/grok-tool-calling';
import { getAIConfig } from '../ai.config';
import { AI_NL_TOPICS } from '../ai.topics';
import { NLIntentRouter } from './nl-intent-router';
import { NL_INTERFACE_TOOLS } from './nl-tools';
import { resolveDeviceReference, normalizeDeviceId } from './nl-vocabulary';
import type {
  NLQueryRequest,
  NLQueryResponse,
  NLStreamChunk,
  NLConversationRequest,
  NLSuggestionContext,
  ExecutionResult,
  IntentClassification,
} from '../ai.types';

const log = createModuleLogger('nl-interface');

/** 对话历史条目 */
interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ============================================================================
// NLInterface 核心类
// ============================================================================

export class NLInterface {
  /** 意图路由器 */
  private router: NLIntentRouter;

  /** Grok 推理引擎（可选，用于复杂诊断查询） */
  private grokEngine: GrokToolCallingEngine | null = null;

  /** 对话历史缓存：conversationId → 消息列表 */
  private conversations: Map<string, ConversationEntry[]>;

  /** 对话历史最大条目数 */
  private maxConversationHistory: number;

  constructor() {
    this.router = new NLIntentRouter();
    this.conversations = new Map();
    this.maxConversationHistory = getAIConfig().nl.maxConversationHistory;
    this.initGrokEngine();
    this.registerAgent();

    log.info('NLInterface 初始化完成');
  }

  // ==========================================================================
  // 公开 API
  // ==========================================================================

  /**
   * 单次查询 — 主入口
   *
   * 完整流程：意图分类 → 路由 → 执行 → 格式化 → 事件发布
   *
   * @param request - NL 查询请求
   * @returns NL 查询响应
   */
  async query(request: NLQueryRequest): Promise<NLQueryResponse> {
    const requestId = crypto.randomUUID();
    const startMs = Date.now();

    log.info({ requestId, sessionId: request.sessionId, query: request.query }, '开始处理 NL 查询');

    try {
      // 1. 意图分类
      const intent = await this.router.classifyIntent(request.query);

      // 如果意图置信度低于阈值，降级为通用查询
      const config = getAIConfig();
      if (intent.confidence < config.nl.intentConfidenceThreshold) {
        log.info(
          { requestId, intent: intent.intent, confidence: intent.confidence, threshold: config.nl.intentConfidenceThreshold },
          '意图置信度低于阈值，降级为通用查询'
        );
        intent.intent = 'general_query';
      }

      // 发布意图分类事件
      await this.publishEvent(AI_NL_TOPICS.INTENT_CLASSIFIED, {
        requestId,
        intent: intent.intent,
        confidence: intent.confidence,
        entities: intent.entities,
      });

      // 2. 路由到执行计划
      const plan = await this.router.routeToExecution(intent);

      // 3. 执行计划中的每个步骤
      const context = this.buildToolContext(request, requestId);
      const executionResults = await this.executePlan(plan, intent, context, request);

      // 4. 格式化响应
      const formatted = await this.router.formatResponse(executionResults, request.query);

      // 5. 构建响应
      const durationMs = Date.now() - startMs;
      const response: NLQueryResponse = {
        requestId,
        answer: formatted.answer,
        charts: formatted.charts,
        suggestions: formatted.suggestions.slice(0, config.nl.maxSuggestions),
        intent,
        executionResults,
        durationMs,
        timestamp: Date.now(),
      };

      // 6. 发布查询完成事件
      await this.publishEvent(AI_NL_TOPICS.QUERY_COMPLETED, {
        requestId,
        sessionId: request.sessionId,
        intent: intent.intent,
        durationMs,
        success: true,
        toolsUsed: executionResults.map(r => r.tool),
      });

      log.info(
        { requestId, intent: intent.intent, durationMs, steps: executionResults.length },
        'NL 查询处理完成'
      );

      return response;
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      log.error({ requestId, err: err.message, durationMs }, 'NL 查询处理失败');

      // 降级：返回友好的错误响应
      return this.buildErrorResponse(requestId, request.query, err.message, durationMs);
    }
  }

  /**
   * 流式查询 — 逐步返回处理过程
   *
   * 依次 yield：thinking → answer 分块 → chart → suggestion → done
   *
   * @param request - NL 查询请求
   * @yields NLStreamChunk
   */
  async *queryStream(request: NLQueryRequest): AsyncGenerator<NLStreamChunk> {
    const requestId = crypto.randomUUID();
    const startMs = Date.now();

    try {
      // 1. 思考阶段
      yield { type: 'thinking', content: '正在理解您的问题...' };

      const intent = await this.router.classifyIntent(request.query);
      yield { type: 'thinking', content: `已识别意图：${this.intentLabel(intent.intent)}（置信度 ${(intent.confidence * 100).toFixed(0)}%）` };

      // 2. 执行阶段
      const plan = await this.router.routeToExecution(intent);
      const context = this.buildToolContext(request, requestId);

      yield { type: 'thinking', content: `正在执行 ${plan.steps.length} 个查询步骤...` };

      const executionResults = await this.executePlan(plan, intent, context, request);

      // 3. 回答阶段
      const formatted = await this.router.formatResponse(executionResults, request.query);

      // 按句分块输出回答
      const sentences = this.splitBySentence(formatted.answer);
      for (const sentence of sentences) {
        yield { type: 'answer', content: sentence };
      }

      // 4. 图表
      for (const chart of formatted.charts) {
        yield { type: 'chart', content: chart.title, data: chart };
      }

      // 5. 建议
      const config = getAIConfig();
      for (const suggestion of formatted.suggestions.slice(0, config.nl.maxSuggestions)) {
        yield { type: 'suggestion', content: suggestion };
      }

      // 6. 完成
      yield { type: 'done', content: '', data: { requestId, durationMs: Date.now() - startMs } };

    } catch (err: any) {
      log.error({ requestId, err: err.message }, '流式查询处理失败');
      yield { type: 'answer', content: `抱歉，处理过程中出现错误：${err.message}` };
      yield { type: 'done', content: '', data: { requestId, error: err.message } };
    }
  }

  /**
   * 多轮对话 — 维护上下文的连续对话
   *
   * 将对话历史注入意图分类和响应格式化过程中。
   *
   * @param request - 对话请求（包含 conversationId）
   * @returns NL 查询响应
   */
  async converse(request: NLConversationRequest): Promise<NLQueryResponse> {
    const { conversationId, query } = request;

    // 获取或创建对话历史
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, []);
    }
    const history = this.conversations.get(conversationId)!;

    // 添加用户消息
    history.push({ role: 'user', content: query, timestamp: Date.now() });

    // 构建带上下文的查询
    const contextualQuery = this.buildContextualQuery(query, history);

    // 使用增强的查询执行
    const response = await this.query({
      ...request,
      query: contextualQuery,
    });

    // 添加助手回答到历史
    history.push({ role: 'assistant', content: response.answer, timestamp: Date.now() });

    // 裁剪历史长度
    while (history.length > this.maxConversationHistory * 2) {
      history.shift();
    }

    // 发布对话更新事件
    await this.publishEvent(AI_NL_TOPICS.CONVERSATION_UPDATED, {
      conversationId,
      historyLength: history.length,
      sessionId: request.sessionId,
    });

    return response;
  }

  /**
   * 智能建议 — 根据上下文推荐后续问题
   *
   * @param context - 建议上下文
   * @returns 建议问题列表
   */
  async suggest(context: NLSuggestionContext): Promise<string[]> {
    const config = getAIConfig();

    try {
      const promptParts: string[] = [
        '请根据以下上下文，生成 3-5 个港机设备运维相关的建议问题。输出 JSON: { "suggestions": ["..."] }',
      ];

      if (context.machineId) {
        promptParts.push(`当前查看的设备: ${context.machineId}`);
      }
      if (context.recentQueries && context.recentQueries.length > 0) {
        promptParts.push(`最近问过的问题: ${context.recentQueries.join('、')}`);
      }
      if (context.currentAlerts && context.currentAlerts > 0) {
        promptParts.push(`当前有 ${context.currentAlerts} 个活跃告警`);
      }

      const response = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备运维助手。生成实用的后续问题建议。' },
          { role: 'user', content: promptParts.join('\n') },
        ],
        model: config.nl.intentModel, // 使用快速模型
        maxTokens: 256,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      const parsed = this.safeParseJSON<{ suggestions: string[] }>(
        typeof content === 'string' ? content : ''
      );

      return (parsed?.suggestions || this.defaultSuggestions(context)).slice(0, config.nl.maxSuggestions);
    } catch (err: any) {
      log.warn({ err: err.message }, '建议生成 LLM 调用失败，使用默认建议');
      return this.defaultSuggestions(context).slice(0, config.nl.maxSuggestions);
    }
  }

  // ==========================================================================
  // 内部方法：执行计划
  // ==========================================================================

  /**
   * 执行完整的执行计划
   */
  private async executePlan(
    plan: import('../ai.types').ExecutionPlan,
    intent: IntentClassification,
    context: import('../../cognition/grok/grok-tools').ToolContext,
    request: NLQueryRequest
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    let resolvedMachineId: string | undefined = request.machineId;

    for (const step of plan.steps) {
      // 替换占位符为已解析的设备ID
      const stepInput = this.resolveStepInput(step.input, resolvedMachineId);

      const result = await this.executeStep(
        { tool: step.tool, input: stepInput },
        context
      );

      // 如果是设备引用解析步骤，提取解析后的设备ID
      if (step.tool === 'resolve_device_reference' && result.success && result.data) {
        const resolved = result.data as { id?: string };
        if (resolved.id) {
          resolvedMachineId = resolved.id;
        }
      }

      results.push(result);
    }

    // 如果主计划全部失败且有降级计划，执行降级计划
    const allFailed = results.every(r => !r.success);
    if (allFailed && plan.fallbackPlan) {
      log.info({ stepsCount: plan.fallbackPlan.steps.length }, '主计划全部失败，执行降级计划');
      for (const step of plan.fallbackPlan.steps) {
        const result = await this.executeStep(
          { tool: step.tool, input: step.input },
          context
        );
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 执行单个工具调用步骤
   */
  private async executeStep(
    step: { tool: string; input: Record<string, unknown> },
    context: import('../../cognition/grok/grok-tools').ToolContext
  ): Promise<ExecutionResult> {
    const startMs = Date.now();

    try {
      // 特殊处理：LLM 直接回答
      if (step.tool === 'llm_direct') {
        const answer = await this.directLLMAnswer(step.input.query as string);
        return {
          tool: step.tool,
          success: true,
          data: { answer },
          durationMs: Date.now() - startMs,
        };
      }

      // 特殊处理：诊断增强引擎
      if (step.tool === 'diagnostic_enhancer') {
        return await this.executeDiagnosticEnhancer(step.input, context, startMs);
      }

      // 从 NL 工具列表中查找
      const nlTool = NL_INTERFACE_TOOLS.find(t => t.name === step.tool);
      if (nlTool) {
        const validatedInput = nlTool.inputSchema.parse(step.input);
        const output = await nlTool.execute(validatedInput, context);
        return {
          tool: step.tool,
          success: true,
          data: output,
          durationMs: Date.now() - startMs,
        };
      }

      // 尝试通过 GrokToolCallingEngine 执行内置工具
      if (this.grokEngine) {
        const result = await this.grokEngine.reasoningLoop(
          JSON.stringify(step.input),
          context,
          {
            maxSteps: 3,
            timeoutMs: 15000,
            allowedTools: [step.tool],
          }
        );

        return {
          tool: step.tool,
          success: !result.fallbackUsed,
          data: result.finalOutput,
          durationMs: Date.now() - startMs,
        };
      }

      // 工具未找到
      log.warn({ tool: step.tool }, '工具未找到');
      return {
        tool: step.tool,
        success: false,
        data: null,
        durationMs: Date.now() - startMs,
        error: `工具 ${step.tool} 未注册`,
      };
    } catch (err: any) {
      log.warn({ tool: step.tool, err: err.message }, '工具执行失败');
      return {
        tool: step.tool,
        success: false,
        data: null,
        durationMs: Date.now() - startMs,
        error: err.message,
      };
    }
  }

  /**
   * 执行诊断增强引擎
   */
  private async executeDiagnosticEnhancer(
    input: Record<string, unknown>,
    context: import('../../cognition/grok/grok-tools').ToolContext,
    startMs: number
  ): Promise<ExecutionResult> {
    try {
      // 延迟导入诊断增强引擎，避免循环依赖
      const { getDiagnosticEnhancer } = await import('../diagnostic-enhancer');
      const enhancer = getDiagnosticEnhancer();

      if (!enhancer) {
        return {
          tool: 'diagnostic_enhancer',
          success: false,
          data: null,
          durationMs: Date.now() - startMs,
          error: '诊断增强引擎未初始化',
        };
      }

      // 调用诊断增强引擎
      const report = await (enhancer as any).enhance({
        machineId: input.machineId as string,
        algorithmResults: [],
        sensorFeatures: [],
        depth: (input.depth as string) || 'standard',
      });

      return {
        tool: 'diagnostic_enhancer',
        success: true,
        data: report,
        durationMs: Date.now() - startMs,
      };
    } catch (err: any) {
      log.warn({ err: err.message }, '诊断增强引擎执行失败');
      return {
        tool: 'diagnostic_enhancer',
        success: false,
        data: null,
        durationMs: Date.now() - startMs,
        error: err.message,
      };
    }
  }

  /**
   * LLM 直接回答（用于通用查询和降级场景）
   */
  private async directLLMAnswer(query: string): Promise<string> {
    const config = getAIConfig();

    try {
      const response = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `你是港机设备智能运维平台的助手。请用中文简洁地回答用户的问题。
如果涉及具体设备数据，请说明需要指定设备ID才能查询。
如果不确定答案，请诚实说明。`,
          },
          { role: 'user', content: query },
        ],
        model: config.nl.responseModel,
        maxTokens: 512,
      });

      const content = response.choices[0]?.message?.content;
      return typeof content === 'string' ? content : '抱歉，无法生成回答。';
    } catch (err: any) {
      log.warn({ err: err.message }, 'LLM 直接回答失败');
      return `抱歉，暂时无法回答您的问题"${query}"。请稍后重试。`;
    }
  }

  // ==========================================================================
  // 内部方法：初始化
  // ==========================================================================

  /**
   * 初始化 Grok 推理引擎
   *
   * 尝试创建 GrokToolCallingEngine 并注册 NL 工具。
   * 如果环境变量缺失，降级运行（不使用 Grok 引擎）。
   */
  private initGrokEngine(): void {
    try {
      const grokApiUrl = process.env.XAI_API_URL || process.env.GROK_API_URL || '';
      const grokApiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';

      if (!grokApiUrl || !grokApiKey) {
        log.info('Grok API 配置缺失，NLInterface 将不使用 GrokToolCallingEngine（降级运行）');
        return;
      }

      this.grokEngine = new GrokToolCallingEngine(grokApiUrl, grokApiKey, NL_INTERFACE_TOOLS);
      log.info({ toolCount: NL_INTERFACE_TOOLS.length }, 'Grok 推理引擎初始化完成，已注册 NL 工具');
    } catch (err: any) {
      log.warn({ err: err.message }, 'Grok 推理引擎初始化失败，将降级运行');
      this.grokEngine = null;
    }
  }

  /**
   * 注册为 AgentRegistry 中的 Agent
   */
  private registerAgent(): void {
    try {
      agentRegistry.register({
        id: 'nl-interface-agent',
        name: '自然语言交互 Agent',
        description: '接受中文自然语言查询，理解意图并调用工具链生成回答。支持设备状态查询、诊断分析、告警查询等 12 种意图类型。',
        version: '1.0.0',
        loopStage: 'utility',
        sdkAdapter: 'custom',
        tags: ['nl', 'query', 'conversation', 'chinese'],
        capabilities: ['natural_language', 'query', 'conversation', 'streaming'],
        tools: NL_INTERFACE_TOOLS.map(t => t.name),
        maxConcurrency: 10,
        timeoutMs: getAIConfig().nl.queryTimeoutMs,

        invoke: async (input: unknown, ctx: AgentContext) => {
          const request = input as NLQueryRequest;
          const startMs = Date.now();

          try {
            const response = await this.query({
              query: request.query,
              sessionId: ctx.sessionId,
              userId: ctx.userId,
              machineId: ctx.machineId,
              context: request.context,
            });

            return {
              agentId: 'nl-interface-agent',
              success: true,
              output: response,
              durationMs: Date.now() - startMs,
            };
          } catch (err: any) {
            return {
              agentId: 'nl-interface-agent',
              success: false,
              output: null,
              durationMs: Date.now() - startMs,
              error: err.message,
            };
          }
        },

        invokeStream: async function* (this: NLInterface, input: unknown, ctx: AgentContext) {
          const request = input as NLQueryRequest;

          for await (const chunk of this.queryStream({
            query: request.query,
            sessionId: ctx.sessionId,
            userId: ctx.userId,
            machineId: ctx.machineId,
            context: request.context,
          })) {
            yield {
              content: chunk.content,
              type: chunk.type === 'answer' ? 'text' as const
                : chunk.type === 'thinking' ? 'thinking' as const
                : chunk.type === 'done' ? 'final' as const
                : 'text' as const,
            };
          }
        }.bind(this),

        healthCheck: async () => 'healthy',
      });

      log.info('NLInterface Agent 已注册到 AgentRegistry');
    } catch (err: any) {
      log.warn({ err: err.message }, 'AgentRegistry 注册失败（不影响核心功能）');
    }
  }

  // ==========================================================================
  // 内部方法：辅助
  // ==========================================================================

  /**
   * 构建工具执行上下文
   */
  private buildToolContext(
    request: NLQueryRequest,
    requestId: string
  ): import('../../cognition/grok/grok-tools').ToolContext {
    return {
      sessionId: request.sessionId,
      machineId: request.machineId,
      traceId: requestId,
      userId: request.userId,
    };
  }

  /**
   * 替换步骤输入中的占位符
   */
  private resolveStepInput(
    input: Record<string, unknown>,
    resolvedMachineId?: string
  ): Record<string, unknown> {
    const resolved = { ...input };

    if (resolved.machineId === '__RESOLVED__' && resolvedMachineId) {
      resolved.machineId = resolvedMachineId;
    }

    // 递归处理嵌套对象
    for (const [key, value] of Object.entries(resolved)) {
      if (value === '__RESOLVED__' && resolvedMachineId) {
        resolved[key] = resolvedMachineId;
      }
    }

    return resolved;
  }

  /**
   * 构建带上下文的查询（多轮对话用）
   *
   * 将最近的对话历史注入查询中，帮助 LLM 理解上下文。
   */
  private buildContextualQuery(query: string, history: ConversationEntry[]): string {
    if (history.length <= 1) return query;

    // 取最近的几轮对话作为上下文
    const recentHistory = history.slice(-6, -1); // 不包含当前消息
    if (recentHistory.length === 0) return query;

    const contextLines = recentHistory.map(
      entry => `${entry.role === 'user' ? '用户' : '助手'}: ${entry.content}`
    );

    return `对话上下文：\n${contextLines.join('\n')}\n\n当前问题：${query}`;
  }

  /**
   * 意图类型中文标签
   */
  private intentLabel(intent: string): string {
    const labels: Record<string, string> = {
      device_status_query: '设备状态查询',
      sensor_data_query: '传感器数据查询',
      diagnosis_query: '故障诊断查询',
      alert_query: '告警查询',
      maintenance_query: '维保计划查询',
      comparison_query: '设备对比查询',
      prediction_query: '预测查询',
      knowledge_query: '知识查询',
      operation_query: '操作流程查询',
      report_query: '报告查询',
      config_query: '配置查询',
      general_query: '通用查询',
    };
    return labels[intent] || intent;
  }

  /**
   * 按句拆分文本（用于流式输出）
   */
  private splitBySentence(text: string): string[] {
    // 按中文句号、问号、感叹号、换行分割
    const parts = text.split(/(?<=[。！？\n])/);
    return parts.filter(p => p.trim().length > 0);
  }

  /**
   * 构建错误响应
   */
  private buildErrorResponse(
    requestId: string,
    query: string,
    errorMessage: string,
    durationMs: number
  ): NLQueryResponse {
    return {
      requestId,
      answer: `抱歉，处理您的问题"${query}"时遇到了错误。请稍后重试或尝试换一种方式描述您的问题。`,
      charts: [],
      suggestions: [
        '查看设备健康状态',
        '查看最近告警',
        '查看维保计划',
      ],
      intent: {
        intent: 'general_query',
        confidence: 0,
        entities: [],
        parameters: {},
        originalQuery: query,
      },
      executionResults: [{
        tool: 'error',
        success: false,
        data: null,
        durationMs,
        error: errorMessage,
      }],
      durationMs,
      timestamp: Date.now(),
    };
  }

  /**
   * 默认建议（LLM 不可用时的降级）
   */
  private defaultSuggestions(context: NLSuggestionContext): string[] {
    const suggestions: string[] = [];

    if (context.machineId) {
      suggestions.push(`${context.machineId} 的健康状态如何？`);
      suggestions.push(`${context.machineId} 最近有什么告警？`);
      suggestions.push(`${context.machineId} 振动趋势`);
    } else {
      suggestions.push('哪台设备健康评分最低？');
      suggestions.push('最近24小时有多少告警？');
      suggestions.push('本周有哪些设备需要维保？');
    }

    if (context.currentAlerts && context.currentAlerts > 0) {
      suggestions.push(`查看当前 ${context.currentAlerts} 个告警详情`);
    }

    return suggestions;
  }

  /**
   * 发布 EventBus 事件（失败不阻塞主流程）
   */
  private async publishEvent(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await eventBus.publish(topic, 'nl_interface', payload, {
        source: 'nl-interface',
        severity: 'info' as const,
      });
    } catch (err: any) {
      log.debug({ topic, err: err.message }, 'EventBus 事件发布失败（不影响主流程）');
    }
  }

  /**
   * 安全 JSON 解析
   */
  private safeParseJSON<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// 单例管理
// ============================================================================

/** NLInterface 单例实例 */
let instance: NLInterface | null = null;

/**
 * 获取 NLInterface 单例
 *
 * @returns NLInterface 实例
 */
export function getNLInterface(): NLInterface {
  if (!instance) {
    instance = new NLInterface();
  }
  return instance;
}

/**
 * 重置 NLInterface 单例（用于测试或配置热更新）
 */
export function resetNLInterface(): void {
  instance = null;
}
