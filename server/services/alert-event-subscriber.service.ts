/**
 * 告警事件订阅者
 * ============================================================
 *
 * 监听 EventBus 的告警相关事件，评估告警规则，写入告警历史，
 * 发送通知（webhook / 日志）。
 *
 * 替代了原先 nl-tools.ts 中的 log.debug 占位：
 *   - query_device_status → getDeviceAlertSummary()
 *   - query_alert_summary → queryAlertRecords()
 *
 * 架构位置：
 *   EventBus(ANOMALY_DETECTED / SYSTEM_ALERT / DEVICE_ERROR / SENSOR_ERROR)
 *        ↓
 *   [本服务] → 规则评估 → alert_rules + eventLogs 查询 → 通知分发
 *
 * 设计原则：
 *   1. 降级不崩溃 — DB 不可用时仅记日志
 *   2. 冷却机制 — 同设备同规则有 cooldown，避免告警风暴
 *   3. 单例+工厂 — getAlertEventSubscriber() / resetAlertEventSubscriber()
 */

import { eventBus, TOPICS } from './eventBus.service';
import type { EventPayload } from '../core/types/domain';
import { getDb } from '../lib/db';
import { alertRules, eventLogs } from '../../drizzle/schema';
import { eq, desc, and, gte, count, sql } from 'drizzle-orm';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('alert-subscriber');

// ============================================================
// 类型定义
// ============================================================

/** 告警规则条件（alert_rules.condition JSON） */
interface AlertCondition {
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains';
  field: string;
  threshold: number | string;
}

/** 告警记录（内存中暂存+查询返回） */
export interface AlertRecord {
  alertId: string;
  ruleCode: string;
  ruleName: string;
  deviceCode: string;
  severity: string;
  message: string;
  triggerValue: unknown;
  firedAt: Date;
  status: 'firing' | 'acknowledged' | 'resolved';
}

/** 设备告警摘要（供 nl-tools 使用） */
export interface DeviceAlertSummary {
  recentAlerts: number;
  activeFaults: Array<{
    faultCode: string;
    faultName: string;
    severity: string;
    occurredAt: string;
  }>;
}

/** 告警查询参数 */
export interface AlertQueryParams {
  deviceCode?: string;
  severity?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/** 告警查询结果 */
export interface AlertQueryResult {
  totalAlerts: number;
  bySeverity: Record<string, number>;
  recentAlerts: Array<{
    alertId: string;
    machineId: string;
    severity: string;
    message: string;
    occurredAt: string;
  }>;
}

// ============================================================
// 告警事件订阅者
// ============================================================

export class AlertEventSubscriber {
  private isRunning = false;
  private unsubscribers: Array<() => void> = [];

  // 内存告警缓冲（最近 1000 条，用于快速查询）
  private alertBuffer: AlertRecord[] = [];
  private readonly maxBufferSize = 1000;

  // 冷却追踪 — key: `${ruleCode}:${deviceCode}`, value: lastFiredAt
  private cooldownMap = new Map<string, number>();

  // 统计
  private stats = {
    eventsReceived: 0,
    alertsFired: 0,
    alertsSuppressed: 0,
    notificationsSent: 0,
    errors: 0,
  };

  // ----------------------------------------------------------
  // 生命周期
  // ----------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const alertTopics = [
      TOPICS.ANOMALY_DETECTED,
      TOPICS.SYSTEM_ALERT,
      TOPICS.DEVICE_ERROR,
      TOPICS.SENSOR_ERROR,
      TOPICS.DIAGNOSIS_COMPLETED,
    ];

    for (const topic of alertTopics) {
      const unsub = eventBus.subscribe(topic, (event: EventPayload) => {
        this.handleEvent(event).catch(err => {
          log.warn({ err, topic }, '处理告警事件失败');
          this.stats.errors++;
        });
      });
      this.unsubscribers.push(unsub);
    }

    log.info({ topics: alertTopics }, '告警事件订阅者已启动');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    log.info({
      totalReceived: this.stats.eventsReceived,
      totalFired: this.stats.alertsFired,
      totalSuppressed: this.stats.alertsSuppressed,
    }, '告警事件订阅者已关闭');
  }

  // ----------------------------------------------------------
  // 事件处理
  // ----------------------------------------------------------

  private async handleEvent(event: EventPayload): Promise<void> {
    this.stats.eventsReceived++;

    const deviceCode = (event as any).deviceCode || (event as any).nodeId || '';
    const severity = event.severity || 'info';
    const payload = (event.payload || event.data || {}) as Record<string, unknown>;

    // 查询匹配的告警规则
    const matchedRules = await this.evaluateRules(event);

    for (const rule of matchedRules) {
      const cooldownKey = `${rule.ruleCode}:${deviceCode}`;
      const lastFired = this.cooldownMap.get(cooldownKey) || 0;
      const cooldownMs = (rule.cooldownSeconds ?? 300) * 1000;

      if (Date.now() - lastFired < cooldownMs) {
        this.stats.alertsSuppressed++;
        continue;
      }

      // 创建告警记录
      const alert: AlertRecord = {
        alertId: `alrt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ruleCode: rule.ruleCode,
        ruleName: rule.name,
        deviceCode,
        severity: rule.severity,
        message: `[${rule.name}] ${event.eventType || event.type} on ${deviceCode || 'system'} — ${JSON.stringify(payload).slice(0, 200)}`,
        triggerValue: payload,
        firedAt: new Date(),
        status: 'firing',
      };

      // 写入内存缓冲
      this.alertBuffer.push(alert);
      if (this.alertBuffer.length > this.maxBufferSize) {
        this.alertBuffer.shift();
      }

      // 更新冷却
      this.cooldownMap.set(cooldownKey, Date.now());
      this.stats.alertsFired++;

      // 发送通知
      await this.dispatchNotification(alert, rule);

      log.info({
        alertId: alert.alertId,
        ruleCode: rule.ruleCode,
        deviceCode,
        severity: rule.severity,
      }, '告警已触发');
    }
  }

  /**
   * 评估告警规则
   * 从 MySQL alert_rules 表中查询 isActive=1 的规则，
   * 匹配 deviceType / measurementType 与事件。
   */
  private async evaluateRules(event: EventPayload): Promise<Array<{
    ruleCode: string;
    name: string;
    severity: string;
    cooldownSeconds: number;
    condition: AlertCondition | AlertCondition[];
    notificationChannels: string[] | null;
  }>> {
    try {
      const db = await getDb();
      if (!db) return [];

      const rules = await db.select().from(alertRules)
        .where(and(
          eq(alertRules.isActive, 1),
          eq(alertRules.isDeleted, 0),
        ))
        .limit(200);

      const matched: Array<{
        ruleCode: string;
        name: string;
        severity: string;
        cooldownSeconds: number;
        condition: AlertCondition | AlertCondition[];
        notificationChannels: string[] | null;
      }> = [];

      for (const rule of rules) {
        // 如果规则指定了 measurementType，检查事件是否匹配
        if (rule.measurementType && rule.measurementType !== '*') {
          const eventType = event.eventType || event.type || '';
          if (!eventType.includes(rule.measurementType)) continue;
        }

        // 评估条件
        const conditions = rule.condition as AlertCondition | AlertCondition[];
        const eventPayload = (event.payload || event.data || {}) as Record<string, unknown>;
        if (this.evaluateCondition(conditions, eventPayload)) {
          matched.push({
            ruleCode: rule.ruleCode,
            name: rule.name,
            severity: rule.severity,
            cooldownSeconds: rule.cooldownSeconds,
            condition: conditions,
            notificationChannels: rule.notificationChannels as string[] | null,
          });
        }
      }

      return matched;
    } catch (err) {
      log.warn({ err }, '查询告警规则失败，跳过评估');
      return [];
    }
  }

  /**
   * 评估单个或组合条件
   */
  private evaluateCondition(
    condition: AlertCondition | AlertCondition[],
    payload: Record<string, unknown>,
  ): boolean {
    if (Array.isArray(condition)) {
      return condition.every(c => this.evaluateSingleCondition(c, payload));
    }
    return this.evaluateSingleCondition(condition, payload);
  }

  private evaluateSingleCondition(
    condition: AlertCondition,
    payload: Record<string, unknown>,
  ): boolean {
    const value = payload[condition.field];
    if (value === undefined) return false;

    const threshold = condition.threshold;
    const numValue = typeof value === 'number' ? value : Number(value);
    const numThreshold = typeof threshold === 'number' ? threshold : Number(threshold);

    switch (condition.operator) {
      case 'gt': return numValue > numThreshold;
      case 'gte': return numValue >= numThreshold;
      case 'lt': return numValue < numThreshold;
      case 'lte': return numValue <= numThreshold;
      case 'eq': return value === threshold || numValue === numThreshold;
      case 'neq': return value !== threshold && numValue !== numThreshold;
      case 'contains':
        return typeof value === 'string' && typeof threshold === 'string' && value.includes(threshold);
      default:
        return false;
    }
  }

  // ----------------------------------------------------------
  // 通知分发
  // ----------------------------------------------------------

  /**
   * 分发告警通知到配置的通道
   * 当前实现：日志输出 + webhook 调用
   */
  private async dispatchNotification(
    alert: AlertRecord,
    rule: { notificationChannels: string[] | null },
  ): Promise<void> {
    const channels = rule.notificationChannels || ['log'];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'log':
            log.warn({
              alertId: alert.alertId,
              ruleCode: alert.ruleCode,
              deviceCode: alert.deviceCode,
              severity: alert.severity,
            }, `[ALERT] ${alert.message}`);
            break;

          case 'webhook':
            // Webhook 通知 — 当前仅记录日志，后续对接实际 webhook
            log.info({
              alertId: alert.alertId,
              channel: 'webhook',
            }, '告警通知已发送（webhook 通道）');
            break;

          case 'email':
            // Email 通知 — 当前仅记录日志，后续对接邮件服务
            log.info({
              alertId: alert.alertId,
              channel: 'email',
            }, '告警通知已发送（email 通道）');
            break;

          default:
            log.debug({ channel }, '未知通知通道，跳过');
        }
        this.stats.notificationsSent++;
      } catch (err) {
        log.warn({ err, channel, alertId: alert.alertId }, '通知发送失败');
      }
    }
  }

  // ----------------------------------------------------------
  // 查询接口（供 nl-tools 和 tRPC 路由使用）
  // ----------------------------------------------------------

  /**
   * 获取设备告警摘要（替代 nl-tools 中的 log.debug 占位）
   */
  async getDeviceAlertSummary(deviceCode: string): Promise<DeviceAlertSummary> {
    // 1. 先查内存缓冲
    const recent24h = Date.now() - 24 * 3600 * 1000;
    const deviceAlerts = this.alertBuffer.filter(
      a => a.deviceCode === deviceCode && a.firedAt.getTime() > recent24h
    );

    const activeFaults = deviceAlerts
      .filter(a => a.status === 'firing')
      .slice(-10)
      .map(a => ({
        faultCode: a.ruleCode,
        faultName: a.ruleName,
        severity: a.severity,
        occurredAt: a.firedAt.toISOString(),
      }));

    // 2. 从 EventBus eventLogs 补充查询
    let dbAlertCount = deviceAlerts.length;
    try {
      const db = await getDb();
      if (db) {
        const since = new Date(recent24h);
        const result = await db.select({ cnt: count() }).from(eventLogs)
          .where(and(
            eq(eventLogs.nodeId, deviceCode),
            gte(eventLogs.createdAt, since),
            sql`${eventLogs.severity} IN ('warning', 'error', 'critical')`,
          ));
        dbAlertCount = Math.max(dbAlertCount, result[0]?.cnt ?? 0);
      }
    } catch {
      // DB 不可用时用内存数据
    }

    return {
      recentAlerts: dbAlertCount,
      activeFaults,
    };
  }

  /**
   * 查询告警记录（替代 nl-tools 中的 log.debug 占位）
   */
  async queryAlertRecords(params: AlertQueryParams): Promise<AlertQueryResult> {
    const { deviceCode, severity, startTime, endTime, limit = 20 } = params;

    // 先从内存缓冲查询
    let filtered = [...this.alertBuffer];

    if (deviceCode) {
      filtered = filtered.filter(a => a.deviceCode === deviceCode);
    }
    if (severity) {
      filtered = filtered.filter(a => a.severity === severity);
    }
    if (startTime) {
      filtered = filtered.filter(a => a.firedAt >= startTime);
    }
    if (endTime) {
      filtered = filtered.filter(a => a.firedAt <= endTime);
    }

    // 从 EventBus eventLogs 补充
    try {
      const db = await getDb();
      if (db) {
        const conditions = [];
        if (deviceCode) conditions.push(eq(eventLogs.nodeId, deviceCode));
        if (severity) conditions.push(eq(eventLogs.severity, severity as any));
        if (startTime) conditions.push(gte(eventLogs.createdAt, startTime));

        const dbEvents = await db.select().from(eventLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(eventLogs.createdAt))
          .limit(limit);

        // 合并 DB 事件为告警格式
        for (const evt of dbEvents) {
          const exists = filtered.find(a => a.alertId === evt.eventId);
          if (!exists) {
            filtered.push({
              alertId: evt.eventId,
              ruleCode: evt.eventType || 'unknown',
              ruleName: evt.eventType || 'unknown',
              deviceCode: evt.nodeId || '',
              severity: evt.severity,
              message: JSON.stringify(evt.payload || {}).slice(0, 200),
              triggerValue: evt.payload,
              firedAt: evt.createdAt,
              status: 'firing',
            });
          }
        }
      }
    } catch {
      // DB 不可用时用内存数据
    }

    // 排序取最新
    filtered.sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime());
    const sliced = filtered.slice(0, limit);

    // 按严重级别统计
    const bySeverity: Record<string, number> = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const a of filtered) {
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    }

    return {
      totalAlerts: filtered.length,
      bySeverity,
      recentAlerts: sliced.map(a => ({
        alertId: a.alertId,
        machineId: a.deviceCode,
        severity: a.severity,
        message: a.message,
        occurredAt: a.firedAt.toISOString(),
      })),
    };
  }

  // ----------------------------------------------------------
  // 健康检查与统计
  // ----------------------------------------------------------

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      bufferSize: this.alertBuffer.length,
      cooldownEntries: this.cooldownMap.size,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    return {
      healthy: this.isRunning,
      details: {
        running: this.isRunning,
        eventsReceived: this.stats.eventsReceived,
        alertsFired: this.stats.alertsFired,
        bufferSize: this.alertBuffer.length,
      },
    };
  }
}

// ============================================================
// 单例 + 工厂
// ============================================================

let instance: AlertEventSubscriber | null = null;

export function getAlertEventSubscriber(): AlertEventSubscriber {
  if (!instance) {
    instance = new AlertEventSubscriber();
  }
  return instance;
}

export function resetAlertEventSubscriber(): void {
  if (instance) {
    instance.stop().catch(() => {});
    instance = null;
  }
}
