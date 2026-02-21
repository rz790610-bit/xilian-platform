/**
 * ============================================================================
 * Phase 2 — 认知层推理引擎增强 · 统一导出
 * ============================================================================
 */

// --- 类型 ---
export * from './reasoning.types';

// --- 基础设施 ---
export { Observability } from './observability/observability';
export type { ObservabilityConfig } from './observability/observability';
export { VectorStore } from './vector-store/vector-store';

// --- 核心模块 ---
export { PhysicsVerifier } from './physics/physics-verifier';
export { BuiltinCausalGraph } from './causal/causal-graph';
export { ExperiencePool } from './experience/experience-pool';
export { HybridReasoningOrchestrator } from './orchestrator/hybrid-orchestrator';
export { KnowledgeFeedbackLoop } from './feedback/knowledge-feedback-loop';
