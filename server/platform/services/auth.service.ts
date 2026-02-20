/**
 * AuthService — 认证与授权服务
 * 
 * 修复 P0-S01: 原桩代码对任意 token 恒返回 valid=true + admin 权限，
 * 现改为真实 JWT 验签 + 基于角色的权限查询。
 * 
 * 依赖: config.security.jwtSecret（统一密钥来源）
 */

import * as crypto from 'crypto';
import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('auth-service');

// ============================================================
// 类型定义
// ============================================================

export type TokenValidationSuccess = { valid: true; userId: string; role: string; exp: number };
export type TokenValidationFailure = { valid: false; reason: string };
export type TokenValidationResult = TokenValidationSuccess | TokenValidationFailure;

/** 角色 → 权限映射（可扩展为数据库查询） */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['read', 'write', 'admin', 'delete', 'manage-users', 'manage-plugins', 'manage-config'],
  editor: ['read', 'write', 'delete'],
  viewer: ['read'],
  system: ['read', 'write', 'admin'],
};

// ============================================================
// JWT 工具（轻量实现，无外部依赖）
// ============================================================

function base64UrlEncode(data: string): string {
  return Buffer.from(data, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function hmacSign(input: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(input)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ============================================================
// AuthService 实现
// ============================================================

export class AuthService {
  private readonly jwtSecret: string;

  constructor() {
    this.jwtSecret = config.security.jwtSecret;
  }

  /**
   * 验证 JWT Token
   * 
   * 解析 header.payload.signature 三段结构，
   * 使用 HMAC-SHA256 验签，检查 exp 过期时间。
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    if (!token || typeof token !== 'string') {
      return { valid: false, reason: 'Token is empty or not a string' };
    }

    // 安全检查：生产环境不允许使用弱密钥
    if (config.app.env === 'production' && this.jwtSecret === 'change-me-in-production') {
      log.fatal('JWT_SECRET is using default value in production — refusing to validate tokens');
      return { valid: false, reason: 'Server misconfiguration: JWT secret not set' };
    }

    const parts = token.replace(/^Bearer\s+/i, '').split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'Malformed JWT: expected 3 segments' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // 1. 验证签名
    const expectedSignature = hmacSign(`${headerB64}.${payloadB64}`, this.jwtSecret);
    // P1-AUTH-1: timingSafeEqual 要求两个 Buffer 长度相同，否则抛异常
    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(signatureB64);
    if (expectedBuf.length !== actualBuf.length) {
      return { valid: false, reason: 'Invalid signature' };
    }
    const signatureValid = crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!signatureValid) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // 2. 解析 payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(base64UrlDecode(payloadB64));
    } catch {
      return { valid: false, reason: 'Failed to parse JWT payload' };
    }

    // 3. 检查过期时间
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    if (exp > 0 && Date.now() / 1000 > exp) {
      return { valid: false, reason: 'Token expired' };
    }

    // 4. 提取用户信息
    const userId = (payload.sub ?? payload.userId ?? payload.user_id) as string | undefined;
    if (!userId) {
      return { valid: false, reason: 'Token missing subject (sub/userId)' };
    }

    const role = (payload.role ?? 'viewer') as string;

    return { valid: true, userId, role, exp };
  }

  /**
   * 获取用户权限列表（基于角色）
   * 
   * 当前为静态角色映射，后续可扩展为数据库查询。
   */
  async getUserPermissions(userId: string, role?: string): Promise<string[]> {
    const effectiveRole = role || 'viewer';
    const permissions = ROLE_PERMISSIONS[effectiveRole];

    if (!permissions) {
      log.warn({ userId, role: effectiveRole }, 'Unknown role, falling back to viewer permissions');
      return ROLE_PERMISSIONS['viewer'] || ['read'];
    }

    return permissions;
  }

  /**
   * 生成 JWT Token（用于测试和内部服务间通信）
   */
  async generateToken(payload: { userId: string; role: string; expiresInSeconds?: number }): Promise<string> {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (payload.expiresInSeconds ?? 86400); // 默认 24h

    const body = base64UrlEncode(JSON.stringify({
      sub: payload.userId,
      role: payload.role,
      iat: now,
      exp,
    }));

    const signature = hmacSign(`${header}.${body}`, this.jwtSecret);

    return `${header}.${body}.${signature}`;
  }
}

export const authService = new AuthService();
