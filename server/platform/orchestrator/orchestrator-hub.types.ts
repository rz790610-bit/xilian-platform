/**
 * OrchestratorHub 类型定义
 * 统一编排调度层 — 协调 Pipeline / KG / DB 三个引擎
 */

/** 编排请求 */
export interface OrchestrationRequest {
  deviceType: string;
  diagnosisGoal: string;
  machineId: string;
  sensorData?: Record<string, number[]>;
  context?: Record<string, unknown>;
}

/** 编排结果 */
export interface OrchestrationResult {
  requestId: string;
  status: 'success' | 'partial' | 'failed';
  phases: OrchestrationPhase[];
  fusedResult: Record<string, unknown>;
  totalDurationMs: number;
  metadata: Record<string, unknown>;
}

/** 编排阶段 */
export interface OrchestrationPhase {
  engine: 'kg' | 'pipeline' | 'database';
  action: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  output?: Record<string, unknown>;
  error?: string;
}

/** Hub 配置 */
export interface OrchestratorHubConfig {
  enableKG: boolean;
  enablePipeline: boolean;
  enableDatabase: boolean;
  defaultTimeout: number;
  maxConcurrentRequests: number;
  scenarioTemplates: Record<string, ScenarioTemplate>;
}

/** 场景模板 — 决定三引擎的执行顺序和参数 */
export interface ScenarioTemplate {
  name: string;
  description: string;
  phases: ScenarioPhase[];
  applicableDeviceTypes: string[];
}

export interface ScenarioPhase {
  engine: 'kg' | 'pipeline' | 'database';
  action: string;
  config?: Record<string, unknown>;
}
