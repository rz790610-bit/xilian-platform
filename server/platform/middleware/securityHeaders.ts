/**
 * 安全头中间件 - 平台基础设施层
 * 
 * 基于 helmet 实现 HTTP 安全头，防御 XSS、点击劫持、MIME 嗅探等攻击。
 * 同时配置 CORS 策略，替代现有的 cors: '*' 配置。
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: helmet, server/core/logger, server/core/config
 */

import helmet from 'helmet';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../core/logger';
import { config } from '../../core/config';

const log = createModuleLogger('security-headers');

// ============================================================
// 配置
// ============================================================

export interface SecurityConfig {
  /** 允许的 CORS 源 */
  corsOrigins: string[];
  /** 是否启用 HSTS */
  hsts: boolean;
  /** 是否启用 CSP */
  csp: boolean;
  /** 是否在开发环境中放宽安全策略 */
  relaxInDev: boolean;
}

function getConfig(): SecurityConfig {
  const isDev = config.app.env === 'development';
  return {
    corsOrigins: config.security.corsOrigins,
    // HSTS 只在配置了 TLS 终端时启用，避免浏览器缓存 HSTS 策略导致 HTTP 访问失败
    hsts: config.security.enableHsts,
    csp: !isDev,
    relaxInDev: isDev,
  };
}

// ============================================================
// Helmet 中间件
// ============================================================

/**
 * 创建安全头中间件
 */
export function createSecurityHeaders(): RequestHandler {
  const config = getConfig();

  const helmetMiddleware = helmet({
    // Content-Security-Policy
    contentSecurityPolicy: config.csp ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Vite HMR 需要
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'ws:', 'wss:',  // WebSocket
          'http://localhost:*',  // 开发环境
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // 禁用 upgrade-insecure-requests，避免非 TLS 环境下浏览器强制升级 HTTP→HTTPS 导致资源加载失败
        // helmet 中必须设为 null 才能彻底移除该指令（空数组 [] 仍会输出）
        upgradeInsecureRequests: null,
      },
    } : false,

    // X-Frame-Options: DENY
    frameguard: { action: 'deny' },

    // Strict-Transport-Security
    hsts: config.hsts ? {
      maxAge: 31536000,  // 1年
      includeSubDomains: true,
      preload: true,
    } : false,

    // X-Content-Type-Options: nosniff
    noSniff: undefined,

    // X-XSS-Protection
    xssFilter: undefined,

    // Referrer-Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: { allow: false },

    // X-Download-Options
    ieNoOpen: undefined,

    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // 隐藏 X-Powered-By
    hidePoweredBy: undefined,
  });

  log.info(`Security headers configured (CSP=${config.csp}, HSTS=${config.hsts})`);
  return helmetMiddleware;
}

// ============================================================
// CORS 中间件
// ============================================================

/**
 * 创建 CORS 中间件（替代 cors: '*'）
 */
export function createCorsMiddleware(): RequestHandler {
  const config = getConfig();

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (config.corsOrigins.includes('*')) {
      // 开发环境：允许所有源
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    } else if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Correlation-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');  // 24小时预检缓存
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-Correlation-ID, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');

    // 预检请求直接返回
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

// ============================================================
// 请求 ID 中间件
// ============================================================

/**
 * 为每个请求生成唯一 ID（用于日志关联和分布式追踪）
 */
export function createRequestIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string
      || req.headers['x-correlation-id'] as string
      || generateRequestId();

    // 注入到请求对象
    (req as any).requestId = requestId;

    // 返回给客户端
    res.setHeader('X-Request-ID', requestId);

    next();
  };
}

// P1-6: 使用 crypto.randomUUID 替代 Math.random，避免弱随机数碰撞
function generateRequestId(): string {
  try {
    return require('crypto').randomUUID();
  } catch {
    // fallback: 无 crypto 时使用时间戳+随机数
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }
}
