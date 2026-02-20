/**
 * ============================================================================
 * 领域模型定义 — DomainModels
 * ============================================================================
 *
 * 职责：
 *   1. 定义平台核心聚合根（Aggregate Root）
 *   2. 定义值对象（Value Object）
 *   3. 定义领域事件（Domain Event）
 *   4. 定义领域服务接口
 *   5. 确保所有模块共享统一的领域语言
 */

// ============================================================================
// 值对象（Value Objects）
// ============================================================================

/** 设备标识 */
export interface EquipmentId {
  readonly type: 'equipment_id';
  readonly value: string;
  readonly namespace: string; // 场景命名空间
}

/** 传感器标识 */
export interface SensorId {
  readonly type: 'sensor_id';
  readonly value: string;
  readonly equipmentId: string;
  readonly channel: string;
}

/** 时间范围 */
export interface TimeRange {
  readonly start: number; // Unix ms
  readonly end: number;
}

/** 置信度 */
export interface Confidence {
  readonly value: number; // 0-1
  readonly source: 'model' | 'rule' | 'fusion' | 'human';
  readonly method: string;
}

/** 严重度 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 健康评分 */
export interface HealthScore {
  readonly overall: number; // 0-100
  readonly dimensions: {
    safety: number;
    health: number;
    efficiency: number;
    reliability: number;
  };
  readonly trend: 'improving' | 'stable' | 'degrading';
  readonly assessedAt: number;
}

/** 物理量 */
export interface PhysicalQuantity {
  readonly value: number;
  readonly unit: string;
  readonly uncertainty: number; // 不确定性
  readonly source: string;
  readonly timestamp: number;
}

// ============================================================================
// 聚合根（Aggregate Roots）
// ============================================================================

/** 设备聚合 */
export interface EquipmentAggregate {
  id: EquipmentId;
  name: string;
  type: string;
  conditionProfile: string;
  status: 'online' | 'offline' | 'maintenance' | 'alarm' | 'unknown';
  healthScore: HealthScore;
  sensors: SensorId[];
  metadata: Record<string, unknown>;
  lastUpdatedAt: number;
  createdAt: number;
}

/** 诊断会话聚合 */
export interface DiagnosisSessionAggregate {
  id: string;
  equipmentId: string;
  trigger: 'anomaly' | 'scheduled' | 'manual' | 'chain';
  status: 'running' | 'completed' | 'failed' | 'timeout';
  dimensions: {
    perception: { completed: boolean; confidence: number };
    reasoning: { completed: boolean; confidence: number };
    fusion: { completed: boolean; confidence: number };
    decision: { completed: boolean; confidence: number };
  };
  findings: DiagnosisFinding[];
  actions: RecommendedAction[];
  startedAt: number;
  completedAt: number | null;
}

/** 诊断发现 */
export interface DiagnosisFinding {
  id: string;
  type: 'anomaly' | 'degradation' | 'pattern' | 'prediction';
  severity: Severity;
  confidence: Confidence;
  description: string;
  evidence: Array<{
    source: string;
    data: Record<string, unknown>;
    weight: number;
  }>;
  relatedFindings: string[];
}

/** 推荐行动 */
export interface RecommendedAction {
  id: string;
  type: 'immediate' | 'scheduled' | 'monitoring' | 'investigation';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  parameters: Record<string, unknown>;
  expectedOutcome: string;
  deadline: number | null;
  assignee: string | null;
}

/** 进化周期聚合 */
export interface EvolutionCycleAggregate {
  id: string;
  status: 'discovering' | 'hypothesizing' | 'evaluating' | 'deploying' | 'crystallizing' | 'completed';
  dataDiscovery: {
    anomaliesFound: number;
    patternsFound: number;
    dataQualityScore: number;
  };
  hypothesis: {
    description: string;
    confidence: number;
    experiments: string[];
  } | null;
  evaluation: {
    shadowResults: Record<string, number>;
    isPromoted: boolean;
  } | null;
  deployment: {
    strategy: 'canary' | 'blue_green' | 'rolling';
    progress: number;
    rollbackTriggered: boolean;
  } | null;
  crystallization: {
    crystalIds: string[];
    knowledgeGain: number;
  } | null;
  startedAt: number;
  completedAt: number | null;
}

/** 护栏事件聚合 */
export interface GuardrailEventAggregate {
  id: string;
  ruleId: string;
  category: 'safety' | 'health' | 'efficiency';
  severity: Severity;
  equipmentId: string;
  trigger: {
    condition: string;
    actualValue: unknown;
    threshold: unknown;
  };
  action: {
    type: string;
    parameters: Record<string, unknown>;
    executed: boolean;
    executedAt: number | null;
  };
  acknowledged: boolean;
  acknowledgedBy: string | null;
  resolvedAt: number | null;
  createdAt: number;
}

// ============================================================================
// 领域事件（Domain Events）
// ============================================================================

export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: T;
  occurredAt: number;
  metadata: Record<string, unknown>;
}

// 设备领域事件
export type EquipmentOnline = DomainEvent<{ equipmentId: string; conditionProfile: string }>;
export type EquipmentOffline = DomainEvent<{ equipmentId: string; reason: string }>;
export type EquipmentHealthChanged = DomainEvent<{ equipmentId: string; oldScore: HealthScore; newScore: HealthScore }>;

// 诊断领域事件
export type DiagnosisStarted = DomainEvent<{ sessionId: string; equipmentId: string; trigger: string }>;
export type DiagnosisCompleted = DomainEvent<{ sessionId: string; findings: DiagnosisFinding[]; actions: RecommendedAction[] }>;
export type AnomalyDetected = DomainEvent<{ equipmentId: string; anomalyType: string; severity: Severity; confidence: number }>;

// 护栏领域事件
export type GuardrailTriggered = DomainEvent<{ ruleId: string; equipmentId: string; severity: Severity; action: string }>;
export type GuardrailAcknowledged = DomainEvent<{ eventId: string; acknowledgedBy: string }>;

// 进化领域事件
export type EvolutionCycleStarted = DomainEvent<{ cycleId: string }>;
export type EvolutionCycleCompleted = DomainEvent<{ cycleId: string; improvements: Record<string, number> }>;
export type ModelPromoted = DomainEvent<{ modelId: number; version: string; metrics: Record<string, number> }>;
export type KnowledgeCrystallized = DomainEvent<{ crystalId: string; type: string; confidence: number }>;

// ============================================================================
// 领域服务接口
// ============================================================================

export interface IPerceptionService {
  collectData(equipmentId: string): Promise<Record<string, unknown>>;
  encodeStateVector(rawData: Record<string, unknown>): Promise<Float64Array>;
  getConditionProfile(equipmentId: string): Promise<string>;
}

export interface ICognitionService {
  diagnose(equipmentId: string, stateVector: Float64Array): Promise<DiagnosisSessionAggregate>;
  predict(equipmentId: string, horizonMinutes: number): Promise<Record<string, unknown>>;
  reason(query: string, context: Record<string, unknown>): Promise<string>;
}

export interface IGuardrailService {
  evaluate(equipmentId: string, stateVector: Float64Array): Promise<GuardrailEventAggregate[]>;
  acknowledgeEvent(eventId: string, userId: string): Promise<boolean>;
  getActiveAlerts(equipmentId?: string): Promise<GuardrailEventAggregate[]>;
}

export interface IEvolutionService {
  startCycle(): Promise<EvolutionCycleAggregate>;
  getCycleStatus(cycleId: string): Promise<EvolutionCycleAggregate | null>;
  getImprovementHistory(): Promise<Array<{ cycleId: string; improvements: Record<string, number> }>>;
}

export interface IKnowledgeService {
  queryGraph(query: string): Promise<Record<string, unknown>>;
  getCrystals(conditionProfile?: string): Promise<Array<{ id: string; type: string; content: Record<string, unknown> }>>;
  getFeatures(equipmentType?: string): Promise<Array<{ name: string; version: string }>>;
}

// ============================================================================
// 领域事件类型注册表
// ============================================================================

export const DOMAIN_EVENT_TYPES = {
  // 设备
  EQUIPMENT_ONLINE: 'equipment.online',
  EQUIPMENT_OFFLINE: 'equipment.offline',
  EQUIPMENT_HEALTH_CHANGED: 'equipment.health_changed',

  // 感知
  STATE_VECTOR_ENCODED: 'perception.state_vector_encoded',
  CONDITION_DETECTED: 'perception.condition_detected',
  ANOMALY_RAW_DETECTED: 'perception.anomaly_raw_detected',

  // 诊断
  DIAGNOSIS_STARTED: 'diagnosis.started',
  DIAGNOSIS_COMPLETED: 'diagnosis.completed',
  ANOMALY_CONFIRMED: 'diagnosis.anomaly_confirmed',
  PREDICTION_GENERATED: 'diagnosis.prediction_generated',

  // 护栏
  GUARDRAIL_TRIGGERED: 'guardrail.triggered',
  GUARDRAIL_ACKNOWLEDGED: 'guardrail.acknowledged',
  GUARDRAIL_RESOLVED: 'guardrail.resolved',

  // 进化
  EVOLUTION_CYCLE_STARTED: 'evolution.cycle_started',
  EVOLUTION_CYCLE_COMPLETED: 'evolution.cycle_completed',
  MODEL_PROMOTED: 'evolution.model_promoted',
  KNOWLEDGE_CRYSTALLIZED: 'evolution.knowledge_crystallized',

  // 知识
  KG_TRIPLE_ADDED: 'knowledge.triple_added',
  FEATURE_REGISTERED: 'knowledge.feature_registered',
  CRYSTAL_APPLIED: 'knowledge.crystal_applied',
} as const;
