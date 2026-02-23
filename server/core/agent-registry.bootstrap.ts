/**
 * ============================================================================
 * Agent 注册桥接 — 将现有 Agent 服务注册到统一 AgentRegistry
 * ============================================================================
 *
 * 职责：
 *   在启动序列中调用，将已有的 Agent 服务包装为 AgentManifest 并注册。
 *   这是渐进式迁移的桥接层，不修改现有 Agent 服务的任何代码。
 *
 * 调用时机：
 *   server/core/index.ts 启动序列中，在 Platform 组件注册之后调用
 *
 * 未来演进：
 *   当 Agent 服务本身实现 AgentManifest 接口后，此文件可删除
 */

import { createModuleLogger } from './logger';
import { agentRegistry, type AgentManifest, type AgentContext, type AgentResult, type StreamChunk } from './agent-registry';

const log = createModuleLogger('agent-bootstrap');

/**
 * 注册所有内置 Agent 到 AgentRegistry
 * 
 * 设计决策：
 *   - 使用延迟导入（dynamic import）避免循环依赖
 *   - 每个 Agent 的 invoke 包装器负责适配参数格式
 *   - 失败不阻塞启动（单个 Agent 注册失败不影响其他 Agent）
 */
export async function bootstrapAgentRegistry(): Promise<void> {
  const startTime = Date.now();
  let registered = 0;
  let failed = 0;

  // ========== 1. 诊断 Agent（grokDiagnosticAgent.service.ts）==========
  try {
    const diagnosticModule = await import('../services/grokDiagnosticAgent.service');

    const diagnosticManifest: AgentManifest = {
      id: 'diagnostic-agent',
      name: '设备诊断 Agent',
      description: '利用 xAI Grok 模型进行设备故障诊断、异常分析和维护建议。支持 Tool Calling（12 个内置工具）、多轮对话、结构化输出。',
      version: '1.0.0',
      loopStage: 'diagnosis',
      sdkAdapter: 'custom',
      tags: ['grok', 'diagnosis', 'device', 'fault', 'tool-calling'],
      capabilities: ['multi-turn', 'tool-calling', 'structured-output', 'ollama-fallback'],
      tools: [
        'query_sensor_realtime',
        'query_clickhouse_analytics',
        'query_knowledge_graph',
        'compute_physics_formula',
        'search_similar_cases',
        'predict_device_state',
        'counterfactual_analysis',
        'generate_diagnosis_report',
      ],
      maxConcurrency: 5,
      timeoutMs: 120_000,

      invoke: async (input: unknown, context: AgentContext): Promise<AgentResult> => {
        const startMs = Date.now();
        try {
          // 适配现有 diagnose() 的参数格式
          const request = input as {
            deviceCode: string;
            description: string;
            sensorReadings?: Record<string, number>;
            timeRangeHours?: number;
            sessionId?: string;
            mode?: 'quick' | 'deep' | 'predictive';
          };

          // 使用 context.sessionId 覆盖 request.sessionId
          const result = await diagnosticModule.diagnose({
            ...request,
            sessionId: context.sessionId || request.sessionId,
          });

          return {
            agentId: 'diagnostic-agent',
            success: true,
            output: result,
            toolCalls: result.toolCalls?.map((tc: any) => ({
              tool: tc.tool || tc.name,
              input: tc.input || tc.arguments,
              output: tc.output || tc.result,
              durationMs: tc.durationMs || 0,
            })),
            durationMs: Date.now() - startMs,
            tokenUsage: { prompt: 0, completion: result.modelInfo?.tokensUsed ?? 0, total: result.modelInfo?.tokensUsed ?? 0 },
          };
        } catch (err: any) {
          return {
            agentId: 'diagnostic-agent',
            success: false,
            output: null,
            durationMs: Date.now() - startMs,
            error: err.message,
          };
        }
      },

      healthCheck: async () => {
        try {
          const status = diagnosticModule.getAgentStatus();
          if (!status.enabled) return 'unavailable';
          return status.enabled ? 'healthy' : 'degraded';
        } catch {
          return 'unavailable';
        }
      },
    };

    agentRegistry.register(diagnosticManifest);
    registered++;
  } catch (err: any) {
    failed++;
    log.warn({ err: err.message }, 'Failed to register diagnostic-agent (non-blocking)');
  }

  // ========== 2. 平台自省 Agent（grokPlatformAgent.service.ts）==========
  try {
    const platformModule = await import('../services/grokPlatformAgent.service');

    const platformManifest: AgentManifest = {
      id: 'platform-agent',
      name: '平台自诊断 Agent',
      description: 'L2 自省层 — 利用 Grok 对平台自身进行健康诊断，包括模块状态、完整度报告、桩函数热点、基础设施健康、Feature Flags、依赖图谱。',
      version: '3.1.0',
      loopStage: 'utility',
      sdkAdapter: 'custom',
      tags: ['grok', 'platform', 'self-diagnosis', 'introspection'],
      capabilities: ['self-diagnosis', 'infra-health', 'module-analysis', 'local-fallback'],
      tools: [
        'get_module_status',
        'get_completeness_report',
        'get_stub_hotspots',
        'check_infra_health',
        'get_feature_flags',
        'get_dependency_graph',
      ],
      maxConcurrency: 2,
      timeoutMs: 90_000,

      invoke: async (input: unknown, context: AgentContext): Promise<AgentResult> => {
        const startMs = Date.now();
        try {
          const question = typeof input === 'string' ? input : (input as any)?.question;
          const result = await platformModule.grokPlatformAgent.diagnose(question);

          return {
            agentId: 'platform-agent',
            success: true,
            output: result,
            durationMs: Date.now() - startMs,
          };
        } catch (err: any) {
          return {
            agentId: 'platform-agent',
            success: false,
            output: null,
            durationMs: Date.now() - startMs,
            error: err.message,
          };
        }
      },

      healthCheck: async () => {
        // 平台 Agent 始终可用（有本地降级）
        return 'healthy';
      },
    };

    agentRegistry.register(platformManifest);
    registered++;
  } catch (err: any) {
    failed++;
    log.warn({ err: err.message }, 'Failed to register platform-agent (non-blocking)');
  }

  // ========== 注册完成 ==========
  const durationMs = Date.now() - startTime;
  const summary = agentRegistry.getSummary();

  log.info(
    {
      registered,
      failed,
      durationMs,
      totalAgents: summary.totalAgents,
      byStage: summary.byStage,
      byAdapter: summary.byAdapter,
    },
    `Agent Registry bootstrap complete: ${registered} registered, ${failed} failed (${durationMs}ms)`
  );
}
