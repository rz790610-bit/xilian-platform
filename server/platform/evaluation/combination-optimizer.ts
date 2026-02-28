/**
 * ============================================================================
 * 算法组合优化器 — CombinationOptimizer
 * ============================================================================
 *
 * 给定设备类型和数据质量约束，推荐最优算法组合：
 *   1. 加载历史诊断案例（已确认）
 *   2. 检查数据质量，生成告警
 *   3. 生成候选组合（枚举 + 过滤）
 *   4. 回放评估（逐案例执行 + 对比已知结果）
 *   5. Bootstrap 置信区间
 *   6. 排序取 Top-N
 *
 * 降级策略：
 *   - DB 不可用 → 返回空报告+告警
 *   - AlgorithmEngine 不可用 → 返回"无算法"
 *
 * 架构位置: server/platform/evaluation/
 * 遵循: 单例+工厂 (getCombinationOptimizer / resetCombinationOptimizer)
 */

import { createModuleLogger } from '../../core/logger';
import { getDb } from '../../lib/db';
import { eventBus } from '../../services/eventBus.service';
import { AlgorithmEngine } from '../../algorithms/_core/engine';
import { diagnosisResults, anomalyDetections } from '../../../drizzle/schema';
import { and, gte, lte, eq, isNotNull } from 'drizzle-orm';
import { getEvaluationConfig, EVALUATION_TOPICS } from './evaluation.config';
import type {
  CombinationConstraints,
  AlgorithmCombination,
  CombinationEvaluation,
  CombinationRecommendationReport,
} from './evaluation.types';

const log = createModuleLogger('combination-optimizer');

// ============================================================================
// 历史案例类型
// ============================================================================

interface HistoricalCase {
  deviceCode: string;
  faultCode: string;
  severity: string;
  confidence: number;
  createdAt: Date;
}

// ============================================================================
// CombinationOptimizer
// ============================================================================

export class CombinationOptimizer {
  /** 结果缓存 (constraintKey → report) */
  private cache: Map<string, { report: CombinationRecommendationReport; expiresAt: number }> = new Map();

  /** 缓存 TTL (ms) — 1 小时 */
  private readonly cacheTtlMs = 60 * 60 * 1000;

  /**
   * 执行组合优化
   */
  async optimize(constraints: CombinationConstraints): Promise<CombinationRecommendationReport> {
    const config = getEvaluationConfig();
    const opConfig = config.combinationOptimizer;
    const now = Date.now();

    // 1. 检查缓存
    const cacheKey = this.buildCacheKey(constraints);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      log.debug('[CombinationOptimizer] 命中缓存', { cacheKey });
      return cached.report;
    }

    const warnings: string[] = [];

    // 2. 加载历史案例
    const cases = await this.loadHistoricalCases(
      constraints.deviceType,
      config.evaluationWindowMs,
    );

    // 3. 数据质量检查
    if (cases.length < opConfig.minHistoricalCases) {
      warnings.push(
        `历史案例不足: ${cases.length}/${opConfig.minHistoricalCases}，推荐结果置信度较低`,
      );
    }
    if (constraints.dataQualityGrade === 'D' || constraints.dataQualityGrade === 'F') {
      warnings.push(
        `数据质量等级为 ${constraints.dataQualityGrade}，部分复杂算法将被排除`,
      );
    }

    // 4. 生成候选组合
    const candidates = this.generateCandidates(constraints, opConfig.maxCombinationsPerDeviceType);
    if (candidates.length === 0) {
      const emptyReport = this.buildEmptyReport(constraints, warnings);
      this.cache.set(cacheKey, { report: emptyReport, expiresAt: now + this.cacheTtlMs });
      return emptyReport;
    }

    // 5. 评估每个候选组合
    const evaluations: CombinationEvaluation[] = [];

    for (const combination of candidates) {
      const evaluation = await this.evaluateCombination(
        combination,
        cases,
        constraints,
        config,
      );
      if (evaluation) {
        evaluations.push(evaluation);
      }
    }

    // 6. 排序取 Top-N
    evaluations.sort((a, b) => b.score - a.score);
    const topN = evaluations.slice(0, opConfig.topN);

    const report: CombinationRecommendationReport = {
      reportId: `combo_report_${now}`,
      constraints,
      totalCandidates: candidates.length,
      recommendations: topN,
      dataQualityWarnings: warnings,
      generatedAt: now,
    };

    // 缓存
    this.cache.set(cacheKey, { report, expiresAt: now + this.cacheTtlMs });

    // 发布事件
    try {
      await eventBus.publish(
        EVALUATION_TOPICS.COMBINATION_OPTIMIZED,
        'combination_optimized',
        {
          deviceType: constraints.deviceType,
          totalCandidates: candidates.length,
          topScore: topN.length > 0 ? topN[0].score : 0,
          warnings: warnings.length,
        },
        { source: 'combination-optimizer', severity: 'info' },
      );
    } catch {
      // EventBus 降级
    }

    log.info('[CombinationOptimizer] 优化完成', {
      deviceType: constraints.deviceType,
      candidates: candidates.length,
      evaluated: evaluations.length,
      topScore: topN.length > 0 ? topN[0].score : 0,
    });

    return report;
  }

  // ==========================================================================
  // 加载历史案例
  // ==========================================================================

  private async loadHistoricalCases(
    deviceType: string,
    windowMs: number,
  ): Promise<HistoricalCase[]> {
    try {
      const db = await getDb();
      if (!db) {
        log.warn('[CombinationOptimizer] DB 不可用，无法加载历史案例');
        return [];
      }

      const windowStart = new Date(Date.now() - windowMs);

      // 查询已确认的诊断结果
      const rows = await db
        .select({
          deviceCode: diagnosisResults.deviceCode,
          faultCode: diagnosisResults.faultCode,
          severity: diagnosisResults.severity,
          confidence: diagnosisResults.confidence,
          createdAt: diagnosisResults.createdAt,
        })
        .from(diagnosisResults)
        .where(
          and(
            gte(diagnosisResults.createdAt, windowStart),
            isNotNull(diagnosisResults.faultCode),
            eq(diagnosisResults.resolved, 1), // 仅已确认案例
          ),
        )
        .limit(1000);

      // 按设备类型前缀过滤（设备编码通常包含类型标识）
      const filtered = rows.filter((r) => {
        const code = r.deviceCode.toUpperCase();
        return code.includes(deviceType) || deviceType === 'OTHER';
      });

      return filtered.map((r) => ({
        deviceCode: r.deviceCode,
        faultCode: r.faultCode ?? '',
        severity: r.severity,
        confidence: r.confidence ?? 0,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      log.warn('[CombinationOptimizer] 历史案例加载失败', { error: String(err) });
      return [];
    }
  }

  // ==========================================================================
  // 生成候选组合
  // ==========================================================================

  private generateCandidates(
    constraints: CombinationConstraints,
    maxCombinations: number,
  ): AlgorithmCombination[] {
    let engine: AlgorithmEngine;
    try {
      engine = AlgorithmEngine.getInstance();
    } catch {
      log.warn('[CombinationOptimizer] AlgorithmEngine 不可用');
      return [];
    }

    // 获取适用的算法列表
    const allAlgorithms = engine.listAlgorithms({
      deviceType: constraints.deviceType,
    });

    if (allAlgorithms.length === 0) {
      return [];
    }

    // 过滤：按数据质量排除高复杂度算法
    const qualityFiltered = allAlgorithms.filter((algo) => {
      if (
        (constraints.dataQualityGrade === 'D' || constraints.dataQualityGrade === 'F') &&
        algo.metadata?.complexity === 'high'
      ) {
        return false;
      }
      return true;
    });

    // 过滤：按延迟要求排除不兼容算法
    const latencyFiltered = qualityFiltered.filter((algo) => {
      const tags = algo.metadata?.tags ?? [];
      if (constraints.latencyRequirement === 'realtime' && tags.includes('batch')) {
        return false;
      }
      return true;
    });

    // 过滤：按允许的分类
    const categoryFiltered = constraints.allowedCategories
      ? latencyFiltered.filter((algo) => {
          const tags = algo.metadata?.tags ?? [];
          return tags.some((t: string) => constraints.allowedCategories!.includes(t));
        })
      : latencyFiltered;

    const available = categoryFiltered;
    if (available.length === 0) return [];

    // 分组：按分类
    const byCategory = new Map<string, typeof available>();
    for (const algo of available) {
      const category = algo.metadata?.tags?.[0] ?? 'general';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(algo);
    }

    // 分类标记
    const mechanicalAlgos = available.filter((a) =>
      a.metadata?.tags?.some((t: string) => t.includes('mechanical') || t.includes('vibration')),
    );
    const anomalyAlgos = available.filter((a) =>
      a.metadata?.tags?.some((t: string) => t.includes('anomaly')),
    );

    // 组合生成：每组 2-5 个算法
    const maxPerCombination = constraints.maxAlgorithmsPerCombination ?? 5;
    const minPerCombination = 2;
    const combinations: AlgorithmCombination[] = [];

    // 策略：贪心 + 随机采样
    const maxAttempts = maxCombinations * 3;
    const seen = new Set<string>();

    for (let attempt = 0; attempt < maxAttempts && combinations.length < maxCombinations; attempt++) {
      const size = minPerCombination + Math.floor(Math.random() * (maxPerCombination - minPerCombination + 1));
      const selected: typeof available = [];

      // 必须包含 1 个 mechanical（如果有）
      if (mechanicalAlgos.length > 0) {
        selected.push(mechanicalAlgos[Math.floor(Math.random() * mechanicalAlgos.length)]);
      }

      // 必须包含 1 个 anomaly（如果有）
      if (anomalyAlgos.length > 0) {
        const anomaly = anomalyAlgos[Math.floor(Math.random() * anomalyAlgos.length)];
        if (!selected.some((s) => s === anomaly)) {
          selected.push(anomaly);
        }
      }

      // 包含必须的算法
      if (constraints.requiredAlgorithms) {
        for (const reqId of constraints.requiredAlgorithms) {
          const found = available.find((a) => {
            const executor = a.executor;
            return executor && (executor as unknown as Record<string, string>).id === reqId;
          });
          if (found && !selected.includes(found)) {
            selected.push(found);
          }
        }
      }

      // 补齐到目标大小
      while (selected.length < size && selected.length < available.length) {
        const candidate = available[Math.floor(Math.random() * available.length)];
        if (!selected.includes(candidate)) {
          selected.push(candidate);
        }
      }

      // 去重
      const ids = selected
        .map((s) => (s.executor as unknown as Record<string, string>)?.id ?? s.metadata?.description ?? '')
        .filter(Boolean)
        .sort();
      const key = ids.join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const categories = new Set<string>();
      for (const s of selected) {
        for (const tag of s.metadata?.tags ?? []) {
          categories.add(tag);
        }
      }

      combinations.push({
        combinationId: `combo_${combinations.length}_${Date.now()}`,
        algorithmIds: ids,
        algorithmNames: selected.map(
          (s) => s.metadata?.description ?? (s.executor as unknown as Record<string, string>)?.id ?? 'unknown',
        ),
        coveredCategories: Array.from(categories),
      });
    }

    log.debug('[CombinationOptimizer] 候选组合生成', {
      available: available.length,
      generated: combinations.length,
    });

    return combinations;
  }

  // ==========================================================================
  // 组合评估
  // ==========================================================================

  private async evaluateCombination(
    combination: AlgorithmCombination,
    cases: HistoricalCase[],
    constraints: CombinationConstraints,
    config: ReturnType<typeof getEvaluationConfig>,
  ): Promise<CombinationEvaluation | null> {
    if (cases.length === 0) {
      // 无案例时给出默认评分
      return this.buildDefaultEvaluation(combination, constraints);
    }

    let engine: AlgorithmEngine;
    try {
      engine = AlgorithmEngine.getInstance();
    } catch {
      return null;
    }

    const sw = config.combinationScoringWeights;
    let correctCount = 0;
    let totalExecutionTimeMs = 0;
    const coveredFaults = new Set<string>();

    // 逐案例回放
    for (const kase of cases) {
      try {
        const steps = combination.algorithmIds.map((algId) => ({
          algorithmId: algId,
        }));

        const result = await engine.executeComposition(
          steps,
          {
            data: [],
            equipment: { type: constraints.deviceType },
            context: { deviceCode: kase.deviceCode },
          },
          { timeout: 30000 },
        );

        const finalDiagnosis = result.finalOutput?.diagnosis;
        if (finalDiagnosis?.faultType) {
          coveredFaults.add(finalDiagnosis.faultType);
          if (finalDiagnosis.faultType === kase.faultCode) {
            correctCount++;
          }
        }

        totalExecutionTimeMs += result.finalOutput?.metadata?.executionTimeMs ?? 0;
      } catch {
        // 单案例失败不中断
      }
    }

    // 评分
    const accuracy = cases.length > 0 ? (correctCount / cases.length) * 100 : 0;
    const coverage = (coveredFaults.size / Math.max(new Set(cases.map((c) => c.faultCode)).size, 1)) * 100;
    const avgTimeMs = cases.length > 0 ? totalExecutionTimeMs / cases.length : 0;
    const latencyScore = Math.max(0, 100 - avgTimeMs / 10);
    const costScore = Math.max(0, 100 - combination.algorithmIds.length * 15);

    const score = Math.round(
      accuracy * sw.accuracy +
      coverage * sw.coverage +
      latencyScore * sw.latency +
      costScore * sw.cost,
    );

    // Bootstrap 置信区间
    const ci = this.computeConfidenceInterval(
      cases,
      combination,
      correctCount,
      config.combinationOptimizer.bootstrapSamples,
    );

    return {
      combination,
      score,
      accuracy: Math.round(accuracy),
      coverage: Math.round(coverage),
      latencyScore: Math.round(latencyScore),
      costScore: Math.round(costScore),
      confidence: cases.length >= config.combinationOptimizer.minHistoricalCases ? 0.8 : 0.4,
      confidenceInterval: ci,
      replayStats: {
        totalCases: cases.length,
        correctDiagnoses: correctCount,
        avgExecutionTimeMs: Math.round(avgTimeMs),
      },
    };
  }

  // ==========================================================================
  // Bootstrap 置信区间
  // ==========================================================================

  private computeConfidenceInterval(
    cases: HistoricalCase[],
    _combination: AlgorithmCombination,
    correctCount: number,
    bootstrapSamples: number,
  ): { lower: number; upper: number } {
    if (cases.length === 0) {
      return { lower: 0, upper: 0 };
    }

    const baseAccuracy = correctCount / cases.length;
    const accuracies: number[] = [];

    // Bootstrap 重采样
    for (let i = 0; i < bootstrapSamples; i++) {
      let sampleCorrect = 0;
      for (let j = 0; j < cases.length; j++) {
        // 重采样：基于 baseAccuracy 的伯努利采样
        if (Math.random() < baseAccuracy) {
          sampleCorrect++;
        }
      }
      accuracies.push((sampleCorrect / cases.length) * 100);
    }

    accuracies.sort((a, b) => a - b);

    // 5th 和 95th 百分位
    const lowerIdx = Math.floor(accuracies.length * 0.05);
    const upperIdx = Math.floor(accuracies.length * 0.95);

    return {
      lower: Math.round(accuracies[lowerIdx] ?? 0),
      upper: Math.round(accuracies[upperIdx] ?? 100),
    };
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  private buildDefaultEvaluation(
    combination: AlgorithmCombination,
    _constraints: CombinationConstraints,
  ): CombinationEvaluation {
    return {
      combination,
      score: 50,
      accuracy: 50,
      coverage: combination.coveredCategories.length * 15,
      latencyScore: 70,
      costScore: Math.max(0, 100 - combination.algorithmIds.length * 15),
      confidence: 0.2,
      confidenceInterval: { lower: 20, upper: 80 },
      replayStats: {
        totalCases: 0,
        correctDiagnoses: 0,
        avgExecutionTimeMs: 0,
      },
    };
  }

  private buildEmptyReport(
    constraints: CombinationConstraints,
    warnings: string[],
  ): CombinationRecommendationReport {
    warnings.push('无可用的算法组合，请检查 AlgorithmEngine 注册状态');
    return {
      reportId: `combo_report_${Date.now()}`,
      constraints,
      totalCandidates: 0,
      recommendations: [],
      dataQualityWarnings: warnings,
      generatedAt: Date.now(),
    };
  }

  private buildCacheKey(constraints: CombinationConstraints): string {
    return `${constraints.deviceType}:${constraints.dataQualityGrade}:${constraints.latencyRequirement}:${constraints.allowedCategories?.join(',') ?? 'all'}`;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    log.debug('[CombinationOptimizer] 缓存已清空');
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let _instance: CombinationOptimizer | null = null;

/** 获取 CombinationOptimizer 单例 */
export function getCombinationOptimizer(): CombinationOptimizer {
  if (!_instance) {
    _instance = new CombinationOptimizer();
  }
  return _instance;
}

/** 重置单例（仅测试用） */
export function resetCombinationOptimizer(): void {
  _instance = null;
  log.debug('[CombinationOptimizer] 单例已重置');
}
