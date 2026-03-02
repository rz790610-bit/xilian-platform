/**
 * AlertEventSubscriber 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlertEventSubscriber } from '../alert-event-subscriber.service';

// Mock eventBus
const mockSubscribe = vi.fn().mockReturnValue(() => {});
const mockUnsubscribe = vi.fn();

vi.mock('../eventBus.service', () => ({
  eventBus: {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
  TOPICS: {
    ANOMALY_DETECTED: 'anomaly.detected',
    SYSTEM_ALERT: 'system.alert',
    DEVICE_ERROR: 'device.error',
    SENSOR_ERROR: 'sensor.error',
    DIAGNOSIS_COMPLETED: 'diagnosis.completed',
  },
}));

// Mock DB — 返回空规则列表（避免真实 DB 连接）
vi.mock('../../lib/db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe('AlertEventSubscriber', () => {
  let subscriber: AlertEventSubscriber;

  beforeEach(async () => {
    mockSubscribe.mockClear();
    subscriber = new AlertEventSubscriber();
    await subscriber.start();
  });

  afterEach(async () => {
    await subscriber.stop();
  });

  // ============================================================
  // 生命周期
  // ============================================================

  it('启动时订阅 5 个事件主题', () => {
    expect(mockSubscribe).toHaveBeenCalledTimes(5);
    const topics = mockSubscribe.mock.calls.map((c: unknown[]) => c[0]);
    expect(topics).toContain('anomaly.detected');
    expect(topics).toContain('system.alert');
    expect(topics).toContain('device.error');
    expect(topics).toContain('sensor.error');
    expect(topics).toContain('diagnosis.completed');
  });

  it('启动后 isRunning 为 true', () => {
    const stats = subscriber.getStats();
    expect(stats.isRunning).toBe(true);
  });

  it('停止后 isRunning 为 false', async () => {
    await subscriber.stop();
    const stats = subscriber.getStats();
    expect(stats.isRunning).toBe(false);
  });

  it('重复启动不会多次订阅', async () => {
    mockSubscribe.mockClear();
    await subscriber.start(); // 已经在 beforeEach 中启动了
    expect(mockSubscribe).toHaveBeenCalledTimes(0);
  });

  // ============================================================
  // 查询接口
  // ============================================================

  it('getDeviceAlertSummary 返回默认空结果', async () => {
    const summary = await subscriber.getDeviceAlertSummary('CRANE-001');
    expect(summary.recentAlerts).toBe(0);
    expect(summary.activeFaults).toEqual([]);
  });

  it('queryAlertRecords 返回默认空结果', async () => {
    const result = await subscriber.queryAlertRecords({});
    expect(result.totalAlerts).toBe(0);
    expect(result.bySeverity).toHaveProperty('info');
    expect(result.bySeverity).toHaveProperty('warning');
    expect(result.bySeverity).toHaveProperty('error');
    expect(result.bySeverity).toHaveProperty('critical');
    expect(result.recentAlerts).toEqual([]);
  });

  it('queryAlertRecords 支持过滤参数', async () => {
    const result = await subscriber.queryAlertRecords({
      deviceCode: 'CRANE-001',
      severity: 'critical',
      startTime: new Date('2026-01-01'),
      limit: 10,
    });
    expect(result.totalAlerts).toBe(0);
    expect(result.recentAlerts).toHaveLength(0);
  });

  // ============================================================
  // 健康检查
  // ============================================================

  it('健康检查返回正确状态', async () => {
    const health = await subscriber.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.details).toHaveProperty('running');
    expect(health.details).toHaveProperty('eventsReceived');
    expect(health.details).toHaveProperty('alertsFired');
  });

  it('停止后健康检查返回不健康', async () => {
    await subscriber.stop();
    const health = await subscriber.healthCheck();
    expect(health.healthy).toBe(false);
  });

  // ============================================================
  // 统计
  // ============================================================

  it('getStats 返回完整统计', () => {
    const stats = subscriber.getStats();
    expect(stats).toHaveProperty('eventsReceived');
    expect(stats).toHaveProperty('alertsFired');
    expect(stats).toHaveProperty('alertsSuppressed');
    expect(stats).toHaveProperty('notificationsSent');
    expect(stats).toHaveProperty('errors');
    expect(stats).toHaveProperty('isRunning');
    expect(stats).toHaveProperty('bufferSize');
    expect(stats).toHaveProperty('cooldownEntries');
    expect(stats.isRunning).toBe(true);
    expect(stats.eventsReceived).toBe(0);
    expect(stats.bufferSize).toBe(0);
  });
});
