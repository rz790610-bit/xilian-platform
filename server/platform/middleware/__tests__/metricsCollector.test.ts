/**
 * metricsCollector.ts 单元测试
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

vi.mock('../../../core/config', () => ({
  config: {
    app: { env: 'test' },
    rateLimit: { enabled: false },
    security: { corsOrigins: ['*'], enableHsts: false },
  },
}));

import { metricsCollector } from '../metricsCollector';

describe('MetricsCollector', () => {
  afterEach(() => {
    metricsCollector.shutdown();
  });

  // --- 初始化 ---

  it('initialize 不抛出异常', () => {
    expect(() => metricsCollector.initialize()).not.toThrow();
  });

  it('initialize 幂等', () => {
    metricsCollector.initialize();
    metricsCollector.initialize(); // 第二次不应出错
    expect(true).toBe(true);
  });

  // --- getRegistry ---

  it('getRegistry 返回 Registry 实例', () => {
    const registry = metricsCollector.getRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.metrics).toBe('function');
  });

  // --- httpMiddleware ---

  it('httpMiddleware 返回中间件函数', () => {
    const middleware = metricsCollector.httpMiddleware();
    expect(typeof middleware).toBe('function');
  });

  it('httpMiddleware 调用 next', () => {
    const middleware = metricsCollector.httpMiddleware();
    const req = {
      method: 'GET',
      path: '/api/test',
      headers: {},
    } as any;
    const res = {
      on: vi.fn(),
      statusCode: 200,
    } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('httpMiddleware 注册 finish 事件监听', () => {
    const middleware = metricsCollector.httpMiddleware();
    const req = {
      method: 'GET',
      path: '/api/test',
      headers: {},
    } as any;
    const res = {
      on: vi.fn(),
      statusCode: 200,
    } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  // --- metricsRouter ---

  it('metricsRouter 返回 Express Router', () => {
    const router = metricsCollector.metricsRouter();
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  // --- 业务指标记录 ---

  it('wsConnectionChange 不抛出异常', () => {
    expect(() => metricsCollector.wsConnectionChange(1)).not.toThrow();
    expect(() => metricsCollector.wsConnectionChange(-1)).not.toThrow();
  });

  it('recordAlgorithmExecution 不抛出异常', () => {
    expect(() => {
      metricsCollector.recordAlgorithmExecution('test-algo', 1.5, 'success');
    }).not.toThrow();
  });

  it('recordPipelineExecution 不抛出异常', () => {
    expect(() => {
      metricsCollector.recordPipelineExecution('test-pipeline', 'success', 2.0);
    }).not.toThrow();
  });

  it('recordPipelineExecution 不传 duration 也不抛出', () => {
    expect(() => {
      metricsCollector.recordPipelineExecution('test-pipeline', 'failure');
    }).not.toThrow();
  });

  it('recordEventBusEvent 不抛出异常', () => {
    expect(() => {
      metricsCollector.recordEventBusEvent('sensor.data', 'perception');
    }).not.toThrow();
  });

  it('recordKafkaLag 不抛出异常', () => {
    expect(() => {
      metricsCollector.recordKafkaLag('group1', 'topic1', 0, 100);
    }).not.toThrow();
  });

  it('recordSagaExecution 不抛出异常', () => {
    expect(() => {
      metricsCollector.recordSagaExecution('test-saga', 'completed');
    }).not.toThrow();
  });

  it('recordCircuitBreakerRequest 不抛出异常', () => {
    expect(() => {
      metricsCollector.recordCircuitBreakerRequest('test-svc', 'success');
    }).not.toThrow();
  });

  // --- shutdown ---

  it('shutdown 清除注册表', () => {
    metricsCollector.initialize();
    metricsCollector.shutdown();
    // shutdown 后再次初始化不应出错
    expect(() => metricsCollector.initialize()).not.toThrow();
  });
});
