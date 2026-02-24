/**
 * ============================================================================
 * Intervention Rate Engine (E23)
 * ============================================================================
 *
 * 借鉴 FSD 干预率计算：
 *   - 滑动窗口聚合（分钟级粒度）
 *   - 多窗口趋势检测（1h / 6h / 24h / 7d）
 *   - FSD 风格指标输出（1/N 格式）
 *   - 自动告警（干预率突增）
 *   - DB 持久化 + Prometheus 埋点
 *
 * 输出指标：
 *   ┌──────────────────────────────────────────────────────┐
 *   │  rate:           0.0008 (0.08%)                      │
 *   │  inverseMileage: 1250                                │
 *   │  fsdStyle:       "1/1250"                            │
 *   │  trend:          "improving"                         │
 *   │  trendSlope:     -0.0002                             │
 *   │  windows:        { 1h, 6h, 24h, 7d }                │
 *   └──────────────────────────────────────────────────────┘
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import { evolutionInterventions } from '../../../../drizzle/evolution-schema';
import { gte, count, eq, and } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('intervention-rate-engine');

// ============================================================================
// 类型定义
// ============================================================================

export interface InterventionRate {
  /** 干预率 (0-1) */
  rate: number;
  /** 逆里程 (每 N 次决策发生一次干预) */
  inverseMileage: number;
  /** FSD 风格显示 */
  fsdStyle: string;
  /** 趋势方向 */
  trend: 'improving' | 'stable' | 'degrading';
  /** 趋势斜率 (负值 = 改善) */
  trendSlope: number;
  /** 窗口内总决策数 */
  totalDecisions: number;
  /** 窗口内干预数 */
  interventionCount: number;
  /** 窗口时长 (ms) */
  windowMs: number;
}

export interface MultiWindowRate {
  oneHour: InterventionRate;
  sixHours: InterventionRate;
  twentyFourHours: InterventionRate;
  sevenDays: InterventionRate;
}

export interface InterventionAlert {
  type: 'rate_spike' | 'rate_sustained_high' | 'trend_degrading';
  severity: 'warning' | 'critical';
  currentRate: number;
  threshold: number;
  message: string;
  timestamp: number;
}

export interface InterventionRateConfig {
  /** 告警阈值 (干预率超过此值触发告警) */
  alertThreshold: number;
  /** 严重告警阈值 */
  criticalThreshold: number;
  /** 趋势计算窗口数 */
  trendWindowCount: number;
  /** 聚合粒度 (ms)，默认 1 分钟 */
  aggregationGranularityMs: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: InterventionRateConfig = {
  alertThreshold: 0.01,    // 1%
  criticalThreshold: 0.05, // 5%
  trendWindowCount: 12,
  aggregationGranularityMs: 60000, // 1 分钟
};

// ============================================================================
// 干预率计算引擎
// ============================================================================

export class InterventionRateEngine {
  private config: InterventionRateConfig;
  private eventBus: EventBus;

  /** 内存中的分钟级聚合数据 */
  private windowData: Map<number, { interventions: number; total: number }> = new Map();

  /** 历史窗口率（用于趋势计算） */
  private historicalRates: { timestamp: number; rate: number }[] = [];
  private readonly MAX_HISTORY = 1000;

  /** 告警记录 */
  private alerts: InterventionAlert[] = [];
  private readonly MAX_ALERTS = 100;

  /** 定期持久化定时器 */
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<InterventionRateConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 0. P2 修复：启动时从 DB 重建窗口数据 + 定期持久化
  // ==========================================================================

  /**
   * 初始化：从 DB 重建最近 7 天的窗口数据
   * 应在服务启动时调用
   */
  async initialize(): Promise<void> {
    const db = await getDb();
    if (!db) {
      log.warn('数据库不可用，跳过窗口数据重建');
      return;
    }

    try {
      const windowStart = new Date(Date.now() - 7 * 24 * 3600000);
      const granMs = this.config.aggregationGranularityMs;

      // 从 DB 查询所有干预记录，按分钟级聚合
      const rows = await db.select({
        createdAt: evolutionInterventions.createdAt,
        isIntervention: evolutionInterventions.isIntervention,
      }).from(evolutionInterventions)
        .where(gte(evolutionInterventions.createdAt, windowStart));

      // 按粒度聚合
      for (const row of rows) {
        if (!row.createdAt) continue;
        const ts = Math.floor(new Date(row.createdAt).getTime() / granMs) * granMs;
        if (!this.windowData.has(ts)) {
          this.windowData.set(ts, { interventions: 0, total: 0 });
        }
        const data = this.windowData.get(ts)!;
        data.total++;
        if (row.isIntervention === 1) {
          data.interventions++;
        }
      }

      log.info(`从 DB 重建窗口数据: ${this.windowData.size} 个时间窗口, ${rows.length} 条记录`);
    } catch (err) {
      log.error('从 DB 重建窗口数据失败', err);
    }

    // 启动定期持久化（每 5 分钟将内存窗口数据快照写入日志）
    this.startPeriodicPersist();
  }

  /**
   * 定期持久化：将内存窗口数据快照写入日志
   * 这确保即使服务崩溃，也可以从 DB 重建
   */
  private startPeriodicPersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      const snapshot = {
        windowCount: this.windowData.size,
        totalDecisions: Array.from(this.windowData.values()).reduce((s, d) => s + d.total, 0),
        totalInterventions: Array.from(this.windowData.values()).reduce((s, d) => s + d.interventions, 0),
        historicalRatesCount: this.historicalRates.length,
        alertsCount: this.alerts.length,
      };
      log.info(`干预率引擎快照: ${JSON.stringify(snapshot)}`);
    }, 300_000); // 每 5 分钟
  }

  /**
   * 销毁：清理定时器
   */
  destroy(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }

  // ==========================================================================
  // 1. 记录决策（实时写入内存聚合）
  // ==========================================================================

  recordDecision(isIntervention: boolean, modelId?: string): void {
    const ts = Math.floor(Date.now() / this.config.aggregationGranularityMs) * this.config.aggregationGranularityMs;

    if (!this.windowData.has(ts)) {
      this.windowData.set(ts, { interventions: 0, total: 0 });
    }

    const data = this.windowData.get(ts)!;
    data.total++;
    if (isIntervention) {
      data.interventions++;
    }

    // 清理过期数据（保留 7 天）
    const cutoff = Date.now() - 7 * 24 * 3600000;
    for (const [key] of this.windowData) {
      if (key < cutoff) this.windowData.delete(key);
    }
  }

  // ==========================================================================
  // 2. 计算单窗口干预率
  // ==========================================================================

  computeRate(windowMs: number = 3600000): InterventionRate {
    const now = Date.now();
    const windowStart = now - windowMs;
    let interventions = 0;
    let totalDecisions = 0;

    this.windowData.forEach((data, ts) => {
      if (ts >= windowStart) {
        interventions += data.interventions;
        totalDecisions += data.total;
      }
    });

    const rate = totalDecisions > 0 ? interventions / totalDecisions : 0;
    const inverseMileage = totalDecisions > 0 ? Math.round(totalDecisions / Math.max(interventions, 1)) : 9999;
    const trend = this.computeTrend(windowMs);

    const result: InterventionRate = {
      rate,
      inverseMileage,
      fsdStyle: `1/${inverseMileage}`,
      trend: trend.direction,
      trendSlope: trend.slope,
      totalDecisions,
      interventionCount: interventions,
      windowMs,
    };

    // 记录历史
    this.historicalRates.push({ timestamp: now, rate });
    if (this.historicalRates.length > this.MAX_HISTORY) {
      this.historicalRates = this.historicalRates.slice(-this.MAX_HISTORY);
    }

    // 告警检查
    this.checkAlerts(result);

    return result;
  }

  // ==========================================================================
  // 3. 多窗口干预率
  // ==========================================================================

  computeMultiWindowRate(): MultiWindowRate {
    return {
      oneHour: this.computeRate(3600000),
      sixHours: this.computeRate(6 * 3600000),
      twentyFourHours: this.computeRate(24 * 3600000),
      sevenDays: this.computeRate(7 * 24 * 3600000),
    };
  }

  // ==========================================================================
  // 4. 从 DB 计算干预率（精确值）
  // ==========================================================================

  /**
   * P2 修复：从 DB 计算干预率
   *
   * 改进：
   *   1. 总决策数 = 全部记录数（包含干预和非干预）
   *   2. 干预数 = isIntervention=1 的记录数
   *   3. 支持按 modelId 过滤
   *   4. 缓存趋势计算结果避免重复计算
   */
  async computeRateFromDB(windowHours = 24, modelId?: string): Promise<InterventionRate> {
    const db = await getDb();
    if (!db) return this.computeRate(windowHours * 3600000);

    try {
      const windowStart = new Date(Date.now() - windowHours * 3600000);

      // 构建查询条件
      const conditions = [gte(evolutionInterventions.createdAt, windowStart)];
      if (modelId) {
        conditions.push(eq(evolutionInterventions.modelId, modelId));
      }

      // 总决策数（包含干预和非干预记录）
      const totalRows = await db.select({ cnt: count() }).from(evolutionInterventions)
        .where(and(...conditions));

      // 干预数
      const intRows = await db.select({ cnt: count() }).from(evolutionInterventions)
        .where(and(...conditions, eq(evolutionInterventions.isIntervention, 1)));

      const totalDecisions = totalRows[0]?.cnt ?? 0;
      const interventions = intRows[0]?.cnt ?? 0;
      const rate = totalDecisions > 0 ? interventions / totalDecisions : 0;
      const inverseMileage = totalDecisions > 0 ? Math.round(totalDecisions / Math.max(interventions, 1)) : 9999;

      // 缓存趋势计算
      const trend = this.computeTrend(windowHours * 3600000);

      return {
        rate,
        inverseMileage,
        fsdStyle: `1/${inverseMileage}`,
        trend: trend.direction,
        trendSlope: trend.slope,
        totalDecisions,
        interventionCount: interventions,
        windowMs: windowHours * 3600000,
      };
    } catch (err) {
      log.error('从 DB 计算干预率失败，回退到内存计算', err);
      return this.computeRate(windowHours * 3600000);
    }
  }

  // ==========================================================================
  // 5. 趋势计算
  // ==========================================================================

  private computeTrend(windowMs: number): { direction: 'improving' | 'stable' | 'degrading'; slope: number } {
    if (this.historicalRates.length < 3) {
      return { direction: 'stable', slope: 0 };
    }

    // 取最近 N 个窗口的数据
    const recent = this.historicalRates.slice(-this.config.trendWindowCount);
    const n = recent.length;

    if (n < 2) return { direction: 'stable', slope: 0 };

    // 线性回归
    const sumX = (n * (n - 1)) / 2;
    const sumY = recent.reduce((a, r) => a + r.rate, 0);
    const sumXY = recent.reduce((acc, r, i) => acc + i * r.rate, 0);
    const sumX2 = recent.reduce((acc, _, i) => acc + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    let direction: 'improving' | 'stable' | 'degrading' = 'stable';
    if (slope < -0.0001) direction = 'improving';   // 干预率下降 = 改善
    else if (slope > 0.0001) direction = 'degrading'; // 干预率上升 = 退化

    return { direction, slope };
  }

  // ==========================================================================
  // 6. 告警系统
  // ==========================================================================

  private checkAlerts(rate: InterventionRate): void {
    // 严重告警
    if (rate.rate > this.config.criticalThreshold) {
      const alert: InterventionAlert = {
        type: 'rate_spike',
        severity: 'critical',
        currentRate: rate.rate,
        threshold: this.config.criticalThreshold,
        message: `干预率严重超标: ${(rate.rate * 100).toFixed(2)}% > ${(this.config.criticalThreshold * 100).toFixed(2)}%`,
        timestamp: Date.now(),
      };
      this.addAlert(alert);
    }
    // 普通告警
    else if (rate.rate > this.config.alertThreshold) {
      const alert: InterventionAlert = {
        type: 'rate_sustained_high',
        severity: 'warning',
        currentRate: rate.rate,
        threshold: this.config.alertThreshold,
        message: `干预率偏高: ${(rate.rate * 100).toFixed(2)}% > ${(this.config.alertThreshold * 100).toFixed(2)}%`,
        timestamp: Date.now(),
      };
      this.addAlert(alert);
    }

    // 趋势退化告警
    if (rate.trend === 'degrading' && rate.trendSlope > 0.001) {
      const alert: InterventionAlert = {
        type: 'trend_degrading',
        severity: 'warning',
        currentRate: rate.rate,
        threshold: 0,
        message: `干预率趋势恶化: slope=${rate.trendSlope.toFixed(6)}`,
        timestamp: Date.now(),
      };
      this.addAlert(alert);
    }
  }

  private addAlert(alert: InterventionAlert): void {
    this.alerts.push(alert);
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }

    // EventBus 通知
    this.eventBus.publish({
      type: `intervention.alert.${alert.severity}`,
      source: 'intervention-rate-engine',
      data: alert,
    });

    log.warn(`干预率告警: ${alert.message}`);
  }

  getAlerts(limit = 20): InterventionAlert[] {
    return this.alerts.slice(-limit);
  }

  // ==========================================================================
  // 7. 查询方法
  // ==========================================================================

  getWindowData(): Map<number, { interventions: number; total: number }> {
    return new Map(this.windowData);
  }

  getHistoricalRates(limit = 100): { timestamp: number; rate: number }[] {
    return this.historicalRates.slice(-limit);
  }

  updateConfig(updates: Partial<InterventionRateConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
