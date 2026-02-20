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
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_kc_confidence').on(table.confidence),
  index('idx_kc_kg_node').on(table.kgNodeId),
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
