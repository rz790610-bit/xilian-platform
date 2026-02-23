/**
 * circuitBreaker.ts 单元测试
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

// 必须在 mock 之后导入
import {
  circuitBreakerRegistry,
  withCircuitBreaker,
  type CircuitBreakerState,
} from '../circuitBreaker';

describe('CircuitBreakerRegistry', () => {
  afterEach(async () => {
    await circuitBreakerRegistry.shutdown();
  });

  it('getBreaker 创建新的断路器', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const breaker = circuitBreakerRegistry.getBreaker('test-svc-1', fn);
    expect(breaker).toBeDefined();
    expect(typeof breaker.fire).toBe('function');
  });

  it('getBreaker 对同名服务返回相同实例', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const b1 = circuitBreakerRegistry.getBreaker('test-svc-2', fn);
    const b2 = circuitBreakerRegistry.getBreaker('test-svc-2', fn);
    expect(b1).toBe(b2);
  });

  it('wrap 返回受保护的函数', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const wrapped = circuitBreakerRegistry.wrap('test-svc-3', fn);
    const result = await wrapped();
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('getStats 返回指定服务的统计', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-4', fn);
    const stats = circuitBreakerRegistry.getStats('test-svc-4');
    expect(stats).not.toBeNull();
    expect(stats!.name).toBe('test-svc-4');
    expect(stats!.state).toBe('closed');
  });

  it('getStats 对未注册服务返回 null', () => {
    const stats = circuitBreakerRegistry.getStats('nonexistent');
    expect(stats).toBeNull();
  });

  it('getAllStats 返回所有断路器统计', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-5a', fn);
    circuitBreakerRegistry.getBreaker('test-svc-5b', fn);
    const allStats = circuitBreakerRegistry.getAllStats();
    expect(allStats.length).toBeGreaterThanOrEqual(2);
    const names = allStats.map(s => s.name);
    expect(names).toContain('test-svc-5a');
    expect(names).toContain('test-svc-5b');
  });

  it('forceOpen 需要 operatorId', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-6', fn);
    const result = circuitBreakerRegistry.forceOpen('test-svc-6', '');
    expect(result).toBe(false);
  });

  it('forceOpen 成功打开断路器', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-7', fn);
    const result = circuitBreakerRegistry.forceOpen('test-svc-7', 'admin-001');
    expect(result).toBe(true);
    const stats = circuitBreakerRegistry.getStats('test-svc-7');
    expect(stats!.state).toBe('open');
  });

  it('forceOpen 对未注册服务返回 false', () => {
    const result = circuitBreakerRegistry.forceOpen('nonexistent', 'admin');
    expect(result).toBe(false);
  });

  it('forceClose 需要 operatorId', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-8', fn);
    circuitBreakerRegistry.forceOpen('test-svc-8', 'admin');
    const result = circuitBreakerRegistry.forceClose('test-svc-8', '');
    expect(result).toBe(false);
  });

  it('forceClose 成功关闭断路器', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-9', fn);
    circuitBreakerRegistry.forceOpen('test-svc-9', 'admin');
    expect(circuitBreakerRegistry.getStats('test-svc-9')!.state).toBe('open');
    circuitBreakerRegistry.forceClose('test-svc-9', 'admin');
    expect(circuitBreakerRegistry.getStats('test-svc-9')!.state).toBe('closed');
  });

  it('onStateChange 监听状态变化', () => {
    const listener = vi.fn();
    const unsubscribe = circuitBreakerRegistry.onStateChange(listener);

    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-10', fn);
    circuitBreakerRegistry.forceOpen('test-svc-10', 'admin');

    expect(listener).toHaveBeenCalledWith('test-svc-10', 'open');
    unsubscribe();
  });

  it('onStateChange 取消订阅后不再通知', () => {
    const listener = vi.fn();
    const unsubscribe = circuitBreakerRegistry.onStateChange(listener);
    unsubscribe();

    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-11', fn);
    circuitBreakerRegistry.forceOpen('test-svc-11', 'admin');

    expect(listener).not.toHaveBeenCalled();
  });

  it('registerFallback 注册降级回调', async () => {
    const fallbackResult = { fallback: true };
    circuitBreakerRegistry.registerFallback('test-svc-12', () => fallbackResult);

    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const breaker = circuitBreakerRegistry.getBreaker('test-svc-12', fn, {
      volumeThreshold: 1,
      errorThresholdPercentage: 1,
    });

    // 触发足够多的失败使断路器打开
    try { await breaker.fire(); } catch {}
    try { await breaker.fire(); } catch {}

    // 断路器打开后应返回 fallback
    const result = await breaker.fire();
    expect(result).toEqual(fallbackResult);
  });

  it('shutdown 清空所有断路器', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    circuitBreakerRegistry.getBreaker('test-svc-13', fn);
    await circuitBreakerRegistry.shutdown();
    const stats = circuitBreakerRegistry.getStats('test-svc-13');
    expect(stats).toBeNull();
  });

  it('禁用的断路器永不熔断', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const breaker = circuitBreakerRegistry.getBreaker('test-svc-14', fn, {
      enabled: false,
    });

    // 多次失败也不应打开断路器
    for (let i = 0; i < 10; i++) {
      try { await breaker.fire(); } catch {}
    }

    const stats = circuitBreakerRegistry.getStats('test-svc-14');
    // 禁用的断路器不会进入 open 状态
    expect(stats!.state).toBe('closed');
  });
});

describe('withCircuitBreaker', () => {
  afterEach(async () => {
    await circuitBreakerRegistry.shutdown();
  });

  it('正常调用返回结果', async () => {
    const fn = vi.fn().mockResolvedValue('hello');
    const wrapped = withCircuitBreaker('test-with-1', fn);
    const result = await wrapped();
    expect(result).toBe('hello');
  });

  it('失败时抛出原始错误', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withCircuitBreaker('test-with-2', fn);
    await expect(wrapped()).rejects.toThrow('boom');
  });
});
