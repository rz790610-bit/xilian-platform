/**
 * 四维处理器模块导出
 *
 * 感知维 — PerceptionProcessor（好奇引擎）
 * 推演维 — ReasoningProcessor（假设引擎）
 * 融合维 — FusionProcessor（DS 证据整合）
 * 决策维 — DecisionProcessor（EntropyRanker）
 */

export { PerceptionProcessor, createPerceptionProcessor } from './perception-processor';
export type { BaselineAdapter, PerceptionConfig } from './perception-processor';

export { ReasoningProcessor, createReasoningProcessor } from './reasoning-processor';
export type { KGQueryAdapter, ReasoningConfig, CausalPath, HistoricalCase } from './reasoning-processor';

export { FusionProcessor, createFusionProcessor } from './fusion-processor';
export type { FusionConfig } from './fusion-processor';

export { DecisionProcessor, createDecisionProcessor } from './decision-processor';
export type { DecisionConfig } from './decision-processor';
