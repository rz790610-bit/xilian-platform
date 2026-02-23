/**
 * Redis 辅助去重服务
 * 热路径 Redis 去重 + 异步 MySQL 刷盘
 * 检查延迟 < 0.5ms，支持幂等性保证
 */

import { redisClient } from '../lib/clients/redis.client';
import { getDb } from '../lib/db';
import { processedEvents, idempotentRecords } from '../../drizzle/schema';
import { eq, lt, sql } from 'drizzle-orm';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('deduplication');

// ============ 类型定义 ============

export interface DeduplicationResult {

  isDuplicate: boolean;
  eventId: string;
  source: 'redis' | 'mysql' | 'none';
  checkTimeMs: number;
}

export interface IdempotencyResult<T = unknown> {
  isNew: boolean;
  result?: T;
  key: string;
}

interface FlushQueueItem {
  eventId: string;
  eventType: string;
  consumerGroup: string;
  processedAt: Date;
  expiresAt: Date;
  metadata?: {
    partition?: number;
    offset?: string;
    processingTimeMs?: number;
  };
}

// ============ 去重服务类 ============

class DeduplicationService {
  private readonly REDIS_KEY_PREFIX = 'dedup:';
  private readonly IDEMPOTENT_KEY_PREFIX = 'idem:';
  private readonly DEFAULT_TTL_SECONDS = 86400; // 24 小时
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 秒刷盘
  private readonly FLUSH_BATCH_SIZE = 100;

  private isRunning: boolean = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushQueue: FlushQueueItem[] = [];
  private cleanupTimer: NodeJS.Timeout | null = null;

  // 指标
  private metrics = {
    totalChecks: 0,
    duplicatesFound: 0,
    redisHits: 0,
    mysqlHits: 0,
    flushedToDb: 0,
    flushErrors: 0,
  };

  /**
   * 启动去重服务
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    log.debug('[Deduplication] Starting deduplication service...');
    this.isRunning = true;

    // 启动异步刷盘
    this.startFlushTimer();

    // 启动过期清理
    this.startCleanupTimer();

    log.debug('[Deduplication] Started');
  }

  /**
   * 停止去重服务
   */
  async stop(): Promise<void> {
    log.debug('[Deduplication] Stopping...');
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 刷盘剩余数据
    if (this.flushQueue.length > 0) {
      await this.flushToDatabase();
    }

    log.debug('[Deduplication] Stopped');
  }

  /**
   * 检查事件是否重复（热路径）
   */
  async isDuplicate(
    eventId: string,
    consumerGroup: string
  ): Promise<DeduplicationResult> {
    const startTime = Date.now();
    this.metrics.totalChecks++;

    const redisKey = `${this.REDIS_KEY_PREFIX}${consumerGroup}:${eventId}`;

    try {
      // 1. 先查 Redis（热路径，< 0.5ms）
      const redisResult = await redisClient.get(redisKey);
      if (redisResult) {
        this.metrics.duplicatesFound++;
        this.metrics.redisHits++;
        return {
          isDuplicate: true,
          eventId,
          source: 'redis',
          checkTimeMs: Date.now() - startTime,
        };
      }

      // 2. Redis 未命中，查 MySQL（冷路径）
      const db = await getDb();
      if (db) {
        const dbResult = await db.select()
          .from(processedEvents)
          .where(eq(processedEvents.eventId, eventId))
          .limit(1);

        if (dbResult.length > 0) {
          // 回填 Redis
          await redisClient.set(redisKey, '1', this.DEFAULT_TTL_SECONDS);

          this.metrics.duplicatesFound++;
          this.metrics.mysqlHits++;
          return {
            isDuplicate: true,
            eventId,
            source: 'mysql',
            checkTimeMs: Date.now() - startTime,
          };
        }
      }

      return {
        isDuplicate: false,
        eventId,
        source: 'none',
        checkTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      log.warn(`[Deduplication] Check failed for ${eventId}:`, error);
      // 出错时保守处理，认为不重复
      return {
        isDuplicate: false,
        eventId,
        source: 'none',
        checkTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 标记事件已处理
   */
  async markProcessed(
    eventId: string,
    eventType: string,
    consumerGroup: string,
    metadata?: {
      partition?: number;
      offset?: string;
      processingTimeMs?: number;
    }
  ): Promise<void> {
    const redisKey = `${this.REDIS_KEY_PREFIX}${consumerGroup}:${eventId}`;

    // 1. 写入 Redis（立即生效）
    await redisClient.set(redisKey, '1', this.DEFAULT_TTL_SECONDS);

    // 2. 加入刷盘队列（异步持久化）
    this.flushQueue.push({
      eventId,
      eventType,
      consumerGroup,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + this.DEFAULT_TTL_SECONDS * 1000),
      metadata,
    });
  }

  /**
   * 幂等性检查和执行
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operationType: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 3600
  ): Promise<IdempotencyResult<T>> {
    const redisKey = `${this.IDEMPOTENT_KEY_PREFIX}${idempotencyKey}`;

    // 1. 检查 Redis
    const cached = await redisClient.get(redisKey);
    if (cached) {
      try {
        const result = JSON.parse(cached as string);
        return { isNew: false, result, key: idempotencyKey };
      } catch {
        // 解析失败，重新执行
      }
    }

    // 2. 检查 MySQL
    const db = await getDb();
    if (db) {
      const existing = await db.select()
        .from(idempotentRecords)
        .where(eq(idempotentRecords.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing.length > 0 && existing[0].status === 'completed') {
        const result = existing[0].response as T;
        // 回填 Redis
        await redisClient.set(redisKey, JSON.stringify(result), ttlSeconds);
        return { isNew: false, result, key: idempotencyKey };
      }
    }

    // 3. 执行操作
    try {
      // 标记为处理中
      if (db) {
        await db.insert(idempotentRecords).values({
          idempotencyKey,
          operationType,
          status: 'processing',
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        }).onDuplicateKeyUpdate({
          set: { status: 'processing', updatedAt: new Date() },
        });
      }

      const result = await fn();

      // 标记为完成
      if (db) {
        await db.update(idempotentRecords)
          .set({
            status: 'completed',
            response: result as Record<string, unknown>,
          })
          .where(eq(idempotentRecords.idempotencyKey, idempotencyKey));
      }

      // 缓存到 Redis
      await redisClient.set(redisKey, JSON.stringify(result), ttlSeconds);

      return { isNew: true, result, key: idempotencyKey };
    } catch (error) {
      // 标记为失败
      if (db) {
        await db.update(idempotentRecords)
          .set({ status: 'failed' })
          .where(eq(idempotentRecords.idempotencyKey, idempotencyKey));
      }
      throw error;
    }
  }

  /**
   * 启动异步刷盘定时器
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.flushQueue.length > 0) {
        await this.flushToDatabase();
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * 刷盘到数据库
   */
  private async flushToDatabase(): Promise<void> {
    if (this.flushQueue.length === 0) return;

    const db = await getDb();
    if (!db) return;

    // 取出一批数据
    const batch = this.flushQueue.splice(0, this.FLUSH_BATCH_SIZE);

    try {
      for (const item of batch) {
        await db.insert(processedEvents).values({
          eventId: item.eventId,
          eventType: item.eventType,
          consumerGroup: item.consumerGroup,
          processedAt: item.processedAt,
          expiresAt: item.expiresAt,
          metadata: item.metadata,
        }).onDuplicateKeyUpdate({
          set: { createdAt: new Date() },
        });
      }

      this.metrics.flushedToDb += batch.length;
    } catch (error) {
      log.warn(`[Deduplication] Flush failed for ${batch.length} items:`, error);
      this.metrics.flushErrors++;
      // 放回队列
      this.flushQueue.unshift(...batch);
    }
  }

  /**
   * 启动过期清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpired();
    }, 3600000); // 每小时清理一次
  }

  /**
   * 清理过期记录
   */
  private async cleanupExpired(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const now = new Date();

      // 清理过期的处理记录
      await db.delete(processedEvents)
        .where(lt(processedEvents.expiresAt, now));

      // 清理过期的幂等记录
      await db.delete(idempotentRecords)
        .where(lt(idempotentRecords.expiresAt, now));

      log.debug('[Deduplication] Cleaned up expired records');
    } catch (error) {
      log.warn('[Deduplication] Cleanup failed:', error);
    }
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      pendingFlush: this.flushQueue.length,
      hitRate: this.metrics.totalChecks > 0
        ? ((this.metrics.duplicatesFound / this.metrics.totalChecks) * 100).toFixed(2) + '%'
        : '0%',
    };
  }
}

// 导出单例
export const deduplicationService = new DeduplicationService();
