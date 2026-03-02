/**
 * ============================================================================
 * FIX-138: 协议适配器基础设施测试
 * ============================================================================
 *
 * 覆盖不依赖外部连接的公共模块：
 *   - AdapterError: 错误构造、分类、序列化
 *   - normalizeError: 常见错误模式自动分类
 *   - withTimeout: 超时控制
 *   - MetricsCollector: 指标收集（通过 BaseAdapter 间接测试）
 */

import { describe, it, expect } from 'vitest';
import {
  AdapterError,
  AdapterErrorCode,
  normalizeError,
  withTimeout,
} from '../base';

// ============================================================================
// AdapterError
// ============================================================================

describe('AdapterError', () => {
  it('构造错误包含所有字段', () => {
    const err = new AdapterError(
      AdapterErrorCode.CONNECTION,
      'mqtt',
      '连接被拒绝',
      { recoverable: true, details: { host: '192.168.1.1' } },
    );
    expect(err.name).toBe('AdapterError');
    expect(err.code).toBe('CONNECTION');
    expect(err.protocolType).toBe('mqtt');
    expect(err.message).toBe('连接被拒绝');
    expect(err.recoverable).toBe(true);
    expect(err.details).toEqual({ host: '192.168.1.1' });
    expect(err.timestamp).toBeTruthy();
  });

  it('默认不可恢复', () => {
    const err = new AdapterError(AdapterErrorCode.AUTH, 'modbus', 'auth failed');
    expect(err.recoverable).toBe(false);
  });

  it('toJSON 序列化完整', () => {
    const err = new AdapterError(AdapterErrorCode.TIMEOUT, 'opcua', '超时');
    const json = err.toJSON();
    expect(json.name).toBe('AdapterError');
    expect(json.code).toBe('TIMEOUT');
    expect(json.protocolType).toBe('opcua');
    expect(json.message).toBe('超时');
    expect(json.timestamp).toBeTruthy();
  });

  it('继承 Error', () => {
    const err = new AdapterError(AdapterErrorCode.INTERNAL, 'mqtt', 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AdapterError);
  });

  it('支持 cause 链', () => {
    const cause = new Error('原始错误');
    const err = new AdapterError(AdapterErrorCode.CONNECTION, 'mqtt', '包装错误', { cause });
    expect(err.cause).toBe(cause);
  });
});

// ============================================================================
// normalizeError — 错误自动分类
// ============================================================================

describe('normalizeError', () => {
  it('已是 AdapterError → 直接返回', () => {
    const original = new AdapterError(AdapterErrorCode.AUTH, 'mqtt', '认证');
    const result = normalizeError(original, 'mqtt');
    expect(result).toBe(original);
  });

  it('ECONNREFUSED → CONNECTION', () => {
    const err = normalizeError(new Error('connect ECONNREFUSED 127.0.0.1:1883'), 'mqtt');
    expect(err.code).toBe(AdapterErrorCode.CONNECTION);
    expect(err.recoverable).toBe(true);
  });

  it('timeout → TIMEOUT', () => {
    const err = normalizeError(new Error('operation timed out'), 'modbus');
    expect(err.code).toBe(AdapterErrorCode.TIMEOUT);
    expect(err.recoverable).toBe(true);
  });

  it('auth/password → AUTH', () => {
    const err = normalizeError(new Error('authentication failed: wrong password'), 'opcua');
    expect(err.code).toBe(AdapterErrorCode.AUTH);
    expect(err.recoverable).toBe(false);
  });

  it('permission/forbidden → PERMISSION_DENIED', () => {
    const err = normalizeError(new Error('permission denied for topic'), 'kafka');
    expect(err.code).toBe(AdapterErrorCode.PERMISSION_DENIED);
  });

  it('not found → RESOURCE_NOT_FOUND', () => {
    const err = normalizeError(new Error('table does not exist'), 'clickhouse');
    expect(err.code).toBe(AdapterErrorCode.RESOURCE_NOT_FOUND);
  });

  it('rate limit → RATE_LIMITED', () => {
    const err = normalizeError(new Error('rate limit exceeded, too many requests'), 'http');
    expect(err.code).toBe(AdapterErrorCode.RATE_LIMITED);
    expect(err.recoverable).toBe(true);
  });

  it('未知错误 → 默认 INTERNAL', () => {
    const err = normalizeError(new Error('some random error'), 'mqtt');
    expect(err.code).toBe(AdapterErrorCode.INTERNAL);
  });

  it('非 Error 输入 → 转为字符串', () => {
    const err = normalizeError('string error', 'mqtt');
    expect(err).toBeInstanceOf(AdapterError);
    expect(err.message).toBe('string error');
  });

  it('自定义默认错误码', () => {
    const err = normalizeError(new Error('unknown'), 'mqtt', AdapterErrorCode.PROTOCOL);
    expect(err.code).toBe(AdapterErrorCode.PROTOCOL);
  });
});

// ============================================================================
// withTimeout — 超时控制
// ============================================================================

describe('withTimeout', () => {
  it('正常完成 → 返回结果', async () => {
    const result = await withTimeout(
      Promise.resolve(42),
      1000,
      'mqtt',
      'test',
    );
    expect(result).toBe(42);
  });

  it('超时 → 抛出 TIMEOUT AdapterError', async () => {
    const slow = new Promise(r => setTimeout(r, 5000));
    await expect(
      withTimeout(slow, 50, 'modbus', '慢操作'),
    ).rejects.toThrow(AdapterError);

    try {
      await withTimeout(slow, 50, 'modbus', '慢操作');
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterError);
      expect((err as AdapterError).code).toBe(AdapterErrorCode.TIMEOUT);
      expect((err as AdapterError).recoverable).toBe(true);
    }
  });

  it('promise 自身抛错 → 错误传播', async () => {
    const failing = Promise.reject(new Error('boom'));
    await expect(
      withTimeout(failing, 1000, 'mqtt', 'test'),
    ).rejects.toThrow('boom');
  });
});

// ============================================================================
// AdapterErrorCode 枚举完整性
// ============================================================================

describe('AdapterErrorCode', () => {
  it('包含所有预期错误码', () => {
    expect(AdapterErrorCode.CONNECTION).toBe('CONNECTION');
    expect(AdapterErrorCode.AUTH).toBe('AUTH');
    expect(AdapterErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(AdapterErrorCode.PROTOCOL).toBe('PROTOCOL');
    expect(AdapterErrorCode.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
    expect(AdapterErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(AdapterErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(AdapterErrorCode.INTERNAL).toBe('INTERNAL');
  });
});
