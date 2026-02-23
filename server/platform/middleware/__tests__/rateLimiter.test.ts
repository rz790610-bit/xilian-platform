/**
 * rateLimiter.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    app: { env: 'development', trustProxy: false },
    rateLimit: {
      global: 3000,
      api: 1500,
      auth: 50,
      upload: 100,
      algorithm: 100,
      enabled: true,
    },
    security: {
      corsOrigins: ['*'],
      enableHsts: false,
    },
  },
}));

import {
  createGlobalLimiter,
  createApiLimiter,
  createAuthLimiter,
  createUploadLimiter,
  createAlgorithmLimiter,
  getRateLimitStatus,
} from '../rateLimiter';

describe('限流器工厂函数', () => {
  it('createGlobalLimiter 返回中间件函数', () => {
    const limiter = createGlobalLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createApiLimiter 返回中间件函数', () => {
    const limiter = createApiLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createAuthLimiter 返回中间件函数', () => {
    const limiter = createAuthLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createUploadLimiter 返回中间件函数', () => {
    const limiter = createUploadLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('createAlgorithmLimiter 返回中间件函数', () => {
    const limiter = createAlgorithmLimiter();
    expect(typeof limiter).toBe('function');
  });
});

describe('getRateLimitStatus', () => {
  it('返回启用状态', () => {
    const status = getRateLimitStatus();
    expect(status.enabled).toBe(true);
  });

  it('返回开发环境标识', () => {
    const status = getRateLimitStatus();
    expect(status.environment).toBe('development');
  });

  it('返回完整配置', () => {
    const status = getRateLimitStatus();
    expect(status.config.globalMaxPerMinute).toBe(3000);
    expect(status.config.apiMaxPerMinute).toBe(1500);
    expect(status.config.authMaxPer15Min).toBe(50);
    expect(status.config.uploadMaxPerHour).toBe(100);
    expect(status.config.algorithmMaxPerMinute).toBe(100);
  });
});

describe('限流器中间件行为', () => {
  function makeMockReq(overrides: Record<string, any> = {}): any {
    return {
      method: 'GET',
      ip: '127.0.0.1',
      path: '/api/test',
      url: '/api/test',
      originalUrl: '/api/test',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' },
      app: { get: () => false },
      ...overrides,
    };
  }

  function makeMockRes(): any {
    return {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      end: vi.fn(),
    };
  }

  it('全局限流器允许正常请求通过', async () => {
    const limiter = createGlobalLimiter();
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedNext = (...args: any[]) => { next(...args); resolve(); };
      limiter(req, res, wrappedNext);
      // 如果 limiter 是同步的，next 已被调用
      if (next.mock.calls.length > 0) resolve();
    });
    expect(next).toHaveBeenCalled();
  });

  it('健康检查端点跳过限流', async () => {
    const limiter = createGlobalLimiter();
    const req = makeMockReq({ path: '/health', url: '/health', originalUrl: '/health' });
    const res = makeMockRes();
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedNext = (...args: any[]) => { next(...args); resolve(); };
      limiter(req, res, wrappedNext);
      if (next.mock.calls.length > 0) resolve();
    });
    expect(next).toHaveBeenCalled();
  });

  it('metrics 端点跳过限流', async () => {
    const limiter = createGlobalLimiter();
    const req = makeMockReq({ path: '/api/metrics', url: '/api/metrics', originalUrl: '/api/metrics' });
    const res = makeMockRes();
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedNext = (...args: any[]) => { next(...args); resolve(); };
      limiter(req, res, wrappedNext);
      if (next.mock.calls.length > 0) resolve();
    });
    expect(next).toHaveBeenCalled();
  });

  it('Vite HMR 请求跳过限流', async () => {
    const limiter = createGlobalLimiter();
    const req = makeMockReq({ path: '/__vite/client', url: '/__vite/client', originalUrl: '/__vite/client' });
    const res = makeMockRes();
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedNext = (...args: any[]) => { next(...args); resolve(); };
      limiter(req, res, wrappedNext);
      if (next.mock.calls.length > 0) resolve();
    });
    expect(next).toHaveBeenCalled();
  });

  it('Docker 管理操作跳过限流', async () => {
    const limiter = createGlobalLimiter();
    const req = makeMockReq({
      method: 'POST',
      path: '/api/trpc',
      url: '/api/trpc/docker.bootstrapAll',
      originalUrl: '/api/trpc/docker.bootstrapAll',
    });
    const res = makeMockRes();
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      const wrappedNext = (...args: any[]) => { next(...args); resolve(); };
      limiter(req, res, wrappedNext);
      if (next.mock.calls.length > 0) resolve();
    });
    expect(next).toHaveBeenCalled();
  });
});
