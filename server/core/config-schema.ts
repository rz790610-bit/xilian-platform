/**
 * ============================================================================
 * 配置验证 Schema — Zod 强类型验证
 * ============================================================================
 *
 * 整改方案 v2.1 A-04: 配置验证强化
 *
 * 用途：
 *   1. 启动时验证所有环境变量的类型和范围
 *   2. 生产环境强制必填字段（JWT_SECRET、MYSQL_PASSWORD 等）
 *   3. 提供清晰的错误消息，帮助快速定位配置问题
 *   4. 替代 config.ts 中手工的 if/else 验证逻辑
 *
 * 使用方式：
 *   import { validateConfigWithSchema } from './config-schema';
 *   const result = validateConfigWithSchema(config);
 *   if (!result.success) process.exit(1);
 *
 * ============================================================================
 */

import { z } from 'zod';
import { createModuleLogger } from './logger';

const log = createModuleLogger('config-validator');

// ============================================================
// Schema 定义
// ============================================================

/** 端口号范围验证 */
const portSchema = z.number().int().min(1).max(65535);

/** 非空字符串（生产环境必填字段用） */
const requiredString = z.string().min(1, 'must not be empty');

/** 应用基础配置 */
const appSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'must be semver format (e.g., 4.0.0)'),
  env: z.enum(['development', 'production', 'test']),
  port: portSchema,
  host: z.string().min(1),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
  baseUrl: z.string().url('must be a valid URL'),
});

/** MySQL 配置（基础） */
const mysqlBaseSchema = z.object({
  host: z.string().min(1),
  port: portSchema,
  user: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
  poolSize: z.number().int().min(1).max(200),
  ssl: z.boolean(),
});

/** Redis 配置 */
const redisSchema = z.object({
  host: z.string().min(1),
  port: portSchema,
  password: z.string(),
  db: z.number().int().min(0).max(15),
  keyPrefix: z.string(),
  maxRetries: z.number().int().min(0).max(100),
});

/** Kafka 配置 */
const kafkaSchema = z.object({
  brokers: z.array(z.string().min(1)).min(1, 'at least one broker required'),
  clientId: z.string().min(1),
  groupId: z.string().min(1),
  ssl: z.boolean(),
  saslMechanism: z.enum(['', 'plain', 'scram-sha-256', 'scram-sha-512']),
  saslUsername: z.string(),
  saslPassword: z.string(),
});

/** ClickHouse 配置 */
const clickhouseSchema = z.object({
  host: z.string().min(1),
  port: portSchema,
  nativePort: portSchema,
  user: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
  ssl: z.boolean(),
});

/** MinIO 配置 */
const minioSchema = z.object({
  endpoint: z.string().min(1),
  port: portSchema,
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
  bucket: z.string().min(1),
  useSSL: z.boolean(),
  region: z.string().min(1),
});

/** 安全配置 */
const securitySchema = z.object({
  jwtSecret: z.string().min(1),
  jwtExpiresIn: z.string().regex(/^\d+[smhd]$/, 'must be like 24h, 7d, 3600s'),
  bcryptRounds: z.number().int().min(4).max(31),
  corsOrigins: z.array(z.string()),
  rateLimitWindowMs: z.number().int().min(1000),
  rateLimitMax: z.number().int().min(1),
});

/** 完整配置 Schema */
const configSchema = z.object({
  app: appSchema,
  mysql: mysqlBaseSchema,
  clickhouse: clickhouseSchema,
  redis: redisSchema,
  kafka: kafkaSchema,
  minio: minioSchema,
  security: securitySchema,
});

// ============================================================
// 生产环境额外验证
// ============================================================

/**
 * 生产环境特有的严格验证规则
 */
function validateProductionConstraints(cfg: any): string[] {
  const errors: string[] = [];

  if (cfg.security.jwtSecret === 'change-me-in-production') {
    errors.push('[FATAL] security.jwtSecret: using default value in production — this is a critical security vulnerability');
  }

  if (cfg.security.jwtSecret.length < 32) {
    errors.push('[CRITICAL] security.jwtSecret: must be at least 32 characters in production');
  }

  if (cfg.security.corsOrigins.includes('*')) {
    errors.push('[CRITICAL] security.corsOrigins: wildcard (*) is not allowed in production');
  }

  if (!cfg.mysql.password) {
    errors.push('[CRITICAL] mysql.password: must be set in production');
  }

  if (cfg.mysql.ssl === false) {
    // 不阻断，但警告
  }

  return errors;
}

// ============================================================
// 公开 API
// ============================================================

export interface ConfigValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 使用 Zod Schema 验证配置
 *
 * @param cfg - config 对象（来自 config.ts）
 * @returns 验证结果
 */
export function validateConfigWithSchema(cfg: any): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 第一层：Zod schema 验证（类型 + 范围）
  const result = configSchema.safeParse(cfg);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      errors.push(`${path}: ${issue.message}`);
    }
  }

  // 第二层：生产环境业务规则验证
  if (cfg.app?.env === 'production') {
    const prodErrors = validateProductionConstraints(cfg);
    errors.push(...prodErrors);
  }

  // 第三层：开发环境警告
  if (cfg.app?.env === 'development') {
    if (cfg.security?.jwtSecret === 'change-me-in-production') {
      warnings.push('security.jwtSecret: using default value (acceptable in development)');
    }
    if (cfg.mysql?.password === '') {
      warnings.push('mysql.password: empty (acceptable in development with Docker)');
    }
  }

  // 输出结果
  const success = errors.length === 0;

  if (errors.length > 0) {
    log.warn({ errors }, `Configuration validation found ${errors.length} error(s) — review above`);
  }

  if (warnings.length > 0) {
    log.warn({ warnings }, `Configuration warnings (${warnings.length})`);
  }

  if (success) {
    log.info('Configuration validation passed');
  }

  return { success, errors, warnings };
}

/**
 * 启动时验证配置并快速失败
 * 在 server/core/index.ts 的启动序列中调用
 */
export function validateConfigOrDie(cfg: any): void {
  const result = validateConfigWithSchema(cfg);
  if (!result.success) {
    log.fatal(
      { errors: result.errors },
      'Configuration validation failed. Fix the above errors and restart.'
    );
    process.exit(1);
  }
}
