/**
 * ============================================================================
 * 四维模块评分器 — ModuleEvaluator
 * ============================================================================
 *
 * 对平台每个算法模块进行四维综合评分：
 *   1. 技术维度 — 算法准确率 + 数据质量 + 故障模式覆盖率
 *   2. 业务维度 — 预警提前 + 误报率 + 采纳率 + 避免停机
 *   3. 进化维度 — 迭代速度 + 结晶率 + 假设成功率
 *   4. 成本维度 — 计算成本 + LLM 成本 + 维护工时（反向指标）
 *
 * 触发方式:
 *   - 定时: setInterval → evaluateAll('scheduled')
 *   - 事件: eventBus.subscribe('diagnosis.completed') → 增量评估
 *
 * 降级策略：各数据源不可用时使用默认值，不阻塞评分
 *
 * 架构位置: server/platform/evaluation/
 * 遵循: 单例+工厂 (getModuleEvaluator / resetModuleEvaluator)
 */

import { createModuleLogger } from '../../core/logger';
import { eventBus, TOPICS } from '../../services/eventBus.service';
import { AlgorithmEngine } from '../../algorithms/_core/engine';
import { getDataQualityScorer } from '../perception/quality/data-quality-scorer';
import { EvolutionMetricsCollector } from '../evolution/metrics/evolution-metrics';
import { KnowledgeCrystallizer } from '../evolution/crystallization/knowledge-crystallizer';
import { getBusinessEvaluator } from './business-evaluator';
import { getEvaluationConfig, EVALUATION_TOPICS } from './evaluation.config';
import type {
  ModuleScorecard,
  TechnicalScore,
  BusinessScore,
  EvolutionScore,
  CostScore,
  EvaluationTrigger,
  ScoreTrend,
  RegressingModule,
} from './evaluation.types';

const log = createModuleLogger('module-evaluator');

// ============================================================================
// 已知故障类型常量（港机设备通用故障分类）
// ============================================================================

const KNOWN_FAULT_TYPES = [
  'bearing_wear', 'gear_damage', 'shaft_misalignment', 'imbalance',
  'looseness', 'resonance', 'electrical_fault', 'insulation_degradation',
  'overload', 'overcurrent', 'voltage_imbalance', 'structural_fatigue',
  'corrosion', 'crack', 'deformation', 'brake_wear',
  'motor_overheat', 'lubrication_failure', 'seal_leak', 'cable_damage',
] as const;

// ============================================================================
// ModuleEvaluator
// ============================================================================

export class ModuleEvaluator {
  /** 评分卡历史（moduleId → scorecard 列表） */
  private scorecardHistory: Map<string, ModuleScorecard[]> = new Map();

  /** 定时器引用 */
  private scheduledTimer: ReturnType<typeof setInterval> | null = null;

  /** 事件订阅取消函数 */
  private unsubscribeFns: Array<() => void> = [];

  /** 进化指标收集器（延迟初始化） */
  private metricsCollector: EvolutionMetricsCollector | null = null;

  /** 知识结晶器（延迟初始化） */
  private crystallizer: KnowledgeCrystallizer | null = null;

  constructor() {
    this.setupTriggers();
  }

  // ==========================================================================
  // 触发器
  // ==========================================================================

  private setupTriggers(): void {
    const config = getEvaluationConfig();

    // 定时触发
    this.scheduledTimer = setInterval(() => {
      this.evaluateAll('scheduled').catch((err) => {
        log.error('[ModuleEvaluator] 定时评估失败', { error: String(err) });
      });
    }, config.scheduledIntervalMs);

    // 事件触发：诊断完成 → 增量评估
    try {
      const unsub = eventBus.subscribe(
        TOPICS.DIAGNOSIS_COMPLETED,
        async (event) => {
          const algorithmId = event.payload?.algorithmId as string | undefined;
          if (algorithmId) {
            log.debug('[ModuleEvaluator] 诊断完成，增量评估', { algorithmId });
            await this.evaluateModule(algorithmId, 'event_driven').catch((err) => {
              log.warn('[ModuleEvaluator] 增量评估失败', { algorithmId, error: String(err) });
            });
          }
        },
      );
      this.unsubscribeFns.push(unsub);
    } catch {
      log.debug('[ModuleEvaluator] EventBus 订阅降级');
    }

    log.info('[ModuleEvaluator] 触发器已设置', {
      intervalMs: config.scheduledIntervalMs,
    });
  }

  // ==========================================================================
  // 全量评估
  // ==========================================================================

  /**
   * 评估所有已注册算法模块
   */
  async evaluateAll(trigger: EvaluationTrigger): Promise<ModuleScorecard[]> {
    log.info('[ModuleEvaluator] 开始全量评估', { trigger });
    const startMs = Date.now();

    let engine: AlgorithmEngine;
    try {
      engine = AlgorithmEngine.getInstance();
    } catch {
      log.warn('[ModuleEvaluator] AlgorithmEngine 不可用，返回空评分');
      return [];
    }

    const algorithms = engine.listAlgorithms();
    if (algorithms.length === 0) {
      log.info('[ModuleEvaluator] 无已注册算法，跳过评估');
      return [];
    }

    const scorecards: ModuleScorecard[] = [];

    for (const algo of algorithms) {
      const scorecard = await this.evaluateModule(
        algo.metadata?.description ? `${algo.executor?.constructor?.name ?? 'unknown'}` : 'unknown',
        trigger,
        algo,
      );
      if (scorecard) {
        scorecards.push(scorecard);
      }
    }

    // 发布全量评估完成事件
    try {
      await eventBus.publish(
        EVALUATION_TOPICS.ALL_EVALUATED,
        'all_modules_evaluated',
        {
          totalModules: scorecards.length,
          avgScore: scorecards.length > 0
            ? scorecards.reduce((s, c) => s + c.overallScore, 0) / scorecards.length
            : 0,
          trigger,
        },
        { source: 'module-evaluator', severity: 'info' },
      );
    } catch {
      // EventBus 降级
    }

    log.info('[ModuleEvaluator] 全量评估完成', {
      totalModules: scorecards.length,
      elapsedMs: Date.now() - startMs,
    });

    return scorecards;
  }

  // ==========================================================================
  // 单模块评估
  // ==========================================================================

  /**
   * 评估单个模块
   */
  async evaluateModule(
    moduleId: string,
    trigger: EvaluationTrigger,
    algorithmReg?: unknown,
  ): Promise<ModuleScorecard | null> {
    const config = getEvaluationConfig();

    try {
      // 并行计算四维评分
      const [technical, business, evolution, cost] = await Promise.all([
        this.computeTechnicalScore(moduleId),
        this.computeBusinessScore(),
        this.computeEvolutionScore(),
        this.computeCostScore(moduleId),
      ]);

      // 综合总分
      const w = config.dimensionWeights;
      const overallScore = Math.round(
        technical.overall * w.technical +
        business.overall * w.business +
        evolution.overall * w.evolution +
        cost.overall * w.cost,
      );

      // 趋势判断
      const history = this.scorecardHistory.get(moduleId) ?? [];
      const previousScore = history.length > 0
        ? history[history.length - 1].overallScore
        : null;
      const trend = this.computeTrend(overallScore, previousScore, config.regressionThreshold);

      // 生成建议
      const suggestions = this.generateSuggestions(technical, business, evolution, cost);

      const scorecard: ModuleScorecard = {
        moduleId,
        moduleName: moduleId,
        category: this.inferCategory(moduleId),
        timestamp: Date.now(),
        trigger,
        technical,
        business,
        evolution,
        cost,
        overallScore,
        trend,
        previousScore,
        suggestions,
      };

      // 存储历史
      if (!this.scorecardHistory.has(moduleId)) {
        this.scorecardHistory.set(moduleId, []);
      }
      const arr = this.scorecardHistory.get(moduleId)!;
      arr.push(scorecard);
      // 保留最近 90 天数据
      if (arr.length > 90) {
        arr.splice(0, arr.length - 90);
      }

      // 发布模块评估事件
      try {
        await eventBus.publish(
          EVALUATION_TOPICS.MODULE_EVALUATED,
          'module_evaluated',
          {
            moduleId,
            overallScore,
            trend,
            technical: technical.overall,
            business: business.overall,
            evolution: evolution.overall,
            cost: cost.overall,
          },
          { source: 'module-evaluator', severity: 'info' },
        );
      } catch {
        // EventBus 降级
      }

      // 退步检测
      if (trend === 'regressing') {
        try {
          await eventBus.publish(
            EVALUATION_TOPICS.REGRESSION_DETECTED,
            'module_regression_detected',
            {
              moduleId,
              currentScore: overallScore,
              previousScore,
              delta: previousScore !== null ? overallScore - previousScore : 0,
            },
            { source: 'module-evaluator', severity: 'warning' },
          );
        } catch {
          // EventBus 降级
        }
      }

      return scorecard;
    } catch (err) {
      log.error('[ModuleEvaluator] 模块评估失败', { moduleId, error: String(err) });
      return null;
    }
  }

  // ==========================================================================
  // 技术维度评分
  // ==========================================================================

  private async computeTechnicalScore(moduleId: string): Promise<TechnicalScore> {
    const config = getEvaluationConfig();
    const tw = config.technicalWeights;

    // 1. 算法准确率
    let completionRate = 0;
    let avgConfidence = 0;
    try {
      const engine = AlgorithmEngine.getInstance();
      const history = engine.getExecutionHistory({ algorithmId: moduleId, limit: 100 });
      const completed = history.filter((h) => h.status === 'completed');
      completionRate = history.length > 0 ? completed.length / history.length : 0;

      if (completed.length > 0) {
        const totalConf = completed.reduce((sum, h) => {
          const conf = (h as unknown as Record<string, unknown>).confidence;
          return sum + (typeof conf === 'number' ? conf : 0.5);
        }, 0);
        avgConfidence = totalConf / completed.length;
      }
    } catch {
      log.debug('[ModuleEvaluator] AlgorithmEngine 不可用，准确率降级');
    }
    const algorithmAccuracy = Math.round(completionRate * avgConfidence * 100);

    // 2. 数据质量
    let rawDataQuality = 50; // 降级默认值
    try {
      const scorer = getDataQualityScorer();
      // 使用默认评分（无特定设备上下文时）
      const qualityResult = scorer.score({
        deviceId: moduleId,
        windowStartMs: Date.now() - config.evaluationWindowMs,
        windowEndMs: Date.now(),
        channels: {},
      });
      rawDataQuality = qualityResult.overall;
    } catch {
      log.debug('[ModuleEvaluator] DataQualityScorer 不可用，数据质量降级→50');
    }
    const dataQuality = rawDataQuality;

    // 3. 故障模式覆盖率
    let coveredFaultTypes = 0;
    const totalKnownFaultTypes = KNOWN_FAULT_TYPES.length;
    try {
      const engine = AlgorithmEngine.getInstance();
      const history = engine.getExecutionHistory({ algorithmId: moduleId, limit: 500 });
      const faultTypes = new Set<string>();
      for (const record of history) {
        const output = record as unknown as Record<string, unknown>;
        const diagnosis = output.diagnosis as Record<string, unknown> | undefined;
        if (diagnosis?.faultType && typeof diagnosis.faultType === 'string') {
          faultTypes.add(diagnosis.faultType);
        }
      }
      coveredFaultTypes = faultTypes.size;
    } catch {
      log.debug('[ModuleEvaluator] 故障模式覆盖率查询失败');
    }
    const faultModeCoverage = Math.round(
      (coveredFaultTypes / Math.max(totalKnownFaultTypes, 1)) * 100,
    );

    const overall = Math.round(
      algorithmAccuracy * tw.algorithmAccuracy +
      dataQuality * tw.dataQuality +
      faultModeCoverage * tw.faultModeCoverage,
    );

    return {
      overall,
      algorithmAccuracy,
      dataQuality,
      faultModeCoverage,
      details: {
        completionRate,
        avgConfidence,
        rawDataQuality,
        coveredFaultTypes,
        totalKnownFaultTypes,
      },
    };
  }

  // ==========================================================================
  // 业务维度评分
  // ==========================================================================

  private async computeBusinessScore(): Promise<BusinessScore> {
    const config = getEvaluationConfig();
    const bw = config.businessWeights;

    let kpis = getBusinessEvaluator().computeKPIs
      ? await getBusinessEvaluator().computeKPIs()
      : null;

    if (!kpis) {
      kpis = {
        earlyWarningLeadTimeDays: -1,
        avoidedDowntimeCount: 0,
        falseAlarmRate: 0,
        adoptionRate: 0,
        windowStartMs: Date.now() - config.evaluationWindowMs,
        windowEndMs: Date.now(),
        sampleSizes: {
          confirmedFailures: 0,
          predictiveMaintenances: 0,
          totalAlerts: 0,
          falsePositiveAlerts: 0,
          totalRecommendations: 0,
          followedRecommendations: 0,
        },
      };
    }

    // 评分公式
    const earlyWarningScore = kpis.earlyWarningLeadTimeDays >= 0
      ? Math.min(100, kpis.earlyWarningLeadTimeDays * 20)
      : 0;
    const falseAlarmScore = Math.max(0, (1 - kpis.falseAlarmRate * 5) * 100);
    const adoptionRateScore = kpis.adoptionRate * 100;
    const avoidedDowntimeScore = Math.min(100, kpis.avoidedDowntimeCount * 10);

    const overall = Math.round(
      earlyWarningScore * bw.earlyWarning +
      falseAlarmScore * bw.falseAlarm +
      adoptionRateScore * bw.adoptionRate +
      avoidedDowntimeScore * bw.avoidedDowntime,
    );

    return {
      overall,
      earlyWarningScore: Math.round(earlyWarningScore),
      falseAlarmScore: Math.round(falseAlarmScore),
      adoptionRateScore: Math.round(adoptionRateScore),
      avoidedDowntimeScore: Math.round(avoidedDowntimeScore),
      kpis,
    };
  }

  // ==========================================================================
  // 进化维度评分
  // ==========================================================================

  private async computeEvolutionScore(): Promise<EvolutionScore> {
    let iterationsPerWeek = 0;
    let totalCrystals = 0;
    let totalPatterns = 0;
    let testedHypotheses = 0;
    let succeededHypotheses = 0;

    // 飞轮指标
    try {
      if (!this.metricsCollector) {
        this.metricsCollector = new EvolutionMetricsCollector();
      }
      const dashboard = this.metricsCollector.getDashboardData();
      iterationsPerWeek = dashboard.flywheel.currentVelocity * 7; // velocity 是 /day
      totalCrystals = dashboard.knowledge.totalCrystals;
      totalPatterns = dashboard.knowledge.totalPatterns;
    } catch {
      log.debug('[ModuleEvaluator] EvolutionMetrics 不可用，进化维度降级');
    }

    // 知识结晶指标
    try {
      if (!this.crystallizer) {
        this.crystallizer = new KnowledgeCrystallizer();
      }
      const patterns = this.crystallizer.getPatterns();
      const crystals = this.crystallizer.getCrystallizedKnowledge();
      totalPatterns = Math.max(totalPatterns, patterns.length);
      totalCrystals = Math.max(totalCrystals, crystals.length);
    } catch {
      log.debug('[ModuleEvaluator] KnowledgeCrystallizer 不可用');
    }

    // 评分公式
    const velocityScore = Math.min(100, iterationsPerWeek * 20);
    const crystallizationRate = Math.round(
      (totalCrystals / Math.max(totalPatterns, 1)) * 100,
    );
    const hypothesisSuccess = testedHypotheses > 0
      ? Math.round((succeededHypotheses / testedHypotheses) * 100)
      : 50; // 默认

    const overall = Math.round(
      velocityScore * 0.40 +
      crystallizationRate * 0.30 +
      hypothesisSuccess * 0.30,
    );

    return {
      overall,
      improvementVelocityScore: Math.round(velocityScore),
      crystallizationRateScore: crystallizationRate,
      hypothesisSuccessRateScore: hypothesisSuccess,
      details: {
        iterationsPerWeek,
        totalCrystals,
        totalPatterns,
        testedHypotheses,
        succeededHypotheses,
      },
    };
  }

  // ==========================================================================
  // 成本维度评分（反向指标）
  // ==========================================================================

  private async computeCostScore(moduleId: string): Promise<CostScore> {
    let avgExecutionTimeMs = 0;
    let estimatedLlmCostUsd = 0;
    const maintenanceHours = 0; // 目前无法自动计算，默认 0

    try {
      const engine = AlgorithmEngine.getInstance();
      const stats = engine.getExecutionStats();
      avgExecutionTimeMs = stats.avgDurationMs;
    } catch {
      log.debug('[ModuleEvaluator] 执行统计不可用');
    }

    // LLM 成本估算：基于 token 使用量（简化估算）
    // 假设每次调用约 2000 tokens，单价 $0.003/1k tokens
    try {
      const engine = AlgorithmEngine.getInstance();
      const history = engine.getExecutionHistory({ algorithmId: moduleId, limit: 100 });
      const llmCalls = history.filter((h) => {
        const meta = h as unknown as Record<string, unknown>;
        return meta.usesLlm === true;
      }).length;
      estimatedLlmCostUsd = llmCalls * 2 * 0.003;
    } catch {
      // 降级
    }

    // 反向评分公式
    const computeScore = Math.max(0, 100 - avgExecutionTimeMs / 10);
    const llmScore = Math.max(0, 100 - estimatedLlmCostUsd * 1000);
    const maintenanceScore = Math.max(0, 100 - maintenanceHours * 10);

    const overall = Math.round(
      computeScore * 0.40 +
      llmScore * 0.35 +
      maintenanceScore * 0.25,
    );

    return {
      overall,
      computeCostScore: Math.round(computeScore),
      llmCostScore: Math.round(llmScore),
      maintenanceEffortScore: Math.round(maintenanceScore),
      details: {
        avgExecutionTimeMs,
        estimatedLlmCostUsd,
        maintenanceHours,
      },
    };
  }

  // ==========================================================================
  // 趋势判断
  // ==========================================================================

  private computeTrend(
    current: number,
    previous: number | null,
    threshold: number,
  ): ScoreTrend {
    if (previous === null) return 'stable';
    const delta = current - previous;
    if (delta > Math.abs(threshold)) return 'improving';
    if (delta < threshold) return 'regressing';
    return 'stable';
  }

  // ==========================================================================
  // 建议生成
  // ==========================================================================

  private generateSuggestions(
    technical: TechnicalScore,
    business: BusinessScore,
    evolution: EvolutionScore,
    cost: CostScore,
  ): string[] {
    const suggestions: string[] = [];

    if (technical.algorithmAccuracy < 60) {
      suggestions.push('算法准确率偏低，建议检查输入数据质量和算法参数配置');
    }
    if (technical.dataQuality < 60) {
      suggestions.push('数据质量不足，建议排查传感器健康状态和数据链路');
    }
    if (technical.faultModeCoverage < 30) {
      suggestions.push('故障模式覆盖率低，建议扩展诊断算法的故障类型支持');
    }
    if (business.falseAlarmScore < 50) {
      suggestions.push('误报率偏高，建议优化告警阈值或增加确认机制');
    }
    if (business.adoptionRateScore < 40) {
      suggestions.push('诊断建议采纳率低，建议提升建议的可操作性和准确性');
    }
    if (evolution.improvementVelocityScore < 20) {
      suggestions.push('进化迭代速度慢，建议增加实验频率或自动化实验流程');
    }
    if (cost.computeCostScore < 40) {
      suggestions.push('计算成本偏高，建议优化算法执行效率或启用批处理模式');
    }

    return suggestions;
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  private inferCategory(moduleId: string): string {
    if (moduleId.includes('mechanical') || moduleId.includes('vibration')) return 'mechanical';
    if (moduleId.includes('electrical') || moduleId.includes('current')) return 'electrical';
    if (moduleId.includes('structural')) return 'structural';
    if (moduleId.includes('anomaly')) return 'anomaly';
    return 'general';
  }

  // ==========================================================================
  // 公开查询接口
  // ==========================================================================

  /**
   * 获取指定模块的评分卡历史
   */
  getScorecardHistory(moduleId?: string): Map<string, ModuleScorecard[]> {
    if (moduleId) {
      const result = new Map<string, ModuleScorecard[]>();
      const history = this.scorecardHistory.get(moduleId);
      if (history) {
        result.set(moduleId, history);
      }
      return result;
    }
    return new Map(this.scorecardHistory);
  }

  /**
   * 获取最新一次评分卡
   */
  getLatestScorecards(): ModuleScorecard[] {
    const result: ModuleScorecard[] = [];
    for (const [, history] of this.scorecardHistory) {
      if (history.length > 0) {
        result.push(history[history.length - 1]);
      }
    }
    return result;
  }

  /**
   * 获取退步模块列表
   */
  getRegressingModules(): RegressingModule[] {
    const result: RegressingModule[] = [];
    const config = getEvaluationConfig();

    for (const [moduleId, history] of this.scorecardHistory) {
      if (history.length < 2) continue;
      const latest = history[history.length - 1];
      const previous = history[history.length - 2];

      if (latest.trend === 'regressing') {
        const regressingDimensions: string[] = [];
        if (latest.technical.overall < previous.technical.overall + config.regressionThreshold) {
          regressingDimensions.push('technical');
        }
        if (latest.business.overall < previous.business.overall + config.regressionThreshold) {
          regressingDimensions.push('business');
        }
        if (latest.evolution.overall < previous.evolution.overall + config.regressionThreshold) {
          regressingDimensions.push('evolution');
        }
        if (latest.cost.overall < previous.cost.overall + config.regressionThreshold) {
          regressingDimensions.push('cost');
        }

        result.push({
          moduleId,
          moduleName: latest.moduleName,
          currentScore: latest.overallScore,
          previousScore: previous.overallScore,
          delta: latest.overallScore - previous.overallScore,
          trend: latest.trend,
          regressingDimensions,
        });
      }
    }

    return result.sort((a, b) => a.delta - b.delta);
  }

  // ==========================================================================
  // 资源清理
  // ==========================================================================

  /**
   * 停止定时任务和事件订阅
   */
  dispose(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    for (const unsub of this.unsubscribeFns) {
      try { unsub(); } catch { /* ignore */ }
    }
    this.unsubscribeFns = [];
    log.debug('[ModuleEvaluator] 已清理资源');
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let _instance: ModuleEvaluator | null = null;

/** 获取 ModuleEvaluator 单例 */
export function getModuleEvaluator(): ModuleEvaluator {
  if (!_instance) {
    _instance = new ModuleEvaluator();
  }
  return _instance;
}

/** 重置单例（仅测试用） */
export function resetModuleEvaluator(): void {
  if (_instance) {
    _instance.dispose();
  }
  _instance = null;
  log.debug('[ModuleEvaluator] 单例已重置');
}
