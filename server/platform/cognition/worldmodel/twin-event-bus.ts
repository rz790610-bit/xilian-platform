/**
 * ============================================================================
 * TwinEventBus — 数字孪生事件总线
 * ============================================================================
 *
 * 职责：
 *   1. 解耦世界模型各子模块之间的通信
 *   2. 通过 Redis Pub/Sub 实现跨节点事件分发
 *   3. 事件持久化到 twin_events 表（审计 + 回放）
 *   4. 支持类型安全的事件订阅/发布
 *
 * 事件通道：
 *   twin:events:{eventType}  — Redis Pub/Sub channel
 *
 * 架构位置：L7 世界模型层 → 事件基础设施
 * Phase 3 v1.3 | ADR-007 Outbox Pattern 配套
 */

import { EventEmitter } from 'events';

// ============================================================================
// 事件类型定义
// ============================================================================

/** 事件类型枚举 */
export enum TwinEventType {
  // --- 遥测同步 ---
  TELEMETRY_UPDATED = 'telemetry.updated',
  SYNC_MODE_CHANGED = 'sync.mode_changed',
  SYNC_DEGRADED = 'sync.degraded',
  SYNC_RECOVERED = 'sync.recovered',

  // --- 实例生命周期 ---
  INSTANCE_CREATED = 'instance.created',
  INSTANCE_DESTROYED = 'instance.destroyed',
  INSTANCE_MIGRATING = 'instance.migrating',
  INSTANCE_MIGRATED = 'instance.migrated',
  INSTANCE_CONFIG_UPDATED = 'instance.config_updated',

  // --- 预测与异常 ---
  PREDICTION_COMPLETED = 'prediction.completed',
  ANOMALY_ANTICIPATED = 'anomaly.anticipated',
  RUL_UPDATED = 'rul.updated',

  // --- 仿真 ---
  SIMULATION_STARTED = 'simulation.started',
  SIMULATION_PROGRESS = 'simulation.progress',
  SIMULATION_COMPLETED = 'simulation.completed',
  SIMULATION_FAILED = 'simulation.failed',

  // --- 物理校验 ---
  PHYSICS_VIOLATION = 'physics.violation',

  // --- 快照 ---
  SNAPSHOT_PERSISTED = 'snapshot.persisted',
}

/** 事件载荷基础接口 */
export interface TwinEventBase {
  /** 事件唯一 ID（UUID v4） */
  eventId: string;
  /** 设备 ID（EQ-xxx 格式） */
  machineId: string;
  /** 事件类型 */
  eventType: TwinEventType;
  /** 事件时间戳 (ms) */
  timestamp: number;
  /** 发布节点 ID */
  sourceNode: string;
  /** 事件版本（用于 schema 演进） */
  version: number;
}

/** 遥测更新事件 */
export interface TelemetryUpdatedEvent extends TwinEventBase {
  eventType: TwinEventType.TELEMETRY_UPDATED;
  payload: {
    stateVector: Record<string, number>;
    syncMode: 'cdc' | 'polling';
    latencyMs: number;
  };
}

/** 同步模式变更事件 */
export interface SyncModeChangedEvent extends TwinEventBase {
  eventType: TwinEventType.SYNC_MODE_CHANGED;
  payload: {
    previousMode: 'cdc' | 'polling';
    currentMode: 'cdc' | 'polling';
    reason: string;
  };
}

/** 同步降级事件 */
export interface SyncDegradedEvent extends TwinEventBase {
  eventType: TwinEventType.SYNC_DEGRADED;
  payload: {
    reason: string;
    lastCdcEventAt: number;
    gapMs: number;
  };
}

/** 同步恢复事件 */
export interface SyncRecoveredEvent extends TwinEventBase {
  eventType: TwinEventType.SYNC_RECOVERED;
  payload: {
    downtimeMs: number;
    recoveredAt: number;
  };
}

/** 实例创建事件 */
export interface InstanceCreatedEvent extends TwinEventBase {
  eventType: TwinEventType.INSTANCE_CREATED;
  payload: {
    equipmentType: string;
    physicsModel: string;
    stateVariables: string[];
  };
}

/** 实例销毁事件 */
export interface InstanceDestroyedEvent extends TwinEventBase {
  eventType: TwinEventType.INSTANCE_DESTROYED;
  payload: {
    reason: 'lru_eviction' | 'manual' | 'migration' | 'shutdown';
    uptimeMs: number;
  };
}

/** 实例迁移中事件 */
export interface InstanceMigratingEvent extends TwinEventBase {
  eventType: TwinEventType.INSTANCE_MIGRATING;
  payload: {
    targetNode: string;
    stateVectorSize: number;
  };
}

/** 实例迁移完成事件 */
export interface InstanceMigratedEvent extends TwinEventBase {
  eventType: TwinEventType.INSTANCE_MIGRATED;
  payload: {
    sourceNode: string;
    targetNode: string;
    durationMs: number;
    stateVectorSize: number;
  };
}

/** 实例配置更新事件 */
export interface InstanceConfigUpdatedEvent extends TwinEventBase {
  eventType: TwinEventType.INSTANCE_CONFIG_UPDATED;
  payload: {
    changedFields: string[];
    previousValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
  };
}

/** 预测完成事件 */
export interface PredictionCompletedEvent extends TwinEventBase {
  eventType: TwinEventType.PREDICTION_COMPLETED;
  payload: {
    horizonSteps: number;
    method: 'physics' | 'statistical' | 'hybrid';
    durationMs: number;
    finalConfidence: number;
  };
}

/** 异常预判事件 */
export interface AnomalyAnticipatedEvent extends TwinEventBase {
  eventType: TwinEventType.ANOMALY_ANTICIPATED;
  payload: {
    anomalyType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    estimatedStepToAnomaly: number;
    triggerDimensions: string[];
    suggestedActions: string[];
  };
}

/** RUL 更新事件 */
export interface RulUpdatedEvent extends TwinEventBase {
  eventType: TwinEventType.RUL_UPDATED;
  payload: {
    rulDays: number;
    confidence: number;
    method: string;
    previousRulDays: number | null;
  };
}

/** 仿真启动事件 */
export interface SimulationStartedEvent extends TwinEventBase {
  eventType: TwinEventType.SIMULATION_STARTED;
  payload: {
    scenarioId: number;
    scenarioName: string;
    monteCarloRuns: number;
  };
}

/** 仿真进度事件 */
export interface SimulationProgressEvent extends TwinEventBase {
  eventType: TwinEventType.SIMULATION_PROGRESS;
  payload: {
    scenarioId: number;
    completedRuns: number;
    totalRuns: number;
    progressPercent: number;
    elapsedMs: number;
  };
}

/** 仿真完成事件 */
export interface SimulationCompletedEvent extends TwinEventBase {
  eventType: TwinEventType.SIMULATION_COMPLETED;
  payload: {
    scenarioId: number;
    resultId: number;
    durationMs: number;
    monteCarloRuns: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
}

/** 仿真失败事件 */
export interface SimulationFailedEvent extends TwinEventBase {
  eventType: TwinEventType.SIMULATION_FAILED;
  payload: {
    scenarioId: number;
    error: string;
    attemptCount: number;
  };
}

/** 物理违规事件 */
export interface PhysicsViolationEvent extends TwinEventBase {
  eventType: TwinEventType.PHYSICS_VIOLATION;
  payload: {
    violationType: 'energy_conservation' | 'parameter_bound' | 'monotonicity' | 'causal_consistency';
    description: string;
    severity: 'warning' | 'error';
    affectedVariables: string[];
  };
}

/** 快照持久化事件 */
export interface SnapshotPersistedEvent extends TwinEventBase {
  eventType: TwinEventType.SNAPSHOT_PERSISTED;
  payload: {
    snapshotCount: number;
    durationMs: number;
    totalSizeBytes: number;
  };
}

/** 所有事件的联合类型 */
export type TwinEvent =
  | TelemetryUpdatedEvent
  | SyncModeChangedEvent
  | SyncDegradedEvent
  | SyncRecoveredEvent
  | InstanceCreatedEvent
  | InstanceDestroyedEvent
  | InstanceMigratingEvent
  | InstanceMigratedEvent
  | InstanceConfigUpdatedEvent
  | PredictionCompletedEvent
  | AnomalyAnticipatedEvent
  | RulUpdatedEvent
  | SimulationStartedEvent
  | SimulationProgressEvent
  | SimulationCompletedEvent
  | SimulationFailedEvent
  | PhysicsViolationEvent
  | SnapshotPersistedEvent;

/** 事件类型到事件载荷的映射（用于类型推断） */
export type TwinEventMap = {
  [TwinEventType.TELEMETRY_UPDATED]: TelemetryUpdatedEvent;
  [TwinEventType.SYNC_MODE_CHANGED]: SyncModeChangedEvent;
  [TwinEventType.SYNC_DEGRADED]: SyncDegradedEvent;
  [TwinEventType.SYNC_RECOVERED]: SyncRecoveredEvent;
  [TwinEventType.INSTANCE_CREATED]: InstanceCreatedEvent;
  [TwinEventType.INSTANCE_DESTROYED]: InstanceDestroyedEvent;
  [TwinEventType.INSTANCE_MIGRATING]: InstanceMigratingEvent;
  [TwinEventType.INSTANCE_MIGRATED]: InstanceMigratedEvent;
  [TwinEventType.INSTANCE_CONFIG_UPDATED]: InstanceConfigUpdatedEvent;
  [TwinEventType.PREDICTION_COMPLETED]: PredictionCompletedEvent;
  [TwinEventType.ANOMALY_ANTICIPATED]: AnomalyAnticipatedEvent;
  [TwinEventType.RUL_UPDATED]: RulUpdatedEvent;
  [TwinEventType.SIMULATION_STARTED]: SimulationStartedEvent;
  [TwinEventType.SIMULATION_PROGRESS]: SimulationProgressEvent;
  [TwinEventType.SIMULATION_COMPLETED]: SimulationCompletedEvent;
  [TwinEventType.SIMULATION_FAILED]: SimulationFailedEvent;
  [TwinEventType.PHYSICS_VIOLATION]: PhysicsViolationEvent;
  [TwinEventType.SNAPSHOT_PERSISTED]: SnapshotPersistedEvent;
};

/** 事件处理器类型 */
export type TwinEventHandler<T extends TwinEventType> = (event: TwinEventMap[T]) => void | Promise<void>;

// ============================================================================
// TwinEventBus 实现
// ============================================================================

/** 节点 ID 生成（进程级唯一） */
const NODE_ID = `node-${process.pid}-${Date.now().toString(36)}`;

/** Redis Pub/Sub 通道前缀 */
const CHANNEL_PREFIX = 'twin:events:';

/**
 * TwinEventBus — 事件总线
 *
 * 双层架构：
 *   1. 本地 EventEmitter — 进程内同步/异步订阅
 *   2. Redis Pub/Sub — 跨节点广播（可选，需注入 Redis 客户端）
 *
 * 持久化：
 *   事件发布时异步写入 twin_events 表（fire-and-forget，不阻塞主流程）
 */
export class TwinEventBus {
  private localEmitter = new EventEmitter();
  private redisPublisher: RedisLike | null = null;
  private redisSubscriber: RedisLike | null = null;
  private persistFn: ((event: TwinEvent) => Promise<void>) | null = null;
  private subscribedChannels = new Set<string>();
  private stats = {
    published: 0,
    received: 0,
    persisted: 0,
    persistErrors: 0,
  };

  constructor() {
    // 提高默认监听器上限（每个事件类型可能有多个订阅者）
    this.localEmitter.setMaxListeners(50);
  }

  // --------------------------------------------------------------------------
  // 初始化
  // --------------------------------------------------------------------------

  /**
   * 注入 Redis 客户端（可选）
   * 如果不注入，事件总线仅在进程内工作（单节点模式）
   */
  setRedis(publisher: RedisLike, subscriber: RedisLike): void {
    this.redisPublisher = publisher;
    this.redisSubscriber = subscriber;
  }

  /**
   * 注入持久化函数（将事件写入 twin_events 表）
   */
  setPersistFn(fn: (event: TwinEvent) => Promise<void>): void {
    this.persistFn = fn;
  }

  // --------------------------------------------------------------------------
  // 发布
  // --------------------------------------------------------------------------

  /**
   * 发布事件
   *
   * 流程：
   *   1. 本地 EventEmitter 同步分发
   *   2. Redis Pub/Sub 跨节点广播（如果已注入）
   *   3. 异步持久化到 DB（fire-and-forget）
   */
  async publish<T extends TwinEventType>(event: TwinEventMap[T]): Promise<void> {
    this.stats.published++;

    // 1. 本地分发
    this.localEmitter.emit(event.eventType, event);
    this.localEmitter.emit('*', event); // 通配符订阅

    // 2. Redis 广播
    if (this.redisPublisher) {
      try {
        const channel = `${CHANNEL_PREFIX}${event.eventType}`;
        await this.redisPublisher.publish(channel, JSON.stringify(event));
      } catch (err) {
        console.error(`[TwinEventBus] Redis publish failed for ${event.eventType}:`, err);
      }
    }

    // 3. 异步持久化
    if (this.persistFn) {
      this.persistFn(event).then(() => {
        this.stats.persisted++;
      }).catch((err) => {
        this.stats.persistErrors++;
        console.error(`[TwinEventBus] Persist failed for ${event.eventType}:`, err);
      });
    }
  }

  // --------------------------------------------------------------------------
  // 订阅
  // --------------------------------------------------------------------------

  /**
   * 订阅特定类型的事件
   */
  on<T extends TwinEventType>(eventType: T, handler: TwinEventHandler<T>): () => void {
    this.localEmitter.on(eventType, handler as (...args: unknown[]) => void);

    // 如果有 Redis，同时订阅 Redis 通道
    if (this.redisSubscriber) {
      const channel = `${CHANNEL_PREFIX}${eventType}`;
      if (!this.subscribedChannels.has(channel)) {
        this.subscribedChannels.add(channel);
        this.redisSubscriber.subscribe(channel, (message: string) => {
          try {
            const event = JSON.parse(message) as TwinEventMap[T];
            // 避免重复处理本节点发布的事件
            if (event.sourceNode !== NODE_ID) {
              this.stats.received++;
              this.localEmitter.emit(eventType, event);
            }
          } catch (err) {
            console.error(`[TwinEventBus] Redis message parse error on ${channel}:`, err);
          }
        });
      }
    }

    // 返回取消订阅函数
    return () => {
      this.localEmitter.off(eventType, handler as (...args: unknown[]) => void);
    };
  }

  /**
   * 订阅所有事件（通配符）
   */
  onAll(handler: (event: TwinEvent) => void | Promise<void>): () => void {
    this.localEmitter.on('*', handler as (...args: unknown[]) => void);
    return () => {
      this.localEmitter.off('*', handler as (...args: unknown[]) => void);
    };
  }

  /**
   * 一次性订阅（触发后自动取消）
   */
  once<T extends TwinEventType>(eventType: T, handler: TwinEventHandler<T>): void {
    this.localEmitter.once(eventType, handler as (...args: unknown[]) => void);
  }

  // --------------------------------------------------------------------------
  // 工具方法
  // --------------------------------------------------------------------------

  /**
   * 创建事件（工厂方法）
   */
  static createEvent<T extends TwinEventType>(
    eventType: T,
    machineId: string,
    payload: TwinEventMap[T]['payload'],
  ): TwinEventMap[T] {
    return {
      eventId: generateUUID(),
      machineId,
      eventType,
      timestamp: Date.now(),
      sourceNode: NODE_ID,
      version: 1,
      payload,
    } as TwinEventMap[T];
  }

  /**
   * 获取统计信息
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * 获取当前节点 ID
   */
  getNodeId(): string {
    return NODE_ID;
  }

  /**
   * 销毁（清理所有订阅）
   */
  async destroy(): Promise<void> {
    this.localEmitter.removeAllListeners();
    if (this.redisSubscriber) {
      for (const channel of this.subscribedChannels) {
        try {
          await this.redisSubscriber.unsubscribe(channel);
        } catch { /* ignore */ }
      }
      this.subscribedChannels.clear();
    }
  }
}

// ============================================================================
// Redis 接口抽象（避免强依赖 ioredis）
// ============================================================================

/** 最小 Redis 客户端接口 */
export interface RedisLike {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}

// ============================================================================
// UUID 生成（轻量级，不依赖外部库）
// ============================================================================

function generateUUID(): string {
  // crypto.randomUUID() 在 Node 19+ 可用，降级到手动生成
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// 单例导出
// ============================================================================

/** 全局事件总线单例 */
export const twinEventBus = new TwinEventBus();
