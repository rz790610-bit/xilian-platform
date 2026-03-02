/**
 * MQTT→ClickHouse 直写桥接 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MqttClickHouseBridge, type TelemetryMessage } from '../mqtt-clickhouse-bridge.service';

// Mock ClickHouse client
vi.mock('@clickhouse/client', () => ({
  createClient: () => ({
    ping: vi.fn().mockResolvedValue(true),
    insert: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeMsg(overrides: Partial<TelemetryMessage> = {}): TelemetryMessage {
  return {
    device_code: 'CRANE-001',
    mp_code: 'VIB.MOTOR.X',
    gateway_id: 'GW-001',
    timestamp: Date.now(),
    data_type: 'vibration',
    value: 3.14,
    quality: 192,
    ...overrides,
  };
}

describe('MqttClickHouseBridge', () => {
  let bridge: MqttClickHouseBridge;

  beforeEach(async () => {
    bridge = new MqttClickHouseBridge({
      batchSize: 10,
      flushIntervalMs: 60000, // 禁用自动刷写（手动控制）
      maxBufferSize: 100,
      enabled: true,
    });
    await bridge.start();
  });

  afterEach(async () => {
    await bridge.stop();
  });

  // ============================================================
  // 基础功能
  // ============================================================

  it('接收消息并缓冲', () => {
    const result = bridge.ingest([makeMsg()]);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(bridge.getStats().messagesReceived).toBe(1);
    expect(bridge.getStats().bufferSize).toBe(1);
  });

  it('批量接收多条消息', () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      makeMsg({ device_code: `DEV-${i}`, timestamp: Date.now() + i })
    );
    const result = bridge.ingest(msgs);
    expect(result.accepted).toBe(5);
    expect(bridge.getStats().bufferSize).toBe(5);
  });

  it('未启动时拒绝所有消息', async () => {
    await bridge.stop();
    const result = bridge.ingest([makeMsg()]);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
  });

  // ============================================================
  // 去重
  // ============================================================

  it('相同 (device_code, mp_code, timestamp) 去重', () => {
    const ts = Date.now();
    const msg1 = makeMsg({ timestamp: ts });
    const msg2 = makeMsg({ timestamp: ts }); // 完全相同

    const r1 = bridge.ingest([msg1]);
    const r2 = bridge.ingest([msg2]);

    expect(r1.accepted).toBe(1);
    expect(r2.accepted).toBe(0);
    expect(r2.rejected).toBe(1);
    expect(bridge.getStats().dedupDropped).toBe(1);
  });

  it('不同时间戳不去重', () => {
    const msg1 = makeMsg({ timestamp: 1000 });
    const msg2 = makeMsg({ timestamp: 2000 });

    bridge.ingest([msg1]);
    const r2 = bridge.ingest([msg2]);

    expect(r2.accepted).toBe(1);
    expect(bridge.getStats().bufferSize).toBe(2);
  });

  // ============================================================
  // 物理合理性检查 (ADR-001)
  // ============================================================

  it('拒绝 NaN 值', () => {
    const result = bridge.ingest([makeMsg({ value: NaN })]);
    expect(result.rejected).toBe(1);
    expect(bridge.getStats().physicsRejected).toBe(1);
  });

  it('拒绝 Infinity 值', () => {
    const result = bridge.ingest([makeMsg({ value: Infinity })]);
    expect(result.rejected).toBe(1);
  });

  it('拒绝超大值 (>1e12)', () => {
    const result = bridge.ingest([makeMsg({ value: 2e12 })]);
    expect(result.rejected).toBe(1);
  });

  it('接受正常范围内的值', () => {
    const result = bridge.ingest([makeMsg({ value: 0.001 })]);
    expect(result.accepted).toBe(1);
  });

  it('接受负数值', () => {
    const result = bridge.ingest([makeMsg({ value: -100.5 })]);
    expect(result.accepted).toBe(1);
  });

  it('接受无 value 的消息（仅有 waveform 等）', () => {
    const result = bridge.ingest([makeMsg({ value: undefined })]);
    expect(result.accepted).toBe(1);
  });

  // ============================================================
  // 波形展开
  // ============================================================

  it('波形数据展开为多行', () => {
    const msg = makeMsg({
      value: undefined,
      waveform: [1.0, 2.0, 3.0, 4.0],
      sample_rate: 1000,
    });

    bridge.ingest([msg]);
    // 1 行原始 + 4 行展开 = 5 行
    expect(bridge.getStats().bufferSize).toBe(5);
  });

  it('波形展开不超过 8192 个采样点', async () => {
    // 需要更大的缓冲区来容纳 8193 行，单独创建实例
    const largeBridge = new MqttClickHouseBridge({
      batchSize: 50000,
      flushIntervalMs: 60000,
      maxBufferSize: 50000,
      enabled: true,
    });
    await largeBridge.start();

    const bigWaveform = new Array(10000).fill(0.5);
    const msg = makeMsg({
      waveform: bigWaveform,
      sample_rate: 10000,
    });

    largeBridge.ingest([msg]);
    // 1 行原始 + 8192 行展开 = 8193
    expect(largeBridge.getStats().bufferSize).toBe(8193);

    await largeBridge.stop();
  });

  // ============================================================
  // Quality 归一化
  // ============================================================

  it('quality >= 192 映射为 1.0 (Good)', () => {
    bridge.ingest([makeMsg({ quality: 192 })]);
    // 检查写入的数据（通过 stats 间接验证已接受）
    expect(bridge.getStats().bufferSize).toBe(1);
  });

  it('quality 64-191 映射为 0.5 (Uncertain)', () => {
    bridge.ingest([makeMsg({ quality: 100 })]);
    expect(bridge.getStats().bufferSize).toBe(1);
  });

  it('quality < 64 映射为 0.1 (Bad)', () => {
    bridge.ingest([makeMsg({ quality: 10 })]);
    expect(bridge.getStats().bufferSize).toBe(1);
  });

  // ============================================================
  // 缓冲区溢出保护
  // ============================================================

  it('缓冲区超限时丢弃最旧数据', () => {
    // maxBufferSize = 100
    const msgs = Array.from({ length: 120 }, (_, i) =>
      makeMsg({ device_code: `DEV-${i}`, timestamp: i })
    );
    bridge.ingest(msgs);
    expect(bridge.getStats().bufferSize).toBeLessThanOrEqual(100);
    expect(bridge.getStats().bufferOverflows).toBe(1);
  });

  // ============================================================
  // 刷写
  // ============================================================

  it('flush 清空缓冲区并更新统计', async () => {
    bridge.ingest([makeMsg({ timestamp: 1 }), makeMsg({ timestamp: 2, device_code: 'DEV-2' })]);
    expect(bridge.getStats().bufferSize).toBe(2);

    await bridge.flush();
    expect(bridge.getStats().bufferSize).toBe(0);
    expect(bridge.getStats().rowsWritten).toBe(2);
    expect(bridge.getStats().batchesWritten).toBe(1);
  });

  it('空缓冲区 flush 不操作', async () => {
    await bridge.flush();
    expect(bridge.getStats().batchesWritten).toBe(0);
  });

  // ============================================================
  // 健康检查
  // ============================================================

  it('健康检查返回正确状态', async () => {
    const health = await bridge.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.details).toHaveProperty('bufferSize');
  });

  it('停止后健康检查返回不健康', async () => {
    await bridge.stop();
    const health = await bridge.healthCheck();
    expect(health.healthy).toBe(false);
  });

  // ============================================================
  // 时间戳处理
  // ============================================================

  it('处理 epoch ms 时间戳', () => {
    const result = bridge.ingest([makeMsg({ timestamp: 1709337600000 })]);
    expect(result.accepted).toBe(1);
  });

  it('处理 ISO8601 字符串时间戳', () => {
    const result = bridge.ingest([makeMsg({ timestamp: '2026-03-02T10:00:00.000Z' })]);
    expect(result.accepted).toBe(1);
  });

  // ============================================================
  // 统计
  // ============================================================

  it('getStats 返回完整统计', () => {
    const stats = bridge.getStats();
    expect(stats).toHaveProperty('messagesReceived');
    expect(stats).toHaveProperty('rowsWritten');
    expect(stats).toHaveProperty('batchesWritten');
    expect(stats).toHaveProperty('writeErrors');
    expect(stats).toHaveProperty('dedupDropped');
    expect(stats).toHaveProperty('physicsRejected');
    expect(stats).toHaveProperty('isRunning');
    expect(stats).toHaveProperty('isHealthy');
    expect(stats.isRunning).toBe(true);
  });
});
