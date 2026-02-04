/**
 * 可观测性服务测试
 */

import { describe, it, expect } from 'vitest';
import {
  PrometheusService,
  ELKService,
  TracingService,
  AlertmanagerService,
  getObservabilitySummary,
} from './observabilityService';

describe('可观测性服务', () => {
  describe('Prometheus 指标服务', () => {
    const prometheus = PrometheusService.getInstance();

    it('应该获取节点指标', () => {
      const metrics = prometheus.getNodeMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBeGreaterThan(0);
      
      const node = metrics[0];
      expect(node).toHaveProperty('hostname');
      expect(node).toHaveProperty('cpuUsage');
      expect(node).toHaveProperty('memoryUsage');
      expect(node).toHaveProperty('diskUsage');
    });

    it('应该获取容器指标', () => {
      const metrics = prometheus.getContainerMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      
      if (metrics.length > 0) {
        const container = metrics[0];
        expect(container).toHaveProperty('containerId');
        expect(container).toHaveProperty('containerName');
        expect(container).toHaveProperty('cpuUsage');
        expect(container).toHaveProperty('memoryUsage');
      }
    });

    it('应该获取 GPU DCGM 指标', () => {
      const metrics = prometheus.getGpuMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBe(16); // 2 GPU 节点 x 8 GPU
      
      const gpu = metrics[0];
      expect(gpu).toHaveProperty('gpuId');
      expect(gpu).toHaveProperty('name');
      expect(gpu).toHaveProperty('temperature');
      expect(gpu).toHaveProperty('powerUsage');
      expect(gpu).toHaveProperty('gpuUtilization');
      expect(gpu).toHaveProperty('memoryUtilization');
      expect(gpu).toHaveProperty('eccErrors');
    });

    it('应该获取应用 Histogram 指标', () => {
      const metrics = prometheus.getApplicationMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      
      if (metrics.length > 0) {
        const app = metrics[0];
        expect(app).toHaveProperty('serviceName');
        expect(app).toHaveProperty('requestLatencyP50');
        expect(app).toHaveProperty('requestLatencyP99');
        expect(app).toHaveProperty('throughput');
        expect(app).toHaveProperty('errorRate');
      }
    });

    it('应该执行 PromQL 查询', () => {
      const result = prometheus.query('node_cpu');
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('metric');
        expect(result[0]).toHaveProperty('value');
      }
    });
  });

  describe('ELK 日志服务', () => {
    const elk = ELKService.getInstance();

    it('应该搜索日志', () => {
      const logs = elk.searchLogs({ limit: 10 });
      expect(Array.isArray(logs)).toBe(true);
      
      if (logs.length > 0) {
        const log = logs[0];
        expect(log).toHaveProperty('@timestamp');
        expect(log).toHaveProperty('level');
        expect(log).toHaveProperty('service');
        expect(log).toHaveProperty('message');
      }
    });

    it('应该按级别过滤日志', () => {
      const errorLogs = elk.searchLogs({ level: 'ERROR' });
      expect(Array.isArray(errorLogs)).toBe(true);
      errorLogs.forEach(log => {
        expect(log.level).toBe('ERROR');
      });
    });

    it('应该获取日志统计', () => {
      const stats = elk.getLogStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byLevel');
      expect(stats).toHaveProperty('byService');
      expect(stats).toHaveProperty('recentErrors');
    });

    it('应该获取 Filebeat 配置', () => {
      const config = elk.getFilebeatConfig();
      expect(config).toHaveProperty('inputs');
      expect(Array.isArray(config.inputs)).toBe(true);
    });

    it('应该获取 Logstash 管道配置', () => {
      const pipelines = elk.getLogstashPipelines();
      expect(Array.isArray(pipelines)).toBe(true);
      
      if (pipelines.length > 0) {
        const pipeline = pipelines[0];
        expect(pipeline).toHaveProperty('name');
        expect(pipeline).toHaveProperty('input');
        expect(pipeline).toHaveProperty('filter');
        expect(pipeline).toHaveProperty('output');
      }
    });

    it('应该获取 ILM 策略（30天归档）', () => {
      const policy = elk.getILMPolicy();
      expect(policy).toHaveProperty('name');
      expect(policy).toHaveProperty('phases');
      expect(policy.phases).toHaveProperty('hot');
      expect(policy.phases).toHaveProperty('delete');
    });
  });

  describe('Jaeger/OTel 追踪服务', () => {
    const tracing = TracingService.getInstance();

    it('应该搜索追踪', () => {
      const traces = tracing.searchTraces({ limit: 10 });
      expect(Array.isArray(traces)).toBe(true);
      
      if (traces.length > 0) {
        const trace = traces[0];
        expect(trace).toHaveProperty('traceId');
        expect(trace).toHaveProperty('spans');
        expect(trace).toHaveProperty('services');
        expect(trace).toHaveProperty('duration');
      }
    });

    it('应该获取 OTel 配置', () => {
      const config = tracing.getOTelConfig();
      expect(config).toHaveProperty('serviceName');
      expect(config).toHaveProperty('sampler');
      expect(config.sampler).toHaveProperty('type', 'traceidratio');
      expect(config.sampler).toHaveProperty('ratio', 0.1); // 10% 采样
      expect(config).toHaveProperty('exporter');
      expect(config).toHaveProperty('propagators');
    });

    it('应该获取服务依赖', () => {
      const deps = tracing.getServiceDependencies();
      expect(Array.isArray(deps)).toBe(true);
      
      if (deps.length > 0) {
        const dep = deps[0];
        expect(dep).toHaveProperty('source');
        expect(dep).toHaveProperty('target');
        expect(dep).toHaveProperty('callCount');
      }
    });

    it('应该获取追踪统计', () => {
      const stats = tracing.getStats();
      expect(stats).toHaveProperty('tracesPerSecond');
      expect(stats).toHaveProperty('avgSpansPerTrace');
      expect(stats).toHaveProperty('errorRate');
    });
  });

  describe('Alertmanager 告警服务', () => {
    const alertmanager = AlertmanagerService.getInstance();

    it('应该获取告警列表', () => {
      const alerts = alertmanager.getAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('应该获取告警规则', () => {
      const rules = alertmanager.getAlertRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      
      // 验证 P0/P1/P2 规则存在
      const severities = rules.map(r => r.severity);
      expect(severities).toContain('P0');
      expect(severities).toContain('P1');
      expect(severities).toContain('P2');
    });

    it('应该包含 GPU 故障 P0 告警规则', () => {
      const rules = alertmanager.getAlertRules();
      const gpuRule = rules.find(r => r.name.includes('GPU') && r.severity === 'P0');
      expect(gpuRule).toBeDefined();
    });

    it('应该包含 P1 告警规则', () => {
      const rules = alertmanager.getAlertRules();
      const p1Rule = rules.find(r => r.severity === 'P1');
      expect(p1Rule).toBeDefined();
    });

    it('应该包含 Kafka Lag P2 告警规则', () => {
      const rules = alertmanager.getAlertRules();
      const kafkaRule = rules.find(r => r.name.includes('Kafka') && r.severity === 'P2');
      expect(kafkaRule).toBeDefined();
    });

    it('应该获取告警接收器', () => {
      const receivers = alertmanager.getReceivers();
      expect(Array.isArray(receivers)).toBe(true);
      
      // 验证 PagerDuty、企业微信、Email 接收器存在
      const types = receivers.map(r => r.type);
      expect(types).toContain('pagerduty');
      expect(types).toContain('wechat');
      expect(types).toContain('email');
    });

    it('应该获取告警路由', () => {
      const routes = alertmanager.getRoutes();
      expect(routes).toHaveProperty('receiver');
      expect(routes).toHaveProperty('routes');
      expect(Array.isArray(routes.routes)).toBe(true);
    });

    it('应该创建和删除告警规则', () => {
      const newRule = alertmanager.createAlertRule({
        name: 'TestAlert',
        expr: 'test_metric > 100',
        for: '1m',
        severity: 'P3',
        labels: { team: 'test' },
        annotations: {
          summary: 'Test alert',
          description: 'This is a test alert',
        },
        enabled: true,
      });
      
      expect(newRule).toHaveProperty('id');
      expect(newRule.name).toBe('TestAlert');
      
      // 删除规则
      const deleted = alertmanager.deleteAlertRule(newRule.id);
      expect(deleted).toBe(true);
    });

    it('应该创建和删除告警静默', () => {
      const silence = alertmanager.createSilence({
        matchers: [{ name: 'alertname', value: 'TestAlert', isRegex: false, isEqual: true }],
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        createdBy: 'test',
        comment: 'Test silence',
      });
      
      expect(silence).toHaveProperty('id');
      expect(silence.status).toBe('active');
      
      // 删除静默
      const deleted = alertmanager.deleteSilence(silence.id);
      expect(deleted).toBe(true);
    });
  });

  describe('可观测性概览', () => {
    it('应该获取完整的可观测性概览', () => {
      const summary = getObservabilitySummary();
      
      expect(summary).toHaveProperty('metrics');
      expect(summary.metrics).toHaveProperty('prometheusStatus');
      expect(summary.metrics).toHaveProperty('targetsUp');
      expect(summary.metrics).toHaveProperty('targetsTotal');
      
      expect(summary).toHaveProperty('logs');
      expect(summary.logs).toHaveProperty('elkStatus');
      expect(summary.logs).toHaveProperty('indexCount');
      expect(summary.logs).toHaveProperty('storageSize');
      
      expect(summary).toHaveProperty('traces');
      expect(summary.traces).toHaveProperty('jaegerStatus');
      expect(summary.traces).toHaveProperty('samplingRate');
      expect(summary.traces).toHaveProperty('tracesPerSecond');
      
      expect(summary).toHaveProperty('alerts');
      expect(summary.alerts).toHaveProperty('alertmanagerStatus');
      expect(summary.alerts).toHaveProperty('firingAlerts');
      expect(summary.alerts).toHaveProperty('rulesEnabled');
    });
  });
});
