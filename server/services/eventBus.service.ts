/**
 * 事件总线模块 - 模拟 Kafka 事件流
 * 支持内存事件总线和可选的 Redis Pub/Sub
 */

import { EventEmitter } from 'events';
import { getDb } from '../lib/db';
import { eventLogs } from '../../drizzle/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

// ============ 类型定义 ============

export interface Event {
  eventId: string;
  topic: string;
  eventType: string;
  source?: string;
  deviceId?: string;
  sensorId?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface TopicSubscription {
  topic: string;
  handler: EventHandler;
  filter?: (event: Event) => boolean;
}

// ============ 预定义主题 ============

export const TOPICS = {
  // 设备相关
  DEVICE_STATUS: 'device.status',
  DEVICE_HEARTBEAT: 'device.heartbeat',
  DEVICE_ERROR: 'device.error',
  
  // 传感器相关
  SENSOR_READING: 'sensor.reading',
  SENSOR_BATCH: 'sensor.batch',
  SENSOR_ERROR: 'sensor.error',
  
  // 异常检测
  ANOMALY_DETECTED: 'anomaly.detected',
  ANOMALY_RESOLVED: 'anomaly.resolved',
  
  // 诊断相关
  DIAGNOSIS_STARTED: 'diagnosis.started',
  DIAGNOSIS_COMPLETED: 'diagnosis.completed',
  DIAGNOSIS_FAILED: 'diagnosis.failed',
  
  // 系统相关
  SYSTEM_ALERT: 'system.alert',
  SYSTEM_METRIC: 'system.metric',
  
  // 工作流相关
  WORKFLOW_TRIGGERED: 'workflow.triggered',
  WORKFLOW_COMPLETED: 'workflow.completed',

  // v1.9 性能优化相关
  OUTBOX_EVENT_PUBLISHED: 'outbox.event.published',
  OUTBOX_EVENT_FAILED: 'outbox.event.failed',
  OUTBOX_CDC_FALLBACK: 'outbox.cdc.fallback',
  SAGA_STARTED: 'saga.started',
  SAGA_COMPLETED: 'saga.completed',
  SAGA_FAILED: 'saga.failed',
  SAGA_COMPENSATED: 'saga.compensated',
  SAGA_DEAD_LETTER: 'saga.dead_letter',
  SAMPLING_ADJUSTED: 'sampling.adjusted',
  SAMPLING_ALERT: 'sampling.alert',
  DEDUP_DUPLICATE_DETECTED: 'dedup.duplicate_detected',
  REPLICA_FAILOVER: 'replica.failover',
  REPLICA_LAG_WARNING: 'replica.lag_warning',
  GRAPH_QUERY_SLOW: 'graph.query.slow',
  GRAPH_INDEX_REBUILT: 'graph.index.rebuilt',
} as const;

// ============ 事件总线类 ============

class EventBus {
  private emitter: EventEmitter;
  private subscriptions: Map<string, Set<TopicSubscription>>;
  private eventBuffer: Event[] = [];
  private bufferSize: number = 1000;
  private persistEnabled: boolean = true;
  private metrics: {
    totalEvents: number;
    eventsByTopic: Map<string, number>;
    eventsBySeverity: Map<string, number>;
    lastEventTime: Date | null;
  };

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.subscriptions = new Map();
    this.metrics = {
      totalEvents: 0,
      eventsByTopic: new Map(),
      eventsBySeverity: new Map(),
      lastEventTime: null,
    };
  }

  /**
   * 生成唯一事件ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 发布事件
   */
  async publish(
    topic: string,
    eventType: string,
    payload: Record<string, unknown>,
    options: {
      source?: string;
      deviceId?: string;
      sensorId?: string;
      severity?: 'info' | 'warning' | 'error' | 'critical';
    } = {}
  ): Promise<Event> {
    const event: Event = {
      eventId: this.generateEventId(),
      topic,
      eventType,
      source: options.source || 'system',
      deviceId: options.deviceId,
      sensorId: options.sensorId,
      severity: options.severity || 'info',
      payload,
      timestamp: new Date(),
    };

    // 更新指标
    this.metrics.totalEvents++;
    this.metrics.lastEventTime = event.timestamp;
    this.metrics.eventsByTopic.set(
      topic,
      (this.metrics.eventsByTopic.get(topic) || 0) + 1
    );
    this.metrics.eventsBySeverity.set(
      event.severity,
      (this.metrics.eventsBySeverity.get(event.severity) || 0) + 1
    );

    // 添加到缓冲区
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.bufferSize) {
      this.eventBuffer.shift();
    }

    // 持久化到数据库
    if (this.persistEnabled) {
      await this.persistEvent(event);
    }

    // 发送到订阅者
    this.emitter.emit(topic, event);
    this.emitter.emit('*', event); // 通配符订阅

    return event;
  }

  /**
   * 批量发布事件
   */
  async publishBatch(events: Array<{
    topic: string;
    eventType: string;
    payload: Record<string, unknown>;
    options?: {
      source?: string;
      deviceId?: string;
      sensorId?: string;
      severity?: 'info' | 'warning' | 'error' | 'critical';
    };
  }>): Promise<Event[]> {
    const results: Event[] = [];
    for (const e of events) {
      const event = await this.publish(e.topic, e.eventType, e.payload, e.options || {});
      results.push(event);
    }
    return results;
  }

  /**
   * 订阅主题
   */
  subscribe(
    topic: string,
    handler: EventHandler,
    filter?: (event: Event) => boolean
  ): () => void {
    const subscription: TopicSubscription = { topic, handler, filter };
    
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(subscription);

    const wrappedHandler = async (event: Event) => {
      if (!filter || filter(event)) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[EventBus] Handler error for topic ${topic}:`, error);
        }
      }
    };

    this.emitter.on(topic, wrappedHandler);

    // 返回取消订阅函数
    return () => {
      this.subscriptions.get(topic)?.delete(subscription);
      this.emitter.off(topic, wrappedHandler);
    };
  }

  /**
   * 订阅所有事件
   */
  subscribeAll(handler: EventHandler): () => void {
    return this.subscribe('*', handler);
  }

  /**
   * 持久化事件到数据库
   */
  private async persistEvent(event: Event): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(eventLogs).values({
        eventId: event.eventId,
        topic: event.topic,
        eventType: event.eventType,
        source: event.source,
        deviceId: event.deviceId,
        sensorId: event.sensorId,
        severity: event.severity,
        payload: event.payload,
        processed: false,
        createdAt: event.timestamp,
      });
    } catch (error) {
      console.error('[EventBus] Failed to persist event:', error);
    }
  }

  /**
   * 获取最近事件
   */
  getRecentEvents(limit: number = 100): Event[] {
    return this.eventBuffer.slice(-limit);
  }

  /**
   * 按主题获取事件
   */
  getEventsByTopic(topic: string, limit: number = 100): Event[] {
    return this.eventBuffer
      .filter(e => e.topic === topic)
      .slice(-limit);
  }

  /**
   * 获取事件指标
   */
  getMetrics() {
    return {
      totalEvents: this.metrics.totalEvents,
      eventsByTopic: Object.fromEntries(this.metrics.eventsByTopic),
      eventsBySeverity: Object.fromEntries(this.metrics.eventsBySeverity),
      lastEventTime: this.metrics.lastEventTime,
      bufferSize: this.eventBuffer.length,
      subscriptionCount: Array.from(this.subscriptions.values())
        .reduce((sum, set) => sum + set.size, 0),
    };
  }

  /**
   * 从数据库查询历史事件
   */
  async queryEvents(options: {
    topic?: string;
    deviceId?: string;
    sensorId?: string;
    severity?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<Event[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      
      if (options.topic) {
        conditions.push(eq(eventLogs.topic, options.topic));
      }
      if (options.deviceId) {
        conditions.push(eq(eventLogs.deviceId, options.deviceId));
      }
      if (options.sensorId) {
        conditions.push(eq(eventLogs.sensorId, options.sensorId));
      }
      if (options.severity) {
        conditions.push(eq(eventLogs.severity, options.severity as any));
      }
      if (options.startTime) {
        conditions.push(gte(eventLogs.createdAt, options.startTime));
      }
      if (options.endTime) {
        conditions.push(lte(eventLogs.createdAt, options.endTime));
      }

      const query = db
        .select()
        .from(eventLogs)
        .orderBy(desc(eventLogs.createdAt))
        .limit(options.limit || 100);

      if (conditions.length > 0) {
        // @ts-ignore
        query.where(and(...conditions));
      }

      const results = await query;
      
      return results.map(r => ({
        eventId: r.eventId,
        topic: r.topic,
        eventType: r.eventType,
        source: r.source || undefined,
        deviceId: r.deviceId || undefined,
        sensorId: r.sensorId || undefined,
        severity: r.severity,
        payload: (r.payload as Record<string, unknown>) || {},
        timestamp: r.createdAt,
      }));
    } catch (error) {
      console.error('[EventBus] Query events failed:', error);
      return [];
    }
  }

  /**
   * 标记事件已处理
   */
  async markProcessed(eventId: string, processedBy: string): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await db
        .update(eventLogs)
        .set({
          processed: true,
          processedAt: new Date(),
          processedBy,
        })
        .where(eq(eventLogs.eventId, eventId));
    } catch (error) {
      console.error('[EventBus] Mark processed failed:', error);
    }
  }

  /**
   * 清理旧事件
   */
  async cleanupOldEvents(daysToKeep: number = 7): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await db
        .delete(eventLogs)
        .where(lte(eventLogs.createdAt, cutoffDate));
      
      return (result as any).affectedRows || 0;
    } catch (error) {
      console.error('[EventBus] Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      totalEvents: 0,
      eventsByTopic: new Map(),
      eventsBySeverity: new Map(),
      lastEventTime: null,
    };
  }

  /**
   * 启用/禁用持久化
   */
  setPersistEnabled(enabled: boolean): void {
    this.persistEnabled = enabled;
  }
}

// ============ 单例导出 ============

export const eventBus = new EventBus();

// ============ 便捷函数 ============

export const publish = eventBus.publish.bind(eventBus);
export const subscribe = eventBus.subscribe.bind(eventBus);
export const subscribeAll = eventBus.subscribeAll.bind(eventBus);
export const getRecentEvents = eventBus.getRecentEvents.bind(eventBus);
export const getEventMetrics = eventBus.getMetrics.bind(eventBus);
export const queryEvents = eventBus.queryEvents.bind(eventBus);

// ============ tRPC 路由 ============

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import type { EventHandler } from "../core/types/domain";

export const eventBusRouter = router({
  // 获取最近事件
  getRecentEvents: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      topic: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.topic) {
        return eventBus.getEventsByTopic(input.topic, input.limit);
      }
      return eventBus.getRecentEvents(input.limit);
    }),

  // 获取事件指标
  getMetrics: publicProcedure.query(async () => {
    return eventBus.getMetrics();
  }),

  // 获取 Kafka 状态
  getKafkaStatus: publicProcedure.query(async () => {
    // 返回 Kafka 连接状态
    const kafkaBrokers = process.env.KAFKA_BROKERS || 'localhost:9092';
    const isKafkaConfigured = !!process.env.KAFKA_BROKERS;
    return {
      isConfigured: isKafkaConfigured,
      brokers: kafkaBrokers.split(','),
      status: isKafkaConfigured ? 'configured' : 'using_memory_fallback',
      mode: isKafkaConfigured ? 'kafka' : 'memory',
      topics: Object.values(TOPICS),
    };
  }),

  // 查询历史事件
  queryEvents: publicProcedure
    .input(z.object({
      topic: z.string().optional(),
      deviceId: z.string().optional(),
      sensorId: z.string().optional(),
      severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      return eventBus.queryEvents({
        ...input,
        startTime: input.startTime ? new Date(input.startTime) : undefined,
        endTime: input.endTime ? new Date(input.endTime) : undefined,
      });
    }),

  // 获取可用主题列表
  getTopics: publicProcedure.query(async () => {
    return Object.entries(TOPICS).map(([key, value]) => ({
      key,
      topic: value,
    }));
  }),

  // 发布测试事件
  publishTestEvent: protectedProcedure
    .input(z.object({
      topic: z.string(),
      eventType: z.string(),
      payload: z.record(z.string(), z.unknown()),
      severity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
    }))
    .mutation(async ({ input }) => {
      const event = await eventBus.publish(
        input.topic,
        input.eventType,
        input.payload,
        { severity: input.severity, source: 'manual' }
      );
      return event;
    }),

  // 标记事件已处理
  markProcessed: protectedProcedure
    .input(z.object({
      eventId: z.string(),
      processedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      await eventBus.markProcessed(input.eventId, input.processedBy);
      return { success: true };
    }),

  // 清理旧事件
  cleanupOldEvents: protectedProcedure
    .input(z.object({
      daysToKeep: z.number().min(1).max(365).default(7),
    }))
    .mutation(async ({ input }) => {
      const count = await eventBus.cleanupOldEvents(input.daysToKeep);
      return { deletedCount: count };
    }),
});

export type EventBusRouter = typeof eventBusRouter;
