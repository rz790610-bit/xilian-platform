/**
 * ============================================================================
 * 数据契约层 — 统一导出
 * ============================================================================
 *
 * 闭环四阶段数据契约的统一入口：
 *   - data-contracts: 核心数据结构类型
 *   - event-schema-registry: Schema 注册中心
 *   - builtin-schemas: 内置 13+ 事件 Schema
 *   - event-emitter-validated: 带校验的事件发射器
 *   - physics-formulas: 物理公式引擎
 */

// 核心数据结构
export * from './data-contracts';

// Schema 注册中心
export {
  EventSchemaRegistry,
  eventSchemaRegistry,
  parseSemVer,
  compareSemVer,
  formatSemVer,
  type SchemaVersion,
  type LoopStage,
  type SchemaRegistryEntry,
  type ValidationResult,
  type CompatibilityResult,
  type EventDefinition,
  type DeadLetterStats,
} from './event-schema-registry';

// 内置 Schema
export { registerBuiltinSchemas } from './builtin-schemas';
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
} from './builtin-schemas';

// 带校验的事件发射器
export {
  ValidatedEventEmitter,
  createValidatedEmitter,
  type ValidatedEmitterConfig,
} from './event-emitter-validated';

// 物理公式引擎
export {
  PhysicsEngine,
  physicsEngine,
  BUILTIN_FORMULAS,
} from './physics-formulas';
