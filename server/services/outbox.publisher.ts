/**
 * CDC + 轮询混合 Outbox 发布器
 * 实现路由感知的事件发布，支持 CDC 和 Polling 两种模式
 */

import { getDb } from '../lib/db';
import { outboxEvents, outboxRoutingConfig } from '../../drizzle/schema';
import { eq, and, lt, inArray, asc } from 'drizzle-orm';
import { kafkaClient, KAFKA_TOPICS } from '../lib/clients/kafka.client';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('outbox');

// ============ 类型定义 ============

export interface RoutingConfig {

  eventType: string;
  publishMode: 'cdc' | 'polling';
  cdcEnabled: boolean;
  pollingIntervalMs: number | null;
  pollingBatchSize: number | null;
  requiresProcessing: boolean;
  processorClass: string | null;
}

export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: {
    correlationId?: string;
    causationId?: string;
    userId?: string;
    source?: string;
  };
}

export interface EventProcessor {
  process(event: OutboxEventInput): Promise<Record<string, unknown>>;
}

// ============ 事件处理器注册表 ============

const processorRegistry: Map<string, EventProcessor> = new Map();

export function registerProcessor(name: string, processor: EventProcessor) {
  processorRegistry.set(name, processor);
}

// ============ Outbox 发布器类 ============

class RoutingAwareOutboxPublisher {
  private readonly CDC_LAG_THRESHOLD_MS = 30000;
  private readonly POLL_INTERVAL_MS = 1000;
  private readonly DEFAULT_BATCH_SIZE = 50;
  
  private routingConfig: Map<string, RoutingConfig> = new Map();
  private cdcHealthy: boolean = true;
  private isRunning: boolean = false;
  private pollingTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  // 指标
  private metrics = {
    publishedCount: 0,
    failedCount: 0,
    cdcPublished: 0,
    pollingPublished: 0,
    lastPublishTime: null as Date | null,
  };

  /**
   * 启动发布器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.debug('[OutboxPublisher] Already running');
      return;
    }

    log.debug('[OutboxPublisher] Starting routing-aware outbox publisher...');

    try {
      // 1. 加载路由配置
      await this.loadRoutingConfig();

      // 2. 启动 Polling 处理器
      this.startPollingProcessor();

      // 3. 启动健康检查
      this.startHealthCheck();

      this.isRunning = true;
      log.debug('[OutboxPublisher] Started successfully');
    } catch (error) {
      log.error('[OutboxPublisher] Failed to start:', error);
      throw error;
    }
  }

  /**
   * 停止发布器
   */
  async stop(): Promise<void> {
    log.debug('[OutboxPublisher] Stopping...');
    this.isRunning = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    log.debug('[OutboxPublisher] Stopped');
  }

  /**
   * 加载路由配置
   */
  private async loadRoutingConfig(): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        log.debug('[OutboxPublisher] Database not available, using default config');
        this.initializeDefaultConfig();
        return;
      }

      const configs = await db.select().from(outboxRoutingConfig).where(eq(outboxRoutingConfig.isActive, true));

      this.routingConfig.clear();
      for (const config of configs) {
        this.routingConfig.set(config.eventType, {
          eventType: config.eventType,
          publishMode: config.publishMode,
          cdcEnabled: config.cdcEnabled,
          pollingIntervalMs: config.pollingIntervalMs,
          pollingBatchSize: config.pollingBatchSize,
          requiresProcessing: config.requiresProcessing,
          processorClass: config.processorClass,
        });
      }

      log.debug(`[OutboxPublisher] Loaded ${this.routingConfig.size} routing configs`);

      // 如果没有配置，初始化默认配置
      if (this.routingConfig.size === 0) {
        await this.initializeDefaultConfig();
      }
    } catch (error) {
      log.warn('[OutboxPublisher] Failed to load routing config:', error);
      this.initializeDefaultConfig();
    }
  }

  /**
   * 初始化默认路由配置
   */
  private async initializeDefaultConfig(): Promise<void> {
    const defaultConfigs: RoutingConfig[] = [
      // CDC 事件（核心、高频）
      { eventType: 'DeviceCreated', publishMode: 'cdc', cdcEnabled: true, pollingIntervalMs: null, pollingBatchSize: null, requiresProcessing: false, processorClass: null },
      { eventType: 'DeviceUpdated', publishMode: 'cdc', cdcEnabled: true, pollingIntervalMs: null, pollingBatchSize: null, requiresProcessing: false, processorClass: null },
      { eventType: 'DeviceDeleted', publishMode: 'cdc', cdcEnabled: true, pollingIntervalMs: null, pollingBatchSize: null, requiresProcessing: false, processorClass: null },
      { eventType: 'SensorReading', publishMode: 'cdc', cdcEnabled: true, pollingIntervalMs: null, pollingBatchSize: null, requiresProcessing: false, processorClass: null },
      { eventType: 'AlertTriggered', publishMode: 'cdc', cdcEnabled: true, pollingIntervalMs: null, pollingBatchSize: null, requiresProcessing: false, processorClass: null },
      { eventType: 'ModelDeployed', publishMode: 'cdc', cdcEnabled: true, pollingIntervalMs: null, pollingBatchSize: null, requiresProcessing: false, processorClass: null },
      // Polling 事件（低频、需加工）
      { eventType: 'QualityReportGenerated', publishMode: 'polling', cdcEnabled: false, pollingIntervalMs: 5000, pollingBatchSize: 10, requiresProcessing: true, processorClass: 'QualityReportProcessor' },
      { eventType: 'BatchRollbackCompleted', publishMode: 'polling', cdcEnabled: false, pollingIntervalMs: 5000, pollingBatchSize: 10, requiresProcessing: true, processorClass: 'RollbackProcessor' },
      { eventType: 'DataMigrationCompleted', publishMode: 'polling', cdcEnabled: false, pollingIntervalMs: 10000, pollingBatchSize: 5, requiresProcessing: true, processorClass: 'MigrationProcessor' },
    ];

    for (const config of defaultConfigs) {
      this.routingConfig.set(config.eventType, config);
    }

    // 尝试持久化到数据库
    try {
      const db = await getDb();
      if (db) {
        for (const config of defaultConfigs) {
          await db.insert(outboxRoutingConfig).values({
            eventType: config.eventType,
            publishMode: config.publishMode,
            cdcEnabled: config.cdcEnabled,
            pollingIntervalMs: config.pollingIntervalMs,
            pollingBatchSize: config.pollingBatchSize,
            requiresProcessing: config.requiresProcessing,
            processorClass: config.processorClass,
            description: `Default config for ${config.eventType}`,
            isActive: true,
          }).onDuplicateKeyUpdate({
            set: { updatedAt: new Date() }
          });
        }
        log.debug('[OutboxPublisher] Initialized default routing configs in database');
      }
    } catch (error) {
      log.debug('[OutboxPublisher] Could not persist default configs:', error);
    }
  }

  /**
   * 获取事件的发布模式
   */
  private getPublishMode(eventType: string): 'cdc' | 'polling' {
    const config = this.routingConfig.get(eventType);

    // 未配置的默认走 CDC
    if (!config) return 'cdc';

    // CDC 不健康时，所有事件降级到 Polling
    if (!this.cdcHealthy && config.publishMode === 'cdc') {
      return 'polling';
    }

    return config.publishMode;
  }

  /**
   * 启动 Polling 处理器
   */
  private startPollingProcessor(): void {
    this.pollingTimer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // 1. 处理 Polling 类型的事件
        await this.processPollingEvents();

        // 2. 处理 CDC 遗漏的事件（兜底）
        if (!this.cdcHealthy) {
          await this.processFallbackEvents();
        } else {
          await this.processStaleEvents();
        }
      } catch (error) {
        log.warn('[OutboxPublisher] Polling processor error:', error);
      }
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * 处理 Polling 类型事件
   */
  private async processPollingEvents(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const pollingEventTypes = Array.from(this.routingConfig.entries())
      .filter(([_, config]) => config.publishMode === 'polling')
      .map(([type, _]) => type);

    if (pollingEventTypes.length === 0) return;

    let events;
    try {
      events = await db.select()
        .from(outboxEvents)
        .where(and(
          eq(outboxEvents.status, 'pending'),
          inArray(outboxEvents.eventType, pollingEventTypes)
        ))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(this.DEFAULT_BATCH_SIZE);
    } catch {
      // 表还未创建，跳过本次轮询
      return;
    }

    for (const event of events) {
      try {
        const config = this.routingConfig.get(event.eventType);

        // 需要加工的事件，调用处理器
        let payload = event.payload;
        if (config?.requiresProcessing && config.processorClass) {
          const processor = processorRegistry.get(config.processorClass);
          if (processor) {
            payload = await processor.process({
              eventType: event.eventType,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload as Record<string, unknown>,
            });
          }
        }

        await this.publishEvent({ ...event, payload });
        this.metrics.pollingPublished++;
      } catch (error) {
        log.warn(`[OutboxPublisher] Failed to process polling event ${event.eventId}:`, error);
        await this.markEventFailed(event.eventId, String(error));
      }
    }
  }

  /**
   * 处理过期事件（CDC 遗漏）
   */
  private async processStaleEvents(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const staleThreshold = new Date(Date.now() - 60000); // 1 分钟

    let events;
    try {
      events = await db.select()
        .from(outboxEvents)
        .where(and(
          eq(outboxEvents.status, 'pending'),
          lt(outboxEvents.createdAt, staleThreshold)
        ))
        .limit(10);
    } catch {
      return;
    }

    if (events.length > 0) {
      log.warn(`[OutboxPublisher] Found ${events.length} stale events, publishing via polling`);
      for (const event of events) {
        try {
          await this.publishEvent(event);
        } catch (error) {
          log.warn(`[OutboxPublisher] Failed to publish stale event ${event.eventId}:`, error);
        }
      }
    }
  }

  /**
   * CDC 故障时的降级处理
   */
  private async processFallbackEvents(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    let events;
    try {
      events = await db.select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, 'pending'))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(this.DEFAULT_BATCH_SIZE);
    } catch {
      return;
    }

    for (const event of events) {
      try {
        await this.publishEvent(event);
      } catch (error) {
        log.warn(`[OutboxPublisher] Fallback publish failed for ${event.eventId}:`, error);
      }
    }
  }

  /**
   * 发布事件到 Kafka
   */
  private async publishEvent(event: typeof outboxEvents.$inferSelect): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // 更新状态为处理中
    await db.update(outboxEvents)
      .set({ status: 'processing' })
      .where(eq(outboxEvents.eventId, event.eventId));

    try {
      // 确定目标 Topic
      const topic = this.getTopicForEvent(event.eventType);

      // 发送到 Kafka
      await kafkaClient.produce(topic, [{
        key: event.aggregateId,
        value: JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          metadata: event.metadata,
          timestamp: new Date().toISOString(),
        }),
        headers: {
          'event-type': event.eventType,
          'aggregate-type': event.aggregateType,
          'correlation-id': (event.metadata as any)?.correlationId || event.eventId,
        },
      }]);

      // 更新状态为已发布
      await db.update(outboxEvents)
        .set({
          status: 'published',
          publishedAt: new Date(),
        })
        .where(eq(outboxEvents.eventId, event.eventId));

      this.metrics.publishedCount++;
      this.metrics.lastPublishTime = new Date();
    } catch (error) {
      // 发布失败，更新重试计数
      const newRetryCount = (event.retryCount || 0) + 1;
      const status = newRetryCount >= event.maxRetries ? 'failed' : 'pending';

      await db.update(outboxEvents)
        .set({
          status,
          retryCount: newRetryCount,
          lastError: String(error),
        })
        .where(eq(outboxEvents.eventId, event.eventId));

      this.metrics.failedCount++;
      throw error;
    }
  }

  /**
   * 标记事件失败
   */
  private async markEventFailed(eventId: string, error: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(outboxEvents)
      .set({
        status: 'failed',
        lastError: error,
      })
      .where(eq(outboxEvents.eventId, eventId));

    this.metrics.failedCount++;
  }

  /**
   * 获取事件对应的 Kafka Topic
   */
  private getTopicForEvent(eventType: string): string {
    const topicMap: Record<string, string> = {
      'DeviceCreated': KAFKA_TOPICS.DEVICE_EVENTS,
      'DeviceUpdated': KAFKA_TOPICS.DEVICE_EVENTS,
      'DeviceDeleted': KAFKA_TOPICS.DEVICE_EVENTS,
      'SensorReading': KAFKA_TOPICS.SENSOR_READINGS,
      'AlertTriggered': KAFKA_TOPICS.ANOMALY_ALERTS,
      'ModelDeployed': KAFKA_TOPICS.WORKFLOW_EVENTS,
      'QualityReportGenerated': KAFKA_TOPICS.WORKFLOW_EVENTS,
      'BatchRollbackCompleted': KAFKA_TOPICS.WORKFLOW_EVENTS,
      'DataMigrationCompleted': KAFKA_TOPICS.WORKFLOW_EVENTS,
    };

    return topicMap[eventType] || KAFKA_TOPICS.WORKFLOW_EVENTS;
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, 60000); // 每分钟检查一次
  }

  /**
   * 健康检查
   */
  private async checkHealth(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      // 检查 pending 数量
      const pendingEvents = await db.select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, 'pending'));

      const pendingCount = pendingEvents.length;

      if (pendingCount > 500) {
        log.warn(`[OutboxPublisher] High backlog: ${pendingCount} pending events`);
      }

      // 检查最老的 pending 事件
      if (pendingEvents.length > 0) {
        const oldest = pendingEvents.reduce((a, b) => 
          a.createdAt < b.createdAt ? a : b
        );
        const ageMs = Date.now() - oldest.createdAt.getTime();

        if (ageMs > 300000) { // 5 分钟
          log.error(`[OutboxPublisher] Stuck event detected: ${oldest.eventId} is ${Math.round(ageMs / 60000)} minutes old`);
        }
      }

      // 检查失败事件
      const failedEvents = await db.select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, 'failed'));

      if (failedEvents.length > 100) {
        log.warn(`[OutboxPublisher] ${failedEvents.length} failed events require attention`);
      }
    } catch (error) {
      log.warn('[OutboxPublisher] Health check failed:', error);
    }
  }

  /**
   * 添加事件到 Outbox（供业务代码调用）
   */
  async addEvent(input: OutboxEventInput): Promise<string> {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not available');
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await db.insert(outboxEvents).values({
      eventId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      metadata: input.metadata,
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
    });

    return eventId;
  }

  /**
   * 获取发布器指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      cdcHealthy: this.cdcHealthy,
      configuredEventTypes: this.routingConfig.size,
    };
  }

  /**
   * 重新加载路由配置
   */
  async reloadConfig(): Promise<void> {
    await this.loadRoutingConfig();
  }

  /**
   * 设置 CDC 健康状态
   */
  setCdcHealth(healthy: boolean): void {
    if (this.cdcHealthy !== healthy) {
      log.debug(`[OutboxPublisher] CDC health changed: ${this.cdcHealthy} -> ${healthy}`);
      this.cdcHealthy = healthy;
    }
  }
}

// 导出单例
export const outboxPublisher = new RoutingAwareOutboxPublisher();

// 导出类型
export type { RoutingAwareOutboxPublisher };
