/**
 * ============================================================================
 * 统一事件总线 Facade — UnifiedEventBus
 * ============================================================================
 *
 * FIX-022: 统一入口，按 topicConfig 路由到 Kafka 或内存总线
 * FIX-023: DLQ 死信队列（处理失败消息）
 * FIX-024: 消费者健康检查（30s 心跳 + 离线告警）
 * FIX-126: 双总线路由策略
 *
 * 路由规则：
 *   - 高吞吐主题 (sensor.reading, sensor.batch) → Kafka
 *   - 低延迟主题 (system.alert, diagnosis.*) → 内存总线
 *   - 未配置的主题 → 内存总线（默认）
 *
 * 设计原则：
 *   - 新增不修改：不改动现有 eventBus.service.ts 和 kafkaEventBus.ts
 *   - 降级不崩溃：Kafka 不可用时自动降级到内存
 *   - 单例 + 工厂模式
 */

import { createModuleLogger } from '../../core/logger';
import { eventBus as legacyEventBus, TOPICS } from '../../services/eventBus.service';

const log = createModuleLogger('unified-event-bus');

// ============================================================================
// 路由配置类型
// ============================================================================

export type ChannelType = 'kafka' | 'memory' | 'both';

export interface TopicRouteConfig {
  /** 主题匹配模式 (exact 或 prefix) */
  pattern: string;
  /** 路由通道 */
  channel: ChannelType;
  /** 是否需要持久化 */
  persist: boolean;
  /** 优先级（冲突时选高优先级） */
  priority: number;
}

export interface UnifiedEventBusConfig {
  /** 主题路由规则 */
  routes: TopicRouteConfig[];
  /** 默认通道（未匹配任何路由时） */
  defaultChannel: ChannelType;
  /** 是否启用 DLQ */
  enableDLQ: boolean;
  /** DLQ 最大容量 */
  dlqMaxSize: number;
  /** DLQ 最大重试次数 */
  dlqMaxRetries: number;
  /** 消费者健康检查间隔 (ms) */
  healthCheckIntervalMs: number;
  /** 消费者离线告警阈值 (ms) */
  consumerOfflineThresholdMs: number;
}

// ============================================================================
// 默认路由配置
// ============================================================================

const DEFAULT_ROUTES: TopicRouteConfig[] = [
  // 高吞吐数据 → Kafka（降级到内存）
  { pattern: 'sensor.reading', channel: 'kafka', persist: true, priority: 10 },
  { pattern: 'sensor.batch', channel: 'kafka', persist: true, priority: 10 },
  { pattern: 'device.heartbeat', channel: 'kafka', persist: false, priority: 5 },
  // 诊断/告警 → 内存（低延迟）
  { pattern: 'diagnosis.', channel: 'memory', persist: true, priority: 10 },
  { pattern: 'system.alert', channel: 'memory', persist: true, priority: 10 },
  { pattern: 'anomaly.', channel: 'memory', persist: true, priority: 10 },
  // 进化/知识 → 内存
  { pattern: 'evolution.', channel: 'memory', persist: true, priority: 5 },
  { pattern: 'knowledge.', channel: 'memory', persist: true, priority: 5 },
];

const DEFAULT_CONFIG: UnifiedEventBusConfig = {
  routes: DEFAULT_ROUTES,
  defaultChannel: 'memory',
  enableDLQ: true,
  dlqMaxSize: 10000,
  dlqMaxRetries: 3,
  healthCheckIntervalMs: 30_000,
  consumerOfflineThresholdMs: 60_000,
};

// ============================================================================
// DLQ 条目
// ============================================================================

export interface DLQEntry {
  id: string;
  topic: string;
  payload: unknown;
  error: string;
  retryCount: number;
  failedAt: number;
  subscriberId: string;
  channel: ChannelType;
}

// ============================================================================
// 消费者健康状态
// ============================================================================

export interface ConsumerHealth {
  subscriberId: string;
  topic: string;
  lastHeartbeat: number;
  eventsProcessed: number;
  errorsCount: number;
  status: 'healthy' | 'degraded' | 'offline';
}

// ============================================================================
// 统一事件总线
// ============================================================================

export class UnifiedEventBus {
  private readonly config: UnifiedEventBusConfig;
  private kafkaAvailable = false;
  private dlq: DLQEntry[] = [];
  private consumers = new Map<string, ConsumerHealth>();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  // 统计
  private stats = {
    publishedTotal: 0,
    publishedKafka: 0,
    publishedMemory: 0,
    kafkaFallbacks: 0,
    dlqEntries: 0,
    dlqRetried: 0,
    healthChecks: 0,
    offlineAlerts: 0,
  };

  constructor(config?: Partial<UnifiedEventBusConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  async start(): Promise<void> {
    if (this.started) return;

    // 检测 Kafka 可用性
    this.kafkaAvailable = await this.probeKafka();
    log.info({
      kafkaAvailable: this.kafkaAvailable,
      routeCount: this.config.routes.length,
      defaultChannel: this.config.defaultChannel,
    }, '[UnifiedEventBus] started');

    // 启动消费者健康检查
    if (this.config.healthCheckIntervalMs > 0) {
      this.healthCheckTimer = setInterval(
        () => this.runHealthCheck(),
        this.config.healthCheckIntervalMs,
      );
    }

    this.started = true;
  }

  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.started = false;
    log.info('[UnifiedEventBus] stopped');
  }

  // ==========================================================================
  // FIX-126: 路由策略
  // ==========================================================================

  /**
   * 根据 topic 决定路由通道
   */
  resolveChannel(topic: string): ChannelType {
    let bestMatch: TopicRouteConfig | null = null;

    for (const route of this.config.routes) {
      const matches = route.pattern.endsWith('.')
        ? topic.startsWith(route.pattern)  // 前缀匹配
        : topic === route.pattern;          // 精确匹配

      if (matches && (!bestMatch || route.priority > bestMatch.priority)) {
        bestMatch = route;
      }
    }

    const channel = bestMatch?.channel || this.config.defaultChannel;

    // Kafka 不可用时降级
    if ((channel === 'kafka' || channel === 'both') && !this.kafkaAvailable) {
      this.stats.kafkaFallbacks++;
      return 'memory';
    }

    return channel;
  }

  // ==========================================================================
  // FIX-022: 统一 publish
  // ==========================================================================

  /**
   * 统一发布事件 — 自动路由到正确的通道
   */
  async publish(
    topic: string,
    eventType: string,
    payload: Record<string, unknown>,
    options?: {
      source?: string;
      deviceCode?: string;
      severity?: 'info' | 'warning' | 'error' | 'critical';
    },
  ): Promise<string> {
    const channel = this.resolveChannel(topic);
    this.stats.publishedTotal++;

    switch (channel) {
      case 'kafka':
        return this.publishToKafka(topic, eventType, payload, options);
      case 'both':
        // 双写：Kafka + 内存
        const [kafkaId] = await Promise.allSettled([
          this.publishToKafka(topic, eventType, payload, options),
          this.publishToMemory(topic, eventType, payload, options),
        ]);
        return kafkaId.status === 'fulfilled' ? kafkaId.value : `mem_${Date.now()}`;
      case 'memory':
      default:
        return this.publishToMemory(topic, eventType, payload, options);
    }
  }

  private async publishToKafka(
    topic: string,
    eventType: string,
    payload: Record<string, unknown>,
    options?: { source?: string; deviceCode?: string; severity?: string },
  ): Promise<string> {
    try {
      const { kafkaClient } = await import('../../lib/clients/kafka.client');
      await kafkaClient.produce(topic, [{
        key: options?.deviceCode || 'default',
        value: JSON.stringify({ eventType, payload, timestamp: Date.now(), ...options }),
      }]);
      this.stats.publishedKafka++;
      return `kafka_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    } catch (err: any) {
      log.warn({ err: err.message, topic }, '[UnifiedEventBus] Kafka publish failed, falling back');
      this.stats.kafkaFallbacks++;
      // 降级到内存
      return this.publishToMemory(topic, eventType, payload, options);
    }
  }

  private async publishToMemory(
    topic: string,
    eventType: string,
    payload: Record<string, unknown>,
    options?: { source?: string; deviceCode?: string; severity?: string },
  ): Promise<string> {
    const event = await legacyEventBus.publish(topic, eventType, payload, {
      source: options?.source,
      deviceCode: options?.deviceCode,
      severity: options?.severity as any,
    });
    this.stats.publishedMemory++;
    return event.eventId;
  }

  // ==========================================================================
  // 统一 subscribe（带健康检查注册）
  // ==========================================================================

  /**
   * 统一订阅 — 自动注册消费者健康状态
   */
  subscribe(
    topic: string,
    handler: (event: any) => Promise<void> | void,
    subscriberId?: string,
  ): () => void {
    const subId = subscriberId || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 注册消费者健康
    this.consumers.set(subId, {
      subscriberId: subId,
      topic,
      lastHeartbeat: Date.now(),
      eventsProcessed: 0,
      errorsCount: 0,
      status: 'healthy',
    });

    // 包装 handler 以支持 DLQ + 健康追踪
    const wrappedHandler = async (event: any) => {
      const consumer = this.consumers.get(subId);
      if (consumer) {
        consumer.lastHeartbeat = Date.now();
      }

      try {
        await handler(event);
        if (consumer) consumer.eventsProcessed++;
      } catch (err: any) {
        if (consumer) consumer.errorsCount++;
        // FIX-023: 写入 DLQ
        if (this.config.enableDLQ) {
          this.addToDLQ({
            id: `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            topic,
            payload: event,
            error: err.message || String(err),
            retryCount: 0,
            failedAt: Date.now(),
            subscriberId: subId,
            channel: 'memory',
          });
        }
      }
    };

    const unsubscribe = legacyEventBus.subscribe(topic, wrappedHandler as any);

    return () => {
      unsubscribe();
      this.consumers.delete(subId);
    };
  }

  // ==========================================================================
  // FIX-023: 死信队列
  // ==========================================================================

  private addToDLQ(entry: DLQEntry): void {
    if (this.dlq.length >= this.config.dlqMaxSize) {
      // 淘汰最旧的条目
      this.dlq.shift();
    }
    this.dlq.push(entry);
    this.stats.dlqEntries++;

    log.warn({
      topic: entry.topic,
      error: entry.error.slice(0, 200),
      subscriberId: entry.subscriberId,
    }, '[UnifiedEventBus] Event added to DLQ');
  }

  /**
   * 重试 DLQ 中的事件
   */
  async retryDLQ(maxRetries?: number): Promise<{ retried: number; failed: number }> {
    const limit = maxRetries ?? this.config.dlqMaxRetries;
    let retried = 0;
    let failed = 0;
    const remaining: DLQEntry[] = [];

    for (const entry of this.dlq) {
      if (entry.retryCount >= limit) {
        remaining.push(entry); // 超过重试次数，保留在 DLQ
        failed++;
        continue;
      }

      try {
        await this.publish(entry.topic, 'dlq.retry', entry.payload as Record<string, unknown>);
        retried++;
        this.stats.dlqRetried++;
      } catch {
        entry.retryCount++;
        entry.failedAt = Date.now();
        remaining.push(entry);
        failed++;
      }
    }

    this.dlq = remaining;
    return { retried, failed };
  }

  /**
   * 获取 DLQ 内容
   */
  getDLQ(limit = 100): DLQEntry[] {
    return this.dlq.slice(-limit);
  }

  /**
   * 清空 DLQ
   */
  clearDLQ(): number {
    const count = this.dlq.length;
    this.dlq = [];
    return count;
  }

  // ==========================================================================
  // FIX-024: 消费者健康检查
  // ==========================================================================

  private runHealthCheck(): void {
    this.stats.healthChecks++;
    const now = Date.now();

    for (const [id, consumer] of this.consumers) {
      const elapsed = now - consumer.lastHeartbeat;

      if (elapsed > this.config.consumerOfflineThresholdMs) {
        if (consumer.status !== 'offline') {
          consumer.status = 'offline';
          this.stats.offlineAlerts++;
          log.warn({
            subscriberId: id,
            topic: consumer.topic,
            lastHeartbeat: new Date(consumer.lastHeartbeat).toISOString(),
            offlineMs: elapsed,
          }, '[UnifiedEventBus] Consumer offline');

          // 发布消费者离线告警到内存总线
          legacyEventBus.publish(
            TOPICS.SYSTEM_ALERT,
            'consumer.offline',
            {
              subscriberId: id,
              topic: consumer.topic,
              offlineMs: elapsed,
            },
            { severity: 'warning', source: 'unified-event-bus' },
          ).catch(() => { /* 不递归 */ });
        }
      } else if (elapsed > this.config.healthCheckIntervalMs) {
        consumer.status = 'degraded';
      } else {
        consumer.status = 'healthy';
      }
    }
  }

  /**
   * 获取所有消费者健康状态
   */
  getConsumerHealth(): ConsumerHealth[] {
    return Array.from(this.consumers.values());
  }

  // ==========================================================================
  // 探测和统计
  // ==========================================================================

  private async probeKafka(): Promise<boolean> {
    try {
      const { kafkaClient } = await import('../../lib/clients/kafka.client');
      return kafkaClient.getConnectionStatus();
    } catch {
      return false;
    }
  }

  getStats() {
    return {
      ...this.stats,
      kafkaAvailable: this.kafkaAvailable,
      consumerCount: this.consumers.size,
      dlqSize: this.dlq.length,
      started: this.started,
    };
  }

  /**
   * 获取路由表（调试用）
   */
  getRouteTable(): Array<{ pattern: string; channel: ChannelType; effective: ChannelType }> {
    return this.config.routes.map(r => ({
      pattern: r.pattern,
      channel: r.channel,
      effective: (r.channel === 'kafka' && !this.kafkaAvailable) ? 'memory' : r.channel,
    }));
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let _instance: UnifiedEventBus | null = null;

export function getUnifiedEventBus(): UnifiedEventBus {
  if (!_instance) {
    _instance = new UnifiedEventBus();
  }
  return _instance;
}

export function resetUnifiedEventBus(): void {
  if (_instance) {
    _instance.stop();
    _instance = null;
  }
}
