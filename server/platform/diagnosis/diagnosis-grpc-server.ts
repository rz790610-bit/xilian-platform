/**
 * HDE 双轨诊断 gRPC 服务端
 *
 * 复用已有 DiagnosticOrchestrator，暴露为 gRPC 服务。
 * 使用 proto/diagnosis/diagnosis.proto 服务定义。
 *
 * RPC 实现:
 *   HDEDiagnose  → orchestrator.diagnose()
 *   GetConfig    → orchestrator.getConfig()
 *   HealthCheck  → 健康检查
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { createModuleLogger } from '../../core/logger';
import type {
  HDEDiagnosisRequest,
  HDEDiagnosisResult,
  TrackResult,
  PhysicsConstraint,
  FaultHypothesis,
  EvidenceItem,
  Recommendation,
  ValidationResult as HDEValidationResult,
} from '../hde/types';

const log = createModuleLogger('diagnosis-grpc-server');

// ============================================================
// gRPC 服务实现
// ============================================================

export interface DiagnosisGrpcServerOptions {
  port: number;
  host?: string;
}

export class DiagnosisGrpcServer {
  private server: grpc.Server | null = null;
  private port: number;
  private host: string;

  constructor(options: DiagnosisGrpcServerOptions) {
    this.port = options.port;
    this.host = options.host || '0.0.0.0';
  }

  async start(): Promise<void> {
    // 延迟加载编排器
    const {
      createDiagnosticOrchestrator,
    } = await import('../hde/orchestrator/diagnostic-orchestrator');

    const orchestrator = createDiagnosticOrchestrator();

    const PROTO_PATH = path.resolve(__dirname, '../../../proto/diagnosis/diagnosis.proto');

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
    const diagnosisService = proto.xilian?.diagnosis?.DiagnosisService;

    if (!diagnosisService) {
      throw new Error('Failed to load DiagnosisService from proto definition');
    }

    this.server = new grpc.Server({
      'grpc.max_receive_message_length': 50 * 1024 * 1024,
      'grpc.max_send_message_length': 50 * 1024 * 1024,
    });

    this.server.addService(diagnosisService.service, {
      // ── HDEDiagnose ──
      hdeDiagnose: async (call: any, callback: any) => {
        try {
          const req = call.request;

          // 转换 proto → HDEDiagnosisRequest
          const request: HDEDiagnosisRequest = {
            machineId: req.machineId || req.machine_id || '',
            timestamp: parseInt(req.timestamp || String(Date.now()), 10),
            sensorData: protoToSensorData(req.sensorData || req.sensor_data || {}),
            context: req.context ? {
              cyclePhase: req.context.cyclePhase || req.context.cycle_phase || undefined,
              loadWeight: req.context.loadWeight || req.context.load_weight || undefined,
              environment: req.context.environment ? {
                windSpeed: req.context.environment.windSpeed || req.context.environment.wind_speed,
                temperature: req.context.environment.temperature,
                humidity: req.context.environment.humidity,
              } : undefined,
              recentFaults: req.context.recentFaults || req.context.recent_faults || undefined,
            } : undefined,
            config: req.config ? {
              enablePhysicsTrack: req.config.enablePhysicsTrack ?? req.config.enable_physics_track,
              enableDataTrack: req.config.enableDataTrack ?? req.config.enable_data_track,
              physicsWeight: req.config.physicsWeight || req.config.physics_weight || undefined,
              confidenceThreshold: req.config.confidenceThreshold || req.config.confidence_threshold || undefined,
              timeoutMs: req.config.timeoutMs || req.config.timeout_ms || undefined,
            } : undefined,
          };

          const result = await orchestrator.diagnose(request);

          // 转换 HDEDiagnosisResult → proto response
          callback(null, hdeResultToProto(result));
        } catch (err: any) {
          log.warn(`HDEDiagnose RPC error: ${err.message}`);
          callback({
            code: grpc.status.INTERNAL,
            message: err.message,
          });
        }
      },

      // ── GetConfig ──
      getConfig: async (_call: any, callback: any) => {
        try {
          const cfg = orchestrator.getConfig();
          callback(null, {
            enable_physics_track: cfg.enablePhysicsTrack,
            enable_data_track: cfg.enableDataTrack,
            fusion_strategy: cfg.fusionStrategy,
            physics_weight: cfg.physicsWeight,
            auto_crystallize_threshold: cfg.autoCrystallizeThreshold,
            default_ds_strategy: cfg.fusionConfig?.defaultStrategy || 'dempster',
            high_conflict_threshold: cfg.fusionConfig?.highConflictThreshold || 0.7,
          });
        } catch (err: any) {
          callback({ code: grpc.status.INTERNAL, message: err.message });
        }
      },

      // ── HealthCheck ──
      healthCheck: async (_call: any, callback: any) => {
        try {
          const cfg = orchestrator.getConfig();
          callback(null, {
            status: 'SERVING',
            version: '1.0.0',
            metadata: {
              physicsTrack: String(cfg.enablePhysicsTrack),
              dataTrack: String(cfg.enableDataTrack),
              fusionStrategy: cfg.fusionStrategy,
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
          log.info(`Diagnosis gRPC server listening on :${port}`);
          resolve();
        },
      );
    });
  }

  async shutdown(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.tryShutdown(() => {
        log.info('Diagnosis gRPC server stopped');
        this.server = null;
        resolve();
      });
    });
  }
}

// ============================================================
// Proto <-> TS 类型转换
// ============================================================

function protoToSensorData(
  protoMap: Record<string, any>,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(protoMap)) {
    if (value && Array.isArray(value.values)) {
      result[key] = value.values.map(Number);
    } else if (Array.isArray(value)) {
      result[key] = value.map(Number);
    }
  }
  return result;
}

function hdeResultToProto(result: HDEDiagnosisResult): Record<string, any> {
  return {
    session_id: result.sessionId,
    machine_id: result.machineId,
    timestamp: String(result.timestamp),
    diagnosis: diagnosisConclusionToProto(result.diagnosis),
    track_results: {
      physics: result.trackResults.physics ? trackResultToProto(result.trackResults.physics) : undefined,
      data: result.trackResults.data ? trackResultToProto(result.trackResults.data) : undefined,
    },
    fusion_result: {
      fused_mass: result.fusionResult.fusedMass,
      conflict: result.fusionResult.conflict,
      strategy_used: result.fusionResult.strategyUsed,
    },
    physics_validation: validationToProto(result.physicsValidation),
    recommendations: result.recommendations.map(recommendationToProto),
    metadata: result.metadata,
    duration_ms: result.durationMs,
    error_message: '',
  };
}

function diagnosisConclusionToProto(d: HDEDiagnosisResult['diagnosis']): Record<string, any> {
  return {
    fault_type: d.faultType,
    confidence: d.confidence,
    severity: d.severity,
    urgency: d.urgency,
    physics_explanation: d.physicsExplanation || '',
    evidence_chain: (d.evidenceChain || []).map((e: EvidenceItem) => ({
      source: e.source,
      type: e.type,
      description: e.description,
      strength: e.strength,
    })),
  };
}

function trackResultToProto(t: TrackResult): Record<string, any> {
  return {
    track_type: t.trackType,
    fault_hypotheses: t.faultHypotheses.map((h: FaultHypothesis) => ({
      id: h.id,
      fault_type: h.faultType,
      prior_probability: h.priorProbability,
      posterior_probability: h.posteriorProbability || 0,
      supporting_evidence: h.supportingEvidence,
      contradicting_evidence: h.contradictingEvidence,
      physics_mechanism: h.physicsMechanism || '',
    })),
    belief_mass: t.beliefMass,
    confidence: t.confidence,
    physics_constraints: t.physicsConstraints.map(constraintToProto),
    execution_time_ms: t.executionTimeMs,
  };
}

function constraintToProto(c: PhysicsConstraint): Record<string, any> {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    expression: c.expression,
    satisfied: c.satisfied ?? true,
    violation_degree: c.violationDegree ?? 0,
    explanation: c.explanation,
  };
}

function validationToProto(v: HDEValidationResult): Record<string, any> {
  return {
    is_valid: v.isValid,
    violations: v.violations.map(constraintToProto),
    adjusted_confidence: v.adjustedConfidence,
    physics_explanation: v.physicsExplanation,
  };
}

function recommendationToProto(r: Recommendation): Record<string, any> {
  return {
    priority: r.priority,
    action: r.action,
    rationale: r.rationale,
    expected_impact: r.expectedImpact || '',
    physics_basis: r.physicsBasis || '',
  };
}
