/**
 * API 限流中间件 - 平台基础设施层
 * 
 * 基于 express-rate-limit 实现多层限流策略：
 * - 全局限流：防止 DDoS
 * - API 限流：保护 tRPC/REST 端点
 * - 认证限流：防止暴力破解
 * - 上传限流：保护文件上传端点
 * 
 * 支持 Redis 存储（分布式部署时共享限流计数器）。
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: express-rate-limit, server/core/logger
 */

import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('rate-limiter');

// ============================================================
// 配置
// ============================================================

export interface RateLimitConfig {
  /** 全局限流：每个 IP 每分钟最大请求数 */
  globalMaxPerMinute: number;
  /** API 限流：每个 IP 每分钟最大 API 请求数 */
  apiMaxPerMinute: number;
  /** 认证限流：每个 IP 每 15 分钟最大登录尝试 */
  authMaxPer15Min: number;
  /** 上传限流：每个 IP 每小时最大上传请求 */
  uploadMaxPerHour: number;
  /** 算法执行限流：每个 IP 每分钟最大算法执行数 */
  algorithmMaxPerMinute: number;
  /** 是否启用 */
  enabled: boolean;
  /** 是否信任代理 */
  trustProxy: boolean;
}

function getConfig(): RateLimitConfig {
  return {
    globalMaxPerMinute: parseInt(process.env.RATE_LIMIT_GLOBAL || '300', 10),
    apiMaxPerMinute: parseInt(process.env.RATE_LIMIT_API || '100', 10),
    authMaxPer15Min: parseInt(process.env.RATE_LIMIT_AUTH || '10', 10),
    uploadMaxPerHour: parseInt(process.env.RATE_LIMIT_UPLOAD || '30', 10),
    algorithmMaxPerMinute: parseInt(process.env.RATE_LIMIT_ALGORITHM || '20', 10),
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true',
  };
}

// ============================================================
// 限流响应格式
// ============================================================

function rateLimitResponse(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message,
      retryAfter: res.getHeader('Retry-After'),
    });
  };
}

// ============================================================
// 限流器工厂
// ============================================================

function createLimiter(name: string, options: Partial<Options>): RateLimitRequestHandler {
  const limiter = rateLimit({
    standardHeaders: true,  // 返回 RateLimit-* 头
    legacyHeaders: false,   // 不返回 X-RateLimit-* 头
    keyGenerator: (req: Request) => {
      // 优先使用 X-Forwarded-For（反向代理后）
      return req.ip || req.socket.remoteAddress || 'unknown';
    },
    skip: (req: Request) => {
      // 健康检查端点不限流
      if (req.path === '/api/metrics' || req.path === '/health') return true;
      return false;
    },
    ...options,
  });

  log.info(`Rate limiter "${name}" created (max=${options.max}, window=${options.windowMs}ms)`);
  return limiter;
}

// ============================================================
// 导出限流器实例
// ============================================================

/**
 * 全局限流器 — 应用于所有请求
 */
export function createGlobalLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return ((_req: any, _res: any, next: any) => next()) as any;

  return createLimiter('global', {
    windowMs: 60 * 1000,
    max: config.globalMaxPerMinute,
    handler: rateLimitResponse('请求过于频繁，请稍后重试'),
  });
}

/**
 * API 限流器 — 应用于 /api/trpc 和 /api/rest
 */
export function createApiLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return ((_req: any, _res: any, next: any) => next()) as any;

  return createLimiter('api', {
    windowMs: 60 * 1000,
    max: config.apiMaxPerMinute,
    handler: rateLimitResponse('API 请求过于频繁，请稍后重试'),
  });
}

/**
 * 认证限流器 — 应用于登录/注册端点
 */
export function createAuthLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return ((_req: any, _res: any, next: any) => next()) as any;

  return createLimiter('auth', {
    windowMs: 15 * 60 * 1000,
    max: config.authMaxPer15Min,
    handler: rateLimitResponse('登录尝试过多，请 15 分钟后重试'),
  });
}

/**
 * 上传限流器 — 应用于文件上传端点
 */
export function createUploadLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return ((_req: any, _res: any, next: any) => next()) as any;

  return createLimiter('upload', {
    windowMs: 60 * 60 * 1000,
    max: config.uploadMaxPerHour,
    handler: rateLimitResponse('上传请求过多，请稍后重试'),
  });
}

/**
 * 算法执行限流器 — 保护计算密集型端点
 */
export function createAlgorithmLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return ((_req: any, _res: any, next: any) => next()) as any;

  return createLimiter('algorithm', {
    windowMs: 60 * 1000,
    max: config.algorithmMaxPerMinute,
    handler: rateLimitResponse('算法执行请求过多，请稍后重试'),
  });
}

/**
 * 获取所有限流器的状态摘要
 */
export function getRateLimitStatus(): {
  enabled: boolean;
  config: RateLimitConfig;
} {
  return {
    enabled: getConfig().enabled,
    config: getConfig(),
  };
}
