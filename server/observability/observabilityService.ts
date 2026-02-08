/**
 * PortAI Nexus - 增强版可观测性服务
 * 整合 Prometheus、Elasticsearch、Jaeger 真实客户端
 */

import { prometheusClient } from './clients/prometheusClient';
import { elasticsearchClient } from './clients/elasticsearchClient';
import { jaegerClient } from './clients/jaegerClient';
import type { LogEntry } from "../_core/types/domain";

// ============================================================
// 类型定义
// ============================================================

export interface MetricData {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

export interface TraceData {
  traceId: string;
  serviceName: string;
  operationName: string;
  duration: number;
  startTime: Date;
  status: 'success' | 'error';
  spanCount: number;
}

export interface AlertData {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  state: 'firing' | 'pending' | 'resolved';
  message: string;
  source: string;
  startTime: Date;
  labels: Record<string, string>;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  errorRate: number;
  requestRate: number;
  lastCheck: Date;
}

export interface ObservabilityDashboard {
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
    requestRate: number;
    errorRate: number;
    latencyP99: number;
  };
  services: ServiceHealth[];
  recentLogs: LogEntry[];
  recentTraces: TraceData[];
  activeAlerts: AlertData[];
  summary: {
    totalServices: number;
    healthyServices: number;
    totalAlerts: number;
    criticalAlerts: number;
    logsPerMinute: number;
    tracesPerMinute: number;
  };
}

// ============================================================
// 增强可观测性服务类
// ============================================================

export class EnhancedObservabilityService {
  private static instance: EnhancedObservabilityService;
  private connectionStatus = {
    prometheus: false,
    elasticsearch: false,
    jaeger: false,
  };

  private constructor() {
    this.checkConnections();
    console.log('[EnhancedObservability] 增强版可观测性服务已初始化');
  }

  static getInstance(): EnhancedObservabilityService {
    if (!EnhancedObservabilityService.instance) {
      EnhancedObservabilityService.instance = new EnhancedObservabilityService();
    }
    return EnhancedObservabilityService.instance;
  }

  /**
   * 检查所有服务连接状态
   */
  async checkConnections(): Promise<{
    prometheus: boolean;
    elasticsearch: boolean;
    jaeger: boolean;
  }> {
    const [prometheus, elasticsearch, jaeger] = await Promise.all([
      prometheusClient.checkConnection(),
      elasticsearchClient.checkConnection(),
      jaegerClient.checkConnection(),
    ]);

    this.connectionStatus = { prometheus, elasticsearch, jaeger };
    return this.connectionStatus;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return this.connectionStatus;
  }

  // ============================================================
  // 指标查询 (Prometheus)
  // ============================================================

  /**
   * 获取系统指标
   */
  async getSystemMetrics(): Promise<{
    cpu: number | null;
    memory: number | null;
    disk: number | null;
    requestRate: number | null;
    errorRate: number | null;
    latencyP99: number | null;
  }> {
    const [cpu, memory, disk, requestRate, errorRate, latencyP99] = await Promise.all([
      prometheusClient.getCpuUsage(),
      prometheusClient.getMemoryUsage(),
      prometheusClient.getDiskUsage(),
      prometheusClient.getHttpRequestRate(),
      prometheusClient.getHttpErrorRate(),
      prometheusClient.getRequestLatencyP99(),
    ]);

    return { cpu, memory, disk, requestRate, errorRate, latencyP99 };
  }

  /**
   * 执行自定义 PromQL 查询
   */
  async queryMetrics(promql: string, time?: Date) {
    return prometheusClient.query(promql, time);
  }

  /**
   * 执行范围查询
   */
  async queryMetricsRange(
    promql: string,
    start: Date,
    end: Date,
    step: string = '15s'
  ) {
    return prometheusClient.queryRange(promql, start, end, step);
  }

  /**
   * 获取 Prometheus 目标状态
   */
  async getPrometheusTargets() {
    return prometheusClient.getTargets();
  }

  /**
   * 获取 Prometheus 告警规则
   */
  async getAlertRules() {
    return prometheusClient.getAlertRules();
  }

  /**
   * 获取当前触发的告警
   */
  async getPrometheusAlerts(): Promise<AlertData[]> {
    const alerts = await prometheusClient.getAlerts();
    
    return alerts.map((alert, index) => ({
      id: `prom-alert-${index}`,
      name: alert.labels.alertname || 'Unknown',
      severity: (alert.labels.severity as 'critical' | 'warning' | 'info') || 'warning',
      state: alert.state === 'firing' ? 'firing' : 'pending',
      message: alert.annotations.description || alert.annotations.summary || '',
      source: 'prometheus',
      startTime: new Date(alert.activeAt),
      labels: alert.labels,
    }));
  }

  // ============================================================
  // 日志查询 (Elasticsearch)
  // ============================================================

  /**
   * 获取 ES 集群健康状态
   */
  async getElasticsearchHealth() {
    return elasticsearchClient.getClusterHealth();
  }

  /**
   * 获取 ES 索引列表
   */
  async getElasticsearchIndices(pattern?: string) {
    return elasticsearchClient.getIndices(pattern);
  }

  /**
   * 搜索日志
   */
  async searchLogs(options: {
    query?: string;
    level?: string;
    service?: string;
    from?: Date;
    to?: Date;
    size?: number;
  }): Promise<LogEntry[]> {
    const result = await elasticsearchClient.searchLogs(options);
    
    return result.hits.hits.map((hit) => ({
      id: hit._id,
      timestamp: new Date(hit._source.timestamp),
      level: hit._source.level || 'info',
      message: hit._source.message || '',
      service: hit._source.service || 'unknown',
      host: hit._source.host,
      traceId: hit._source.traceId,
      metadata: hit._source.metadata,
    }));
  }

  /**
   * 获取日志级别统计
   */
  async getLogLevelStats(options?: { from?: Date; to?: Date }) {
    return elasticsearchClient.getLogLevelStats(options || {});
  }

  /**
   * 获取服务日志统计
   */
  async getServiceLogStats(options?: { from?: Date; to?: Date }) {
    return elasticsearchClient.getServiceStats(options || {});
  }

  /**
   * 获取日志趋势
   */
  async getLogTrend(options?: {
    from?: Date;
    to?: Date;
    interval?: string;
  }) {
    return elasticsearchClient.getLogTrend(options || {});
  }

  // ============================================================
  // 追踪查询 (Jaeger)
  // ============================================================

  /**
   * 获取服务列表
   */
  async getTracingServices() {
    return jaegerClient.getServices();
  }

  /**
   * 获取服务操作列表
   */
  async getServiceOperations(service: string) {
    return jaegerClient.getOperations(service);
  }

  /**
   * 搜索追踪
   */
  async searchTraces(options: {
    service: string;
    operation?: string;
    minDuration?: string;
    maxDuration?: string;
    start?: Date;
    end?: Date;
    limit?: number;
  }): Promise<TraceData[]> {
    const traces = await jaegerClient.searchTraces(options);
    
    return traces.map((trace) => {
      // 找到根 span
      const rootSpan = trace.spans.find(
        (s) => s.references.length === 0
      ) || trace.spans[0];
      
      const hasError = rootSpan?.tags.some(
        (t) => t.key === 'error' && t.value === true
      );

      return {
        traceId: trace.traceID,
        serviceName: trace.processes[rootSpan?.processID || '']?.serviceName || 'unknown',
        operationName: rootSpan?.operationName || 'unknown',
        duration: (rootSpan?.duration || 0) / 1000, // 转换为毫秒
        startTime: new Date((rootSpan?.startTime || 0) / 1000),
        status: hasError ? 'error' : 'success',
        spanCount: trace.spans.length,
      };
    });
  }

  /**
   * 获取追踪详情
   */
  async getTraceDetail(traceId: string) {
    return jaegerClient.getTrace(traceId);
  }

  /**
   * 获取服务依赖关系
   */
  async getServiceDependencies() {
    return jaegerClient.getDependencies();
  }

  /**
   * 获取服务延迟统计
   */
  async getServiceLatencyStats(
    service: string,
    operation?: string,
    timeRange?: { start: Date; end: Date }
  ) {
    return jaegerClient.getServiceLatencyStats(service, operation, timeRange);
  }

  /**
   * 获取服务拓扑
   */
  async getServiceTopology() {
    return jaegerClient.getServiceTopology();
  }

  /**
   * 分析服务错误
   */
  async analyzeServiceErrors(
    service: string,
    timeRange?: { start: Date; end: Date }
  ) {
    return jaegerClient.analyzeErrors(service, timeRange);
  }

  // ============================================================
  // 综合仪表盘
  // ============================================================

  /**
   * 获取可观测性仪表盘数据
   */
  async getDashboard(): Promise<ObservabilityDashboard> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 并行获取所有数据
    const [
      metrics,
      promAlerts,
      logStats,
      recentLogs,
      services,
      logTrend,
    ] = await Promise.all([
      this.getSystemMetrics(),
      this.getPrometheusAlerts(),
      this.getLogLevelStats({ from: oneHourAgo, to: now }),
      this.searchLogs({ from: oneHourAgo, to: now, size: 20 }),
      this.getTracingServices(),
      this.getLogTrend({ from: oneHourAgo, to: now, interval: '5m' }),
    ]);

    // 获取服务健康状态
    const serviceHealthPromises = services.slice(0, 10).map(async (svc) => {
      const stats = await this.getServiceLatencyStats(svc, undefined, {
        start: oneHourAgo,
        end: now,
      });
      
      return {
        name: svc,
        status: stats.errorRate > 5 ? 'unhealthy' : stats.errorRate > 1 ? 'degraded' : 'healthy',
        latencyMs: stats.avgDurationMs,
        errorRate: stats.errorRate,
        requestRate: stats.count / 60, // 每分钟请求数
        lastCheck: now,
      } as ServiceHealth;
    });

    const serviceHealth = await Promise.all(serviceHealthPromises);

    // 计算日志每分钟数
    const totalLogs = Object.values(logStats).reduce((a, b) => a + b, 0);
    const logsPerMinute = totalLogs / 60;

    // 计算追踪每分钟数
    const tracesPerMinute = serviceHealth.reduce((sum, s) => sum + s.requestRate, 0);

    // 获取最近追踪
    let recentTraces: TraceData[] = [];
    if (services.length > 0) {
      recentTraces = await this.searchTraces({
        service: services[0],
        start: oneHourAgo,
        end: now,
        limit: 10,
      });
    }

    return {
      metrics: {
        cpu: metrics.cpu || 0,
        memory: metrics.memory || 0,
        disk: metrics.disk || 0,
        requestRate: metrics.requestRate || 0,
        errorRate: metrics.errorRate || 0,
        latencyP99: metrics.latencyP99 || 0,
      },
      services: serviceHealth,
      recentLogs,
      recentTraces,
      activeAlerts: promAlerts.filter((a) => a.state === 'firing'),
      summary: {
        totalServices: services.length,
        healthyServices: serviceHealth.filter((s) => s.status === 'healthy').length,
        totalAlerts: promAlerts.length,
        criticalAlerts: promAlerts.filter((a) => a.severity === 'critical').length,
        logsPerMinute,
        tracesPerMinute,
      },
    };
  }

  // ============================================================
  // 健康检查
  // ============================================================

  /**
   * 获取可观测性服务健康状态
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      prometheus: { status: string; version?: string };
      elasticsearch: { status: string; clusterHealth?: string };
      jaeger: { status: string; serviceCount?: number };
    };
  }> {
    const [promInfo, esHealth, jaegerServices] = await Promise.all([
      prometheusClient.getBuildInfo(),
      elasticsearchClient.getClusterHealth(),
      jaegerClient.getServices(),
    ]);

    const components = {
      prometheus: {
        status: promInfo ? 'connected' : 'disconnected',
        version: promInfo?.version,
      },
      elasticsearch: {
        status: esHealth ? 'connected' : 'disconnected',
        clusterHealth: esHealth?.status,
      },
      jaeger: {
        status: jaegerServices.length >= 0 ? 'connected' : 'disconnected',
        serviceCount: jaegerServices.length,
      },
    };

    const connectedCount = [
      promInfo !== null,
      esHealth !== null,
      jaegerServices.length >= 0,
    ].filter(Boolean).length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (connectedCount === 3) {
      status = 'healthy';
    } else if (connectedCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, components };
  }
}

// 导出单例
export const observabilityService = EnhancedObservabilityService.getInstance();
