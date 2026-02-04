/**
 * 可观测性层类型定义
 * 包含 Prometheus/Grafana、ELK、Jaeger/OTel、Alertmanager 相关类型
 */

// ==================== Prometheus 指标类型 ====================

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricLabel {
  name: string;
  value: string;
}

export interface PrometheusMetric {
  name: string;
  type: MetricType;
  help: string;
  labels: MetricLabel[];
  value: number;
  timestamp?: number;
}

export interface HistogramBucket {
  le: number; // less than or equal
  count: number;
}

export interface HistogramMetric extends PrometheusMetric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

// Node Exporter 系统指标
export interface NodeMetrics {
  hostname: string;
  cpuUsage: number; // 0-100%
  memoryUsage: number; // 0-100%
  memoryTotal: number; // bytes
  memoryUsed: number; // bytes
  diskUsage: number; // 0-100%
  diskTotal: number; // bytes
  diskUsed: number; // bytes
  networkRxBytes: number;
  networkTxBytes: number;
  loadAverage1m: number;
  loadAverage5m: number;
  loadAverage15m: number;
  uptime: number; // seconds
  timestamp: number;
}

// cAdvisor 容器指标
export interface ContainerMetrics {
  containerId: string;
  containerName: string;
  image: string;
  cpuUsage: number; // 0-100%
  memoryUsage: number; // bytes
  memoryLimit: number; // bytes
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  restartCount: number;
  status: 'running' | 'paused' | 'stopped' | 'exited';
  timestamp: number;
}

// 应用 Histogram 指标
export interface ApplicationMetrics {
  serviceName: string;
  endpoint: string;
  method: string;
  requestCount: number;
  requestLatencyP50: number; // ms
  requestLatencyP90: number; // ms
  requestLatencyP99: number; // ms
  requestLatencyAvg: number; // ms
  errorCount: number;
  errorRate: number; // 0-100%
  throughput: number; // requests/second
  timestamp: number;
}

// GPU DCGM 指标
export interface GpuMetrics {
  gpuId: number;
  uuid: string;
  name: string;
  temperature: number; // Celsius
  powerUsage: number; // Watts
  powerLimit: number; // Watts
  gpuUtilization: number; // 0-100%
  memoryUtilization: number; // 0-100%
  memoryUsed: number; // bytes
  memoryTotal: number; // bytes
  smClock: number; // MHz
  memoryClock: number; // MHz
  pcieRxBandwidth: number; // bytes/s
  pcieTxBandwidth: number; // bytes/s
  eccErrors: number;
  timestamp: number;
}

// Grafana 仪表盘
export interface GrafanaDashboard {
  id: string;
  uid: string;
  title: string;
  description: string;
  tags: string[];
  panels: GrafanaPanel[];
  variables: GrafanaVariable[];
  refresh: string; // e.g., '5s', '1m'
  timeRange: {
    from: string;
    to: string;
  };
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: 'graph' | 'stat' | 'gauge' | 'table' | 'heatmap' | 'logs';
  gridPos: { x: number; y: number; w: number; h: number };
  targets: GrafanaTarget[];
  thresholds?: GrafanaThreshold[];
}

export interface GrafanaTarget {
  expr: string; // PromQL expression
  legendFormat: string;
  refId: string;
}

export interface GrafanaThreshold {
  value: number;
  color: string;
}

export interface GrafanaVariable {
  name: string;
  type: 'query' | 'custom' | 'interval';
  query?: string;
  options?: string[];
  current: string;
}

// ==================== ELK 日志类型 ====================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  '@timestamp': string;
  level: LogLevel;
  message: string;
  service: string;
  host: string;
  container?: string;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  userId?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

// Filebeat 配置
export interface FilebeatConfig {
  inputs: FilebeatInput[];
  output: {
    logstash?: { hosts: string[] };
    elasticsearch?: { hosts: string[]; index: string };
  };
  processors: FilebeatProcessor[];
}

export interface FilebeatInput {
  type: 'log' | 'container' | 'docker';
  enabled: boolean;
  paths: string[];
  multiline?: {
    pattern: string;
    negate: boolean;
    match: 'after' | 'before';
  };
  fields?: Record<string, string>;
}

export interface FilebeatProcessor {
  type: 'add_fields' | 'drop_fields' | 'rename' | 'decode_json_fields';
  config: Record<string, unknown>;
}

// Logstash Grok 解析
export interface LogstashPipeline {
  id: string;
  name: string;
  input: LogstashInput;
  filter: LogstashFilter[];
  output: LogstashOutput;
}

export interface LogstashInput {
  type: 'beats' | 'kafka' | 'file';
  port?: number;
  topics?: string[];
  path?: string;
}

export interface LogstashFilter {
  type: 'grok' | 'date' | 'mutate' | 'json' | 'geoip';
  config: Record<string, unknown>;
}

export interface LogstashOutput {
  type: 'elasticsearch' | 'kafka' | 'file';
  hosts?: string[];
  index?: string;
  topic?: string;
}

// Elasticsearch 索引生命周期
export interface ElasticsearchILMPolicy {
  name: string;
  phases: {
    hot?: ILMPhase;
    warm?: ILMPhase;
    cold?: ILMPhase;
    delete?: ILMPhase;
  };
}

export interface ILMPhase {
  minAge: string; // e.g., '0d', '7d', '30d'
  actions: ILMAction[];
}

export interface ILMAction {
  type: 'rollover' | 'shrink' | 'forcemerge' | 'readonly' | 'delete';
  config?: Record<string, unknown>;
}

// Kibana 视图
export interface KibanaVisualization {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'pie' | 'table' | 'metric' | 'markdown';
  indexPattern: string;
  query: string;
  aggregations: KibanaAggregation[];
}

export interface KibanaAggregation {
  type: 'count' | 'avg' | 'sum' | 'max' | 'min' | 'terms' | 'date_histogram';
  field?: string;
  interval?: string;
}

// ==================== Jaeger/OTel 追踪类型 ====================

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number; // microseconds
  duration: number; // microseconds
  status: SpanStatus;
  kind: SpanKind;
  tags: SpanTag[];
  logs: SpanLog[];
  references: SpanReference[];
}

export type SpanStatus = 'OK' | 'ERROR' | 'UNSET';
export type SpanKind = 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';

export interface SpanTag {
  key: string;
  value: string | number | boolean;
}

export interface SpanLog {
  timestamp: number;
  fields: SpanTag[];
}

export interface SpanReference {
  refType: 'CHILD_OF' | 'FOLLOWS_FROM';
  traceId: string;
  spanId: string;
}

export interface Trace {
  traceId: string;
  spans: Span[];
  services: string[];
  startTime: number;
  duration: number;
}

// OpenTelemetry 配置
export interface OTelConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  exporter: {
    type: 'jaeger' | 'otlp' | 'zipkin';
    endpoint: string;
  };
  sampler: OTelSampler;
  propagators: ('tracecontext' | 'baggage' | 'b3')[];
  instrumentations: OTelInstrumentation[];
}

export interface OTelSampler {
  type: 'always_on' | 'always_off' | 'traceidratio' | 'parentbased_traceidratio';
  ratio?: number; // 0.0 - 1.0, e.g., 0.1 for 10%
}

export interface OTelInstrumentation {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// 追踪查询
export interface TraceQuery {
  service?: string;
  operation?: string;
  tags?: Record<string, string>;
  minDuration?: number; // microseconds
  maxDuration?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

// ==================== Alertmanager 告警类型 ====================

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';

export interface Alert {
  id: string;
  alertname: string;
  severity: AlertSeverity;
  status: AlertStatus;
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
    runbook_url?: string;
  };
  startsAt: string;
  endsAt?: string;
  generatorURL: string;
  fingerprint: string;
}

export interface AlertRule {
  id: string;
  name: string;
  expr: string; // PromQL expression
  for: string; // duration, e.g., '5m'
  severity: AlertSeverity;
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
    runbook_url?: string;
  };
  enabled: boolean;
}

// 告警路由
export interface AlertRoute {
  receiver: string;
  match?: Record<string, string>;
  matchRe?: Record<string, string>;
  groupBy?: string[];
  groupWait?: string;
  groupInterval?: string;
  repeatInterval?: string;
  continue?: boolean;
  routes?: AlertRoute[];
}

// 告警接收器
export type ReceiverType = 'pagerduty' | 'wechat' | 'email' | 'webhook' | 'slack';

export interface AlertReceiver {
  name: string;
  type: ReceiverType;
  config: PagerDutyConfig | WechatConfig | EmailConfig | WebhookConfig | SlackConfig;
}

export interface PagerDutyConfig {
  serviceKey: string;
  routingKey?: string;
  severity?: 'critical' | 'error' | 'warning' | 'info';
  description?: string;
}

export interface WechatConfig {
  corpId: string;
  agentId: string;
  secret: string;
  toUser?: string;
  toParty?: string;
  toTag?: string;
  message?: string;
}

export interface EmailConfig {
  to: string[];
  from?: string;
  smarthost: string;
  authUsername?: string;
  authPassword?: string;
  requireTLS?: boolean;
}

export interface WebhookConfig {
  url: string;
  httpConfig?: {
    basicAuth?: { username: string; password: string };
    bearerToken?: string;
  };
}

export interface SlackConfig {
  apiUrl: string;
  channel: string;
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
}

// 告警静默
export interface AlertSilence {
  id: string;
  matchers: SilenceMatcher[];
  startsAt: string;
  endsAt: string;
  createdBy: string;
  comment: string;
  status: 'active' | 'pending' | 'expired';
}

export interface SilenceMatcher {
  name: string;
  value: string;
  isRegex: boolean;
  isEqual: boolean;
}

// ==================== 可观测性概览 ====================

export interface ObservabilitySummary {
  metrics: {
    prometheusStatus: 'healthy' | 'degraded' | 'down';
    targetsUp: number;
    targetsTotal: number;
    scrapeInterval: string;
    retentionDays: number;
  };
  logs: {
    elkStatus: 'healthy' | 'degraded' | 'down';
    indexCount: number;
    totalDocs: number;
    storageSize: number; // bytes
    retentionDays: number;
  };
  traces: {
    jaegerStatus: 'healthy' | 'degraded' | 'down';
    samplingRate: number; // 0-100%
    tracesPerSecond: number;
    avgSpansPerTrace: number;
    storageSize: number; // bytes
  };
  alerts: {
    alertmanagerStatus: 'healthy' | 'degraded' | 'down';
    firingAlerts: number;
    silencedAlerts: number;
    rulesTotal: number;
    rulesEnabled: number;
  };
}

// 预定义的告警规则
export const PREDEFINED_ALERT_RULES: AlertRule[] = [
  // P0 - GPU 故障
  {
    id: 'gpu-failure',
    name: 'GPU 故障告警',
    expr: 'dcgm_gpu_temp > 90 or dcgm_ecc_errors > 0 or dcgm_gpu_utilization == 0',
    for: '1m',
    severity: 'P0',
    labels: { team: 'infrastructure', component: 'gpu' },
    annotations: {
      summary: 'GPU {{ $labels.gpu_id }} 故障',
      description: 'GPU {{ $labels.gpu_id }} 在节点 {{ $labels.instance }} 上检测到故障，温度: {{ $value }}°C',
      runbook_url: 'https://wiki.example.com/runbooks/gpu-failure',
    },
    enabled: true,
  },
  // P1 - 请求延迟
  {
    id: 'high-latency',
    name: '请求延迟过高',
    expr: 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 5',
    for: '5m',
    severity: 'P1',
    labels: { team: 'platform', component: 'api' },
    annotations: {
      summary: '服务 {{ $labels.service }} P99 延迟超过 5 秒',
      description: '服务 {{ $labels.service }} 的 P99 延迟为 {{ $value }}s，超过阈值 5s',
      runbook_url: 'https://wiki.example.com/runbooks/high-latency',
    },
    enabled: true,
  },
  // P2 - Kafka Lag
  {
    id: 'kafka-lag',
    name: 'Kafka 消费延迟',
    expr: 'kafka_consumer_group_lag > 1000',
    for: '10m',
    severity: 'P2',
    labels: { team: 'data', component: 'kafka' },
    annotations: {
      summary: 'Kafka 消费组 {{ $labels.consumer_group }} 延迟过高',
      description: '消费组 {{ $labels.consumer_group }} 在 topic {{ $labels.topic }} 上的 lag 为 {{ $value }}',
      runbook_url: 'https://wiki.example.com/runbooks/kafka-lag',
    },
    enabled: true,
  },
  // P2 - 磁盘空间
  {
    id: 'disk-space',
    name: '磁盘空间不足',
    expr: '(node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 10',
    for: '15m',
    severity: 'P2',
    labels: { team: 'infrastructure', component: 'storage' },
    annotations: {
      summary: '节点 {{ $labels.instance }} 磁盘空间不足',
      description: '节点 {{ $labels.instance }} 的 {{ $labels.mountpoint }} 剩余空间不足 10%',
      runbook_url: 'https://wiki.example.com/runbooks/disk-space',
    },
    enabled: true,
  },
  // P1 - 内存使用
  {
    id: 'memory-usage',
    name: '内存使用过高',
    expr: '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 90',
    for: '10m',
    severity: 'P1',
    labels: { team: 'infrastructure', component: 'memory' },
    annotations: {
      summary: '节点 {{ $labels.instance }} 内存使用超过 90%',
      description: '节点 {{ $labels.instance }} 的内存使用率为 {{ $value }}%',
      runbook_url: 'https://wiki.example.com/runbooks/memory-usage',
    },
    enabled: true,
  },
];

// 预定义的告警接收器
export const PREDEFINED_RECEIVERS: AlertReceiver[] = [
  {
    name: 'pagerduty-critical',
    type: 'pagerduty',
    config: {
      serviceKey: '${PAGERDUTY_SERVICE_KEY}',
      severity: 'critical',
      description: '{{ .CommonAnnotations.summary }}',
    } as PagerDutyConfig,
  },
  {
    name: 'wechat-warning',
    type: 'wechat',
    config: {
      corpId: '${WECHAT_CORP_ID}',
      agentId: '${WECHAT_AGENT_ID}',
      secret: '${WECHAT_SECRET}',
      toParty: '${WECHAT_PARTY_ID}',
      message: '【{{ .Status | toUpper }}】{{ .CommonAnnotations.summary }}\n{{ .CommonAnnotations.description }}',
    } as WechatConfig,
  },
  {
    name: 'email-info',
    type: 'email',
    config: {
      to: ['ops@example.com'],
      smarthost: 'smtp.example.com:587',
      authUsername: '${SMTP_USERNAME}',
      authPassword: '${SMTP_PASSWORD}',
      requireTLS: true,
    } as EmailConfig,
  },
];

// 预定义的告警路由
export const PREDEFINED_ROUTES: AlertRoute = {
  receiver: 'email-info',
  groupBy: ['alertname', 'severity'],
  groupWait: '30s',
  groupInterval: '5m',
  repeatInterval: '4h',
  routes: [
    {
      receiver: 'pagerduty-critical',
      match: { severity: 'P0' },
      groupWait: '0s',
      repeatInterval: '5m',
    },
    {
      receiver: 'wechat-warning',
      match: { severity: 'P1' },
      groupWait: '1m',
      repeatInterval: '30m',
    },
    {
      receiver: 'email-info',
      matchRe: { severity: 'P2|P3' },
      groupWait: '5m',
      repeatInterval: '4h',
    },
  ],
};
