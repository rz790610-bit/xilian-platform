/**
 * 西联智能平台 - 智能监控服务单元测试
 * XiLian Intelligent Platform - Smart Monitoring Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartMonitoringService } from './monitoringService';

describe('SmartMonitoringService', () => {
  let service: SmartMonitoringService;

  beforeEach(() => {
    service = new SmartMonitoringService();
  });

  describe('getDashboard', () => {
    it('should return complete dashboard data', async () => {
      const dashboard = await service.getDashboard();
      
      expect(dashboard).toBeDefined();
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.databases).toBeInstanceOf(Array);
      expect(dashboard.plugins).toBeInstanceOf(Array);
      expect(dashboard.engines).toBeInstanceOf(Array);
      expect(dashboard.services).toBeInstanceOf(Array);
      expect(dashboard.system).toBeDefined();
      expect(dashboard.alerts).toBeInstanceOf(Array);
      expect(dashboard.lastUpdated).toBeDefined();
    });

    it('should include all summary metrics', async () => {
      const dashboard = await service.getDashboard();
      
      expect(dashboard.summary.totalDatabases).toBeGreaterThan(0);
      expect(dashboard.summary.onlineDatabases).toBeDefined();
      expect(dashboard.summary.totalPlugins).toBeGreaterThan(0);
      expect(dashboard.summary.activePlugins).toBeDefined();
      expect(dashboard.summary.totalEngines).toBeGreaterThan(0);
      expect(dashboard.summary.runningEngines).toBeDefined();
      expect(dashboard.summary.pendingAlerts).toBeDefined();
    });
  });

  describe('getDatabaseStatus', () => {
    it('should return database status for all databases', async () => {
      const databases = await service.getDatabaseStatus();
      
      expect(databases).toBeInstanceOf(Array);
      expect(databases.length).toBeGreaterThan(0);
      
      const db = databases[0];
      expect(db.name).toBeDefined();
      expect(db.type).toBeDefined();
      expect(db.status).toBeDefined();
      expect(db.host).toBeDefined();
      expect(db.port).toBeDefined();
      expect(db.connections).toBeDefined();
      expect(db.storage).toBeDefined();
      expect(db.performance).toBeDefined();
    });

    it('should include connection metrics', async () => {
      const databases = await service.getDatabaseStatus();
      const db = databases[0];
      
      expect(db.connections.active).toBeDefined();
      expect(db.connections.idle).toBeDefined();
      expect(db.connections.max).toBeDefined();
    });

    it('should include storage metrics', async () => {
      const databases = await service.getDatabaseStatus();
      const db = databases[0];
      
      expect(db.storage.usedBytes).toBeDefined();
      expect(db.storage.totalBytes).toBeDefined();
      expect(db.storage.usagePercent).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const databases = await service.getDatabaseStatus();
      const db = databases[0];
      
      expect(db.performance.queryLatencyMs).toBeDefined();
      expect(db.performance.throughputQps).toBeDefined();
    });
  });

  describe('getPluginStatus', () => {
    it('should return plugin status for all plugins', async () => {
      const plugins = await service.getPluginStatus();
      
      expect(plugins).toBeInstanceOf(Array);
      expect(plugins.length).toBeGreaterThan(0);
      
      const plugin = plugins[0];
      expect(plugin.id).toBeDefined();
      expect(plugin.name).toBeDefined();
      expect(plugin.type).toBeDefined();
      expect(plugin.status).toBeDefined();
      expect(plugin.version).toBeDefined();
      expect(plugin.resources).toBeDefined();
      expect(plugin.metrics).toBeDefined();
    });

    it('should include resource usage', async () => {
      const plugins = await service.getPluginStatus();
      const plugin = plugins[0];
      
      expect(plugin.resources.cpuPercent).toBeDefined();
      expect(plugin.resources.memoryMB).toBeDefined();
      expect(plugin.resources.diskMB).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const plugins = await service.getPluginStatus();
      const plugin = plugins[0];
      
      expect(plugin.metrics.invocations).toBeDefined();
      expect(plugin.metrics.successRate).toBeDefined();
      expect(plugin.metrics.avgLatencyMs).toBeDefined();
    });
  });

  describe('getEngineStatus', () => {
    it('should return engine status for all engines', async () => {
      const engines = await service.getEngineStatus();
      
      expect(engines).toBeInstanceOf(Array);
      expect(engines.length).toBeGreaterThan(0);
      
      const engine = engines[0];
      expect(engine.id).toBeDefined();
      expect(engine.name).toBeDefined();
      expect(engine.type).toBeDefined();
      expect(engine.status).toBeDefined();
      expect(engine.version).toBeDefined();
      expect(engine.instances).toBeDefined();
      expect(engine.resources).toBeDefined();
      expect(engine.performance).toBeDefined();
      expect(engine.queue).toBeDefined();
    });

    it('should include resource usage', async () => {
      const engines = await service.getEngineStatus();
      const engine = engines[0];
      
      expect(engine.resources.cpuPercent).toBeDefined();
      expect(engine.resources.memoryMB).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const engines = await service.getEngineStatus();
      const engine = engines[0];
      
      expect(engine.performance.requestsPerSecond).toBeDefined();
      expect(engine.performance.avgLatencyMs).toBeDefined();
      expect(engine.performance.p99LatencyMs).toBeDefined();
      expect(engine.performance.errorRate).toBeDefined();
    });

    it('should include queue status', async () => {
      const engines = await service.getEngineStatus();
      const engine = engines[0];
      
      expect(engine.queue.pending).toBeDefined();
      expect(engine.queue.processing).toBeDefined();
      expect(engine.queue.completed).toBeDefined();
    });
  });

  describe('getSystemResources', () => {
    it('should return system resource metrics', async () => {
      const resources = await service.getSystemResources();
      
      expect(resources.cpu).toBeDefined();
      expect(resources.memory).toBeDefined();
      expect(resources.disk).toBeDefined();
      expect(resources.network).toBeDefined();
    });

    it('should include CPU metrics', async () => {
      const resources = await service.getSystemResources();
      
      expect(resources.cpu.usage).toBeDefined();
      expect(resources.cpu.cores).toBeDefined();
      expect(resources.cpu.loadAvg).toBeInstanceOf(Array);
    });

    it('should include memory metrics', async () => {
      const resources = await service.getSystemResources();
      
      expect(resources.memory.usedMB).toBeDefined();
      expect(resources.memory.totalMB).toBeDefined();
      expect(resources.memory.usagePercent).toBeDefined();
    });

    it('should include disk metrics', async () => {
      const resources = await service.getSystemResources();
      
      expect(resources.disk.usedGB).toBeDefined();
      expect(resources.disk.totalGB).toBeDefined();
      expect(resources.disk.usagePercent).toBeDefined();
    });

    it('should include network metrics', async () => {
      const resources = await service.getSystemResources();
      
      expect(resources.network.rxMBps).toBeDefined();
      expect(resources.network.txMBps).toBeDefined();
      expect(resources.network.connections).toBeDefined();
    });
  });

  describe('getServiceHealth', () => {
    it('should return service health status', async () => {
      const services = await service.getServiceHealth();
      
      expect(services).toBeInstanceOf(Array);
      expect(services.length).toBeGreaterThan(0);
      
      const svc = services[0];
      expect(svc.name).toBeDefined();
      expect(svc.status).toBeDefined();
      expect(svc.endpoint).toBeDefined();
      expect(svc.responseTimeMs).toBeDefined();
      expect(svc.checks).toBeInstanceOf(Array);
    });

    it('should include health checks', async () => {
      const services = await service.getServiceHealth();
      const svc = services[0];
      
      expect(svc.checks.length).toBeGreaterThan(0);
      const check = svc.checks[0];
      expect(check.name).toBeDefined();
      expect(check.status).toBeDefined();
    });
  });

  describe('getAlerts', () => {
    it('should return alerts list', async () => {
      const alerts = await service.getAlerts();
      
      expect(alerts).toBeInstanceOf(Array);
    });

    it('should filter by severity', async () => {
      const alerts = await service.getAlerts({ severity: 'critical' });
      
      alerts.forEach(alert => {
        expect(alert.severity).toBe('critical');
      });
    });

    it('should filter by source', async () => {
      const alerts = await service.getAlerts({ source: 'MySQL' });
      
      alerts.forEach(alert => {
        expect(alert.source).toContain('MySQL');
      });
    });

    it('should limit results', async () => {
      const alerts = await service.getAlerts({ limit: 5 });
      
      expect(alerts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert', async () => {
      // First get an alert
      const alerts = await service.getAlerts();
      if (alerts.length > 0) {
        const result = await service.acknowledgeAlert(alerts[0].id);
        expect(result).toBe(true);
      }
    });

    it('should handle non-existent alert gracefully', async () => {
      const result = await service.acknowledgeAlert('non-existent-id');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an alert', async () => {
      // First get an alert
      const alerts = await service.getAlerts();
      if (alerts.length > 0) {
        const result = await service.resolveAlert(alerts[0].id);
        expect(result).toBe(true);
      }
    });

    it('should handle non-existent alert gracefully', async () => {
      const result = await service.resolveAlert('non-existent-id');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('monitoring control', () => {
    it('should start monitoring', () => {
      expect(() => service.startMonitoring()).not.toThrow();
    });

    it('should stop monitoring', () => {
      service.startMonitoring();
      expect(() => service.stopMonitoring()).not.toThrow();
    });

    it('should accept custom interval', () => {
      expect(() => service.startMonitoring(10000)).not.toThrow();
      service.stopMonitoring();
    });
  });
});
