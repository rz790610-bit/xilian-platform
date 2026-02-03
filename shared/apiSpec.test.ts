/**
 * API 规范测试
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCodes,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  generateRequestId,
  isApiError,
  getErrorInfo,
  RateLimitPresets,
  API_VERSION,
} from './apiSpec';

describe('API 规范', () => {
  describe('错误码体系', () => {
    it('所有错误码应该有唯一的 code', () => {
      const codes = new Set<number>();
      
      for (const [key, value] of Object.entries(ErrorCodes)) {
        expect(codes.has(value.code)).toBe(false);
        codes.add(value.code);
      }
    });

    it('错误码应该遵循命名规范', () => {
      // 系统错误应该以 1 开头
      expect(ErrorCodes.SYSTEM_INTERNAL_ERROR.code.toString()).toMatch(/^1/);
      
      // 认证错误应该以 2 开头
      expect(ErrorCodes.AUTH_UNAUTHORIZED.code.toString()).toMatch(/^2/);
      
      // 业务错误应该以 3 开头
      expect(ErrorCodes.BIZ_INVALID_PARAMS.code.toString()).toMatch(/^3/);
      
      // 数据错误应该以 4 开头
      expect(ErrorCodes.DATA_INVALID_FORMAT.code.toString()).toMatch(/^4/);
      
      // 外部服务错误应该以 5 开头
      expect(ErrorCodes.EXTERNAL_SERVICE_ERROR.code.toString()).toMatch(/^5/);
    });

    it('所有错误码应该有有效的 HTTP 状态码', () => {
      for (const [key, value] of Object.entries(ErrorCodes)) {
        expect(value.httpStatus).toBeGreaterThanOrEqual(400);
        expect(value.httpStatus).toBeLessThan(600);
      }
    });
  });

  describe('响应构建器', () => {
    it('createSuccessResponse 应该创建正确的成功响应', () => {
      const data = { id: 1, name: 'Test' };
      const response = createSuccessResponse(data, { message: '获取成功' });

      expect(response.success).toBe(true);
      expect(response.code).toBe(0);
      expect(response.message).toBe('获取成功');
      expect(response.data).toEqual(data);
      expect(response.timestamp).toBeDefined();
    });

    it('createErrorResponse 应该创建正确的错误响应', () => {
      const response = createErrorResponse('BIZ_INVALID_PARAMS', {
        details: '参数 id 不能为空',
        field: 'id',
      });

      expect(response.success).toBe(false);
      expect(response.code).toBe(ErrorCodes.BIZ_INVALID_PARAMS.code);
      expect(response.message).toBe(ErrorCodes.BIZ_INVALID_PARAMS.message);
      expect(response.error?.details).toBe('参数 id 不能为空');
      expect(response.error?.field).toBe('id');
    });

    it('createPaginatedResponse 应该创建正确的分页响应', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = createPaginatedResponse(data, {
        page: 1,
        pageSize: 10,
        total: 25,
      });

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.pagination?.page).toBe(1);
      expect(response.pagination?.pageSize).toBe(10);
      expect(response.pagination?.total).toBe(25);
      expect(response.pagination?.totalPages).toBe(3);
    });
  });

  describe('工具函数', () => {
    it('generateRequestId 应该生成唯一的请求 ID', () => {
      const ids = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const id = generateRequestId();
        expect(id).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it('isApiError 应该正确判断错误响应', () => {
      const successResponse = createSuccessResponse({ test: true });
      const errorResponse = createErrorResponse('SYSTEM_INTERNAL_ERROR');

      expect(isApiError(successResponse)).toBe(false);
      expect(isApiError(errorResponse)).toBe(true);
    });

    it('getErrorInfo 应该返回正确的错误信息', () => {
      const info = getErrorInfo(ErrorCodes.AUTH_UNAUTHORIZED.code);
      
      expect(info).toBeDefined();
      expect(info?.code).toBe(ErrorCodes.AUTH_UNAUTHORIZED.code);
      expect(info?.message).toBe(ErrorCodes.AUTH_UNAUTHORIZED.message);
    });

    it('getErrorInfo 对于未知错误码应该返回 undefined', () => {
      const info = getErrorInfo(999999);
      expect(info).toBeUndefined();
    });
  });

  describe('限流配置', () => {
    it('所有预设策略应该有有效的配置', () => {
      for (const [name, preset] of Object.entries(RateLimitPresets)) {
        expect(preset.windowSeconds).toBeGreaterThan(0);
        expect(preset.maxRequests).toBeGreaterThan(0);
      }
    });

    it('STRICT 策略应该比 RELAXED 更严格', () => {
      expect(RateLimitPresets.STRICT.maxRequests).toBeLessThan(RateLimitPresets.RELAXED.maxRequests);
    });

    it('VERY_STRICT 策略应该是最严格的', () => {
      expect(RateLimitPresets.VERY_STRICT.maxRequests).toBeLessThanOrEqual(RateLimitPresets.STRICT.maxRequests);
    });
  });

  describe('API 版本', () => {
    it('应该有当前版本', () => {
      expect(API_VERSION.CURRENT).toBeDefined();
      expect(API_VERSION.CURRENT).toBe('v1');
    });

    it('当前版本应该在支持版本列表中', () => {
      expect(API_VERSION.SUPPORTED).toContain(API_VERSION.CURRENT);
    });
  });
});
