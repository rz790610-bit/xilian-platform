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
 */

// ============================================================
// 传感器与数据采集
// ============================================================

/**
 * 传感器读数 - 统一模型
 * 合并自 streamProcessor.ts, clickhouseClient.ts, flinkProcessor.ts
 */
export interface SensorReading {
  sensorId: string;
  deviceId: string;
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
  deviceId?: string;
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
  deviceId?: string;
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
 */
export interface WindowConfig {
  type: 'tumbling' | 'sliding' | 'session';
  sizeMs: number;
  slideMs?: number;
  gapMs?: number;
  maxSize?: number;
  allowedLateness?: number;
}

// ============================================================
// 分页与查询
// ============================================================

/**
 * 分页结果 - 统一泛型模型
 * 合并自 deviceCrudService.ts, postgresStorage.ts
 */
export interface PaginatedResult<T> {
  items: T[];
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
}

// ============================================================
// 事件处理
// ============================================================

/**
 * 事件载荷 - 统一模型
 */
export interface EventPayload {
  type: string;
  source: string;
  timestamp: Date | number;
  data: unknown;
  metadata?: Record<string, unknown>;
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
 */
export interface GatewayStats {
  totalRequests: number;
  activeConnections: number;
  requestsPerSecond: number;
  averageLatency: number;
  errorRate: number;
  uptime: number;
  statusCodes?: Record<string, number>;
  topEndpoints?: Array<{ path: string; count: number; avgLatency: number }>;
}

/**
 * 布局配置 - 统一模型
 * 合并自 neo4jBloomConfig.ts, webPortalConfig.ts
 */
export interface LayoutConfig {
  type: string;
  columns?: number;
  gap?: number | string;
  padding?: number | string;
  responsive?: boolean;
  breakpoints?: Record<string, unknown>;
}
