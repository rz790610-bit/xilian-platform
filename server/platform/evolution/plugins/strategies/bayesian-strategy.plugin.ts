/**
 * ============================================================================
 * 贝叶斯优化策略插件 — bayesian-strategy.plugin.ts
 * ============================================================================
 *
 * 将 MetaLearner 原有的贝叶斯参数搜索逻辑封装为独立插件。
 * 通过 pluginEngine 注册后，MetaLearner 可按 preferredStrategy 选择执行。
 *
 * 策略逻辑：
 *   1. 分析性能趋势（线性回归斜率）
 *   2. 识别低分维度
 *   3. 生成参数调优 / 特征工程 / 探索性假设
 *
 * 架构位置: server/platform/evolution/plugins/strategies/
 */
import { createStrategyPlugin } from './strategy-plugin.interface';
import type { Hypothesis, HypothesisGenerationContext } from '../../metalearner/meta-learner';
import { createModuleLogger } from '../../../../core/logger';
import { eventBus } from '../../../../services/eventBus.service';
import { EVOLUTION_TOPICS } from '../../../../../shared/evolution-topics';

const log = createModuleLogger('strategy-bayesian');

// ============================================================================
// 内部工具函数
// ============================================================================

/** 计算线性回归斜率（趋势） */
function computeTrend(values: number[]): number {
  if (values.length < 3) return 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }
  return denominator > 0 ? numerator / denominator : 0;
}

// ============================================================================
// 贝叶斯优化策略
// ============================================================================

export const bayesianOptimizationPlugin = createStrategyPlugin(
  'meta-learner.bayesian',
  '贝叶斯优化策略',
  '1.0.0',
  async (context: HypothesisGenerationContext): Promise<Hypothesis[]> => {
    const start = Date.now();
    const hypotheses: Hypothesis[] = [];
    const perf = context.recentPerformance || [];
    const scores = perf.map(p => p.score);
    const trend = computeTrend(scores);

    // ── 假设 1：性能下降 → 参数调优 ──
    if (trend < -0.01) {
      hypotheses.push({
        hypothesisId: `hyp_bayesian_param_${Date.now()}`,
        timestamp: Date.now(),
        description: '性能呈下降趋势，建议贝叶斯参数搜索调优物理模型参数',
        type: 'parameter_tuning',
        expectedImprovement: 0.05,
        confidence: 0.7,
        parameters: {
          target: 'physics_params',
          method: 'bayesian_optimization',
          searchSpace: {
            stressConcentrationFactor: [2.0, 3.0],
            corrosionRateConstant: [0.0005, 0.002],
          },
        },
        status: 'proposed',
        generatedBy: 'rules',
      });
    }

    // ── 假设 2：低分维度 → 特征工程 ──
    const dimScores: Record<string, number[]> = {};
    for (const p of perf) {
      for (const [key, value] of Object.entries(p.context)) {
        if (!dimScores[key]) dimScores[key] = [];
        dimScores[key].push(value);
      }
    }
    for (const [dim, values] of Object.entries(dimScores)) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      if (avg < 0.5) {
        hypotheses.push({
          hypothesisId: `hyp_bayesian_feat_${dim}_${Date.now()}`,
          timestamp: Date.now(),
          description: `维度 ${dim} 持续低分（平均 ${avg.toFixed(2)}），建议增加交叉特征`,
          type: 'feature_engineering',
          expectedImprovement: 0.08,
          confidence: 0.6,
          parameters: {
            targetDimension: dim,
            suggestedFeatures: [`${dim}_rolling_mean`, `${dim}_rate_of_change`, `${dim}_interaction`],
          },
          status: 'proposed',
          generatedBy: 'rules',
        });
      }
    }

    // ── 假设 3：探索性假设（ε-greedy, 20% 概率） ──
    if (Math.random() < 0.2) {
      hypotheses.push({
        hypothesisId: `hyp_bayesian_explore_${Date.now()}`,
        timestamp: Date.now(),
        description: '探索性假设：尝试增加数据增强（时间序列扰动）',
        type: 'data_augmentation',
        expectedImprovement: 0.03,
        confidence: 0.4,
        parameters: {
          method: 'time_series_augmentation',
          techniques: ['jittering', 'scaling', 'time_warping'],
        },
        status: 'proposed',
        generatedBy: 'rules',
      });
    }

    const durationMs = Date.now() - start;
    log.debug(`[Bayesian] 生成 ${hypotheses.length} 个假设，耗时 ${durationMs}ms`);

    // 发布 STRATEGY_EXECUTED 事件
    eventBus.publish(
      EVOLUTION_TOPICS.STRATEGY_EXECUTED,
      'strategy_executed',
      {
        strategy: 'meta-learner.bayesian',
        jobId: context.jobId || 'unknown',
        hypothesesCount: hypotheses.length,
        durationMs,
      },
      { source: 'bayesian-strategy-plugin', severity: 'info' },
    ).catch(() => { /* EventBus 未初始化时忽略 */ });

    return hypotheses;
  },
);
