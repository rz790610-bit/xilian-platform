/**
 * PortAI Nexus — 统一错误体系
 * 分层错误类 + 错误码 + 自动 HTTP 状态码映射
 * 
 * 使用方式：
 *   import { NotFoundError, ValidationError, ConnectionError } from '../core/errors';
 *   throw new NotFoundError('device', nodeId);
 *   throw new ValidationError('Invalid port number', { field: 'port', value: -1 });
 *   throw new ConnectionError('mqtt', 'Connection refused', { host, port });
 */

// ============================================
// 错误码枚举
// ============================================

export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 1000,
  INTERNAL = 1001,
  NOT_IMPLEMENTED = 1002,
  SERVICE_UNAVAILABLE = 1003,
  TIMEOUT = 1004,

  // 验证错误 (2xxx)
  VALIDATION = 2000,
  INVALID_INPUT = 2001,
  MISSING_REQUIRED = 2002,
  TYPE_MISMATCH = 2003,
  OUT_OF_RANGE = 2004,

  // 认证/授权错误 (3xxx)
  UNAUTHORIZED = 3000,
  FORBIDDEN = 3001,
  TOKEN_EXPIRED = 3002,
  INVALID_CREDENTIALS = 3003,

  // 资源错误 (4xxx)
  NOT_FOUND = 4000,
  ALREADY_EXISTS = 4001,
  CONFLICT = 4002,
  GONE = 4003,

  // 连接错误 (5xxx)
  CONNECTION_FAILED = 5000,
  CONNECTION_TIMEOUT = 5001,
  CONNECTION_REFUSED = 5002,
  CONNECTION_CLOSED = 5003,
  AUTH_FAILED = 5004,

  // 协议错误 (6xxx)
  PROTOCOL_ERROR = 6000,
  UNSUPPORTED_PROTOCOL = 6001,
  MALFORMED_MESSAGE = 6002,

  // 外部服务错误 (7xxx)
  EXTERNAL_SERVICE = 7000,
  RATE_LIMITED = 7001,
  QUOTA_EXCEEDED = 7002,

  // 数据错误 (8xxx)
  DATA_INTEGRITY = 8000,
  SCHEMA_MISMATCH = 8001,
  MIGRATION_FAILED = 8002,
}

// 错误码到 HTTP 状态码的映射
const ERROR_HTTP_STATUS: Record<number, number> = {
  [ErrorCode.UNKNOWN]: 500,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED]: 400,
  [ErrorCode.TYPE_MISMATCH]: 400,
  [ErrorCode.OUT_OF_RANGE]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.GONE]: 410,
  [ErrorCode.CONNECTION_FAILED]: 502,
  [ErrorCode.CONNECTION_TIMEOUT]: 504,
  [ErrorCode.CONNECTION_REFUSED]: 502,
  [ErrorCode.CONNECTION_CLOSED]: 502,
  [ErrorCode.AUTH_FAILED]: 502,
  [ErrorCode.PROTOCOL_ERROR]: 502,
  [ErrorCode.UNSUPPORTED_PROTOCOL]: 400,
  [ErrorCode.MALFORMED_MESSAGE]: 400,
  [ErrorCode.EXTERNAL_SERVICE]: 502,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.QUOTA_EXCEEDED]: 429,
  [ErrorCode.DATA_INTEGRITY]: 500,
  [ErrorCode.SCHEMA_MISMATCH]: 500,
  [ErrorCode.MIGRATION_FAILED]: 500,
};

// ============================================
// 基础错误类
// ============================================

export class NexusError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly context: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context: Record<string, unknown> = {},
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code] || 500;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  /** 序列化为 API 响应格式 */
  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

// ============================================
// 具体错误类
// ============================================

/** 验证错误 */
export class ValidationError extends NexusError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, ErrorCode.VALIDATION, context);
  }
}

/** 资源未找到 */
export class NotFoundError extends NexusError {
  constructor(resource: string, id?: string | number, context: Record<string, unknown> = {}) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(msg, ErrorCode.NOT_FOUND, { resource, id, ...context });
  }
}

/** 资源已存在 */
export class AlreadyExistsError extends NexusError {
  constructor(resource: string, identifier: string, context: Record<string, unknown> = {}) {
    super(`${resource} '${identifier}' already exists`, ErrorCode.ALREADY_EXISTS, { resource, identifier, ...context });
  }
}

/** 认证错误 */
export class UnauthorizedError extends NexusError {
  constructor(message = 'Authentication required', context: Record<string, unknown> = {}) {
    super(message, ErrorCode.UNAUTHORIZED, context);
  }
}

/** 权限不足 */
export class ForbiddenError extends NexusError {
  constructor(message = 'Permission denied', context: Record<string, unknown> = {}) {
    super(message, ErrorCode.FORBIDDEN, context);
  }
}

/** 连接错误 */
export class ConnectionError extends NexusError {
  constructor(target: string, message: string, context: Record<string, unknown> = {}) {
    super(`Connection to ${target} failed: ${message}`, ErrorCode.CONNECTION_FAILED, { target, ...context });
  }
}

/** 连接超时 */
export class TimeoutError extends NexusError {
  constructor(operation: string, timeoutMs: number, context: Record<string, unknown> = {}) {
    super(`${operation} timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT, { operation, timeoutMs, ...context });
  }
}

/** 协议错误 */
export class ProtocolError extends NexusError {
  constructor(protocol: string, message: string, context: Record<string, unknown> = {}) {
    super(`[${protocol}] ${message}`, ErrorCode.PROTOCOL_ERROR, { protocol, ...context });
  }
}

/** 外部服务错误 */
export class ExternalServiceError extends NexusError {
  constructor(service: string, message: string, context: Record<string, unknown> = {}) {
    super(`External service '${service}': ${message}`, ErrorCode.EXTERNAL_SERVICE, { service, ...context });
  }
}

/** 限流错误 */
export class RateLimitedError extends NexusError {
  constructor(resource: string, retryAfterMs?: number, context: Record<string, unknown> = {}) {
    super(`Rate limited on ${resource}`, ErrorCode.RATE_LIMITED, { resource, retryAfterMs, ...context });
  }
}

/** 数据完整性错误 */
export class DataIntegrityError extends NexusError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, ErrorCode.DATA_INTEGRITY, context, false); // 非运营性错误
  }
}

/** 未实现错误 */
export class NotImplementedError extends NexusError {
  constructor(feature: string, context: Record<string, unknown> = {}) {
    super(`${feature} is not yet implemented`, ErrorCode.NOT_IMPLEMENTED, { feature, ...context });
  }
}

// ============================================
// 错误处理工具
// ============================================

/** 判断是否为 NexusError */
export function isNexusError(err: unknown): err is NexusError {
  return err instanceof NexusError;
}

/** 判断是否为可恢复的运营性错误 */
export function isOperationalError(err: unknown): boolean {
  if (isNexusError(err)) return err.isOperational;
  return false;
}

/** 将未知错误包装为 NexusError */
export function wrapError(err: unknown, context: Record<string, unknown> = {}): NexusError {
  if (isNexusError(err)) return err;
  
  if (err instanceof Error) {
    return new NexusError(err.message, ErrorCode.INTERNAL, {
      originalName: err.name,
      stack: err.stack,
      ...context,
    });
  }

  return new NexusError(String(err), ErrorCode.UNKNOWN, context);
}

/** 安全执行异步操作，捕获并包装错误 */
export async function safeExec<T>(
  fn: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<[T, null] | [null, NexusError]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (err) {
    return [null, wrapError(err, context)];
  }
}
