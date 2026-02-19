/**
 * Kafka 事件总线服务
 * 基于真实 Kafka 实现的企业级事件总线
 *
 * P0 修复 v2.0：
 *   - publish() 不再同步写 DB，改为内存缓冲 + 异步批量刷写
 *   - 批量刷写条件：缓冲区 >= 100 条 或 距上次刷写 >= 500ms
 *   - 失败恢复：刷写失败的记录放回缓冲区头部，下次重试
 *   - 优雅关闭：shutdown() 先刷写剩余缓冲，再关闭 Kafka
 *   - 背压保护：缓冲区超过 5000 条时丢弃 severity=info 的事件
 */

import { kafkaClient, KAFKA_TOPICS, KafkaMessage, MessageHandler } from './kafka.client';
import { getDb } from '../db';
import { eventLogs } from '../../../drizzle/schema';

const eventLog = eventLogs;
const db = getDb;
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import type { EventHandler, EventPayload } from "../../core/types/domain";
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('kafkaEventBus');

// ============================================================================
// 异步批量写入缓冲区
// ============================================================================

const DB_BUFFER_FLUSH_SIZE = 100;       // 每批最多 100 条
const DB_BUFFER_FLUSH_INTERVAL_MS = 500; // 最长 500ms 刷写一次
const DB_BUFFER_MAX_SIZE = 5000;         // 背压上限
const DB_BUFFER_RETRY_LIMIT = 3;         // 单批最大重试次数

// EventPayload 和 EventHandler 已从 domain.ts 统一导入
// 订阅信息
interface Subscription {
  id: string;
  topic: string;
  handler: EventHandler;
  consumerId?: string;
}

/**
 * Kafka 事件总线类
 */
class KafkaEventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private isInitialized: boolean = false;
  private eventCounter: number = 0;

  // ---- 异步批量写入相关 ----
  private dbBuffer: any[] = [];                          // 待写入缓冲区
  private dbFlushTimer?: ReturnType<typeof setInterval>; // 定时刷写
  private dbFlushing = false;                            // 防止并发刷写
  private dbFlushRetryCount = 0;                         // 当前批次重试计数
  private dbBufferDropped = 0;                           // 因背压丢弃的事件数

  /**
   * 初始化事件总线
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化 Kafka 客户端
      await kafkaClient.initialize();

      // 创建默认主题
      await this.createDefaultTopics();

      this.isInitialized = true;
      log.debug('[KafkaEventBus] 事件总线初始化完成');
    } catch (error) {
      log.error('[KafkaEventBus] 初始化失败:', error);
      // 如果 Kafka 不可用，使用降级模式
      log.debug('[KafkaEventBus] 将使用内存模式作为降级方案');
      this.isInitialized = true;
    }

    // 启动定时刷写
    this.dbFlushTimer = setInterval(() => {
      this.flushDbBuffer().catch((err) => {
        log.error('[KafkaEventBus] 定时刷写失败:', err);
      });
    }, DB_BUFFER_FLUSH_INTERVAL_MS);
  }

  /**
   * 创建默认主题
   */
  private async createDefaultTopics(): Promise<void> {
    const topics = Object.values(KAFKA_TOPICS);
    for (const topic of topics) {
      try {
        await kafkaClient.createTopic(topic, 3, 1);
      } catch (error) {
        log.warn(`[KafkaEventBus] 创建主题 ${topic} 失败:`, error);
      }
    }
  }

  /**
   * 发布事件
   */
  async publish(topic: string, event: Omit<EventPayload, 'eventId' | 'timestamp'>): Promise<string> {
    const eventId = `evt_${Date.now()}_${++this.eventCounter}`;
    const timestamp = Date.now();

    const fullEvent: EventPayload = {
      ...event,
      type: event.type || event.eventType || 'unknown',
      eventId,
      timestamp,
    };

    // 尝试发送到 Kafka
    if (kafkaClient.getConnectionStatus()) {
      try {
        const message: KafkaMessage = {
          key: String(fullEvent.metadata?.deviceId || eventId),
          value: JSON.stringify(fullEvent),
          headers: {
            eventType: event.eventType || '',
            severity: event.severity || '',
            source: event.source || '',
          },
          timestamp: timestamp.toString(),
        };
        await kafkaClient.produce(topic, [message]);
      } catch (error) {
        log.error('[KafkaEventBus] Kafka 发送失败，保存到数据库:', error);;
      }
    }

    // 异步缓冲写入数据库（不阻塞 publish 调用方）
    this.enqueueDbRecord({
      eventId,
      topic,
      eventType: event.eventType || '',
      severity: (event.severity || 'info') as 'info' | 'warning' | 'error' | 'critical',
      source: event.source || null,
      payload: fullEvent.data as Record<string, unknown>,
      nodeId: (fullEvent.metadata?.deviceId as string) || null,
      sensorId: (fullEvent.metadata?.sensorId as string) || null,
      processed: false,
      createdAt: new Date(timestamp),
    });

    // 触发本地订阅者（用于实时处理）
    await this.notifyLocalSubscribers(topic, fullEvent);

    return eventId;
  }

  /**
   * 批量发布事件
   */
  async publishBatch(events: { topic: string; event: Omit<EventPayload, 'eventId' | 'timestamp'> }[]): Promise<string[]> {
    const eventIds: string[] = [];
    const timestamp = Date.now();

    // 按主题分组
    const topicMessages: Map<string, KafkaMessage[]> = new Map();
    const dbRecords: any[] = [];

    for (const { topic, event } of events) {
      const eventId = `evt_${timestamp}_${++this.eventCounter}`;
      eventIds.push(eventId);

      const fullEvent: EventPayload = {
        ...event,
        type: event.type || event.eventType || 'unknown',
        eventId,
        timestamp,
      };

      // 准备 Kafka 消息
      if (!topicMessages.has(topic)) {
        topicMessages.set(topic, []);
      }
      topicMessages.get(topic)!.push({
        key: String(fullEvent.metadata?.deviceId || eventId),
        value: JSON.stringify(fullEvent),
        headers: {
          eventType: event.eventType || '',
          severity: event.severity || '',
          source: event.source || '',
        },
        timestamp: timestamp.toString(),
      });

      // 准备数据库记录
      dbRecords.push({
        eventId,
        topic,
        eventType: event.eventType || '',
        severity: (event.severity || 'info') as 'info' | 'warning' | 'error' | 'critical',
        source: event.source || null,
        payload: fullEvent.data as Record<string, unknown>,
        nodeId: (fullEvent.metadata?.deviceId as string) || null,
        sensorId: (fullEvent.metadata?.sensorId as string) || null,
        processed: false,
        createdAt: new Date(timestamp),
      });

      // 触发本地订阅者
      await this.notifyLocalSubscribers(topic, fullEvent);
    }

    // 批量发送到 Kafka
    if (kafkaClient.getConnectionStatus()) {
      try {
        const batchMessages = Array.from(topicMessages.entries()).map(([topic, messages]) => ({
          topic,
          messages,
        }));
        await kafkaClient.produceBatch(batchMessages);
      } catch (error) {
        log.error('[KafkaEventBus] Kafka 批量发送失败:', error);
      }
    }

    // 异步缓冲批量写入数据库
    for (const record of dbRecords) {
      this.enqueueDbRecord(record);
    }

    return eventIds;
  }

  /**
   * 订阅主题
   */
  async subscribe(
    topic: string,
    handler: EventHandler,
    groupId?: string
  ): Promise<string> {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler,
    };

    // 如果 Kafka 可用，创建 Kafka 消费者
    if (kafkaClient.getConnectionStatus() && groupId) {
      try {
        const consumerId = await kafkaClient.subscribe(
          groupId,
          [topic],
          async (message: { topic: string; partition: number; offset: string; key: string | null; value: string | null; headers: Record<string, string>; timestamp: string; }) => {
            if (message.value) {
              try {
                const event = JSON.parse(message.value) as EventPayload;
                await handler(event);

                // 标记为已处理
                const database = await db();
      if (!database) throw new Error("Database not connected");
                await database.update(eventLog)
                  .set({ processed: true, processedAt: new Date() })
                  .where(eq(eventLog.eventId, event.eventId || ''));
              } catch (error) {
                log.error('[KafkaEventBus] 处理消息失败:', error);
              }
            }
          }
        );
        subscription.consumerId = consumerId;
      } catch (error) {
        log.error('[KafkaEventBus] 创建 Kafka 消费者失败:', error);
      }
    }

    this.subscriptions.set(subscriptionId, subscription);
    log.debug(`[KafkaEventBus] 订阅 ${topic} 成功，ID: ${subscriptionId}`);

    return subscriptionId;
  }

  /**
   * 取消订阅
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    // 如果有 Kafka 消费者，断开连接
    if (subscription.consumerId) {
      await kafkaClient.unsubscribe(subscription.consumerId);
    }

    this.subscriptions.delete(subscriptionId);
    log.debug(`[KafkaEventBus] 取消订阅 ${subscriptionId}`);
  }

  /**
   * 通知本地订阅者
   */
  private async notifyLocalSubscribers(topic: string, event: EventPayload): Promise<void> {
    for (const subscription of Array.from(this.subscriptions.values())) {
      if (this.matchTopic(subscription.topic, topic)) {
        try {
          await subscription.handler(event);
        } catch (error) {
          log.error(`[KafkaEventBus] 处理器 ${subscription.id} 执行失败:`, error);
        }
      }
    }
  }

  /**
   * 主题匹配（支持通配符）
   */
  private matchTopic(pattern: string, topic: string): boolean {
    if (pattern === '*' || pattern === topic) {
      return true;
    }
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return topic.startsWith(prefix + '.');
    }
    if (pattern.endsWith('.>')) {
      const prefix = pattern.slice(0, -2);
      return topic.startsWith(prefix + '.') || topic === prefix;
    }
    return false;
  }

  /**
   * 查询事件历史
   */
  async queryEvents(options: {
    topic?: string;
    eventType?: string;
    severity?: string;
    deviceId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ events: any[]; total: number }> {
    const database = await db();
      if (!database) throw new Error("Database not connected");
    const conditions: any[] = [];

    if (options.topic) {
      conditions.push(eq(eventLog.topic, options.topic));
    }
    if (options.eventType) {
      conditions.push(eq(eventLog.eventType, options.eventType));
    }
    if (options.severity) {
      conditions.push(eq(eventLog.severity, options.severity as 'info' | 'warning' | 'error' | 'critical'));
    }
    if (options.deviceId) {
      conditions.push(eq(eventLog.nodeId, options.deviceId));
    }
    if (options.startTime) {
      conditions.push(gte(eventLog.createdAt, new Date(options.startTime)));
    }
    if (options.endTime) {
      conditions.push(lte(eventLog.createdAt, new Date(options.endTime)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const events = await database.select()
      .from(eventLog)
      .where(whereClause)
      .orderBy(desc(eventLog.createdAt))
      .limit(options.limit || 100)
      .offset(options.offset || 0);

    const countResult = await database.select({ count: sql<number>`count(*)` })
      .from(eventLog)
      .where(whereClause);

    return {
      events,
      total: Number(countResult[0]?.count || 0),
    };
  }

  /**
   * 获取事件统计
   */
  async getEventStats(timeRange?: { start: number; end: number }): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byTopic: Record<string, number>;
    byHour: { hour: string; count: number }[];
  }> {
    const database = await db();
      if (!database) throw new Error("Database not connected");
    const conditions: any[] = [];

    if (timeRange) {
      conditions.push(gte(eventLog.createdAt, new Date(timeRange.start)));
      conditions.push(lte(eventLog.createdAt, new Date(timeRange.end)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 总数
    const totalResult = await database.select({ count: sql<number>`count(*)` })
      .from(eventLog)
      .where(whereClause);

    // 按严重程度统计
    const severityStats = await database.select({
      severity: sql<string>`severity`,
      count: sql<number>`count(*)`,
    })
      .from(eventLog)
      .where(whereClause)
      .groupBy(sql`severity`);

    // 按主题统计
    const topicStats = await database.select({
      topic: sql<string>`topic`,
      count: sql<number>`count(*)`,
    })
      .from(eventLog)
      .where(whereClause)
      .groupBy(sql`topic`);

    // 按小时统计（最近24小时）
    const hourlyStats = await database.select({
      hour: sql<string>`DATE_FORMAT(created_at, '%Y-%m-%d %H:00')`,
      count: sql<number>`count(*)`,
    })
      .from(eventLog)
      .where(whereClause)
      .groupBy(sql`DATE_FORMAT(created_at, '%Y-%m-%d %H:00')`)
      .orderBy(sql`DATE_FORMAT(created_at, '%Y-%m-%d %H:00')`);

    return {
      total: Number(totalResult[0]?.count || 0),
      bySeverity: Object.fromEntries(severityStats.map((s: any) => [s.severity, Number(s.count)])),
      byTopic: Object.fromEntries(topicStats.map((s: any) => [s.topic, Number(s.count)])),
      byHour: hourlyStats.map((s: any) => ({ hour: s.hour, count: Number(s.count) })),
    };
  }

  /**
   * 获取 Kafka 状态
   */
  async getKafkaStatus(): Promise<{
    connected: boolean;
    brokers: number;
    topics: string[];
    subscriptions: number;
  }> {
    const health = await kafkaClient.healthCheck();
    const topics = kafkaClient.getConnectionStatus() ? await kafkaClient.listTopics() : [];

    return {
      connected: health.connected,
      brokers: health.brokers,
      topics,
      subscriptions: this.subscriptions.size,
    };
  }

  // ==========================================================================
  // 异步批量 DB 写入
  // ==========================================================================

  /**
   * 将 DB 记录放入缓冲区（非阻塞）
   * 背压保护：缓冲区超过上限时丢弃 severity=info 的事件
   */
  private enqueueDbRecord(record: any): void {
    if (this.dbBuffer.length >= DB_BUFFER_MAX_SIZE) {
      if (record.severity === 'info') {
        this.dbBufferDropped++;
        if (this.dbBufferDropped % 100 === 1) {
          log.warn({ dropped: this.dbBufferDropped, bufferSize: this.dbBuffer.length },
            '[KafkaEventBus] DB 缓冲区背压，丢弃 info 级别事件');
        }
        return;
      }
      // warning/error/critical 仍然入队
    }
    this.dbBuffer.push(record);

    // 如果缓冲区达到批量大小，立即触发刷写
    if (this.dbBuffer.length >= DB_BUFFER_FLUSH_SIZE) {
      this.flushDbBuffer().catch((err) => {
        log.error('[KafkaEventBus] 批量刷写触发失败:', err);
      });
    }
  }

  /**
   * 刷写缓冲区到数据库
   * 防止并发刷写（通过 dbFlushing 标志）
   */
  private async flushDbBuffer(): Promise<void> {
    if (this.dbFlushing || this.dbBuffer.length === 0) return;
    this.dbFlushing = true;

    // 取出当前批次（最多 DB_BUFFER_FLUSH_SIZE 条）
    const batch = this.dbBuffer.splice(0, DB_BUFFER_FLUSH_SIZE);

    try {
      const database = await db();
      if (!database) {
        // DB 不可用，放回缓冲区
        this.dbBuffer.unshift(...batch);
        return;
      }

      await database.insert(eventLog).values(batch);
      this.dbFlushRetryCount = 0;

      if (batch.length >= DB_BUFFER_FLUSH_SIZE) {
        log.debug({ flushed: batch.length, remaining: this.dbBuffer.length },
          '[KafkaEventBus] DB 批量刷写完成');
      }
    } catch (error) {
      this.dbFlushRetryCount++;
      if (this.dbFlushRetryCount <= DB_BUFFER_RETRY_LIMIT) {
        // 放回缓冲区头部，下次重试
        this.dbBuffer.unshift(...batch);
        log.warn({ retryCount: this.dbFlushRetryCount, batchSize: batch.length },
          '[KafkaEventBus] DB 刷写失败，放回缓冲区重试');
      } else {
        // 超过重试次数，丢弃该批次
        log.error({ droppedBatch: batch.length, error },
          '[KafkaEventBus] DB 刷写重试超限，丢弃批次');
        this.dbFlushRetryCount = 0;
      }
    } finally {
      this.dbFlushing = false;
    }
  }

  /**
   * 获取缓冲区状态（用于监控）
   */
  getBufferStatus(): { size: number; dropped: number; flushing: boolean } {
    return {
      size: this.dbBuffer.length,
      dropped: this.dbBufferDropped,
      flushing: this.dbFlushing,
    };
  }

  /**
   * 关闭事件总线（优雅关闭：先刷写缓冲区）
   */
  async shutdown(): Promise<void> {
    // 停止定时刷写
    if (this.dbFlushTimer) {
      clearInterval(this.dbFlushTimer);
      this.dbFlushTimer = undefined;
    }

    // 刷写剩余缓冲区（最多尝试 3 次）
    for (let i = 0; i < 3 && this.dbBuffer.length > 0; i++) {
      this.dbFlushing = false; // 重置标志
      try {
        const database = await db();
        if (!database) break;
        while (this.dbBuffer.length > 0) {
          const batch = this.dbBuffer.splice(0, DB_BUFFER_FLUSH_SIZE);
          await database.insert(eventLog).values(batch);
        }
        break;
      } catch (error) {
        log.error({ attempt: i + 1, remaining: this.dbBuffer.length },
          '[KafkaEventBus] 关闭时刷写缓冲区失败');
      }
    }

    if (this.dbBuffer.length > 0) {
      log.error({ lost: this.dbBuffer.length },
        '[KafkaEventBus] 关闭时仍有未刷写的事件记录');
    }

    // 取消所有订阅
    for (const subscriptionId of Array.from(this.subscriptions.keys())) {
      await this.unsubscribe(subscriptionId);
    }

    // 关闭 Kafka 客户端
    await kafkaClient.shutdown();

    this.isInitialized = false;
    log.debug('[KafkaEventBus] 事件总线已关闭');
  }
}

// 导出单例
export const kafkaEventBus = new KafkaEventBus();

// 便捷发布函数
export async function publishEvent(
  topic: string,
  eventType: string,
  data: Record<string, any>,
  options?: {
    severity?: 'info' | 'warning' | 'error' | 'critical';
    source?: string;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  return kafkaEventBus.publish(topic, {
    type: eventType,
    eventType,
    severity: options?.severity || 'info',
    source: options?.source || 'system',
    data,
    metadata: options?.metadata,
  });
}

// 便捷发布传感器数据
export async function publishSensorReading(
  deviceId: string,
  sensorId: string,
  value: number,
  unit: string,
  metadata?: Record<string, any>
): Promise<string> {
  return kafkaEventBus.publish(KAFKA_TOPICS.SENSOR_READINGS, {
    type: 'sensor_reading',
    eventType: 'sensor_reading',
    severity: 'info',
    source: 'sensor',
    data: { value, unit },
    metadata: { deviceId, sensorId, ...metadata },
  });
}

// 便捷发布异常告警
export async function publishAnomalyAlert(
  deviceId: string,
  sensorId: string,
  anomalyType: string,
  details: Record<string, any>,
  severity: 'warning' | 'error' | 'critical' = 'warning'
): Promise<string> {
  return kafkaEventBus.publish(KAFKA_TOPICS.ANOMALY_ALERTS, {
    type: anomalyType,
    eventType: anomalyType,
    severity,
    source: 'anomaly_detector',
    data: details,
    metadata: { deviceId, sensorId },
  });
}
