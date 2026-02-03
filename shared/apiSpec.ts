/**
 * API 规范定义
 * 统一响应格式、错误码体系、限流配置
 */

// ============ 错误码定义 ============

/**
 * 错误码体系
 * 格式: XYYZZZ
 * X: 错误类别 (1-系统, 2-认证, 3-业务, 4-数据, 5-外部服务)
 * YY: 模块代码
 * ZZZ: 具体错误
 */
export const ErrorCodes = {
  // 系统错误 (1XXYYY)
  SYSTEM_INTERNAL_ERROR: { code: 100001, message: '系统内部错误', httpStatus: 500 },
  SYSTEM_SERVICE_UNAVAILABLE: { code: 100002, message: '服务暂不可用', httpStatus: 503 },
  SYSTEM_TIMEOUT: { code: 100003, message: '请求超时', httpStatus: 504 },
  SYSTEM_RATE_LIMITED: { code: 100004, message: '请求过于频繁，请稍后重试', httpStatus: 429 },
  SYSTEM_MAINTENANCE: { code: 100005, message: '系统维护中', httpStatus: 503 },

  // 认证错误 (2XXYYY)
  AUTH_UNAUTHORIZED: { code: 200001, message: '未登录或登录已过期', httpStatus: 401 },
  AUTH_FORBIDDEN: { code: 200002, message: '无权限访问', httpStatus: 403 },
  AUTH_TOKEN_INVALID: { code: 200003, message: 'Token 无效', httpStatus: 401 },
  AUTH_TOKEN_EXPIRED: { code: 200004, message: 'Token 已过期', httpStatus: 401 },
  AUTH_USER_DISABLED: { code: 200005, message: '用户已被禁用', httpStatus: 403 },
  AUTH_ROLE_REQUIRED: { code: 200006, message: '需要特定角色权限', httpStatus: 403 },

  // 业务错误 - 通用 (3XXYYY)
  BIZ_INVALID_PARAMS: { code: 300001, message: '参数错误', httpStatus: 400 },
  BIZ_RESOURCE_NOT_FOUND: { code: 300002, message: '资源不存在', httpStatus: 404 },
  BIZ_RESOURCE_EXISTS: { code: 300003, message: '资源已存在', httpStatus: 409 },
  BIZ_OPERATION_FAILED: { code: 300004, message: '操作失败', httpStatus: 400 },
  BIZ_VALIDATION_FAILED: { code: 300005, message: '数据验证失败', httpStatus: 400 },

  // 业务错误 - 设备管理 (301YYY)
  DEVICE_NOT_FOUND: { code: 301001, message: '设备不存在', httpStatus: 404 },
  DEVICE_OFFLINE: { code: 301002, message: '设备离线', httpStatus: 400 },
  DEVICE_BUSY: { code: 301003, message: '设备忙碌中', httpStatus: 400 },
  DEVICE_CONFIG_INVALID: { code: 301004, message: '设备配置无效', httpStatus: 400 },

  // 业务错误 - 知识库 (302YYY)
  KNOWLEDGE_NOT_FOUND: { code: 302001, message: '知识条目不存在', httpStatus: 404 },
  KNOWLEDGE_DUPLICATE: { code: 302002, message: '知识条目已存在', httpStatus: 409 },
  KNOWLEDGE_VECTOR_FAILED: { code: 302003, message: '向量化失败', httpStatus: 500 },

  // 业务错误 - Pipeline (303YYY)
  PIPELINE_NOT_FOUND: { code: 303001, message: '管道不存在', httpStatus: 404 },
  PIPELINE_ALREADY_RUNNING: { code: 303002, message: '管道已在运行中', httpStatus: 400 },
  PIPELINE_CONFIG_INVALID: { code: 303003, message: '管道配置无效', httpStatus: 400 },
  PIPELINE_EXECUTION_FAILED: { code: 303004, message: '管道执行失败', httpStatus: 500 },

  // 业务错误 - 插件 (304YYY)
  PLUGIN_NOT_FOUND: { code: 304001, message: '插件不存在', httpStatus: 404 },
  PLUGIN_ALREADY_INSTALLED: { code: 304002, message: '插件已安装', httpStatus: 409 },
  PLUGIN_DEPENDENCY_MISSING: { code: 304003, message: '插件依赖缺失', httpStatus: 400 },
  PLUGIN_EXECUTION_FAILED: { code: 304004, message: '插件执行失败', httpStatus: 500 },

  // 数据错误 (4XXYYY)
  DATA_INVALID_FORMAT: { code: 400001, message: '数据格式错误', httpStatus: 400 },
  DATA_TOO_LARGE: { code: 400002, message: '数据过大', httpStatus: 413 },
  DATA_INTEGRITY_ERROR: { code: 400003, message: '数据完整性错误', httpStatus: 400 },
  DATA_QUERY_FAILED: { code: 400004, message: '数据查询失败', httpStatus: 500 },

  // 外部服务错误 (5XXYYY)
  EXTERNAL_SERVICE_ERROR: { code: 500001, message: '外部服务错误', httpStatus: 502 },
  EXTERNAL_SERVICE_TIMEOUT: { code: 500002, message: '外部服务超时', httpStatus: 504 },
  EXTERNAL_KAFKA_ERROR: { code: 501001, message: 'Kafka 服务错误', httpStatus: 502 },
  EXTERNAL_REDIS_ERROR: { code: 502001, message: 'Redis 服务错误', httpStatus: 502 },
  EXTERNAL_CLICKHOUSE_ERROR: { code: 503001, message: 'ClickHouse 服务错误', httpStatus: 502 },
  EXTERNAL_QDRANT_ERROR: { code: 504001, message: 'Qdrant 服务错误', httpStatus: 502 },
} as const;

export type ErrorCodeKey = keyof typeof ErrorCodes;
export type ErrorCodeValue = typeof ErrorCodes[ErrorCodeKey];

// ============ 统一响应格式 ============

/**
 * 成功响应格式
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  code: number;
  message: string;
  data: T;
  timestamp: number;
  requestId?: string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 错误响应格式
 */
export interface ApiErrorResponse {
  success: false;
  code: number;
  message: string;
  error?: {
    details?: string;
    field?: string;
    stack?: string;
  };
  timestamp: number;
  requestId?: string;
}

/**
 * 统一响应类型
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============ 响应构建器 ============

/**
 * 创建成功响应
 */
export function createSuccessResponse<T>(
  data: T,
  options?: {
    message?: string;
    pagination?: ApiSuccessResponse['pagination'];
    requestId?: string;
  }
): ApiSuccessResponse<T> {
  return {
    success: true,
    code: 0,
    message: options?.message || '操作成功',
    data,
    timestamp: Date.now(),
    requestId: options?.requestId,
    pagination: options?.pagination,
  };
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  errorCode: ErrorCodeKey | ErrorCodeValue,
  options?: {
    details?: string;
    field?: string;
    stack?: string;
    requestId?: string;
  }
): ApiErrorResponse {
  const error = typeof errorCode === 'string' ? ErrorCodes[errorCode] : errorCode;
  
  return {
    success: false,
    code: error.code,
    message: error.message,
    error: options ? {
      details: options.details,
      field: options.field,
      stack: process.env.NODE_ENV === 'development' ? options.stack : undefined,
    } : undefined,
    timestamp: Date.now(),
    requestId: options?.requestId,
  };
}

/**
 * 创建分页响应
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  },
  options?: {
    message?: string;
    requestId?: string;
  }
): ApiSuccessResponse<T[]> {
  return createSuccessResponse(data, {
    message: options?.message,
    requestId: options?.requestId,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.pageSize),
    },
  });
}

// ============ 限流配置 ============

/**
 * 限流配置
 */
export interface RateLimitConfig {
  // 时间窗口（秒）
  windowSeconds: number;
  // 窗口内最大请求数
  maxRequests: number;
  // 是否按用户限流
  perUser?: boolean;
  // 是否按 IP 限流
  perIp?: boolean;
  // 白名单
  whitelist?: string[];
  // 黑名单
  blacklist?: string[];
}

/**
 * 预定义限流策略
 */
export const RateLimitPresets = {
  // 宽松策略 - 适用于读取操作
  RELAXED: {
    windowSeconds: 60,
    maxRequests: 1000,
    perUser: false,
    perIp: true,
  },
  
  // 标准策略 - 适用于一般操作
  STANDARD: {
    windowSeconds: 60,
    maxRequests: 100,
    perUser: true,
    perIp: true,
  },
  
  // 严格策略 - 适用于写入操作
  STRICT: {
    windowSeconds: 60,
    maxRequests: 30,
    perUser: true,
    perIp: true,
  },
  
  // 极严格策略 - 适用于敏感操作
  VERY_STRICT: {
    windowSeconds: 60,
    maxRequests: 10,
    perUser: true,
    perIp: true,
  },
  
  // 批量操作策略
  BULK: {
    windowSeconds: 300,
    maxRequests: 20,
    perUser: true,
    perIp: true,
  },
} as const;

// ============ API 版本管理 ============

/**
 * API 版本
 */
export const API_VERSION = {
  CURRENT: 'v1',
  SUPPORTED: ['v1'],
  DEPRECATED: [] as string[],
};

// ============ 请求/响应头 ============

/**
 * 标准请求头
 */
export const RequestHeaders = {
  REQUEST_ID: 'X-Request-ID',
  API_VERSION: 'X-API-Version',
  CLIENT_VERSION: 'X-Client-Version',
  RATE_LIMIT_REMAINING: 'X-RateLimit-Remaining',
  RATE_LIMIT_RESET: 'X-RateLimit-Reset',
} as const;

/**
 * 标准响应头
 */
export const ResponseHeaders = {
  REQUEST_ID: 'X-Request-ID',
  RESPONSE_TIME: 'X-Response-Time',
  RATE_LIMIT_LIMIT: 'X-RateLimit-Limit',
  RATE_LIMIT_REMAINING: 'X-RateLimit-Remaining',
  RATE_LIMIT_RESET: 'X-RateLimit-Reset',
} as const;

// ============ 工具函数 ============

/**
 * 生成请求 ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${random}`;
}

/**
 * 判断是否为 API 错误
 */
export function isApiError(response: ApiResponse): response is ApiErrorResponse {
  return !response.success;
}

/**
 * 获取错误码信息
 */
export function getErrorInfo(code: number): ErrorCodeValue | undefined {
  for (const value of Object.values(ErrorCodes)) {
    if (value.code === code) {
      return value;
    }
  }
  return undefined;
}
