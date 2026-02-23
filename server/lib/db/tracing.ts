/**
 * ============================================================================
 * CR-04: 数据库操作 OTel Tracing Wrapper
 * ============================================================================
 *
 * 通过 Proxy 拦截 drizzle ORM 的 select/insert/update/delete 操作，
 * 自动创建 OTel span，无需修改每个业务函数。
 *
 * 使用方式：
 *   import { getTracedDb } from './tracing';
 *   const db = await getTracedDb();
 *   // 所有 db.select/insert/update/delete 自动带 span
 *
 * ============================================================================
 */

import { traceDbQuery } from '../../platform/middleware/opentelemetry';

const TRACED_METHODS = ['select', 'insert', 'update', 'delete'] as const;

/**
 * 为 drizzle 实例创建 tracing proxy
 * 拦截 select/insert/update/delete 方法，自动包裹 OTel span
 */
export function createTracedDb<T extends object>(db: T): T {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // 只拦截 select/insert/update/delete
      if (typeof prop === 'string' && TRACED_METHODS.includes(prop as any) && typeof value === 'function') {
        return function tracedMethod(this: any, ...args: any[]) {
          const originalResult = value.apply(target, args);

          // drizzle 的 select/insert/update/delete 返回 query builder
          // 需要拦截最终的 execute 或 then 方法
          if (originalResult && typeof originalResult === 'object') {
            return createTracedQueryBuilder(originalResult, prop);
          }
          return originalResult;
        };
      }

      return value;
    },
  });
}

/**
 * 为 query builder 创建 tracing proxy
 * 拦截 .from()/.values()/.set()/.where() 链式调用中的表名，
 * 并在最终执行时创建 span
 */
function createTracedQueryBuilder(builder: any, operation: string): any {
  let tableName = 'unknown';

  return new Proxy(builder, {
    get(target: any, prop: string | symbol, receiver: any) {
      const value = Reflect.get(target, prop, receiver);

      // 捕获 .from(table) 中的表名
      if (prop === 'from' && typeof value === 'function') {
        return function tracedFrom(this: any, table: any, ...rest: any[]) {
          if (table && typeof table === 'object') {
            // drizzle table 对象通常有 _.name 或 Symbol.for('drizzle:Name')
            tableName = (table as any)?._?.name
              || (table as any)?.[$Symbol]
              || table?.constructor?.name
              || 'unknown';
          }
          const result = value.call(target, table, ...rest);
          return createTracedQueryBuilder(result, operation);
        };
      }

      // 拦截 then（Promise-like 执行）
      if (prop === 'then' && typeof value === 'function') {
        return function tracedThen(this: any, onFulfilled: any, onRejected: any) {
          return traceDbQuery(operation.toUpperCase(), tableName, async () => {
            return value.call(target, (v: any) => v, (e: any) => { throw e; });
          }).then(onFulfilled, onRejected);
        };
      }

      // 对链式方法返回新的 traced proxy
      if (typeof value === 'function') {
        return function chainedMethod(this: any, ...args: any[]) {
          // 尝试从 values/set 参数中提取表名
          const result = value.apply(target, args);
          if (result && typeof result === 'object' && result !== target) {
            return createTracedQueryBuilder(result, operation);
          }
          return result;
        };
      }

      return value;
    },
  });
}

// drizzle 内部用于存储表名的 Symbol
const $Symbol = Symbol.for('drizzle:Name');
