/**
 * ============================================================================
 * 数据契约类型定义 — 闭环全链路统一数据结构
 * ============================================================================
 *
 * 定义闭环四阶段（感知→诊断→护栏→进化）的核心数据结构。
 * 所有跨服务通信必须使用这些类型，确保类型安全和数据一致性。
 *
 * 设计原则：
 *   - 场景无关：通过 conditionId + equipmentType 适配任何工业场景
 *   - 物理驱动：诊断结果包含物理公式 + 变量 + 单位
 *   - 不确定性量化：所有评分附带置信度和不确定性分解
 *   - 可追溯：每条数据携带 traceId + correlationId
 */

// ============================================================================
// 基础类型
// ============================================================================

/** 事件信封元数据 */
export interface EventMetadata {
  /** 分布式追踪 ID */
  traceId: string;
  /** 工况 ID */
  conditionId?: string;
  /** 周期阶段 */
  cyclePhase?: string;
  /** 关联的诊断会话 ID */
  correlationId?: string;
  /** 设备树节点 ID */
  nodeId?: string;
}

/** 事件来源 */
export interface EventSource {
  /** 产生事件的服务 */
  serviceId: string;
  /** 服务实例 */
  instanceId: string;
  /** 关联设备 */
  machineId?: string;
}

/** 事件信封（所有事件的统一外层结构） */
export interface EventEnvelope<T = unknown> {
  /** 事件唯一 ID */
  eventId: string;
  /** 事件类型（dot-separated namespace） */
  eventType: string;
  /** Schema 版本（SemVer） */
  version: string;
  /** 时间戳（Unix ms） */
  timestamp: number;
  /** 事件来源 */
  source: EventSource;
  /** 事件载荷（由具体事件 Schema 校验） */
  payload: T;
  /** 元数据 */
  metadata: EventMetadata;
}

// ============================================================================
// ① 感知阶段数据契约
// ============================================================================

/** 传感器测量值 */
export interface SensorMeasurement {
  /** 传感器通道 ID */
  channelId: string;
  /** 逻辑名称（平台统一） */
  logicalName: string;
  /** 测量值 */
  value: number;
  /** 单位 */
  unit: string;
  /** 数据质量标记 */
  quality: 'good' | 'uncertain' | 'bad' | 'interpolated';
  /** 采样时间戳（Unix ms） */
  sampleTimestamp: number;
}

/** 传感器原始数据事件载荷 */
export interface SensorDataRawPayload {
  /** 设备 ID */
  machineId: string;
  /** 测量值列表 */
  measurements: SensorMeasurement[];
  /** 采样率（Hz） */
  samplingRate: number;
  /** 编码方式 */
  encoding: 'raw' | 'compressed' | 'delta' | 'fft';
  /** 数据质量综合评分 0-1 */
  qualityScore: number;
  /** 批次大小 */
  batchSize: number;
}

/** 周期聚合特征 */
export interface CycleAggregateFeatures {
  /** 振动有效值 (mm/s) */
  vibration_rms: number;
  /** 振动峭度（轴承故障早期指标） */
  vibration_kurtosis: number;
  /** 峰值因子 */
  vibration_crest_factor: number;
  /** 电机平均电流 (A) */
  motor_current_avg: number;
  /** 电机峰值电流 (A) */
  motor_current_peak: number;
  /** 平均转速 (rpm) */
  motor_rpm_avg: number;
  /** 转速变化率 (rpm/s) — 瞬变指标 */
  motor_rpm_delta: number;
  /** 最大应力 (MPa) */
  stress_max: number;
  /** 关键部位温度 (°C) */
  temperature: number;
  /** 本周期耗时 (s) */
  cycle_time: number;
  /** 联动延时 (ms) */
  interlock_delay: number;
  /** 自定义特征扩展 */
  [key: string]: number;
}

/** 不确定性因素 */
export interface UncertaintyFactors {
  /** 综合不确定性评分 0-1 */
  score: number;
  /** 60m 高度风速 (m/s) */
  wind_speed: number;
  /** 风向 (deg) */
  wind_direction: number;
  /** 货物偏心距 (m) */
  cargo_eccentricity: number;
  /** 舱壁摩擦系数估计（无量纲） */
  hull_friction: number;
  /** 船舶运动幅度 (m) */
  vessel_motion: number;
  /** 各因素对 uncertainty 的贡献 */
  contributions: Record<string, number>;
}

/** 累积指标 */
export interface CumulativeMetrics {
  /** S-N 曲线疲劳累积比 0-1 */
  fatigue_accum: number;
  /** 预估剩余寿命（天） */
  remaining_life_days: number;
  /** 今日周期数 */
  total_cycles_today: number;
  /** 累计运行小时 */
  operating_hours: number;
}

/** 统一状态向量事件载荷 */
export interface UnifiedStateVectorPayload {
  /** 设备 ID */
  machineId: string;
  /** 时间戳 */
  timestamp: number;
  /** 工况 ID */
  conditionId: string;
  /** 周期阶段 */
  cyclePhase: 'idleUp' | 'idleDown' | 'loadedUp' | 'loadedDown' | 'loadedTraverse' | 'lockUnlock' | 'idle' | string;
  /** 周期聚合特征 */
  features: CycleAggregateFeatures;
  /** 不确定性因素 */
  uncertainty: UncertaintyFactors;
  /** 累积指标 */
  cumulative: CumulativeMetrics;
  /** 状态向量版本 */
  vectorVersion: string;
}

/** 工况切换事件载荷 */
export interface ConditionSwitchedPayload {
  /** 设备 ID */
  machineId: string;
  /** 原工况 ID */
  fromConditionId: string;
  /** 新工况 ID */
  toConditionId: string;
  /** 切换触发原因 */
  trigger: 'auto_detection' | 'manual' | 'scheduler' | 'threshold_breach';
  /** 切换时间戳 */
  timestamp: number;
  /** 切换时的关键参数快照 */
  parameterSnapshot: Record<string, number>;
}

// ============================================================================
// ② 诊断阶段数据契约
// ============================================================================

/** 认知会话开始事件载荷 */
export interface CognitionSessionStartedPayload {
  /** 会话 ID */
  sessionId: string;
  /** 设备 ID */
  machineId: string;
  /** 触发类型 */
  triggerType: 'anomaly' | 'scheduled' | 'manual' | 'chain' | 'drift' | 'guardrail_feedback';
  /** 触发时间 */
  timestamp: number;
  /** 关联的工况 ID */
  conditionId?: string;
  /** 优先级 */
  priority: 'critical' | 'high' | 'normal';
}

/** 四维处理结果事件载荷 */
export interface CognitionDimensionCompletedPayload {
  /** 会话 ID */
  sessionId: string;
  /** 维度 */
  dimension: 'perception' | 'reasoning' | 'fusion' | 'decision';
  /** 维度评分 0-1 */
  score: number;
  /** 证据列表 */
  evidence: Array<{
    type: string;
    source: string;
    value: unknown;
    weight: number;
    confidence: number;
  }>;
  /** 置信度 0-1 */
  confidence: number;
  /** 处理耗时 (ms) */
  processingTimeMs: number;
}

/** 诊断条目 */
export interface DiagnosticItem {
  /** 诊断类型 */
  type: 'fatigue' | 'wind_load' | 'friction' | 'corrosion' | 'misalignment' | 'overload' | 'uncertainty' | 'vibration' | 'thermal' | string;
  /** 人类可读的根因描述 */
  cause: string;
  /** 物理公式 */
  physics: string;
  /** 公式中的变量值 */
  variables: Record<string, number>;
  /** 计算结果 */
  result: number;
  /** 结果单位 */
  unit: string;
  /** 风险等级 */
  risk: 'critical' | 'high' | 'medium' | 'low';
  /** 概率 0-1 */
  probability: number;
  /** 建议措施 */
  suggestion: string;
}

/** 预测信息 */
export interface PredictionInfo {
  /** 预估剩余寿命（天） */
  remainingLifeDays: number;
  /** 疲劳累积百分比 */
  fatigueAccumPercent: number;
  /** 下次维护日期 */
  nextMaintenanceDate: string;
  /** 风险趋势 */
  riskTrend: 'increasing' | 'stable' | 'decreasing';
  /** 预测置信度 0-1 */
  predictionConfidence: number;
}

/** 诊断报告事件载荷 */
export interface DiagnosisReportPayload {
  /** 会话 ID */
  sessionId: string;
  /** 设备 ID */
  machineId: string;
  /** 时间戳 */
  timestamp: number;
  /** 工况 ID */
  conditionId: string;
  /** 周期阶段 */
  cyclePhase: string;
  /** 安全评分 0-1 (<0.85 触发安全护栏) */
  safetyScore: number;
  /** 健康评分 0-1 */
  healthScore: number;
  /** 高效评分 0-1 */
  efficiencyScore: number;
  /** 详细诊断条目 */
  diagnostics: DiagnosticItem[];
  /** 预测信息 */
  predictions: PredictionInfo;
  /** Grok 思考链（自然语言） */
  grokExplanation: string;
  /** Grok 推理步数 */
  grokReasoningSteps: number;
  /** 总处理耗时 (ms) */
  totalProcessingTimeMs: number;
}

/** Grok 推理链步骤事件载荷 */
export interface GrokReasoningStepPayload {
  /** 会话 ID */
  sessionId: string;
  /** 步骤索引 */
  stepIndex: number;
  /** 工具调用列表 */
  toolCalls: Array<{
    toolName: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    durationMs: number;
  }>;
  /** 中间推理结果 */
  intermediateResult: string;
  /** 步骤耗时 (ms) */
  stepDurationMs: number;
}

// ============================================================================
// ③ 护栏阶段数据契约
// ============================================================================

/** 护栏干预动作 */
export type GuardrailAction =
  | 'limitSpeed'
  | 'fullStop'
  | 'anchor'
  | 'reroute'
  | 'pauseBeforeLock'
  | 'enhancedMonitoring'
  | 'forceMaintenance'
  | 'loadLimit'
  | 'scheduleMaintenance'
  | 'autoTune'
  | 'adjustPressure'
  | 'prioritizeQueue'
  | 'alert';

/** 安全干预事件载荷 */
export interface GuardrailSafetyInterventionPayload {
  /** 设备 ID */
  machineId: string;
  /** 干预动作 */
  action: GuardrailAction;
  /** 动作参数（e.g., limitSpeed 的百分比） */
  actionParams: Record<string, unknown>;
  /** 干预原因 */
  reason: string;
  /** 触发的规则 ID */
  ruleId: string;
  /** 违规详情 */
  violations: Array<{
    ruleId: string;
    condition: string;
    actualValue: number;
    threshold: number;
    severity: 'critical' | 'high' | 'medium';
  }>;
  /** Grok 解释 */
  grokExplanation: string;
  /** 关联的诊断会话 ID */
  sessionId: string;
  /** 时间戳 */
  timestamp: number;
}

/** 健康干预事件载荷 */
export interface GuardrailHealthInterventionPayload {
  /** 设备 ID */
  machineId: string;
  /** 干预动作 */
  action: GuardrailAction;
  /** 动作参数 */
  actionParams: Record<string, unknown>;
  /** 剩余寿命（天） */
  remainingLife: number;
  /** 疲劳累积比 0-1 */
  fatigueAccum: number;
  /** 腐蚀速率 */
  corrosionRate?: number;
  /** 健康趋势 */
  healthTrend: 'degrading' | 'stable' | 'improving';
  /** 干预原因 */
  reason: string;
  /** 规则 ID */
  ruleId: string;
  /** Grok 解释 */
  grokExplanation: string;
  /** 时间戳 */
  timestamp: number;
}

/** 高效调参事件载荷 */
export interface GuardrailEfficiencyAdjustmentPayload {
  /** 设备 ID */
  machineId: string;
  /** 调整参数名 */
  parameter: string;
  /** 旧值 */
  oldValue: number;
  /** 新值 */
  newValue: number;
  /** 预期改善百分比 */
  expectedImprovement: number;
  /** 调整原因 */
  reason: string;
  /** 规则 ID */
  ruleId: string;
  /** 时间戳 */
  timestamp: number;
}

// ============================================================================
// ④ 进化阶段数据契约
// ============================================================================

/** 边缘案例发现事件载荷 */
export interface EdgeCaseDiscoveredPayload {
  /** 案例 ID */
  caseId: string;
  /** 案例类型 */
  caseType: 'false_positive' | 'false_negative' | 'extreme_condition' | 'distribution_drift' | 'novel_pattern';
  /** 数据时间范围 */
  dataRange: { start: number; end: number };
  /** 异常评分 0-1 */
  anomalyScore: number;
  /** 关联的设备 ID 列表 */
  machineIds: string[];
  /** 描述 */
  description: string;
  /** 发现时间 */
  discoveredAt: number;
}

/** 模型更新事件载荷 */
export interface ModelUpdatedPayload {
  /** 模型 ID */
  modelId: string;
  /** 模型名称 */
  modelName: string;
  /** 旧版本 */
  oldVersion: string;
  /** 新版本 */
  newVersion: string;
  /** 改善指标 */
  improvementMetrics: {
    accuracyDelta: number;
    falsePositiveRateDelta: number;
    latencyDelta: number;
    [key: string]: number;
  };
  /** 部署方式 */
  deploymentMethod: 'canary' | 'shadow' | 'full';
  /** 更新时间 */
  updatedAt: number;
}

/** 知识结晶事件载荷 */
export interface KnowledgeCrystallizedPayload {
  /** 结晶 ID */
  crystalId: string;
  /** 模式描述 */
  pattern: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 适用工况列表 */
  applicableConditions: string[];
  /** 来源认知会话 ID 列表 */
  sourceSessionIds: string[];
  /** KG 节点 ID（如果已写入 Neo4j） */
  kgNodeId?: string;
  /** 结晶时间 */
  crystallizedAt: number;
}

// ============================================================================
// 物理公式相关
// ============================================================================

/** 物理公式定义 */
export interface PhysicsFormula {
  /** 公式 ID */
  id: string;
  /** 公式名称 */
  name: string;
  /** 分类 */
  category: 'fatigue' | 'wind_load' | 'friction' | 'corrosion' | 'thermal' | 'vibration' | 'structural';
  /** 公式表达式（LaTeX 或文本） */
  formula: string;
  /** 变量定义 */
  variables: Array<{
    name: string;
    symbol: string;
    unit: string;
    description: string;
    defaultValue?: number;
    range?: [number, number];
  }>;
  /** 适用设备类型 */
  applicableEquipment: string[];
  /** 来源 */
  source: 'physics' | 'learned' | 'expert';
  /** 参考文献 */
  reference?: string;
}

/** 物理公式计算结果 */
export interface PhysicsFormulaResult {
  /** 公式 ID */
  formulaId: string;
  /** 输入变量值 */
  inputVariables: Record<string, number>;
  /** 计算结果 */
  result: number;
  /** 结果单位 */
  unit: string;
  /** 解释 */
  explanation: string;
  /** 计算时间 (ms) */
  computeTimeMs: number;
}

// ============================================================================
// 工况配置相关
// ============================================================================

/** 工况模板 */
export interface ConditionProfile {
  /** 工况 ID */
  id: string;
  /** 工况名称 */
  name: string;
  /** 行业 */
  industry: string;
  /** 设备类型 */
  equipmentType: string;
  /** 参数定义 */
  parameters: Array<{
    name: string;
    range: [number, number];
    unit: string;
    description: string;
  }>;
  /** 传感器映射 */
  sensorMapping: Array<{
    logicalName: string;
    physicalChannel: string;
    samplingRate: number;
    unit: string;
  }>;
  /** 阈值策略 */
  thresholdStrategy: {
    type: 'static' | 'dynamic' | 'worldmodel';
    staticThresholds?: Record<string, number>;
    dynamicConfig?: { baselineWindow: string; sigma: number };
  };
  /** 认知配置 */
  cognitionConfig: {
    perceptionSensitivity: number;
    reasoningDepth: number;
    fusionStrategy: 'ds' | 'bayesian' | 'ensemble';
    decisionUrgency: number;
  };
  /** 护栏规则覆盖 */
  guardrailOverrides?: Array<{
    ruleId: string;
    overrideThreshold?: number;
    overrideAction?: GuardrailAction;
    enabled?: boolean;
  }>;
  /** 版本 */
  version: string;
}

/** 设备 Profile */
export interface EquipmentProfile {
  /** 设备 ID */
  id: string;
  /** 设备类型 */
  type: string;
  /** 制造商 */
  manufacturer: string;
  /** 型号 */
  model: string;
  /** 物理约束 */
  physicalConstraints: Array<{
    type: 'correlation' | 'causation' | 'bound';
    variables: string[];
    expression: string;
    source: 'physics' | 'learned' | 'expert';
  }>;
  /** 故障模式 */
  failureModes: Array<{
    name: string;
    symptoms: string[];
    physicsFormula: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  /** 世界模型配置 */
  worldModelConfig: {
    stateVariables: string[];
    predictionHorizon: number;
    physicsModel: string;
  };
  /** 维护计划 */
  maintenanceSchedule: Array<{
    component: string;
    intervalHours: number;
    condition: string;
  }>;
}

// ============================================================================
// 导出所有事件载荷类型的映射
// ============================================================================

/** 事件类型到载荷类型的映射 */
export interface EventPayloadMap {
  // ① 感知
  'sensor.data.raw': SensorDataRawPayload;
  'perception.state.vector': UnifiedStateVectorPayload;
  'condition.switched': ConditionSwitchedPayload;
  // ② 诊断
  'cognition.session.started': CognitionSessionStartedPayload;
  'cognition.dimension.completed': CognitionDimensionCompletedPayload;
  'diagnosis.report.generated': DiagnosisReportPayload;
  'grok.reasoning.step': GrokReasoningStepPayload;
  // ③ 护栏
  'guardrail.safety.intervention': GuardrailSafetyInterventionPayload;
  'guardrail.health.intervention': GuardrailHealthInterventionPayload;
  'guardrail.efficiency.adjustment': GuardrailEfficiencyAdjustmentPayload;
  // ④ 进化
  'evolution.edge-case.discovered': EdgeCaseDiscoveredPayload;
  'evolution.model.updated': ModelUpdatedPayload;
  'evolution.knowledge.crystallized': KnowledgeCrystallizedPayload;
}

/** 所有事件类型 */
export type EventType = keyof EventPayloadMap;

/** 类型安全的事件信封 */
export type TypedEventEnvelope<T extends EventType> = EventEnvelope<EventPayloadMap[T]>;
