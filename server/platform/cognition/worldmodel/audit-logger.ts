/**
 * ============================================================================
 * 审计日志 — Phase 3 §8.2
 * ============================================================================
 *
 * 所有 mutation 操作记录到 audit_logs 表：
 *   - userId, action, resourceType, resourceId, payload, timestamp
 *
 * 使用方式：
 *   await auditLogger.log({
 *     userId: ctx.userId ?? 'system',
 *     action: 'simulation.create',
 *     resourceType: 'simulation_scenario',
 *     resourceId: String(scenarioId),
 *     payload: { name, machineId, ... },
 *   });
 */

import { getDb } from '../../../lib/db';
import { createModuleLogger } from '../../../core/logger';

const logger = createModuleLogger('audit-logger');

export interface AuditEntry {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

class AuditLogger {
  private static instance: AuditLogger;
  private buffer: Array<AuditEntry & { timestamp: Date }> = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private maxBufferSize = 50;

  private constructor() {
    // 每 5 秒批量写入
    this.flushInterval = setInterval(() => this.flush(), 5000);
    logger.info('审计日志已初始化');
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * 记录审计日志
   */
  async log(entry: AuditEntry): Promise<void> {
    const record = { ...entry, timestamp: new Date() };
    this.buffer.push(record);

    logger.debug(`[AUDIT] ${entry.action} on ${entry.resourceType}/${entry.resourceId} by ${entry.userId}`);

    // 缓冲区满时立即刷新
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * 批量写入审计日志到数据库
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const db = await getDb();
      if (!db) {
        logger.warn(`审计日志写入失败：数据库不可用，${entries.length} 条记录丢失`);
        return;
      }

      // 使用原始 SQL 插入（audit_logs 表可能不在 Drizzle schema 中）
      for (const entry of entries) {
        try {
          await (db as any).execute(
            `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, payload, created_at)
             VALUES ('${entry.userId.replace(/'/g, "''")}', '${entry.action.replace(/'/g, "''")}', '${entry.resourceType.replace(/'/g, "''")}', '${entry.resourceId.replace(/'/g, "''")}', ${entry.payload ? `'${JSON.stringify(entry.payload).replace(/'/g, "''")}'` : 'NULL'}, NOW(3))`
          );
        } catch (insertErr) {
          // 如果 audit_logs 表不存在，尝试创建
          try {
            await (db as any).execute(
              `CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(128) NOT NULL,
                action VARCHAR(128) NOT NULL,
                resource_type VARCHAR(64) NOT NULL,
                resource_id VARCHAR(128) NOT NULL,
                payload JSON,
                created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                INDEX idx_audit_user (user_id),
                INDEX idx_audit_action (action),
                INDEX idx_audit_resource (resource_type, resource_id),
                INDEX idx_audit_time (created_at)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
            );
            // 重试插入
            await (db as any).execute(
              `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, payload, created_at)
               VALUES ('${entry.userId.replace(/'/g, "''")}', '${entry.action.replace(/'/g, "''")}', '${entry.resourceType.replace(/'/g, "''")}', '${entry.resourceId.replace(/'/g, "''")}', ${entry.payload ? `'${JSON.stringify(entry.payload).replace(/'/g, "''")}'` : 'NULL'}, NOW(3))`
            );
          } catch (createErr) {
            logger.warn('审计日志表创建/写入失败（将重试）:', createErr);
          }
        }
      }

      logger.debug(`审计日志已写入 ${entries.length} 条记录`);
    } catch (err) {
      logger.warn('审计日志批量写入失败（已放回缓冲区重试）:', err);
      // 将失败的记录放回缓冲区
      this.buffer.unshift(...entries);
    }
  }

  /**
   * 关闭审计日志（优雅停机时调用）
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
    logger.info('审计日志已关闭');
  }
}

export const auditLogger = AuditLogger.getInstance();
