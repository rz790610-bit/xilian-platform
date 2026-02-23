/**
 * 核心领域类型定义 (Domain Types)
 * 
 * 本文件是后端服务的统一类型来源，包含所有跨服务共享的核心业务类型。
 * 各服务文件应从此处导入，而非自行定义。
 * 
 * 分类：
 * - 传感器与数据采集
 * - 异常检测
 * - 数据聚合
 * - 分页与查询
 * - 事件处理
 * - 日志与可观测性
 * - 网关与基础设施
 * - 监控与运维
 */

// ============================================================
// 传感器与数据采集
// ============================================================

/**
 * 传感器读数 - 统一模型
 * 合并自 streamProcessor.ts, clickhouseClient.ts, flinkProcessor.ts
 *
 * ID 体系规范（v2.0）：
 * - deviceCode: 设备编码，关联 asset_nodes.code，用于传感器/遥测数据关联
 * - sensorId: 传感器唯一标识，关联 asset_sensors.sensor_id
 */
export interface SensorReading {
  sensorId: string;
  /** 设备编码，关联 asset_nodes.code */
  deviceCode: string;
  metricName?: string;
  value: number;
  unit?: string;
  timestamp: Date | number;
  quality?: 'good' | 'uncertain' | 'bad' | number;
  metadata?: Record<string, unknown>;
}

/**
 * ClickHouse 专用的传感器读数（snake_case 字段，用于直接写入/读取 ClickHouse）
 * 保留在 clickhouseStorage.ts 中，此处仅做类型引用说明
 */

// ============================================================
// 异常检测
// ============================================================

/**
 * 异常检测结果 - 统一模型
 * 合并自 streamProcessor.ts, rustBridge.ts, flinkProcessor.ts
 */
export interface AnomalyResult {
  sensorId?: string;
  /** 设备树节点ID，关联 asset_nodes.node_id（权威字段） */
  nodeId: string;
  /** 设备编码，关联 asset_nodes.code（可选） */
  deviceCode?: string;
  metricName?: string;
  value?: number;
  currentValue?: number;
  expectedValue?: number;
  isAnomaly: boolean;
  algorithm: string;
  score: number;
  threshold?: number;
  deviation?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  mean?: number;
  stdDev?: number;
  timestamp?: Date | number;
  windowStart?: number;
  windowEnd?: number;
  periodStart?: Date;
  details?: string;
}

// ============================================================
// 数据聚合
// ============================================================

/**
 * 聚合结果 - 统一模型
 * 合并自 streamProcessor.ts, rustBridge.ts
 */
export interface AggregateResult {
  sensorId?: string;
  /** 设备编码，关联 asset_nodes.code */
  deviceCode?: string;
  period?: '1m' | '5m' | '1h' | '1d' | string;
  periodStart?: Date;
  windowStart?: number;
  windowEnd?: number;
  count: number;
  sum: number;
  avg?: number;
  mean?: number;
  min: number;
  max: number;
  variance?: number;
  stdDev?: number;
  first?: number;
  last?: number;
  percentiles?: Record<number, number>;
}

/**
 * 窗口配置 - 统一模型
 * 合并自 flinkProcessor.ts, rustBridge.ts
 * 
 * 字段命名规范：
 * - type: 窗口类型
 * - sizeMs: 窗口大小（毫秒）
 * - slideMs: 滑动步长（毫秒）
 * - gapMs: 会话间隔（毫秒）
 * - maxSize: 最大窗口数
 * - allowedLateness: 允许迟到时间（毫秒）
 * 
 * 兼容别名（供旧代码过渡）：
 * - windowType → type
 * - windowSizeMs → sizeMs
 * - slideSizeMs → slideMs
 * - maxWindowCount → maxSize
 * - allowedLatenessMs → allowedLateness
 */
export interface WindowConfig {
  type: 'tumbling' | 'sliding' | 'session';
  sizeMs: number;
  slideMs?: number;
  gapMs?: number;
  maxSize?: number;
  allowedLateness?: number;
  // 兼容别名
  windowType?: 'tumbling' | 'sliding' | 'session';
  windowSizeMs?: number;
  slideSizeMs?: number;
  maxWindowCount?: number;
  allowedLatenessMs?: number;
}

// ============================================================
// 分页与查询
// ============================================================

/**
 * 分页结果 - 统一泛型模型
 * 合并自 deviceCrudService.ts, postgresStorage.ts
 * 
 * 注意：同时支持 items 和 data 字段名以保持兼容性
 */
export interface PaginatedResult<T> {
  items: T[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

/**
 * 查询选项 - 统一模型
 * 合并自 clickhouseClient.ts, postgresStorage.ts
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  where?: Record<string, unknown>;
  select?: string[];
  groupBy?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  // ClickHouse 扩展字段
  startTime?: Date | string;
  endTime?: Date | string;
  /** 设备编码列表，关联 asset_nodes.code */
  deviceCodes?: string[];
  sensorIds?: string[];
  metricNames?: string[];
  // 分页兼容
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

/**
 * 聚合查询选项 - ClickHouse 专用
 */
export interface AggregationOptions extends QueryOptions {
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
  interval?: string;
  groupByFields?: string[];
}

// ============================================================
// 事件处理
// ============================================================

/**
 * 事件载荷 - 统一模型
 * 合并自 kafkaEventBus.ts, eventBus.service.ts, core/index.ts
 * 
 * 同时支持简洁模式（type/data）和完整模式（eventId/eventType/severity等）
 */
export interface EventPayload {
  // 核心字段
  type: string;
  source: string;
  timestamp: Date | number;
  data: unknown;
  metadata?: Record<string, unknown>;
  // 扩展字段（完整事件模式）
  eventId?: string;
  eventType?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  topic?: string;
  // 关联实体（ID 体系 v2.0）
  /** 设备树节点ID，关联 asset_nodes.node_id */
  nodeId?: string;
  /** 设备编码，关联 asset_nodes.code */
  deviceCode?: string;
  sensorId?: string;
  userId?: string;
  correlationId?: string;
  // 载荷
  payload?: Record<string, any>;
}

/**
 * 事件处理器 - 统一类型
 * 合并自 eventBus.ts, kafkaEventBus.ts
 */
export type EventHandler = (event: EventPayload) => void | Promise<void>;

// ============================================================
// 日志与可观测性
// ============================================================

/**
 * 日志条目 - 统一模型
 * 合并自 elasticsearchClient.ts, observabilityService.ts
 */
export interface LogEntry {
  id?: string;
  timestamp: Date | string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service?: string;
  source?: string;
  host?: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// 网关与基础设施
// ============================================================

/**
 * 网关统计信息 - 统一模型
 * 合并自 kongGateway.ts, graphqlGateway.ts
 * 
 * 包含通用统计 + Kong 安全统计 + GraphQL 特有统计
 */
export interface GatewayStats {
  // 通用统计
  totalRequests: number;
  activeConnections: number;
  requestsPerSecond: number;
  averageLatency: number;
  avgLatencyMs?: number;
  errorRate: number;
  uptime: number;
  statusCodes?: Record<string, number>;
  topEndpoints?: Array<{ path: string; count: number; avgLatency: number }>;
  // Kong 安全统计
  blockedRequests?: number;
  authFailures?: number;
  rateLimitedRequests?: number;
  upstreamErrors?: number;
  // GraphQL 特有统计
  totalQueries?: number;
  totalMutations?: number;
  totalSubscriptions?: number;
  batchedQueries?: number;
  errors?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

/**
 * 布局配置 - 基础模型
 * 用于 neo4jBloomConfig.ts 和 webPortalConfig.ts
 * 
 * 通过可选字段支持两种布局模式
 */
export interface LayoutConfig {
  type: string;
  columns?: number;
  gap?: number | string;
  padding?: number | string;
  responsive?: boolean;
  breakpoints?: Record<string, unknown>;
  // Web Portal 扩展
  sidebar?: {
    width?: number | string;
    collapsedWidth?: number | string;
    collapsible?: boolean;
    items?: Array<{ label: string; icon?: string; path?: string; children?: any[] }>;
    position?: 'left' | 'right';
    collapsed?: boolean;
  };
  header?: {
    height?: number | string;
    fixed?: boolean;
    sticky?: boolean;
    logo?: string;
    title?: string;
    nav?: Array<{ label: string; path?: string; icon?: string }>;
    actions?: Array<{ label: string; icon?: string; onClick?: string }>;
    showBreadcrumb?: boolean;
  };
  footer?: {
    height?: number | string;
    show?: boolean;
    content?: string;
    links?: Array<{ label: string; url: string }>;
    fixed?: boolean;
    showCopyright?: boolean;
  };
  content?: {
    maxWidth?: number | string;
    padding?: number | string;
    background?: string;
  };
  // Neo4j Bloom 扩展
  physics?: {
    enabled?: boolean;
    solver?: string;
    repulsion?: number;
    attraction?: number;
    damping?: number;
    springLength?: number;
    springConstant?: number;
    centralGravity?: number;
  };
  nodeSpacing?: number;
  levelSeparation?: number;
  direction?: 'UD' | 'DU' | 'LR' | 'RL';
  hierarchical?: boolean | {
    direction?: string;
    levelSeparation?: number;
    nodeSpacing?: number;
    treeSpacing?: number;
  };
  improvedLayout?: boolean;
  // Neo4j Bloom 布局算法
  algorithm?: string;
  forceDirected?: {
    repulsion?: number;
    attraction?: number;
    damping?: number;
    springLength?: number;
    springConstant?: number;
    centralGravity?: number;
    iterations?: number;
  };
}

// ============================================================
// 监控与运维（打破循环导入）
// ============================================================

/**
 * 数据库状态 - 统一模型
 * 用于 databaseMonitor.ts, monitoring.service.ts
 */
export interface DatabaseStatus {
  name: string;
  type: string;
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  version?: string;
  host?: string;
  port?: number;
  connections: {
    active: number;
    idle: number;
    max: number;
  };
  performance: {
    queryLatencyMs: number;
    throughputQps: number;
    errorRate: number;
  };
  storage: {
    usedBytes: number;
    totalBytes: number;
    usagePercent: number;
  };
  lastCheck: Date;
  uptime: number;
}

/**
 * 插件状态 - 统一模型
 * 用于 monitoring.service.ts
 */
export interface PluginStatus {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'inactive' | 'error' | 'installed' | 'enabled' | 'disabled' | 'uninstalled';
  type: string;
  category: string;
  description?: string;
  author?: string;
  resources: {
    cpuPercent: number;
    memoryMB: number;
    diskMB?: number;
  };
  metrics: {
    invocations: number;
    successRate: number;
    avgLatencyMs: number;
  };
  lastActive: Date;
  installedAt?: Date;
}

/**
 * 引擎状态 - 统一模型
 * 用于 monitoring.service.ts
 */
export interface EngineStatus {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'starting' | 'error' | 'degraded';
  version: string;
  instances: number;
  resources: {
    cpuPercent: number;
    memoryMB: number;
    gpuPercent?: number;
    gpuMemoryMB?: number;
  };
  performance: {
    requestsPerSecond: number;
    avgLatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
  };
  lastActive: Date;
  uptime: number;
}

/**
 * 系统资源 - 统一模型
 * 用于 systemMonitor.ts, monitoring.service.ts
 */
export interface SystemResource {
  cpu: {
    usage: number;
    cores: number;
    loadAvg: [number, number, number];
  };
  memory: {
    usedMB: number;
    totalMB: number;
    usagePercent: number;
    cached?: number;
    buffers?: number;
  };
  disk: {
    usedGB: number;
    totalGB: number;
    usagePercent: number;
    readMBps?: number;
    writeMBps?: number;
    iops?: number;
  };
  network: {
    rxMBps: number;
    txMBps: number;
    connections: number;
    errors: number;
  };
  process: {
    pid: number;
    uptime: number;
    threads: number;
    openFiles: number;
  };
}

/**
 * 服务健康 - 统一模型
 * 用于 healthChecker.ts, monitoring.service.ts, observability.service.ts
 */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  endpoint?: string;
  lastCheck: Date;
  responseTimeMs?: number;
  latencyMs?: number;
  errorRate?: number;
  requestRate?: number;
  checks?: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
  }>;
}

/**
 * 监控告警 - 统一模型
 * 用于 monitoring.service.ts
 */
export interface MonitoringAlert {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  source: string;
  sourceType: string;
  title: string;
  message: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

// ============================================================
// 基础设施管理
// ============================================================

/**
 * Kong 网关路由
 */
export interface Route {
  id: string;
  name: string;
  paths: string[];
  methods?: string[];
  service?: string;
  protocols?: string[];
  hosts?: string[];
  stripPath?: boolean;
  preserveHost?: boolean;
  tags?: string[];
  createdAt?: number;
}

/**
 * Kong 网关服务
 */
export interface Service {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  path?: string;
  retries?: number;
  connectTimeout?: number;
  writeTimeout?: number;
  readTimeout?: number;
  tags?: string[];
  enabled?: boolean;
  createdAt?: number;
}

/**
 * RBAC 角色
 */
export interface RBACRole {
  id: string;
  name: string;
  permissions: string[];
  description?: string;
  createdAt?: Date;
}

/**
 * 速率限制结果
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter?: number;
}
