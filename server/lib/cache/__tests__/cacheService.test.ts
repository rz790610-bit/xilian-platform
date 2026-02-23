/**
 * cacheService.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../core/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  MultiLevelCache,
  createCacheDecorator,
  CacheKeys,
  CacheInvalidation,
  defaultCache,
} from '../cacheService';

describe('MultiLevelCache', () => {
  let cache: MultiLevelCache;

  beforeEach(() => {
    cache = new MultiLevelCache({
      l1: { maxSize: 100, ttl: 60 },
      l2: { enabled: false, ttl: 300, keyPrefix: 'test:' },
    });
  });

  afterEach(() => {
    cache.stop();
  });

  // --- get/set 基础操作 ---

  it('set 后 get 返回正确值', async () => {
    await cache.set('key1', { name: 'test', value: 42 });
    const result = await cache.get<{ name: string; value: number }>('key1');
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  it('get 不存在的 key 返回 undefined', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('set 覆盖已有值', async () => {
    await cache.set('key2', 'v1');
    await cache.set('key2', 'v2');
    expect(await cache.get('key2')).toBe('v2');
  });

  it('支持不同类型的值', async () => {
    await cache.set('str', 'hello');
    await cache.set('num', 42);
    await cache.set('arr', [1, 2, 3]);
    await cache.set('bool', true);
    await cache.set('null', null);

    expect(await cache.get('str')).toBe('hello');
    expect(await cache.get('num')).toBe(42);
    expect(await cache.get('arr')).toEqual([1, 2, 3]);
    expect(await cache.get('bool')).toBe(true);
    expect(await cache.get('null')).toBeNull();
  });

  // --- TTL 过期 ---

  it('TTL 过期后返回 undefined', async () => {
    vi.useFakeTimers();
    const shortCache = new MultiLevelCache({
      l1: { maxSize: 100, ttl: 1 }, // 1 秒 TTL
      l2: { enabled: false, ttl: 300, keyPrefix: 'test:' },
    });

    await shortCache.set('expire_key', 'value');
    expect(await shortCache.get('expire_key')).toBe('value');

    vi.advanceTimersByTime(2000); // 前进 2 秒
    expect(await shortCache.get('expire_key')).toBeUndefined();

    shortCache.stop();
    vi.useRealTimers();
  });

  it('自定义 TTL 覆盖默认值', async () => {
    vi.useFakeTimers();
    await cache.set('custom_ttl', 'value', { l1TTL: 2 }); // 2 秒
    expect(await cache.get('custom_ttl')).toBe('value');

    vi.advanceTimersByTime(3000);
    expect(await cache.get('custom_ttl')).toBeUndefined();
    vi.useRealTimers();
  });

  // --- LRU 淘汰 ---

  it('超过 maxSize 时淘汰最老的条目', async () => {
    const smallCache = new MultiLevelCache({
      l1: { maxSize: 3, ttl: 60 },
      l2: { enabled: false, ttl: 300, keyPrefix: 'test:' },
    });

    await smallCache.set('a', 1);
    await smallCache.set('b', 2);
    await smallCache.set('c', 3);
    await smallCache.set('d', 4); // 应淘汰 'a'

    expect(await smallCache.get('a')).toBeUndefined();
    expect(await smallCache.get('b')).toBe(2);
    expect(await smallCache.get('d')).toBe(4);

    smallCache.stop();
  });

  // --- delete ---

  it('delete 删除指定 key', async () => {
    await cache.set('del_key', 'value');
    expect(await cache.has('del_key')).toBe(true);
    await cache.delete('del_key');
    expect(await cache.has('del_key')).toBe(false);
  });

  // --- deletePattern ---

  it('deletePattern 按模式删除', async () => {
    await cache.set('device:001', 'a');
    await cache.set('device:002', 'b');
    await cache.set('sensor:001', 'c');

    const deleted = await cache.deletePattern('device:*');
    expect(deleted).toBe(2);
    expect(await cache.has('device:001')).toBe(false);
    expect(await cache.has('sensor:001')).toBe(true);
  });

  // --- has ---

  it('has 检查存在性', async () => {
    await cache.set('exists', 'yes');
    expect(await cache.has('exists')).toBe(true);
    expect(await cache.has('not_exists')).toBe(false);
  });

  // --- clear ---

  it('clear 清空所有缓存', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });

  // --- getOrSet ---

  it('getOrSet 缓存命中时不调用 factory', async () => {
    await cache.set('cached', 'existing');
    const factory = vi.fn().mockResolvedValue('new');

    const result = await cache.getOrSet('cached', factory);
    expect(result).toBe('existing');
    expect(factory).not.toHaveBeenCalled();
  });

  it('getOrSet 缓存未命中时调用 factory 并缓存', async () => {
    const factory = vi.fn().mockResolvedValue('computed');

    const result = await cache.getOrSet('new_key', factory);
    expect(result).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);

    // 再次调用不应触发 factory
    const result2 = await cache.getOrSet('new_key', factory);
    expect(result2).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  // --- getStats ---

  it('getStats 返回正确的统计数据', async () => {
    cache.resetStats();
    await cache.set('stat_key', 'value');
    await cache.get('stat_key'); // hit
    await cache.get('miss_key'); // miss

    const stats = cache.getStats();
    expect(stats.l1Hits).toBe(1);
    expect(stats.l1Misses).toBe(1);
    expect(stats.l1HitRate).toBeCloseTo(0.5, 1);
  });

  it('resetStats 重置统计', async () => {
    await cache.get('any'); // 产生统计
    cache.resetStats();
    const stats = cache.getStats();
    expect(stats.l1Hits).toBe(0);
    expect(stats.l1Misses).toBe(0);
  });
});

describe('CacheKeys', () => {
  it('device 生成正确的 key', () => {
    expect(CacheKeys.device('D001')).toBe('device:D001');
  });

  it('deviceList 包含分页参数', () => {
    expect(CacheKeys.deviceList(1, 20)).toBe('devices:list:1:20');
  });

  it('sensor 包含 nodeId 和 sensorId', () => {
    expect(CacheKeys.sensor('N001', 'S001')).toBe('sensor:N001:S001');
  });

  it('user 生成正确的 key', () => {
    expect(CacheKeys.user('U001')).toBe('user:U001');
  });
});

describe('CacheInvalidation', () => {
  let cache: MultiLevelCache;

  beforeEach(() => {
    cache = new MultiLevelCache({
      l1: { maxSize: 100, ttl: 60 },
      l2: { enabled: false, ttl: 300, keyPrefix: 'test:' },
    });
  });

  afterEach(() => {
    cache.stop();
  });

  it('onDeviceUpdate 清除设备相关缓存', async () => {
    await cache.set('device:D001', 'data');
    await cache.set('device:stats:D001', 'stats');
    await cache.set('devices:list:1:20', 'list');

    await CacheInvalidation.onDeviceUpdate(cache, 'D001');

    expect(await cache.has('device:D001')).toBe(false);
    expect(await cache.has('device:stats:D001')).toBe(false);
    expect(await cache.has('devices:list:1:20')).toBe(false);
  });

  it('onUserUpdate 清除用户相关缓存', async () => {
    await cache.set('user:U001', 'data');
    await cache.set('user:perms:U001', 'perms');

    await CacheInvalidation.onUserUpdate(cache, 'U001');

    expect(await cache.has('user:U001')).toBe(false);
    expect(await cache.has('user:perms:U001')).toBe(false);
  });
});

describe('defaultCache', () => {
  it('是 MultiLevelCache 实例', () => {
    expect(defaultCache).toBeInstanceOf(MultiLevelCache);
  });
});
