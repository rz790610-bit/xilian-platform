/**
 * backpressure.ts 单元测试
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

import { TokenBucket, AdaptiveBackpressureController, KafkaConsumerBackpressure } from '../backpressure';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始 tokens 等于 capacity', () => {
    const bucket = new TokenBucket({ capacity: 100, refillRate: 10 });
    const status = bucket.getStatus();
    expect(status.tokens).toBe(100);
    expect(status.capacity).toBe(100);
  });

  it('initialTokens 覆盖默认值', () => {
    const bucket = new TokenBucket({ capacity: 100, refillRate: 10, initialTokens: 50 });
    expect(bucket.getStatus().tokens).toBe(50);
  });

  it('tryAcquire 消耗 tokens', () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
    expect(bucket.tryAcquire(3)).toBe(true);
    expect(bucket.getStatus().tokens).toBe(7);
  });

  it('tryAcquire 在 tokens 不足时返回 false', () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 1, initialTokens: 2 });
    expect(bucket.tryAcquire(3)).toBe(false);
    // tokens 不应减少
    expect(bucket.getStatus().tokens).toBe(2);
  });

  it('refill 机制按时间补充 tokens', () => {
    const bucket = new TokenBucket({ capacity: 100, refillRate: 10, initialTokens: 0 });
    // 前进 1 秒，应补充 10 个 tokens
    vi.advanceTimersByTime(1000);
    const status = bucket.getStatus();
    expect(status.tokens).toBe(10);
  });

  it('refill 不超过 capacity', () => {
    const bucket = new TokenBucket({ capacity: 100, refillRate: 10, initialTokens: 95 });
    vi.advanceTimersByTime(2000); // 补充 20，但上限 100
    expect(bucket.getStatus().tokens).toBe(100);
  });

  it('utilizationPercent 正确计算', () => {
    const bucket = new TokenBucket({ capacity: 100, refillRate: 10, initialTokens: 100 });
    expect(bucket.getStatus().utilizationPercent).toBe(0);
    bucket.tryAcquire(50);
    expect(bucket.getStatus().utilizationPercent).toBe(50);
  });

  it('tryAcquire 默认消耗 1 个 token', () => {
    const bucket = new TokenBucket({ capacity: 3, refillRate: 1, initialTokens: 3 });
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.tryAcquire()).toBe(false);
  });
});

describe('AdaptiveBackpressureController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始并发等于 initialConcurrency', () => {
    const ctrl = new AdaptiveBackpressureController('test', {
      initialConcurrency: 5,
      adjustIntervalMs: 100000,
    });
    const status = ctrl.getStatus();
    expect(status.currentConcurrency).toBe(5);
    expect(status.activeTasks).toBe(0);
    expect(status.queueLength).toBe(0);
    ctrl.shutdown();
  });

  it('acquire 获取许可并 release 释放', async () => {
    const ctrl = new AdaptiveBackpressureController('test', {
      initialConcurrency: 10,
      adjustIntervalMs: 100000,
    });
    const release = await ctrl.acquire();
    expect(ctrl.getStatus().activeTasks).toBe(1);
    release();
    expect(ctrl.getStatus().activeTasks).toBe(0);
    ctrl.shutdown();
  });

  it('shutdown 后 acquire 抛出错误', async () => {
    const ctrl = new AdaptiveBackpressureController('test', {
      initialConcurrency: 10,
      adjustIntervalMs: 100000,
    });
    ctrl.shutdown();
    await expect(ctrl.acquire()).rejects.toThrow('Controller is shutdown');
  });

  it('并发达到上限时排队', async () => {
    const ctrl = new AdaptiveBackpressureController('test', {
      initialConcurrency: 1,
      adjustIntervalMs: 100000,
    });
    const release1 = await ctrl.acquire();
    expect(ctrl.getStatus().activeTasks).toBe(1);

    // 第二个 acquire 应该排队
    let secondResolved = false;
    const secondPromise = ctrl.acquire().then(r => {
      secondResolved = true;
      return r;
    });

    // 等一下让 promise 注册
    await new Promise(r => setTimeout(r, 10));
    expect(ctrl.getStatus().queueLength).toBe(1);
    expect(secondResolved).toBe(false);

    // 释放第一个，第二个应该获得许可
    release1();
    const release2 = await secondPromise;
    expect(secondResolved).toBe(true);
    expect(ctrl.getStatus().activeTasks).toBe(1);
    release2();
    ctrl.shutdown();
  });

  it('shutdown 拒绝所有等待中的请求', async () => {
    const ctrl = new AdaptiveBackpressureController('test', {
      initialConcurrency: 1,
      adjustIntervalMs: 100000,
    });
    const release1 = await ctrl.acquire();

    const secondPromise = ctrl.acquire();
    await new Promise(r => setTimeout(r, 10));

    ctrl.shutdown();
    await expect(secondPromise).rejects.toThrow('Controller shutdown');
    release1();
  });
});

describe('KafkaConsumerBackpressure', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始状态正确', () => {
    const bp = new KafkaConsumerBackpressure('test', {
      maxMessagesPerSecond: 100,
      maxConcurrentProcessing: 10,
    });
    const status = bp.getStatus();
    expect(status.isPaused).toBe(false);
    expect(status.pendingCount).toBe(0);
    bp.shutdown();
  });

  it('beforeProcess 返回 release 函数', async () => {
    const bp = new KafkaConsumerBackpressure('test', {
      maxMessagesPerSecond: 100,
      maxConcurrentProcessing: 10,
    });
    const release = await bp.beforeProcess();
    expect(bp.getStatus().pendingCount).toBe(1);
    release();
    expect(bp.getStatus().pendingCount).toBe(0);
    bp.shutdown();
  });

  it('onPause/onResume 回调被触发', async () => {
    const pauseCb = vi.fn();
    const resumeCb = vi.fn();

    const bp = new KafkaConsumerBackpressure('test', {
      maxMessagesPerSecond: 10000,
      maxConcurrentProcessing: 200,
      pauseThreshold: 3,
      resumeThreshold: 1,
    });
    bp.onPause(pauseCb);
    bp.onResume(resumeCb);

    // 积累 pending 到 pauseThreshold
    const releases: Array<() => void> = [];
    for (let i = 0; i < 3; i++) {
      releases.push(await bp.beforeProcess());
    }
    expect(pauseCb).toHaveBeenCalledTimes(1);

    // 释放到 resumeThreshold 以下
    releases[0]();
    releases[1]();
    expect(resumeCb).toHaveBeenCalledTimes(1);
    releases[2]();
    bp.shutdown();
  });
});
