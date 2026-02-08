/**
 * 全局错误处理中间件
 */

import { Request, Response, NextFunction } from 'express';
import { TRPCError } from '@trpc/server';
import { 
  ErrorCodes, 
  createErrorResponse, 
  ErrorCodeKey,
  generateRequestId,
  ResponseHeaders 
} from '@shared/apiSpec';

/**
 * API 错误类
 */
export class ApiError extends Error {
  public readonly code: number;
  public readonly httpStatus: number;
  public readonly details?: string;
  public readonly field?: string;

  constructor(
    errorKey: ErrorCodeKey,
    options?: {
      details?: string;
      field?: string;
    }
  ) {
    const errorInfo = ErrorCodes[errorKey];
    super(errorInfo.message);
    this.name = 'ApiError';
    this.code = errorInfo.code;
    this.httpStatus = errorInfo.httpStatus;
    this.details = options?.details;
    this.field = options?.field;
  }

  static fromCode(code: number, message?: string): ApiError {
    // 查找对应的错误码
    for (const [key, value] of Object.entries(ErrorCodes)) {
      if (value.code === code) {
        return new ApiError(key as ErrorCodeKey, { details: message });
      }
    }
    return new ApiError('SYSTEM_INTERNAL_ERROR', { details: message });
  }
}

/**
 * 将错误转换为 API 错误
 */
export function normalizeError(error: unknown): {
  errorKey: ErrorCodeKey;
  details?: string;
  stack?: string;
} {
  // API 错误
  if (error instanceof ApiError) {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      if (value.code === error.code) {
        return {
          errorKey: key as ErrorCodeKey,
          details: error.details,
          stack: error.stack,
        };
      }
    }
  }

  // tRPC 错误
  if (error instanceof TRPCError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return { errorKey: 'AUTH_UNAUTHORIZED', details: error.message, stack: error.stack };
      case 'FORBIDDEN':
        return { errorKey: 'AUTH_FORBIDDEN', details: error.message, stack: error.stack };
      case 'NOT_FOUND':
        return { errorKey: 'BIZ_RESOURCE_NOT_FOUND', details: error.message, stack: error.stack };
      case 'BAD_REQUEST':
        return { errorKey: 'BIZ_INVALID_PARAMS', details: error.message, stack: error.stack };
      case 'CONFLICT':
        return { errorKey: 'BIZ_RESOURCE_EXISTS', details: error.message, stack: error.stack };
      case 'TIMEOUT':
        return { errorKey: 'SYSTEM_TIMEOUT', details: error.message, stack: error.stack };
      case 'TOO_MANY_REQUESTS':
        return { errorKey: 'SYSTEM_RATE_LIMITED', details: error.message, stack: error.stack };
      default:
        return { errorKey: 'SYSTEM_INTERNAL_ERROR', details: error.message, stack: error.stack };
    }
  }

  // 标准错误
  if (error instanceof Error) {
    // 数据库错误
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ECONNRESET')) {
      return { errorKey: 'SYSTEM_SERVICE_UNAVAILABLE', details: error.message, stack: error.stack };
    }
    if (error.message.includes('Duplicate entry')) {
      return { errorKey: 'BIZ_RESOURCE_EXISTS', details: error.message, stack: error.stack };
    }
    if (error.message.includes('not found') || error.message.includes('Not found')) {
      return { errorKey: 'BIZ_RESOURCE_NOT_FOUND', details: error.message, stack: error.stack };
    }
    
    return { errorKey: 'SYSTEM_INTERNAL_ERROR', details: error.message, stack: error.stack };
  }

  // 未知错误
  return { errorKey: 'SYSTEM_INTERNAL_ERROR', details: String(error) };
}

/**
 * Express 错误处理中间件
 */
export function expressErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers[ResponseHeaders.REQUEST_ID.toLowerCase()] as string) || generateRequestId();
  const startTime = (req as Request & { startTime?: number }).startTime || Date.now();
  
  const { errorKey, details, stack } = normalizeError(error);
  const errorInfo = ErrorCodes[errorKey];
  
  const response = createErrorResponse(errorKey, {
    details,
    stack,
    requestId,
  });

  // 设置响应头
  res.setHeader(ResponseHeaders.REQUEST_ID, requestId);
  res.setHeader(ResponseHeaders.RESPONSE_TIME, `${Date.now() - startTime}ms`);

  // 记录错误日志
  console.error(`[API Error] ${requestId}`, {
    path: req.path,
    method: req.method,
    code: errorInfo.code,
    message: errorInfo.message,
    details,
    stack: process.env.NODE_ENV === 'development' ? stack : undefined,
  });

  res.status(errorInfo.httpStatus).json(response);
}

/**
 * 请求开始时间中间件
 */
export function requestTimingMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  (req as Request & { startTime: number }).startTime = Date.now();
  next();
}

/**
 * 请求 ID 中间件
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers[ResponseHeaders.REQUEST_ID.toLowerCase()] as string) || generateRequestId();
  req.headers[ResponseHeaders.REQUEST_ID.toLowerCase()] = requestId;
  res.setHeader(ResponseHeaders.REQUEST_ID, requestId);
  next();
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers[ResponseHeaders.REQUEST_ID.toLowerCase()] as string) || generateRequestId();
  
  const response = createErrorResponse('BIZ_RESOURCE_NOT_FOUND', {
    details: `路径 ${req.path} 不存在`,
    requestId,
  });

  res.status(404).json(response);
}

/**
 * 创建 tRPC 错误格式化器
 */
export function createTRPCErrorFormatter() {
  return ({ error, shape }: { error: TRPCError; shape: unknown }) => {
    const { errorKey, details } = normalizeError(error);
    const errorInfo = ErrorCodes[errorKey];

    return {
      ...shape as object,
      data: {
        code: errorInfo.code,
        message: errorInfo.message,
        details,
        httpStatus: errorInfo.httpStatus,
      },
    };
  };
}
