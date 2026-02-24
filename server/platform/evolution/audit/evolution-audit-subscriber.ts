/**
 * ============================================================================
 * Evolution Audit Subscriber (P4)
 * ============================================================================
 *
 * EventBus 消费端 — 订阅所有进化引擎事件并持久化到 evolution_audit_logs 表。
 *
 * 解决的问题：
 *   - 之前 EventBus 只有发布端，事件发出去就"消失"了
 *   - 现在所有进化事件都会被捕获、分类、持久化
 *   - 支持事后审计、合规追溯、告警分析
 *
 * 订阅的事件前缀：
 *   - shadow.*          影子模式事件
 *   - canary.*          金丝雀部署事件
 *   - flywheel.*        飞轮周期事件
 *   - evolution.*       通用进化事件
 *   - intervention.*    干预事件
 *   - dojo.*            训练调度事件
 *   - fleet_planner.*   车队规划事件
 *   - ota.*             OTA 部署事件
 *
 * 写入策略：
 *   - 批量写入（每 100 条或每 5 秒刷新一次）
 *   - 写入失败时降级到日志输出
 *   - 自动清理 90 天前的审计日志
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import { evolutionAuditLogs } from '../../../../drizzle/evolution-schema';
import { lte } from 'drizzle-orm';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('evo-audit-subscriber');

// ============================================================================
// 配置
// ============================================================================

export interface AuditSubscriberConfig {
  /** 批量写入阈值 */
  batchSize: number;
  /** 刷新间隔 (ms) */
  flushIntervalMs: number;
  /** 审计日志保留天数 */
  retentionDays: number;
  /** 清理间隔 (ms) */
  cleanupIntervalMs: number;
  /** 是否启用 */
  enabled: boolean;
}

const DEFAULT_CONFIG: AuditSubscriberConfig = {
  batchSize: 100,
  flushIntervalMs: 5000,
  retentionDays: 90,
  cleanupIntervalMs: 24 * 3600000, // 每天清理一次
  enabled: true,
};

// ============================================================================
// 进化事件前缀列表
// ============================================================================

const EVOLUTION_EVENT_PREFIXES = [
  'shadow.',
  'canary.',
  'flywheel.',
  'evolution.',
  'intervention.',
  'dojo.',
  'fleet_planner.',
  'ota.',
  'simulation.',
  'labeling.',
  'model_merge.',
];

// ============================================================================
// 严重性映射
// ============================================================================

function mapSeverity(event: any): 'info' | 'warn' | 'error' | 'critical' {
  const type = (event.type || event.eventType || '').toLowerCase();

  // 严重事件
  if (type.includes('rollback') || type.includes('failed') || type.includes('error')) {
    return 'error';
  }
  // 告警事件
  if (type.includes('alert') || type.includes('degrading') || type.includes('unhealthy')) {
    return 'warn';
  }
  // 严重告警
  if (type.includes('critical') || type.includes('emergency')) {
    return 'critical';
  }
  // 默认信息
  return 'info';
}

// ============================================================================
// 审计订阅者
// ============================================================================

export class EvolutionAuditSubscriber {
  private config: AuditSubscriberConfig;
  private buffer: Array<{
    eventType: string;
    eventSource: string;
    eventData: Record<string, unknown>;
    sessionId: string | null;
    modelId: string | null;
    severity: 'info' | 'warn' | 'error' | 'critical';
  }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private isDestroyed = false;

  /** 统计 */
  private stats = {
    received: 0,
    persisted: 0,
    dropped: 0,
    flushCount: 0,
  };

  constructor(config: Partial<AuditSubscriberConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // 1. 初始化：订阅 EventBus + 启动定时器
  // ==========================================================================

  async initialize(eventBus: any): Promise<void> {
    if (!this.config.enabled) {
      log.info('审计订阅者已禁用');
      return;
    }

    // 订阅所有事件
    this.unsubscribe = eventBus.subscribeAll((event: any) => {
      this.handleEvent(event);
    });

    // 启动定期刷新
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => log.error('定期刷新失败', err));
    }, this.config.flushIntervalMs);

    // 启动定期清理
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(err => log.error('定期清理失败', err));
    }, this.config.cleanupIntervalMs);

    log.info(`审计订阅者已启动: 批量=${this.config.batchSize}, 刷新间隔=${this.config.flushIntervalMs}ms, 保留=${this.config.retentionDays}天`);
  }

  // ==========================================================================
  // 2. 事件处理：过滤 + 缓冲
  // ==========================================================================

  private handleEvent(event: any): void {
    const eventType = event.type || event.eventType || 'unknown';
    const eventSource = event.source || 'unknown';

    // 只处理进化引擎相关事件
    const isEvolutionEvent = EVOLUTION_EVENT_PREFIXES.some(prefix =>
      eventType.startsWith(prefix) || eventSource.startsWith(prefix),
    );

    if (!isEvolutionEvent) return;

    this.stats.received++;

    // 提取关键字段
    const data = event.data || event.payload || {};
    const sessionId = data.sessionId || data.deploymentId || data.cycleId || null;
    const modelId = data.modelId || data.challengerId || null;

    this.buffer.push({
      eventType,
      eventSource,
      eventData: {
        ...data,
        originalSeverity: event.severity,
        timestamp: event.timestamp || new Date().toISOString(),
      },
      sessionId,
      modelId,
      severity: mapSeverity(event),
    });

    // 达到批量阈值时立即刷新
    if (this.buffer.length >= this.config.batchSize) {
      this.flush().catch(err => log.error('批量刷新失败', err));
    }
  }

  // ==========================================================================
  // 3. 批量写入 DB
  // ==========================================================================

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isDestroyed) return;

    const batch = this.buffer.splice(0, this.config.batchSize);
    this.stats.flushCount++;

    const db = await getDb();
    if (!db) {
      // 降级：写入日志
      log.warn(`DB 不可用，${batch.length} 条审计日志降级到控制台`);
      for (const entry of batch) {
        log.info(`[AUDIT] ${entry.eventType} from ${entry.eventSource}: ${JSON.stringify(entry.eventData).slice(0, 200)}`);
      }
      this.stats.dropped += batch.length;
      return;
    }

    try {
      // 批量插入
      await db.insert(evolutionAuditLogs).values(
        batch.map(entry => ({
          eventType: entry.eventType,
          eventSource: entry.eventSource,
          eventData: entry.eventData,
          sessionId: entry.sessionId,
          modelId: entry.modelId,
          severity: entry.severity,
        })),
      );

      this.stats.persisted += batch.length;

      if (this.stats.flushCount % 100 === 0) {
        log.info(`审计统计: 接收=${this.stats.received}, 持久化=${this.stats.persisted}, 丢弃=${this.stats.dropped}`);
      }
    } catch (err) {
      log.error(`批量写入审计日志失败 (${batch.length} 条)`, err);

      // 高可靠模式：失败的 batch 放回 buffer 头部进行重试（最多重试 3 次）
      const MAX_RETRY = 3;
      const retryBatch = batch.map(entry => ({
        ...entry,
        _retryCount: ((entry as any)._retryCount ?? 0) + 1,
      }));
      const retriable = retryBatch.filter(e => (e as any)._retryCount <= MAX_RETRY);
      const exhausted = retryBatch.filter(e => (e as any)._retryCount > MAX_RETRY);

      if (retriable.length > 0) {
        this.buffer.unshift(...retriable);
        log.warn(`${retriable.length} 条审计日志将在下次 flush 时重试`);
      }

      // 超过重试次数的降级到日志
      if (exhausted.length > 0) {
        this.stats.dropped += exhausted.length;
        for (const entry of exhausted) {
          log.info(`[AUDIT-FALLBACK] ${entry.eventType}: ${JSON.stringify(entry.eventData).slice(0, 200)}`);
        }
      }
    }
  }

  // ==========================================================================
  // 4. 自动清理过期日志
  // ==========================================================================

  async cleanup(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const cutoff = new Date(Date.now() - this.config.retentionDays * 24 * 3600000);
      const result = await db.delete(evolutionAuditLogs)
        .where(lte(evolutionAuditLogs.createdAt, cutoff));

      log.info(`清理 ${this.config.retentionDays} 天前的审计日志完成`);
    } catch (err) {
      log.error('清理审计日志失败', err);
    }
  }

  // ==========================================================================
  // 5. 查询接口
  // ==========================================================================

  getStats() {
    return {
      ...this.stats,
      bufferSize: this.buffer.length,
      isActive: !this.isDestroyed,
    };
  }

  // ==========================================================================
  // 6. 销毁
  // ==========================================================================

  async destroy(): Promise<void> {
    this.isDestroyed = true;

    // 最后一次刷新
    await this.flush();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    log.info(`审计订阅者已销毁: 总接收=${this.stats.received}, 总持久化=${this.stats.persisted}`);
  }
}
