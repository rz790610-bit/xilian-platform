/**
 * OrchestratorHub — 统一编排调度层
 *
 * 接收业务指令（设备类型 + 诊断目标），自动协调 Pipeline / KG / DB
 * 三个引擎的执行顺序，统一状态和结果汇聚。
 *
 * Phase 0: 各引擎执行为空壳 stub，后续接入真实引擎实例。
 */

import { createModuleLogger } from '../../core/logger';
import type {
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationPhase,
  OrchestratorHubConfig,
  ScenarioTemplate,
  ScenarioPhase,
} from './orchestrator-hub.types';

const log = createModuleLogger('orchestrator-hub');

// ============================================================
// 默认场景模板
// ============================================================

const DEFAULT_SCENARIO_TEMPLATES: Record<string, ScenarioTemplate> = {
  bearing_diagnosis: {
    name: '轴承诊断',
    description: 'KG 查询故障模式 → Pipeline 特征提取 → Pipeline 诊断推理 → DB 结果存储',
    phases: [
      { engine: 'kg', action: 'query_fault_patterns', config: { faultType: 'bearing' } },
      { engine: 'pipeline', action: 'feature_extraction', config: { algorithm: 'envelope_spectrum' } },
      { engine: 'pipeline', action: 'diagnosis_inference' },
      { engine: 'database', action: 'store_result' },
    ],
    applicableDeviceTypes: ['PORT.STS', 'PORT.RTG', 'PORT.FORKLIFT', 'PORT.STACKER'],
  },
  gearbox_diagnosis: {
    name: '齿轮箱诊断',
    description: 'KG 查询齿轮箱参数 → Pipeline FFT+倒频谱 → Pipeline 融合诊断 → DB 存储',
    phases: [
      { engine: 'kg', action: 'query_gearbox_params' },
      { engine: 'pipeline', action: 'fft_cepstrum', config: { algorithm: 'fft_cepstrum' } },
      { engine: 'pipeline', action: 'fusion_diagnosis' },
      { engine: 'database', action: 'store_result' },
    ],
    applicableDeviceTypes: ['PORT.STS', 'PORT.RTG'],
  },
  general_monitoring: {
    name: '通用监控',
    description: 'DB 查询历史数据 → Pipeline 趋势分析 → KG 更新设备状态',
    phases: [
      { engine: 'database', action: 'query_history' },
      { engine: 'pipeline', action: 'trend_analysis' },
      { engine: 'kg', action: 'update_device_status' },
    ],
    applicableDeviceTypes: ['PORT.STS', 'PORT.RTG', 'PORT.FORKLIFT', 'PORT.STACKER'],
  },
  anomaly_detection: {
    name: '异常检测',
    description: 'Pipeline 异常检测 → KG 关联查询 → DB 告警写入',
    phases: [
      { engine: 'pipeline', action: 'anomaly_detection' },
      { engine: 'kg', action: 'correlate_anomaly' },
      { engine: 'database', action: 'write_alert' },
    ],
    applicableDeviceTypes: ['PORT.STS', 'PORT.RTG', 'PORT.FORKLIFT', 'PORT.STACKER'],
  },
};

// ============================================================
// OrchestratorHub 核心类
// ============================================================

export class OrchestratorHub {
  private config: OrchestratorHubConfig;
  private activeRequests = 0;
  private completedRequests = 0;

  constructor(config?: Partial<OrchestratorHubConfig>) {
    this.config = {
      enableKG: true,
      enablePipeline: true,
      enableDatabase: true,
      defaultTimeout: 30_000,
      maxConcurrentRequests: 10,
      scenarioTemplates: { ...DEFAULT_SCENARIO_TEMPLATES },
      ...config,
    };
    log.info(`OrchestratorHub initialized with ${Object.keys(this.config.scenarioTemplates).length} scenario templates`);
  }

  // ----------------------------------------------------------
  // 主入口
  // ----------------------------------------------------------

  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    log.info({ requestId, deviceType: request.deviceType, goal: request.diagnosisGoal }, 'Orchestration started');

    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      return {
        requestId,
        status: 'failed',
        phases: [],
        fusedResult: {},
        totalDurationMs: Date.now() - startTime,
        metadata: { error: 'Max concurrent requests exceeded' },
      };
    }

    this.activeRequests++;

    try {
      const scenario = this.resolveScenario(request);
      const phaseResults = await this.executePhases(scenario.phases, request);
      const fusedResult = this.fuseResults(phaseResults);

      const hasFailure = phaseResults.some(p => p.status === 'failed');
      const allFailed = phaseResults.every(p => p.status === 'failed');

      const result: OrchestrationResult = {
        requestId,
        status: allFailed ? 'failed' : hasFailure ? 'partial' : 'success',
        phases: phaseResults,
        fusedResult,
        totalDurationMs: Date.now() - startTime,
        metadata: {
          scenario: scenario.name,
          deviceType: request.deviceType,
          diagnosisGoal: request.diagnosisGoal,
        },
      };

      log.info({ requestId, status: result.status, durationMs: result.totalDurationMs }, 'Orchestration completed');
      return result;
    } finally {
      this.activeRequests--;
      this.completedRequests++;
    }
  }

  // ----------------------------------------------------------
  // 阶段执行
  // ----------------------------------------------------------

  private async executePhases(
    phases: ScenarioPhase[],
    request: OrchestrationRequest,
  ): Promise<OrchestrationPhase[]> {
    const results: OrchestrationPhase[] = [];

    for (const phase of phases) {
      const shouldSkip =
        (phase.engine === 'kg' && !this.config.enableKG) ||
        (phase.engine === 'pipeline' && !this.config.enablePipeline) ||
        (phase.engine === 'database' && !this.config.enableDatabase);

      if (shouldSkip) {
        results.push({
          engine: phase.engine,
          action: phase.action,
          status: 'skipped',
          durationMs: 0,
        });
        continue;
      }

      try {
        let result: OrchestrationPhase;
        switch (phase.engine) {
          case 'kg':
            result = await this.executeKGPhase(phase.action, phase.config, request);
            break;
          case 'pipeline':
            result = await this.executePipelinePhase(phase.action, phase.config, request);
            break;
          case 'database':
            result = await this.executeDatabasePhase(phase.action, phase.config, request);
            break;
        }
        results.push(result);
      } catch (err) {
        results.push({
          engine: phase.engine,
          action: phase.action,
          status: 'failed',
          durationMs: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  // ----------------------------------------------------------
  // 三引擎调度 (Phase 0 stub)
  // ----------------------------------------------------------

  private async executeKGPhase(
    action: string,
    config: Record<string, unknown> | undefined,
    request: OrchestrationRequest,
  ): Promise<OrchestrationPhase> {
    const start = Date.now();
    log.debug({ action, deviceType: request.deviceType }, 'KG phase executing (stub)');

    // Phase 0: stub — 后续接入真实 KG 引擎
    return {
      engine: 'kg',
      action,
      status: 'success',
      durationMs: Date.now() - start,
      output: { stub: true, action, config: config ?? {} },
    };
  }

  private async executePipelinePhase(
    action: string,
    config: Record<string, unknown> | undefined,
    request: OrchestrationRequest,
  ): Promise<OrchestrationPhase> {
    const start = Date.now();
    log.debug({ action, deviceType: request.deviceType }, 'Pipeline phase executing (stub)');

    return {
      engine: 'pipeline',
      action,
      status: 'success',
      durationMs: Date.now() - start,
      output: { stub: true, action, config: config ?? {} },
    };
  }

  private async executeDatabasePhase(
    action: string,
    config: Record<string, unknown> | undefined,
    request: OrchestrationRequest,
  ): Promise<OrchestrationPhase> {
    const start = Date.now();
    log.debug({ action, deviceType: request.deviceType }, 'Database phase executing (stub)');

    return {
      engine: 'database',
      action,
      status: 'success',
      durationMs: Date.now() - start,
      output: { stub: true, action, config: config ?? {} },
    };
  }

  // ----------------------------------------------------------
  // 场景解析
  // ----------------------------------------------------------

  private resolveScenario(request: OrchestrationRequest): ScenarioTemplate {
    const { diagnosisGoal, deviceType } = request;

    // 精确匹配
    const exact = this.config.scenarioTemplates[diagnosisGoal];
    if (exact && exact.applicableDeviceTypes.includes(deviceType)) {
      return exact;
    }

    // 设备类型兼容匹配
    if (exact) {
      log.warn({ diagnosisGoal, deviceType }, 'Scenario found but device type not in applicableDeviceTypes, using anyway');
      return exact;
    }

    // Fallback: general_monitoring
    log.warn({ diagnosisGoal, deviceType }, 'No matching scenario, falling back to general_monitoring');
    return this.config.scenarioTemplates['general_monitoring'] ?? {
      name: 'fallback',
      description: 'Fallback scenario',
      phases: [{ engine: 'database', action: 'query_history' }],
      applicableDeviceTypes: [],
    };
  }

  // ----------------------------------------------------------
  // 结果汇聚
  // ----------------------------------------------------------

  private fuseResults(phases: OrchestrationPhase[]): Record<string, unknown> {
    const fused: Record<string, unknown> = {};
    for (const phase of phases) {
      if (phase.status === 'success' && phase.output) {
        fused[`${phase.engine}_${phase.action}`] = phase.output;
      }
    }
    return fused;
  }

  // ----------------------------------------------------------
  // 状态 & 配置
  // ----------------------------------------------------------

  getStatus() {
    return {
      activeRequests: this.activeRequests,
      completedRequests: this.completedRequests,
      config: {
        enableKG: this.config.enableKG,
        enablePipeline: this.config.enablePipeline,
        enableDatabase: this.config.enableDatabase,
        maxConcurrentRequests: this.config.maxConcurrentRequests,
        scenarioCount: Object.keys(this.config.scenarioTemplates).length,
      },
    };
  }

  getConfig(): OrchestratorHubConfig {
    return { ...this.config };
  }

  getScenarios(): Record<string, ScenarioTemplate> {
    return { ...this.config.scenarioTemplates };
  }

  updateConfig(updates: Partial<OrchestratorHubConfig>): void {
    if (updates.scenarioTemplates) {
      this.config.scenarioTemplates = { ...this.config.scenarioTemplates, ...updates.scenarioTemplates };
    }
    if (updates.enableKG !== undefined) this.config.enableKG = updates.enableKG;
    if (updates.enablePipeline !== undefined) this.config.enablePipeline = updates.enablePipeline;
    if (updates.enableDatabase !== undefined) this.config.enableDatabase = updates.enableDatabase;
    if (updates.defaultTimeout !== undefined) this.config.defaultTimeout = updates.defaultTimeout;
    if (updates.maxConcurrentRequests !== undefined) this.config.maxConcurrentRequests = updates.maxConcurrentRequests;
    log.info('OrchestratorHub config updated');
  }

  // ----------------------------------------------------------
  // 工具
  // ----------------------------------------------------------

  private generateRequestId(): string {
    return `ORQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ============================================================
// 工厂函数
// ============================================================

export function createOrchestratorHub(config?: Partial<OrchestratorHubConfig>): OrchestratorHub {
  return new OrchestratorHub(config);
}

export function createDefaultHub(): OrchestratorHub {
  return new OrchestratorHub();
}
