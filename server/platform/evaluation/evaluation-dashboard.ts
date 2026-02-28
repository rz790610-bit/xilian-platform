/**
 * ============================================================================
 * 评估仪表盘 — EvaluationDashboard
 * ============================================================================
 *
 * 并行聚合所有评估数据，生成统一仪表盘视图：
 *   - 模块评分趋势（30 天）
 *   - 分类占比趋势
 *   - 组合推荐（按设备类型）
 *   - 退步模块列表
 *   - 平台概览汇总
 *   - 业务 KPI 概览
 *   - 可选: LLM 自然语言摘要（降级→null）
 *
 * 缓存策略：5 分钟 TTL
 *
 * 架构位置: server/platform/evaluation/
 * 遵循: 单例+工厂 (getEvaluationDashboard / resetEvaluationDashboard)
 */

import { createModuleLogger } from '../../core/logger';
import { invokeLLM } from '../../core/llm';
import { AlgorithmEngine } from '../../algorithms/_core/engine';
import { eventBus } from '../../services/eventBus.service';
import { getModuleEvaluator } from './module-evaluator';
import { getCombinationOptimizer } from './combination-optimizer';
import { getBusinessEvaluator } from './business-evaluator';
import { EVALUATION_TOPICS } from './evaluation.config';
import type {
  EvaluationDashboardData,
  ModuleScoreTrend,
  CategoryProportionEntry,
  CombinationRecommendationReport,
  RegressingModule,
  PlatformSummary,
  BusinessKpiSummary,
  PortDeviceType,
} from './evaluation.types';

const log = createModuleLogger('evaluation-dashboard');

// ============================================================================
// 主要设备类型（用于组合推荐）
// ============================================================================

const PRIMARY_DEVICE_TYPES: PortDeviceType[] = ['STS', 'RTG', 'RMG'];

// ============================================================================
// EvaluationDashboard
// ============================================================================

export class EvaluationDashboard {
  /** 缓存 */
  private cache: { data: EvaluationDashboardData; expiresAt: number } | null = null;

  /** 缓存 TTL (ms) — 5 分钟 */
  private readonly cacheTtlMs = 5 * 60 * 1000;

  /**
   * 获取仪表盘完整数据
   */
  async getDashboardData(): Promise<EvaluationDashboardData> {
    const now = Date.now();

    // 检查缓存
    if (this.cache && this.cache.expiresAt > now) {
      log.debug('[EvaluationDashboard] 命中缓存');
      return this.cache.data;
    }

    log.info('[EvaluationDashboard] 开始聚合仪表盘数据');
    const startMs = Date.now();

    // 并行聚合 6 个数据源
    const [
      scoreTrends,
      categoryProportions,
      combinationRecommendations,
      regressingModules,
      platformSummary,
      businessKpiSummary,
    ] = await Promise.all([
      this.getScoreTrends(),
      this.getCategoryProportions(),
      this.getCombinationRecommendations(),
      this.getRegressingModules(),
      this.getPlatformSummary(),
      this.getBusinessKpiSummary(),
    ]);

    // 可选：LLM 自然语言摘要
    const aiSummary = await this.generateAiSummary(
      platformSummary,
      businessKpiSummary,
      regressingModules,
    );

    const dashboardData: EvaluationDashboardData = {
      scoreTrends,
      categoryProportions,
      combinationRecommendations,
      regressingModules,
      platformSummary,
      businessKpiSummary,
      aiSummary,
      generatedAt: now,
    };

    // 缓存
    this.cache = { data: dashboardData, expiresAt: now + this.cacheTtlMs };

    // 发布事件
    try {
      await eventBus.publish(
        EVALUATION_TOPICS.DASHBOARD_GENERATED,
        'dashboard_generated',
        {
          totalModules: scoreTrends.length,
          regressingCount: regressingModules.length,
          avgScore: platformSummary.avgOverallScore,
          hasAiSummary: aiSummary !== null,
        },
        { source: 'evaluation-dashboard', severity: 'info' },
      );
    } catch {
      // EventBus 降级
    }

    log.info('[EvaluationDashboard] 仪表盘数据聚合完成', {
      elapsedMs: Date.now() - startMs,
      modules: scoreTrends.length,
    });

    return dashboardData;
  }

  // ==========================================================================
  // 模块评分趋势（30 天）
  // ==========================================================================

  private async getScoreTrends(): Promise<ModuleScoreTrend[]> {
    try {
      const evaluator = getModuleEvaluator();
      const allHistory = evaluator.getScorecardHistory();
      const trends: ModuleScoreTrend[] = [];

      for (const [moduleId, scorecards] of allHistory) {
        if (scorecards.length === 0) continue;

        // 最近 30 天的评分点
        const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
        const recent = scorecards.filter((s) => s.timestamp >= thirtyDaysAgo);

        trends.push({
          moduleId,
          moduleName: recent.length > 0 ? recent[recent.length - 1].moduleName : moduleId,
          scores: recent.map((s) => ({
            date: new Date(s.timestamp).toISOString().slice(0, 10),
            technical: s.technical.overall,
            business: s.business.overall,
            evolution: s.evolution.overall,
            cost: s.cost.overall,
            overall: s.overallScore,
          })),
        });
      }

      return trends;
    } catch (err) {
      log.warn('[EvaluationDashboard] 获取评分趋势失败', { error: String(err) });
      return [];
    }
  }

  // ==========================================================================
  // 分类占比趋势
  // ==========================================================================

  private async getCategoryProportions(): Promise<CategoryProportionEntry[]> {
    try {
      let categories: string[] = [];
      try {
        const engine = AlgorithmEngine.getInstance();
        categories = engine.getCategories();
      } catch {
        categories = ['mechanical', 'electrical', 'structural', 'anomaly', 'general'];
      }

      const evaluator = getModuleEvaluator();
      const allHistory = evaluator.getScorecardHistory();

      // 按日期聚合
      const byDate = new Map<string, Map<string, number[]>>();

      for (const [, scorecards] of allHistory) {
        for (const sc of scorecards) {
          const date = new Date(sc.timestamp).toISOString().slice(0, 10);
          if (!byDate.has(date)) {
            byDate.set(date, new Map());
          }
          const dateMap = byDate.get(date)!;
          const cat = sc.category || 'general';
          if (!dateMap.has(cat)) {
            dateMap.set(cat, []);
          }
          dateMap.get(cat)!.push(sc.overallScore);
        }
      }

      const entries: CategoryProportionEntry[] = [];
      for (const [date, catMap] of byDate) {
        const categoriesObj: Record<string, number> = {};
        let totalScore = 0;

        for (const [cat, scores] of catMap) {
          const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
          categoriesObj[cat] = avg;
          totalScore += avg;
        }

        // 归一化为占比
        if (totalScore > 0) {
          for (const cat of Object.keys(categoriesObj)) {
            categoriesObj[cat] = Math.round((categoriesObj[cat] / totalScore) * 1000) / 1000;
          }
        }

        entries.push({ date, categories: categoriesObj });
      }

      return entries.sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      log.warn('[EvaluationDashboard] 获取分类占比失败', { error: String(err) });
      return [];
    }
  }

  // ==========================================================================
  // 组合推荐（按设备类型）
  // ==========================================================================

  private async getCombinationRecommendations(): Promise<CombinationRecommendationReport[]> {
    const reports: CombinationRecommendationReport[] = [];
    const optimizer = getCombinationOptimizer();

    for (const deviceType of PRIMARY_DEVICE_TYPES) {
      try {
        const report = await optimizer.optimize({
          deviceType,
          dataQualityGrade: 'B', // 默认使用 B 级质量作为推荐基准
          latencyRequirement: 'near-realtime',
        });
        reports.push(report);
      } catch (err) {
        log.warn('[EvaluationDashboard] 组合推荐失败', { deviceType, error: String(err) });
      }
    }

    return reports;
  }

  // ==========================================================================
  // 退步模块
  // ==========================================================================

  private async getRegressingModules(): Promise<RegressingModule[]> {
    try {
      return getModuleEvaluator().getRegressingModules();
    } catch (err) {
      log.warn('[EvaluationDashboard] 获取退步模块失败', { error: String(err) });
      return [];
    }
  }

  // ==========================================================================
  // 平台概览
  // ==========================================================================

  private async getPlatformSummary(): Promise<PlatformSummary> {
    try {
      const scorecards = getModuleEvaluator().getLatestScorecards();
      if (scorecards.length === 0) {
        return {
          improvingCount: 0,
          stableCount: 0,
          regressingCount: 0,
          avgOverallScore: 0,
          bestModule: null,
          worstModule: null,
        };
      }

      let improvingCount = 0;
      let stableCount = 0;
      let regressingCount = 0;

      for (const sc of scorecards) {
        switch (sc.trend) {
          case 'improving': improvingCount++; break;
          case 'regressing': regressingCount++; break;
          default: stableCount++; break;
        }
      }

      const avgOverallScore = Math.round(
        scorecards.reduce((s, c) => s + c.overallScore, 0) / scorecards.length,
      );

      const sorted = [...scorecards].sort((a, b) => b.overallScore - a.overallScore);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      return {
        improvingCount,
        stableCount,
        regressingCount,
        avgOverallScore,
        bestModule: best
          ? { moduleId: best.moduleId, moduleName: best.moduleName, score: best.overallScore }
          : null,
        worstModule: worst
          ? { moduleId: worst.moduleId, moduleName: worst.moduleName, score: worst.overallScore }
          : null,
      };
    } catch (err) {
      log.warn('[EvaluationDashboard] 获取平台概览失败', { error: String(err) });
      return {
        improvingCount: 0,
        stableCount: 0,
        regressingCount: 0,
        avgOverallScore: 0,
        bestModule: null,
        worstModule: null,
      };
    }
  }

  // ==========================================================================
  // 业务 KPI 概览
  // ==========================================================================

  private async getBusinessKpiSummary(): Promise<BusinessKpiSummary> {
    try {
      const kpis = await getBusinessEvaluator().computeKPIs();
      const windowDays = Math.round(
        (kpis.windowEndMs - kpis.windowStartMs) / 86_400_000,
      );

      return {
        earlyWarningDays: kpis.earlyWarningLeadTimeDays,
        avoidedDowntimes: kpis.avoidedDowntimeCount,
        falseAlarmRate: kpis.falseAlarmRate,
        adoptionRate: kpis.adoptionRate,
        windowDescription: `最近 ${windowDays} 天`,
      };
    } catch (err) {
      log.warn('[EvaluationDashboard] 获取业务 KPI 失败', { error: String(err) });
      return {
        earlyWarningDays: -1,
        avoidedDowntimes: 0,
        falseAlarmRate: 0,
        adoptionRate: 0,
        windowDescription: '数据不可用',
      };
    }
  }

  // ==========================================================================
  // AI 自然语言摘要（可选，降级→null）
  // ==========================================================================

  private async generateAiSummary(
    summary: PlatformSummary,
    kpi: BusinessKpiSummary,
    regressing: RegressingModule[],
  ): Promise<string | null> {
    try {
      const prompt = `你是习联港机智能运维平台的评估分析师。请用简洁的中文（3-5 句话）总结以下平台评估状态：

平台概览：
- 改进中 ${summary.improvingCount} 个模块，稳定 ${summary.stableCount} 个，退步 ${summary.regressingCount} 个
- 平均分 ${summary.avgOverallScore}/100
${summary.bestModule ? `- 最佳: ${summary.bestModule.moduleName} (${summary.bestModule.score}分)` : ''}
${summary.worstModule ? `- 最差: ${summary.worstModule.moduleName} (${summary.worstModule.score}分)` : ''}

业务 KPI：
- 预警提前 ${kpi.earlyWarningDays >= 0 ? kpi.earlyWarningDays + ' 天' : '无数据'}
- 避免停机 ${kpi.avoidedDowntimes} 次
- 误报率 ${(kpi.falseAlarmRate * 100).toFixed(1)}%
- 采纳率 ${(kpi.adoptionRate * 100).toFixed(1)}%

${regressing.length > 0 ? `退步模块：${regressing.map((r) => `${r.moduleName}(${r.delta > 0 ? '+' : ''}${r.delta}分, 退步维度: ${r.regressingDimensions.join('/')})`).join('、')}` : '无退步模块'}

请给出评估摘要和 1 条最重要的改进建议。`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是一个工业设备智能运维平台的评估分析师，输出简洁专业的中文摘要。' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 500,
      });

      const content = result.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.length > 0) {
        return content;
      }
      return null;
    } catch (err) {
      log.debug('[EvaluationDashboard] LLM 摘要降级→null', { error: String(err) });
      return null;
    }
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache = null;
    log.debug('[EvaluationDashboard] 缓存已清空');
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let _instance: EvaluationDashboard | null = null;

/** 获取 EvaluationDashboard 单例 */
export function getEvaluationDashboard(): EvaluationDashboard {
  if (!_instance) {
    _instance = new EvaluationDashboard();
  }
  return _instance;
}

/** 重置单例（仅测试用） */
export function resetEvaluationDashboard(): void {
  _instance = null;
  log.debug('[EvaluationDashboard] 单例已重置');
}
