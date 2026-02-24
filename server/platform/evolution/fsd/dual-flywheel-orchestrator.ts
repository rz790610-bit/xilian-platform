/**
 * ============================================================================
 * Dual Flywheel Orchestrator (E25)
 * ============================================================================
 *
 * 借鉴 FSD 双飞轮架构：
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │                  Dual Flywheel                           │
 *   │                                                          │
 *   │  ┌─────────────────┐    ┌─────────────────┐            │
 *   │  │  Real Flywheel  │    │  Sim Flywheel   │            │
 *   │  │  (生产数据驱动)  │    │  (仿真数据驱动)  │            │
 *   │  │                 │    │                  │            │
 *   │  │  Shadow Fleet   │    │  Regression     │            │
 *   │  │  → Intervention │    │  → Stress Test  │            │
 *   │  │  → Hard Cases   │    │  → Edge Cases   │            │
 *   │  │  → Auto-Label   │    │  → Adversarial  │            │
 *   │  └────────┬────────┘    └────────┬─────────┘            │
 *   │           │                       │                      │
 *   │           └───────────┬───────────┘                      │
 *   │                       │                                  │
 *   │              ┌───────▼────────┐                         │
 *   │              │ Cross-Validate │                         │
 *   │              │ + Merge Report │                         │
 *   │              └───────┬────────┘                         │
 *   │                      │                                   │
 *   │              ┌──────▼───────┐                           │
 *   │              │  Promotion   │                           │
 *   │              │  Decision    │                           │
 *   │              └──────────────┘                           │
 *   └──────────────────────────────────────────────────────────┘
 */

import { EvolutionFlywheel, type FlywheelCycleReport } from '../flywheel/evolution-flywheel';
import { HighFidelitySimulationEngine, type RegressionSuiteReport, type SimulationModelProvider } from '../simulation/simulation-engine';
import { ShadowFleetManager, type ShadowFleetStats } from '../shadow/shadow-fleet-manager';
import { AutoLabelingPipeline, type LabelingReport } from './auto-labeling-pipeline';
import { InterventionRateEngine, type MultiWindowRate } from '../shadow/intervention-rate-engine';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('dual-flywheel');

// ============================================================================
// 类型定义
// ============================================================================

export interface DualFlywheelReport {
  reportId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;

  /** Real Flywheel 报告 */
  realReport: FlywheelCycleReport | null;

  /** Sim Flywheel 报告 */
  simReport: RegressionSuiteReport | null;

  /** Shadow Fleet 统计 */
  shadowStats: ShadowFleetStats | null;

  /** Auto-Labeling 报告 */
  labelingReport: LabelingReport | null;

  /** 干预率 */
  interventionRate: MultiWindowRate | null;

  /** 交叉验证结果 */
  crossValidation: CrossValidationResult;

  /** 综合推荐 */
  recommendation: PromotionRecommendation;
}

export interface CrossValidationResult {
  /** 一致性评分 (0-1) */
  consistencyScore: number;
  /** Real 和 Sim 结论是否一致 */
  consistent: boolean;
  /** 不一致的维度 */
  inconsistentDimensions: string[];
  /** 综合置信度 */
  overallConfidence: number;
  /** 详细分析 */
  analysis: string;
}

export interface PromotionRecommendation {
  /** 是否推荐提升 */
  shouldPromote: boolean;
  /** 推荐理由 */
  reason: string;
  /** 置信度 */
  confidence: number;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
  /** 建议的下一步 */
  nextSteps: string[];
}

export interface DualFlywheelConfig {
  /** 是否并行执行 Real 和 Sim */
  parallelExecution: boolean;
  /** 交叉验证一致性阈值 */
  consistencyThreshold: number;
  /** 自动提升阈值 */
  autoPromoteThreshold: number;
  /** 是否启用自动标注 */
  enableAutoLabeling: boolean;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: DualFlywheelConfig = {
  parallelExecution: true,
  consistencyThreshold: 0.8,
  autoPromoteThreshold: 0.9,
  enableAutoLabeling: true,
};

// ============================================================================
// Dual Flywheel Orchestrator
// ============================================================================

export class DualFlywheelOrchestrator {
  private config: DualFlywheelConfig;
  private realFlywheel: EvolutionFlywheel;
  private simEngine: HighFidelitySimulationEngine;
  private shadowFleet: ShadowFleetManager | null;
  private autoLabeler: AutoLabelingPipeline;
  private interventionEngine: InterventionRateEngine;
  private eventBus: EventBus;

  constructor(
    realFlywheel: EvolutionFlywheel,
    simEngine: HighFidelitySimulationEngine,
    interventionEngine: InterventionRateEngine,
    config: Partial<DualFlywheelConfig> = {},
    eventBus?: EventBus,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.realFlywheel = realFlywheel;
    this.simEngine = simEngine;
    this.interventionEngine = interventionEngine;
    this.shadowFleet = null;
    this.autoLabeler = new AutoLabelingPipeline({}, eventBus);
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 设置 Shadow Fleet（可选注入）
  // ==========================================================================

  setShadowFleet(shadowFleet: ShadowFleetManager): void {
    this.shadowFleet = shadowFleet;
  }

  setAutoLabeler(autoLabeler: AutoLabelingPipeline): void {
    this.autoLabeler = autoLabeler;
  }

  // ==========================================================================
  // 2. 执行双飞轮周期
  // ==========================================================================

  async runDualCycle(
    diagnosisHistory: any[],
    evaluationDataset: any[],
    modelProvider: SimulationModelProvider,
    challengerModel?: any,
  ): Promise<DualFlywheelReport> {
    const startTime = Date.now();
    const reportId = `dual_flywheel_${startTime}`;

    log.info('双飞轮周期启动');

    let realReport: FlywheelCycleReport | null = null;
    let simReport: RegressionSuiteReport | null = null;
    let shadowStats: ShadowFleetStats | null = null;
    let labelingReport: LabelingReport | null = null;
    let interventionRate: MultiWindowRate | null = null;

    try {
      if (this.config.parallelExecution) {
        // 并行执行 Real + Sim 飞轮
        const [realResult, simResult] = await Promise.allSettled([
          this.realFlywheel.executeCycle(diagnosisHistory, evaluationDataset, challengerModel),
          this.simEngine.runRegressionSuite(
            challengerModel?.modelId ?? 'current',
            modelProvider,
          ),
        ]);

        realReport = realResult.status === 'fulfilled' ? realResult.value : null;
        simReport = simResult.status === 'fulfilled' ? simResult.value : null;

        if (realResult.status === 'rejected') {
          log.error('Real Flywheel 执行失败', realResult.reason);
        }
        if (simResult.status === 'rejected') {
          log.error('Sim Flywheel 执行失败', simResult.reason);
        }
      } else {
        // 串行执行
        realReport = await this.realFlywheel.executeCycle(diagnosisHistory, evaluationDataset, challengerModel);
        simReport = await this.simEngine.runRegressionSuite(
          challengerModel?.modelId ?? 'current',
          modelProvider,
        );
      }

      // 获取 Shadow Fleet 统计
      if (this.shadowFleet) {
        shadowStats = await this.shadowFleet.getStats(24);
      }

      // 干预率
      interventionRate = this.interventionEngine.computeMultiWindowRate();

      // Auto-Labeling
      if (this.config.enableAutoLabeling) {
        labelingReport = await this.autoLabeler.batchLabel(50);
      }
    } catch (err) {
      log.error('双飞轮周期执行异常', err);
    }

    // 交叉验证
    const crossValidation = this.crossValidate(realReport, simReport, shadowStats);

    // 综合推荐
    const recommendation = this.generateRecommendation(
      realReport, simReport, crossValidation, interventionRate,
    );

    const completedAt = Date.now();

    const report: DualFlywheelReport = {
      reportId,
      startedAt: startTime,
      completedAt,
      durationMs: completedAt - startTime,
      realReport,
      simReport,
      shadowStats,
      labelingReport,
      interventionRate,
      crossValidation,
      recommendation,
    };

    // EventBus
    await this.eventBus.publish('dual_flywheel.cycle.completed', {
        reportId,
        durationMs: report.durationMs,
        consistent: crossValidation.consistent,
        shouldPromote: recommendation.shouldPromote,
        riskLevel: recommendation.riskLevel,
      }, { source: 'dual-flywheel-orchestrator' });

    log.info(`双飞轮周期完成: ${reportId}, 一致性=${crossValidation.consistencyScore.toFixed(2)}, 推荐提升=${recommendation.shouldPromote}`);

    return report;
  }

  // ==========================================================================
  // 3. 交叉验证
  // ==========================================================================

  private crossValidate(
    realReport: FlywheelCycleReport | null,
    simReport: RegressionSuiteReport | null,
    shadowStats: ShadowFleetStats | null,
  ): CrossValidationResult {
    const inconsistentDimensions: string[] = [];
    let totalScore = 0;
    let dimensionCount = 0;

    // 维度 1: Real Flywheel 状态
    if (realReport) {
      const realSuccess = realReport.status === 'completed';
      totalScore += realSuccess ? 1 : 0;
      dimensionCount++;
      if (!realSuccess) inconsistentDimensions.push('real_flywheel_status');
    }

    // 维度 2: Sim 回归测试通过率
    if (simReport) {
      const simPass = simReport.coverageRate >= 0.8;
      totalScore += simPass ? 1 : 0;
      dimensionCount++;
      if (!simPass) inconsistentDimensions.push('sim_coverage_rate');
    }

    // 维度 3: 影子评估结论
    if (realReport?.shadowEvaluation) {
      const evalPromote = realReport.shadowEvaluation.verdict === 'promote';
      totalScore += evalPromote ? 1 : 0;
      dimensionCount++;
      if (!evalPromote) inconsistentDimensions.push('shadow_eval_verdict');
    }

    // 维度 4: 干预率
    if (shadowStats) {
      const lowIntervention = shadowStats.interventionRate < 0.01;
      totalScore += lowIntervention ? 1 : 0;
      dimensionCount++;
      if (!lowIntervention) inconsistentDimensions.push('intervention_rate');
    }

    // 维度 5: Real 和 Sim 结论一致性
    if (realReport && simReport) {
      const realPositive = realReport.status === 'completed' &&
        (realReport.shadowEvaluation?.verdict === 'promote' || !realReport.shadowEvaluation);
      const simPositive = simReport.coverageRate >= 0.8;

      if (realPositive === simPositive) {
        totalScore += 1;
      } else {
        inconsistentDimensions.push('real_sim_agreement');
      }
      dimensionCount++;
    }

    const consistencyScore = dimensionCount > 0 ? totalScore / dimensionCount : 0;
    const consistent = consistencyScore >= this.config.consistencyThreshold;

    // 分析文本
    const analysisPoints: string[] = [];
    if (realReport) analysisPoints.push(`Real Flywheel: ${realReport.status}`);
    if (simReport) analysisPoints.push(`Sim 通过率: ${(simReport.coverageRate * 100).toFixed(1)}%`);
    if (shadowStats) analysisPoints.push(`干预率: ${(shadowStats.interventionRate * 100).toFixed(3)}%`);
    if (inconsistentDimensions.length > 0) {
      analysisPoints.push(`不一致维度: ${inconsistentDimensions.join(', ')}`);
    }

    return {
      consistencyScore,
      consistent,
      inconsistentDimensions,
      overallConfidence: consistencyScore * 0.8 + (inconsistentDimensions.length === 0 ? 0.2 : 0),
      analysis: analysisPoints.join(' | '),
    };
  }

  // ==========================================================================
  // 4. 综合推荐
  // ==========================================================================

  private generateRecommendation(
    realReport: FlywheelCycleReport | null,
    simReport: RegressionSuiteReport | null,
    crossValidation: CrossValidationResult,
    interventionRate: MultiWindowRate | null,
  ): PromotionRecommendation {
    const factors: { positive: string[]; negative: string[] } = { positive: [], negative: [] };

    // 因子 1: 交叉验证一致性
    if (crossValidation.consistent) {
      factors.positive.push('Real/Sim 交叉验证一致');
    } else {
      factors.negative.push(`交叉验证不一致 (${crossValidation.inconsistentDimensions.join(', ')})`);
    }

    // 因子 2: 影子评估
    if (realReport?.shadowEvaluation?.verdict === 'promote') {
      factors.positive.push('影子评估推荐提升');
    } else if (realReport?.shadowEvaluation?.verdict === 'reject') {
      factors.negative.push('影子评估拒绝提升');
    }

    // 因子 3: 回归测试
    if (simReport && simReport.coverageRate >= 0.9) {
      factors.positive.push(`回归测试通过率 ${(simReport.coverageRate * 100).toFixed(1)}%`);
    } else if (simReport && simReport.coverageRate < 0.8) {
      factors.negative.push(`回归测试通过率不足 ${(simReport.coverageRate * 100).toFixed(1)}%`);
    }

    // 因子 4: 干预率趋势
    if (interventionRate) {
      if (interventionRate.twentyFourHours.trend === 'improving') {
        factors.positive.push('24h 干预率趋势改善');
      } else if (interventionRate.twentyFourHours.trend === 'degrading') {
        factors.negative.push('24h 干预率趋势恶化');
      }
    }

    // 因子 5: 性能提升
    if (realReport?.performanceDelta && realReport.performanceDelta > 0) {
      factors.positive.push(`性能提升 +${(realReport.performanceDelta * 100).toFixed(2)}%`);
    }

    // 综合判断
    const positiveWeight = factors.positive.length;
    const negativeWeight = factors.negative.length * 1.5; // 负面因子权重更高
    const totalWeight = positiveWeight + negativeWeight;
    const confidence = totalWeight > 0 ? positiveWeight / totalWeight : 0.5;

    const shouldPromote = confidence >= this.config.autoPromoteThreshold &&
      crossValidation.consistent &&
      factors.negative.length === 0;

    const riskLevel: PromotionRecommendation['riskLevel'] =
      factors.negative.length >= 2 ? 'high' :
      factors.negative.length >= 1 ? 'medium' :
      'low';

    const nextSteps: string[] = [];
    if (shouldPromote) {
      nextSteps.push('启动金丝雀部署 (5% → 20% → 50% → 100%)');
      nextSteps.push('持续监控干预率 24h');
    } else {
      if (factors.negative.includes('回归测试通过率不足')) {
        nextSteps.push('增加仿真场景覆盖，修复失败用例');
      }
      if (factors.negative.includes('影子评估拒绝提升')) {
        nextSteps.push('分析影子评估失败原因，优化模型');
      }
      if (factors.negative.includes('24h 干预率趋势恶化')) {
        nextSteps.push('排查干预率上升原因，检查数据漂移');
      }
      nextSteps.push('等待下一个飞轮周期重新评估');
    }

    return {
      shouldPromote,
      reason: shouldPromote
        ? `所有验证维度通过: ${factors.positive.join('; ')}`
        : `存在风险因子: ${factors.negative.join('; ')}`,
      confidence,
      riskLevel,
      nextSteps,
    };
  }

  // ==========================================================================
  // 5. 查询方法
  // ==========================================================================

  getFlywheelState() {
    return this.realFlywheel.getState();
  }

  getInterventionRate() {
    return this.interventionEngine.computeMultiWindowRate();
  }
}
