/**
 * @xilian/shared-kernel - 统一类型定义
 * 
 * 所有微服务共享的类型契约。任何跨服务通信的数据结构必须在此定义。
 * 单个服务内部的类型应在各自服务中定义。
 */

import { z } from 'zod';

// ============================================================
// 通用基础类型
// ============================================================

/** 分页请求 */
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/** 分页响应 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 通用 API 响应 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId: string;
  timestamp: string;
}

/** API 错误 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string; // 仅开发环境
}

/** 服务间调用上下文 */
export interface ServiceContext {
  requestId: string;
  traceId: string;
  spanId: string;
  userId?: string;
  tenantId?: string;
  source: string; // 调用方服务名
  timestamp: number;
}

// ============================================================
// 设备域类型
// ============================================================

export const DeviceStatusEnum = z.enum([
  'online', 'offline', 'warning', 'error', 'maintenance', 'unknown'
]);
export type DeviceStatus = z.infer<typeof DeviceStatusEnum>;

export const DeviceTypeEnum = z.enum([
  'sensor', 'actuator', 'gateway', 'controller', 'plc', 'robot', 'cnc', 'custom'
]);
export type DeviceType = z.infer<typeof DeviceTypeEnum>;

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  model: string;
  manufacturer?: string;
  serialNumber?: string;
  location: string;
  status: DeviceStatus;
  metadata: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceTelemetry {
  deviceId: string;
  sensorId: string;
  metricName: string;
  value: number;
  unit: string;
  quality: 'good' | 'uncertain' | 'bad';
  timestamp: Date;
  tags: Record<string, string>;
}

export interface DeviceCommand {
  deviceId: string;
  commandType: string;
  parameters: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout: number;
  correlationId: string;
}

// ============================================================
// 算法域类型
// ============================================================

export const AlgorithmCategoryEnum = z.enum([
  'mechanical', 'electrical', 'structural', 'anomaly',
  'feature-extraction', 'comprehensive', 'optimization',
  'rule-learning', 'model-iteration', 'agent-plugins'
]);
export type AlgorithmCategory = z.infer<typeof AlgorithmCategoryEnum>;

export interface AlgorithmDefinition {
  id: string;
  name: string;
  category: AlgorithmCategory;
  version: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  parameters: AlgorithmParameter[];
  requirements: AlgorithmRequirements;
}

export interface AlgorithmParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  description: string;
}

export interface AlgorithmRequirements {
  minSampleRate?: number;
  minDataPoints?: number;
  supportedDeviceTypes?: DeviceType[];
  gpuRequired?: boolean;
  estimatedDurationMs?: number;
}

export interface AlgorithmExecution {
  id: string;
  algorithmId: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'timeout' | 'cancelled';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  deviceId?: string;
  correlationId: string;
}

// ============================================================
// 数据管道域类型
// ============================================================

export const PipelineStatusEnum = z.enum([
  'draft', 'active', 'paused', 'error', 'completed', 'archived'
]);
export type PipelineStatus = z.infer<typeof PipelineStatusEnum>;

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  status: PipelineStatus;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  schedule?: string; // cron expression
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineNode {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  nodeMetrics: Record<string, PipelineNodeMetric>;
  error?: string;
}

export interface PipelineNodeMetric {
  nodeId: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  inputCount: number;
  outputCount: number;
  durationMs: number;
  error?: string;
}

// ============================================================
// 知识域类型
// ============================================================

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  type: 'vector' | 'graph' | 'hybrid';
  pointsCount: number;
  documentsCount: number;
  createdAt: Date;
}

export interface KnowledgeDocument {
  id: string;
  collectionId: string;
  title: string;
  content: string;
  metadata: Record<string, string>;
  embedding?: number[];
  createdAt: Date;
}

export interface KnowledgeQuery {
  query: string;
  collectionId?: string;
  topK: number;
  scoreThreshold?: number;
  filters?: Record<string, unknown>;
}

export interface KnowledgeSearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, string>;
}

// ============================================================
// 告警域类型
// ============================================================

export const AlertSeverityEnum = z.enum(['critical', 'warning', 'info']);
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

export const AlertStatusEnum = z.enum(['active', 'acknowledged', 'resolved', 'suppressed']);
export type AlertStatus = z.infer<typeof AlertStatusEnum>;

export interface Alert {
  id: string;
  deviceId: string;
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  status: AlertStatus;
  context: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  enabled: boolean;
  cooldownMs: number;
  notificationChannels: string[];
}

export interface AlertCondition {
  type: 'threshold' | 'anomaly' | 'pattern' | 'composite';
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
  value: number;
  duration?: number; // 持续时间（ms）
  windowSize?: number; // 滑动窗口大小
}

// ============================================================
// 监控域类型
// ============================================================

export interface ServiceHealth {
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: HealthCheck[];
  timestamp: Date;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface SystemMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { rxBytes: number; txBytes: number };
  process: { pid: number; uptime: number; heapUsed: number; heapTotal: number };
}

// ============================================================
// Saga / 事务类型
// ============================================================

export const SagaStatusEnum = z.enum([
  'pending', 'running', 'compensating', 'completed', 'failed', 'aborted'
]);
export type SagaStatus = z.infer<typeof SagaStatusEnum>;

export interface SagaInstance {
  id: string;
  type: string;
  status: SagaStatus;
  steps: SagaStep[];
  context: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface SagaStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'compensating' | 'compensated' | 'failed';
  executedAt?: Date;
  compensatedAt?: Date;
  error?: string;
}
