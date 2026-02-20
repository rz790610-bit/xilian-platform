/**
 * 审计日志 tRPC Middleware
 * 
 * 功能：
 * - 拦截所有 mutation 操作，记录操作审计日志
 * - 写入 MySQL audit_logs 表（真实持久化，非 console.log）
 * - 异步写入，不阻塞主请求
 * - 集成 OpenTelemetry traceId
 * - 敏感操作自动标记并写入 audit_logs_sensitive
 * 
 * 配置：
 * - AUDIT_LOG_ENABLED=true  启用审计日志（默认 true）
 * - AUDIT_LOG_QUERIES=false  是否记录 query 操作（默认 false，只记录 mutation）
 * - AUDIT_LOG_SENSITIVE_KEYWORDS  敏感操作关键词（逗号分隔）
 */

import { getDb } from '../../lib/db';
import { auditLogs, auditLogsSensitive } from '../../../drizzle/schema';
import type { InsertAuditLog, InsertAuditLogsSensitive } from '../../../drizzle/schema';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('auditLog');

// ============================================================
// 配置
// ============================================================

interface AuditConfig {
  /** 是否启用审计日志 */
  enabled: boolean;
  /** 是否记录 query 操作 */
  logQueries: boolean;
  /** 敏感操作关键词（路径中包含这些词时标记为敏感） */
  sensitiveKeywords: string[];
  /** 高风险操作关键词（需要审批） */
  highRiskKeywords: string[];
  /** 排除的路径（不记录审计日志） */
  excludePaths: string[];
  /** 异步写入队列大小 */
  queueSize: number;
  /** 批量写入间隔（ms） */
  flushInterval: number;
}

function loadConfig(): AuditConfig {
  return {
    enabled: process.env.AUDIT_LOG_ENABLED !== 'false',
    logQueries: process.env.AUDIT_LOG_QUERIES === 'true',
    sensitiveKeywords: (process.env.AUDIT_LOG_SENSITIVE_KEYWORDS || 
      'password,secret,token,key,credential,permission,role,admin,delete,remove,drop,truncate').split(','),
    highRiskKeywords: (process.env.AUDIT_LOG_HIGH_RISK_KEYWORDS ||
      'delete,remove,drop,truncate,admin.update,permission.grant').split(','),
    excludePaths: (process.env.AUDIT_LOG_EXCLUDE_PATHS ||
      'auth.me,system.health,system.status').split(','),
    queueSize: parseInt(process.env.AUDIT_LOG_QUEUE_SIZE || '1000'),
    flushInterval: parseInt(process.env.AUDIT_LOG_FLUSH_INTERVAL || '2000'),
  };
}

const config = loadConfig();

// ============================================================
// 异步写入队列 — 不阻塞主请求
// ============================================================

interface AuditEntry {
  log: InsertAuditLog;
  sensitive?: Omit<InsertAuditLogsSensitive, 'auditLogId'>;
}

class AuditLogQueue {
  private queue: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(private maxSize: number, private flushIntervalMs: number) {
    this.startFlushTimer();
  }

  push(entry: AuditEntry): void {
    if (this.queue.length >= this.maxSize) {
      // 队列满时丢弃最旧的 10%
      const dropCount = Math.floor(this.maxSize * 0.1);
      this.queue.splice(0, dropCount);
      log.warn(`Audit log queue full, dropped ${dropCount} oldest entries`);
    }
    this.queue.push(entry);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        log.error('Audit log flush failed:', err);
      });
    }, this.flushIntervalMs);

    // 允许进程正常退出
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    // 取出当前队列中的所有条目
    const batch = this.queue.splice(0);

    try {
      const db = await getDb();
      if (!db) {
        log.warn(`Audit log flush skipped: no database connection (${batch.length} entries lost)`);
        return;
      }

      // 分离普通日志和敏感日志
      const normalLogs = batch.map(e => e.log);
      const sensitiveEntries = batch.filter(e => e.sensitive);

      // 批量插入审计日志
      if (normalLogs.length > 0) {
        // 分批插入，每批最多 100 条
        for (let i = 0; i < normalLogs.length; i += 100) {
          const chunk = normalLogs.slice(i, i + 100);
          try {
            await db.insert(auditLogs).values(chunk);
          } catch (err) {
            log.error(`Failed to insert audit logs batch (${chunk.length} entries): ${String(err)}`);
          }
        }
      }

      // P1-2 + P2-9: 敏感日志关联
      // 原始问题: 通过 traceId 匹配 auditLogId 存在竞态窗口（批量 insert 后 SELECT 可能匹配到其他并发 flush 的记录）
      // P2-9 修复: 在同一批次 insert 后立即查询，缩小竞态窗口。
      // 理想方案是使用 insert().returning('id')，但 MySQL/Drizzle 不支持 returning，
      // 因此采用 traceId + recordedAt 双条件精确匹配代替。
      if (sensitiveEntries.length > 0) {
        try {
          const traceIds = sensitiveEntries
            .map(e => e.log.traceId)
            .filter((t): t is string => !!t);

          if (traceIds.length > 0) {
            const { inArray, and: andFn, gte: gteFn } = await import('drizzle-orm');
            // P2-9: 添加时间约束缩小竞态窗口 — 只匹配近 30 秒内的记录
            const recentThreshold = new Date(Date.now() - 30_000);
            const matchedLogs = await db.select({ id: auditLogs.id, traceId: auditLogs.traceId })
              .from(auditLogs)
              .where(andFn(
                inArray(auditLogs.traceId, traceIds),
                gteFn(auditLogs.createdAt, recentThreshold),
              ));

            const traceToId = new Map(matchedLogs.map(r => [r.traceId, r.id]));

            const sensitiveValues: InsertAuditLogsSensitive[] = [];
            for (const entry of sensitiveEntries) {
              if (entry.log.traceId && entry.sensitive) {
                const auditLogId = traceToId.get(entry.log.traceId);
                if (auditLogId) {
                  sensitiveValues.push({
                    auditLogId,
                    ...entry.sensitive,
                  } as InsertAuditLogsSensitive);
                } else {
                  log.warn(`Sensitive log orphaned: traceId=${entry.log.traceId} not found in audit_logs (race condition?)`);
                }
              }
            }

            // 批量插入敏感日志
            if (sensitiveValues.length > 0) {
              for (let i = 0; i < sensitiveValues.length; i += 100) {
                await db.insert(auditLogsSensitive).values(sensitiveValues.slice(i, i + 100));
              }
            }
          }
        } catch (err) {
          log.error(`Failed to insert sensitive audit logs (${sensitiveEntries.length} entries): ${String(err)}`);
        }
      }

      log.debug(`Flushed ${batch.length} audit log entries (${sensitiveEntries.length} sensitive)`);
    } catch (err) {
      log.error(`Audit log flush error (${batch.length} entries): ${String(err)}`);
    } finally {
      this.flushing = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

// 全局队列实例
const auditQueue = new AuditLogQueue(config.queueSize, config.flushInterval);

// ============================================================
// 工具函数
// ============================================================

/**
 * 从 OTel context 获取当前 traceId
 */
function getCurrentTraceId(): string | null {
  try {
    // 动态导入避免 OTel 未初始化时报错
    const { trace, context } = require('@opentelemetry/api');
    const span = trace.getSpan(context.active());
    if (span) {
      return span.spanContext().traceId;
    }
  } catch {
    // OTel 未安装或未初始化
  }
  return null;
}

/**
 * 从请求中提取客户端 IP
 */
function getClientIp(req: any): string {
  if (!req) return 'unknown';
  return (
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * 从 tRPC 路径解析资源类型和操作
 */
function parseAction(path: string, type: string): { action: string; resourceType: string } {
  // path 格式: "module.submodule.method" 如 "database.asset.create"
  const parts = path.split('.');
  
  if (parts.length >= 2) {
    return {
      resourceType: parts.slice(0, -1).join('.'),
      action: parts[parts.length - 1],
    };
  }
  
  return {
    resourceType: path,
    action: type, // query 或 mutation
  };
}

/**
 * 检查路径是否为敏感操作
 */
function isSensitive(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return config.sensitiveKeywords.some(kw => lowerPath.includes(kw.toLowerCase()));
}

/**
 * 判断风险等级
 */
function getRiskLevel(path: string, type: string): string {
  const lowerPath = path.toLowerCase();
  
  if (config.highRiskKeywords.some(kw => lowerPath.includes(kw.toLowerCase()))) {
    return 'high';
  }
  if (type === 'mutation') {
    return 'medium';
  }
  return 'low';
}

/**
 * 安全序列化输入（截断大数据、脱敏）
 */
function sanitizeInput(input: unknown): unknown {
  if (input === undefined || input === null) return null;
  
  try {
    const str = JSON.stringify(input);
    
    // 截断超过 10KB 的数据
    if (str.length > 10240) {
      return { _truncated: true, _size: str.length, _preview: str.slice(0, 500) };
    }
    
    // 脱敏：替换可能的密码/token 字段
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) {
      const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'accessKey', 'secretKey'];
      for (const key of Object.keys(parsed)) {
        if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
          parsed[key] = '***REDACTED***';
        }
      }
      return parsed;
    }
    
    return input;
  } catch {
    return { _type: typeof input, _error: 'serialization_failed' };
  }
}

// ============================================================
// tRPC Middleware
// ============================================================

/**
 * 创建审计日志 tRPC middleware
 * 
 * 用法（在 trpc.ts 中）：
 * ```ts
 * import { createAuditLogMiddleware } from '../platform/middleware/auditLog';
 * 
 * export const auditedProcedure = protectedProcedure.use(createAuditLogMiddleware());
 * ```
 * 
 * 或者全局应用到所有 mutation：
 * ```ts
 * export const protectedProcedure = t.procedure.use(requireUser).use(createAuditLogMiddleware());
 * ```
 */
export function createAuditLogMiddleware() {
  return async function auditLogMiddleware(opts: {
    ctx: any;
    path: string;
    type: 'query' | 'mutation' | 'subscription';
    rawInput: unknown;
    next: (opts?: any) => Promise<any>;
  }) {
    const { ctx, path, type, rawInput, next } = opts;

    // 检查是否启用
    if (!config.enabled) return next();

    // 跳过排除的路径
    if (config.excludePaths.includes(path)) return next();

    // 默认只记录 mutation，除非配置了记录 query
    if (type === 'query' && !config.logQueries) return next();

    // 跳过 subscription
    if (type === 'subscription') return next();

    const startTime = Date.now();
    const traceId = getCurrentTraceId();
    const { action, resourceType } = parseAction(path, type);
    const clientIp = getClientIp(ctx.req);
    const operator = ctx.user?.name || ctx.user?.openId || 'anonymous';

    let result: string = 'success';
    let errorMessage: string | null = null;
    let response: any;

    try {
      response = await next();

      if (!response.ok) {
        result = 'error';
        errorMessage = response.error?.message || 'Unknown error';
      }

      return response;
    } catch (err: any) {
      result = 'error';
      errorMessage = err.message || 'Unknown exception';
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;

      // 构建审计日志条目
      const auditEntry: InsertAuditLog = {
        action,
        resourceType,
        resourceId: extractResourceId(rawInput),
        operator,
        operatorIp: clientIp,
        oldValue: null, // 需要业务层提供
        newValue: sanitizeInput(rawInput) as any,
        result,
        errorMessage,
        durationMs,
        traceId,
      };

      // 检查是否为敏感操作
      let sensitiveEntry: Omit<InsertAuditLogsSensitive, 'auditLogId'> | undefined;
      if (isSensitive(path)) {
        sensitiveEntry = {
          sensitiveType: action,
          sensitiveData: null,
          riskLevel: getRiskLevel(path, type),
          requiresApproval: getRiskLevel(path, type) === 'high' ? 1 : 0,
        };
      }

      // 异步写入队列（不阻塞响应）
      auditQueue.push({ log: auditEntry, sensitive: sensitiveEntry });
    }
  };
}

/**
 * 从输入中提取资源 ID
 */
function extractResourceId(input: unknown): string {
  if (!input || typeof input !== 'object') return '-';
  
  const obj = input as Record<string, unknown>;
  
  // 尝试常见的 ID 字段名
  for (const key of ['id', 'resourceId', 'deviceId', 'sensorId', 'taskId', 'collectionId', 'name']) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key]);
    }
  }
  
  return '-';
}

// ============================================================
// 导出
// ============================================================

/**
 * 手动刷新审计日志队列（用于优雅关闭）
 */
export async function flushAuditLogs(): Promise<void> {
  await auditQueue.flush();
}

/**
 * 关闭审计日志系统
 */
export async function shutdownAuditLog(): Promise<void> {
  await auditQueue.shutdown();
  log.info('Audit log system shut down');
}

/**
 * 手动写入审计日志（用于非 tRPC 场景，如 REST API、定时任务）
 */
export function writeAuditLog(entry: InsertAuditLog, sensitive?: Omit<InsertAuditLogsSensitive, 'auditLogId'>): void {
  if (!config.enabled) return;
  auditQueue.push({ log: entry, sensitive });
}
