/**
 * ============================================================================
 * 内置事件 Schema 注册 — 闭环四阶段 13+ 事件类型
 * ============================================================================
 *
 * 本文件在平台启动时调用 registerBuiltinSchemas()，
 * 将所有内置事件的 Zod Schema 注册到 EventSchemaRegistry 中。
 *
 * 事件分类：
 *   ① 感知阶段 (perception): 3 个事件
 *   ② 诊断阶段 (diagnosis): 4 个事件
 *   ③ 护栏阶段 (guardrail): 3 个事件
 *   ④ 进化阶段 (evolution): 3 个事件
 */

import { z } from 'zod';
import { eventSchemaRegistry } from './event-schema-registry';

// ============================================================================
// 公共子 Schema
// ============================================================================

const sensorMeasurementSchema = z.object({
  channelId: z.string().min(1),
  logicalName: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  quality: z.enum(['good', 'uncertain', 'bad', 'interpolated']),
  sampleTimestamp: z.number().positive(),
});

const cycleAggregateFeaturesSchema = z.object({
  vibration_rms: z.number().nonnegative(),
  vibration_kurtosis: z.number(),
  vibration_crest_factor: z.number().nonnegative(),
  motor_current_avg: z.number().nonnegative(),
  motor_current_peak: z.number().nonnegative(),
  motor_rpm_avg: z.number().nonnegative(),
  motor_rpm_delta: z.number(),
  stress_max: z.number().nonnegative(),
  temperature: z.number(),
  cycle_time: z.number().nonnegative(),
  interlock_delay: z.number().nonnegative(),
}).passthrough(); // 允许自定义扩展字段

const uncertaintyFactorsSchema = z.object({
  score: z.number().min(0).max(1),
  wind_speed: z.number().nonnegative(),
  wind_direction: z.number().min(0).max(360),
  cargo_eccentricity: z.number().nonnegative(),
  hull_friction: z.number().nonnegative(),
  vessel_motion: z.number().nonnegative(),
  contributions: z.record(z.string(), z.number()),
});

const cumulativeMetricsSchema = z.object({
  fatigue_accum: z.number().min(0).max(1),
  remaining_life_days: z.number(),
  total_cycles_today: z.number().int().nonnegative(),
  operating_hours: z.number().nonnegative(),
});

const diagnosticItemSchema = z.object({
  type: z.string().min(1),
  cause: z.string().min(1),
  physics: z.string(),
  variables: z.record(z.string(), z.number()),
  result: z.number(),
  unit: z.string(),
  risk: z.enum(['critical', 'high', 'medium', 'low']),
  probability: z.number().min(0).max(1),
  suggestion: z.string(),
});

const predictionInfoSchema = z.object({
  remainingLifeDays: z.number(),
  fatigueAccumPercent: z.number().min(0).max(100),
  nextMaintenanceDate: z.string(),
  riskTrend: z.enum(['increasing', 'stable', 'decreasing']),
  predictionConfidence: z.number().min(0).max(1),
});

const violationSchema = z.object({
  ruleId: z.string().min(1),
  condition: z.string(),
  actualValue: z.number(),
  threshold: z.number(),
  severity: z.enum(['critical', 'high', 'medium']),
});

const guardrailActionEnum = z.enum([
  'limitSpeed', 'fullStop', 'anchor', 'reroute', 'pauseBeforeLock',
  'enhancedMonitoring', 'forceMaintenance', 'loadLimit',
  'scheduleMaintenance', 'autoTune', 'adjustPressure', 'prioritizeQueue', 'alert',
]);

// ============================================================================
// ① 感知阶段 Schema
// ============================================================================

const sensorDataRawSchema = z.object({
  machineId: z.string().min(1),
  measurements: z.array(sensorMeasurementSchema).min(1),
  samplingRate: z.number().positive(),
  encoding: z.enum(['raw', 'compressed', 'delta', 'fft']),
  qualityScore: z.number().min(0).max(1),
  batchSize: z.number().int().positive(),
});

const unifiedStateVectorSchema = z.object({
  machineId: z.string().min(1),
  timestamp: z.number().positive(),
  conditionId: z.string().min(1),
  cyclePhase: z.string().min(1),
  features: cycleAggregateFeaturesSchema,
  uncertainty: uncertaintyFactorsSchema,
  cumulative: cumulativeMetricsSchema,
  vectorVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
});

const conditionSwitchedSchema = z.object({
  machineId: z.string().min(1),
  fromConditionId: z.string(),
  toConditionId: z.string().min(1),
  trigger: z.enum(['auto_detection', 'manual', 'scheduler', 'threshold_breach']),
  timestamp: z.number().positive(),
  parameterSnapshot: z.record(z.string(), z.number()),
});

// ============================================================================
// ② 诊断阶段 Schema
// ============================================================================

const cognitionSessionStartedSchema = z.object({
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  triggerType: z.enum(['anomaly', 'scheduled', 'manual', 'chain', 'drift', 'guardrail_feedback']),
  timestamp: z.number().positive(),
  conditionId: z.string().optional(),
  priority: z.enum(['critical', 'high', 'normal']),
});

const cognitionDimensionCompletedSchema = z.object({
  sessionId: z.string().min(1),
  dimension: z.enum(['perception', 'reasoning', 'fusion', 'decision']),
  score: z.number().min(0).max(1),
  evidence: z.array(z.object({
    type: z.string(),
    source: z.string(),
    value: z.unknown(),
    weight: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
  })),
  confidence: z.number().min(0).max(1),
  processingTimeMs: z.number().nonnegative(),
});

const diagnosisReportSchema = z.object({
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  timestamp: z.number().positive(),
  conditionId: z.string().min(1),
  cyclePhase: z.string(),
  safetyScore: z.number().min(0).max(1),
  healthScore: z.number().min(0).max(1),
  efficiencyScore: z.number().min(0).max(1),
  diagnostics: z.array(diagnosticItemSchema),
  predictions: predictionInfoSchema,
  grokExplanation: z.string(),
  grokReasoningSteps: z.number().int().nonnegative(),
  totalProcessingTimeMs: z.number().nonnegative(),
});

const grokReasoningStepSchema = z.object({
  sessionId: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  toolCalls: z.array(z.object({
    toolName: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    output: z.record(z.string(), z.unknown()),
    durationMs: z.number().nonnegative(),
  })),
  intermediateResult: z.string(),
  stepDurationMs: z.number().nonnegative(),
});

// ============================================================================
// ③ 护栏阶段 Schema
// ============================================================================

const guardrailSafetyInterventionSchema = z.object({
  machineId: z.string().min(1),
  action: guardrailActionEnum,
  actionParams: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  ruleId: z.string().min(1),
  violations: z.array(violationSchema).min(1),
  grokExplanation: z.string(),
  sessionId: z.string().min(1),
  timestamp: z.number().positive(),
});

const guardrailHealthInterventionSchema = z.object({
  machineId: z.string().min(1),
  action: guardrailActionEnum,
  actionParams: z.record(z.string(), z.unknown()),
  remainingLife: z.number(),
  fatigueAccum: z.number().min(0).max(1),
  corrosionRate: z.number().optional(),
  healthTrend: z.enum(['degrading', 'stable', 'improving']),
  reason: z.string().min(1),
  ruleId: z.string().min(1),
  grokExplanation: z.string(),
  timestamp: z.number().positive(),
});

const guardrailEfficiencyAdjustmentSchema = z.object({
  machineId: z.string().min(1),
  parameter: z.string().min(1),
  oldValue: z.number(),
  newValue: z.number(),
  expectedImprovement: z.number(),
  reason: z.string().min(1),
  ruleId: z.string().min(1),
  timestamp: z.number().positive(),
});

// ============================================================================
// ④ 进化阶段 Schema
// ============================================================================

const edgeCaseDiscoveredSchema = z.object({
  caseId: z.string().min(1),
  caseType: z.enum(['false_positive', 'false_negative', 'extreme_condition', 'distribution_drift', 'novel_pattern']),
  dataRange: z.object({ start: z.number().positive(), end: z.number().positive() }),
  anomalyScore: z.number().min(0).max(1),
  machineIds: z.array(z.string().min(1)),
  description: z.string(),
  discoveredAt: z.number().positive(),
});

const modelUpdatedSchema = z.object({
  modelId: z.string().min(1),
  modelName: z.string().min(1),
  oldVersion: z.string(),
  newVersion: z.string(),
  improvementMetrics: z.record(z.string(), z.number()),
  deploymentMethod: z.enum(['canary', 'shadow', 'full']),
  updatedAt: z.number().positive(),
});

const knowledgeCrystallizedSchema = z.object({
  crystalId: z.string().min(1),
  pattern: z.string().min(1),
  confidence: z.number().min(0).max(1),
  applicableConditions: z.array(z.string()),
  sourceSessionIds: z.array(z.string()),
  kgNodeId: z.string().optional(),
  crystallizedAt: z.number().positive(),
});

// ============================================================================
// 注册函数
// ============================================================================

/**
 * 注册所有内置事件 Schema
 * 在平台启动时调用一次
 */
export function registerBuiltinSchemas(): void {
  // ① 感知阶段
  eventSchemaRegistry.register(
    'sensor.data.raw', '1.0.0', sensorDataRawSchema, 'perception',
    '传感器原始数据事件 — 采集层输出，包含多通道测量值、采样率、编码方式',
    ['machineId', 'measurements', 'samplingRate', 'qualityScore']
  );

  eventSchemaRegistry.register(
    'perception.state.vector', '1.0.0', unifiedStateVectorSchema, 'perception',
    '统一状态向量 — 融合层输出，包含周期聚合特征、不确定性因素、累积指标',
    ['machineId', 'conditionId', 'cyclePhase', 'features', 'uncertainty', 'cumulative']
  );

  eventSchemaRegistry.register(
    'condition.switched', '1.0.0', conditionSwitchedSchema, 'perception',
    '工况切换事件 — 工况检测器输出，包含切换原因和参数快照',
    ['machineId', 'fromConditionId', 'toConditionId', 'trigger']
  );

  // ② 诊断阶段
  eventSchemaRegistry.register(
    'cognition.session.started', '1.0.0', cognitionSessionStartedSchema, 'diagnosis',
    '认知会话开始 — 诊断引擎接收到触发信号，开始四维处理',
    ['sessionId', 'machineId', 'triggerType', 'priority']
  );

  eventSchemaRegistry.register(
    'cognition.dimension.completed', '1.0.0', cognitionDimensionCompletedSchema, 'diagnosis',
    '认知维度完成 — 四维中某一维处理完毕，包含评分和证据',
    ['sessionId', 'dimension', 'score', 'confidence']
  );

  eventSchemaRegistry.register(
    'diagnosis.report.generated', '1.0.0', diagnosisReportSchema, 'diagnosis',
    '诊断报告生成 — 完整诊断结果，包含安全/健康/高效三维评分、物理公式诊断、Grok 推理链',
    ['sessionId', 'machineId', 'safetyScore', 'healthScore', 'efficiencyScore', 'diagnostics', 'predictions']
  );

  eventSchemaRegistry.register(
    'grok.reasoning.step', '1.0.0', grokReasoningStepSchema, 'diagnosis',
    'Grok 推理步骤 — ReAct 循环中每一步的工具调用和中间结果',
    ['sessionId', 'stepIndex', 'toolCalls', 'intermediateResult']
  );

  // ③ 护栏阶段
  eventSchemaRegistry.register(
    'guardrail.safety.intervention', '1.0.0', guardrailSafetyInterventionSchema, 'guardrail',
    '安全护栏干预 — 安全评分低于阈值时触发，包含违规详情和 Grok 解释',
    ['machineId', 'action', 'violations', 'ruleId']
  );

  eventSchemaRegistry.register(
    'guardrail.health.intervention', '1.0.0', guardrailHealthInterventionSchema, 'guardrail',
    '健康护栏干预 — 剩余寿命或疲劳累积超阈值时触发',
    ['machineId', 'action', 'remainingLife', 'fatigueAccum', 'healthTrend']
  );

  eventSchemaRegistry.register(
    'guardrail.efficiency.adjustment', '1.0.0', guardrailEfficiencyAdjustmentSchema, 'guardrail',
    '高效护栏调参 — 效率指标偏离时自动调整运行参数',
    ['machineId', 'parameter', 'oldValue', 'newValue', 'expectedImprovement']
  );

  // ④ 进化阶段
  eventSchemaRegistry.register(
    'evolution.edge-case.discovered', '1.0.0', edgeCaseDiscoveredSchema, 'evolution',
    '边缘案例发现 — 数据引擎发现的异常模式、分布漂移或新型故障',
    ['caseId', 'caseType', 'anomalyScore', 'machineIds']
  );

  eventSchemaRegistry.register(
    'evolution.model.updated', '1.0.0', modelUpdatedSchema, 'evolution',
    '模型更新 — 经影子评估+金丝雀部署后的模型版本升级',
    ['modelId', 'oldVersion', 'newVersion', 'improvementMetrics', 'deploymentMethod']
  );

  eventSchemaRegistry.register(
    'evolution.knowledge.crystallized', '1.0.0', knowledgeCrystallizedSchema, 'evolution',
    '知识结晶 — 从诊断经验中提炼的可复用模式，写入 KG',
    ['crystalId', 'pattern', 'confidence', 'applicableConditions']
  );
}

// ============================================================================
// 导出各 Schema（供外部直接使用）
// ============================================================================

export {
  sensorDataRawSchema,
  unifiedStateVectorSchema,
  conditionSwitchedSchema,
  cognitionSessionStartedSchema,
  cognitionDimensionCompletedSchema,
  diagnosisReportSchema,
  grokReasoningStepSchema,
  guardrailSafetyInterventionSchema,
  guardrailHealthInterventionSchema,
  guardrailEfficiencyAdjustmentSchema,
  edgeCaseDiscoveredSchema,
  modelUpdatedSchema,
  knowledgeCrystallizedSchema,
};
