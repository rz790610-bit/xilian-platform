/**
 * ============================================================================
 * 深度进化 v5.0 — 新增 24 张数据库表（Drizzle ORM Schema）
 * ============================================================================
 *
 * 按闭环四阶段分组：
 *   ① 感知阶段（4 张）：condition_profiles, condition_instances, feature_definitions, feature_versions
 *   ② 诊断阶段（6 张）：cognition_sessions, cognition_dimension_results, grok_reasoning_chains,
 *                        world_model_snapshots, world_model_predictions, diagnosis_physics_formulas
 *   ③ 护栏阶段（2 张）：guardrail_rules, guardrail_violations
 *   ④ 进化阶段（8 张）：shadow_eval_records, shadow_eval_metrics, champion_challenger_experiments,
 *                        canary_deployments, canary_traffic_splits, knowledge_crystals,
 *                        evolution_cycles, tool_definitions
 *   ⑤ 通用（4 张）：equipment_profiles, physics_formula_library, condition_baselines, sampling_configs
 */

import {
  int, bigint, tinyint, smallint, mysqlEnum, mysqlTable, text, timestamp, varchar,
  json, boolean, double, date, datetime, index, uniqueIndex, float,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// ① 感知阶段（4 张）
// ============================================================================

/**
 * 工况模板定义 — 参数范围、传感器映射、阈值策略、认知配置
 * 场景无关：通过 industry + equipmentType 适配任何工业场景
 */
export const conditionProfiles = mysqlTable('condition_profiles', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  industry: varchar('industry', { length: 100 }).notNull(),
  equipmentType: varchar('equipment_type', { length: 100 }).notNull(),
  description: text('description'),
  /** 参数定义 [{name, range:[min,max], unit, description}] */
  parameters: json('parameters').$type<Array<{
    name: string; range: [number, number]; unit: string; description: string;
  }>>().notNull(),
  /** 传感器映射 [{logicalName, physicalChannel, samplingRate, unit}] */
  sensorMapping: json('sensor_mapping').$type<Array<{
    logicalName: string; physicalChannel: string; samplingRate: number; unit: string;
  }>>().notNull(),
  /** 阈值策略 {type: 'static'|'dynamic'|'worldmodel', staticThresholds?, dynamicConfig?} */
  thresholdStrategy: json('threshold_strategy').$type<{
    type: 'static' | 'dynamic' | 'worldmodel';
    staticThresholds?: Record<string, number>;
    dynamicConfig?: { baselineWindow: string; sigma: number };
  }>().notNull(),
  /** 认知配置 {perceptionSensitivity, reasoningDepth, fusionStrategy, decisionUrgency} */
  cognitionConfig: json('cognition_config').$type<{
    perceptionSensitivity: number; reasoningDepth: number;
    fusionStrategy: 'ds' | 'bayesian' | 'ensemble'; decisionUrgency: number;
  }>().notNull(),
  /** 护栏规则覆盖 */
  guardrailOverrides: json('guardrail_overrides').$type<Array<{
    ruleId: string; overrideThreshold?: number; overrideAction?: string; enabled?: boolean;
  }>>(),
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cp_industry').on(table.industry),
  index('idx_cp_equipment').on(table.equipmentType),
  uniqueIndex('uq_cp_name_version').on(table.name, table.version),
]);
export type ConditionProfile = typeof conditionProfiles.$inferSelect;
export type InsertConditionProfile = typeof conditionProfiles.$inferInsert;

/**
 * 工况实例 — 运行中的工况快照，记录每次工况切换
 */
export const conditionInstances = mysqlTable('condition_instances', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  startedAt: timestamp('started_at', { fsp: 3 }).notNull(),
  endedAt: timestamp('ended_at', { fsp: 3 }),
  trigger: mysqlEnum('trigger', ['auto_detection', 'manual', 'scheduler', 'threshold_breach']).notNull(),
  /** 切换时的关键参数快照 */
  stateSnapshot: json('state_snapshot').$type<Record<string, number>>(),
  status: mysqlEnum('status', ['active', 'completed', 'aborted']).notNull().default('active'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ci_profile').on(table.profileId),
  index('idx_ci_machine').on(table.machineId),
  index('idx_ci_time').on(table.startedAt),
  index('idx_ci_status').on(table.status),
]);
export type ConditionInstance = typeof conditionInstances.$inferSelect;
export type InsertConditionInstance = typeof conditionInstances.$inferInsert;

/**
 * 特征定义 — 特征注册表核心
 */
export const featureDefinitions = mysqlTable('feature_definitions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  category: mysqlEnum('category', ['time_domain', 'freq_domain', 'statistical', 'derived', 'physics']).notNull(),
  description: text('description'),
  /** 输入信号列表 */
  inputSignals: json('input_signals').$type<Array<{
    logicalName: string; unit: string; required: boolean;
  }>>().notNull(),
  /** 计算逻辑（TypeScript 表达式或函数引用） */
  computeLogic: text('compute_logic').notNull(),
  /** 适用设备类型 */
  applicableEquipment: json('applicable_equipment').$type<string[]>().notNull(),
  /** 输出单位 */
  outputUnit: varchar('output_unit', { length: 50 }),
  /** 输出范围 */
  outputRange: json('output_range').$type<[number, number]>(),
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_fd_name_version').on(table.name, table.version),
  index('idx_fd_category').on(table.category),
]);
export type FeatureDefinition = typeof featureDefinitions.$inferSelect;
export type InsertFeatureDefinition = typeof featureDefinitions.$inferInsert;

/**
 * 特征版本管理
 */
export const featureVersions = mysqlTable('feature_versions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  featureId: bigint('feature_id', { mode: 'number' }).notNull(),
  version: varchar('version', { length: 20 }).notNull(),
  changelog: text('changelog'),
  /** 输出 Schema（Zod 定义的 JSON 表示） */
  schema: json('schema').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_fv_feature').on(table.featureId),
  uniqueIndex('uq_fv_feature_version').on(table.featureId, table.version),
]);
export type FeatureVersion = typeof featureVersions.$inferSelect;
export type InsertFeatureVersion = typeof featureVersions.$inferInsert;

// ============================================================================
// ② 诊断阶段（6 张）
// ============================================================================

/**
 * 认知会话 — 一次完整的四维处理过程及结果
 */
export const cognitionSessions = mysqlTable('cognition_sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  conditionId: varchar('condition_id', { length: 100 }),
  cyclePhase: varchar('cycle_phase', { length: 50 }),
  triggerType: mysqlEnum('trigger_type', ['anomaly', 'scheduled', 'manual', 'chain', 'drift', 'guardrail_feedback']).notNull(),
  priority: mysqlEnum('priority', ['critical', 'high', 'normal']).notNull().default('normal'),
  status: mysqlEnum('status', ['running', 'completed', 'failed', 'timeout']).notNull().default('running'),
  /** 安全评分 0-1 */
  safetyScore: double('safety_score'),
  /** 健康评分 0-1 */
  healthScore: double('health_score'),
  /** 高效评分 0-1 */
  efficiencyScore: double('efficiency_score'),
  /** 详细诊断条目 JSON */
  diagnosticsJson: json('diagnostics_json').$type<Array<{
    type: string; cause: string; physics: string; variables: Record<string, number>;
    result: number; unit: string; risk: string; probability: number; suggestion: string;
  }>>(),
  /** 预测信息 JSON */
  predictionsJson: json('predictions_json').$type<{
    remainingLifeDays: number; fatigueAccumPercent: number;
    nextMaintenanceDate: string; riskTrend: string; predictionConfidence: number;
  }>(),
  /** Grok 推理解释 */
  grokExplanation: text('grok_explanation'),
  /** Grok 推理步数 */
  grokReasoningSteps: int('grok_reasoning_steps').default(0),
  /** 总处理耗时 (ms) */
  totalProcessingTimeMs: int('total_processing_time_ms'),
  startedAt: timestamp('started_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cs_machine').on(table.machineId),
  index('idx_cs_condition').on(table.conditionId),
  index('idx_cs_status').on(table.status),
  index('idx_cs_time').on(table.startedAt),
  index('idx_cs_trigger').on(table.triggerType),
]);
export type CognitionSession = typeof cognitionSessions.$inferSelect;
export type InsertCognitionSession = typeof cognitionSessions.$inferInsert;

/**
 * 四维处理结果持久化
 */
export const cognitionDimensionResults = mysqlTable('cognition_dimension_results', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  dimension: mysqlEnum('dimension', ['perception', 'reasoning', 'fusion', 'decision']).notNull(),
  score: double('score').notNull(),
  /** 证据列表 JSON */
  evidence: json('evidence').$type<Array<{
    type: string; source: string; value: unknown; weight: number; confidence: number;
  }>>().notNull(),
  confidence: double('confidence').notNull(),
  processingTimeMs: int('processing_time_ms').notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cdr_session').on(table.sessionId),
  index('idx_cdr_dimension').on(table.dimension),
]);
export type CognitionDimensionResult = typeof cognitionDimensionResults.$inferSelect;
export type InsertCognitionDimensionResult = typeof cognitionDimensionResults.$inferInsert;

/**
 * Grok 推理链记录 — 含 tool-calling 轨迹
 */
export const grokReasoningChains = mysqlTable('grok_reasoning_chains', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  stepIndex: int('step_index').notNull(),
  toolName: varchar('tool_name', { length: 200 }).notNull(),
  toolInput: json('tool_input').$type<Record<string, unknown>>().notNull(),
  toolOutput: json('tool_output').$type<Record<string, unknown>>().notNull(),
  reasoning: text('reasoning'),
  durationMs: int('duration_ms').notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_grc_session').on(table.sessionId),
  index('idx_grc_step').on(table.sessionId, table.stepIndex),
  index('idx_grc_tool').on(table.toolName),
]);
export type GrokReasoningChain = typeof grokReasoningChains.$inferSelect;
export type InsertGrokReasoningChain = typeof grokReasoningChains.$inferInsert;

/**
 * 世界模型状态快照
 */
export const worldModelSnapshots = mysqlTable('world_model_snapshots', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  timestamp: timestamp('timestamp', { fsp: 3 }).notNull(),
  /** 状态向量 JSON */
  stateVector: json('state_vector').$type<Record<string, unknown>>().notNull(),
  /** 物理约束 JSON */
  constraints: json('constraints').$type<Array<{
    type: string; variables: string[]; expression: string; source: string;
  }>>(),
  /** 状态转移概率矩阵（二进制序列化） */
  transitionProb: text('transition_prob'),
  /** 健康指数 0-1 */
  healthIndex: double('health_index'),
  /** 预测结果 JSON */
  predictions: json('predictions').$type<Record<string, unknown>>(),
  conditionId: varchar('condition_id', { length: 100 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_wms_machine').on(table.machineId),
  index('idx_wms_time').on(table.timestamp),
  index('idx_wms_condition').on(table.conditionId),
]);
export type WorldModelSnapshot = typeof worldModelSnapshots.$inferSelect;
export type InsertWorldModelSnapshot = typeof worldModelSnapshots.$inferInsert;

/**
 * 世界模型预测记录（含事后验证）
 */
export const worldModelPredictions = mysqlTable('world_model_predictions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  snapshotId: bigint('snapshot_id', { mode: 'number' }).notNull(),
  horizonMinutes: int('horizon_minutes').notNull(),
  /** 预测状态 JSON */
  predictedState: json('predicted_state').$type<Record<string, unknown>>().notNull(),
  /** 实际状态 JSON（事后填充） */
  actualState: json('actual_state').$type<Record<string, unknown>>(),
  /** 预测误差 */
  error: double('error'),
  /** 验证时间 */
  validatedAt: timestamp('validated_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_wmp_snapshot').on(table.snapshotId),
  index('idx_wmp_horizon').on(table.horizonMinutes),
]);
export type WorldModelPrediction = typeof worldModelPredictions.$inferSelect;
export type InsertWorldModelPrediction = typeof worldModelPredictions.$inferInsert;

/**
 * 物理公式库 — 持久化版本（运行时从 PhysicsEngine 加载）
 */
export const diagnosisPhysicsFormulas = mysqlTable('diagnosis_physics_formulas', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  category: mysqlEnum('category', ['fatigue', 'wind_load', 'friction', 'corrosion', 'thermal', 'vibration', 'structural']).notNull(),
  formula: text('formula').notNull(),
  /** 变量定义 JSON */
  variables: json('variables').$type<Array<{
    name: string; symbol: string; unit: string; description: string;
    defaultValue?: number; range?: [number, number];
  }>>().notNull(),
  /** 适用设备类型 */
  applicableEquipment: json('applicable_equipment').$type<string[]>().notNull(),
  source: mysqlEnum('source', ['physics', 'learned', 'expert']).notNull().default('physics'),
  reference: text('reference'),
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_dpf_name_version').on(table.name, table.version),
  index('idx_dpf_category').on(table.category),
]);
export type DiagnosisPhysicsFormula = typeof diagnosisPhysicsFormulas.$inferSelect;
export type InsertDiagnosisPhysicsFormula = typeof diagnosisPhysicsFormulas.$inferInsert;

// ============================================================================
// ③ 护栏阶段（2 张）
// ============================================================================

/**
 * 护栏规则 — 动态可配置的安全/健康/高效干预规则
 */
export const guardrailRules = mysqlTable('guardrail_rules', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  type: mysqlEnum('type', ['safety', 'health', 'efficiency']).notNull(),
  description: text('description'),
  /** 触发条件 JSON {field, operator, threshold, ...} */
  condition: json('condition').$type<{
    field: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'between' | 'and' | 'or';
    threshold?: number;
    thresholds?: [number, number];
    children?: unknown[];
    physicalBasis?: string;
  }>().notNull(),
  /** 干预动作 JSON {action, params} */
  action: json('action').$type<{
    action: string;
    params: Record<string, unknown>;
    escalation?: { action: string; params: Record<string, unknown>; delayMs: number };
  }>().notNull(),
  priority: int('priority').notNull().default(100),
  enabled: boolean('enabled').notNull().default(true),
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  /** 适用设备类型（空 = 全部） */
  applicableEquipment: json('applicable_equipment').$type<string[]>(),
  /** 适用工况（空 = 全部） */
  applicableConditions: json('applicable_conditions').$type<string[]>(),
  /** 物理依据 */
  physicalBasis: text('physical_basis'),
  /** 触发冷却时间(毫秒) */
  cooldownMs: int('cooldown_ms').notNull().default(60000),
  /** 升级链配置 {levels:[{action,delayMs}]} */
  escalationConfig: json('escalation_config').$type<{
    levels: Array<{ action: string; delayMs: number }>;
  }>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_gr_type').on(table.type),
  index('idx_gr_priority').on(table.priority),
  index('idx_gr_enabled').on(table.enabled),
]);
export type GuardrailRule = typeof guardrailRules.$inferSelect;
export type InsertGuardrailRule = typeof guardrailRules.$inferInsert;

/**
 * 护栏触发记录 — 每次干预的完整审计日志
 */
export const guardrailViolations = mysqlTable('guardrail_violations', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  ruleId: bigint('rule_id', { mode: 'number' }).notNull(),
  sessionId: varchar('session_id', { length: 64 }),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  timestamp: timestamp('timestamp', { fsp: 3 }).notNull(),
  /** 触发时的实际值 JSON */
  triggerValues: json('trigger_values').$type<Record<string, number>>().notNull(),
  /** 执行的干预动作 */
  action: varchar('action', { length: 100 }).notNull(),
  /** 干预原因 */
  reason: text('reason').notNull(),
  /** Grok 解释 */
  grokExplanation: text('grok_explanation'),
  /** 执行结果 */
  outcome: mysqlEnum('outcome', ['executed', 'overridden', 'failed', 'pending']).notNull().default('pending'),
  /** 干预后设备状态改善（事后填充） */
  postInterventionImprovement: double('post_intervention_improvement'),
  /** 当前升级级别 1=ALERT 2=THROTTLE 3=HALT */
  escalationLevel: tinyint('escalation_level').notNull().default(1),
  /** 告警解除时间 */
  resolvedAt: timestamp('resolved_at', { fsp: 3 }),
  /** 告警严重度 0.0-1.0 */
  severity: double('severity'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_gv_rule').on(table.ruleId),
  index('idx_gv_session').on(table.sessionId),
  index('idx_gv_machine').on(table.machineId),
  index('idx_gv_time').on(table.timestamp),
  index('idx_gv_outcome').on(table.outcome),
]);
export type GuardrailViolation = typeof guardrailViolations.$inferSelect;
export type InsertGuardrailViolation = typeof guardrailViolations.$inferInsert;

// ============================================================================
// ④ 进化阶段（8 张）
// ============================================================================

/**
 * 影子评估记录
 */
export const shadowEvalRecords = mysqlTable('shadow_eval_records', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  experimentName: varchar('experiment_name', { length: 200 }).notNull(),
  baselineModelId: varchar('baseline_model_id', { length: 100 }).notNull(),
  challengerModelId: varchar('challenger_model_id', { length: 100 }).notNull(),
  /** 评估数据范围 */
  dataRangeStart: timestamp('data_range_start', { fsp: 3 }).notNull(),
  dataRangeEnd: timestamp('data_range_end', { fsp: 3 }).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed']).notNull().default('pending'),
  /** 评估配置 JSON */
  config: json('config').$type<{
    sliceCount: number; timeoutMs: number; mcNemarAlpha: number;
    monteCarloRuns: number; perturbationMagnitude: number;
    tasWeights: { mcNemar: number; dsFusion: number; monteCarlo: number };
  }>(),
  startedAt: timestamp('started_at', { fsp: 3 }),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ser_status').on(table.status),
  index('idx_ser_baseline').on(table.baselineModelId),
  index('idx_ser_challenger').on(table.challengerModelId),
]);
export type ShadowEvalRecord = typeof shadowEvalRecords.$inferSelect;
export type InsertShadowEvalRecord = typeof shadowEvalRecords.$inferInsert;

/**
 * 影子评估指标（多维度对比）
 */
export const shadowEvalMetrics = mysqlTable('shadow_eval_metrics', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  recordId: bigint('record_id', { mode: 'number' }).notNull(),
  metricName: varchar('metric_name', { length: 100 }).notNull(),
  baselineValue: double('baseline_value').notNull(),
  challengerValue: double('challenger_value').notNull(),
  improvement: double('improvement'),
  statisticalSignificance: double('statistical_significance'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_sem_record').on(table.recordId),
  index('idx_sem_metric').on(table.metricName),
]);
export type ShadowEvalMetric = typeof shadowEvalMetrics.$inferSelect;
export type InsertShadowEvalMetric = typeof shadowEvalMetrics.$inferInsert;

/**
 * 冠军挑战者实验（三门控）
 */
export const championChallengerExperiments = mysqlTable('champion_challenger_experiments', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  championId: varchar('champion_id', { length: 100 }).notNull(),
  challengerId: varchar('challenger_id', { length: 100 }).notNull(),
  /** 三门控通过状态 */
  gate1Passed: boolean('gate1_passed'),
  gate2Passed: boolean('gate2_passed'),
  gate3Passed: boolean('gate3_passed'),
  /** TAS 综合保证分数 */
  tasScore: double('tas_score'),
  /** 最终裁决 */
  verdict: mysqlEnum('verdict', ['PROMOTE', 'CANARY_EXTENDED', 'REJECT', 'PENDING']).default('PENDING'),
  /** 晋升时间 */
  promotedAt: timestamp('promoted_at', { fsp: 3 }),
  /** 关联的影子评估 ID */
  shadowEvalId: bigint('shadow_eval_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cce_champion').on(table.championId),
  index('idx_cce_challenger').on(table.challengerId),
  index('idx_cce_verdict').on(table.verdict),
]);
export type ChampionChallengerExperiment = typeof championChallengerExperiments.$inferSelect;
export type InsertChampionChallengerExperiment = typeof championChallengerExperiments.$inferInsert;

/**
 * 金丝雀发布记录
 */
export const canaryDeployments = mysqlTable('canary_deployments', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  experimentId: bigint('experiment_id', { mode: 'number' }).notNull(),
  modelId: varchar('model_id', { length: 100 }).notNull(),
  trafficPercent: double('traffic_percent').notNull(),
  status: mysqlEnum('status', ['active', 'completed', 'rolled_back', 'failed']).notNull().default('active'),
  rollbackReason: text('rollback_reason'),
  /** 金丝雀指标快照 */
  metricsSnapshot: json('metrics_snapshot').$type<Record<string, number>>(),
  startedAt: timestamp('started_at', { fsp: 3 }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cd_experiment').on(table.experimentId),
  index('idx_cd_model').on(table.modelId),
  index('idx_cd_status').on(table.status),
]);
export type CanaryDeployment = typeof canaryDeployments.$inferSelect;
export type InsertCanaryDeployment = typeof canaryDeployments.$inferInsert;

/**
 * 金丝雀流量分配（按设备）
 */
export const canaryTrafficSplits = mysqlTable('canary_traffic_splits', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  deploymentId: bigint('deployment_id', { mode: 'number' }).notNull(),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  assignedModel: varchar('assigned_model', { length: 100 }).notNull(),
  /** 设备级指标 JSON */
  metrics: json('metrics').$type<Record<string, number>>(),
  timestamp: timestamp('timestamp', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cts_deployment').on(table.deploymentId),
  index('idx_cts_machine').on(table.machineId),
]);
export type CanaryTrafficSplit = typeof canaryTrafficSplits.$inferSelect;
export type InsertCanaryTrafficSplit = typeof canaryTrafficSplits.$inferInsert;

/**
 * 知识结晶记录
 */
export const knowledgeCrystals = mysqlTable('knowledge_crystals', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  pattern: text('pattern').notNull(),
  confidence: double('confidence').notNull(),
  /** 来源认知会话 ID 列表 */
  sourceSessionIds: json('source_session_ids').$type<string[]>().notNull(),
  /** 适用工况列表 */
  applicableConditions: json('applicable_conditions').$type<string[]>(),
  /** KG 节点 ID（如果已写入 Neo4j） */
  kgNodeId: varchar('kg_node_id', { length: 100 }),
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  /** 验证次数 */
  verificationCount: int('verification_count').notNull().default(0),
  /** 最后验证时间 */
  lastVerifiedAt: timestamp('last_verified_at', { fsp: 3 }),
  /** 结晶类型 */
  type: mysqlEnum('type', ['pattern', 'threshold_update', 'causal_link', 'anomaly_signature']).notNull().default('pattern'),
  /** 生命周期状态 */
  status: mysqlEnum('status', ['draft', 'pending_review', 'approved', 'rejected', 'deprecated']).notNull().default('draft'),
  /** 来源类型 */
  sourceType: mysqlEnum('source_type', ['cognition', 'evolution', 'manual', 'guardrail']).notNull().default('cognition'),
  /** 创建者（system:cognition / system:evolution / user:xxx） */
  createdBy: varchar('created_by', { length: 100 }),
  /** 应用次数 */
  applicationCount: int('application_count').notNull().default(0),
  /** 负面反馈率 */
  negativeFeedbackRate: double('negative_feedback_rate').notNull().default(0),
  /** 审核意见（rejected 时必填） */
  reviewComment: text('review_comment'),
  /** pattern 内容 MD5 哈希，用于并发去重 */
  contentHash: varchar('content_hash', { length: 32 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_kc_confidence').on(table.confidence),
  index('idx_kc_kg_node').on(table.kgNodeId),
  uniqueIndex('uk_crystal_hash').on(table.type, table.contentHash),
  index('idx_kc_type_status').on(table.type, table.status),
  index('idx_kc_status_nfr').on(table.status, table.negativeFeedbackRate),
  index('idx_kc_content_hash').on(table.contentHash),
]);
export type KnowledgeCrystal = typeof knowledgeCrystals.$inferSelect;
export type InsertKnowledgeCrystal = typeof knowledgeCrystals.$inferInsert;

/**
 * 自进化周期记录
 */
export const evolutionCycles = mysqlTable('evolution_cycles', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  cycleNumber: int('cycle_number').notNull(),
  startedAt: timestamp('started_at', { fsp: 3 }).notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  status: mysqlEnum('status', ['running', 'completed', 'failed', 'paused']).notNull().default('running'),
  /** 发现的边缘案例数 */
  edgeCasesFound: int('edge_cases_found').default(0),
  /** 生成的假设数 */
  hypothesesGenerated: int('hypotheses_generated').default(0),
  /** 评估的模型数 */
  modelsEvaluated: int('models_evaluated').default(0),
  /** 部署的模型数 */
  deployed: int('deployed').default(0),
  /** 进化前准确率 */
  accuracyBefore: double('accuracy_before'),
  /** 进化后准确率 */
  accuracyAfter: double('accuracy_after'),
  /** 改善百分比 */
  improvementPercent: double('improvement_percent'),
  /** 知识结晶数 */
  knowledgeCrystallized: int('knowledge_crystallized').default(0),
  /** 周期摘要 */
  summary: text('summary'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_ec_cycle').on(table.cycleNumber),
  index('idx_ec_status').on(table.status),
  index('idx_ec_time').on(table.startedAt),
]);
export type EvolutionCycle = typeof evolutionCycles.$inferSelect;
export type InsertEvolutionCycle = typeof evolutionCycles.$inferInsert;

/**
 * 工具定义 — 供 Grok Tool Calling 发现和调用
 */
export const toolDefinitions = mysqlTable('tool_definitions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description').notNull(),
  /** 输入 Schema JSON（Zod 定义） */
  inputSchema: json('input_schema').$type<Record<string, unknown>>().notNull(),
  /** 输出 Schema JSON */
  outputSchema: json('output_schema').$type<Record<string, unknown>>().notNull(),
  /** 权限控制 */
  permissions: json('permissions').$type<{
    requiredRoles: string[];
    maxCallsPerMinute: number;
    requiresApproval: boolean;
  }>(),
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  /** 执行器引用（函数路径或服务端点） */
  executor: text('executor').notNull(),
  /** 所属闭环阶段 */
  loopStage: mysqlEnum('loop_stage', ['perception', 'diagnosis', 'guardrail', 'evolution', 'utility']),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_td_name_version').on(table.name, table.version),
  index('idx_td_stage').on(table.loopStage),
  index('idx_td_enabled').on(table.enabled),
]);
export type ToolDefinition = typeof toolDefinitions.$inferSelect;
export type InsertToolDefinition = typeof toolDefinitions.$inferInsert;

// ============================================================================
// ⑤ 通用辅助表（4 张）
// ============================================================================

/**
 * 设备 Profile — 设备物理约束、故障模式、世界模型配置
 */
export const equipmentProfiles = mysqlTable('equipment_profiles', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  type: varchar('type', { length: 100 }).notNull(),
  manufacturer: varchar('manufacturer', { length: 200 }),
  model: varchar('model', { length: 200 }),
  /** 物理约束 JSON */
  physicalConstraints: json('physical_constraints').$type<Array<{
    type: 'correlation' | 'causation' | 'bound';
    variables: string[]; expression: string; source: 'physics' | 'learned' | 'expert';
  }>>(),
  /** 故障模式 JSON */
  failureModes: json('failure_modes').$type<Array<{
    name: string; symptoms: string[]; physicsFormula: string; severity: 'critical' | 'major' | 'minor';
  }>>(),
  /** 世界模型配置 JSON */
  worldModelConfig: json('world_model_config').$type<{
    stateVariables: string[]; predictionHorizon: number; physicsModel: string;
  }>(),
  /** 维护计划 JSON */
  maintenanceSchedule: json('maintenance_schedule').$type<Array<{
    component: string; intervalHours: number; condition: string;
  }>>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ep_type').on(table.type),
]);
export type EquipmentProfile = typeof equipmentProfiles.$inferSelect;
export type InsertEquipmentProfile = typeof equipmentProfiles.$inferInsert;

/**
 * 工况基线 — 各工况下的正常运行基线值
 */
export const conditionBaselines = mysqlTable('condition_baselines', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  /** 基线值 JSON {featureName: {mean, std, min, max, p5, p95}} */
  baselineValues: json('baseline_values').$type<Record<string, {
    mean: number; std: number; min: number; max: number; p5: number; p95: number;
  }>>().notNull(),
  /** 学习样本数 */
  sampleCount: int('sample_count').notNull(),
  /** 基线状态 */
  status: mysqlEnum('status', ['learning', 'converged', 'expired']).notNull().default('learning'),
  /** 收敛时间 */
  convergedAt: timestamp('converged_at', { fsp: 3 }),
  /** 过期时间 */
  expiresAt: timestamp('expires_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cb_profile').on(table.profileId),
  index('idx_cb_machine').on(table.machineId),
  index('idx_cb_status').on(table.status),
  uniqueIndex('uq_cb_profile_machine').on(table.profileId, table.machineId),
]);
export type ConditionBaseline = typeof conditionBaselines.$inferSelect;
export type InsertConditionBaseline = typeof conditionBaselines.$inferInsert;

/**
 * 采样配置 — 自适应采样策略（按工况阶段）
 */
export const samplingConfigs = mysqlTable('sampling_configs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  cyclePhase: varchar('cycle_phase', { length: 50 }).notNull(),
  /** 基础采样率 (Hz) */
  baseSamplingRate: int('base_sampling_rate').notNull(),
  /** 高频模式采样率 (Hz) */
  highFreqSamplingRate: int('high_freq_sampling_rate').notNull(),
  /** 高频触发条件 JSON */
  highFreqTrigger: json('high_freq_trigger').$type<{
    conditions: Array<{ field: string; operator: string; threshold: number }>;
    logic: 'and' | 'or';
  }>(),
  /** 数据保留策略 */
  retentionPolicy: mysqlEnum('retention_policy', ['all', 'features_only', 'aggregated', 'sampled']).notNull().default('features_only'),
  /** 压缩方式 */
  compression: mysqlEnum('compression', ['none', 'delta', 'fft', 'wavelet']).notNull().default('delta'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_sc_profile').on(table.profileId),
  uniqueIndex('uq_sc_profile_phase').on(table.profileId, table.cyclePhase),
]);
export type SamplingConfig = typeof samplingConfigs.$inferSelect;
export type InsertSamplingConfig = typeof samplingConfigs.$inferInsert;

/**
 * 边缘案例库 — 数据引擎发现的异常模式
 */
export const edgeCases = mysqlTable('edge_cases', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  caseType: mysqlEnum('case_type', ['false_positive', 'false_negative', 'extreme_condition', 'distribution_drift', 'novel_pattern']).notNull(),
  description: text('description').notNull(),
  /** 数据时间范围 */
  dataRangeStart: timestamp('data_range_start', { fsp: 3 }).notNull(),
  dataRangeEnd: timestamp('data_range_end', { fsp: 3 }).notNull(),
  /** 异常评分 0-1 */
  anomalyScore: double('anomaly_score').notNull(),
  /** 关联设备 ID 列表 */
  machineIds: json('machine_ids').$type<string[]>().notNull(),
  /** 关联的进化周期 ID */
  cycleId: bigint('cycle_id', { mode: 'number' }),
  /** 处理状态 */
  status: mysqlEnum('status', ['discovered', 'analyzing', 'labeled', 'integrated', 'dismissed']).notNull().default('discovered'),
  /** 标注结果 */
  labelResult: json('label_result').$type<Record<string, unknown>>(),
  discoveredAt: timestamp('discovered_at', { fsp: 3 }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ec_type').on(table.caseType),
  index('idx_ec_status').on(table.status),
  index('idx_ec_score').on(table.anomalyScore),
  index('idx_ec_cycle').on(table.cycleId),
]);
export type EdgeCase = typeof edgeCases.$inferSelect;
export type InsertEdgeCase = typeof edgeCases.$inferInsert;

// ============================================================================
// ⑥ 感知层增强表（3 张） — Phase 1 Perception Enhancement
// ============================================================================

/**
 * BPA 配置表 — 存储 DS 证据融合的模糊隶属度规则
 *
 * 每条记录代表一套完整的 BPA 配置（假设空间 + 规则集），
 * 按设备类型和工况区分。前端可编辑，支持版本管理。
 *
 * 使用场景：
 *   BPABuilder 启动时从此表加载配置，
 *   前端编辑后通过 API 热更新到运行中的 BPABuilder。
 */
export const bpaConfigs = mysqlTable('bpa_configs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 配置名称（如 "岸桥默认配置"） */
  name: varchar('name', { length: 200 }).notNull(),
  /** 设备类型（如 'quay_crane', 'rtg_crane'） */
  equipmentType: varchar('equipment_type', { length: 100 }).notNull(),
  /** 适用工况（null 表示通用） */
  conditionPhase: varchar('condition_phase', { length: 100 }),
  /** 假设空间（辨识框架 Θ 的元素） */
  hypotheses: json('hypotheses').$type<string[]>().notNull(),
  /**
   * 模糊隶属度规则集
   * 每条规则定义一个证据源对一个假设的模糊映射
   */
  rules: json('rules').$type<Array<{
    source: string;
    hypothesis: string;
    functionType: 'trapezoidal' | 'triangular' | 'gaussian';
    params: Record<string, number>;
  }>>().notNull(),
  /** 基础不确定性（ignorance base），默认 0.05 */
  ignoranceBase: double('ignorance_base').notNull().default(0.05),
  /** 最小信念质量阈值，默认 0.01 */
  minMassThreshold: double('min_mass_threshold').notNull().default(0.01),
  /** 版本号 */
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  /** 是否启用 */
  enabled: boolean('enabled').notNull().default(true),
  /** 描述 */
  description: text('description'),
  /** 创建者 */
  createdBy: varchar('created_by', { length: 100 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_bpa_equipment').on(table.equipmentType),
  index('idx_bpa_condition').on(table.conditionPhase),
  index('idx_bpa_enabled').on(table.enabled),
  uniqueIndex('uq_bpa_name_version').on(table.name, table.version),
]);
export type BpaConfigRow = typeof bpaConfigs.$inferSelect;
export type InsertBpaConfig = typeof bpaConfigs.$inferInsert;

/**
 * 状态向量维度定义表 — 定义 21 维状态向量的每个维度
 *
 * 每条记录定义一个维度的：
 *   - ClickHouse 数据源映射（metric_name）
 *   - 聚合方法（mean, max, rms, latest 等）
 *   - 归一化范围
 *   - 默认值
 *
 * 使用场景：
 *   StateVectorSynthesizer 启动时从此表加载维度定义，
 *   前端可编辑维度配置（增删改维度、调整聚合方法等）。
 */
export const stateVectorDimensions = mysqlTable('state_vector_dimensions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 设备类型 */
  equipmentType: varchar('equipment_type', { length: 100 }).notNull(),
  /** 维度序号（1-based） */
  dimensionIndex: int('dimension_index').notNull(),
  /** 维度标识（如 'vibrationRms'） */
  dimensionKey: varchar('dimension_key', { length: 100 }).notNull(),
  /** 显示名称 */
  label: varchar('label', { length: 200 }).notNull(),
  /** 单位 */
  unit: varchar('unit', { length: 50 }).notNull().default(''),
  /** 所属分组 */
  dimensionGroup: mysqlEnum('dimension_group', ['cycle_features', 'uncertainty_factors', 'cumulative_metrics']).notNull(),
  /** ClickHouse 中的 metric_name 列表（JSON 数组） */
  metricNames: json('metric_names').$type<string[]>().notNull(),
  /** 聚合方法 */
  aggregation: mysqlEnum('aggregation', ['mean', 'max', 'min', 'rms', 'latest', 'sum', 'std']).notNull().default('mean'),
  /** 默认值 */
  defaultValue: double('default_value').notNull().default(0),
  /** 归一化范围 [min, max] */
  normalizeRange: json('normalize_range').$type<[number, number]>().notNull(),
  /** 数据源类型 */
  source: mysqlEnum('source', ['clickhouse', 'mysql', 'computed', 'external']).notNull().default('clickhouse'),
  /** 是否启用 */
  enabled: boolean('enabled').notNull().default(true),
  /** 描述 */
  description: text('description'),
  /** 版本号 */
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_svd_equipment').on(table.equipmentType),
  index('idx_svd_group').on(table.dimensionGroup),
  index('idx_svd_enabled').on(table.enabled),
  uniqueIndex('uq_svd_equipment_key_version').on(table.equipmentType, table.dimensionKey, table.version),
]);
export type StateVectorDimensionRow = typeof stateVectorDimensions.$inferSelect;
export type InsertStateVectorDimension = typeof stateVectorDimensions.$inferInsert;

/**
 * 状态向量日志表 — 记录每次状态向量合成的完整过程
 *
 * 用于审计追溯和质量监控。
 * 高频写入场景建议定期归档到 ClickHouse。
 */
export const stateVectorLogs = mysqlTable('state_vector_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 设备 ID */
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  /** 合成时间戳 */
  synthesizedAt: timestamp('synthesized_at', { fsp: 3 }).notNull(),
  /** 维度值快照 */
  dimensionValues: json('dimension_values').$type<Record<string, number>>().notNull(),
  /** 归一化后的值 */
  normalizedValues: json('normalized_values').$type<number[]>().notNull(),
  /** 数据完整度 0-1 */
  completeness: double('completeness').notNull(),
  /** 数据新鲜度（秒） */
  freshnessSeconds: double('freshness_seconds').notNull(),
  /** 缺失维度列表 */
  missingDimensions: json('missing_dimensions').$type<string[]>(),
  /** 使用默认值的维度列表 */
  defaultedDimensions: json('defaulted_dimensions').$type<string[]>(),
  /** 数据点总数 */
  totalDataPoints: int('total_data_points').notNull().default(0),
  /** 合成耗时（毫秒） */
  durationMs: int('duration_ms'),
  /** BPA 构建日志（可选，关联的 BPA 构建结果） */
  bpaLog: json('bpa_log').$type<Array<{
    source: string;
    inputValue: number;
    outputMasses: Record<string, number>;
    ignorance: number;
  }>>(),
  /** 融合结果摘要（可选） */
  fusionSummary: json('fusion_summary').$type<{
    decision: string;
    confidence: number;
    conflict: number;
    strategy: string;
  }>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_svl_machine').on(table.machineId),
  index('idx_svl_time').on(table.synthesizedAt),
  index('idx_svl_completeness').on(table.completeness),
]);
export type StateVectorLogRow = typeof stateVectorLogs.$inferSelect;
export type InsertStateVectorLog = typeof stateVectorLogs.$inferInsert;


// ============================================================================
// ⑥ Phase 2 — 认知层推理引擎增强（6 张）
// ============================================================================

/**
 * 因果图节点 — 港口机械领域因果知识
 */
export const causalNodes = mysqlTable('causal_nodes', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 节点唯一标识（如 bearing_inner_race_fault） */
  nodeId: varchar('node_id', { length: 200 }).notNull().unique(),
  /** 节点标签（中文显示名） */
  label: varchar('label', { length: 200 }).notNull(),
  /** 节点类型 */
  nodeType: mysqlEnum('node_type', ['symptom', 'mechanism', 'root_cause', 'condition']).notNull(),
  /** 所属异常域 */
  domain: varchar('domain', { length: 100 }).notNull(),
  /** 先验概率 [0, 1] */
  priorProbability: float('prior_probability').notNull().default(0.5),
  /** 关联的物理方程 ID 列表 */
  equationIds: json('equation_ids').$type<string[]>().notNull().default([]),
  /** 关联的测点标签列表 */
  sensorTags: json('sensor_tags').$type<string[]>().notNull().default([]),
  /** 元数据（描述、单位、阈值等） */
  metadata: json('metadata').$type<Record<string, unknown>>().notNull().default({}),
  /** 数据来源 */
  sourceType: mysqlEnum('source_type', ['seed', 'grok_discovered', 'experience_learned']).notNull().default('seed'),
  /** 是否激活 */
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull().onUpdateNow(),
}, (table) => [
  index('idx_cn_domain').on(table.domain),
  index('idx_cn_type').on(table.nodeType),
  index('idx_cn_source').on(table.sourceType),
]);
export type CausalNodeRow = typeof causalNodes.$inferSelect;
export type InsertCausalNode = typeof causalNodes.$inferInsert;

/**
 * 因果图边 — 节点间因果关系（贝叶斯自更新权重）
 */
export const causalEdges = mysqlTable('causal_edges', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 边唯一标识 */
  edgeId: varchar('edge_id', { length: 400 }).notNull().unique(),
  /** 源节点 ID */
  sourceNodeId: varchar('source_node_id', { length: 200 }).notNull(),
  /** 目标节点 ID */
  targetNodeId: varchar('target_node_id', { length: 200 }).notNull(),
  /** 边权重 [0, 1]（贝叶斯自更新） */
  weight: float('weight').notNull().default(0.5),
  /** 因果机制描述 */
  mechanism: text('mechanism').notNull(),
  /** 证据计数 */
  evidenceCount: int('evidence_count').notNull().default(0),
  /** 数据来源 */
  sourceType: mysqlEnum('source_type', ['seed', 'grok_discovered', 'experience_learned']).notNull().default('seed'),
  /** 最后衰减时间 */
  lastDecayAt: timestamp('last_decay_at', { fsp: 3 }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull().onUpdateNow(),
}, (table) => [
  index('idx_ce_source_node').on(table.sourceNodeId),
  index('idx_ce_target_node').on(table.targetNodeId),
  index('idx_ce_weight').on(table.weight),
  uniqueIndex('idx_ce_pair').on(table.sourceNodeId, table.targetNodeId),
]);
export type CausalEdgeRow = typeof causalEdges.$inferSelect;
export type InsertCausalEdge = typeof causalEdges.$inferInsert;

/**
 * 推理经验记录 — 三层内存持久化
 */
export const reasoningExperiences = mysqlTable('reasoning_experiences', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 经验唯一标识 */
  experienceId: varchar('experience_id', { length: 200 }).notNull().unique(),
  /** 经验层级 */
  layer: mysqlEnum('layer', ['episodic', 'semantic', 'procedural']).notNull(),
  /** 关联的认知会话 ID */
  sessionId: varchar('session_id', { length: 200 }),
  /** 异常域 */
  domain: varchar('domain', { length: 100 }).notNull(),
  /** 设备类型 */
  deviceType: varchar('device_type', { length: 100 }),
  /** 设备编码 */
  deviceCode: varchar('device_code', { length: 100 }),
  /** 异常描述 / 规则描述 / 程序名称 */
  description: text('description').notNull(),
  /** 诊断假设 */
  hypothesis: varchar('hypothesis', { length: 500 }),
  /** 最终根因 */
  rootCause: varchar('root_cause', { length: 500 }),
  /** 解决方案 */
  resolution: text('resolution'),
  /** 是否正确（人工反馈） */
  wasCorrect: boolean('was_correct'),
  /** 置信度 [0, 1] */
  confidence: float('confidence').notNull().default(0),
  /** 特征向量（JSON 数组，用于向量检索） */
  featureVector: json('feature_vector').$type<number[]>(),
  /** 上下文快照 */
  context: json('context').$type<Record<string, unknown>>().notNull().default({}),
  /** 来源情景 ID 列表（语义记忆用） */
  sourceEpisodicIds: json('source_episodic_ids').$type<string[]>(),
  /** 操作步骤（程序记忆用） */
  steps: json('steps').$type<Array<{
    order: number; action: string; expectedOutcome: string; toolId?: string;
  }>>(),
  /** 验证次数（语义记忆用） */
  verificationCount: int('verification_count').notNull().default(0),
  /** 成功率（语义记忆用） */
  successRate: float('success_rate'),
  /** 执行次数（程序记忆用） */
  executionCount: int('execution_count').notNull().default(0),
  /** 平均耗时 ms（程序记忆用） */
  avgDurationMs: int('avg_duration_ms'),
  /** 最后访问时间 */
  lastAccessedAt: timestamp('last_accessed_at', { fsp: 3 }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull().onUpdateNow(),
}, (table) => [
  index('idx_re_layer').on(table.layer),
  index('idx_re_domain').on(table.domain),
  index('idx_re_session').on(table.sessionId),
  index('idx_re_device').on(table.deviceType, table.deviceCode),
  index('idx_re_confidence').on(table.confidence),
  index('idx_re_accessed').on(table.lastAccessedAt),
]);
export type ReasoningExperienceRow = typeof reasoningExperiences.$inferSelect;
export type InsertReasoningExperience = typeof reasoningExperiences.$inferInsert;

/**
 * 推理决策日志 — 每次推理的完整决策追溯
 */
export const reasoningDecisionLogs = mysqlTable('reasoning_decision_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 关联的认知会话 ID */
  sessionId: varchar('session_id', { length: 200 }).notNull(),
  /** 选择的推理路由 */
  route: mysqlEnum('route', ['fast_path', 'standard_path', 'deep_path', 'fallback_path']).notNull(),
  /** 各阶段耗时 (ms) */
  phaseDurations: json('phase_durations').$type<Record<string, number>>().notNull(),
  /** 关键决策点列表 */
  decisions: json('decisions').$type<Array<{
    point: string; choice: string; reason: string; confidence: number;
  }>>().notNull(),
  /** 最终假设 */
  finalHypothesis: varchar('final_hypothesis', { length: 500 }),
  /** 最终置信度 */
  finalConfidence: float('final_confidence'),
  /** 是否物理验证通过 */
  physicsVerified: boolean('physics_verified').notNull().default(false),
  /** 是否使用了 Grok */
  grokUsed: boolean('grok_used').notNull().default(false),
  /** Grok 调用次数 */
  grokCallCount: int('grok_call_count').notNull().default(0),
  /** 端到端不确定性 */
  totalUncertainty: float('total_uncertainty'),
  /** 不确定性分解 */
  uncertaintyDecomposition: json('uncertainty_decomposition').$type<Record<string, number>>(),
  /** 总耗时 (ms) */
  totalDurationMs: int('total_duration_ms').notNull(),
  /** 解释图（JSON-LD） */
  explanationGraph: json('explanation_graph').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_rdl_session').on(table.sessionId),
  index('idx_rdl_route').on(table.route),
  index('idx_rdl_grok').on(table.grokUsed),
  index('idx_rdl_time').on(table.createdAt),
]);
export type ReasoningDecisionLogRow = typeof reasoningDecisionLogs.$inferSelect;
export type InsertReasoningDecisionLog = typeof reasoningDecisionLogs.$inferInsert;

/**
 * 修订日志 — 知识反馈环的所有权重修改记录（支持回滚）
 */
export const revisionLogs = mysqlTable('revision_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 修订唯一标识 */
  revisionId: varchar('revision_id', { length: 200 }).notNull().unique(),
  /** 修改的组件 */
  component: mysqlEnum('component', ['causal_edge', 'experience_weight', 'physics_param', 'bpa_config']).notNull(),
  /** 修改的实体 ID */
  entityId: varchar('entity_id', { length: 400 }).notNull(),
  /** 修改前的值 */
  previousValue: json('previous_value').$type<Record<string, unknown>>().notNull(),
  /** 修改后的值 */
  newValue: json('new_value').$type<Record<string, unknown>>().notNull(),
  /** 触发的反馈事件类型 */
  feedbackEventType: varchar('feedback_event_type', { length: 100 }).notNull(),
  /** 关联的认知会话 ID */
  sessionId: varchar('session_id', { length: 200 }).notNull(),
  /** 是否已回滚 */
  rolledBack: boolean('rolled_back').notNull().default(false),
  /** 回滚时间 */
  rolledBackAt: timestamp('rolled_back_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_rl_component').on(table.component),
  index('idx_rl_entity').on(table.entityId),
  index('idx_rl_session').on(table.sessionId),
  index('idx_rl_time').on(table.createdAt),
]);
export type RevisionLogRow = typeof revisionLogs.$inferSelect;
export type InsertRevisionLog = typeof revisionLogs.$inferInsert;

/**
 * Shadow 推理对比记录 — Champion vs Challenger 逐会话对比
 */
export const shadowReasoningComparisons = mysqlTable('shadow_reasoning_comparisons', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 关联的认知会话 ID */
  sessionId: varchar('session_id', { length: 200 }).notNull(),
  /** Champion（旧引擎）结果 */
  championResult: json('champion_result').$type<{
    hypothesis: string; confidence: number; durationMs: number;
  }>().notNull(),
  /** Challenger（新引擎）结果 */
  challengerResult: json('challenger_result').$type<{
    hypothesis: string; confidence: number; durationMs: number;
    route: string; grokUsed: boolean;
  }>().notNull(),
  /** 实际结果（人工标注后填入） */
  groundTruth: varchar('ground_truth', { length: 500 }),
  /** Champion 是否命中 */
  championHit: boolean('champion_hit'),
  /** Challenger 是否命中 */
  challengerHit: boolean('challenger_hit'),
  /** 延迟比（Challenger / Champion） */
  latencyRatio: float('latency_ratio'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_src_session').on(table.sessionId),
  index('idx_src_time').on(table.createdAt),
]);
export type ShadowReasoningComparisonRow = typeof shadowReasoningComparisons.$inferSelect;
export type InsertShadowReasoningComparison = typeof shadowReasoningComparisons.$inferInsert;


// ============================================================================
// Phase 2 — 动态配置注册表
// ============================================================================

/**
 * 引擎配置注册表 — 支持用户自由增删改配置项
 * 每行代表一个配置项，按 module + group 分组管理
 */
export const engineConfigRegistry = mysqlTable('engine_config_registry', {
  id: int('id').autoincrement().primaryKey(),
  /** 所属模块: orchestrator / causalGraph / experiencePool / physicsVerifier / feedbackLoop / custom */
  module: varchar('module', { length: 64 }).notNull(),
  /** 分组（模块内二级分类，如 routing / costGate / capacity / decay 等） */
  configGroup: varchar('config_group', { length: 64 }).notNull().default('general'),
  /** 配置键（唯一标识，如 fastPathConfidence, maxNodes 等） */
  configKey: varchar('config_key', { length: 128 }).notNull(),
  /** 配置值（JSON 字符串，支持 number/string/boolean/object） */
  configValue: text('config_value').notNull(),
  /** 值类型: number / string / boolean / json */
  valueType: mysqlEnum('value_type', ['number', 'string', 'boolean', 'json']).notNull().default('string'),
  /** 默认值（JSON 字符串） */
  defaultValue: text('default_value'),
  /** 配置项中文标签 */
  label: varchar('label', { length: 128 }).notNull(),
  /** 配置项描述 */
  description: text('description'),
  /** 单位（如 ms, %, 天, 次 等） */
  unit: varchar('unit', { length: 32 }),
  /** 取值范围（JSON: { min?: number, max?: number, step?: number, options?: string[] }） */
  constraints: json('constraints').$type<{
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  }>(),
  /** 排序权重（越小越靠前） */
  sortOrder: int('sort_order').notNull().default(100),
  /** 是否启用 */
  enabled: tinyint('enabled').notNull().default(1),
  /** 是否为系统内置（内置项不可删除，仅可修改值） */
  isBuiltin: tinyint('is_builtin').notNull().default(0),
  /** 变更影响评估分数 0-100 */
  impactScore: int('impact_score').default(0),
  /** 变更影响描述 */
  impactDescription: text('impact_description'),
  /** 语义化版本号 */
  configVersion: varchar('config_version', { length: 32 }).notNull().default('1.0.0'),
  /** 创建时间 */
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  /** 更新时间 */
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uk_module_key').on(table.module, table.configKey),
  index('idx_ecr_module').on(table.module),
  index('idx_ecr_group').on(table.module, table.configGroup),
  index('idx_ecr_enabled').on(table.enabled),
]);
export type EngineConfigRegistryRow = typeof engineConfigRegistry.$inferSelect;
export type InsertEngineConfigRegistry = typeof engineConfigRegistry.$inferInsert;

// ============================================================================
// Phase 3 v1.3 — 世界模型增强 / 数字孪生系统工程重建（5 张新表）
// ============================================================================

/**
 * 仿真场景表 — 存储 What-if 仿真场景定义
 *
 * 每个场景包含：
 *   - 目标设备 ID
 *   - 参数覆盖（JSON，覆盖设备默认物理参数）
 *   - 仿真配置（步数、蒙特卡洛运行次数、方法）
 *   - 场景状态（draft / running / completed / failed）
 *   - 乐观锁版本号
 */
export const simulationScenarios = mysqlTable('simulation_scenarios', {
  id: int('id').primaryKey().autoincrement(),
  /** 设备 ID（EQ-xxx 格式） */
  machineId: varchar('machine_id', { length: 64 }).notNull(),
  /** 场景名称 */
  name: varchar('name', { length: 256 }).notNull(),
  /** 场景描述 */
  description: text('description'),
  /** 场景类型: overload|thermal|degradation|resonance|typhoon|multi_factor|custom */
  scenarioType: varchar('scenario_type', { length: 30 }).notNull().default('custom'),
  /** 基准工况 ID */
  baselineConditionId: varchar('baseline_condition_id', { length: 100 }),
  /** 参数覆盖（JSON: Record<string, number>） */
  parameterOverrides: json('parameter_overrides').$type<Record<string, number>>(),
  /** 仿真步数 */
  horizonSteps: int('horizon_steps').notNull().default(30),
  /** 步长(秒) */
  stepIntervalSec: int('step_interval_sec').notNull().default(60),
  /** 是否启用蒙特卡洛 */
  enableMonteCarlo: boolean('enable_monte_carlo').notNull().default(false),
  /** 蒙特卡洛运行次数 */
  monteCarloRuns: int('monte_carlo_runs').notNull().default(50),
  /** 仿真方法 */
  method: varchar('method', { length: 32 }).notNull().default('sobol_qmc'),
  /** 场景状态 */
  status: mysqlEnum('status', ['draft', 'queued', 'running', 'completed', 'failed']).notNull().default('draft'),
  /** BullMQ 任务 ID */
  taskId: varchar('task_id', { length: 64 }),
  /** 乐观锁版本号 */
  version: int('version').notNull().default(1),
  /** 创建者 */
  createdBy: varchar('created_by', { length: 128 }),
  /** 创建时间 */
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  /** 更新时间 */
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ss_machine_id').on(table.machineId),
  index('idx_ss_status').on(table.status),
  index('idx_ss_scenario_type').on(table.scenarioType),
  index('idx_ss_created_at').on(table.createdAt),
]);
export type SimulationScenarioRow = typeof simulationScenarios.$inferSelect;
export type InsertSimulationScenario = typeof simulationScenarios.$inferInsert;

/**
 * 仿真结果表 — 存储仿真执行结果
 *
 * 每条结果包含：
 *   - 关联的场景 ID
 *   - 均值/P5/P50/P95 轨迹（JSON 数组）
 *   - 风险评估（低/中/高/严重）
 *   - 执行耗时
 *   - 各维度标准差
 */
export const simulationResults = mysqlTable('simulation_results', {
  id: int('id').primaryKey().autoincrement(),
  /** 关联的仿真场景 ID */
  scenarioId: int('scenario_id').notNull(),
  /** 设备 ID */
  machineId: varchar('machine_id', { length: 64 }).notNull(),
  /** 时序轨迹 Array<{step, timestamp, stateVector, anomalies}> */
  timeline: json('timeline').$type<Array<{ step: number; timestamp: number; stateVector: Record<string, number>; anomalies?: string[] }>>(),
  /** 风险评估 JSON */
  riskAssessment: json('risk_assessment').$type<{ overallRisk: string; factors: Array<{ name: string; score: number; trend: string }> }>(),
  /** 蒙特卡洛结果（如启用） */
  monteCarloResult: json('monte_carlo_result').$type<{ p5: number[]; p50: number[]; p95: number[]; mean: number[]; stdDev: number[] }>(),
  /** 均值轨迹（JSON: StateVector[]） */
  meanTrajectory: json('mean_trajectory').$type<Array<{ timestamp: number; values: Record<string, number> }>>(),
  /** P5 下界轨迹 */
  p5Trajectory: json('p5_trajectory').$type<Array<{ timestamp: number; values: Record<string, number> }>>(),
  /** P50 中位数轨迹 */
  p50Trajectory: json('p50_trajectory').$type<Array<{ timestamp: number; values: Record<string, number> }>>(),
  /** P95 上界轨迹 */
  p95Trajectory: json('p95_trajectory').$type<Array<{ timestamp: number; values: Record<string, number> }>>(),
  /** 各维度标准差（JSON: Record<string, number[]>） */
  stdDevByDimension: json('std_dev_by_dimension').$type<Record<string, number[]>>(),
  /** 风险等级 */
  riskLevel: mysqlEnum('risk_level', ['low', 'medium', 'high', 'critical']).notNull().default('low'),
  /** 蒙特卡洛运行次数 */
  monteCarloRuns: int('monte_carlo_runs').notNull(),
  /** 序列类型 */
  sequenceType: varchar('sequence_type', { length: 32 }).notNull().default('sobol'),
  /** 执行耗时 (ms) */
  durationMs: int('duration_ms').notNull(),
  /** AI 增强解释（Grok 生成） */
  aiExplanation: text('ai_explanation'),
  /** Grok 润色的中文报告 */
  grokReport: text('grok_report'),
  /** AI 维护建议（Grok 生成） */
  aiMaintenanceAdvice: text('ai_maintenance_advice'),
  /** 建议动作 string[] */
  warnings: json('warnings').$type<string[]>(),
  /** 乐观锁版本号 */
  version: int('version').notNull().default(1),
  /** 完成时间 */
  completedAt: timestamp('completed_at', { fsp: 3 }),
  /** 创建时间 */
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_sr_scenario_id').on(table.scenarioId),
  index('idx_sr_machine_id').on(table.machineId),
  index('idx_sr_risk_level').on(table.riskLevel),
  index('idx_sr_created_at').on(table.createdAt),
]);
export type SimulationResultRow = typeof simulationResults.$inferSelect;
export type InsertSimulationResult = typeof simulationResults.$inferInsert;

/**
 * 孪生同步日志表 — 记录 StateSyncEngine 的同步事件
 *
 * 用于：
 *   - 同步延迟监控
 *   - CDC/轮询模式切换审计
 *   - 降级事件追踪
 */
export const twinSyncLogs = mysqlTable('twin_sync_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  /** 设备 ID */
  machineId: varchar('machine_id', { length: 64 }).notNull(),
  /** 同步模式 */
  syncMode: mysqlEnum('sync_mode', ['cdc', 'polling']).notNull(),
  /** 同步类型: telemetry_ingest|snapshot_persist|config_update */
  syncType: varchar('sync_type', { length: 30 }),
  /** 事件类型 */
  eventType: varchar('event_type', { length: 64 }).notNull(),
  /** 同步延迟 (ms) */
  latencyMs: int('latency_ms'),
  /** 同步的传感器数量 */
  sensorCount: int('sensor_count'),
  /** 同步耗时 (ms) */
  durationMs: int('duration_ms'),
  /** 状态向量快照（JSON） */
  stateSnapshot: json('state_snapshot').$type<Record<string, number>>(),
  /** 健康指数 */
  healthIndex: double('health_index'),
  /** 额外元数据 */
  metadata: json('metadata').$type<Record<string, unknown>>(),
  /** 错误信息 */
  errorMessage: text('error_message'),
  /** 乐观锁版本号 */
  version: int('version').notNull().default(1),
  /** 创建时间 */
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_tsl_machine_id').on(table.machineId),
  index('idx_tsl_sync_mode').on(table.syncMode),
  index('idx_tsl_event_type').on(table.eventType),
  index('idx_tsl_created_at').on(table.createdAt),
]);
export type TwinSyncLogRow = typeof twinSyncLogs.$inferSelect;
export type InsertTwinSyncLog = typeof twinSyncLogs.$inferInsert;

/**
 * 孪生事件表 — TwinEventBus 事件持久化
 *
 * 用于：
 *   - 事件审计追踪
 *   - 事件回放
 *   - 跨节点事件同步的持久化备份
 */
export const twinEvents = mysqlTable('twin_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  /** 事件唯一 ID（UUID） */
  eventId: varchar('event_id', { length: 36 }).notNull(),
  /** 设备 ID */
  machineId: varchar('machine_id', { length: 64 }).notNull(),
  /** 事件类型 */
  eventType: varchar('event_type', { length: 64 }).notNull(),
  /** 事件载荷（JSON） */
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  /** 发布节点 ID */
  sourceNode: varchar('source_node', { length: 128 }).notNull(),
  /** 事件版本 */
  version: int('version').notNull().default(1),
  /** 事件时间戳 */
  eventTimestamp: timestamp('event_timestamp', { fsp: 3 }).notNull(),
  /** 入库时间 */
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uk_te_event_id').on(table.eventId),
  index('idx_te_machine_id').on(table.machineId),
  index('idx_te_event_type').on(table.eventType),
  index('idx_te_event_timestamp').on(table.eventTimestamp),
  index('idx_te_created_at').on(table.createdAt),
]);
export type TwinEventRow = typeof twinEvents.$inferSelect;
export type InsertTwinEvent = typeof twinEvents.$inferInsert;

/**
 * Outbox 表 — Outbox Pattern 事务性事件发布
 *
 * ADR-007: 保证业务数据写入与事件发布的最终一致性
 *
 * 流程：
 *   1. 业务事务内 INSERT (status='pending')
 *   2. OutboxRelay Worker 轮询 pending 记录
 *   3. 通过 TwinEventBus 发布后 UPDATE status='sent'
 *   4. 超过 maxRetries → status='dead_letter'
 */
export const twinOutbox = mysqlTable('twin_outbox', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  /** 聚合根类型（如 'simulation', 'prediction', 'sync'） */
  aggregateType: varchar('aggregate_type', { length: 64 }).notNull(),
  /** 聚合根 ID */
  aggregateId: varchar('aggregate_id', { length: 128 }).notNull(),
  /** 事件类型 */
  eventType: varchar('event_type', { length: 64 }).notNull(),
  /** 事件载荷（JSON） */
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  /** 发送状态 */
  status: mysqlEnum('status', ['pending', 'sent', 'dead_letter']).notNull().default('pending'),
  /** 重试次数 */
  retryCount: int('retry_count').notNull().default(0),
  /** 是否已处理 */
  processed: boolean('processed').notNull().default(false),
  /** 处理时间 */
  processedAt: timestamp('processed_at', { fsp: 3 }),
  /** 创建时间 */
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  /** 发送时间 */
  sentAt: timestamp('sent_at', { fsp: 3 }),
}, (table) => [
  index('idx_to_status').on(table.status),
  index('idx_to_aggregate').on(table.aggregateType, table.aggregateId),
  index('idx_to_event_type').on(table.eventType),
  index('idx_to_created_at').on(table.createdAt),
  index('idx_outbox_unprocessed').on(table.processed, table.createdAt),
]);
export type TwinOutboxRow = typeof twinOutbox.$inferSelect;
export type InsertTwinOutbox = typeof twinOutbox.$inferInsert;


// ============================================================================
// Phase 3 v3.0 — 数字孪生赋能工具配置平台（4 张新表）
// ============================================================================

/**
 * 层级熔断开关 — 7 层架构的全局启停控制
 */
export const twinLayerSwitches = mysqlTable('twin_layer_switches', {
  id: int('id').autoincrement().primaryKey(),
  layerId: varchar('layer_id', { length: 16 }).notNull(),
  layerName: varchar('layer_name', { length: 64 }).notNull(),
  enabled: tinyint('enabled').notNull().default(1),
  priority: int('priority').notNull().default(0),
  description: text('description'),
  updatedBy: varchar('updated_by', { length: 64 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uk_tls_layer').on(table.layerId),
]);
export type TwinLayerSwitchRow = typeof twinLayerSwitches.$inferSelect;
export type InsertTwinLayerSwitch = typeof twinLayerSwitches.$inferInsert;

/**
 * 配置审计日志 — 记录所有配置变更
 */
export const twinConfigAuditLog = mysqlTable('twin_config_audit_log', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  userName: varchar('user_name', { length: 128 }),
  module: varchar('module', { length: 64 }).notNull(),
  configKey: varchar('config_key', { length: 128 }).notNull(),
  action: mysqlEnum('action', ['create', 'update', 'delete', 'rollback', 'batch_update', 'simulate']).notNull(),
  oldValue: json('old_value'),
  newValue: json('new_value'),
  oldVersion: varchar('old_version', { length: 32 }),
  newVersion: varchar('new_version', { length: 32 }),
  impactScore: int('impact_score').default(0),
  reason: text('reason'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_tcal_user').on(table.userId),
  index('idx_tcal_module').on(table.module),
  index('idx_tcal_key').on(table.configKey),
  index('idx_tcal_action').on(table.action),
  index('idx_tcal_time').on(table.createdAt),
]);
export type TwinConfigAuditLogRow = typeof twinConfigAuditLog.$inferSelect;
export type InsertTwinConfigAuditLog = typeof twinConfigAuditLog.$inferInsert;

/**
 * 配置快照 — 定期/手动快照，支持一键回滚
 */
export const twinConfigSnapshot = mysqlTable('twin_config_snapshot', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  snapshotType: mysqlEnum('snapshot_type', ['auto', 'manual', 'pre_rollback']).notNull().default('auto'),
  snapshotName: varchar('snapshot_name', { length: 256 }),
  layerId: varchar('layer_id', { length: 16 }),
  module: varchar('module', { length: 64 }),
  configData: json('config_data').notNull(),
  layerSwitches: json('layer_switches'),
  checksum: varchar('checksum', { length: 64 }),
  createdBy: varchar('created_by', { length: 64 }).notNull().default('system'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { fsp: 3 }),
}, (table) => [
  index('idx_tcs_type').on(table.snapshotType),
  index('idx_tcs_layer').on(table.layerId),
  index('idx_tcs_module').on(table.module),
  index('idx_tcs_time').on(table.createdAt),
  index('idx_tcs_expires').on(table.expiresAt),
]);
export type TwinConfigSnapshotRow = typeof twinConfigSnapshot.$inferSelect;
export type InsertTwinConfigSnapshot = typeof twinConfigSnapshot.$inferInsert;

/**
 * 配置仿真运行记录 — 记录 simulateConfig 的执行结果
 */
export const twinConfigSimulationRuns = mysqlTable('twin_config_simulation_runs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  module: varchar('module', { length: 64 }).notNull(),
  tempConfig: json('temp_config').notNull(),
  baselineConfig: json('baseline_config').notNull(),
  result: json('result'),
  status: mysqlEnum('status', ['running', 'completed', 'failed']).notNull().default('running'),
  durationMs: int('duration_ms'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
}, (table) => [
  index('idx_tcsr_user').on(table.userId),
  index('idx_tcsr_module').on(table.module),
  index('idx_tcsr_status').on(table.status),
]);
export type TwinConfigSimulationRunRow = typeof twinConfigSimulationRuns.$inferSelect;
export type InsertTwinConfigSimulationRun = typeof twinConfigSimulationRuns.$inferInsert;

// ============================================================================
// Phase 4 新增表（3 张）
// ============================================================================

/**
 * 护栏效果评估日志 — 批处理任务每日写入，按规则聚合触发统计
 */
export const guardrailEffectivenessLogs = mysqlTable('guardrail_effectiveness_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  ruleId: bigint('rule_id', { mode: 'number' }).notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  totalTriggers: int('total_triggers').notNull().default(0),
  truePositives: int('true_positives').notNull().default(0),
  falsePositives: int('false_positives').notNull().default(0),
  avgSeverity: double('avg_severity'),
  computedAt: timestamp('computed_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_gel_rule').on(table.ruleId),
  index('idx_gel_period').on(table.periodStart, table.periodEnd),
]);
export type GuardrailEffectivenessLog = typeof guardrailEffectivenessLogs.$inferSelect;
export type InsertGuardrailEffectivenessLog = typeof guardrailEffectivenessLogs.$inferInsert;

/**
 * 结晶应用追踪 — 记录每次结晶被应用的场景、上下文和效果
 */
export const crystalApplications = mysqlTable('crystal_applications', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  crystalId: bigint('crystal_id', { mode: 'number' }).notNull(),
  appliedIn: varchar('applied_in', { length: 50 }).notNull(),
  contextSummary: text('context_summary'),
  outcome: mysqlEnum('outcome', ['positive', 'negative', 'neutral']),
  appliedAt: timestamp('applied_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ca_crystal').on(table.crystalId),
  index('idx_ca_time').on(table.appliedAt),
]);
export type CrystalApplication = typeof crystalApplications.$inferSelect;
export type InsertCrystalApplication = typeof crystalApplications.$inferInsert;

/**
 * 结晶迁移追踪 — 记录跨工况迁移的源、目标、适配调整和结果
 * ON DELETE 策略：crystal_id RESTRICT（源结晶不可删除），new_crystal_id SET NULL（保留迁移记录）
 */
export const crystalMigrations = mysqlTable('crystal_migrations', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  crystalId: bigint('crystal_id', { mode: 'number' }).notNull(),
  fromProfile: varchar('from_profile', { length: 100 }).notNull(),
  toProfile: varchar('to_profile', { length: 100 }).notNull(),
  adaptations: json('adaptations').$type<Array<{
    field: string;
    originalValue: unknown;
    adaptedValue: unknown;
    reason: string;
  }>>().notNull(),
  newCrystalId: bigint('new_crystal_id', { mode: 'number' }),
  status: mysqlEnum('status', ['pending', 'success', 'failed']).notNull().default('pending'),
  migratedAt: timestamp('migrated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cm_crystal').on(table.crystalId),
]);
export type CrystalMigration = typeof crystalMigrations.$inferSelect;
export type InsertCrystalMigration = typeof crystalMigrations.$inferInsert;

// ============================================================================
// ⑦ 进化闭环 v2.0 新增表（7 张）
// ============================================================================

/**
 * 飞轮步骤日志 — 每步执行详情追溯
 */
export const evolutionStepLogs = mysqlTable('evolution_step_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  cycleId: bigint('cycle_id', { mode: 'number' }).notNull(),
  stepNumber: tinyint('step_number').notNull(),
  stepName: varchar('step_name', { length: 50 }).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'skipped']).notNull().default('pending'),
  startedAt: timestamp('started_at', { fsp: 3 }),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  durationMs: int('duration_ms'),
  inputSummary: json('input_summary').$type<Record<string, unknown>>(),
  outputSummary: json('output_summary').$type<Record<string, unknown>>(),
  metrics: json('metrics').$type<Record<string, number>>(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_esl_cycle').on(table.cycleId),
  index('idx_esl_step').on(table.stepNumber),
  index('idx_esl_status').on(table.status),
]);
export type EvolutionStepLog = typeof evolutionStepLogs.$inferSelect;
export type InsertEvolutionStepLog = typeof evolutionStepLogs.$inferInsert;

/**
 * 金丝雀部署阶段记录 — 5 阶段渐进部署追溯
 */
export const canaryDeploymentStages = mysqlTable('canary_deployment_stages', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  deploymentId: bigint('deployment_id', { mode: 'number' }).notNull(),
  stageIndex: tinyint('stage_index').notNull(),
  stageName: varchar('stage_name', { length: 20 }).notNull(),
  trafficPercent: double('traffic_percent').notNull(),
  rollbackThresholdPct: double('rollback_threshold_pct').notNull(),
  durationHours: int('duration_hours').notNull(),
  status: mysqlEnum('status', ['pending', 'active', 'completed', 'rolled_back', 'skipped']).notNull().default('pending'),
  startedAt: timestamp('started_at', { fsp: 3 }),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  metricsSnapshot: json('metrics_snapshot').$type<Record<string, number>>(),
  rollbackReason: text('rollback_reason'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cds_deployment').on(table.deploymentId),
  index('idx_cds_stage').on(table.stageName),
  index('idx_cds_status').on(table.status),
]);
export type CanaryDeploymentStage = typeof canaryDeploymentStages.$inferSelect;
export type InsertCanaryDeploymentStage = typeof canaryDeploymentStages.$inferInsert;

/**
 * 金丝雀健康检查记录 — 支持连续失败自动回滚
 */
export const canaryHealthChecks = mysqlTable('canary_health_checks', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  deploymentId: bigint('deployment_id', { mode: 'number' }).notNull(),
  stageId: bigint('stage_id', { mode: 'number' }),
  checkType: mysqlEnum('check_type', ['periodic', 'manual', 'threshold_breach']).notNull().default('periodic'),
  championMetrics: json('champion_metrics').$type<Record<string, number>>().notNull(),
  challengerMetrics: json('challenger_metrics').$type<Record<string, number>>().notNull(),
  passed: tinyint('passed').notNull().default(1),
  failureReason: text('failure_reason'),
  consecutiveFails: int('consecutive_fails').notNull().default(0),
  checkedAt: timestamp('checked_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_chc_deployment').on(table.deploymentId),
  index('idx_chc_stage').on(table.stageId),
  index('idx_chc_passed').on(table.passed),
  index('idx_chc_time').on(table.checkedAt),
]);
export type CanaryHealthCheck = typeof canaryHealthChecks.$inferSelect;
export type InsertCanaryHealthCheck = typeof canaryHealthChecks.$inferInsert;

/**
 * FSD 干预记录 — Shadow Fleet 全流量镜像分歧采集
 */
export const evolutionInterventions = mysqlTable('evolution_interventions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  modelId: varchar('model_id', { length: 100 }).notNull(),
  divergenceScore: double('divergence_score').notNull(),
  isIntervention: tinyint('is_intervention').notNull().default(0),
  interventionType: mysqlEnum('intervention_type', ['decision_diverge', 'threshold_breach', 'safety_override', 'manual']).notNull().default('decision_diverge'),
  requestData: json('request_data').$type<Record<string, unknown>>().notNull(),
  humanDecision: json('human_decision').$type<Record<string, unknown>>().notNull(),
  shadowDecision: json('shadow_decision').$type<Record<string, unknown>>().notNull(),
  contextSnapshot: json('context_snapshot').$type<Record<string, unknown>>(),
  autoLabel: json('auto_label').$type<Record<string, unknown>>(),
  labelConfidence: double('label_confidence'),
  difficultyScore: double('difficulty_score'),
  videoClipUrl: varchar('video_clip_url', { length: 500 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_ei_session').on(table.sessionId),
  index('idx_ei_model').on(table.modelId),
  index('idx_ei_intervention').on(table.isIntervention),
  index('idx_ei_type').on(table.interventionType),
  index('idx_ei_divergence').on(table.divergenceScore),
  index('idx_ei_difficulty').on(table.difficultyScore),
  index('idx_ei_time').on(table.createdAt),
]);
export type EvolutionIntervention = typeof evolutionInterventions.$inferSelect;
export type InsertEvolutionIntervention = typeof evolutionInterventions.$inferInsert;

/**
 * 高保真仿真场景库 — 自动从干预记录生成
 */
export const evolutionSimulations = mysqlTable('evolution_simulations', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  scenarioId: varchar('scenario_id', { length: 64 }).notNull(),
  sourceInterventionId: bigint('source_intervention_id', { mode: 'number' }),
  scenarioType: mysqlEnum('scenario_type', ['regression', 'stress', 'edge_case', 'adversarial', 'replay']).notNull().default('regression'),
  inputData: json('input_data').$type<Record<string, unknown>>().notNull(),
  expectedOutput: json('expected_output').$type<Record<string, unknown>>().notNull(),
  variations: json('variations').$type<Array<Record<string, unknown>>>(),
  variationCount: int('variation_count').notNull().default(0),
  fidelityScore: double('fidelity_score'),
  difficulty: mysqlEnum('difficulty', ['easy', 'medium', 'hard', 'extreme']).notNull().default('medium'),
  tags: json('tags').$type<string[]>(),
  lastRunModelId: varchar('last_run_model_id', { length: 100 }),
  lastRunPassed: tinyint('last_run_passed'),
  lastRunAt: timestamp('last_run_at', { fsp: 3 }),
  runCount: int('run_count').notNull().default(0),
  passCount: int('pass_count').notNull().default(0),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_es_scenario').on(table.scenarioId),
  index('idx_es_source').on(table.sourceInterventionId),
  index('idx_es_type').on(table.scenarioType),
  index('idx_es_difficulty').on(table.difficulty),
  index('idx_es_fidelity').on(table.fidelityScore),
]);
export type EvolutionSimulation = typeof evolutionSimulations.$inferSelect;
export type InsertEvolutionSimulation = typeof evolutionSimulations.$inferInsert;

/**
 * 视频/多模态轨迹 — FSD 干预回放 + KG 节点
 */
export const evolutionVideoTrajectories = mysqlTable('evolution_video_trajectories', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  trajectoryId: varchar('trajectory_id', { length: 64 }).notNull(),
  interventionId: bigint('intervention_id', { mode: 'number' }),
  sessionId: varchar('session_id', { length: 64 }),
  videoUrl: varchar('video_url', { length: 500 }).notNull(),
  durationMs: int('duration_ms').notNull(),
  frameCount: int('frame_count'),
  embeddingVector: json('embedding_vector').$type<number[]>(),
  temporalRelations: json('temporal_relations').$type<Array<{ from: string; to: string; relation: string }>>(),
  keyFrames: json('key_frames').$type<Array<{ timestamp: number; description: string; thumbnailUrl: string }>>(),
  sensorData: json('sensor_data').$type<Record<string, unknown>>(),
  annotations: json('annotations').$type<Record<string, unknown>>(),
  kgNodeId: varchar('kg_node_id', { length: 100 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_evt_trajectory').on(table.trajectoryId),
  index('idx_evt_intervention').on(table.interventionId),
  index('idx_evt_session').on(table.sessionId),
  index('idx_evt_kg').on(table.kgNodeId),
  index('idx_evt_time').on(table.createdAt),
]);
export type EvolutionVideoTrajectory = typeof evolutionVideoTrajectories.$inferSelect;
export type InsertEvolutionVideoTrajectory = typeof evolutionVideoTrajectories.$inferInsert;

/**
 * 飞轮调度配置 — 定时自动触发进化周期
 */
export const evolutionFlywheelSchedules = mysqlTable('evolution_flywheel_schedules', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
  enabled: tinyint('enabled').notNull().default(1),
  config: json('config').$type<Record<string, unknown>>().notNull(),
  maxConcurrent: int('max_concurrent').notNull().default(1),
  minIntervalHours: int('min_interval_hours').notNull().default(24),
  lastTriggeredAt: timestamp('last_triggered_at', { fsp: 3 }),
  nextTriggerAt: timestamp('next_trigger_at', { fsp: 3 }),
  totalRuns: int('total_runs').notNull().default(0),
  consecutiveFails: int('consecutive_fails').notNull().default(0),
  maxConsecutiveFails: int('max_consecutive_fails').notNull().default(3),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_efs_enabled').on(table.enabled),
  index('idx_efs_next').on(table.nextTriggerAt),
]);
export type EvolutionFlywheelSchedule = typeof evolutionFlywheelSchedules.$inferSelect;
export type InsertEvolutionFlywheelSchedule = typeof evolutionFlywheelSchedules.$inferInsert;

// ============================================================================
// v3.0 生产级扩展 — 审计日志 + Dojo 训练任务
// ============================================================================

/**
 * evolution_audit_logs — 进化事件审计日志
 * EventBus 订阅端持久化，记录所有进化事件用于追溯和合规
 */
export const evolutionAuditLogs = mysqlTable('evolution_audit_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  eventSource: varchar('event_source', { length: 128 }).notNull(),
  eventData: json('event_data').$type<Record<string, unknown>>(),
  sessionId: varchar('session_id', { length: 128 }),
  modelId: varchar('model_id', { length: 128 }),
  severity: mysqlEnum('severity', ['info', 'warn', 'error', 'critical']).default('info'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_eal_type').on(table.eventType),
  index('idx_eal_source').on(table.eventSource),
  index('idx_eal_time').on(table.createdAt),
  index('idx_eal_session').on(table.sessionId),
]);
export type EvolutionAuditLog = typeof evolutionAuditLogs.$inferSelect;
export type InsertEvolutionAuditLog = typeof evolutionAuditLogs.$inferInsert;

/**
 * dojo_training_jobs — Dojo 训练任务持久化
 * 替代纯内存任务队列，支持重启恢复和状态追踪
 */
export const dojoTrainingJobs = mysqlTable('dojo_training_jobs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  jobId: varchar('job_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  modelId: varchar('model_id', { length: 128 }).notNull(),
  status: mysqlEnum('status', ['pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled']).default('pending'),
  priority: int('priority').default(5),
  gpuCount: int('gpu_count').default(8),
  useSpot: tinyint('use_spot').default(1),
  estimatedDurationMs: bigint('estimated_duration_ms', { mode: 'number' }),
  scheduledAt: timestamp('scheduled_at', { fsp: 3 }),
  startedAt: timestamp('started_at', { fsp: 3 }),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  carbonWindow: json('carbon_window').$type<Record<string, unknown>>(),
  config: json('config').$type<Record<string, unknown>>(),
  result: json('result').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  retryCount: int('retry_count').default(0),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_dtj_job').on(table.jobId),
  uniqueIndex('uq_dtj_idempotency').on(table.idempotencyKey),
  index('idx_dtj_status').on(table.status),
  index('idx_dtj_model').on(table.modelId),
  index('idx_dtj_scheduled').on(table.scheduledAt),
  index('idx_dtj_priority').on(table.priority),
]);
export type DojoTrainingJob = typeof dojoTrainingJobs.$inferSelect;
export type InsertDojoTrainingJob = typeof dojoTrainingJobs.$inferInsert;

// ============================================================================
// Phase 3: 可观测性增强 — 5 张新表
// ============================================================================

/**
 * evolution_traces — 全链路追踪记录
 * 每条 trace 代表一次完整的进化操作（周期、评估、部署等）
 */
export const evolutionTraces = mysqlTable('evolution_traces', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  cycleId: bigint('cycle_id', { mode: 'number' }),
  operationType: varchar('operation_type', { length: 64 }).notNull(),
  status: mysqlEnum('status', ['running', 'completed', 'failed', 'timeout']).default('running'),
  startedAt: timestamp('started_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  durationMs: bigint('duration_ms', { mode: 'number' }),
  spanCount: int('span_count').default(0),
  errorCount: int('error_count').default(0),
  criticalPathMs: bigint('critical_path_ms', { mode: 'number' }),
  trigger: varchar('trigger', { length: 64 }).default('manual'),
  metadata: json('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_et_trace').on(table.traceId),
  index('idx_et_cycle').on(table.cycleId),
  index('idx_et_type').on(table.operationType),
  index('idx_et_status').on(table.status),
  index('idx_et_started').on(table.startedAt),
]);
export type EvolutionTrace = typeof evolutionTraces.$inferSelect;
export type InsertEvolutionTrace = typeof evolutionTraces.$inferInsert;

/**
 * evolution_spans — 追踪 Span（追踪中的每个步骤/操作）
 */
export const evolutionSpans = mysqlTable('evolution_spans', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  spanId: varchar('span_id', { length: 64 }).notNull(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  parentSpanId: varchar('parent_span_id', { length: 64 }),
  name: varchar('name', { length: 256 }).notNull(),
  engineModule: varchar('engine_module', { length: 64 }).notNull(),
  status: mysqlEnum('status', ['running', 'completed', 'failed', 'timeout']).default('running'),
  startedAt: timestamp('started_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
  durationMs: bigint('duration_ms', { mode: 'number' }),
  inputSummary: json('input_summary').$type<Record<string, unknown>>(),
  outputSummary: json('output_summary').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  resourceUsage: json('resource_usage').$type<{ cpuMs?: number; memoryMb?: number; gpuMs?: number; dbQueries?: number }>(),
  tags: json('tags').$type<Record<string, string>>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_es_span').on(table.spanId),
  index('idx_es_trace').on(table.traceId),
  index('idx_es_parent').on(table.parentSpanId),
  index('idx_es_module').on(table.engineModule),
  index('idx_es_status').on(table.status),
  index('idx_es_started').on(table.startedAt),
]);
export type EvolutionSpan = typeof evolutionSpans.$inferSelect;
export type InsertEvolutionSpan = typeof evolutionSpans.$inferInsert;

/**
 * evolution_metric_snapshots — 性能指标快照（定期采集）
 */
export const evolutionMetricSnapshots = mysqlTable('evolution_metric_snapshots', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  metricName: varchar('metric_name', { length: 128 }).notNull(),
  engineModule: varchar('engine_module', { length: 64 }).notNull(),
  metricType: mysqlEnum('metric_type', ['counter', 'gauge', 'histogram', 'summary']).notNull(),
  value: double('value').notNull(),
  aggregations: json('aggregations').$type<{ min?: number; max?: number; avg?: number; sum?: number; count?: number; p50?: number; p95?: number; p99?: number }>(),
  tags: json('tags').$type<Record<string, string>>(),
  collectedAt: timestamp('collected_at', { fsp: 3 }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ems_name').on(table.metricName),
  index('idx_ems_module').on(table.engineModule),
  index('idx_ems_type').on(table.metricType),
  index('idx_ems_collected').on(table.collectedAt),
]);
export type EvolutionMetricSnapshot = typeof evolutionMetricSnapshots.$inferSelect;
export type InsertEvolutionMetricSnapshot = typeof evolutionMetricSnapshots.$inferInsert;

/**
 * evolution_alert_rules — 告警规则定义
 */
export const evolutionAlertRules = mysqlTable('evolution_alert_rules', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  engineModule: varchar('engine_module', { length: 64 }).notNull(),
  metricName: varchar('metric_name', { length: 128 }).notNull(),
  operator: mysqlEnum('operator', ['gt', 'gte', 'lt', 'lte', 'eq', 'neq']).notNull(),
  threshold: double('threshold').notNull(),
  severity: mysqlEnum('severity', ['info', 'warning', 'critical', 'fatal']).default('warning'),
  durationSeconds: int('duration_seconds').default(60),
  cooldownSeconds: int('cooldown_seconds').default(300),
  notifyChannels: json('notify_channels').$type<string[]>(),
  enabled: tinyint('enabled').default(1),
  lastTriggeredAt: timestamp('last_triggered_at', { fsp: 3 }),
  triggerCount: int('trigger_count').default(0),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ear_module').on(table.engineModule),
  index('idx_ear_metric').on(table.metricName),
  index('idx_ear_severity').on(table.severity),
  index('idx_ear_enabled').on(table.enabled),
]);
export type EvolutionAlertRule = typeof evolutionAlertRules.$inferSelect;
export type InsertEvolutionAlertRule = typeof evolutionAlertRules.$inferInsert;

/**
 * evolution_alerts — 告警事件记录
 */
export const evolutionAlerts = mysqlTable('evolution_alerts', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  ruleId: bigint('rule_id', { mode: 'number' }).notNull(),
  alertName: varchar('alert_name', { length: 256 }).notNull(),
  engineModule: varchar('engine_module', { length: 64 }).notNull(),
  severity: mysqlEnum('severity', ['info', 'warning', 'critical', 'fatal']).default('warning'),
  metricValue: double('metric_value').notNull(),
  threshold: double('threshold').notNull(),
  status: mysqlEnum('status', ['firing', 'acknowledged', 'resolved', 'silenced']).default('firing'),
  message: text('message'),
  acknowledgedBy: varchar('acknowledged_by', { length: 128 }),
  acknowledgedAt: timestamp('acknowledged_at', { fsp: 3 }),
  resolvedAt: timestamp('resolved_at', { fsp: 3 }),
  metadata: json('metadata').$type<Record<string, unknown>>(),
  firedAt: timestamp('fired_at', { fsp: 3 }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_ea_rule').on(table.ruleId),
  index('idx_ea_module').on(table.engineModule),
  index('idx_ea_severity').on(table.severity),
  index('idx_ea_status').on(table.status),
  index('idx_ea_fired').on(table.firedAt),
]);
export type EvolutionAlert = typeof evolutionAlerts.$inferSelect;
export type InsertEvolutionAlert = typeof evolutionAlerts.$inferInsert;


// ============================================================================
// Phase 4: 自愈与自优化闭环 — 6 张新表
// ============================================================================

/** 自愈策略配置 */
export const evolutionSelfHealingPolicies = mysqlTable('evolution_self_healing_policies', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  policyType: mysqlEnum('policy_type', ['auto_rollback', 'param_tuning', 'codegen', 'circuit_breaker']).notNull(),
  triggerCondition: json('trigger_condition').$type<{
    metricName: string;
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
    threshold: number;
    durationSeconds: number;
    engineModule?: string;
  }>().notNull(),
  action: json('action').$type<{ type: string; params: Record<string, unknown> }>().notNull(),
  engineModule: varchar('engine_module', { length: 128 }),
  enabled: tinyint('enabled').default(1).notNull(),
  priority: int('priority').default(0).notNull(),
  cooldownSeconds: int('cooldown_seconds').default(600).notNull(),
  maxConsecutiveExecutions: int('max_consecutive_executions').default(3).notNull(),
  totalExecutions: int('total_executions').default(0).notNull(),
  lastExecutedAt: timestamp('last_executed_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_shp_type').on(table.policyType),
  index('idx_shp_module').on(table.engineModule),
  index('idx_shp_enabled').on(table.enabled),
]);
export type EvolutionSelfHealingPolicy = typeof evolutionSelfHealingPolicies.$inferSelect;
export type InsertEvolutionSelfHealingPolicy = typeof evolutionSelfHealingPolicies.$inferInsert;

/** 自愈执行日志 */
export const evolutionSelfHealingLogs = mysqlTable('evolution_self_healing_logs', {
  id: int('id').primaryKey().autoincrement(),
  policyId: int('policy_id').notNull(),
  policyName: varchar('policy_name', { length: 256 }).notNull(),
  policyType: mysqlEnum('policy_type', ['auto_rollback', 'param_tuning', 'codegen', 'circuit_breaker']).notNull(),
  triggerReason: text('trigger_reason').notNull(),
  triggerMetricValue: double('trigger_metric_value'),
  status: mysqlEnum('status', ['pending', 'executing', 'success', 'failed', 'skipped']).default('pending').notNull(),
  result: json('result').$type<Record<string, unknown>>(),
  affectedModules: json('affected_modules').$type<string[]>(),
  beforeSnapshot: json('before_snapshot').$type<Record<string, unknown>>(),
  afterSnapshot: json('after_snapshot').$type<Record<string, unknown>>(),
  durationMs: int('duration_ms'),
  errorMessage: text('error_message'),
  executedAt: timestamp('executed_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
}, (table) => [
  index('idx_shl_policy').on(table.policyId),
  index('idx_shl_type').on(table.policyType),
  index('idx_shl_status').on(table.status),
  index('idx_shl_executed').on(table.executedAt),
]);
export type EvolutionSelfHealingLog = typeof evolutionSelfHealingLogs.$inferSelect;
export type InsertEvolutionSelfHealingLog = typeof evolutionSelfHealingLogs.$inferInsert;

/** 全链路回滚记录 */
export const evolutionRollbackRecords = mysqlTable('evolution_rollback_records', {
  id: int('id').primaryKey().autoincrement(),
  rollbackType: mysqlEnum('rollback_type', ['deployment', 'model', 'config', 'full_chain']).notNull(),
  trigger: mysqlEnum('trigger_mode', ['auto', 'manual', 'policy']).default('manual').notNull(),
  policyId: int('policy_id'),
  deploymentId: int('deployment_id'),
  modelVersion: varchar('model_version', { length: 128 }),
  reason: text('reason').notNull(),
  fromState: json('from_state').$type<Record<string, unknown>>().notNull(),
  toState: json('to_state').$type<Record<string, unknown>>().notNull(),
  affectedModules: json('affected_modules').$type<string[]>(),
  status: mysqlEnum('status', ['pending', 'executing', 'completed', 'failed', 'cancelled']).default('pending').notNull(),
  durationMs: int('duration_ms'),
  verificationResult: json('verification_result').$type<{
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; message: string }>;
  }>(),
  executedBy: varchar('executed_by', { length: 128 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
}, (table) => [
  index('idx_rr_type').on(table.rollbackType),
  index('idx_rr_trigger').on(table.trigger),
  index('idx_rr_status').on(table.status),
  index('idx_rr_created').on(table.createdAt),
]);
export type EvolutionRollbackRecord = typeof evolutionRollbackRecords.$inferSelect;
export type InsertEvolutionRollbackRecord = typeof evolutionRollbackRecords.$inferInsert;

/** 参数自调优任务 */
export const evolutionParamTuningJobs = mysqlTable('evolution_param_tuning_jobs', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 256 }).notNull(),
  engineModule: varchar('engine_module', { length: 128 }).notNull(),
  searchStrategy: mysqlEnum('search_strategy', ['bayesian', 'grid', 'random', 'evolutionary']).default('bayesian').notNull(),
  objectiveMetric: varchar('objective_metric', { length: 256 }).notNull(),
  objectiveDirection: mysqlEnum('objective_direction', ['maximize', 'minimize']).default('maximize').notNull(),
  searchSpace: json('search_space').$type<Array<{
    name: string; type: 'float' | 'int' | 'categorical';
    min?: number; max?: number; step?: number; choices?: (string | number)[];
  }>>().notNull(),
  constraints: json('constraints').$type<Array<{
    metric: string; operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number;
  }>>(),
  maxTrials: int('max_trials').default(50).notNull(),
  completedTrials: int('completed_trials').default(0).notNull(),
  bestTrialId: int('best_trial_id'),
  bestObjectiveValue: double('best_objective_value'),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).default('pending').notNull(),
  triggerMode: mysqlEnum('trigger_mode', ['auto', 'manual', 'scheduled']).default('manual').notNull(),
  autoApply: tinyint('auto_apply').default(0).notNull(),
  applied: tinyint('applied').default(0).notNull(),
  appliedAt: timestamp('applied_at', { fsp: 3 }),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
}, (table) => [
  index('idx_ptj_module').on(table.engineModule),
  index('idx_ptj_strategy').on(table.searchStrategy),
  index('idx_ptj_status').on(table.status),
  index('idx_ptj_created').on(table.createdAt),
]);
export type EvolutionParamTuningJob = typeof evolutionParamTuningJobs.$inferSelect;
export type InsertEvolutionParamTuningJob = typeof evolutionParamTuningJobs.$inferInsert;

/** 参数调优试验记录 */
export const evolutionParamTuningTrials = mysqlTable('evolution_param_tuning_trials', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id').notNull(),
  trialNumber: int('trial_number').notNull(),
  parameters: json('parameters').$type<Record<string, number | string>>().notNull(),
  objectiveValue: double('objective_value'),
  metrics: json('metrics').$type<Record<string, number>>(),
  constraintsSatisfied: tinyint('constraints_satisfied').default(1),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed']).default('pending').notNull(),
  durationMs: int('duration_ms'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { fsp: 3 }),
}, (table) => [
  index('idx_ptt_job').on(table.jobId),
  index('idx_ptt_status').on(table.status),
  index('idx_ptt_objective').on(table.objectiveValue),
]);
export type EvolutionParamTuningTrial = typeof evolutionParamTuningTrials.$inferSelect;
export type InsertEvolutionParamTuningTrial = typeof evolutionParamTuningTrials.$inferInsert;

/** 代码生成/验证飞轮任务 */
export const evolutionCodegenJobs = mysqlTable('evolution_codegen_jobs', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 256 }).notNull(),
  codeType: mysqlEnum('code_type', ['feature_extractor', 'detection_rule', 'transform_pipeline', 'aggregation', 'custom']).notNull(),
  description: text('description').notNull(),
  inputSchema: json('input_schema').$type<Record<string, string>>().notNull(),
  outputSchema: json('output_schema').$type<Record<string, string>>().notNull(),
  codeConstraints: json('code_constraints').$type<string[]>(),
  referenceCode: text('reference_code'),
  testData: json('test_data').$type<unknown[]>(),
  generatedCode: text('generated_code'),
  language: mysqlEnum('language', ['typescript', 'javascript']).default('typescript'),
  signature: varchar('signature', { length: 512 }),
  validationStatus: mysqlEnum('validation_status', ['pending', 'validating', 'passed', 'failed']).default('pending').notNull(),
  validationResult: json('validation_result').$type<{
    syntaxValid: boolean; typeCheckPassed: boolean;
    testsPassed: number; testsFailed: number;
    securityIssues: string[]; performanceMs: number;
  }>(),
  version: int('version').default(1).notNull(),
  deployed: tinyint('deployed').default(0).notNull(),
  deployedAt: timestamp('deployed_at', { fsp: 3 }),
  status: mysqlEnum('codegen_status', ['draft', 'generating', 'generated', 'validating', 'validated', 'deployed', 'failed']).default('draft').notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_cgj_type').on(table.codeType),
  index('idx_cgj_status').on(table.status),
  index('idx_cgj_validation').on(table.validationStatus),
  index('idx_cgj_created').on(table.createdAt),
]);
export type EvolutionCodegenJob = typeof evolutionCodegenJobs.$inferSelect;
export type InsertEvolutionCodegenJob = typeof evolutionCodegenJobs.$inferInsert;
