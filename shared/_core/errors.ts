/**
 * P2-A03 修复：统一错误体系
 * 
 * 原 shared/_core/errors.ts 定义了独立的 HttpError 体系，
 * 与 server/core/errors.ts 的 NexusError 体系并存，导致：
 *   1. 前端招到的错误格式不统一（HttpError 无 code/context/timestamp）
 *   2. 全局错误处理器需要同时处理两套体系
 * 
 * 现改为 NexusError 的兼容封装，保持外部 API 不变。
 * 
 * @deprecated 请直接使用 server/core/errors.ts 中的 NexusError 子类
 */

import {
  NexusError,
  ErrorCode,
  ValidationError as NexusValidationError,
  UnauthorizedError as NexusUnauthorizedError,
  ForbiddenError as NexusForbiddenError,
  NotFoundError as NexusNotFoundError,
} from '../../server/core/errors';

/**
 * HttpError 兼容层 —— 内部委托给 NexusError
 * 保留原有 statusCode 属性以兼容现有调用方
 */
export class HttpError extends NexusError {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    // 映射 HTTP 状态码到最接近的 ErrorCode
    const code = statusToErrorCode(statusCode);
    super(message, code, { originalStatusCode: statusCode });
    this.statusCode = statusCode;
    this.name = 'HttpError';
  }
}

function statusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400: return ErrorCode.VALIDATION;
    case 401: return ErrorCode.UNAUTHORIZED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 409: return ErrorCode.CONFLICT;
    case 429: return ErrorCode.RATE_LIMITED;
    default: return status >= 500 ? ErrorCode.INTERNAL : ErrorCode.UNKNOWN;
  }
}

// Convenience constructors（保持原有 API 不变）
export const BadRequestError = (msg: string) => new HttpError(400, msg);
export const UnauthorizedError = (msg: string) => new HttpError(401, msg);
export const ForbiddenError = (msg: string) => new HttpError(403, msg);
export const NotFoundError = (msg: string) => new HttpError(404, msg);
