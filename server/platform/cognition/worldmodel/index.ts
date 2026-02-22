// ============================================================================
// 世界模型模块导出 — Phase 3 增强
// ============================================================================

// 原始 WorldModel（Phase 2 基座，不修改）
export {
  WorldModel,
  type WorldModelConfig,
  type PhysicsModelParams,
  type StatisticalModelParams,
  type StateVector,
  type PredictionResult,
  type CounterfactualResult,
  type AnomalyAnticipation,
  type SimulationScenario,
} from './world-model';

// Phase 3: 增强模块
export {
  WorldModelRegistry,
  StateSyncEngine,
  UncertaintyQuantifier,
  RULPredictor,
  PhysicsValidator,
  worldModelRegistry,
  stateSyncEngine,
  uncertaintyQuantifier,
  rulPredictor,
  physicsValidator,
  type TwinInstanceMeta,
  type UncertaintyResult,
  type RULResult,
  type PhysicsValidationResult,
  type MigrationResult,
} from './world-model-enhanced';

// Phase 3: GrokEnhancer 治理门面
export {
  GrokEnhancer,
  grokEnhancer,
  type GrokEnhancerConfig,
  type EnhanceResult,
  type CostStats,
} from './grok-enhancer';

// Phase 3: 事件总线
export {
  TwinEventBus,
  twinEventBus,
  type TwinEvent,
  type TwinEventMap,
  TwinEventType,
} from './twin-event-bus';

// Phase 3: Outbox Relay Worker
export {
  OutboxRelay,
  outboxRelay,
  createOutboxEntry,
} from './outbox-relay';
