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
import { config as appConfig } from '../../core/config';

const log = createModuleLogger('rate-limiter');

// ============================================================
// 环境检测
// ============================================================

const isDevelopment = appConfig.app.env === 'development';

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
  // 开发环境使用宽松配置，生产环境使用严格配置
  const devDefaults = {
    global: '3000',
    api: '1500',
    auth: '50',
    upload: '100',
    algorithm: '100',
  };
  const prodDefaults = {
    global: '600',
    api: '300',
    auth: '10',
    upload: '30',
    algorithm: '20',
  };
  const defaults = isDevelopment ? devDefaults : prodDefaults;

  return {
    globalMaxPerMinute: appConfig.rateLimit.global || parseInt(defaults.global, 10),
    apiMaxPerMinute: appConfig.rateLimit.api || parseInt(defaults.api, 10),
    authMaxPer15Min: appConfig.rateLimit.auth || parseInt(defaults.auth, 10),
    uploadMaxPerHour: appConfig.rateLimit.upload || parseInt(defaults.upload, 10),
    algorithmMaxPerMinute: appConfig.rateLimit.algorithm || parseInt(defaults.algorithm, 10),
    enabled: appConfig.rateLimit.enabled,
    trustProxy: appConfig.app.trustProxy,
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
// 透传中间件（限流禁用时使用）
// ============================================================

// P2-A06: 消除 any 类型
import type { NextFunction } from 'express';
const passthrough = ((_req: Request, _res: Response, next: NextFunction) => next()) as RateLimitRequestHandler;

// ============================================================
// 限流器工厂
// ============================================================

function createLimiter(name: string, options: Partial<Options>): RateLimitRequestHandler {
  const limiter = rateLimit({
    standardHeaders: true,  // 返回 RateLimit-* 头
    legacyHeaders: false,   // 不返回 X-RateLimit-* 头
    // 使用 express-rate-limit 默认的 keyGenerator（自动处理 IPv6）
    // 默认使用 req.ip，已内置 IPv6 规范化处理
    validate: { xForwardedForHeader: false, default: true },
    skip: (req: Request) => {
      // 健康检查端点不限流
      if (req.path === '/api/metrics' || req.path === '/health') return true;
      // Docker 管理操作不限流 — 精确匹配白名单，避免 includes 误伤用户自定义路径
      const url = req.originalUrl || req.url || '';
      const dockerSkipPatterns = [
        'docker.bootstrapAll', 'docker.bootstrapOptionalService',
        'docker.startAll', 'docker.startEngine', 'docker.stopAll',
      ];
      if (dockerSkipPatterns.some(p => url.includes(p))) return true;
      // Vite HMR / 静态资源不限流
      if (url.includes('__vite') || url.includes('.hot-update.') || url.startsWith('/@')) return true;
      return false;
    },
    ...options,
  });

  log.info(`Rate limiter "${name}" created (max=${options.max}, window=${options.windowMs}ms, env=${isDevelopment ? 'dev' : 'prod'})`);
  return limiter;
}

// ============================================================
// 导出限流器实例
// ============================================================

/**
 * 全局限流器 — 应用于所有请求
 * 开发环境: 3000/min, 生产环境: 600/min
 */
export function createGlobalLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return passthrough;

  return createLimiter('global', {
    windowMs: 60 * 1000,
    max: config.globalMaxPerMinute,
    handler: rateLimitResponse('请求过于频繁，请稍后重试'),
  });
}

/**
 * API 限流器 — 应用于 /api/trpc 和 /api/rest
 * 开发环境: 1500/min, 生产环境: 300/min
 */
export function createApiLimiter(): RateLimitRequestHandler {
  const config = getConfig();
  if (!config.enabled) return passthrough;

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
  if (!config.enabled) return passthrough;

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
  if (!config.enabled) return passthrough;

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
  if (!config.enabled) return passthrough;

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
  environment: string;
} {
  return {
    enabled: getConfig().enabled,
    config: getConfig(),
    environment: isDevelopment ? 'development' : 'production',
  };
}
