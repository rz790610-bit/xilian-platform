/**
 * ============================================================================
 * L1 契约基层 — 桩函数标记与追踪系统 (Stub Decorator & Tracker)
 * ============================================================================
 * 
 * v3.1 自适应智能架构 · Alpha 阶段 · A-02
 * 
 * 职责：
 *   1. @stub 装饰器 — 标记类方法级桩函数
 *   2. stubFn() — 标记独立函数级桩函数
 *   3. StubTracker — 运行时追踪桩函数调用频率
 *   4. 提供统计 API — 供 Grok 平台 Agent 和前端看板消费
 * 
 * 设计原则（xAI 现实主义）：
 *   - 零侵入：装饰器不改变原函数行为，仅追加追踪
 *   - 首次告警：桩函数首次被调用时打印 WARN 日志
 *   - 热点排序：按调用频率降序，帮助确定实现优先级
 * 
 * 架构位置: server/core/stub.ts
 * 消费者: L2 Grok Platform Agent, 前端 PlatformHealth 看板, CI 扫描脚本
 */

import { createModuleLogger } from './logger';

const log = createModuleLogger('stub-tracker');

// ============ 类型定义 ============

/** 桩函数调用记录 */
export interface StubCall {
  /** 函数名 */
  functionName: string;
  /** 所在文件路径（相对于 server/） */
  filePath: string;
  /** 累计调用次数 */
  callCount: number;
  /** 首次调用时间 */
  firstCalledAt: Date;
  /** 最近调用时间 */
  lastCalledAt: Date;
}

/** 桩函数统计摘要 */
export interface StubStats {
  /** 已标记的桩函数总数 */
  totalStubs: number;
  /** 已被调用的桩函数数 */
  calledStubs: number;
  /** 从未被调用的桩函数数 */
  neverCalledStubs: number;
  /** 总调用次数 */
  totalCalls: number;
  /** 调用频率最高的 N 个 */
  topCalled: StubCall[];
  /** 全部桩函数列表 */
  all: StubCall[];
}

// ============ StubTracker 实现 ============

class StubTracker {
  /** 运行时调用追踪（仅记录被调用过的桩函数） */
  private callMap = new Map<string, StubCall>();
  /** 静态注册表（所有标记过的桩函数，无论是否被调用） */
  private registered = new Map<string, { functionName: string; filePath: string }>();

  /** 注册一个桩函数（标记时调用，不计入调用统计） */
  registerStub(functionName: string, filePath: string): void {
    const key = `${filePath}::${functionName}`;
    if (!this.registered.has(key)) {
      this.registered.set(key, { functionName, filePath });
    }
  }

  /** 记录一次桩函数调用 */
  track(functionName: string, filePath: string): void {
    const key = `${filePath}::${functionName}`;
    const existing = this.callMap.get(key);
    if (existing) {
      existing.callCount++;
      existing.lastCalledAt = new Date();
    } else {
      this.callMap.set(key, {
        functionName,
        filePath,
        callCount: 1,
        firstCalledAt: new Date(),
        lastCalledAt: new Date(),
      });
      // 首次调用时打印警告
      log.warn(`[STUB CALLED] ${filePath}::${functionName} — 此函数尚未实现`);
    }
    // 确保也在注册表中
    if (!this.registered.has(key)) {
      this.registered.set(key, { functionName, filePath });
    }
  }

  /** 获取所有被调用过的桩函数，按调用频率降序 */
  getCalledStubs(): StubCall[] {
    return Array.from(this.callMap.values()).sort((a, b) => b.callCount - a.callCount);
  }

  /** 获取调用频率最高的 N 个桩函数 */
  getTopCalled(n: number = 10): StubCall[] {
    return this.getCalledStubs().slice(0, n);
  }

  /** 获取总调用次数 */
  getTotalCalls(): number {
    let total = 0;
    for (const s of this.callMap.values()) total += s.callCount;
    return total;
  }

  /** 获取完整统计 */
  getStats(topN: number = 20): StubStats {
    const called = this.getCalledStubs();
    const calledKeys = new Set(this.callMap.keys());
    const neverCalled: StubCall[] = [];

    for (const [key, info] of this.registered) {
      if (!calledKeys.has(key)) {
        neverCalled.push({
          ...info,
          callCount: 0,
          firstCalledAt: new Date(0),
          lastCalledAt: new Date(0),
        });
      }
    }

    const all = [...called, ...neverCalled];

    return {
      totalStubs: this.registered.size,
      calledStubs: this.callMap.size,
      neverCalledStubs: neverCalled.length,
      totalCalls: this.getTotalCalls(),
      topCalled: called.slice(0, topN),
      all,
    };
  }

  /** 获取已注册的桩函数总数 */
  getRegisteredCount(): number {
    return this.registered.size;
  }
}

// ============ 全局单例 ============
export const stubTracker = new StubTracker();

// ============ @stub 装饰器（类方法级） ============

/**
 * @stub 装饰器 — 标记类方法为桩函数并追踪调用
 * 
 * 用法：
 * ```typescript
 * class MyService {
 *   @stub('services/my.service.ts')
 *   async doSomething(): Promise<Result> {
 *     return { data: [] }; // 桩返回
 *   }
 * }
 * ```
 * 
 * @param filePath 文件路径（相对于 server/）
 */
export function stub(filePath: string) {
  return function (_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // 静态注册
    stubTracker.registerStub(propertyKey, filePath);

    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      stubTracker.track(propertyKey, filePath);
      return original.apply(this, args);
    };
    // 保留函数名
    Object.defineProperty(descriptor.value, 'name', { value: propertyKey });
    return descriptor;
  };
}

// ============ stubFn（独立函数级） ============

/**
 * stubFn — 函数级桩标记（用于非 class 场景）
 * 
 * 用法：
 * ```typescript
 * const execVideoStream = stubFn('pipeline.engine.ts', 'execVideoStream',
 *   async (config: Record<string, unknown>): Promise<DataRecord[]> => {
 *     return [{ _raw: {}, _meta: { source: 'video-stub' } }];
 *   }
 * );
 * ```
 * 
 * @param filePath 文件路径（相对于 server/）
 * @param functionName 函数名
 * @param fn 原始函数
 */
export function stubFn<T extends (...args: any[]) => any>(
  filePath: string,
  functionName: string,
  fn: T
): T {
  // 静态注册
  stubTracker.registerStub(functionName, filePath);

  const wrapped = ((...args: any[]) => {
    stubTracker.track(functionName, filePath);
    return fn(...args);
  }) as T;

  return wrapped;
}

// ============ 启动日志 ============
log.info('[StubTracker] Initialized — use @stub or stubFn to mark stub functions');
