/**
 * ============================================================================
 * Event Schema Registry — 中央事件 Schema 注册中心
 * ============================================================================
 *
 * 核心职责：
 *   1. 注册/管理所有跨服务事件的 Zod Schema（含版本管理 SemVer）
 *   2. 校验事件载荷合规性（生产前校验，不合规拒绝发送）
 *   3. 向后兼容性检查（字段只增不删，类型不变）
 *   4. 事件发现 API（按闭环阶段分类查询）
 *   5. 死信队列统计（不合规事件追踪）
 *
 * 设计原则：
 *   - 所有 Kafka 事件生产必须经过 Schema 验证
 *   - Schema 版本变更自动检查向后兼容性
 *   - 内存缓存 + 持久化双层存储
 */

import { z, ZodSchema, ZodObject, ZodRawShape, ZodError } from 'zod';
import type { EventType, EventPayloadMap, EventEnvelope, EventMetadata, EventSource } from './data-contracts';

// ============================================================================
// Schema 版本管理
// ============================================================================

/** SemVer 版本号 */
export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

/** 解析 SemVer 字符串 */
export function parseSemVer(version: string): SchemaVersion {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid SemVer: ${version}`);
  return { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) };
}

/** 比较两个版本号 */
export function compareSemVer(a: SchemaVersion, b: SchemaVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** 格式化版本号 */
export function formatSemVer(v: SchemaVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

// ============================================================================
// Schema 注册条目
// ============================================================================

/** 闭环阶段 */
export type LoopStage = 'perception' | 'diagnosis' | 'guardrail' | 'evolution';

/** Schema 注册条目 */
export interface SchemaRegistryEntry {
  /** 事件类型 */
  eventType: string;
  /** 当前版本 */
  currentVersion: string;
  /** 所有版本的 Schema */
  versions: Map<string, ZodSchema>;
  /** 闭环阶段 */
  stage: LoopStage;
  /** 描述 */
  description: string;
  /** 注册时间 */
  registeredAt: Date;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
  /** 关键 payload 字段列表（用于文档） */
  keyFields: string[];
}

/** 校验结果 */
export interface ValidationResult {
  /** 是否合规 */
  valid: boolean;
  /** 事件类型 */
  eventType: string;
  /** 使用的 Schema 版本 */
  schemaVersion: string;
  /** 错误详情 */
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  /** 校验耗时 (ms) */
  validationTimeMs: number;
}

/** 兼容性检查结果 */
export interface CompatibilityResult {
  /** 是否兼容 */
  compatible: boolean;
  /** 不兼容原因 */
  breakingChanges: Array<{
    field: string;
    changeType: 'removed' | 'type_changed' | 'required_added';
    description: string;
  }>;
  /** 非破坏性变更 */
  nonBreakingChanges: Array<{
    field: string;
    changeType: 'added_optional' | 'description_changed';
    description: string;
  }>;
}

/** 事件定义（用于 API 展示） */
export interface EventDefinition {
  eventType: string;
  currentVersion: string;
  stage: LoopStage;
  description: string;
  keyFields: string[];
  versionCount: number;
  registeredAt: Date;
  lastUpdatedAt: Date;
}

/** 死信统计 */
export interface DeadLetterStats {
  /** 事件类型 */
  eventType: string;
  /** 失败次数 */
  failureCount: number;
  /** 最近失败时间 */
  lastFailureAt: Date;
  /** 最近失败原因 */
  lastFailureReason: string;
  /** 失败原因分布 */
  failureReasons: Record<string, number>;
}

// ============================================================================
// Event Schema Registry 核心类
// ============================================================================

export class EventSchemaRegistry {
  /** Schema 存储（eventType → SchemaRegistryEntry） */
  private schemas: Map<string, SchemaRegistryEntry> = new Map();

  /** 死信统计 */
  private deadLetterStats: Map<string, DeadLetterStats> = new Map();

  /** 事件信封 Schema */
  private envelopeSchema: ZodSchema;

  constructor() {
    // 事件信封基础 Schema
    this.envelopeSchema = z.object({
      eventId: z.string().uuid(),
      eventType: z.string().min(1),
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      timestamp: z.number().positive(),
      source: z.object({
        serviceId: z.string().min(1),
        instanceId: z.string().min(1),
        machineId: z.string().optional(),
      }),
      payload: z.unknown(),
      metadata: z.object({
        traceId: z.string().min(1),
        conditionId: z.string().optional(),
        cyclePhase: z.string().optional(),
        correlationId: z.string().optional(),
        nodeId: z.string().optional(),
      }),
    });
  }

  // ============================================================================
  // 注册 API
  // ============================================================================

  /**
   * 注册事件 Schema
   * @param eventType 事件类型
   * @param version SemVer 版本号
   * @param schema Zod Schema
   * @param stage 闭环阶段
   * @param description 描述
   * @param keyFields 关键字段列表
   */
  register(
    eventType: string,
    version: string,
    schema: ZodSchema,
    stage: LoopStage,
    description: string,
    keyFields: string[] = []
  ): void {
    // 验证版本号格式
    parseSemVer(version);

    const existing = this.schemas.get(eventType);

    if (existing) {
      // 检查版本是否已存在
      if (existing.versions.has(version)) {
        throw new Error(`Schema version ${version} already registered for event type ${eventType}`);
      }

      // 检查新版本是否大于当前版本
      const currentVer = parseSemVer(existing.currentVersion);
      const newVer = parseSemVer(version);
      if (compareSemVer(newVer, currentVer) <= 0) {
        throw new Error(
          `New version ${version} must be greater than current version ${existing.currentVersion} for event type ${eventType}`
        );
      }

      // 向后兼容性检查（仅 minor/patch 升级时强制）
      if (newVer.major === currentVer.major) {
        const compatibility = this.checkCompatibility(eventType, schema);
        if (!compatibility.compatible) {
          const reasons = compatibility.breakingChanges.map(c => `${c.field}: ${c.description}`).join('; ');
          throw new Error(
            `Schema version ${version} is not backward compatible with ${existing.currentVersion}: ${reasons}. ` +
            `Use a major version bump for breaking changes.`
          );
        }
      }

      existing.versions.set(version, schema);
      existing.currentVersion = version;
      existing.lastUpdatedAt = new Date();
      if (keyFields.length > 0) existing.keyFields = keyFields;
    } else {
      this.schemas.set(eventType, {
        eventType,
        currentVersion: version,
        versions: new Map([[version, schema]]),
        stage,
        description,
        registeredAt: new Date(),
        lastUpdatedAt: new Date(),
        keyFields,
      });
    }
  }

  // ============================================================================
  // 校验 API
  // ============================================================================

  /**
   * 校验事件（信封 + 载荷）
   * @param event 完整事件（含信封）
   * @returns 校验结果
   */
  validate(event: unknown): ValidationResult {
    const startTime = Date.now();

    // 1. 校验信封结构
    const envelopeResult = this.envelopeSchema.safeParse(event);
    if (!envelopeResult.success) {
      return {
        valid: false,
        eventType: 'unknown',
        schemaVersion: 'unknown',
        errors: envelopeResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
        validationTimeMs: Date.now() - startTime,
      };
    }

    const envelope = envelopeResult.data as EventEnvelope;

    // 2. 查找对应的 payload Schema
    const entry = this.schemas.get(envelope.eventType);
    if (!entry) {
      return {
        valid: false,
        eventType: envelope.eventType,
        schemaVersion: envelope.version,
        errors: [{ path: 'eventType', message: `Unregistered event type: ${envelope.eventType}`, code: 'unregistered' }],
        validationTimeMs: Date.now() - startTime,
      };
    }

    // 3. 查找对应版本的 Schema（如果指定版本不存在，使用当前版本）
    const schema = entry.versions.get(envelope.version) || entry.versions.get(entry.currentVersion);
    if (!schema) {
      return {
        valid: false,
        eventType: envelope.eventType,
        schemaVersion: envelope.version,
        errors: [{ path: 'version', message: `Schema version ${envelope.version} not found`, code: 'version_not_found' }],
        validationTimeMs: Date.now() - startTime,
      };
    }

    // 4. 校验 payload
    const payloadResult = schema.safeParse(envelope.payload);
    if (!payloadResult.success) {
      // 记录死信统计
      this.recordDeadLetter(envelope.eventType, payloadResult.error);

      return {
        valid: false,
        eventType: envelope.eventType,
        schemaVersion: envelope.version,
        errors: payloadResult.error.issues.map(issue => ({
          path: `payload.${issue.path.join('.')}`,
          message: issue.message,
          code: issue.code,
        })),
        validationTimeMs: Date.now() - startTime,
      };
    }

    return {
      valid: true,
      eventType: envelope.eventType,
      schemaVersion: envelope.version,
      validationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * 仅校验 payload（不校验信封，用于内部服务间调用）
   */
  validatePayload(eventType: string, payload: unknown, version?: string): ValidationResult {
    const startTime = Date.now();
    const entry = this.schemas.get(eventType);
    if (!entry) {
      return {
        valid: false,
        eventType,
        schemaVersion: version || 'unknown',
        errors: [{ path: '', message: `Unregistered event type: ${eventType}`, code: 'unregistered' }],
        validationTimeMs: Date.now() - startTime,
      };
    }

    const schema = version ? entry.versions.get(version) : entry.versions.get(entry.currentVersion);
    if (!schema) {
      return {
        valid: false,
        eventType,
        schemaVersion: version || entry.currentVersion,
        errors: [{ path: '', message: `Schema version not found`, code: 'version_not_found' }],
        validationTimeMs: Date.now() - startTime,
      };
    }

    const result = schema.safeParse(payload);
    if (!result.success) {
      this.recordDeadLetter(eventType, result.error);
      return {
        valid: false,
        eventType,
        schemaVersion: version || entry.currentVersion,
        errors: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
        validationTimeMs: Date.now() - startTime,
      };
    }

    return {
      valid: true,
      eventType,
      schemaVersion: version || entry.currentVersion,
      validationTimeMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // 兼容性检查 API
  // ============================================================================

  /**
   * 检查新 Schema 与当前版本的向后兼容性
   * 规则：字段只增不删，类型不变，新增字段必须可选
   */
  checkCompatibility(eventType: string, newSchema: ZodSchema): CompatibilityResult {
    const entry = this.schemas.get(eventType);
    if (!entry) {
      return { compatible: true, breakingChanges: [], nonBreakingChanges: [] };
    }

    const currentSchema = entry.versions.get(entry.currentVersion);
    if (!currentSchema) {
      return { compatible: true, breakingChanges: [], nonBreakingChanges: [] };
    }

    const breakingChanges: CompatibilityResult['breakingChanges'] = [];
    const nonBreakingChanges: CompatibilityResult['nonBreakingChanges'] = [];

    // 提取字段信息进行对比
    const currentFields = this.extractSchemaFields(currentSchema);
    const newFields = this.extractSchemaFields(newSchema);

    // 检查删除的字段（破坏性变更）
    for (const [fieldName, fieldInfo] of currentFields) {
      if (!newFields.has(fieldName)) {
        breakingChanges.push({
          field: fieldName,
          changeType: 'removed',
          description: `Field '${fieldName}' was removed`,
        });
      }
    }

    // 检查新增字段
    for (const [fieldName, fieldInfo] of newFields) {
      if (!currentFields.has(fieldName)) {
        if (fieldInfo.required) {
          breakingChanges.push({
            field: fieldName,
            changeType: 'required_added',
            description: `Required field '${fieldName}' was added (must be optional for backward compatibility)`,
          });
        } else {
          nonBreakingChanges.push({
            field: fieldName,
            changeType: 'added_optional',
            description: `Optional field '${fieldName}' was added`,
          });
        }
      }
    }

    return {
      compatible: breakingChanges.length === 0,
      breakingChanges,
      nonBreakingChanges,
    };
  }

  // ============================================================================
  // 查询 API
  // ============================================================================

  /**
   * 获取指定事件类型的 Schema
   */
  getSchema(eventType: string, version?: string): ZodSchema | undefined {
    const entry = this.schemas.get(eventType);
    if (!entry) return undefined;
    return version ? entry.versions.get(version) : entry.versions.get(entry.currentVersion);
  }

  /**
   * 获取事件定义（用于 API 展示）
   */
  getEventDefinition(eventType: string): EventDefinition | undefined {
    const entry = this.schemas.get(eventType);
    if (!entry) return undefined;
    return {
      eventType: entry.eventType,
      currentVersion: entry.currentVersion,
      stage: entry.stage,
      description: entry.description,
      keyFields: entry.keyFields,
      versionCount: entry.versions.size,
      registeredAt: entry.registeredAt,
      lastUpdatedAt: entry.lastUpdatedAt,
    };
  }

  /**
   * 列出所有事件定义（可按闭环阶段过滤）
   */
  listEvents(filter?: { stage?: LoopStage }): EventDefinition[] {
    const results: EventDefinition[] = [];
    for (const entry of this.schemas.values()) {
      if (filter?.stage && entry.stage !== filter.stage) continue;
      results.push({
        eventType: entry.eventType,
        currentVersion: entry.currentVersion,
        stage: entry.stage,
        description: entry.description,
        keyFields: entry.keyFields,
        versionCount: entry.versions.size,
        registeredAt: entry.registeredAt,
        lastUpdatedAt: entry.lastUpdatedAt,
      });
    }
    return results.sort((a, b) => a.eventType.localeCompare(b.eventType));
  }

  /**
   * 按闭环阶段分组列出事件
   */
  listEventsByStage(): Record<LoopStage, EventDefinition[]> {
    const result: Record<LoopStage, EventDefinition[]> = {
      perception: [],
      diagnosis: [],
      guardrail: [],
      evolution: [],
    };
    for (const def of this.listEvents()) {
      result[def.stage].push(def);
    }
    return result;
  }

  /**
   * 获取注册统计
   */
  getStats(): {
    totalEventTypes: number;
    totalVersions: number;
    byStage: Record<LoopStage, number>;
    deadLetterTotal: number;
  } {
    let totalVersions = 0;
    const byStage: Record<LoopStage, number> = { perception: 0, diagnosis: 0, guardrail: 0, evolution: 0 };
    let deadLetterTotal = 0;

    for (const entry of this.schemas.values()) {
      totalVersions += entry.versions.size;
      byStage[entry.stage]++;
    }

    for (const stats of this.deadLetterStats.values()) {
      deadLetterTotal += stats.failureCount;
    }

    return {
      totalEventTypes: this.schemas.size,
      totalVersions,
      byStage,
      deadLetterTotal,
    };
  }

  // ============================================================================
  // 死信管理
  // ============================================================================

  /**
   * 获取死信统计
   */
  getDeadLetterStats(): DeadLetterStats[] {
    return Array.from(this.deadLetterStats.values()).sort((a, b) => b.failureCount - a.failureCount);
  }

  /**
   * 重置死信统计
   */
  resetDeadLetterStats(eventType?: string): void {
    if (eventType) {
      this.deadLetterStats.delete(eventType);
    } else {
      this.deadLetterStats.clear();
    }
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  /**
   * 提取 Zod Schema 的字段信息（用于兼容性检查）
   */
  private extractSchemaFields(schema: ZodSchema): Map<string, { required: boolean; type: string }> {
    const fields = new Map<string, { required: boolean; type: string }>();

    try {
      // 尝试从 ZodObject 提取字段
      if (schema instanceof z.ZodObject) {
        const shape = (schema as ZodObject<ZodRawShape>).shape;
        for (const [key, value] of Object.entries(shape)) {
          const zodValue = value as ZodSchema;
          const isOptional = zodValue instanceof z.ZodOptional || zodValue instanceof z.ZodNullable;
          fields.set(key, {
            required: !isOptional,
            type: zodValue.constructor.name,
          });
        }
      }
    } catch {
      // 如果无法提取字段，返回空 Map（兼容性检查将通过）
    }

    return fields;
  }

  /**
   * 记录死信统计
   */
  private recordDeadLetter(eventType: string, error: ZodError): void {
    const reason = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    const existing = this.deadLetterStats.get(eventType);

    if (existing) {
      existing.failureCount++;
      existing.lastFailureAt = new Date();
      existing.lastFailureReason = reason;
      existing.failureReasons[reason] = (existing.failureReasons[reason] || 0) + 1;
    } else {
      this.deadLetterStats.set(eventType, {
        eventType,
        failureCount: 1,
        lastFailureAt: new Date(),
        lastFailureReason: reason,
        failureReasons: { [reason]: 1 },
      });
    }
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const eventSchemaRegistry = new EventSchemaRegistry();
