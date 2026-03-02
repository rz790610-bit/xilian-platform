/**
 * 算法服务 gRPC 服务端
 *
 * 复用已有 AlgorithmEngine 单例，将 6+2 个 RPC handler 映射到引擎方法。
 * 使用已有 proto/algorithm/algorithm.proto 服务定义。
 *
 * RPC 实现:
 *   Execute            → algorithmEngine.execute()
 *   BatchExecute       → algorithmEngine.executeBatch()
 *   ExecuteComposition → algorithmEngine.executeComposition()
 *   ListAlgorithms     → algorithmEngine.listAlgorithms()
 *   GetAlgorithm       → algorithmEngine.getAlgorithm()
 *   GetExecutionStatus → algorithmEngine.getExecutionHistory()
 *   GetWorkerPoolStatus→ algorithmEngine.getStatus().workerPool
 *   HealthCheck        → 健康检查
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { createModuleLogger } from '../../core/logger';
import type { AlgorithmInput, AlgorithmOutput } from '../../algorithms/_core/types';

const log = createModuleLogger('algorithm-grpc-server');

// ============================================================
// Proto → 引擎 类型桥接
// ============================================================

/**
 * 将 proto ExecuteRequest 转换为 AlgorithmInput
 */
function protoToAlgorithmInput(request: any): {
  algorithmId: string;
  input: AlgorithmInput;
  config: Record<string, any>;
  context: Record<string, any>;
} {
  const algorithmId = request.algorithm_id || request.algorithmId || '';

  // parameters 来自 google.protobuf.Struct，@grpc/proto-loader 会解析为普通对象
  const params = request.parameters || {};

  // input_data 是 bytes，需要从 Buffer 解析
  let data: number[] | Record<string, number[]> = [];
  if (request.input_data && request.input_data.length > 0) {
    const format = request.input_format || 'json';
    if (format === 'json') {
      try {
        data = JSON.parse(Buffer.from(request.input_data).toString('utf-8'));
      } catch {
        log.warn('Failed to parse input_data as JSON, using empty array');
      }
    } else if (format === 'float64array') {
      const buf = Buffer.from(request.input_data);
      const arr = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
      data = Array.from(arr);
    }
  }

  const input: AlgorithmInput = {
    data,
    sampleRate: params.sampleRate || params.sample_rate,
    equipment: params.equipment,
    operatingCondition: params.operatingCondition || params.operating_condition,
    context: params.context,
  };

  return {
    algorithmId,
    input,
    config: params.config || {},
    context: {
      executionId: request.correlation_id || `grpc_${Date.now()}`,
      equipmentId: request.device_id,
      timeout: request.timeout_ms || 120000,
      trigger: 'manual' as const,
    },
  };
}

/**
 * 将 AlgorithmOutput 转换为 proto ExecuteResponse
 */
function algorithmOutputToProto(output: AlgorithmOutput, executionId: string): any {
  const statusMap: Record<string, string> = {
    completed: 'success',
    failed: 'error',
    cancelled: 'error',
    running: 'partial',
    pending: 'partial',
  };

  const diagnostics = [];
  if (output.diagnosis) {
    diagnostics.push({
      fault_type: output.diagnosis.faultType || '',
      confidence: output.diagnosis.confidence,
      severity: output.diagnosis.severity,
      description: output.diagnosis.summary,
      details: output.diagnosis,
    });
  }

  return {
    execution_id: executionId,
    algorithm_id: output.algorithmId,
    status: statusMap[output.status] || 'error',
    result: output.results,
    output_data: Buffer.from(JSON.stringify(output.results)),
    output_format: 'json',
    execution_time_ms: output.metadata?.executionTimeMs || 0,
    error_message: output.error || '',
    metadata: {
      algorithmVersion: output.metadata?.algorithmVersion || '',
      inputDataPoints: String(output.metadata?.inputDataPoints || 0),
    },
    diagnostics,
  };
}

// ============================================================
// gRPC 服务实现
// ============================================================

export interface AlgorithmGrpcServerOptions {
  port: number;
  host?: string;
}

export class AlgorithmGrpcServer {
  private server: grpc.Server | null = null;
  private port: number;
  private host: string;

  constructor(options: AlgorithmGrpcServerOptions) {
    this.port = options.port;
    this.host = options.host || '0.0.0.0';
  }

  async start(): Promise<void> {
    // 延迟加载引擎，确保算法已注册
    const { getAlgorithmEngine } = await import('../../algorithms/index');
    const engine = getAlgorithmEngine();

    const PROTO_PATH = path.resolve(__dirname, '../../../proto/algorithm/algorithm.proto');

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
    const algorithmService = proto.xilian?.algorithm?.AlgorithmService;

    if (!algorithmService) {
      throw new Error('Failed to load AlgorithmService from proto definition');
    }

    this.server = new grpc.Server({
      'grpc.max_receive_message_length': 100 * 1024 * 1024,
      'grpc.max_send_message_length': 100 * 1024 * 1024,
    });

    this.server.addService(algorithmService.service, {
      // ── Execute ──
      execute: async (call: any, callback: any) => {
        try {
          const { algorithmId, input, config, context } = protoToAlgorithmInput(call.request);
          const output = await engine.execute(algorithmId, input, config, context);
          callback(null, algorithmOutputToProto(output, context.executionId));
        } catch (err: any) {
          log.warn(`Execute RPC error: ${err.message}`);
          callback({
            code: grpc.status.INTERNAL,
            message: err.message,
          });
        }
      },

      // ── BatchExecute (server-streaming) ──
      batchExecute: async (call: any) => {
        try {
          const requests = call.request.requests || [];
          for (const req of requests) {
            const { algorithmId, input, config, context } = protoToAlgorithmInput(req);
            const output = await engine.execute(algorithmId, input, config, context);
            call.write(algorithmOutputToProto(output, context.executionId));
          }
          call.end();
        } catch (err: any) {
          log.warn(`BatchExecute RPC error: ${err.message}`);
          call.destroy(err);
        }
      },

      // ── ExecuteComposition ──
      executeComposition: async (call: any, callback: any) => {
        try {
          const req = call.request;
          const steps = (req.steps || []).map((s: any) => ({
            algorithmId: s.algorithm_id || s.algorithmId || '',
            config: s.config || {},
            inputMapping: s.input_mapping || s.inputMapping || {},
          }));

          // 解析 initial input
          let data: any = [];
          if (req.initial_input_data && req.initial_input_data.length > 0) {
            try {
              data = JSON.parse(Buffer.from(req.initial_input_data).toString('utf-8'));
            } catch { /* use empty */ }
          }

          const initialInput: AlgorithmInput = {
            data,
            ...(req.initial_parameters || {}),
          };

          const result = await engine.executeComposition(
            steps,
            initialInput,
            {
              executionId: req.correlation_id || `comp_${Date.now()}`,
              equipmentId: req.device_id,
              timeout: req.timeout_ms || 300000,
            },
          );

          const stepResults = result.steps.map((s, i) =>
            algorithmOutputToProto(s, `step_${i}`),
          );

          callback(null, {
            step_results: stepResults,
            final_output: algorithmOutputToProto(
              result.finalOutput,
              req.correlation_id || 'final',
            ),
            total_execution_time_ms: result.steps.reduce(
              (sum, s) => sum + (s.metadata?.executionTimeMs || 0), 0,
            ),
            status: result.finalOutput.status === 'completed' ? 'success' : 'error',
          });
        } catch (err: any) {
          log.warn(`ExecuteComposition RPC error: ${err.message}`);
          callback({
            code: grpc.status.INTERNAL,
            message: err.message,
          });
        }
      },

      // ── ListAlgorithms ──
      listAlgorithms: async (call: any, callback: any) => {
        try {
          const req = call.request;
          const registrations = engine.listAlgorithms({
            category: req.category_filter || undefined,
          });

          const algorithms = registrations.map(r => ({
            id: r.executor.id,
            name: r.executor.name,
            category: r.executor.category,
            description: r.metadata.description,
            version: r.executor.version,
            input_types: r.metadata.inputFields?.map((f: any) => f.name || '') || [],
            output_types: r.metadata.outputFields?.map((f: any) => f.name || '') || [],
            config_schema: {},
            gpu_required: false,
            avg_execution_ms: 0,
          }));

          callback(null, {
            algorithms,
            pagination: {
              total: algorithms.length,
              page: 1,
              page_size: algorithms.length,
              total_pages: 1,
            },
          });
        } catch (err: any) {
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── GetAlgorithm ──
      getAlgorithm: async (call: any, callback: any) => {
        try {
          const reg = engine.getAlgorithm(call.request.algorithm_id);
          if (!reg) {
            callback({ code: grpc.status.NOT_FOUND, message: 'Algorithm not found' });
            return;
          }
          callback(null, {
            id: reg.executor.id,
            name: reg.executor.name,
            category: reg.executor.category,
            description: reg.metadata.description,
            version: reg.executor.version,
          });
        } catch (err: any) {
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── GetExecutionStatus ──
      getExecutionStatus: async (call: any, callback: any) => {
        try {
          const records = engine.getExecutionHistory({
            limit: 1,
          });
          const record = records.find(
            r => r.executionId === call.request.execution_id,
          );
          if (!record) {
            callback({ code: grpc.status.NOT_FOUND, message: 'Execution not found' });
            return;
          }
          callback(null, {
            execution_id: record.executionId,
            status: record.status,
            progress: record.status === 'completed' ? 1.0 : 0.5,
            current_stage: record.status,
          });
        } catch (err: any) {
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── GetWorkerPoolStatus ──
      getWorkerPoolStatus: async (_call: any, callback: any) => {
        try {
          const status = engine.getStatus();
          const wp = status.workerPool;
          callback(null, {
            total_workers: wp?.poolSize ?? 0,
            active_workers: wp?.busyWorkers ?? 0,
            idle_workers: wp?.idleWorkers ?? 0,
            pending_tasks: wp?.queueLength ?? 0,
            total_executed: wp?.totalTasks ?? 0,
            avg_execution_ms: wp?.avgDurationMs ?? 0,
          });
        } catch (err: any) {
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── HealthCheck ──
      healthCheck: async (_call: any, callback: any) => {
        try {
          const stats = engine.getExecutionStats();
          callback(null, {
            status: 'SERVING',
            version: '1.0.0',
            metadata: {
              registeredAlgorithms: String(stats.registeredAlgorithms),
              totalExecutions: String(stats.total),
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
          if (err) {
            reject(err);
            return;
          }
          log.info(`Algorithm gRPC server listening on :${port}`);
          resolve();
        },
      );
    });
  }

  async shutdown(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.tryShutdown(() => {
        log.info('Algorithm gRPC server stopped');
        this.server = null;
        resolve();
      });
    });
  }
}
