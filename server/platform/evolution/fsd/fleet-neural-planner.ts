/**
 * ============================================================================
 * Fleet Neural Planner (E32)
 * ============================================================================
 *
 * 全车队历史表现全局优化：
 *   - 多目标优化（准确率 + 干预率 + 效率）
 *   - RLfI（Reinforcement Learning from Interventions）
 *   - 车队级别模型选择
 *   - Pareto 前沿分析
 */

import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('fleet-neural-planner');

// ============================================================================
// 类型定义
// ============================================================================

export interface FleetStatus {
  modelId: string;
  modelVersion: string;
  accuracy: number;
  interventionRate: number;
  efficiency: number;
  latencyP99: number;
  deployedDevices: number;
  uptime: number;
  lastUpdated: number;
}

export interface FleetScore {
  modelId: string;
  score: number;
  breakdown: {
    accuracyScore: number;
    interventionScore: number;
    efficiencyScore: number;
    stabilityScore: number;
  };
  rank: number;
  isParetoOptimal: boolean;
}

export interface FleetOptimizationResult {
  bestChallenger: FleetScore;
  allScores: FleetScore[];
  paretoFront: FleetScore[];
  recommendation: string;
  optimizedAt: number;
}

export interface FleetPlannerConfig {
  /** 准确率权重 */
  accuracyWeight: number;
  /** 干预率权重 (越低越好) */
  interventionWeight: number;
  /** 效率权重 */
  efficiencyWeight: number;
  /** 稳定性权重 */
  stabilityWeight: number;
  /** 最低准确率门槛 */
  minAccuracyThreshold: number;
  /** 最高干预率门槛 */
  maxInterventionThreshold: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: FleetPlannerConfig = {
  accuracyWeight: 0.35,
  interventionWeight: 0.30,
  efficiencyWeight: 0.20,
  stabilityWeight: 0.15,
  minAccuracyThreshold: 0.85,
  maxInterventionThreshold: 0.02,
};

// ============================================================================
// Fleet Neural Planner
// ============================================================================

export class FleetNeuralPlanner {
  private config: FleetPlannerConfig;
  private eventBus: EventBus;

  constructor(config: Partial<FleetPlannerConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 多目标优化选择最优挑战者
  // ==========================================================================

  async selectOptimalChallenger(fleetMetrics: FleetStatus[]): Promise<FleetOptimizationResult> {
    if (fleetMetrics.length === 0) {
      return {
        bestChallenger: {
          modelId: 'none',
          score: 0,
          breakdown: { accuracyScore: 0, interventionScore: 0, efficiencyScore: 0, stabilityScore: 0 },
          rank: 0,
          isParetoOptimal: false,
        },
        allScores: [],
        paretoFront: [],
        recommendation: '无可用模型',
        optimizedAt: Date.now(),
      };
    }

    // 计算所有模型的综合评分
    const scores: FleetScore[] = fleetMetrics.map(m => {
      const accuracyScore = m.accuracy;
      const interventionScore = 1 - m.interventionRate; // 越低越好
      const efficiencyScore = Math.min(m.efficiency, 1.0);
      const stabilityScore = this.computeStabilityScore(m);

      const score =
        accuracyScore * this.config.accuracyWeight +
        interventionScore * this.config.interventionWeight +
        efficiencyScore * this.config.efficiencyWeight +
        stabilityScore * this.config.stabilityWeight;

      return {
        modelId: m.modelId,
        score,
        breakdown: { accuracyScore, interventionScore, efficiencyScore, stabilityScore },
        rank: 0,
        isParetoOptimal: false,
      };
    });

    // 排名
    scores.sort((a, b) => b.score - a.score);
    scores.forEach((s, i) => { s.rank = i + 1; });

    // Pareto 前沿分析
    const paretoFront = this.computeParetoFront(scores);
    paretoFront.forEach(s => { s.isParetoOptimal = true; });

    // 过滤不满足门槛的模型
    const eligible = scores.filter(s => {
      const metrics = fleetMetrics.find(m => m.modelId === s.modelId)!;
      return metrics.accuracy >= this.config.minAccuracyThreshold &&
             metrics.interventionRate <= this.config.maxInterventionThreshold;
    });

    const bestChallenger = eligible.length > 0 ? eligible[0] : scores[0];

    // 生成推荐
    const recommendation = this.generateRecommendation(bestChallenger, fleetMetrics, eligible);

    const result: FleetOptimizationResult = {
      bestChallenger,
      allScores: scores,
      paretoFront,
      recommendation,
      optimizedAt: Date.now(),
    };

    // EventBus
    await this.eventBus.publish({
      type: 'fleet_planner.optimization.completed',
      source: 'fleet-neural-planner',
      data: {
        bestModelId: bestChallenger.modelId,
        bestScore: bestChallenger.score,
        totalModels: fleetMetrics.length,
        paretoCount: paretoFront.length,
      },
    });

    log.info(`车队优化完成: 最优模型 ${bestChallenger.modelId}, 评分 ${bestChallenger.score.toFixed(4)}`);
    return result;
  }

  // ==========================================================================
  // 2. 稳定性评分
  // ==========================================================================

  private computeStabilityScore(metrics: FleetStatus): number {
    // 基于运行时间和延迟稳定性
    const uptimeScore = Math.min(metrics.uptime / (7 * 24 * 3600000), 1.0); // 7 天满分
    const latencyScore = metrics.latencyP99 < 100 ? 1.0 :
      metrics.latencyP99 < 500 ? 0.8 :
      metrics.latencyP99 < 1000 ? 0.5 : 0.2;
    return uptimeScore * 0.6 + latencyScore * 0.4;
  }

  // ==========================================================================
  // 3. Pareto 前沿计算
  // ==========================================================================

  private computeParetoFront(scores: FleetScore[]): FleetScore[] {
    const pareto: FleetScore[] = [];

    for (const candidate of scores) {
      let isDominated = false;
      for (const other of scores) {
        if (candidate.modelId === other.modelId) continue;
        // 检查 other 是否在所有维度上都优于 candidate
        if (
          other.breakdown.accuracyScore >= candidate.breakdown.accuracyScore &&
          other.breakdown.interventionScore >= candidate.breakdown.interventionScore &&
          other.breakdown.efficiencyScore >= candidate.breakdown.efficiencyScore &&
          other.breakdown.stabilityScore >= candidate.breakdown.stabilityScore &&
          (
            other.breakdown.accuracyScore > candidate.breakdown.accuracyScore ||
            other.breakdown.interventionScore > candidate.breakdown.interventionScore ||
            other.breakdown.efficiencyScore > candidate.breakdown.efficiencyScore ||
            other.breakdown.stabilityScore > candidate.breakdown.stabilityScore
          )
        ) {
          isDominated = true;
          break;
        }
      }
      if (!isDominated) {
        pareto.push(candidate);
      }
    }

    return pareto;
  }

  // ==========================================================================
  // 4. 推荐生成
  // ==========================================================================

  private generateRecommendation(
    best: FleetScore,
    metrics: FleetStatus[],
    eligible: FleetScore[],
  ): string {
    const parts: string[] = [];

    parts.push(`最优模型: ${best.modelId} (综合评分 ${best.score.toFixed(4)})`);

    if (eligible.length === 0) {
      parts.push('警告: 无模型满足准确率和干预率门槛');
    } else {
      parts.push(`${eligible.length}/${metrics.length} 个模型满足门槛`);
    }

    if (best.isParetoOptimal) {
      parts.push('该模型位于 Pareto 前沿');
    }

    const bestMetrics = metrics.find(m => m.modelId === best.modelId);
    if (bestMetrics) {
      parts.push(`准确率 ${(bestMetrics.accuracy * 100).toFixed(1)}%, 干预率 ${(bestMetrics.interventionRate * 100).toFixed(3)}%`);
    }

    return parts.join(' | ');
  }

  updateConfig(updates: Partial<FleetPlannerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
