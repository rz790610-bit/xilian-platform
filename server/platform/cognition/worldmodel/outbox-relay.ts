/**
 * ============================================================================
 * OutboxRelay — Outbox Pattern Relay Worker
 * ============================================================================
 *
 * Phase 3 v1.3 — ADR-007 Outbox Pattern 实现
 *
 * 职责：
 *   1. 轮询 twin_outbox 表中 status='pending' 的记录
 *   2. 通过 TwinEventBus 发布事件
 *   3. 更新 outbox 记录状态为 'sent'
 *   4. 保证最终一致性（事务内双写 → Relay 异步发布）
 *
 * 流程：
 *   业务事务 → INSERT twin_outbox (status='pending')
 *   OutboxRelay → SELECT pending → publish → UPDATE status='sent'
 *
 * 配置：
 *   - 轮询间隔：100ms（可配置）
 *   - 批量大小：50 条/次
 *   - 最大重试：3 次
 *   - 死信处理：超过重试次数 → status='dead_letter'
 *
 * 架构位置：L7 世界模型层 → 事件基础设施
 */

import { twinEventBus, type TwinEvent, type TwinEventType } from './twin-event-bus';

// ============================================================================
// 类型定义
// ============================================================================

/** Outbox 记录（对应 twin_outbox 表） */
export interface OutboxRecord {
  id: number;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'dead_letter';
  retryCount: number;
  createdAt: Date;
  sentAt: Date | null;
}

/** OutboxRelay 配置 */
export interface OutboxRelayConfig {
  /** 轮询间隔 (ms) */
  pollIntervalMs: number;
  /** 每次轮询的批量大小 */
  batchSize: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 是否启用 */
  enabled: boolean;
}

/** OutboxRelay 统计 */
export interface OutboxRelayStats {
  pollCycles: number;
  totalProcessed: number;
  totalSent: number;
  totalFailed: number;
  totalDeadLettered: number;
  avgProcessTimeMs: number;
  lastPollAt: number;
  isRunning: boolean;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: OutboxRelayConfig = {
  pollIntervalMs: 100,
  batchSize: 50,
  maxRetries: 3,
  enabled: true,
};

// ============================================================================
// OutboxRelay 实现
// ============================================================================

export class OutboxRelay {
  private config: OutboxRelayConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProcessing: boolean = false;
  private stats: OutboxRelayStats = {
    pollCycles: 0,
    totalProcessed: 0,
    totalSent: 0,
    totalFailed: 0,
    totalDeadLettered: 0,
    avgProcessTimeMs: 0,
    lastPollAt: 0,
    isRunning: false,
  };

  // 外部注入的 DB 操作函数
  private fetchPendingFn: ((batchSize: number) => Promise<OutboxRecord[]>) | null = null;
  private markSentFn: ((id: number) => Promise<void>) | null = null;
  private markDeadLetterFn: ((id: number) => Promise<void>) | null = null;
  private incrementRetryFn: ((id: number) => Promise<void>) | null = null;

  constructor(config: Partial<OutboxRelayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // 依赖注入
  // --------------------------------------------------------------------------

  /**
   * 注入 DB 操作函数
   *
   * 这些函数由 domain router 层提供，避免 Relay Worker 直接依赖 Drizzle
   */
  setDbFunctions(fns: {
    fetchPending: (batchSize: number) => Promise<OutboxRecord[]>;
    markSent: (id: number) => Promise<void>;
    markDeadLetter: (id: number) => Promise<void>;
    incrementRetry: (id: number) => Promise<void>;
  }): void {
    this.fetchPendingFn = fns.fetchPending;
    this.markSentFn = fns.markSent;
    this.markDeadLetterFn = fns.markDeadLetter;
    this.incrementRetryFn = fns.incrementRetry;
  }

  // --------------------------------------------------------------------------
  // 生命周期
  // --------------------------------------------------------------------------

  /**
   * 启动 Relay Worker
   */
  start(): void {
    if (this.timer) return;
    if (!this.config.enabled) {
      console.log('[OutboxRelay] Disabled by config, not starting');
      return;
    }

    console.log(`[OutboxRelay] Starting with interval=${this.config.pollIntervalMs}ms, batch=${this.config.batchSize}`);
    this.stats.isRunning = true;

    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        console.error('[OutboxRelay] Poll error:', err);
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * 停止 Relay Worker
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stats.isRunning = false;
    console.log('[OutboxRelay] Stopped');
  }

  /**
   * 优雅关闭（等待当前处理完成）
   */
  async gracefulShutdown(timeoutMs: number = 5000): Promise<void> {
    this.stop();

    // 等待当前处理完成
    const startTime = Date.now();
    while (this.isProcessing && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (this.isProcessing) {
      console.warn('[OutboxRelay] Graceful shutdown timeout, forcing stop');
    }
  }

  // --------------------------------------------------------------------------
  // 核心轮询逻辑
  // --------------------------------------------------------------------------

  /**
   * 单次轮询
   */
  private async poll(): Promise<void> {
    // 防止并发处理
    if (this.isProcessing) return;
    if (!this.fetchPendingFn || !this.markSentFn || !this.markDeadLetterFn || !this.incrementRetryFn) {
      return; // DB 函数未注入
    }

    this.isProcessing = true;
    const startTime = Date.now();
    this.stats.pollCycles++;
    this.stats.lastPollAt = Date.now();

    try {
      // 1. 获取 pending 记录
      const records = await this.fetchPendingFn(this.config.batchSize);

      if (records.length === 0) {
        this.isProcessing = false;
        return;
      }

      // 2. 逐条处理
      for (const record of records) {
        await this.processRecord(record);
      }

      // 3. 更新统计
      const processTime = Date.now() - startTime;
      this.stats.avgProcessTimeMs =
        (this.stats.avgProcessTimeMs * (this.stats.pollCycles - 1) + processTime) / this.stats.pollCycles;

    } catch (err) {
      console.error('[OutboxRelay] Poll cycle error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理单条 Outbox 记录
   */
  private async processRecord(record: OutboxRecord): Promise<void> {
    this.stats.totalProcessed++;

    try {
      // 解析事件载荷
      const event = record.payload as unknown as TwinEvent;

      // 通过事件总线发布
      await twinEventBus.publish(event);

      // 标记为已发送
      await this.markSentFn!(record.id);
      this.stats.totalSent++;

    } catch (err) {
      this.stats.totalFailed++;

      if (record.retryCount >= this.config.maxRetries) {
        // 超过最大重试 → 死信
        try {
          await this.markDeadLetterFn!(record.id);
          this.stats.totalDeadLettered++;
          console.warn(
            `[OutboxRelay] Record ${record.id} moved to dead letter after ${record.retryCount} retries`,
          );
        } catch (dlErr) {
          console.error(`[OutboxRelay] Failed to mark dead letter for record ${record.id}:`, dlErr);
        }
      } else {
        // 递增重试计数
        try {
          await this.incrementRetryFn!(record.id);
        } catch (retryErr) {
          console.error(`[OutboxRelay] Failed to increment retry for record ${record.id}:`, retryErr);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  /**
   * 获取统计信息
   */
  getStats(): OutboxRelayStats {
    return { ...this.stats };
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.stats.isRunning;
  }

  /**
   * 手动触发一次轮询（用于测试）
   */
  async triggerPoll(): Promise<void> {
    await this.poll();
  }
}

// ============================================================================
// Outbox 辅助函数（用于业务事务中写入 outbox 记录）
// ============================================================================

/**
 * 创建 Outbox 记录数据（用于在事务中 INSERT）
 *
 * 使用方式：
 * ```ts
 * await db.transaction(async (tx) => {
 *   // 1. 写入业务数据
 *   await tx.insert(simulationResults).values(result);
 *   // 2. 写入 outbox（同一事务）
 *   await tx.insert(twinOutbox).values(
 *     createOutboxEntry('simulation', scenarioId, TwinEventType.SIMULATION_COMPLETED, payload)
 *   );
 * });
 * ```
 */
export function createOutboxEntry(
  aggregateType: string,
  aggregateId: string | number,
  eventType: TwinEventType | string,
  payload: Record<string, unknown>,
): {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending';
  retryCount: number;
} {
  return {
    aggregateType,
    aggregateId: String(aggregateId),
    eventType: String(eventType),
    payload,
    status: 'pending' as const,
    retryCount: 0,
  };
}

// ============================================================================
// 单例导出
// ============================================================================

/** 全局 OutboxRelay 单例 */
export const outboxRelay = new OutboxRelay();
