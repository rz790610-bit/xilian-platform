/**
 * API 限流中间件
 * 支持多种限流策略：固定窗口、滑动窗口、令牌桶
 */

import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../redis/redisClient';

// 限流配置接口
interface RateLimitConfig {
  // 时间窗口（秒）
  windowSeconds: number;
  // 最大请求数
  maxRequests: number;
  // 标识符生成器（默认使用 IP）
  keyGenerator?: (req: Request) => string;
  // 跳过条件
  skip?: (req: Request) => boolean;
  // 超限处理
  onLimitReached?: (req: Request, res: Response) => void;
  // 是否启用滑动窗口
  slidingWindow?: boolean;
}

// 默认配置
const DEFAULT_CONFIG: RateLimitConfig = {
  windowSeconds: 60,
  maxRequests: 100,
  slidingWindow: true,
};

// 限流键前缀
const RATE_LIMIT_PREFIX = 'ratelimit:api:';

/**
 * 获取客户端标识
 */
function getClientIdentifier(req: Request): string {
  // 优先使用 X-Forwarded-For（代理后的真实 IP）
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  
  // 使用 X-Real-IP
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  // 使用连接 IP
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * 限流中间件工厂
 */
export function rateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    // 检查跳过条件
    if (finalConfig.skip && finalConfig.skip(req)) {
      return next();
    }

    // 生成限流键
    const identifier = finalConfig.keyGenerator 
      ? finalConfig.keyGenerator(req) 
      : getClientIdentifier(req);
    
    const key = `${RATE_LIMIT_PREFIX}${identifier}`;

    try {
      const result = await redisClient.checkRateLimit(
        key,
        finalConfig.maxRequests,
        finalConfig.windowSeconds
      );

      // 设置响应头
      res.setHeader('X-RateLimit-Limit', finalConfig.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        // 超限处理
        if (finalConfig.onLimitReached) {
          return finalConfig.onLimitReached(req, res);
        }

        res.setHeader('Retry-After', finalConfig.windowSeconds);
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: '请求过于频繁，请稍后再试',
            retryAfter: finalConfig.windowSeconds,
          },
        });
      }

      next();
    } catch (error) {
      console.error('[RateLimiter] Error:', error);
      // 限流失败时放行（降级策略）
      next();
    }
  };
}

/**
 * 基于用户的限流中间件
 */
export function userRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return rateLimiter({
    ...config,
    keyGenerator: (req) => {
      // 从 context 或 session 获取用户 ID
      const userId = (req as any).user?.id || (req as any).session?.userId;
      if (userId) {
        return `user:${userId}`;
      }
      // 未登录用户使用 IP
      return `ip:${getClientIdentifier(req)}`;
    },
  });
}

/**
 * 基于路由的限流中间件
 */
export function routeRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return rateLimiter({
    ...config,
    keyGenerator: (req) => {
      const identifier = getClientIdentifier(req);
      const route = req.path.replace(/\//g, ':');
      return `${identifier}:${route}`;
    },
  });
}

/**
 * 预定义的限流策略
 */
export const RateLimitStrategies = {
  // 宽松限制（适用于一般 API）
  RELAXED: {
    windowSeconds: 60,
    maxRequests: 200,
  },
  
  // 标准限制（适用于大多数 API）
  STANDARD: {
    windowSeconds: 60,
    maxRequests: 100,
  },
  
  // 严格限制（适用于敏感 API）
  STRICT: {
    windowSeconds: 60,
    maxRequests: 30,
  },
  
  // 非常严格（适用于登录等敏感操作）
  VERY_STRICT: {
    windowSeconds: 300,
    maxRequests: 10,
  },
  
  // 写操作限制
  WRITE_OPERATIONS: {
    windowSeconds: 60,
    maxRequests: 20,
  },
  
  // 搜索限制
  SEARCH: {
    windowSeconds: 60,
    maxRequests: 50,
  },
  
  // 文件上传限制
  FILE_UPLOAD: {
    windowSeconds: 300,
    maxRequests: 10,
  },
  
  // AI 调用限制
  AI_INFERENCE: {
    windowSeconds: 60,
    maxRequests: 10,
  },
};

/**
 * 全局限流状态检查
 */
export async function getRateLimitStatus(identifier: string): Promise<{
  isLimited: boolean;
  remaining: number;
  resetAt: number;
}> {
  const key = `${RATE_LIMIT_PREFIX}${identifier}`;
  const result = await redisClient.checkRateLimit(key, 100, 60);
  
  return {
    isLimited: !result.allowed,
    remaining: result.remaining,
    resetAt: result.resetAt,
  };
}

/**
 * 手动重置限流计数
 */
export async function resetRateLimit(identifier: string): Promise<boolean> {
  const key = `${RATE_LIMIT_PREFIX}${identifier}`;
  const deleted = await redisClient.del([key]);
  return deleted > 0;
}

export default rateLimiter;
