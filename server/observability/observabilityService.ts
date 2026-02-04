/**
 * 可观测性服务层
 * 提供 Prometheus/Grafana、ELK、Jaeger/OTel、Alertmanager 功能
 */

import {
  NodeMetrics,
  ContainerMetrics,
  ApplicationMetrics,
  GpuMetrics,
  GrafanaDashboard,
  LogEntry,
  LogLevel,
  FilebeatConfig,
  LogstashPipeline,
  ElasticsearchILMPolicy,
  KibanaVisualization,
  Span,
  Trace,
  OTelConfig,
  TraceQuery,
  Alert,
  AlertRule,
  AlertSeverity,
  AlertStatus,
  AlertRoute,
  AlertReceiver,
  AlertSilence,
  ObservabilitySummary,
  PREDEFINED_ALERT_RULES,
  PREDEFINED_RECEIVERS,
  PREDEFINED_ROUTES,
} from '../../shared/observabilityTypes';

// ==================== 模拟数据存储 ====================

const nodeMetricsHistory: Map<string, NodeMetrics[]> = new Map();
const containerMetricsHistory: Map<string, ContainerMetrics[]> = new Map();
const applicationMetricsHistory: Map<string, ApplicationMetrics[]> = new Map();
const gpuMetricsHistory: Map<string, GpuMetrics[]> = new Map();
const logEntries: LogEntry[] = [];
const traces: Map<string, Trace> = new Map();
const alerts: Map<string, Alert> = new Map();
const alertRules: Map<string, AlertRule> = new Map();
const alertSilences: Map<string, AlertSilence> = new Map();
const alertReceivers: Map<string, AlertReceiver> = new Map();

// 初始化预定义告警规则和接收器
PREDEFINED_ALERT_RULES.forEach(rule => alertRules.set(rule.id, rule));
PREDEFINED_RECEIVERS.forEach(receiver => alertReceivers.set(receiver.name, receiver));

// ==================== Prometheus 指标服务 ====================

export class PrometheusService {
  private static instance: PrometheusService;
  private scrapeInterval = 15; // seconds
  private retentionDays = 15;

  static getInstance(): PrometheusService {
    if (!PrometheusService.instance) {
      PrometheusService.instance = new PrometheusService();
    }
    return PrometheusService.instance;
  }

  // 获取节点指标
  getNodeMetrics(hostname?: string): NodeMetrics[] {
    const now = Date.now();
    const nodes = ['gpu-node-01', 'gpu-node-02', 'cpu-node-01', 'cpu-node-02', 'cpu-node-03'];
    
    return (hostname ? [hostname] : nodes).map(host => {
      const isGpu = host.startsWith('gpu');
      const baseLoad = isGpu ? 0.6 : 0.4;
      
      return {
        hostname: host,
        cpuUsage: Math.min(100, (baseLoad + Math.random() * 0.3) * 100),
        memoryUsage: Math.min(100, (baseLoad + Math.random() * 0.2) * 100),
        memoryTotal: isGpu ? 256 * 1024 * 1024 * 1024 : 256 * 1024 * 1024 * 1024,
        memoryUsed: isGpu ? 180 * 1024 * 1024 * 1024 : 100 * 1024 * 1024 * 1024,
        diskUsage: 45 + Math.random() * 20,
        diskTotal: 10 * 1024 * 1024 * 1024 * 1024, // 10TB
        diskUsed: 5 * 1024 * 1024 * 1024 * 1024,
        networkRxBytes: Math.floor(Math.random() * 1000000000),
        networkTxBytes: Math.floor(Math.random() * 500000000),
        loadAverage1m: baseLoad * 64 + Math.random() * 10,
        loadAverage5m: baseLoad * 64 + Math.random() * 5,
        loadAverage15m: baseLoad * 64 + Math.random() * 2,
        uptime: 86400 * 30 + Math.floor(Math.random() * 86400),
        timestamp: now,
      };
    });
  }

  // 获取容器指标
  getContainerMetrics(containerName?: string): ContainerMetrics[] {
    const now = Date.now();
    const containers = [
      { name: 'xilian-api', image: 'xilian/api:v1.0.0' },
      { name: 'xilian-worker', image: 'xilian/worker:v1.0.0' },
      { name: 'kafka', image: 'confluentinc/cp-kafka:7.5.0' },
      { name: 'redis', image: 'redis:7-alpine' },
      { name: 'clickhouse', image: 'clickhouse/clickhouse-server:23.8' },
      { name: 'qdrant', image: 'qdrant/qdrant:v1.7.0' },
      { name: 'ollama', image: 'ollama/ollama:latest' },
    ];

    return containers
      .filter(c => !containerName || c.name === containerName)
      .map((container, index) => ({
        containerId: `container-${index + 1}`,
        containerName: container.name,
        image: container.image,
        cpuUsage: 10 + Math.random() * 40,
        memoryUsage: (100 + Math.random() * 400) * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        networkRxBytes: Math.floor(Math.random() * 100000000),
        networkTxBytes: Math.floor(Math.random() * 50000000),
        blockReadBytes: Math.floor(Math.random() * 1000000000),
        blockWriteBytes: Math.floor(Math.random() * 500000000),
        restartCount: Math.floor(Math.random() * 3),
        status: 'running' as const,
        timestamp: now,
      }));
  }

  // 获取应用指标
  getApplicationMetrics(serviceName?: string): ApplicationMetrics[] {
    const now = Date.now();
    const services = [
      { name: 'api-gateway', endpoints: ['/api/trpc', '/api/health'] },
      { name: 'knowledge-service', endpoints: ['/knowledge/search', '/knowledge/embed'] },
      { name: 'model-service', endpoints: ['/model/inference', '/model/chat'] },
      { name: 'pipeline-service', endpoints: ['/pipeline/run', '/pipeline/status'] },
    ];

    const metrics: ApplicationMetrics[] = [];
    
    services
      .filter(s => !serviceName || s.name === serviceName)
      .forEach(service => {
        service.endpoints.forEach(endpoint => {
          const baseLatency = service.name.includes('model') ? 500 : 50;
          metrics.push({
            serviceName: service.name,
            endpoint,
            method: 'POST',
            requestCount: Math.floor(1000 + Math.random() * 5000),
            requestLatencyP50: baseLatency + Math.random() * 20,
            requestLatencyP90: baseLatency * 2 + Math.random() * 50,
            requestLatencyP99: baseLatency * 4 + Math.random() * 100,
            requestLatencyAvg: baseLatency * 1.2 + Math.random() * 30,
            errorCount: Math.floor(Math.random() * 10),
            errorRate: Math.random() * 2,
            throughput: 50 + Math.random() * 100,
            timestamp: now,
          });
        });
      });

    return metrics;
  }

  // 获取 GPU 指标
  getGpuMetrics(gpuId?: number): GpuMetrics[] {
    const now = Date.now();
    const gpuCount = 16; // 2 nodes * 8 GPUs
    
    return Array.from({ length: gpuCount }, (_, i) => ({
      gpuId: i,
      uuid: `GPU-${i.toString().padStart(4, '0')}-${Math.random().toString(36).substr(2, 8)}`,
      name: 'NVIDIA A100-SXM4-80GB',
      temperature: 45 + Math.random() * 25,
      powerUsage: 200 + Math.random() * 200,
      powerLimit: 400,
      gpuUtilization: 30 + Math.random() * 60,
      memoryUtilization: 40 + Math.random() * 40,
      memoryUsed: (40 + Math.random() * 30) * 1024 * 1024 * 1024,
      memoryTotal: 80 * 1024 * 1024 * 1024,
      smClock: 1410,
      memoryClock: 1593,
      pcieRxBandwidth: Math.floor(Math.random() * 10000000000),
      pcieTxBandwidth: Math.floor(Math.random() * 10000000000),
      eccErrors: Math.random() > 0.99 ? 1 : 0,
      timestamp: now,
    })).filter(g => gpuId === undefined || g.gpuId === gpuId);
  }

  // 获取 Prometheus 状态
  getStatus(): { status: 'healthy' | 'degraded' | 'down'; targetsUp: number; targetsTotal: number } {
    return {
      status: 'healthy',
      targetsUp: 25,
      targetsTotal: 25,
    };
  }

  // 执行 PromQL 查询
  query(expr: string, time?: number): { metric: Record<string, string>; value: [number, string] }[] {
    // 简化的 PromQL 查询模拟
    const now = time || Date.now() / 1000;
    
    if (expr.includes('node_cpu')) {
      return this.getNodeMetrics().map(n => ({
        metric: { instance: n.hostname, job: 'node' },
        value: [now, n.cpuUsage.toFixed(2)],
      }));
    }
    
    if (expr.includes('container_memory')) {
      return this.getContainerMetrics().map(c => ({
        metric: { container: c.containerName, job: 'cadvisor' },
        value: [now, c.memoryUsage.toString()],
      }));
    }

    if (expr.includes('dcgm_gpu')) {
      return this.getGpuMetrics().map(g => ({
        metric: { gpu_id: g.gpuId.toString(), job: 'dcgm' },
        value: [now, g.gpuUtilization.toFixed(2)],
      }));
    }

    return [];
  }

  // 执行范围查询
  queryRange(expr: string, start: number, end: number, step: number): { metric: Record<string, string>; values: [number, string][] }[] {
    const results: { metric: Record<string, string>; values: [number, string][] }[] = [];
    const points = Math.floor((end - start) / step);
    
    // 生成时间序列数据
    const baseValue = 50;
    const values: [number, string][] = [];
    
    for (let i = 0; i < points; i++) {
      const timestamp = start + i * step;
      const value = baseValue + Math.sin(i / 10) * 20 + Math.random() * 10;
      values.push([timestamp, value.toFixed(2)]);
    }

    results.push({
      metric: { __name__: expr.split('{')[0], job: 'prometheus' },
      values,
    });

    return results;
  }
}

// ==================== ELK 日志服务 ====================

export class ELKService {
  private static instance: ELKService;
  private retentionDays = 30;
  private maxLogEntries = 100000;

  static getInstance(): ELKService {
    if (!ELKService.instance) {
      ELKService.instance = new ELKService();
      ELKService.instance.initializeSampleLogs();
    }
    return ELKService.instance;
  }

  private initializeSampleLogs() {
    const services = ['api-gateway', 'knowledge-service', 'model-service', 'pipeline-service'];
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const messages = [
      'Request processed successfully',
      'Database query executed',
      'Cache hit for key',
      'Connection established',
      'Slow query detected',
      'Rate limit exceeded',
      'Authentication failed',
      'Service unavailable',
    ];

    // 生成最近 1 小时的日志
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      const timestamp = now - Math.floor(Math.random() * 3600000);
      const level = levels[Math.floor(Math.random() * (i < 900 ? 2 : 4))]; // 90% INFO/DEBUG
      
      logEntries.push({
        '@timestamp': new Date(timestamp).toISOString(),
        level,
        message: messages[Math.floor(Math.random() * messages.length)],
        service: services[Math.floor(Math.random() * services.length)],
        host: `node-${Math.floor(Math.random() * 5) + 1}`,
        container: `container-${Math.floor(Math.random() * 10) + 1}`,
        traceId: Math.random().toString(36).substr(2, 32),
        spanId: Math.random().toString(36).substr(2, 16),
        requestId: `req-${Math.random().toString(36).substr(2, 8)}`,
        userId: Math.random() > 0.3 ? `user-${Math.floor(Math.random() * 100)}` : undefined,
        deviceId: Math.random() > 0.5 ? `device-${Math.floor(Math.random() * 50)}` : undefined,
      });
    }

    // 按时间排序
    logEntries.sort((a, b) => new Date(b['@timestamp']).getTime() - new Date(a['@timestamp']).getTime());
  }

  // 搜索日志
  searchLogs(query: {
    level?: LogLevel;
    service?: string;
    message?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }): LogEntry[] {
    let results = [...logEntries];

    if (query.level) {
      results = results.filter(l => l.level === query.level);
    }
    if (query.service) {
      results = results.filter(l => l.service === query.service);
    }
    if (query.message) {
      const regex = new RegExp(query.message, 'i');
      results = results.filter(l => regex.test(l.message));
    }
    if (query.startTime) {
      results = results.filter(l => l['@timestamp'] >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter(l => l['@timestamp'] <= query.endTime!);
    }

    return results.slice(0, query.limit || 100);
  }

  // 获取日志统计
  getLogStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    byService: Record<string, number>;
    recentErrors: number;
  } {
    const byLevel: Record<LogLevel, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    const byService: Record<string, number> = {};
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    let recentErrors = 0;

    logEntries.forEach(log => {
      byLevel[log.level]++;
      byService[log.service] = (byService[log.service] || 0) + 1;
      if (log['@timestamp'] >= oneHourAgo && (log.level === 'ERROR' || log.level === 'FATAL')) {
        recentErrors++;
      }
    });

    return {
      total: logEntries.length,
      byLevel,
      byService,
      recentErrors,
    };
  }

  // 获取 Filebeat 配置
  getFilebeatConfig(): FilebeatConfig {
    return {
      inputs: [
        {
          type: 'container',
          enabled: true,
          paths: ['/var/lib/docker/containers/*/*.log'],
          multiline: {
            pattern: '^\\[',
            negate: true,
            match: 'after',
          },
        },
        {
          type: 'log',
          enabled: true,
          paths: ['/var/log/xilian/*.log'],
          fields: { service: 'xilian' },
        },
      ],
      output: {
        logstash: { hosts: ['logstash:5044'] },
      },
      processors: [
        { type: 'add_fields', config: { target: '', fields: { cluster: 'xilian-cluster' } } },
        { type: 'decode_json_fields', config: { fields: ['message'], target: '' } },
      ],
    };
  }

  // 获取 Logstash 管道配置
  getLogstashPipelines(): LogstashPipeline[] {
    return [
      {
        id: 'main',
        name: '主日志管道',
        input: { type: 'beats', port: 5044 },
        filter: [
          {
            type: 'grok',
            config: {
              match: {
                message: '%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{GREEDYDATA:message}',
              },
            },
          },
          {
            type: 'date',
            config: { match: ['timestamp', 'ISO8601'] },
          },
          {
            type: 'mutate',
            config: { remove_field: ['timestamp'] },
          },
        ],
        output: {
          type: 'elasticsearch',
          hosts: ['elasticsearch:9200'],
          index: 'xilian-logs-%{+YYYY.MM.dd}',
        },
      },
    ];
  }

  // 获取 ILM 策略
  getILMPolicy(): ElasticsearchILMPolicy {
    return {
      name: 'xilian-logs-policy',
      phases: {
        hot: {
          minAge: '0d',
          actions: [{ type: 'rollover', config: { maxSize: '50gb', maxAge: '1d' } }],
        },
        warm: {
          minAge: '7d',
          actions: [
            { type: 'shrink', config: { numberOfShards: 1 } },
            { type: 'forcemerge', config: { maxNumSegments: 1 } },
          ],
        },
        cold: {
          minAge: '14d',
          actions: [{ type: 'readonly' }],
        },
        delete: {
          minAge: '30d',
          actions: [{ type: 'delete' }],
        },
      },
    };
  }

  // 获取 Kibana 可视化
  getKibanaVisualizations(): KibanaVisualization[] {
    return [
      {
        id: 'log-volume',
        title: '日志量趋势',
        type: 'line',
        indexPattern: 'xilian-logs-*',
        query: '*',
        aggregations: [
          { type: 'date_histogram', field: '@timestamp', interval: '1h' },
          { type: 'count' },
        ],
      },
      {
        id: 'error-distribution',
        title: '错误分布',
        type: 'pie',
        indexPattern: 'xilian-logs-*',
        query: 'level:ERROR OR level:FATAL',
        aggregations: [
          { type: 'terms', field: 'service.keyword' },
          { type: 'count' },
        ],
      },
      {
        id: 'service-logs',
        title: '服务日志统计',
        type: 'bar',
        indexPattern: 'xilian-logs-*',
        query: '*',
        aggregations: [
          { type: 'terms', field: 'service.keyword' },
          { type: 'terms', field: 'level.keyword' },
          { type: 'count' },
        ],
      },
    ];
  }

  // 获取 ELK 状态
  getStatus(): { status: 'healthy' | 'degraded' | 'down'; indexCount: number; totalDocs: number; storageSize: number } {
    return {
      status: 'healthy',
      indexCount: 30, // 30 days of indices
      totalDocs: logEntries.length * 100, // 模拟更多数据
      storageSize: 50 * 1024 * 1024 * 1024, // 50GB
    };
  }
}

// ==================== Jaeger/OTel 追踪服务 ====================

export class TracingService {
  private static instance: TracingService;
  private samplingRate = 0.1; // 10%

  static getInstance(): TracingService {
    if (!TracingService.instance) {
      TracingService.instance = new TracingService();
      TracingService.instance.initializeSampleTraces();
    }
    return TracingService.instance;
  }

  private initializeSampleTraces() {
    // 生成示例追踪数据
    for (let i = 0; i < 100; i++) {
      const traceId = this.generateTraceId();
      const trace = this.generateTrace(traceId);
      traces.set(traceId, trace);
    }
  }

  private generateTraceId(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  private generateTrace(traceId: string): Trace {
    const services = ['api-gateway', 'knowledge-service', 'model-service', 'pipeline-service'];
    const operations = ['handleRequest', 'queryDatabase', 'callService', 'processData'];
    const startTime = Date.now() * 1000 - Math.floor(Math.random() * 3600000000); // 微秒
    const spans: Span[] = [];
    
    // 根 Span
    const rootSpanId = this.generateSpanId();
    const rootDuration = 100000 + Math.floor(Math.random() * 500000); // 100-600ms
    
    spans.push({
      traceId,
      spanId: rootSpanId,
      operationName: 'HTTP POST /api/trpc',
      serviceName: 'api-gateway',
      startTime,
      duration: rootDuration,
      status: Math.random() > 0.95 ? 'ERROR' : 'OK',
      kind: 'SERVER',
      tags: [
        { key: 'http.method', value: 'POST' },
        { key: 'http.url', value: '/api/trpc' },
        { key: 'http.status_code', value: Math.random() > 0.95 ? 500 : 200 },
        { key: 'request-id', value: `req-${Math.random().toString(36).substr(2, 8)}` },
        { key: 'user-id', value: `user-${Math.floor(Math.random() * 100)}` },
        { key: 'device-id', value: `device-${Math.floor(Math.random() * 50)}` },
      ],
      logs: [],
      references: [],
    });

    // 子 Span
    const childCount = 2 + Math.floor(Math.random() * 4);
    let currentTime = startTime + 10000; // 10ms 后开始子 Span
    
    for (let i = 0; i < childCount; i++) {
      const childSpanId = this.generateSpanId();
      const service = services[Math.floor(Math.random() * services.length)];
      const operation = operations[Math.floor(Math.random() * operations.length)];
      const childDuration = 10000 + Math.floor(Math.random() * 100000);
      
      spans.push({
        traceId,
        spanId: childSpanId,
        parentSpanId: rootSpanId,
        operationName: operation,
        serviceName: service,
        startTime: currentTime,
        duration: childDuration,
        status: 'OK',
        kind: i % 2 === 0 ? 'CLIENT' : 'SERVER',
        tags: [
          { key: 'component', value: service },
          { key: 'request-id', value: spans[0].tags.find(t => t.key === 'request-id')?.value || '' },
        ],
        logs: [],
        references: [{ refType: 'CHILD_OF', traceId, spanId: rootSpanId }],
      });
      
      currentTime += childDuration + 5000;
    }

    return {
      traceId,
      spans,
      services: Array.from(new Set(spans.map(s => s.serviceName))),
      startTime,
      duration: rootDuration,
    };
  }

  // 搜索追踪
  searchTraces(query: TraceQuery): Trace[] {
    let results = Array.from(traces.values());

    if (query.service) {
      results = results.filter(t => t.services.includes(query.service!));
    }
    if (query.operation) {
      results = results.filter(t => t.spans.some(s => s.operationName.includes(query.operation!)));
    }
    if (query.tags) {
      results = results.filter(t => 
        t.spans.some(s => 
          Object.entries(query.tags!).every(([key, value]) =>
            s.tags.some(tag => tag.key === key && tag.value === value)
          )
        )
      );
    }
    if (query.minDuration) {
      results = results.filter(t => t.duration >= query.minDuration!);
    }
    if (query.maxDuration) {
      results = results.filter(t => t.duration <= query.maxDuration!);
    }

    return results.slice(0, query.limit || 20);
  }

  // 获取单个追踪
  getTrace(traceId: string): Trace | null {
    return traces.get(traceId) || null;
  }

  // 获取服务依赖图
  getServiceDependencies(): { source: string; target: string; callCount: number }[] {
    const deps: Map<string, number> = new Map();
    
    traces.forEach(trace => {
      trace.spans.forEach(span => {
        if (span.parentSpanId) {
          const parentSpan = trace.spans.find(s => s.spanId === span.parentSpanId);
          if (parentSpan && parentSpan.serviceName !== span.serviceName) {
            const key = `${parentSpan.serviceName}->${span.serviceName}`;
            deps.set(key, (deps.get(key) || 0) + 1);
          }
        }
      });
    });

    return Array.from(deps.entries()).map(([key, count]) => {
      const [source, target] = key.split('->');
      return { source, target, callCount: count };
    });
  }

  // 获取 OTel 配置
  getOTelConfig(): OTelConfig {
    return {
      serviceName: 'xilian-platform',
      serviceVersion: '1.0.0',
      environment: 'production',
      exporter: {
        type: 'jaeger',
        endpoint: 'http://jaeger:14268/api/traces',
      },
      sampler: {
        type: 'traceidratio',
        ratio: this.samplingRate,
      },
      propagators: ['tracecontext', 'baggage'],
      instrumentations: [
        { name: 'http', enabled: true },
        { name: 'express', enabled: true },
        { name: 'mysql', enabled: true },
        { name: 'redis', enabled: true },
      ],
    };
  }

  // 获取追踪统计
  getStats(): { tracesPerSecond: number; avgSpansPerTrace: number; errorRate: number } {
    const traceList = Array.from(traces.values());
    const totalSpans = traceList.reduce((sum, t) => sum + t.spans.length, 0);
    const errorTraces = traceList.filter(t => t.spans.some(s => s.status === 'ERROR')).length;

    return {
      tracesPerSecond: 50 + Math.random() * 30,
      avgSpansPerTrace: totalSpans / traceList.length,
      errorRate: (errorTraces / traceList.length) * 100,
    };
  }

  // 获取 Jaeger 状态
  getStatus(): { status: 'healthy' | 'degraded' | 'down'; samplingRate: number; storageSize: number } {
    return {
      status: 'healthy',
      samplingRate: this.samplingRate * 100,
      storageSize: 20 * 1024 * 1024 * 1024, // 20GB
    };
  }
}

// ==================== Alertmanager 告警服务 ====================

export class AlertmanagerService {
  private static instance: AlertmanagerService;

  static getInstance(): AlertmanagerService {
    if (!AlertmanagerService.instance) {
      AlertmanagerService.instance = new AlertmanagerService();
      AlertmanagerService.instance.initializeSampleAlerts();
    }
    return AlertmanagerService.instance;
  }

  private initializeSampleAlerts() {
    // 生成一些示例告警
    const sampleAlerts: Alert[] = [
      {
        id: 'alert-1',
        alertname: 'HighMemoryUsage',
        severity: 'P1',
        status: 'firing',
        labels: { instance: 'cpu-node-02', job: 'node' },
        annotations: {
          summary: '节点 cpu-node-02 内存使用超过 90%',
          description: '节点 cpu-node-02 的内存使用率为 92%',
        },
        startsAt: new Date(Date.now() - 1800000).toISOString(),
        generatorURL: 'http://prometheus:9090/graph?g0.expr=node_memory_usage',
        fingerprint: 'fp-1',
      },
      {
        id: 'alert-2',
        alertname: 'KafkaConsumerLag',
        severity: 'P2',
        status: 'firing',
        labels: { consumer_group: 'xilian-workers', topic: 'events' },
        annotations: {
          summary: 'Kafka 消费组 xilian-workers 延迟过高',
          description: '消费组 xilian-workers 在 topic events 上的 lag 为 1500',
        },
        startsAt: new Date(Date.now() - 900000).toISOString(),
        generatorURL: 'http://prometheus:9090/graph?g0.expr=kafka_consumer_group_lag',
        fingerprint: 'fp-2',
      },
    ];

    sampleAlerts.forEach(alert => alerts.set(alert.id, alert));
  }

  // 获取告警列表
  getAlerts(filter?: { severity?: AlertSeverity; status?: AlertStatus }): Alert[] {
    let results = Array.from(alerts.values());

    if (filter?.severity) {
      results = results.filter(a => a.severity === filter.severity);
    }
    if (filter?.status) {
      results = results.filter(a => a.status === filter.status);
    }

    return results.sort((a, b) => {
      const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  // 获取告警规则
  getAlertRules(): AlertRule[] {
    return Array.from(alertRules.values());
  }

  // 创建告警规则
  createAlertRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const id = `rule-${Date.now()}`;
    const newRule = { ...rule, id };
    alertRules.set(id, newRule);
    return newRule;
  }

  // 更新告警规则
  updateAlertRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = alertRules.get(id);
    if (!rule) return null;
    
    const updated = { ...rule, ...updates };
    alertRules.set(id, updated);
    return updated;
  }

  // 删除告警规则
  deleteAlertRule(id: string): boolean {
    return alertRules.delete(id);
  }

  // 获取告警接收器
  getReceivers(): AlertReceiver[] {
    return Array.from(alertReceivers.values());
  }

  // 创建告警接收器
  createReceiver(receiver: AlertReceiver): AlertReceiver {
    alertReceivers.set(receiver.name, receiver);
    return receiver;
  }

  // 获取告警路由
  getRoutes(): AlertRoute {
    return PREDEFINED_ROUTES;
  }

  // 创建静默
  createSilence(silence: Omit<AlertSilence, 'id' | 'status'>): AlertSilence {
    const id = `silence-${Date.now()}`;
    const newSilence: AlertSilence = {
      ...silence,
      id,
      status: new Date(silence.startsAt) > new Date() ? 'pending' : 'active',
    };
    alertSilences.set(id, newSilence);
    return newSilence;
  }

  // 获取静默列表
  getSilences(): AlertSilence[] {
    return Array.from(alertSilences.values());
  }

  // 删除静默
  deleteSilence(id: string): boolean {
    return alertSilences.delete(id);
  }

  // 获取告警统计
  getStats(): { firing: number; silenced: number; rulesTotal: number; rulesEnabled: number } {
    const alertList = Array.from(alerts.values());
    const ruleList = Array.from(alertRules.values());

    return {
      firing: alertList.filter(a => a.status === 'firing').length,
      silenced: alertList.filter(a => a.status === 'silenced').length,
      rulesTotal: ruleList.length,
      rulesEnabled: ruleList.filter(r => r.enabled).length,
    };
  }

  // 获取 Alertmanager 状态
  getStatus(): { status: 'healthy' | 'degraded' | 'down' } {
    return { status: 'healthy' };
  }

  // 发送测试告警
  sendTestAlert(receiver: string, severity: AlertSeverity): { success: boolean; message: string } {
    const receiverConfig = alertReceivers.get(receiver);
    if (!receiverConfig) {
      return { success: false, message: `接收器 ${receiver} 不存在` };
    }

    // 模拟发送
    return {
      success: true,
      message: `测试告警已发送到 ${receiverConfig.type} 接收器 ${receiver}`,
    };
  }
}

// ==================== 可观测性概览服务 ====================

export function getObservabilitySummary(): ObservabilitySummary {
  const prometheus = PrometheusService.getInstance();
  const elk = ELKService.getInstance();
  const tracing = TracingService.getInstance();
  const alertmanager = AlertmanagerService.getInstance();

  const promStatus = prometheus.getStatus();
  const elkStatus = elk.getStatus();
  const tracingStatus = tracing.getStatus();
  const alertStats = alertmanager.getStats();
  const alertStatus = alertmanager.getStatus();

  return {
    metrics: {
      prometheusStatus: promStatus.status,
      targetsUp: promStatus.targetsUp,
      targetsTotal: promStatus.targetsTotal,
      scrapeInterval: '15s',
      retentionDays: 15,
    },
    logs: {
      elkStatus: elkStatus.status,
      indexCount: elkStatus.indexCount,
      totalDocs: elkStatus.totalDocs,
      storageSize: elkStatus.storageSize,
      retentionDays: 30,
    },
    traces: {
      jaegerStatus: tracingStatus.status,
      samplingRate: tracingStatus.samplingRate,
      tracesPerSecond: tracing.getStats().tracesPerSecond,
      avgSpansPerTrace: tracing.getStats().avgSpansPerTrace,
      storageSize: tracingStatus.storageSize,
    },
    alerts: {
      alertmanagerStatus: alertStatus.status,
      firingAlerts: alertStats.firing,
      silencedAlerts: alertStats.silenced,
      rulesTotal: alertStats.rulesTotal,
      rulesEnabled: alertStats.rulesEnabled,
    },
  };
}
