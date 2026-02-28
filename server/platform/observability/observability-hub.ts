/**
 * ObservabilityHub — 统一观测中枢
 *
 * 聚合平台所有可观测性数据源，提供两个视图：
 * - OperationsView: 技术运维全量视图 (11 数据源并行聚合)
 * - StatusView: 客户简洁状态视图 (3 数据源)
 *
 * 架构原则：
 * - 单例 + 工厂 (§9.3)
 * - 降级不崩溃 (§9.5)
 * - 新增不修改 (§9.7)
 */

import { observabilityService } from '../../services/observability.service';
import { monitoringService } from '../../services/monitoring.service';
import { metricsCollector } from '../middleware/metricsCollector';
import { FSDMetrics } from '../evolution/fsd/fsd-metrics';
import { circuitBreakerRegistry } from '../middleware/circuitBreaker';
import { eventBus } from '../../services/eventBus.service';
import { getEvaluationDashboard } from '../evaluation/evaluation-dashboard';
import { getDb } from '../../lib/db';
import { assetNodes } from '../../../drizzle/schema';
import { sql } from 'drizzle-orm';

// ================================================================
// Types
// ================================================================

export interface ServiceHealthEntry {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency: number;
  lastCheck: number;
}

export interface AlertEntry {
  id: string;
  severity: string;
  title: string;
  source: string;
  createdAt: number;
}

export interface CircuitBreakerEntry {
  name: string;
  state: 'closed' | 'open' | 'halfOpen';
  fires: number;
  failures: number;
  latencyMean: number;
}

export interface EventEntry {
  eventId: string;
  topic: string;
  severity: string;
  timestamp: number;
  source?: string;
}

export interface OperationsView {
  systemHealth: {
    status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    uptime: number;
    services: ServiceHealthEntry[];
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    requestRate: number;
    avgLatency: number;
    errorRate: number;
    p95Latency: number;
  };
  alerts: {
    critical: number;
    warning: number;
    info: number;
    recentAlerts: AlertEntry[];
  };
  circuitBreakers: {
    total: number;
    open: number;
    halfOpen: number;
    closed: number;
    entries: CircuitBreakerEntry[];
  };
  eventBus: {
    totalPublished: number;
    totalFailed: number;
    activeTopics: number;
    recentEvents: EventEntry[];
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    onlineRate: number;
  };
  evaluation: {
    avgScore: number;
    improvingCount: number;
    regressingCount: number;
    topRecommendation: string | null;
  } | null;
  metrics: {
    nexusMetricsCount: number;
    evoMetricsCount: number;
  };
  generatedAt: number;
}

export interface StatusView {
  overallStatus: 'operational' | 'degraded' | 'outage';
  overallMessage: string;
  devices: {
    totalDevices: number;
    onlineDevices: number;
    onlineRate: number;
    statusLabel: string;
  };
  kpis: {
    earlyWarningDays: number;
    avoidedDowntimes: number;
    falseAlarmRate: number;
    platformScore: number;
  };
  recentSummary: {
    alertsHandled: number;
    diagnosesCompleted: number;
    maintenancesScheduled: number;
  };
  generatedAt: number;
}

// ================================================================
// Helpers
// ================================================================

/** Safely execute an async function, returning fallback on error */
async function safe<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[ObservabilityHub] ${label} 降级:`,
      err instanceof Error ? err.message : String(err),
    );
    return fallback;
  }
}

// ================================================================
// Device stats result type
// ================================================================

interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  onlineRate: number;
}

const EMPTY_DEVICE_STATS: DeviceStats = { total: 0, online: 0, offline: 0, onlineRate: 0 };

// ================================================================
// Cache TTL constants
// ================================================================

const OPS_CACHE_TTL = 60_000;     // 1 minute
const STATUS_CACHE_TTL = 15_000;  // 15 seconds

// ================================================================
// ObservabilityHub class
// ================================================================

class ObservabilityHub {
  private _opsCache: OperationsView | null = null;
  private _opsCacheExpiry = 0;
  private _statusCache: StatusView | null = null;
  private _statusCacheExpiry = 0;

  // ─── Public API ─────────────────────────────────────────

  /**
   * 技术运维全量视图 — 并行聚合 11 个数据源
   * 缓存 1 分钟
   */
  async getOperationsView(): Promise<OperationsView> {
    const now = Date.now();
    if (this._opsCache && now < this._opsCacheExpiry) {
      return this._opsCache;
    }

    // 并行获取所有数据源（降级安全）
    const [
      systemMetrics,
      health,
      alerts,
      nexusMetricsCount,
      evoMetricsCount,
      cbStats,
      ebMetrics,
      ebEvents,
      deviceStats,
      evalData,
    ] = await Promise.all([
      this._fetchSystemMetrics(),
      this._fetchHealth(),
      this._fetchAlerts(),
      this._fetchNexusMetrics(),
      this._fetchEvoMetrics(),
      this._fetchCircuitBreakerStats(),
      this._fetchEventBusMetrics(),
      this._fetchRecentEvents(),
      this._fetchDeviceStats(),
      this._fetchEvaluationData(),
    ]);

    // ── 系统健康 ──
    const healthStatusMap: Record<string, OperationsView['systemHealth']['status']> = {
      healthy: 'healthy',
      degraded: 'degraded',
      unhealthy: 'critical',
    };
    const healthStatus: OperationsView['systemHealth']['status'] = health
      ? (healthStatusMap[health.status] ?? 'unknown')
      : 'unknown';

    const services: ServiceHealthEntry[] = health
      ? Object.entries(health.components).map(([name, comp]) => ({
          name,
          status: (comp.status === 'connected' || comp.status === 'healthy')
            ? 'healthy' as const
            : 'unhealthy' as const,
          latency: 0,
          lastCheck: now,
        }))
      : [];

    // ── 告警聚合 ──
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    const recentAlerts: AlertEntry[] = [];

    if (alerts) {
      for (const a of alerts) {
        if (a.severity === 'critical' || a.severity === 'high') criticalCount++;
        else if (a.severity === 'medium' || a.severity === 'low') warningCount++;
        else infoCount++;
      }
      for (const a of alerts.slice(0, 20)) {
        recentAlerts.push({
          id: a.id,
          severity: a.severity,
          title: a.title,
          source: a.source,
          createdAt: a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt),
        });
      }
    }

    // ── 熔断器聚合 ──
    let cbOpen = 0;
    let cbHalfOpen = 0;
    let cbClosed = 0;
    const cbEntries: CircuitBreakerEntry[] = [];

    if (cbStats) {
      for (const cb of cbStats) {
        if (cb.state === 'open') cbOpen++;
        else if (cb.state === 'halfOpen') cbHalfOpen++;
        else cbClosed++;

        cbEntries.push({
          name: cb.name,
          state: cb.state,
          fires: cb.stats.fires,
          failures: cb.stats.failures,
          latencyMean: cb.stats.latencyMean,
        });
      }
    }

    // ── EventBus 聚合 ──
    const recentEvents: EventEntry[] = [];
    if (ebEvents) {
      for (const e of ebEvents) {
        recentEvents.push({
          eventId: e.eventId,
          topic: e.topic,
          severity: e.severity,
          timestamp: e.timestamp instanceof Date ? e.timestamp.getTime() : Number(e.timestamp),
          source: e.source,
        });
      }
    }

    const ebFailedCount = ebMetrics
      ? ((ebMetrics.eventsBySeverity?.['error'] ?? 0) +
         (ebMetrics.eventsBySeverity?.['critical'] ?? 0))
      : 0;

    const ebActiveTopics = ebMetrics
      ? Object.keys(ebMetrics.eventsByTopic ?? {}).length
      : 0;

    // ── 评估总览 ──
    let evaluation: OperationsView['evaluation'] = null;
    if (evalData) {
      const recList = evalData.combinationRecommendations ?? [];
      const topRec = recList[0];
      evaluation = {
        avgScore: evalData.platformSummary.avgOverallScore,
        improvingCount: evalData.platformSummary.improvingCount,
        regressingCount: evalData.platformSummary.regressingCount,
        topRecommendation: topRec
          ? `推荐组合 ${topRec.reportId} (${topRec.recommendations.length} 个候选)`
          : null,
      };
    }

    // ── 组装视图 ──
    const view: OperationsView = {
      systemHealth: {
        status: healthStatus,
        uptime: Math.floor(process.uptime()),
        services,
      },
      performance: {
        cpuUsage: systemMetrics?.cpu ?? 0,
        memoryUsage: systemMetrics?.memory ?? 0,
        requestRate: systemMetrics?.requestRate ?? 0,
        avgLatency: systemMetrics?.latencyP99 ?? 0,
        errorRate: systemMetrics?.errorRate ?? 0,
        p95Latency: systemMetrics?.latencyP99 ?? 0,
      },
      alerts: {
        critical: criticalCount,
        warning: warningCount,
        info: infoCount,
        recentAlerts,
      },
      circuitBreakers: {
        total: cbStats?.length ?? 0,
        open: cbOpen,
        halfOpen: cbHalfOpen,
        closed: cbClosed,
        entries: cbEntries,
      },
      eventBus: {
        totalPublished: ebMetrics?.totalEvents ?? 0,
        totalFailed: ebFailedCount,
        activeTopics: ebActiveTopics,
        recentEvents,
      },
      devices: deviceStats,
      evaluation,
      metrics: {
        nexusMetricsCount,
        evoMetricsCount,
      },
      generatedAt: now,
    };

    this._opsCache = view;
    this._opsCacheExpiry = now + OPS_CACHE_TTL;
    return view;
  }

  /**
   * 客户简洁状态视图 — 3 个轻量数据源
   * 缓存 15 秒
   */
  async getStatusView(): Promise<StatusView> {
    const now = Date.now();
    if (this._statusCache && now < this._statusCacheExpiry) {
      return this._statusCache;
    }

    const [health, deviceStats, evalData] = await Promise.all([
      this._fetchHealth(),
      this._fetchDeviceStats(),
      this._fetchEvaluationData(),
    ]);

    // ── 整体状态判定 ──
    let overallStatus: StatusView['overallStatus'] = 'operational';
    let overallMessage = '所有系统正常运行';

    if (health) {
      if (health.status === 'unhealthy') {
        overallStatus = 'outage';
        overallMessage = '系统故障';
      } else if (health.status === 'degraded') {
        overallStatus = 'degraded';
        overallMessage = '部分服务降级';
      }
    }

    // ── 设备概况 ──
    const onlineRate = deviceStats.total > 0
      ? Math.round((deviceStats.online / deviceStats.total) * 1000) / 10
      : 0;

    // ── KPI 指标 ──
    const businessKpi = evalData?.businessKpiSummary;
    const platformSummary = evalData?.platformSummary;

    // ── 最近 24 小时事件摘要 ──
    // 利用缓存的 OperationsView 数据丰富摘要
    const recentSummary = {
      alertsHandled: 0,
      diagnosesCompleted: 0,
      maintenancesScheduled: 0,
    };
    if (this._opsCache) {
      recentSummary.alertsHandled =
        this._opsCache.alerts.critical +
        this._opsCache.alerts.warning +
        this._opsCache.alerts.info;
    }

    const view: StatusView = {
      overallStatus,
      overallMessage,
      devices: {
        totalDevices: deviceStats.total,
        onlineDevices: deviceStats.online,
        onlineRate,
        statusLabel: `${deviceStats.total} 台设备 · ${onlineRate}% 在线`,
      },
      kpis: {
        earlyWarningDays: businessKpi?.earlyWarningDays ?? 0,
        avoidedDowntimes: businessKpi?.avoidedDowntimes ?? 0,
        falseAlarmRate: businessKpi?.falseAlarmRate ?? 0,
        platformScore: platformSummary?.avgOverallScore ?? 0,
      },
      recentSummary,
      generatedAt: now,
    };

    this._statusCache = view;
    this._statusCacheExpiry = now + STATUS_CACHE_TTL;
    return view;
  }

  /** 手动清除缓存 */
  clearCache(): void {
    this._opsCache = null;
    this._statusCache = null;
    this._opsCacheExpiry = 0;
    this._statusCacheExpiry = 0;
  }

  // ─── Private Data Source Fetchers ───────────────────────
  // 每个方法单独 try/catch, 降级不崩溃

  private _fetchSystemMetrics() {
    return safe(
      () => observabilityService.getSystemMetrics(),
      null,
      'SystemMetrics',
    );
  }

  private _fetchHealth() {
    return safe(
      () => observabilityService.getHealth(),
      null,
      'Health',
    );
  }

  private _fetchAlerts() {
    return safe(
      () => monitoringService.getAlerts({ limit: 100 }),
      null,
      'Alerts',
    );
  }

  private async _fetchNexusMetrics(): Promise<number> {
    return safe(
      async () => {
        const registry = metricsCollector.getRegistry();
        const json = await registry.getMetricsAsJSON();
        return Array.isArray(json) ? json.length : 0;
      },
      0,
      'NexusMetrics',
    );
  }

  private async _fetchEvoMetrics(): Promise<number> {
    return safe(
      async () => {
        const all = await FSDMetrics.exportAll();
        return Object.keys(all).length;
      },
      0,
      'EvoMetrics',
    );
  }

  private _fetchCircuitBreakerStats() {
    return safe(
      async () => circuitBreakerRegistry.getAllStats(),
      null,
      'CircuitBreaker',
    );
  }

  private _fetchEventBusMetrics() {
    return safe(
      async () => eventBus.getMetrics(),
      null,
      'EventBusMetrics',
    );
  }

  private _fetchRecentEvents() {
    return safe(
      async () => eventBus.getRecentEvents(50),
      null,
      'RecentEvents',
    );
  }

  private _fetchDeviceStats(): Promise<DeviceStats> {
    return safe(
      async () => {
        const db = await getDb();
        if (!db) return EMPTY_DEVICE_STATS;

        const result = await db
          .select({
            total: sql<number>`count(*)`,
            online: sql<number>`sum(case when ${assetNodes.status} = 'online' then 1 else 0 end)`,
          })
          .from(assetNodes);

        const row = result[0];
        if (!row) return EMPTY_DEVICE_STATS;

        const total = Number(row.total) || 0;
        const online = Number(row.online) || 0;
        const offline = total - online;
        const onlineRate = total > 0
          ? Math.round((online / total) * 1000) / 10
          : 0;

        return { total, online, offline, onlineRate };
      },
      EMPTY_DEVICE_STATS,
      'DeviceStats',
    );
  }

  private _fetchEvaluationData() {
    return safe(
      async () => {
        const dashboard = getEvaluationDashboard();
        return await dashboard.getDashboardData();
      },
      null,
      'EvaluationDashboard',
    );
  }
}

// ================================================================
// Singleton + Factory
// ================================================================

let _instance: ObservabilityHub | null = null;

export function getObservabilityHub(): ObservabilityHub {
  if (!_instance) {
    _instance = new ObservabilityHub();
  }
  return _instance;
}

export function resetObservabilityHub(): void {
  if (_instance) {
    _instance.clearCache();
  }
  _instance = null;
}
