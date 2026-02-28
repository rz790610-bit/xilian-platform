/**
 * ============================================================================
 * HDE 双轨演化诊断系统 — 核心数据库表（Drizzle ORM Schema）
 * ============================================================================
 *
 * Phase 0a 核心表：
 *   1. hde_diagnosis_sessions   — 诊断会话记录
 *   2. hde_track_results        — 双轨诊断结果
 *   3. hde_fusion_logs          — DS 融合过程日志
 *   4. hde_knowledge_crystals   — 统一知识结晶
 *
 * 设计原则：
 *   - 物理约束字段必须记录
 *   - 支持诊断结果追溯
 *   - 支持知识结晶验证闭环
 */

import {
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
  double,
  int,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

// ============================================================================
// 1. 诊断会话记录
// ============================================================================

/**
 * HDE 诊断会话 — 每次诊断的完整记录
 */
export const hdeDiagnosisSessions = mysqlTable('hde_diagnosis_sessions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 会话 ID（业务主键） */
  sessionId: varchar('session_id', { length: 64 }).notNull().unique(),
  /** 设备 ID */
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  /** 诊断时间戳 */
  diagnosisTimestamp: timestamp('diagnosis_timestamp', { fsp: 3 }).notNull(),
  /** 诊断状态 */
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed']).notNull().default('pending'),

  // 诊断结论
  /** 故障类型 */
  faultType: varchar('fault_type', { length: 100 }),
  /** 置信度 (0-1) */
  confidence: double('confidence'),
  /** 严重程度 */
  severity: mysqlEnum('severity', ['low', 'medium', 'high', 'critical']),
  /** 紧急程度 */
  urgency: mysqlEnum('urgency', ['monitoring', 'scheduled', 'priority', 'immediate']),

  // 物理约束验证
  /** 物理验证是否通过 */
  physicsValid: boolean('physics_valid'),
  /** 物理解释 */
  physicsExplanation: text('physics_explanation'),
  /** 违反的物理约束 */
  physicsViolations: json('physics_violations').$type<Array<{
    id: string;
    name: string;
    type: string;
    violationDegree: number;
    explanation: string;
  }>>(),

  // 融合信息
  /** 总冲突度 */
  fusionConflict: double('fusion_conflict'),
  /** 使用的融合策略 */
  fusionStrategy: varchar('fusion_strategy', { length: 50 }),
  /** 融合后信念质量 */
  fusedBeliefMass: json('fused_belief_mass').$type<Record<string, number>>(),

  // 输入数据快照
  /** 传感器数据摘要 */
  sensorDataSummary: json('sensor_data_summary').$type<Record<string, {
    channel: string;
    pointCount: number;
    mean: number;
    std: number;
    min: number;
    max: number;
  }>>(),
  /** 诊断上下文 */
  context: json('context').$type<Record<string, unknown>>(),

  // 建议动作
  /** 推荐动作列表 */
  recommendations: json('recommendations').$type<Array<{
    priority: string;
    action: string;
    rationale: string;
  }>>(),

  // 元数据
  /** 配置版本 */
  configVersion: varchar('config_version', { length: 50 }),
  /** 执行耗时 (ms) */
  durationMs: int('duration_ms'),
  /** 错误信息 */
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_hds_machine').on(table.machineId),
  index('idx_hds_timestamp').on(table.diagnosisTimestamp),
  index('idx_hds_status').on(table.status),
  index('idx_hds_fault').on(table.faultType),
  index('idx_hds_severity').on(table.severity),
]);

export type HdeDiagnosisSession = typeof hdeDiagnosisSessions.$inferSelect;
export type InsertHdeDiagnosisSession = typeof hdeDiagnosisSessions.$inferInsert;

// ============================================================================
// 2. 双轨诊断结果
// ============================================================================

/**
 * HDE 轨道结果 — 物理轨/数据轨的独立诊断结果
 */
export const hdeTrackResults = mysqlTable('hde_track_results', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 关联的会话 ID */
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  /** 轨道类型 */
  trackType: mysqlEnum('track_type', ['physics', 'data']).notNull(),

  // 诊断结果
  /** 故障假设列表 */
  faultHypotheses: json('fault_hypotheses').$type<Array<{
    id: string;
    faultType: string;
    priorProbability: number;
    posteriorProbability: number;
    supportingEvidence: string[];
    contradictingEvidence: string[];
    physicsMechanism?: string;
  }>>(),
  /** 信念质量 */
  beliefMass: json('belief_mass').$type<Record<string, number>>().notNull(),
  /** 轨道置信度 */
  confidence: double('confidence').notNull(),

  // 物理约束
  /** 物理约束列表 */
  physicsConstraints: json('physics_constraints').$type<Array<{
    id: string;
    name: string;
    type: string;
    expression: string;
    satisfied: boolean;
    violationDegree: number;
    explanation: string;
  }>>(),

  // 执行信息
  /** 使用的模型/规则 */
  modelsUsed: json('models_used').$type<string[]>(),
  /** 执行耗时 (ms) */
  executionTimeMs: int('execution_time_ms'),
  /** 错误信息 */
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_htr_session').on(table.sessionId),
  index('idx_htr_track').on(table.trackType),
  uniqueIndex('uq_htr_session_track').on(table.sessionId, table.trackType),
]);

export type HdeTrackResult = typeof hdeTrackResults.$inferSelect;
export type InsertHdeTrackResult = typeof hdeTrackResults.$inferInsert;

// ============================================================================
// 3. DS 融合过程日志
// ============================================================================

/**
 * HDE 融合日志 — DS 融合过程的详细记录
 */
export const hdeFusionLogs = mysqlTable('hde_fusion_logs', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 关联的会话 ID */
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  /** 融合步骤 */
  step: int('step').notNull(),

  // 证据源信息
  /** 证据源 ID */
  sourceId: varchar('source_id', { length: 100 }).notNull(),
  /** 证据源类型 */
  sourceType: mysqlEnum('source_type', ['sensor', 'model', 'rule', 'expert']),
  /** 证据源可靠性 */
  sourceReliability: double('source_reliability'),

  // 融合过程
  /** 输入信念质量 */
  inputMass: json('input_mass').$type<Record<string, number>>().notNull(),
  /** 输出信念质量 */
  outputMass: json('output_mass').$type<Record<string, number>>().notNull(),
  /** 步骤冲突度 */
  stepConflict: double('step_conflict').notNull(),
  /** 累积冲突度 */
  cumulativeConflict: double('cumulative_conflict').notNull(),
  /** 使用的融合策略 */
  strategyUsed: varchar('strategy_used', { length: 50 }).notNull(),

  // 策略切换
  /** 是否发生策略切换 */
  strategySwitched: boolean('strategy_switched').default(false),
  /** 切换原因 */
  switchReason: varchar('switch_reason', { length: 200 }),

  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_hfl_session').on(table.sessionId),
  index('idx_hfl_source').on(table.sourceId),
  index('idx_hfl_step').on(table.sessionId, table.step),
]);

export type HdeFusionLog = typeof hdeFusionLogs.$inferSelect;
export type InsertHdeFusionLog = typeof hdeFusionLogs.$inferInsert;

// ============================================================================
// 4. 统一知识结晶
// ============================================================================

/**
 * HDE 知识结晶 — 统一的知识沉淀记录
 */
export const hdeKnowledgeCrystals = mysqlTable('hde_knowledge_crystals', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  /** 结晶 ID（业务主键） */
  crystalId: varchar('crystal_id', { length: 64 }).notNull().unique(),

  // 来源信息
  /** 结晶来源 */
  source: mysqlEnum('source', ['diagnosis_history', 'cognition_result']).notNull(),
  /** 来源会话/批次 ID */
  sourceRefId: varchar('source_ref_id', { length: 100 }),

  // 知识类型和内容
  /** 知识类型 */
  crystalType: mysqlEnum('crystal_type', [
    // Evolution 来源
    'guardrail_rule',
    'kg_triple',
    'feature_weight',
    'threshold_update',
    'migration_suggestion',
    // Cognition 来源
    'anomaly_pattern',
    'causal_relation',
    'hypothesis_result',
    'source_reliability',
    'oc_transition_rule',
  ]).notNull(),
  /** 知识内容 */
  content: json('content').$type<Record<string, unknown>>().notNull(),

  // 置信度和验证
  /** 置信度 (0-1) */
  confidence: double('confidence').notNull(),
  /** 支持度 */
  support: double('support'),
  /** 验证状态 */
  verificationStatus: mysqlEnum('verification_status', [
    'pending', 'validated', 'approved', 'rejected',
  ]).notNull().default('pending'),
  /** 验证次数 */
  verificationCount: int('verification_count').notNull().default(1),
  /** 最后验证时间 */
  lastVerifiedAt: timestamp('last_verified_at', { fsp: 3 }),
  /** 验证者 */
  verifiedBy: varchar('verified_by', { length: 100 }),

  // 物理约束（核心要求）
  /** 物理解释（必须） */
  physicsExplanation: text('physics_explanation').notNull(),
  /** 物理公式 */
  physicsFormula: varchar('physics_formula', { length: 500 }),
  /** 适用的物理约束 */
  applicableConstraints: json('applicable_constraints').$type<string[]>(),

  // 适用范围
  /** 适用场景 */
  applicableScenarios: json('applicable_scenarios').$type<string[]>().notNull(),
  /** 适用设备类型 */
  applicableEquipmentTypes: json('applicable_equipment_types').$type<string[]>(),
  /** 适用工况 */
  applicableConditions: json('applicable_conditions').$type<string[]>(),

  // 生命周期
  /** 是否启用 */
  enabled: boolean('enabled').notNull().default(true),
  /** 启用时间 */
  enabledAt: timestamp('enabled_at', { fsp: 3 }),
  /** 禁用原因 */
  disableReason: text('disable_reason'),

  // 迁移信息
  /** 来源场景（跨工况迁移） */
  sourceScenario: varchar('source_scenario', { length: 100 }),
  /** 目标场景 */
  targetScenario: varchar('target_scenario', { length: 100 }),
  /** 迁移适配 */
  migrationAdaptations: json('migration_adaptations').$type<Array<{
    field: string;
    sourceRange: string;
    suggestedRange: string;
    reason: string;
  }>>(),

  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index('idx_hkc_source').on(table.source),
  index('idx_hkc_type').on(table.crystalType),
  index('idx_hkc_status').on(table.verificationStatus),
  index('idx_hkc_enabled').on(table.enabled),
  index('idx_hkc_confidence').on(table.confidence),
  index('idx_hkc_scenario').on(table.sourceScenario, table.targetScenario),
]);

export type HdeKnowledgeCrystal = typeof hdeKnowledgeCrystals.$inferSelect;
export type InsertHdeKnowledgeCrystal = typeof hdeKnowledgeCrystals.$inferInsert;
