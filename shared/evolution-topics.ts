/**
 * ============================================================================
 * EVOLUTION_TOPICS — 进化引擎域事件 Topic 常量
 * ============================================================================
 *
 * 独立文件，避免 evolution-orchestrator ↔ platform 模块之间的循环依赖。
 * 所有进化引擎相关的事件 Topic 统一在此定义。
 *
 * 使用方式：
 *   import { EVOLUTION_TOPICS } from '../../shared/evolution-topics';
 *   // 或 from '../../../shared/evolution-topics' 根据相对路径
 */

export const EVOLUTION_TOPICS = {
  // 生命周期
  ENGINE_STARTED: 'evolution.engine.started',
  ENGINE_STOPPED: 'evolution.engine.stopped',
  ENGINE_ERROR: 'evolution.engine.error',
  ENGINE_HEALTH_CHECK: 'evolution.engine.healthCheck',

  // 策略插件
  STRATEGY_REGISTERED: 'evolution.strategy.registered',
  STRATEGY_EXECUTED: 'evolution.strategy.executed',
  STRATEGY_DISABLED: 'evolution.strategy.disabled',
  STRATEGY_UNINSTALLED: 'evolution.strategy.uninstalled',

  // 进化周期
  CYCLE_STARTED: 'evolution.cycle.started',
  CYCLE_STEP_COMPLETED: 'evolution.cycle.stepCompleted',
  CYCLE_COMPLETED: 'evolution.cycle.completed',
  CYCLE_FAILED: 'evolution.cycle.failed',

  // 配置变更
  CONFIG_UPDATED: 'evolution.config.updated',
  CONFIG_SEED_COMPLETED: 'evolution.config.seedCompleted',

  // 可观测性
  TRACE_CREATED: 'evolution.trace.created',
  TRACE_COMPLETED: 'evolution.trace.completed',
  ALERT_FIRED: 'evolution.alert.fired',
  ALERT_RESOLVED: 'evolution.alert.resolved',
  METRIC_SNAPSHOT: 'evolution.metric.snapshot',

  // 自愈
  ROLLBACK_INITIATED: 'evolution.rollback.initiated',
  ROLLBACK_COMPLETED: 'evolution.rollback.completed',
  ROLLBACK_FAILED: 'evolution.rollback.failed',
  HEALING_POLICY_TRIGGERED: 'evolution.healing.policyTriggered',
  HEALING_POLICY_EXECUTED: 'evolution.healing.policyExecuted',

  // 参数调优
  TUNING_STARTED: 'evolution.tuning.started',
  TUNING_TRIAL_COMPLETED: 'evolution.tuning.trialCompleted',
  TUNING_BEST_APPLIED: 'evolution.tuning.bestApplied',

  // 代码生成
  CODEGEN_GENERATED: 'evolution.codegen.generated',
  CODEGEN_VALIDATED: 'evolution.codegen.validated',
  CODEGEN_DEPLOYED: 'evolution.codegen.deployed',

  // 深度 AI
  WORLD_MODEL_TRAINED: 'evolution.worldModel.trained',
  WORLD_MODEL_PREDICTION: 'evolution.worldModel.prediction',
  WORLD_MODEL_VERSION_CREATED: 'evolution.worldModel.versionCreated',
  WORLD_MODEL_STATUS_CHANGED: 'evolution.worldModel.statusChanged',
  WORLD_MODEL_VERSION_DELETED: 'evolution.worldModel.versionDeleted',
  WORLD_MODEL_DEGRADED: 'evolution.worldModel.degraded',
  TRAINING_STATUS_CHANGED: 'evolution.training.statusChanged',
  MODEL_COMPARISON_COMPLETED: 'evolution.model.comparisonCompleted',
  MODEL_REGISTERED: 'evolution.model.registered',
  MODEL_STATUS_CHANGED: 'evolution.model.statusChanged',
  MODEL_DELETED: 'evolution.model.deleted',
  ADAPTIVE_RECOMMENDATION: 'evolution.adaptive.recommendation',
  RECOMMENDATION_ACCEPTED: 'evolution.recommendation.accepted',
  RECOMMENDATION_APPLIED: 'evolution.recommendation.applied',
  RECOMMENDATION_REJECTED: 'evolution.recommendation.rejected',
  RECOMMENDATION_REVERTED: 'evolution.recommendation.reverted',
} as const;

export type EvolutionTopicKey = keyof typeof EVOLUTION_TOPICS;
export type EvolutionTopicValue = typeof EVOLUTION_TOPICS[EvolutionTopicKey];
