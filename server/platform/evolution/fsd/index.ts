/**
 * FSD 专属模块统一导出
 *
 * E25: DualFlywheelOrchestrator — Real + Sim 并行飞轮 + 交叉验证
 * E27: AutoLabelingPipeline — Grok + World Model 自动标注
 * E29-E31: EndToEndEvolutionAgent — MindVLA 端到端 + 模型合并 (SLERP)
 * E32: FleetNeuralPlanner — 全车队多目标优化 + Pareto 前沿
 * E33: OTAFleetCanary — 5 阶段 OTA 部署 + 自动回滚
 * E34: FSDMetrics — Prometheus 指标集
 * E35: DojoTrainingScheduler — Carbon-aware + Spot + 视频优先
 * DB:  EvolutionDBService — FSD 表 CRUD 服务层
 */

export { DualFlywheelOrchestrator } from './dual-flywheel-orchestrator';
export type { DualFlywheelReport, CrossValidationResult, PromotionRecommendation, DualFlywheelConfig } from './dual-flywheel-orchestrator';

export { AutoLabelingPipeline } from './auto-labeling-pipeline';
export type { LabelResult, AutoLabel, LabelingConfig, LabelingReport, LabelingProvider } from './auto-labeling-pipeline';

export { EndToEndEvolutionAgent } from './e2e-evolution-agent';
export type {
  MultiModalInput, DecisionOutput, FuturePrediction, ReasoningStep, DecisionMetadata,
  E2EAgentConfig, ModelMergeConfig, ModelWeights,
  WorldModelProvider, ReasoningProvider,
} from './e2e-evolution-agent';

export { FleetNeuralPlanner } from './fleet-neural-planner';
export type { FleetStatus, FleetScore, FleetOptimizationResult, FleetPlannerConfig } from './fleet-neural-planner';

export { OTAFleetCanary } from './ota-fleet-canary';
export type {
  DeploymentPlan, DeploymentStage, HealthCheckResult, DeploymentState,
  OTACanaryConfig, HealthCheckProvider,
} from './ota-fleet-canary';

export { FSDMetrics } from './fsd-metrics';

export { DojoTrainingScheduler } from './dojo-training-scheduler';
export type { TrainingJob, ScheduledJob, CostEstimate, ResourceAllocation, CarbonWindow, SchedulerConfig } from './dojo-training-scheduler';

export { EvolutionDBService } from './evolution-db-service';
export type { InterventionQuery, InterventionStats, SimulationQuery, EvolutionDashboardData } from './evolution-db-service';
