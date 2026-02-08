/**
 * Kafka 事件总线服务
 * 基于真实 Kafka 实现的企业级事件总线
 */

import { kafkaClient, KAFKA_TOPICS, KafkaMessage, MessageHandler } from './kafkaClient';
import { getDb } from '../db';
import { eventLogs } from '../../drizzle/schema';
const eventLog = eventLogs;
const db = getDb;
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import type { EventHandler, EventPayload } from "../_core/types/domain";

// 事件类型定义
export interface EventPayload {
  eventId: string;
  eventType: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  timestamp: number;
  data: Record<string, any>;
  metadata?: {
    deviceId?: string;
    sensorId?: string;
    userId?: string;
    correlationId?: string;
    [key: string]: any;
  };
}

// 事件处理器类型
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
      console.log('[KafkaEventBus] 事件总线初始化完成');
    } catch (error) {
      console.error('[KafkaEventBus] 初始化失败:', error);
      // 如果 Kafka 不可用，使用降级模式
      console.log('[KafkaEventBus] 将使用内存模式作为降级方案');
      this.isInitialized = true;
    }
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
        console.warn(`[KafkaEventBus] 创建主题 ${topic} 失败:`, error);
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
      eventId,
      timestamp,
    };

    // 尝试发送到 Kafka
    if (kafkaClient.getConnectionStatus()) {
      try {
        const message: KafkaMessage = {
          key: fullEvent.metadata?.deviceId || eventId,
          value: JSON.stringify(fullEvent),
          headers: {
            eventType: event.eventType,
            severity: event.severity,
            source: event.source,
          },
          timestamp: timestamp.toString(),
        };

        await kafkaClient.produce(topic, [message]);
      } catch (error) {
        console.error('[KafkaEventBus] Kafka 发送失败，保存到数据库:', error);
      }
    }

    // 同时保存到数据库（用于持久化和查询）
    try {
      const database = await db();
      if (!database) throw new Error("Database not connected");
      await database.insert(eventLog).values({
        eventId,
        topic,
        eventType: event.eventType,
        severity: event.severity,
        source: event.source,
        payload: fullEvent.data,
        deviceId: fullEvent.metadata?.deviceId || null,
        sensorId: fullEvent.metadata?.sensorId || null,
        processed: false,
        createdAt: new Date(timestamp),
      });
    } catch (error) {
      console.error('[KafkaEventBus] 数据库保存失败:', error);
    }

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
        eventId,
        timestamp,
      };

      // 准备 Kafka 消息
      if (!topicMessages.has(topic)) {
        topicMessages.set(topic, []);
      }
      topicMessages.get(topic)!.push({
        key: fullEvent.metadata?.deviceId || eventId,
        value: JSON.stringify(fullEvent),
        headers: {
          eventType: event.eventType,
          severity: event.severity,
          source: event.source,
        },
        timestamp: timestamp.toString(),
      });

      // 准备数据库记录
      dbRecords.push({
        eventId,
        topic,
        eventType: event.eventType,
        severity: event.severity,
        source: event.source,
        payload: fullEvent.data,
        deviceId: fullEvent.metadata?.deviceId || null,
        sensorId: fullEvent.metadata?.sensorId || null,
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
        console.error('[KafkaEventBus] Kafka 批量发送失败:', error);
      }
    }

    // 批量保存到数据库
    try {
      const database = await db();
      if (!database) throw new Error("Database not connected");
      if (dbRecords.length > 0) {
        // 分批插入，每批100条
        for (let i = 0; i < dbRecords.length; i += 100) {
          const batch = dbRecords.slice(i, i + 100);
          await database.insert(eventLog).values(batch);
        }
      }
    } catch (error) {
      console.error('[KafkaEventBus] 数据库批量保存失败:', error);
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
          async (message) => {
            if (message.value) {
              try {
                const event = JSON.parse(message.value) as EventPayload;
                await handler(event);

                // 标记为已处理
                const database = await db();
      if (!database) throw new Error("Database not connected");
                await database.update(eventLog)
                  .set({ processed: true, processedAt: new Date() })
                  .where(eq(eventLog.eventId, event.eventId));
              } catch (error) {
                console.error('[KafkaEventBus] 处理消息失败:', error);
              }
            }
          }
        );
        subscription.consumerId = consumerId;
      } catch (error) {
        console.error('[KafkaEventBus] 创建 Kafka 消费者失败:', error);
      }
    }

    this.subscriptions.set(subscriptionId, subscription);
    console.log(`[KafkaEventBus] 订阅 ${topic} 成功，ID: ${subscriptionId}`);

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
    console.log(`[KafkaEventBus] 取消订阅 ${subscriptionId}`);
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
          console.error(`[KafkaEventBus] 处理器 ${subscription.id} 执行失败:`, error);
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
      conditions.push(eq(eventLog.deviceId, options.deviceId));
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

  /**
   * 关闭事件总线
   */
  async shutdown(): Promise<void> {
    // 取消所有订阅
    for (const subscriptionId of Array.from(this.subscriptions.keys())) {
      await this.unsubscribe(subscriptionId);
    }

    // 关闭 Kafka 客户端
    await kafkaClient.shutdown();

    this.isInitialized = false;
    console.log('[KafkaEventBus] 事件总线已关闭');
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
    eventType: anomalyType,
    severity,
    source: 'anomaly_detector',
    data: details,
    metadata: { deviceId, sensorId },
  });
}
