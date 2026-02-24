// 自进化飞轮层 — 统一导出
export * from './shadow';
export * from './champion';
export * from './crystallization';
export * from './metalearner';
export * from './flywheel';
export * from './data-engine';
export * from './auto-codegen';
export * from './canary';
export * from './closed-loop';
export * from './metrics';
export * from './simulation';
// Selective re-exports from FSD to avoid naming conflicts with champion/shadow/metrics modules
export { EvolutionDBService } from './fsd/evolution-db-service';
export { DojoTrainingScheduler } from './fsd/dojo-training-scheduler';
export { AutoLabelingPipeline } from './fsd/auto-labeling-pipeline';
export { OTAFleetCanary } from './fsd/ota-fleet-canary';
export { FleetNeuralPlanner } from './fsd/fleet-neural-planner';
export { EndToEndEvolutionAgent } from './fsd/e2e-evolution-agent';
export { DualFlywheelOrchestrator } from './fsd/dual-flywheel-orchestrator';
export * from './audit';
export * from './infra';
