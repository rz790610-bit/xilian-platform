/**
 * ============================================================================
 * 评估与组合优化体系 — 模块总导出
 * ============================================================================
 *
 * P2-10 四维评估体系：
 *   1. ModuleEvaluator    — 技术/业务/进化/成本 四维评分
 *   2. BusinessEvaluator  — 平台级业务 KPI
 *   3. CombinationOptimizer — 算法组合推荐
 *   4. EvaluationDashboard — 仪表盘聚合
 */

// ── 类型 ──────────────────────────────────────────
export * from './evaluation.types';

// ── 配置 ──────────────────────────────────────────
export {
  getEvaluationConfig,
  updateEvaluationConfig,
  resetEvaluationConfig,
  onEvaluationConfigChange,
  EVALUATION_TOPICS,
} from './evaluation.config';

// ── 模块评估器 ──────────────────────────────────────
export {
  ModuleEvaluator,
  getModuleEvaluator,
  resetModuleEvaluator,
} from './module-evaluator';

// ── 业务评估器 ──────────────────────────────────────
export {
  BusinessEvaluator,
  getBusinessEvaluator,
  resetBusinessEvaluator,
} from './business-evaluator';

// ── 组合优化器 ──────────────────────────────────────
export {
  CombinationOptimizer,
  getCombinationOptimizer,
  resetCombinationOptimizer,
} from './combination-optimizer';

// ── 仪表盘 ──────────────────────────────────────────
export {
  EvaluationDashboard,
  getEvaluationDashboard,
  resetEvaluationDashboard,
} from './evaluation-dashboard';
