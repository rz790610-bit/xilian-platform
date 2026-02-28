/**
 * ============================================================================
 * 业务 KPI 评估器 — BusinessEvaluator
 * ============================================================================
 *
 * 计算平台端到端的业务价值 KPI：
 *   1. 预警提前时间 — median(maintenance.startedAt - alert.createdAt)
 *   2. 避免停机次数 — count(predictive维护 where 后30天无 unplannedDowntime)
 *   3. 误报率 — count(false_positive) / count(total)
 *   4. 采纳率 — count(30天内有匹配维护的诊断) / count(有建议的诊断)
 *
 * 降级策略：DB 不可用时返回默认 KPI（-1/0 标记）
 * 缓存策略：30 分钟 TTL
 *
 * 架构位置: server/platform/evaluation/
 * 遵循: 单例+工厂 (getBusinessEvaluator / resetBusinessEvaluator)
 */

import { createModuleLogger } from '../../core/logger';
import { getDb } from '../../lib/db';
import { eventBus } from '../../services/eventBus.service';
import {
  deviceAlerts,
  deviceMaintenanceRecords,
  anomalyDetections,
  diagnosisResults,
  deviceKpis,
} from '../../../drizzle/schema';
import { sql, and, gte, lte, eq, isNotNull } from 'drizzle-orm';
import { getEvaluationConfig, EVALUATION_TOPICS } from './evaluation.config';
import type { BusinessKPIs, BusinessEvaluatorOptions } from './evaluation.types';

const log = createModuleLogger('business-evaluator');

// ============================================================================
// 降级安全 DB 查询包装
// ============================================================================

/**
 * 安全执行数据库查询，失败时返回 fallback 值
 */
async function safeDbQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log.warn(`[BusinessEvaluator] DB 查询降级: ${label}`, { error: String(err) });
    return fallback;
  }
}

// ============================================================================
// 默认 KPI（降级标记）
// ============================================================================

function createDefaultKPIs(windowStartMs: number, windowEndMs: number): BusinessKPIs {
  return {
    earlyWarningLeadTimeDays: -1,
    avoidedDowntimeCount: 0,
    falseAlarmRate: 0,
    adoptionRate: 0,
    windowStartMs,
    windowEndMs,
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

// ============================================================================
// BusinessEvaluator
// ============================================================================

export class BusinessEvaluator {
  /** 缓存 */
  private cache: Map<string, { data: BusinessKPIs; expiresAt: number }> = new Map();
  /** 缓存 TTL (ms) */
  private readonly cacheTtlMs = 30 * 60 * 1000; // 30 分钟

  /**
   * 计算业务 KPI
   */
  async computeKPIs(options?: BusinessEvaluatorOptions): Promise<BusinessKPIs> {
    const config = getEvaluationConfig();
    const now = Date.now();
    const windowMs = options?.windowMs ?? config.evaluationWindowMs;
    const windowStartMs = now - windowMs;
    const windowEndMs = now;

    // 缓存键
    const cacheKey = `${options?.deviceType ?? 'all'}:${options?.deviceCode ?? 'all'}:${windowMs}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      log.debug('[BusinessEvaluator] 命中缓存', { cacheKey });
      return cached.data;
    }

    const db = await safeDbQuery(() => getDb(), null, 'getDb');
    if (!db) {
      log.warn('[BusinessEvaluator] DB 不可用，返回默认 KPI');
      return createDefaultKPIs(windowStartMs, windowEndMs);
    }

    const windowStart = new Date(windowStartMs);
    const windowEnd = new Date(windowEndMs);

    // 并行计算 4 个 KPI
    const [
      earlyWarningResult,
      avoidedDowntimeResult,
      falseAlarmResult,
      adoptionResult,
    ] = await Promise.all([
      this.computeEarlyWarningLeadTime(db, windowStart, windowEnd, options),
      this.computeAvoidedDowntime(db, windowStart, windowEnd, options),
      this.computeFalseAlarmRate(db, windowStart, windowEnd, options),
      this.computeAdoptionRate(db, windowStart, windowEnd, options),
    ]);

    const kpis: BusinessKPIs = {
      earlyWarningLeadTimeDays: earlyWarningResult.leadTimeDays,
      avoidedDowntimeCount: avoidedDowntimeResult.count,
      falseAlarmRate: falseAlarmResult.rate,
      adoptionRate: adoptionResult.rate,
      windowStartMs,
      windowEndMs,
      sampleSizes: {
        confirmedFailures: earlyWarningResult.confirmedFailures,
        predictiveMaintenances: avoidedDowntimeResult.predictiveMaintenances,
        totalAlerts: falseAlarmResult.totalAlerts,
        falsePositiveAlerts: falseAlarmResult.falsePositiveAlerts,
        totalRecommendations: adoptionResult.totalRecommendations,
        followedRecommendations: adoptionResult.followedRecommendations,
      },
    };

    // 缓存结果
    this.cache.set(cacheKey, { data: kpis, expiresAt: now + this.cacheTtlMs });

    // 发布事件
    try {
      await eventBus.publish(
        EVALUATION_TOPICS.BUSINESS_COMPUTED,
        'business_kpis_computed',
        {
          earlyWarningLeadTimeDays: kpis.earlyWarningLeadTimeDays,
          avoidedDowntimeCount: kpis.avoidedDowntimeCount,
          falseAlarmRate: kpis.falseAlarmRate,
          adoptionRate: kpis.adoptionRate,
        },
        { source: 'business-evaluator', severity: 'info' },
      );
    } catch {
      // EventBus 降级静默
    }

    log.info('[BusinessEvaluator] KPI 计算完成', {
      earlyWarningDays: kpis.earlyWarningLeadTimeDays,
      avoidedDowntime: kpis.avoidedDowntimeCount,
      falseAlarmRate: kpis.falseAlarmRate,
      adoptionRate: kpis.adoptionRate,
    });

    return kpis;
  }

  /**
   * KPI 1: 预警提前时间（中位数，天）
   *
   * 公式: median(maintenance.startedAt - alert.createdAt)
   * 仅计算 corrective/emergency 类型维护对应的告警
   */
  private async computeEarlyWarningLeadTime(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    windowStart: Date,
    windowEnd: Date,
    options?: BusinessEvaluatorOptions,
  ): Promise<{ leadTimeDays: number; confirmedFailures: number }> {
    return safeDbQuery(
      async () => {
        // 查找窗口内的 corrective/emergency 维护记录
        const conditions = [
          gte(deviceMaintenanceRecords.startedAt, windowStart),
          lte(deviceMaintenanceRecords.startedAt, windowEnd),
          sql`${deviceMaintenanceRecords.maintenanceType} IN ('corrective', 'emergency')`,
          isNotNull(deviceMaintenanceRecords.startedAt),
        ];

        if (options?.deviceCode) {
          conditions.push(eq(deviceMaintenanceRecords.nodeId, options.deviceCode));
        }

        const maintenanceRows = await db
          .select({
            nodeId: deviceMaintenanceRecords.nodeId,
            startedAt: deviceMaintenanceRecords.startedAt,
          })
          .from(deviceMaintenanceRecords)
          .where(and(...conditions));

        if (maintenanceRows.length === 0) {
          return { leadTimeDays: -1, confirmedFailures: 0 };
        }

        // 对每条维护记录，查找最近的前置告警
        const leadTimesMs: number[] = [];

        for (const maint of maintenanceRows) {
          if (!maint.startedAt) continue;

          const alertConditions = [
            eq(deviceAlerts.nodeId, maint.nodeId),
            lte(deviceAlerts.createdAt, maint.startedAt),
            gte(deviceAlerts.createdAt, new Date(maint.startedAt.getTime() - 90 * 86_400_000)), // 最多回溯 90 天
          ];

          const alerts = await db
            .select({ createdAt: deviceAlerts.createdAt })
            .from(deviceAlerts)
            .where(and(...alertConditions))
            .orderBy(sql`${deviceAlerts.createdAt} DESC`)
            .limit(1);

          if (alerts.length > 0 && alerts[0].createdAt) {
            const leadTimeMs = maint.startedAt.getTime() - alerts[0].createdAt.getTime();
            if (leadTimeMs > 0) {
              leadTimesMs.push(leadTimeMs);
            }
          }
        }

        if (leadTimesMs.length === 0) {
          return { leadTimeDays: -1, confirmedFailures: maintenanceRows.length };
        }

        // 中位数
        leadTimesMs.sort((a, b) => a - b);
        const mid = Math.floor(leadTimesMs.length / 2);
        const medianMs = leadTimesMs.length % 2 === 0
          ? (leadTimesMs[mid - 1] + leadTimesMs[mid]) / 2
          : leadTimesMs[mid];
        const leadTimeDays = medianMs / 86_400_000;

        return {
          leadTimeDays: Math.round(leadTimeDays * 10) / 10,
          confirmedFailures: maintenanceRows.length,
        };
      },
      { leadTimeDays: -1, confirmedFailures: 0 },
      'computeEarlyWarningLeadTime',
    );
  }

  /**
   * KPI 2: 避免停机次数
   *
   * count(predictive 维护 where 后30天无 unplannedDowntime)
   */
  private async computeAvoidedDowntime(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    windowStart: Date,
    windowEnd: Date,
    options?: BusinessEvaluatorOptions,
  ): Promise<{ count: number; predictiveMaintenances: number }> {
    return safeDbQuery(
      async () => {
        const conditions = [
          eq(deviceMaintenanceRecords.maintenanceType, 'predictive'),
          eq(deviceMaintenanceRecords.status, 'completed'),
          gte(deviceMaintenanceRecords.completedAt, windowStart),
          lte(deviceMaintenanceRecords.completedAt, windowEnd),
        ];

        if (options?.deviceCode) {
          conditions.push(eq(deviceMaintenanceRecords.nodeId, options.deviceCode));
        }

        const predictiveRecords = await db
          .select({
            nodeId: deviceMaintenanceRecords.nodeId,
            completedAt: deviceMaintenanceRecords.completedAt,
          })
          .from(deviceMaintenanceRecords)
          .where(and(...conditions));

        if (predictiveRecords.length === 0) {
          return { count: 0, predictiveMaintenances: 0 };
        }

        let avoidedCount = 0;
        const thirtyDaysMs = 30 * 86_400_000;

        for (const record of predictiveRecords) {
          if (!record.completedAt) continue;

          // 检查完成后 30 天内有无 unplannedDowntime
          const kpiConditions = [
            eq(deviceKpis.nodeId, record.nodeId),
            gte(deviceKpis.periodStart, record.completedAt),
            lte(deviceKpis.periodStart, new Date(record.completedAt.getTime() + thirtyDaysMs)),
          ];

          const kpiRows = await db
            .select({
              unplannedDowntime: deviceKpis.unplannedDowntime,
            })
            .from(deviceKpis)
            .where(and(...kpiConditions));

          const hasUnplannedDowntime = kpiRows.some(
            (r) => r.unplannedDowntime !== null && r.unplannedDowntime > 0,
          );

          if (!hasUnplannedDowntime) {
            avoidedCount++;
          }
        }

        return { count: avoidedCount, predictiveMaintenances: predictiveRecords.length };
      },
      { count: 0, predictiveMaintenances: 0 },
      'computeAvoidedDowntime',
    );
  }

  /**
   * KPI 3: 误报率
   *
   * count(status='false_positive') / count(total)
   */
  private async computeFalseAlarmRate(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    windowStart: Date,
    windowEnd: Date,
    options?: BusinessEvaluatorOptions,
  ): Promise<{ rate: number; totalAlerts: number; falsePositiveAlerts: number }> {
    return safeDbQuery(
      async () => {
        const conditions = [
          gte(anomalyDetections.createdAt, windowStart),
          lte(anomalyDetections.createdAt, windowEnd),
        ];

        if (options?.deviceCode) {
          conditions.push(eq(anomalyDetections.deviceCode, options.deviceCode));
        }

        // 总数
        const totalResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(anomalyDetections)
          .where(and(...conditions));
        const totalAlerts = totalResult[0]?.count ?? 0;

        if (totalAlerts === 0) {
          return { rate: 0, totalAlerts: 0, falsePositiveAlerts: 0 };
        }

        // 误报数
        const fpResult = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(anomalyDetections)
          .where(and(...conditions, eq(anomalyDetections.status, 'false_positive')));
        const falsePositiveAlerts = fpResult[0]?.count ?? 0;

        const rate = totalAlerts > 0 ? falsePositiveAlerts / totalAlerts : 0;

        return {
          rate: Math.round(rate * 1000) / 1000,
          totalAlerts,
          falsePositiveAlerts,
        };
      },
      { rate: 0, totalAlerts: 0, falsePositiveAlerts: 0 },
      'computeFalseAlarmRate',
    );
  }

  /**
   * KPI 4: 采纳率
   *
   * count(30天内有匹配维护的诊断) / count(有建议的诊断)
   */
  private async computeAdoptionRate(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    windowStart: Date,
    windowEnd: Date,
    options?: BusinessEvaluatorOptions,
  ): Promise<{ rate: number; totalRecommendations: number; followedRecommendations: number }> {
    return safeDbQuery(
      async () => {
        const conditions = [
          gte(diagnosisResults.createdAt, windowStart),
          lte(diagnosisResults.createdAt, windowEnd),
          isNotNull(diagnosisResults.recommendation),
        ];

        if (options?.deviceCode) {
          conditions.push(eq(diagnosisResults.deviceCode, options.deviceCode));
        }

        // 有建议的诊断
        const diagnosisRows = await db
          .select({
            deviceCode: diagnosisResults.deviceCode,
            createdAt: diagnosisResults.createdAt,
          })
          .from(diagnosisResults)
          .where(and(...conditions));

        const totalRecommendations = diagnosisRows.length;
        if (totalRecommendations === 0) {
          return { rate: 0, totalRecommendations: 0, followedRecommendations: 0 };
        }

        let followedCount = 0;
        const thirtyDaysMs = 30 * 86_400_000;

        for (const diag of diagnosisRows) {
          if (!diag.createdAt) continue;

          // 检查 30 天内有无对应设备的维护记录
          const maintConditions = [
            eq(deviceMaintenanceRecords.nodeId, diag.deviceCode),
            gte(deviceMaintenanceRecords.startedAt, diag.createdAt),
            lte(
              deviceMaintenanceRecords.startedAt,
              new Date(diag.createdAt.getTime() + thirtyDaysMs),
            ),
          ];

          const maintRows = await db
            .select({ id: deviceMaintenanceRecords.id })
            .from(deviceMaintenanceRecords)
            .where(and(...maintConditions))
            .limit(1);

          if (maintRows.length > 0) {
            followedCount++;
          }
        }

        const rate = totalRecommendations > 0 ? followedCount / totalRecommendations : 0;

        return {
          rate: Math.round(rate * 1000) / 1000,
          totalRecommendations,
          followedRecommendations: followedCount,
        };
      },
      { rate: 0, totalRecommendations: 0, followedRecommendations: 0 },
      'computeAdoptionRate',
    );
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    log.debug('[BusinessEvaluator] 缓存已清空');
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let _instance: BusinessEvaluator | null = null;

/** 获取 BusinessEvaluator 单例 */
export function getBusinessEvaluator(): BusinessEvaluator {
  if (!_instance) {
    _instance = new BusinessEvaluator();
  }
  return _instance;
}

/** 重置单例（仅测试用） */
export function resetBusinessEvaluator(): void {
  _instance = null;
  log.debug('[BusinessEvaluator] 单例已重置');
}
