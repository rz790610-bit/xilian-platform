/**
 * ============================================================================
 * 带 Schema 校验的事件发射器 — 生产前校验，不合规拒绝发送
 * ============================================================================
 *
 * 包装现有 EventBus（cognition/events/emitter.ts），
 * 在 emit 前自动调用 EventSchemaRegistry.validate()。
 *
 * 使用方式：
 *   import { validatedEmitter } from './event-emitter-validated';
 *   validatedEmitter.emit('diagnosis.report.generated', payload, metadata);
 */

const uuidv4 = () => crypto.randomUUID();
import { eventSchemaRegistry, type ValidationResult } from './event-schema-registry';
import type {
  EventType,
  EventPayloadMap,
  EventEnvelope,
  EventMetadata,
  EventSource,
} from './data-contracts';

// ============================================================================
// 配置
// ============================================================================

export interface ValidatedEmitterConfig {
  /** 当前服务 ID */
  serviceId: string;
  /** 当前实例 ID */
  instanceId: string;
  /** 是否在校验失败时抛出异常（生产环境建议 false，记录死信） */
  throwOnValidationFailure: boolean;
  /** 是否启用校验（可在紧急情况下关闭） */
  validationEnabled: boolean;
  /** 校验失败回调 */
  onValidationFailure?: (result: ValidationResult, envelope: EventEnvelope) => void;
  /** 底层事件发射函数（对接 Kafka / EventBus / 内存） */
  transport: (envelope: EventEnvelope) => Promise<void>;
}

// ============================================================================
// ValidatedEventEmitter
// ============================================================================

export class ValidatedEventEmitter {
  private config: ValidatedEmitterConfig;
  private emitCount = 0;
  private validationFailureCount = 0;

  constructor(config: ValidatedEmitterConfig) {
    this.config = config;
  }

  /**
   * 发射类型安全的事件
   * @param eventType 事件类型（从 EventPayloadMap 中选择）
   * @param payload 事件载荷（自动推断类型）
   * @param metadata 事件元数据
   * @param machineId 可选的设备 ID（注入到 source 中）
   */
  async emit<T extends EventType>(
    eventType: T,
    payload: EventPayloadMap[T],
    metadata: Partial<EventMetadata> & { traceId: string },
    machineId?: string
  ): Promise<{ eventId: string; validated: boolean }> {
    const eventId = uuidv4();
    const now = Date.now();

    // 构建事件信封
    const envelope: EventEnvelope<EventPayloadMap[T]> = {
      eventId,
      eventType,
      version: this.getCurrentVersion(eventType),
      timestamp: now,
      source: {
        serviceId: this.config.serviceId,
        instanceId: this.config.instanceId,
        machineId,
      },
      payload,
      metadata: {
        traceId: metadata.traceId,
        conditionId: metadata.conditionId,
        cyclePhase: metadata.cyclePhase,
        correlationId: metadata.correlationId,
        nodeId: metadata.nodeId,
      },
    };

    // Schema 校验
    let validated = true;
    if (this.config.validationEnabled) {
      const result = eventSchemaRegistry.validate(envelope);
      if (!result.valid) {
        validated = false;
        this.validationFailureCount++;

        // 回调通知
        if (this.config.onValidationFailure) {
          this.config.onValidationFailure(result, envelope as EventEnvelope);
        }

        if (this.config.throwOnValidationFailure) {
          throw new Error(
            `Event validation failed for ${eventType}: ${result.errors?.map(e => `${e.path}: ${e.message}`).join('; ')}`
          );
        }

        // 非抛出模式：记录日志但仍然发送（降级）
        console.warn(
          `[ValidatedEmitter] Schema validation failed for ${eventType} (eventId=${eventId}):`,
          result.errors
        );
      }
    }

    // 发送到底层传输
    try {
      await this.config.transport(envelope as EventEnvelope);
      this.emitCount++;
    } catch (err) {
      console.error(`[ValidatedEmitter] Transport failed for ${eventType} (eventId=${eventId}):`, err);
      throw err;
    }

    return { eventId, validated };
  }

  /**
   * 批量发射事件（同一类型）
   */
  async emitBatch<T extends EventType>(
    eventType: T,
    payloads: EventPayloadMap[T][],
    metadata: Partial<EventMetadata> & { traceId: string },
    machineId?: string
  ): Promise<Array<{ eventId: string; validated: boolean }>> {
    const results: Array<{ eventId: string; validated: boolean }> = [];
    for (const payload of payloads) {
      const result = await this.emit(eventType, payload, metadata, machineId);
      results.push(result);
    }
    return results;
  }

  /**
   * 获取发射统计
   */
  getStats(): { emitCount: number; validationFailureCount: number; failureRate: number } {
    return {
      emitCount: this.emitCount,
      validationFailureCount: this.validationFailureCount,
      failureRate: this.emitCount > 0 ? this.validationFailureCount / this.emitCount : 0,
    };
  }

  /**
   * 更新配置（运行时热更新）
   */
  updateConfig(partial: Partial<ValidatedEmitterConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * 获取事件类型的当前 Schema 版本
   */
  private getCurrentVersion(eventType: string): string {
    const def = eventSchemaRegistry.getEventDefinition(eventType);
    return def?.currentVersion || '1.0.0';
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建带校验的事件发射器
 * @param serviceId 当前服务标识
 * @param transport 底层传输函数
 */
export function createValidatedEmitter(
  serviceId: string,
  transport: (envelope: EventEnvelope) => Promise<void>,
  options?: Partial<Pick<ValidatedEmitterConfig, 'throwOnValidationFailure' | 'validationEnabled' | 'onValidationFailure'>>
): ValidatedEventEmitter {
  return new ValidatedEventEmitter({
    serviceId,
    instanceId: `${serviceId}-${process.pid}-${Date.now().toString(36)}`,
    throwOnValidationFailure: options?.throwOnValidationFailure ?? false,
    validationEnabled: options?.validationEnabled ?? true,
    onValidationFailure: options?.onValidationFailure,
    transport,
  });
}
