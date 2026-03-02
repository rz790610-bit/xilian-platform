/**
 * ============================================================================
 * ObservabilityHub 单元测试
 * ============================================================================
 *
 * 测试策略：Mock 所有外部数据源依赖，仅验证 Hub 自身逻辑:
 *   1. 缓存机制 (OPS_CACHE_TTL=60s, STATUS_CACHE_TTL=15s)
 *   2. 降级不崩溃 (数据源故障时安全降级)
 *   3. 数据聚合逻辑 (告警分类、熔断器聚合、设备统计)
 *   4. 视图结构完整性
 *   5. 单例/工厂模式
 *   6. clearCache
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock 所有外部依赖
// ============================================================================

vi.mock('../../../services/observability.service', () => ({
  observabilityService: {
    getSystemMetrics: vi.fn(),
    getHealth: vi.fn(),
  },
}));

vi.mock('../../../services/monitoring.service', () => ({
  monitoringService: {
    getAlerts: vi.fn(),
  },
}));

vi.mock('../../middleware/metricsCollector', () => ({
  metricsCollector: {
    getRegistry: vi.fn().mockReturnValue({
      getMetricsAsJSON: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('../../evolution/fsd/fsd-metrics', () => ({
  FSDMetrics: {
    exportAll: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../middleware/circuitBreaker', () => ({
  circuitBreakerRegistry: {
    getAllStats: vi.fn(),
  },
}));

vi.mock('../../../services/eventBus.service', () => ({
  eventBus: {
    getMetrics: vi.fn(),
    getRecentEvents: vi.fn(),
  },
}));

vi.mock('../../evaluation/evaluation-dashboard', () => ({
  getEvaluationDashboard: vi.fn().mockReturnValue({
    getDashboardData: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../../lib/db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../drizzle/schema', () => ({
  assetNodes: { status: 'status' },
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn(),
}));

// ============================================================================
// Import after mocks
// ============================================================================

import {
  getObservabilityHub,
  resetObservabilityHub,
} from '../observability-hub';
import type { OperationsView, StatusView } from '../observability-hub';
import { observabilityService } from '../../../services/observability.service';
import { monitoringService } from '../../../services/monitoring.service';
import { circuitBreakerRegistry } from '../../middleware/circuitBreaker';
import { eventBus } from '../../../services/eventBus.service';

// ============================================================================
// Helpers
// ============================================================================

function mockHealthy() {
  vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue({
    cpu: 45,
    memory: 60,
    requestRate: 100,
    latencyP99: 120,
    errorRate: 0.01,
  } as any);

  vi.mocked(observabilityService.getHealth).mockResolvedValue({
    status: 'healthy',
    components: {
      mysql: { status: 'connected' },
      redis: { status: 'connected' },
      kafka: { status: 'healthy' },
    },
  } as any);

  vi.mocked(monitoringService.getAlerts).mockResolvedValue([
    { id: 'a1', severity: 'critical', title: '轴承温度过高', source: 'sensor', createdAt: Date.now() },
    { id: 'a2', severity: 'medium', title: 'CPU 使用率偏高', source: 'system', createdAt: Date.now() },
    { id: 'a3', severity: 'info', title: '常规巡检完成', source: 'scheduler', createdAt: Date.now() },
  ] as any);

  vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue([
    { name: 'db', state: 'closed', stats: { fires: 100, failures: 2, latencyMean: 15 } },
    { name: 'kafka', state: 'open', stats: { fires: 50, failures: 40, latencyMean: 500 } },
    { name: 'redis', state: 'halfOpen', stats: { fires: 80, failures: 10, latencyMean: 30 } },
  ] as any);

  vi.mocked(eventBus.getMetrics).mockResolvedValue({
    totalEvents: 5000,
    eventsBySeverity: { info: 4000, warning: 800, error: 150, critical: 50 },
    eventsByTopic: { 'device.alert': 500, 'diagnosis.complete': 300, 'system.health': 200 },
  } as any);

  vi.mocked(eventBus.getRecentEvents).mockResolvedValue([
    { eventId: 'e1', topic: 'device.alert', severity: 'warning', timestamp: Date.now(), source: 'sensor' },
  ] as any);
}

function mockDegraded() {
  vi.mocked(observabilityService.getSystemMetrics).mockRejectedValue(new Error('connection refused'));
  vi.mocked(observabilityService.getHealth).mockResolvedValue({
    status: 'degraded',
    components: {
      mysql: { status: 'connected' },
      redis: { status: 'disconnected' },
    },
  } as any);
  vi.mocked(monitoringService.getAlerts).mockRejectedValue(new Error('timeout'));
  vi.mocked(circuitBreakerRegistry.getAllStats).mockRejectedValue(new Error('unavailable'));
  vi.mocked(eventBus.getMetrics).mockRejectedValue(new Error('unavailable'));
  vi.mocked(eventBus.getRecentEvents).mockRejectedValue(new Error('unavailable'));
}

// ============================================================================
// Tests
// ============================================================================

describe('ObservabilityHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetObservabilityHub();
  });

  afterEach(() => {
    resetObservabilityHub();
  });

  // ================================================================
  // 1. OperationsView — 正常路径
  // ================================================================

  describe('getOperationsView — 正常路径', () => {
    it('返回完整 OperationsView 结构', async () => {
      mockHealthy();
      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      // 系统健康
      expect(view.systemHealth.status).toBe('healthy');
      expect(view.systemHealth.uptime).toBeGreaterThanOrEqual(0);
      expect(view.systemHealth.services).toHaveLength(3);

      // 性能
      expect(view.performance.cpuUsage).toBe(45);
      expect(view.performance.memoryUsage).toBe(60);
      expect(view.performance.requestRate).toBe(100);
      expect(view.performance.errorRate).toBe(0.01);

      // 告警
      expect(view.alerts.critical).toBe(1);
      expect(view.alerts.warning).toBe(1);
      expect(view.alerts.info).toBe(1);
      expect(view.alerts.recentAlerts).toHaveLength(3);

      // 熔断器
      expect(view.circuitBreakers.total).toBe(3);
      expect(view.circuitBreakers.open).toBe(1);
      expect(view.circuitBreakers.halfOpen).toBe(1);
      expect(view.circuitBreakers.closed).toBe(1);
      expect(view.circuitBreakers.entries).toHaveLength(3);

      // 事件总线
      expect(view.eventBus.totalPublished).toBe(5000);
      expect(view.eventBus.totalFailed).toBe(200); // error(150) + critical(50)
      expect(view.eventBus.activeTopics).toBe(3);
      expect(view.eventBus.recentEvents).toHaveLength(1);

      // 时间戳
      expect(view.generatedAt).toBeGreaterThan(0);
    });

    it('services 正确映射 healthy/unhealthy 状态', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue({
        status: 'healthy',
        components: {
          mysql: { status: 'connected' },
          redis: { status: 'disconnected' },
          neo4j: { status: 'healthy' },
        },
      } as any);
      vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue(null as any);
      vi.mocked(monitoringService.getAlerts).mockResolvedValue(null as any);
      vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue(null as any);
      vi.mocked(eventBus.getMetrics).mockResolvedValue(null as any);
      vi.mocked(eventBus.getRecentEvents).mockResolvedValue(null as any);

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      const mysqlService = view.systemHealth.services.find(s => s.name === 'mysql');
      const redisService = view.systemHealth.services.find(s => s.name === 'redis');
      const neo4jService = view.systemHealth.services.find(s => s.name === 'neo4j');

      expect(mysqlService?.status).toBe('healthy');
      expect(redisService?.status).toBe('unhealthy');
      expect(neo4jService?.status).toBe('healthy');
    });

    it('healthStatus 映射: unhealthy → critical', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue({
        status: 'unhealthy',
        components: {},
      } as any);
      vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue(null as any);
      vi.mocked(monitoringService.getAlerts).mockResolvedValue(null as any);
      vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue(null as any);
      vi.mocked(eventBus.getMetrics).mockResolvedValue(null as any);
      vi.mocked(eventBus.getRecentEvents).mockResolvedValue(null as any);

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();
      expect(view.systemHealth.status).toBe('critical');
    });
  });

  // ================================================================
  // 2. 缓存机制
  // ================================================================

  describe('缓存机制', () => {
    it('OperationsView 缓存 60 秒内不重复调用数据源', async () => {
      mockHealthy();
      const hub = getObservabilityHub();

      await hub.getOperationsView();
      await hub.getOperationsView();
      await hub.getOperationsView();

      // getSystemMetrics 只调用 1 次（后续命中缓存）
      expect(observabilityService.getSystemMetrics).toHaveBeenCalledTimes(1);
    });

    it('clearCache 后重新获取数据', async () => {
      mockHealthy();
      const hub = getObservabilityHub();

      await hub.getOperationsView();
      expect(observabilityService.getSystemMetrics).toHaveBeenCalledTimes(1);

      hub.clearCache();
      await hub.getOperationsView();
      expect(observabilityService.getSystemMetrics).toHaveBeenCalledTimes(2);
    });

    it('StatusView 独立缓存', async () => {
      mockHealthy();
      const hub = getObservabilityHub();

      await hub.getStatusView();
      await hub.getStatusView();

      // getHealth 只调用 1 次
      expect(observabilityService.getHealth).toHaveBeenCalledTimes(1);
    });

    it('OpsView 和 StatusView 缓存相互独立', async () => {
      mockHealthy();
      const hub = getObservabilityHub();

      await hub.getOperationsView();
      await hub.getStatusView();

      // getHealth 被 OpsView 和 StatusView 各调用 1 次
      expect(observabilityService.getHealth).toHaveBeenCalledTimes(2);
    });
  });

  // ================================================================
  // 3. 降级不崩溃 (ADR: §9.5)
  // ================================================================

  describe('降级不崩溃', () => {
    it('所有数据源故障时 OperationsView 不崩溃', async () => {
      // 所有源都 reject
      vi.mocked(observabilityService.getSystemMetrics).mockRejectedValue(new Error('down'));
      vi.mocked(observabilityService.getHealth).mockRejectedValue(new Error('down'));
      vi.mocked(monitoringService.getAlerts).mockRejectedValue(new Error('down'));
      vi.mocked(circuitBreakerRegistry.getAllStats).mockRejectedValue(new Error('down'));
      vi.mocked(eventBus.getMetrics).mockRejectedValue(new Error('down'));
      vi.mocked(eventBus.getRecentEvents).mockRejectedValue(new Error('down'));

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      // 不崩溃，返回降级数据
      expect(view.systemHealth.status).toBe('unknown');
      expect(view.systemHealth.services).toEqual([]);
      expect(view.performance.cpuUsage).toBe(0);
      expect(view.performance.memoryUsage).toBe(0);
      expect(view.alerts.critical).toBe(0);
      expect(view.alerts.recentAlerts).toEqual([]);
      expect(view.circuitBreakers.total).toBe(0);
      expect(view.circuitBreakers.entries).toEqual([]);
      expect(view.eventBus.totalPublished).toBe(0);
      expect(view.eventBus.recentEvents).toEqual([]);
      expect(view.devices).toEqual({ total: 0, online: 0, offline: 0, onlineRate: 0 });
      expect(view.generatedAt).toBeGreaterThan(0);
    });

    it('部分数据源故障时其他数据正常', async () => {
      mockDegraded();

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      // Health 数据正常获取
      expect(view.systemHealth.status).toBe('degraded');
      expect(view.systemHealth.services.length).toBeGreaterThan(0);

      // 故障的源降级为默认值
      expect(view.performance.cpuUsage).toBe(0);
      expect(view.alerts.critical).toBe(0);
      expect(view.circuitBreakers.total).toBe(0);
    });

    it('StatusView 数据源故障时降级', async () => {
      vi.mocked(observabilityService.getHealth).mockRejectedValue(new Error('down'));

      const hub = getObservabilityHub();
      const view = await hub.getStatusView();

      expect(view.overallStatus).toBe('operational');
      expect(view.overallMessage).toBe('所有系统正常运行');
      expect(view.devices.totalDevices).toBe(0);
    });
  });

  // ================================================================
  // 4. StatusView
  // ================================================================

  describe('getStatusView', () => {
    it('healthy → operational', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue({
        status: 'healthy',
        components: {},
      } as any);

      const hub = getObservabilityHub();
      const view = await hub.getStatusView();

      expect(view.overallStatus).toBe('operational');
      expect(view.overallMessage).toBe('所有系统正常运行');
    });

    it('degraded → degraded', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue({
        status: 'degraded',
        components: {},
      } as any);

      const hub = getObservabilityHub();
      const view = await hub.getStatusView();

      expect(view.overallStatus).toBe('degraded');
      expect(view.overallMessage).toBe('部分服务降级');
    });

    it('unhealthy → outage', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue({
        status: 'unhealthy',
        components: {},
      } as any);

      const hub = getObservabilityHub();
      const view = await hub.getStatusView();

      expect(view.overallStatus).toBe('outage');
      expect(view.overallMessage).toBe('系统故障');
    });

    it('KPI 默认值为 0', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue(null as any);

      const hub = getObservabilityHub();
      const view = await hub.getStatusView();

      expect(view.kpis.earlyWarningDays).toBe(0);
      expect(view.kpis.avoidedDowntimes).toBe(0);
      expect(view.kpis.falseAlarmRate).toBe(0);
      expect(view.kpis.platformScore).toBe(0);
    });

    it('StatusView 结构完整', async () => {
      vi.mocked(observabilityService.getHealth).mockResolvedValue({
        status: 'healthy',
        components: {},
      } as any);

      const hub = getObservabilityHub();
      const view = await hub.getStatusView();

      expect(view).toHaveProperty('overallStatus');
      expect(view).toHaveProperty('overallMessage');
      expect(view).toHaveProperty('devices');
      expect(view).toHaveProperty('kpis');
      expect(view).toHaveProperty('recentSummary');
      expect(view).toHaveProperty('generatedAt');
      expect(view.devices).toHaveProperty('totalDevices');
      expect(view.devices).toHaveProperty('onlineDevices');
      expect(view.devices).toHaveProperty('onlineRate');
      expect(view.devices).toHaveProperty('statusLabel');
    });
  });

  // ================================================================
  // 5. 单例与工厂
  // ================================================================

  describe('单例与工厂', () => {
    it('getObservabilityHub 返回同一实例', () => {
      const a = getObservabilityHub();
      const b = getObservabilityHub();
      expect(a).toBe(b);
    });

    it('resetObservabilityHub 后返回新实例', () => {
      const a = getObservabilityHub();
      resetObservabilityHub();
      const b = getObservabilityHub();
      expect(a).not.toBe(b);
    });
  });

  // ================================================================
  // 6. 告警分类逻辑
  // ================================================================

  describe('告警分类', () => {
    it('critical/high 计为 critical, medium/low 计为 warning', async () => {
      vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue(null as any);
      vi.mocked(observabilityService.getHealth).mockResolvedValue(null as any);
      vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue(null as any);
      vi.mocked(eventBus.getMetrics).mockResolvedValue(null as any);
      vi.mocked(eventBus.getRecentEvents).mockResolvedValue(null as any);

      vi.mocked(monitoringService.getAlerts).mockResolvedValue([
        { id: '1', severity: 'critical', title: 'a', source: 'x', createdAt: Date.now() },
        { id: '2', severity: 'high', title: 'b', source: 'x', createdAt: Date.now() },
        { id: '3', severity: 'medium', title: 'c', source: 'x', createdAt: Date.now() },
        { id: '4', severity: 'low', title: 'd', source: 'x', createdAt: Date.now() },
        { id: '5', severity: 'other', title: 'e', source: 'x', createdAt: Date.now() },
      ] as any);

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      expect(view.alerts.critical).toBe(2);  // critical + high
      expect(view.alerts.warning).toBe(2);   // medium + low
      expect(view.alerts.info).toBe(1);       // other
    });

    it('recentAlerts 最多 20 条', async () => {
      vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue(null as any);
      vi.mocked(observabilityService.getHealth).mockResolvedValue(null as any);
      vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue(null as any);
      vi.mocked(eventBus.getMetrics).mockResolvedValue(null as any);
      vi.mocked(eventBus.getRecentEvents).mockResolvedValue(null as any);

      const manyAlerts = Array.from({ length: 30 }, (_, i) => ({
        id: `a${i}`,
        severity: 'info',
        title: `Alert ${i}`,
        source: 'test',
        createdAt: Date.now(),
      }));
      vi.mocked(monitoringService.getAlerts).mockResolvedValue(manyAlerts as any);

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      expect(view.alerts.recentAlerts.length).toBeLessThanOrEqual(20);
      expect(view.alerts.info).toBe(30);
    });
  });

  // ================================================================
  // 7. 熔断器聚合
  // ================================================================

  describe('熔断器聚合', () => {
    it('正确统计 open/halfOpen/closed 数量', async () => {
      vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue(null as any);
      vi.mocked(observabilityService.getHealth).mockResolvedValue(null as any);
      vi.mocked(monitoringService.getAlerts).mockResolvedValue(null as any);
      vi.mocked(eventBus.getMetrics).mockResolvedValue(null as any);
      vi.mocked(eventBus.getRecentEvents).mockResolvedValue(null as any);

      vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue([
        { name: 'a', state: 'open', stats: { fires: 1, failures: 1, latencyMean: 1 } },
        { name: 'b', state: 'open', stats: { fires: 2, failures: 2, latencyMean: 2 } },
        { name: 'c', state: 'closed', stats: { fires: 3, failures: 0, latencyMean: 3 } },
        { name: 'd', state: 'halfOpen', stats: { fires: 4, failures: 1, latencyMean: 4 } },
      ] as any);

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      expect(view.circuitBreakers.total).toBe(4);
      expect(view.circuitBreakers.open).toBe(2);
      expect(view.circuitBreakers.halfOpen).toBe(1);
      expect(view.circuitBreakers.closed).toBe(1);
    });

    it('无熔断器时全部为 0', async () => {
      vi.mocked(observabilityService.getSystemMetrics).mockResolvedValue(null as any);
      vi.mocked(observabilityService.getHealth).mockResolvedValue(null as any);
      vi.mocked(monitoringService.getAlerts).mockResolvedValue(null as any);
      vi.mocked(circuitBreakerRegistry.getAllStats).mockResolvedValue(null as any);
      vi.mocked(eventBus.getMetrics).mockResolvedValue(null as any);
      vi.mocked(eventBus.getRecentEvents).mockResolvedValue(null as any);

      const hub = getObservabilityHub();
      const view = await hub.getOperationsView();

      expect(view.circuitBreakers.total).toBe(0);
      expect(view.circuitBreakers.entries).toEqual([]);
    });
  });
});
