/**
 * DB Tracing Proxy 测试
 * CR-04: 验证 createTracedDb 的 Proxy 拦截行为
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock opentelemetry 的 traceDbQuery
vi.mock('../../../platform/middleware/opentelemetry', () => ({
  traceDbQuery: vi.fn(async (_op: string, _table: string, fn: () => Promise<any>) => fn()),
}));

import { createTracedDb } from '../tracing';
import { traceDbQuery } from '../../../platform/middleware/opentelemetry';

describe('createTracedDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该返回一个 Proxy 对象', () => {
    const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
    const traced = createTracedDb(mockDb);
    expect(traced).toBeDefined();
    expect(typeof traced).toBe('object');
  });

  it('非拦截方法应该透传', () => {
    const mockDb = {
      select: vi.fn(),
      $client: { pool: 'mock-pool' },
      customMethod: vi.fn(() => 'custom-result'),
    };
    const traced = createTracedDb(mockDb);
    expect(traced.$client).toEqual({ pool: 'mock-pool' });
    expect(traced.customMethod()).toBe('custom-result');
  });

  it('select 方法应该返回 traced query builder', () => {
    const mockQueryBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    const mockDb = { select: vi.fn(() => mockQueryBuilder) };
    const traced = createTracedDb(mockDb);

    const result = traced.select();
    expect(result).toBeDefined();
    // 返回的是 Proxy，不是原始 mockQueryBuilder
    expect(typeof result.from).toBe('function');
    expect(typeof result.where).toBe('function');
  });

  it('insert 方法应该返回 traced query builder', () => {
    const mockQueryBuilder = {
      values: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    const mockDb = { insert: vi.fn(() => mockQueryBuilder) };
    const traced = createTracedDb(mockDb);

    const result = traced.insert();
    expect(result).toBeDefined();
    expect(typeof result.values).toBe('function');
  });

  it('update 方法应该返回 traced query builder', () => {
    const mockQueryBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    const mockDb = { update: vi.fn(() => mockQueryBuilder) };
    const traced = createTracedDb(mockDb);

    const result = traced.update();
    expect(result).toBeDefined();
    expect(typeof result.set).toBe('function');
  });

  it('delete 方法应该返回 traced query builder', () => {
    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    const mockDb = { delete: vi.fn(() => mockQueryBuilder) };
    const traced = createTracedDb(mockDb);

    const result = traced.delete();
    expect(result).toBeDefined();
    expect(typeof result.where).toBe('function');
  });

  it('链式调用 .from() 应该捕获表名', () => {
    const innerBuilder = {
      where: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    const mockQueryBuilder = {
      from: vi.fn(() => innerBuilder),
    };
    const mockDb = { select: vi.fn(() => mockQueryBuilder) };
    const traced = createTracedDb(mockDb);

    const mockTable = { _: { name: 'users' } };
    const result = traced.select().from(mockTable);
    expect(result).toBeDefined();
    expect(mockQueryBuilder.from).toHaveBeenCalledWith(mockTable);
  });

  it('then() 应该调用 traceDbQuery 并执行查询', async () => {
    const resolvedValue = [{ id: 1, name: 'test' }];
    const mockQueryBuilder = {
      then: vi.fn((resolve: any) => Promise.resolve(resolve(resolvedValue))),
    };
    const mockDb = { select: vi.fn(() => mockQueryBuilder) };
    const traced = createTracedDb(mockDb);

    const result = await traced.select();
    expect(traceDbQuery).toHaveBeenCalledWith('SELECT', 'unknown', expect.any(Function));
    expect(result).toEqual(resolvedValue);
  });

  it('select 返回非对象时应直接返回', () => {
    const mockDb = { select: vi.fn(() => null) };
    const traced = createTracedDb(mockDb);
    const result = traced.select();
    expect(result).toBeNull();
  });

  it('多次链式调用应保持 tracing', () => {
    const finalBuilder = {
      then: vi.fn(),
      limit: vi.fn().mockReturnValue({ then: vi.fn() }),
    };
    const whereBuilder = {
      where: vi.fn(() => finalBuilder),
      then: vi.fn(),
    };
    const fromBuilder = {
      from: vi.fn(() => whereBuilder),
    };
    const mockDb = { select: vi.fn(() => fromBuilder) };
    const traced = createTracedDb(mockDb);

    const mockTable = { _: { name: 'devices' } };
    const result = traced.select().from(mockTable).where('condition');
    expect(result).toBeDefined();
  });
});
