/**
 * AI 推理服务 gRPC 服务端
 *
 * 复用已有 invokeLLM + grokDiagnosticAgent 模块，暴露为 gRPC 服务。
 * 使用 proto/ai/ai.proto 服务定义。
 *
 * RPC 实现:
 *   InvokeLLM       → invokeLLM() (server/core/llm.ts)
 *   Diagnose         → diagnose() (grokDiagnosticAgent.service.ts)
 *   BatchDiagnose    → 并行 diagnose()
 *   GetAgentStatus   → getAgentStatus()
 *   HealthCheck      → 健康检查
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('ai-inference-grpc-server');

// ============================================================
// gRPC 服务实现
// ============================================================

export interface AIInferenceGrpcServerOptions {
  port: number;
  host?: string;
}

export class AIInferenceGrpcServer {
  private server: grpc.Server | null = null;
  private port: number;
  private host: string;

  constructor(options: AIInferenceGrpcServerOptions) {
    this.port = options.port;
    this.host = options.host || '0.0.0.0';
  }

  async start(): Promise<void> {
    // 延迟加载推理模块
    const { invokeLLM } = await import('../../core/llm');
    const {
      diagnose,
      getAgentStatus,
    } = await import('../../services/grokDiagnosticAgent.service');

    const PROTO_PATH = path.resolve(__dirname, '../../../proto/ai/ai.proto');

    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [
        path.resolve(__dirname, '../../../proto'),
        path.resolve(__dirname, '../../../node_modules/google-proto-files'),
      ],
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as any;
    const aiService = proto.xilian?.ai?.AIInferenceService;

    if (!aiService) {
      throw new Error('Failed to load AIInferenceService from proto definition');
    }

    this.server = new grpc.Server({
      'grpc.max_receive_message_length': 50 * 1024 * 1024,
      'grpc.max_send_message_length': 50 * 1024 * 1024,
    });

    this.server.addService(aiService.service, {
      // ── InvokeLLM ──
      invokeLLM: async (call: any, callback: any) => {
        try {
          const req = call.request;

          const messages = (req.messages || []).map((m: any) => ({
            role: m.role || 'user',
            content: m.content || '',
            name: m.name || undefined,
            tool_call_id: m.toolCallId || m.tool_call_id || undefined,
          }));

          const tools = (req.tools || []).map((t: any) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters || {},
            },
          }));

          const result = await invokeLLM({
            messages,
            tools: tools.length > 0 ? tools : undefined,
            toolChoice: req.toolChoice || req.tool_choice || undefined,
            model: req.model || undefined,
            maxTokens: req.maxTokens || req.max_tokens || undefined,
            thinkingBudget: req.thinkingBudget || req.thinking_budget || undefined,
          });

          const choice = result.choices?.[0];
          const content = typeof choice?.message?.content === 'string'
            ? choice.message.content
            : '';

          const toolCalls = (choice?.message?.tool_calls || []).map((tc: any) => ({
            id: tc.id,
            function_name: tc.function?.name || '',
            function_arguments: tc.function?.arguments || '{}',
          }));

          callback(null, {
            id: result.id,
            model: result.model,
            content,
            tool_calls: toolCalls,
            finish_reason: choice?.finish_reason || '',
            prompt_tokens: result.usage?.prompt_tokens || 0,
            completion_tokens: result.usage?.completion_tokens || 0,
            total_tokens: result.usage?.total_tokens || 0,
            error_message: '',
          });
        } catch (err: any) {
          log.warn(`InvokeLLM RPC error: ${err.message}`);
          callback({
            code: grpc.status.INTERNAL,
            message: err.message,
          });
        }
      },

      // ── Diagnose ──
      diagnose: async (call: any, callback: any) => {
        try {
          const req = call.request;
          const result = await diagnose({
            deviceCode: req.deviceCode || req.device_code || '',
            description: req.description || '',
            sensorReadings: req.sensorReadings || req.sensor_readings || undefined,
            timeRangeHours: req.timeRangeHours || req.time_range_hours || undefined,
            sessionId: req.sessionId || req.session_id || undefined,
            mode: req.mode || 'quick',
          });

          callback(null, {
            id: result.id,
            device_code: result.deviceCode,
            fault_type: result.faultType,
            severity: result.severity,
            confidence: result.confidence,
            root_cause: result.rootCause,
            analysis: result.analysis,
            recommendations: result.recommendations,
            impact: result.impact,
            data_sources: result.dataSources,
            model_info: result.modelInfo ? {
              model: result.modelInfo.model,
              provider: result.modelInfo.provider,
              tokens_used: result.modelInfo.tokensUsed,
              latency_ms: result.modelInfo.latencyMs,
            } : undefined,
            error_message: '',
          });
        } catch (err: any) {
          log.warn(`Diagnose RPC error: ${err.message}`);
          callback({
            code: grpc.status.INTERNAL,
            message: err.message,
          });
        }
      },

      // ── BatchDiagnose ──
      batchDiagnose: async (call: any, callback: any) => {
        try {
          const req = call.request;
          const devices = req.devices || [];
          const mode = req.mode || 'quick';

          const results = await Promise.allSettled(
            devices.map((d: any) =>
              diagnose({
                deviceCode: d.deviceCode || d.device_code || '',
                description: d.description || '',
                sensorReadings: d.sensorReadings || d.sensor_readings || undefined,
                mode,
              }),
            ),
          );

          const mapped = results.map((r: any, i: number) => ({
            device_code: devices[i]?.deviceCode || devices[i]?.device_code || '',
            status: r.status,
            data: r.status === 'fulfilled'
              ? {
                  id: r.value.id,
                  device_code: r.value.deviceCode,
                  fault_type: r.value.faultType,
                  severity: r.value.severity,
                  confidence: r.value.confidence,
                  root_cause: r.value.rootCause,
                  analysis: r.value.analysis,
                  recommendations: r.value.recommendations,
                  impact: r.value.impact,
                  data_sources: r.value.dataSources,
                }
              : undefined,
            error: r.status === 'rejected' ? String(r.reason) : '',
          }));

          callback(null, {
            total: results.length,
            succeeded: results.filter((r: any) => r.status === 'fulfilled').length,
            failed: results.filter((r: any) => r.status === 'rejected').length,
            results: mapped,
          });
        } catch (err: any) {
          log.warn(`BatchDiagnose RPC error: ${err.message}`);
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── GetAgentStatus ──
      getAgentStatus: async (_call: any, callback: any) => {
        try {
          const status = getAgentStatus();
          callback(null, {
            enabled: status.enabled,
            provider: status.provider,
            model: status.model,
            active_sessions: status.activeSessions,
            config: status.config,
          });
        } catch (err: any) {
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── HealthCheck ──
      healthCheck: async (_call: any, callback: any) => {
        try {
          const status = getAgentStatus();
          callback(null, {
            status: status.enabled ? 'SERVING' : 'NOT_SERVING',
            version: '1.0.0',
            metadata: {
              provider: status.provider,
              model: status.model,
              activeSessions: String(status.activeSessions),
            },
          });
        } catch (err: any) {
          callback(null, {
            status: 'NOT_SERVING',
            version: '1.0.0',
            metadata: { error: err.message },
          });
        }
      },
    });

    return new Promise((resolve, reject) => {
      this.server!.bindAsync(
        `${this.host}:${this.port}`,
        grpc.ServerCredentials.createInsecure(),
        (err, port) => {
          if (err) { reject(err); return; }
          log.info(`AI Inference gRPC server listening on :${port}`);
          resolve();
        },
      );
    });
  }

  async shutdown(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.tryShutdown(() => {
        log.info('AI Inference gRPC server stopped');
        this.server = null;
        resolve();
      });
    });
  }
}
