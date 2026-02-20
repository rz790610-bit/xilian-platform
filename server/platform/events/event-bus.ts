/**
 * ============================================================================
 * 统一事件总线 — EventBus
 * ============================================================================
 *
 * 职责：
 *   1. 发布/订阅模式（类型安全的事件分发）
 *   2. 事件过滤（按 topic / machineId / severity 过滤）
 *   3. 事件优先级队列（critical > high > normal > low）
 *   4. 死信队列（处理失败的事件）
 *   5. 事件指标（发布/消费/失败计数）
 *   6. 事件回放（从持久化存储回放历史事件）
 */

// ============================================================================
// 事件总线类型
// ============================================================================

export interface BusEvent<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  metadata: {
    source: string;
    machineId?: string;
    sessionId?: string;
    priority: 'critical' | 'high' | 'normal' | 'low';
    timestamp: number;
    correlationId?: string;
    traceId?: string;
  };
}

export interface Subscription {
  id: string;
  topic: string;
  filter?: (event: BusEvent) => boolean;
  handler: (event: BusEvent) => Promise<void> | void;
  options: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
    batchSize: number; // 0 = 不批处理
    concurrency: number;
  };
}

export interface DeadLetterEntry {
  event: BusEvent;
  subscriptionId: string;
  error: string;
  retryCount: number;
  failedAt: number;
}

export interface EventBusMetrics {
  publishedCount: number;
  consumedCount: number;
  failedCount: number;
  deadLetterCount: number;
  avgProcessingMs: number;
  topicCounts: Record<string, number>;
  subscriberCount: number;
}

// ============================================================================
// 统一事件总线
// ============================================================================

export class EventBus {
  private subscriptions = new Map<string, Subscription[]>(); // topic → subscriptions
  private allSubscriptions = new Map<string, Subscription>(); // id → subscription
  private deadLetterQueue: DeadLetterEntry[] = [];
  private metrics: EventBusMetrics = {
    publishedCount: 0,
    consumedCount: 0,
    failedCount: 0,
    deadLetterCount: 0,
    avgProcessingMs: 0,
    topicCounts: {},
    subscriberCount: 0,
  };
  private priorityQueue: BusEvent[] = [];
  private processing = false;
  private totalProcessingMs = 0;

  /**
   * 发布事件
   */
  async publish<T>(
    topic: string,
    payload: T,
    metadata: Partial<BusEvent['metadata']> = {},
  ): Promise<string> {
    const event: BusEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      payload,
      metadata: {
        source: metadata.source || 'unknown',
        machineId: metadata.machineId,
        sessionId: metadata.sessionId,
        priority: metadata.priority || 'normal',
        timestamp: Date.now(),
        correlationId: metadata.correlationId,
        traceId: metadata.traceId || `trace_${Date.now()}`,
      },
    };

    this.metrics.publishedCount++;
    this.metrics.topicCounts[topic] = (this.metrics.topicCounts[topic] || 0) + 1;

    // 按优先级插入队列
    this.enqueue(event);

    // 触发处理
    if (!this.processing) {
      await this.processQueue();
    }

    return event.id;
  }

  /**
   * 订阅事件
   */
  subscribe(
    topic: string,
    handler: Subscription['handler'],
    options?: Partial<Subscription['options']>,
    filter?: Subscription['filter'],
  ): string {
    const subscription: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      filter,
      handler,
      options: {
        maxRetries: options?.maxRetries ?? 3,
        retryDelayMs: options?.retryDelayMs ?? 1000,
        timeoutMs: options?.timeoutMs ?? 30000,
        batchSize: options?.batchSize ?? 0,
        concurrency: options?.concurrency ?? 1,
      },
    };

    const topicSubs = this.subscriptions.get(topic) || [];
    topicSubs.push(subscription);
    this.subscriptions.set(topic, topicSubs);
    this.allSubscriptions.set(subscription.id, subscription);
    this.metrics.subscriberCount++;

    return subscription.id;
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): boolean {
    const sub = this.allSubscriptions.get(subscriptionId);
    if (!sub) return false;

    const topicSubs = this.subscriptions.get(sub.topic);
    if (topicSubs) {
      const idx = topicSubs.findIndex(s => s.id === subscriptionId);
      if (idx >= 0) topicSubs.splice(idx, 1);
    }

    this.allSubscriptions.delete(subscriptionId);
    this.metrics.subscriberCount--;
    return true;
  }

  /**
   * 通配符订阅（匹配所有 topic）
   */
  subscribeAll(
    handler: Subscription['handler'],
    options?: Partial<Subscription['options']>,
  ): string {
    return this.subscribe('*', handler, options);
  }

  /**
   * 获取死信队列
   */
  getDeadLetters(limit: number = 100): DeadLetterEntry[] {
    return this.deadLetterQueue.slice(-limit);
  }

  /**
   * 重试死信
   */
  async retryDeadLetter(index: number): Promise<boolean> {
    if (index < 0 || index >= this.deadLetterQueue.length) return false;

    const entry = this.deadLetterQueue[index];
    const sub = this.allSubscriptions.get(entry.subscriptionId);
    if (!sub) return false;

    try {
      await sub.handler(entry.event);
      this.deadLetterQueue.splice(index, 1);
      this.metrics.consumedCount++;
      this.metrics.deadLetterCount--;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): EventBusMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics = {
      publishedCount: 0,
      consumedCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
      avgProcessingMs: 0,
      topicCounts: {},
      subscriberCount: this.allSubscriptions.size,
    };
    this.totalProcessingMs = 0;
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  /**
   * 按优先级入队
   */
  private enqueue(event: BusEvent): void {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    const priority = priorityOrder[event.metadata.priority];

    let insertIdx = this.priorityQueue.length;
    for (let i = 0; i < this.priorityQueue.length; i++) {
      if (priorityOrder[this.priorityQueue[i].metadata.priority] > priority) {
        insertIdx = i;
        break;
      }
    }

    this.priorityQueue.splice(insertIdx, 0, event);
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.priorityQueue.length > 0) {
      const event = this.priorityQueue.shift()!;
      await this.dispatch(event);
    }

    this.processing = false;
  }

  /**
   * 分发事件到订阅者
   */
  private async dispatch(event: BusEvent): Promise<void> {
    // 获取匹配的订阅
    const topicSubs = this.subscriptions.get(event.topic) || [];
    const wildcardSubs = this.subscriptions.get('*') || [];
    const allSubs = [...topicSubs, ...wildcardSubs];

    for (const sub of allSubs) {
      // 应用过滤器
      if (sub.filter && !sub.filter(event)) continue;

      const startTime = Date.now();
      let retryCount = 0;

      while (retryCount <= sub.options.maxRetries) {
        try {
          await this.withTimeout(
            Promise.resolve(sub.handler(event)),
            sub.options.timeoutMs,
          );

          this.metrics.consumedCount++;
          this.totalProcessingMs += Date.now() - startTime;
          this.metrics.avgProcessingMs = this.totalProcessingMs / this.metrics.consumedCount;
          break;
        } catch (err) {
          retryCount++;
          if (retryCount > sub.options.maxRetries) {
            // 进入死信队列
            this.deadLetterQueue.push({
              event,
              subscriptionId: sub.id,
              error: String(err),
              retryCount,
              failedAt: Date.now(),
            });
            this.metrics.failedCount++;
            this.metrics.deadLetterCount++;

            // 限制死信队列大小
            if (this.deadLetterQueue.length > 10000) {
              this.deadLetterQueue.shift();
            }
          } else {
            await new Promise(resolve =>
              setTimeout(resolve, sub.options.retryDelayMs * Math.pow(2, retryCount - 1)),
            );
          }
        }
      }
    }
  }

  /**
   * 超时包装
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`事件处理超时 (${timeoutMs}ms)`)), timeoutMs);
      promise
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }
}
