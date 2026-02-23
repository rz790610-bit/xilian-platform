/**
 * securityHeaders.ts 单元测试
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
    app: { env: 'development' },
    security: {
      corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
      enableHsts: false,
    },
  },
}));

import { createCorsMiddleware, createRequestIdMiddleware, createSecurityHeaders } from '../securityHeaders';

// 模拟 Express 的 req/res/next
function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    method: 'GET',
    headers: {},
    ...overrides,
  };
}

function createMockRes(): any {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }),
    getHeader: (key: string) => headers[key],
    removeHeader: vi.fn((key: string) => { delete headers[key]; }),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    _headers: headers,
  };
}

describe('createCorsMiddleware', () => {
  let corsMiddleware: ReturnType<typeof createCorsMiddleware>;

  beforeEach(() => {
    corsMiddleware = createCorsMiddleware();
  });

  it('对允许的 origin 设置 CORS 头', () => {
    const req = createMockReq({ headers: { origin: 'http://localhost:3000' } });
    const res = createMockRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', expect.stringContaining('GET'));
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
    expect(next).toHaveBeenCalled();
  });

  it('对不允许的 origin 不设置 Allow-Origin', () => {
    const req = createMockReq({ headers: { origin: 'http://evil.com' } });
    const res = createMockRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    // 不应设置 Allow-Origin 为 evil.com
    const allowOriginCalls = (res.setHeader as any).mock.calls.filter(
      (c: any[]) => c[0] === 'Access-Control-Allow-Origin'
    );
    if (allowOriginCalls.length > 0) {
      expect(allowOriginCalls[0][1]).not.toBe('http://evil.com');
    }
    expect(next).toHaveBeenCalled();
  });

  it('OPTIONS 预检请求返回 204', () => {
    const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
    const res = createMockRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('设置 Max-Age 预检缓存', () => {
    const req = createMockReq({ headers: { origin: 'http://localhost:3000' } });
    const res = createMockRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
  });

  it('暴露自定义响应头', () => {
    const req = createMockReq({ headers: { origin: 'http://localhost:3000' } });
    const res = createMockRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Expose-Headers',
      expect.stringContaining('X-Request-ID')
    );
  });
});

describe('createRequestIdMiddleware', () => {
  let requestIdMiddleware: ReturnType<typeof createRequestIdMiddleware>;

  beforeEach(() => {
    requestIdMiddleware = createRequestIdMiddleware();
  });

  it('使用请求头中的 x-request-id', () => {
    const req = createMockReq({ headers: { 'x-request-id': 'req-123' } });
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('req-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    expect(next).toHaveBeenCalled();
  });

  it('使用请求头中的 x-correlation-id 作为备选', () => {
    const req = createMockReq({ headers: { 'x-correlation-id': 'corr-456' } });
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('corr-456');
  });

  it('无请求头时自动生成 requestId', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeTruthy();
    expect(typeof req.requestId).toBe('string');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
  });

  it('生成的 requestId 唯一', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();
      requestIdMiddleware(req, res, next);
      ids.add(req.requestId);
    }
    expect(ids.size).toBe(100);
  });
});

describe('createSecurityHeaders', () => {
  it('返回一个中间件函数', () => {
    const middleware = createSecurityHeaders();
    expect(typeof middleware).toBe('function');
  });

  it('中间件调用 next', () => {
    const middleware = createSecurityHeaders();
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('设置安全相关的响应头', () => {
    const middleware = createSecurityHeaders();
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    // helmet 应该设置了一些安全头
    expect(res.setHeader).toHaveBeenCalled();
    const headerNames = (res.setHeader as any).mock.calls.map((c: any[]) => c[0]);
    // 至少应包含 X-Frame-Options 或类似安全头
    expect(headerNames.some((h: string) =>
      h.toLowerCase().includes('frame') ||
      h.toLowerCase().includes('content-type') ||
      h.toLowerCase().includes('referrer') ||
      h.toLowerCase().includes('powered')
    )).toBe(true);
  });
});
