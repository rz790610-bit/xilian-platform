/**
 * configCenter.ts 单元测试
 * 
 * Mock 所有外部依赖（Redis、EventBus），仅测试 ConfigCenter 的内存逻辑。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 所有外部依赖
vi.mock('../../../core/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../lib/clients/redis.client', () => ({
  redisClient: {
    getClient: () => null,
    psubscribe: vi.fn(),
  },
}));

vi.mock('../../../services/eventBus.service', () => ({
  eventBus: {
    publish: vi.fn(),
  },
  TOPICS: {},
}));

// 每次测试创建新实例，避免单例污染
// 直接 import configCenter 是单例，我们需要测试 class 行为
// 通过 set/get 操作测试

import { configCenter, V5_CONFIG_DEFAULTS, initV5ConfigDefaults } from '../configCenter';

describe('ConfigCenter', () => {
  beforeEach(() => {
    // 重置环境变量
    delete process.env.NEXUS_TEST_KEY;
    delete process.env.APP_TEST_KEY;
  });

  afterEach(() => {
    configCenter.shutdown();
  });

  // --- get/set 基础操作 ---

  it('get 返回空字符串当 key 不存在且无默认值', () => {
    const value = configCenter.get('nonexistent_key_12345');
    expect(value).toBe('');
  });

  it('get 返回默认值当 key 不存在', () => {
    const value = configCenter.get('nonexistent_key_12345', 'fallback');
    expect(value).toBe('fallback');
  });

  it('get 回退到环境变量', () => {
    process.env.NEXUS_TEST_KEY = 'env_value';
    const value = configCenter.get('NEXUS_TEST_KEY');
    expect(value).toBe('env_value');
    delete process.env.NEXUS_TEST_KEY;
  });

  it('set 设置值后 get 返回新值', async () => {
    await configCenter.set('test_key_1', 'hello', 'test');
    expect(configCenter.get('test_key_1')).toBe('hello');
  });

  it('set 更新已有值', async () => {
    await configCenter.set('test_key_2', 'v1', 'test');
    await configCenter.set('test_key_2', 'v2', 'test');
    expect(configCenter.get('test_key_2')).toBe('v2');
  });

  // --- getInt/getBool ---

  it('getInt 解析整数', async () => {
    await configCenter.set('int_key', '42', 'test');
    expect(configCenter.getInt('int_key', 0)).toBe(42);
  });

  it('getInt 无效值返回默认值', async () => {
    await configCenter.set('int_key_bad', 'abc', 'test');
    expect(configCenter.getInt('int_key_bad', 99)).toBe(99);
  });

  it('getInt 不存在时返回默认值', () => {
    expect(configCenter.getInt('nonexistent_int', 10)).toBe(10);
  });

  it('getBool 解析布尔值', async () => {
    await configCenter.set('bool_true', 'true', 'test');
    await configCenter.set('bool_1', '1', 'test');
    await configCenter.set('bool_yes', 'yes', 'test');
    await configCenter.set('bool_false', 'false', 'test');

    expect(configCenter.getBool('bool_true', false)).toBe(true);
    expect(configCenter.getBool('bool_1', false)).toBe(true);
    expect(configCenter.getBool('bool_yes', false)).toBe(true);
    expect(configCenter.getBool('bool_false', true)).toBe(false);
  });

  // --- watch/watchAll ---

  it('watch 监听特定 key 的变更', async () => {
    const listener = vi.fn();
    const unwatch = configCenter.watch('watch_key', listener);

    await configCenter.set('watch_key', 'new_value', 'test');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'watch_key',
        newValue: 'new_value',
      })
    );

    unwatch();
  });

  it('watch 取消订阅后不再通知', async () => {
    const listener = vi.fn();
    const unwatch = configCenter.watch('watch_key_2', listener);
    unwatch();

    await configCenter.set('watch_key_2', 'value', 'test');
    expect(listener).not.toHaveBeenCalled();
  });

  it('watchAll 监听所有变更', async () => {
    const listener = vi.fn();
    const unwatch = configCenter.watchAll(listener);

    await configCenter.set('any_key_1', 'v1', 'test');
    await configCenter.set('any_key_2', 'v2', 'test');

    expect(listener).toHaveBeenCalledTimes(2);
    unwatch();
  });

  // --- 校验规则 ---

  it('addValidation 阻止无效值', async () => {
    configCenter.addValidation({
      key: 'port_key',
      validator: (v) => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n > 0 && n < 65536;
      },
      errorMessage: 'Port must be 1-65535',
    });

    const result = await configCenter.set('port_key', 'invalid', 'test');
    expect(result).toBe(false);

    const result2 = await configCenter.set('port_key', '8080', 'test');
    expect(result2).toBe(true);
    expect(configCenter.get('port_key')).toBe('8080');
  });

  // --- 批量操作 ---

  it('setBatch 批量设置', async () => {
    const result = await configCenter.setBatch([
      { key: 'batch_1', value: 'a' },
      { key: 'batch_2', value: 'b' },
    ], 'test');

    expect(result.success).toBe(2);
    expect(result.failed.length).toBe(0);
    expect(configCenter.get('batch_1')).toBe('a');
    expect(configCenter.get('batch_2')).toBe('b');
  });

  // --- 历史和快照 ---

  it('getHistory 返回变更历史', async () => {
    await configCenter.set('history_key', 'v1', 'test');
    await configCenter.set('history_key', 'v2', 'test');

    const history = configCenter.getHistory('history_key');
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[history.length - 1].newValue).toBe('v2');
  });

  it('getSnapshot 返回所有配置快照', async () => {
    await configCenter.set('snap_key', 'snap_value', 'test');
    const snapshot = configCenter.getSnapshot();
    expect(snapshot['snap_key']).toBeDefined();
    expect(snapshot['snap_key'].value).toBe('snap_value');
  });

  // --- V5 默认配置 ---

  it('V5_CONFIG_DEFAULTS 包含预期的配置键', () => {
    expect(V5_CONFIG_DEFAULTS['v5.perception.ringBuffer.sizeKB']).toBe('64');
    expect(V5_CONFIG_DEFAULTS['v5.grok.enabled']).toBe('false');
    expect(V5_CONFIG_DEFAULTS['v5.guardrail.enabled']).toBe('true');
  });
});
