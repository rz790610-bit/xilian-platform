/**
 * @xilian/shared-kernel - 事件契约与 Schema 版本管理
 *
 * 所有微服务间的异步通信事件在此定义。
 * SchemaRegistry 提供版本化 Schema 注册、验证和自动升级能力，
 * 确保不同版本的微服务间 Kafka 消息兼容。
 *
 * 映射: server/services/eventBus.service.ts TOPICS + Event interface
 */
import { z, type ZodSchema } from 'zod';

// ============================================================
// 事件信封（所有 Kafka 消息的外层包装）
// ============================================================

export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  version: z.number().int().min(1),
  source: z.string(),
  timestamp: z.number(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  data: z.unknown(),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

// ============================================================
// Topic 常量（与 eventBus.service.ts TOPICS 对齐）
// ============================================================

export const TOPICS = {
  // 设备域
  DEVICE_STATUS: 'device.status',
  DEVICE_HEARTBEAT: 'device.heartbeat',
  DEVICE_ERROR: 'device.error',
  DEVICE_CREATED: 'device.created',
  DEVICE_UPDATED: 'device.updated',
  DEVICE_DELETED: 'device.deleted',

  // 传感器域
  SENSOR_READING: 'sensor.reading',
  SENSOR_BATCH: 'sensor.batch',
  SENSOR_ERROR: 'sensor.error',

  // 异常检测
  ANOMALY_DETECTED: 'anomaly.detected',
  ANOMALY_RESOLVED: 'anomaly.resolved',

  // 诊断域
  DIAGNOSIS_STARTED: 'diagnosis.started',
  DIAGNOSIS_COMPLETED: 'diagnosis.completed',
  DIAGNOSIS_FAILED: 'diagnosis.failed',

  // 算法域
  ALGORITHM_EXECUTION_STARTED: 'algorithm.execution.started',
  ALGORITHM_EXECUTION_COMPLETED: 'algorithm.execution.completed',
  ALGORITHM_EXECUTION_FAILED: 'algorithm.execution.failed',
  MODEL_DEPLOYED: 'model.deployed',
  MODEL_RETIRED: 'model.retired',

  // 数据管道域
  PIPELINE_STARTED: 'pipeline.started',
  PIPELINE_COMPLETED: 'pipeline.completed',
  PIPELINE_FAILED: 'pipeline.failed',
  PIPELINE_STAGE_COMPLETED: 'pipeline.stage.completed',

  // 知识域
  KNOWLEDGE_CREATED: 'knowledge.created',
  KNOWLEDGE_UPDATED: 'knowledge.updated',
  KG_NODE_CREATED: 'kg.node.created',
  KG_EDGE_CREATED: 'kg.edge.created',

  // 系统域
  SYSTEM_ALERT: 'system.alert',
  SYSTEM_METRIC: 'system.metric',

  // 工作流域
  WORKFLOW_TRIGGERED: 'workflow.triggered',
  WORKFLOW_COMPLETED: 'workflow.completed',

  // Saga/Outbox 域
  OUTBOX_EVENT_PUBLISHED: 'outbox.event.published',
  OUTBOX_EVENT_FAILED: 'outbox.event.failed',
  OUTBOX_CDC_FALLBACK: 'outbox.cdc.fallback',
  SAGA_STARTED: 'saga.started',
  SAGA_COMPLETED: 'saga.completed',
  SAGA_FAILED: 'saga.failed',
  SAGA_COMPENSATED: 'saga.compensated',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

// ============================================================
// SchemaRegistry — 版本化 Schema 注册与自动升级
// （审核意见5 优化3：多版本 Schema 兼容）
// ============================================================

type Migrator = (data: unknown) => unknown;

export class SchemaRegistry {
  private schemas = new Map<string, Map<number, ZodSchema>>();
  private migrators = new Map<string, Migrator>();
  private latestVersions = new Map<string, number>();

  /**
   * 注册事件 Schema
   * @param eventType 事件类型（如 'device.created'）
   * @param version 版本号（从 1 开始递增）
   * @param schema Zod Schema
   */
  register(eventType: string, version: number, schema: ZodSchema): this {
    if (!this.schemas.has(eventType)) {
      this.schemas.set(eventType, new Map());
    }
    this.schemas.get(eventType)!.set(version, schema);

    const currentMax = this.latestVersions.get(eventType) ?? 0;
    if (version > currentMax) {
      this.latestVersions.set(eventType, version);
    }
    return this;
  }

  /**
   * 注册版本迁移函数
   * @param eventType 事件类型
   * @param fromVersion 源版本
   * @param toVersion 目标版本
   * @param migrator 迁移函数
   */
  registerMigrator(
    eventType: string,
    fromVersion: number,
    toVersion: number,
    migrator: Migrator,
  ): this {
    const key = `${eventType}:${fromVersion}->${toVersion}`;
    this.migrators.set(key, migrator);
    return this;
  }

  /**
   * 验证事件数据
   */
  validate(eventType: string, version: number, data: unknown): unknown {
    const versionMap = this.schemas.get(eventType);
    if (!versionMap) {
      throw new SchemaError(`Unknown event type: ${eventType}`);
    }
    const schema = versionMap.get(version);
    if (!schema) {
      throw new SchemaError(
        `Unknown schema version: ${eventType}@v${version}. ` +
        `Available: [${[...versionMap.keys()].join(', ')}]`,
      );
    }
    return schema.parse(data);
  }

  /**
   * 自动升级到最新版本
   */
  upgrade(eventType: string, fromVersion: number, data: unknown): { data: unknown; version: number } {
    const maxVersion = this.latestVersions.get(eventType);
    if (!maxVersion || fromVersion >= maxVersion) {
      return { data, version: fromVersion };
    }

    let current = data;
    for (let v = fromVersion; v < maxVersion; v++) {
      const key = `${eventType}:${v}->${v + 1}`;
      const migrator = this.migrators.get(key);
      if (!migrator) {
        throw new SchemaError(
          `Missing migrator: ${key}. Cannot upgrade ${eventType} from v${fromVersion} to v${maxVersion}.`,
        );
      }
      current = migrator(current);
    }

    // 用最新 Schema 验证升级后的数据
    this.validate(eventType, maxVersion, current);
    return { data: current, version: maxVersion };
  }

  /**
   * 获取事件类型的最新版本号
   */
  getLatestVersion(eventType: string): number {
    return this.latestVersions.get(eventType) ?? 0;
  }

  /**
   * 检查兼容性：是否可以从 fromVersion 升级到 toVersion
   */
  canUpgrade(eventType: string, fromVersion: number, toVersion?: number): boolean {
    const target = toVersion ?? this.getLatestVersion(eventType);
    for (let v = fromVersion; v < target; v++) {
      const key = `${eventType}:${v}->${v + 1}`;
      if (!this.migrators.has(key)) return false;
    }
    return true;
  }

  /**
   * 列出所有已注册的事件类型和版本
   */
  listSchemas(): Array<{ eventType: string; versions: number[]; latest: number }> {
    const result: Array<{ eventType: string; versions: number[]; latest: number }> = [];
    for (const [eventType, versionMap] of this.schemas) {
      result.push({
        eventType,
        versions: [...versionMap.keys()].sort((a, b) => a - b),
        latest: this.latestVersions.get(eventType) ?? 0,
      });
    }
    return result;
  }
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

// ============================================================
// 全局 Schema 注册表实例 + 预注册事件 Schema
// ============================================================

export const schemaRegistry = new SchemaRegistry();

// --- device.created ---
const DeviceCreatedV1 = z.object({
  deviceId: z.string(),
  name: z.string(),
  type: z.string(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
});

const DeviceCreatedV2 = DeviceCreatedV1.extend({
  location: z.string(),
  tags: z.array(z.string()).optional(),
});

schemaRegistry
  .register(TOPICS.DEVICE_CREATED, 1, DeviceCreatedV1)
  .register(TOPICS.DEVICE_CREATED, 2, DeviceCreatedV2)
  .registerMigrator(TOPICS.DEVICE_CREATED, 1, 2, (data: unknown) => ({
    ...(data as Record<string, unknown>),
    location: 'unknown',
    tags: [],
  }));

// --- device.status ---
const DeviceStatusV1 = z.object({
  deviceId: z.string(),
  status: z.enum(['online', 'offline', 'warning', 'error', 'maintenance', 'unknown']),
  timestamp: z.number(),
});

schemaRegistry.register(TOPICS.DEVICE_STATUS, 1, DeviceStatusV1);

// --- sensor.reading ---
const SensorReadingV1 = z.object({
  sensorId: z.string(),
  deviceId: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.number(),
});

const SensorReadingV2 = SensorReadingV1.extend({
  quality: z.number().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

schemaRegistry
  .register(TOPICS.SENSOR_READING, 1, SensorReadingV1)
  .register(TOPICS.SENSOR_READING, 2, SensorReadingV2)
  .registerMigrator(TOPICS.SENSOR_READING, 1, 2, (data: unknown) => ({
    ...(data as Record<string, unknown>),
    quality: 100,
    metadata: {},
  }));

// --- anomaly.detected ---
const AnomalyDetectedV1 = z.object({
  anomalyId: z.string(),
  deviceId: z.string(),
  sensorId: z.string().optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  type: z.string(),
  description: z.string(),
  timestamp: z.number(),
  metrics: z.record(z.number()).optional(),
});

schemaRegistry.register(TOPICS.ANOMALY_DETECTED, 1, AnomalyDetectedV1);

// --- algorithm.execution.completed ---
const AlgorithmExecutionCompletedV1 = z.object({
  executionId: z.string(),
  algorithmId: z.string(),
  deviceId: z.string().optional(),
  status: z.enum(['success', 'partial', 'failed']),
  results: z.unknown(),
  duration: z.number(),
  timestamp: z.number(),
});

schemaRegistry.register(TOPICS.ALGORITHM_EXECUTION_COMPLETED, 1, AlgorithmExecutionCompletedV1);

// --- pipeline.completed ---
const PipelineCompletedV1 = z.object({
  pipelineId: z.string(),
  name: z.string(),
  status: z.enum(['success', 'partial_success', 'failed']),
  stages: z.array(z.object({
    name: z.string(),
    status: z.string(),
    duration: z.number(),
  })),
  totalDuration: z.number(),
  timestamp: z.number(),
});

schemaRegistry.register(TOPICS.PIPELINE_COMPLETED, 1, PipelineCompletedV1);

// --- saga.started / saga.completed / saga.failed ---
const SagaEventV1 = z.object({
  sagaId: z.string(),
  sagaType: z.string(),
  step: z.string().optional(),
  status: z.string(),
  payload: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});

schemaRegistry
  .register(TOPICS.SAGA_STARTED, 1, SagaEventV1)
  .register(TOPICS.SAGA_COMPLETED, 1, SagaEventV1)
  .register(TOPICS.SAGA_FAILED, 1, SagaEventV1)
  .register(TOPICS.SAGA_COMPENSATED, 1, SagaEventV1);

// ============================================================
// EventConsumer — 自动版本升级消费者
// ============================================================

export class EventConsumer {
  constructor(
    private registry: SchemaRegistry = schemaRegistry,
    private onUpgrade?: (eventType: string, from: number, to: number) => void,
  ) {}

  /**
   * 消费事件：验证 + 自动升级到最新版本
   */
  consume<T = unknown>(envelope: EventEnvelope): { data: T; version: number } {
    const { eventType, version, data } = envelope;

    // 验证当前版本
    const validated = this.registry.validate(eventType, version, data);

    // 检查是否需要升级
    const latestVersion = this.registry.getLatestVersion(eventType);
    if (version < latestVersion && this.registry.canUpgrade(eventType, version)) {
      const upgraded = this.registry.upgrade(eventType, version, validated);
      this.onUpgrade?.(eventType, version, upgraded.version);
      return { data: upgraded.data as T, version: upgraded.version };
    }

    return { data: validated as T, version };
  }
}

// ============================================================
// 事件构建器 — 标准化事件创建
// ============================================================

let _counter = 0;

export function createEvent(
  eventType: string,
  data: unknown,
  options?: {
    source?: string;
    traceId?: string;
    spanId?: string;
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, unknown>;
  },
): EventEnvelope {
  const version = schemaRegistry.getLatestVersion(eventType) || 1;

  // 用最新 Schema 验证
  if (schemaRegistry.getLatestVersion(eventType) > 0) {
    schemaRegistry.validate(eventType, version, data);
  }

  return {
    eventId: generateEventId(),
    eventType,
    version,
    source: options?.source ?? 'unknown',
    timestamp: Date.now(),
    traceId: options?.traceId,
    spanId: options?.spanId,
    correlationId: options?.correlationId,
    causationId: options?.causationId,
    metadata: options?.metadata,
    data,
  };
}

function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  const seq = (++_counter).toString(36);
  return `evt_${ts}_${rand}_${seq}`;
}
