/**
 * errors.ts 单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  NexusError, ErrorCode,
  ValidationError, NotFoundError, AlreadyExistsError,
  UnauthorizedError, ForbiddenError,
  ConnectionError, TimeoutError, ProtocolError,
  ExternalServiceError, RateLimitedError,
  DataIntegrityError, NotImplementedError,
  isNexusError, isOperationalError, wrapError, safeExec,
} from '../errors';

describe('NexusError 基础类', () => {
  it('默认错误码为 UNKNOWN', () => {
    const err = new NexusError('test');
    expect(err.code).toBe(ErrorCode.UNKNOWN);
    expect(err.httpStatus).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe('test');
    expect(err.timestamp).toBeTruthy();
  });

  it('支持自定义错误码和上下文', () => {
    const err = new NexusError('test', ErrorCode.VALIDATION, { field: 'name' });
    expect(err.code).toBe(ErrorCode.VALIDATION);
    expect(err.httpStatus).toBe(400);
    expect(err.context).toEqual({ field: 'name' });
  });

  it('toJSON 序列化正确', () => {
    const err = new NexusError('test', ErrorCode.NOT_FOUND, { id: '123' });
    const json = err.toJSON();
    expect(json.error).toBe('NexusError');
    expect(json.code).toBe(ErrorCode.NOT_FOUND);
    expect(json.message).toBe('test');
    expect(json.context).toEqual({ id: '123' });
    expect(json.timestamp).toBeTruthy();
  });
});

describe('具体错误类', () => {
  it('ValidationError → 400', () => {
    const err = new ValidationError('invalid input', { field: 'port' });
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe(ErrorCode.VALIDATION);
    expect(err.name).toBe('ValidationError');
  });

  it('NotFoundError 带 resource 和 id', () => {
    const err = new NotFoundError('device', 'D001');
    expect(err.message).toBe("device 'D001' not found");
    expect(err.httpStatus).toBe(404);
    expect(err.context.resource).toBe('device');
    expect(err.context.id).toBe('D001');
  });

  it('NotFoundError 不带 id', () => {
    const err = new NotFoundError('device');
    expect(err.message).toBe('device not found');
  });

  it('AlreadyExistsError → 409', () => {
    const err = new AlreadyExistsError('user', 'admin');
    expect(err.httpStatus).toBe(409);
    expect(err.code).toBe(ErrorCode.ALREADY_EXISTS);
  });

  it('UnauthorizedError → 401', () => {
    const err = new UnauthorizedError();
    expect(err.httpStatus).toBe(401);
    expect(err.message).toBe('Authentication required');
  });

  it('ForbiddenError → 403', () => {
    const err = new ForbiddenError('no access');
    expect(err.httpStatus).toBe(403);
  });

  it('ConnectionError → 502', () => {
    const err = new ConnectionError('mqtt', 'refused', { host: 'localhost' });
    expect(err.httpStatus).toBe(502);
    expect(err.message).toContain('mqtt');
    expect(err.context.target).toBe('mqtt');
  });

  it('TimeoutError → 504', () => {
    const err = new TimeoutError('db query', 5000);
    expect(err.httpStatus).toBe(504);
    expect(err.message).toContain('5000ms');
  });

  it('ProtocolError → 502', () => {
    const err = new ProtocolError('MQTT', 'malformed packet');
    expect(err.httpStatus).toBe(502);
    expect(err.message).toContain('[MQTT]');
  });

  it('ExternalServiceError → 502', () => {
    const err = new ExternalServiceError('OpenAI', 'rate limited');
    expect(err.httpStatus).toBe(502);
    expect(err.context.service).toBe('OpenAI');
  });

  it('RateLimitedError → 429', () => {
    const err = new RateLimitedError('/api/chat', 60000);
    expect(err.httpStatus).toBe(429);
    expect(err.context.retryAfterMs).toBe(60000);
  });

  it('DataIntegrityError 非运营性错误', () => {
    const err = new DataIntegrityError('checksum mismatch');
    expect(err.httpStatus).toBe(500);
    expect(err.isOperational).toBe(false);
  });

  it('NotImplementedError → 501', () => {
    const err = new NotImplementedError('streaming');
    expect(err.httpStatus).toBe(501);
    expect(err.message).toContain('streaming');
  });
});

describe('错误处理工具', () => {
  it('isNexusError 正确识别', () => {
    expect(isNexusError(new NexusError('test'))).toBe(true);
    expect(isNexusError(new ValidationError('test'))).toBe(true);
    expect(isNexusError(new Error('test'))).toBe(false);
    expect(isNexusError('test')).toBe(false);
    expect(isNexusError(null)).toBe(false);
  });

  it('isOperationalError 正确判断', () => {
    expect(isOperationalError(new ValidationError('test'))).toBe(true);
    expect(isOperationalError(new DataIntegrityError('test'))).toBe(false);
    expect(isOperationalError(new Error('test'))).toBe(false);
  });

  it('wrapError 包装普通 Error', () => {
    const original = new Error('something broke');
    const wrapped = wrapError(original, { module: 'test' });
    expect(wrapped).toBeInstanceOf(NexusError);
    expect(wrapped.message).toBe('something broke');
    expect(wrapped.code).toBe(ErrorCode.INTERNAL);
    expect(wrapped.context.originalName).toBe('Error');
    expect(wrapped.context.module).toBe('test');
  });

  it('wrapError 不重复包装 NexusError', () => {
    const original = new NotFoundError('device', 'D001');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('wrapError 包装非 Error 值', () => {
    const wrapped = wrapError('string error');
    expect(wrapped).toBeInstanceOf(NexusError);
    expect(wrapped.message).toBe('string error');
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN);
  });

  it('safeExec 成功路径', async () => {
    const [result, error] = await safeExec(async () => 42);
    expect(result).toBe(42);
    expect(error).toBeNull();
  });

  it('safeExec 失败路径', async () => {
    const [result, error] = await safeExec(async () => {
      throw new Error('boom');
    });
    expect(result).toBeNull();
    expect(error).toBeInstanceOf(NexusError);
    expect(error!.message).toBe('boom');
  });
});
