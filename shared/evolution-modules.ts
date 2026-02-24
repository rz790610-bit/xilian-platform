/**
 * ============================================================================
 * 进化引擎模块统一命名 — 全局唯一枚举
 * ============================================================================
 * 所有后端路由、前端页面、种子数据、告警规则、自愈策略
 * 必须使用此处定义的 camelCase 模块名。
 *
 * 命名规范：camelCase，与平台层类名保持一致
 *   ShadowEvaluator → shadowEvaluator
 *   CanaryDeployer  → canaryDeployer
 */

/** 15 个核心引擎模块 — camelCase 统一命名 */
export const ENGINE_MODULES = [
  'shadowEvaluator',
  'championChallenger',
  'canaryDeployer',
  'otaFleet',
  'interventionRateEngine',
  'simulationEngine',
  'dataEngine',
  'dualFlywheel',
  'dojoTrainer',
  'autoLabeler',
  'domainRouter',
  'metaLearner',
  'fleetPlanner',
  'e2eAgent',
  'closedLoopTracker',
  'grokLabelProvider',
] as const;

export type EngineModule = (typeof ENGINE_MODULES)[number];

/** 模块中文标签 */
export const ENGINE_MODULE_LABELS: Record<EngineModule, string> = {
  shadowEvaluator: '影子评估器',
  championChallenger: '冠军挑战者',
  canaryDeployer: '金丝雀部署',
  otaFleet: 'OTA 车队',
  interventionRateEngine: '干预率引擎',
  simulationEngine: '仿真引擎',
  dataEngine: '数据引擎',
  dualFlywheel: '双飞轮',
  dojoTrainer: 'Dojo 训练',
  autoLabeler: '自动标注',
  domainRouter: '领域路由',
  metaLearner: '元学习器',
  fleetPlanner: '车队规划',
  e2eAgent: 'E2E Agent',
  closedLoopTracker: '闭环追踪',
  grokLabelProvider: 'Grok 智能标注',
};

/**
 * snake_case → camelCase 映射表
 * 用于数据迁移和兼容旧数据
 */
export const SNAKE_TO_CAMEL: Record<string, EngineModule> = {
  shadow_evaluator: 'shadowEvaluator',
  champion_challenger: 'championChallenger',
  canary_deployer: 'canaryDeployer',
  ota_fleet_canary: 'otaFleet',
  ota_fleet: 'otaFleet',
  intervention_rate_engine: 'interventionRateEngine',
  simulation_engine: 'simulationEngine',
  data_engine: 'dataEngine',
  dual_flywheel: 'dualFlywheel',
  dojo_training_scheduler: 'dojoTrainer',
  dojo_trainer: 'dojoTrainer',
  auto_labeling_pipeline: 'autoLabeler',
  auto_labeler: 'autoLabeler',
  domain_router: 'domainRouter',
  meta_learner: 'metaLearner',
  fleet_neural_planner: 'fleetPlanner',
  fleet_planner: 'fleetPlanner',
  e2e_evolution_agent: 'e2eAgent',
  e2e_agent: 'e2eAgent',
  closed_loop_tracker: 'closedLoopTracker',
  // camelCase 自身映射（幂等）
  shadowEvaluator: 'shadowEvaluator',
  championChallenger: 'championChallenger',
  canaryDeployer: 'canaryDeployer',
  otaFleet: 'otaFleet',
  interventionRateEngine: 'interventionRateEngine',
  simulationEngine: 'simulationEngine',
  dataEngine: 'dataEngine',
  dualFlywheel: 'dualFlywheel',
  dojoTrainer: 'dojoTrainer',
  autoLabeler: 'autoLabeler',
  domainRouter: 'domainRouter',
  metaLearner: 'metaLearner',
  fleetPlanner: 'fleetPlanner',
  e2eAgent: 'e2eAgent',
  closedLoopTracker: 'closedLoopTracker',
  grok_label_provider: 'grokLabelProvider',
  grokLabelProvider: 'grokLabelProvider',
};

/** 将任意模块名标准化为 camelCase */
export function normalizeModuleName(raw: string): EngineModule {
  return SNAKE_TO_CAMEL[raw] ?? (raw as EngineModule);
}
