/**
 * event-schema-registry.ts 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  parseSemVer,
  compareSemVer,
  formatSemVer,
  EventSchemaRegistry,
} from '../event-schema-registry';

// ============================================================
// SemVer 工具函数
// ============================================================

describe('parseSemVer', () => {
  it('正确解析合法版本号', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemVer('0.0.1')).toEqual({ major: 0, minor: 0, patch: 1 });
    expect(parseSemVer('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('拒绝非法版本号', () => {
    expect(() => parseSemVer('1.2')).toThrow('Invalid SemVer');
    expect(() => parseSemVer('abc')).toThrow('Invalid SemVer');
    expect(() => parseSemVer('1.2.3.4')).toThrow('Invalid SemVer');
    expect(() => parseSemVer('')).toThrow('Invalid SemVer');
  });
});

describe('compareSemVer', () => {
  it('major 版本不同时按 major 比较', () => {
    expect(compareSemVer({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 })).toBeGreaterThan(0);
  });

  it('major 相同时按 minor 比较', () => {
    expect(compareSemVer({ major: 1, minor: 3, patch: 0 }, { major: 1, minor: 2, patch: 9 })).toBeGreaterThan(0);
  });

  it('major/minor 相同时按 patch 比较', () => {
    expect(compareSemVer({ major: 1, minor: 2, patch: 4 }, { major: 1, minor: 2, patch: 3 })).toBeGreaterThan(0);
  });

  it('完全相同返回 0', () => {
    expect(compareSemVer({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 })).toBe(0);
  });
});

describe('formatSemVer', () => {
  it('正确格式化版本号', () => {
    expect(formatSemVer({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
    expect(formatSemVer({ major: 0, minor: 0, patch: 0 })).toBe('0.0.0');
  });
});

// ============================================================
// EventSchemaRegistry
// ============================================================

describe('EventSchemaRegistry', () => {
  let registry: EventSchemaRegistry;

  const sensorPayloadSchema = z.object({
    machineId: z.string(),
    value: z.number(),
    unit: z.string(),
  });

  const validEnvelope = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventType: 'sensor.data.raw',
    version: '1.0.0',
    timestamp: Date.now(),
    source: {
      serviceId: 'perception',
      instanceId: 'inst-001',
    },
    payload: {
      machineId: 'M001',
      value: 42.5,
      unit: 'mm/s',
    },
    metadata: {
      traceId: 'trace-001',
    },
  };

  beforeEach(() => {
    registry = new EventSchemaRegistry();
  });

  // --- 注册 API ---

  it('register 注册新事件 Schema', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const schema = registry.getSchema('sensor.data.raw');
    expect(schema).toBeDefined();
  });

  it('register 拒绝重复版本号', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    expect(() => {
      registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '重复');
    }).toThrow('already registered');
  });

  it('register 拒绝低于当前版本的新版本', () => {
    registry.register('sensor.data.raw', '1.1.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    expect(() => {
      registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '旧版本');
    }).toThrow('must be greater');
  });

  it('register 允许递增版本号', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const extendedSchema = sensorPayloadSchema.extend({ quality: z.string().optional() });
    registry.register('sensor.data.raw', '1.1.0', extendedSchema, 'perception', '传感器原始数据 v1.1');
    const def = registry.getEventDefinition('sensor.data.raw');
    expect(def!.currentVersion).toBe('1.1.0');
    expect(def!.versionCount).toBe(2);
  });

  // --- 校验 API ---

  it('validate 对有效事件返回 valid=true', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const result = registry.validate(validEnvelope);
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe('sensor.data.raw');
  });

  it('validate 对无效信封返回错误', () => {
    const result = registry.validate({ bad: 'data' });
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('validate 对未注册事件类型返回错误', () => {
    const result = registry.validate(validEnvelope);
    expect(result.valid).toBe(false);
    expect(result.errors![0].code).toBe('unregistered');
  });

  it('validate 对无效 payload 返回错误并记录死信', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const badPayload = { ...validEnvelope, payload: { machineId: 123 } }; // machineId 应为 string
    const result = registry.validate(badPayload);
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);

    const deadLetters = registry.getDeadLetterStats();
    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0].eventType).toBe('sensor.data.raw');
    expect(deadLetters[0].failureCount).toBe(1);
  });

  it('validatePayload 仅校验 payload', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const result = registry.validatePayload('sensor.data.raw', { machineId: 'M001', value: 42, unit: 'mm/s' });
    expect(result.valid).toBe(true);
  });

  it('validatePayload 对未注册事件返回错误', () => {
    const result = registry.validatePayload('unknown.event', {});
    expect(result.valid).toBe(false);
    expect(result.errors![0].code).toBe('unregistered');
  });

  // --- 兼容性检查 ---

  it('checkCompatibility 对未注册事件返回 compatible', () => {
    const result = registry.checkCompatibility('unknown', sensorPayloadSchema);
    expect(result.compatible).toBe(true);
  });

  it('checkCompatibility 检测删除字段为破坏性变更', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const reducedSchema = z.object({ machineId: z.string() }); // 删除了 value 和 unit
    const result = registry.checkCompatibility('sensor.data.raw', reducedSchema);
    expect(result.compatible).toBe(false);
    expect(result.breakingChanges.some(c => c.changeType === 'removed')).toBe(true);
  });

  it('checkCompatibility 允许新增可选字段', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    const extendedSchema = sensorPayloadSchema.extend({ quality: z.string().optional() });
    const result = registry.checkCompatibility('sensor.data.raw', extendedSchema);
    expect(result.compatible).toBe(true);
    expect(result.nonBreakingChanges.some(c => c.changeType === 'added_optional')).toBe(true);
  });

  // --- 查询 API ---

  it('listEvents 返回所有已注册事件', () => {
    registry.register('a.event', '1.0.0', sensorPayloadSchema, 'perception', 'A');
    registry.register('b.event', '1.0.0', sensorPayloadSchema, 'diagnosis', 'B');
    const events = registry.listEvents();
    expect(events.length).toBe(2);
    // 按 eventType 排序
    expect(events[0].eventType).toBe('a.event');
  });

  it('listEvents 按 stage 过滤', () => {
    registry.register('a.event', '1.0.0', sensorPayloadSchema, 'perception', 'A');
    registry.register('b.event', '1.0.0', sensorPayloadSchema, 'diagnosis', 'B');
    const events = registry.listEvents({ stage: 'diagnosis' });
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('b.event');
  });

  it('listEventsByStage 按阶段分组', () => {
    registry.register('a.event', '1.0.0', sensorPayloadSchema, 'perception', 'A');
    registry.register('b.event', '1.0.0', sensorPayloadSchema, 'guardrail', 'B');
    const grouped = registry.listEventsByStage();
    expect(grouped.perception.length).toBe(1);
    expect(grouped.guardrail.length).toBe(1);
    expect(grouped.diagnosis.length).toBe(0);
    expect(grouped.evolution.length).toBe(0);
  });

  it('getStats 返回正确统计', () => {
    registry.register('a.event', '1.0.0', sensorPayloadSchema, 'perception', 'A');
    registry.register('b.event', '1.0.0', sensorPayloadSchema, 'perception', 'B');
    const stats = registry.getStats();
    expect(stats.totalEventTypes).toBe(2);
    expect(stats.totalVersions).toBe(2);
    expect(stats.byStage.perception).toBe(2);
  });

  // --- 死信管理 ---

  it('resetDeadLetterStats 清除指定事件的死信', () => {
    registry.register('sensor.data.raw', '1.0.0', sensorPayloadSchema, 'perception', '传感器原始数据');
    registry.validate({ ...validEnvelope, payload: { bad: true } });
    expect(registry.getDeadLetterStats().length).toBe(1);
    registry.resetDeadLetterStats('sensor.data.raw');
    expect(registry.getDeadLetterStats().length).toBe(0);
  });

  it('resetDeadLetterStats 无参数清除所有死信', () => {
    registry.register('a.event', '1.0.0', sensorPayloadSchema, 'perception', 'A');
    registry.register('b.event', '1.0.0', sensorPayloadSchema, 'diagnosis', 'B');
    registry.validate({ ...validEnvelope, eventType: 'a.event', payload: {} });
    registry.validate({ ...validEnvelope, eventType: 'b.event', payload: {} });
    expect(registry.getDeadLetterStats().length).toBe(2);
    registry.resetDeadLetterStats();
    expect(registry.getDeadLetterStats().length).toBe(0);
  });
});
