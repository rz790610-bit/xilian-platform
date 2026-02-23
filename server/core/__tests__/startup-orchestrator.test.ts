/**
 * 启动编排器测试
 * 整改方案 v2.1 — B-02 启动序列显式化
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  topologicalSort,
  withTimeout,
  executeStartupSequence,
  getStartupSummary,
  setStartupResult,
  type StartupTask,
} from '../startup';

// ============================================================
// 辅助函数
// ============================================================

function makeTask(overrides: Partial<StartupTask> & { id: string }): StartupTask {
  return {
    label: overrides.id,
    dependencies: [],
    critical: false,
    timeout: 5000,
    init: async () => {},
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 拓扑排序测试
// ============================================================

describe('topologicalSort', () => {
  it('无依赖的任务应该在同一层', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b' }),
      makeTask({ id: 'c' }),
    ];
    const layers = topologicalSort(tasks);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(3);
  });

  it('线性依赖应该产生线性层', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', dependencies: ['a'] }),
      makeTask({ id: 'c', dependencies: ['b'] }),
    ];
    const layers = topologicalSort(tasks);
    expect(layers).toHaveLength(3);
    expect(layers[0][0].id).toBe('a');
    expect(layers[1][0].id).toBe('b');
    expect(layers[2][0].id).toBe('c');
  });

  it('菱形依赖应该正确分层', () => {
    // a → b, a → c, b → d, c → d
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', dependencies: ['a'] }),
      makeTask({ id: 'c', dependencies: ['a'] }),
      makeTask({ id: 'd', dependencies: ['b', 'c'] }),
    ];
    const layers = topologicalSort(tasks);
    expect(layers).toHaveLength(3);
    expect(layers[0].map(t => t.id)).toEqual(['a']);
    expect(layers[1].map(t => t.id).sort()).toEqual(['b', 'c']);
    expect(layers[2].map(t => t.id)).toEqual(['d']);
  });

  it('循环依赖应该抛出错误', () => {
    const tasks = [
      makeTask({ id: 'a', dependencies: ['b'] }),
      makeTask({ id: 'b', dependencies: ['a'] }),
    ];
    expect(() => topologicalSort(tasks)).toThrow('Circular dependency');
  });

  it('不存在的依赖应该抛出错误', () => {
    const tasks = [
      makeTask({ id: 'a', dependencies: ['nonexistent'] }),
    ];
    expect(() => topologicalSort(tasks)).toThrow('does not exist');
  });

  it('空任务列表应该返回空层', () => {
    const layers = topologicalSort([]);
    expect(layers).toHaveLength(0);
  });

  it('复杂依赖图应该正确排序', () => {
    // 模拟实际启动序列的简化版
    const tasks = [
      makeTask({ id: 'otel' }),
      makeTask({ id: 'config-center' }),
      makeTask({ id: 'health-check', dependencies: ['otel'] }),
      makeTask({ id: 'outbox', dependencies: ['config-center'] }),
      makeTask({ id: 'event-bus', dependencies: ['outbox'] }),
      makeTask({ id: 'data-artery', dependencies: ['config-center', 'event-bus'] }),
    ];
    const layers = topologicalSort(tasks);
    
    // otel 和 config-center 在第一层
    expect(layers[0].map(t => t.id).sort()).toEqual(['config-center', 'otel']);
    
    // data-artery 应该在最后
    const lastLayer = layers[layers.length - 1];
    expect(lastLayer.map(t => t.id)).toContain('data-artery');
  });
});

// ============================================================
// withTimeout 测试
// ============================================================

describe('withTimeout', () => {
  it('正常完成的 Promise 应该返回结果', async () => {
    const result = await withTimeout(
      Promise.resolve('ok'),
      1000,
      'test'
    );
    expect(result).toBe('ok');
  });

  it('超时应该抛出错误', async () => {
    await expect(
      withTimeout(delay(500), 50, 'slow-task')
    ).rejects.toThrow('timed out');
  });

  it('Promise 自身的错误应该传播', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 1000, 'test')
    ).rejects.toThrow('boom');
  });
});

// ============================================================
// executeStartupSequence 测试
// ============================================================

describe('executeStartupSequence', () => {
  it('所有任务成功时应该返回全部 completed', async () => {
    const tasks = [
      makeTask({ id: 'a', init: async () => {} }),
      makeTask({ id: 'b', init: async () => {} }),
    ];
    const result = await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    
    expect(result.completed.size).toBe(2);
    expect(result.degraded).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('non-critical 任务失败应该记录为 degraded', async () => {
    const tasks = [
      makeTask({ id: 'a', init: async () => {} }),
      makeTask({
        id: 'b',
        critical: false,
        init: async () => { throw new Error('connection refused'); },
      }),
    ];
    const result = await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    
    expect(result.completed.has('a')).toBe(true);
    expect(result.degraded).toContain('b');
  });

  it('critical 任务失败应该标记为 failed', async () => {
    const tasks = [
      makeTask({
        id: 'a',
        critical: true,
        init: async () => { throw new Error('fatal'); },
      }),
    ];
    // 不退出进程，只检查结果
    const result = await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    
    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].critical).toBe(true);
  });

  it('依赖失败的任务应该被跳过', async () => {
    const tasks = [
      makeTask({
        id: 'a',
        critical: false,
        init: async () => { throw new Error('failed'); },
      }),
      makeTask({
        id: 'b',
        dependencies: ['a'],
        init: async () => {},
      }),
    ];
    const result = await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    
    expect(result.degraded).toContain('a');
    expect(result.skipped).toContain('b');
  });

  it('同一层的任务应该并行执行', async () => {
    const startTimes: Record<string, number> = {};
    const tasks = [
      makeTask({
        id: 'a',
        init: async () => {
          startTimes.a = Date.now();
          await delay(50);
        },
      }),
      makeTask({
        id: 'b',
        init: async () => {
          startTimes.b = Date.now();
          await delay(50);
        },
      }),
    ];
    
    const t0 = Date.now();
    await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    const elapsed = Date.now() - t0;
    
    // 如果并行执行，总耗时应该接近 50ms 而非 100ms
    // 给一些余量（CI 环境可能较慢）
    expect(elapsed).toBeLessThan(200);
    
    // 两个任务的开始时间应该接近
    const timeDiff = Math.abs((startTimes.a || 0) - (startTimes.b || 0));
    expect(timeDiff).toBeLessThan(50);
  });

  it('超时的任务应该被标记为失败', async () => {
    const tasks = [
      makeTask({
        id: 'slow',
        critical: false,
        timeout: 50,
        init: async () => { await delay(500); },
      }),
    ];
    const result = await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    
    expect(result.degraded).toContain('slow');
    expect(result.results[0].error).toContain('timed out');
  });

  it('结果应该包含每个任务的耗时', async () => {
    const tasks = [
      makeTask({
        id: 'a',
        init: async () => { await delay(20); },
      }),
    ];
    const result = await executeStartupSequence(tasks, { exitOnCriticalFailure: false });
    
    expect(result.results[0].duration).toBeGreaterThanOrEqual(15);
  });

  it('空任务列表应该正常返回', async () => {
    const result = await executeStartupSequence([], { exitOnCriticalFailure: false });
    
    expect(result.completed.size).toBe(0);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 启动状态查询测试
// ============================================================

describe('getStartupSummary', () => {
  beforeEach(() => {
    setStartupResult(null as any);
  });

  it('无结果时应该返回 failed 状态', () => {
    const summary = getStartupSummary();
    expect(summary.status).toBe('failed');
    expect(summary.tasks).toHaveLength(0);
  });

  it('全部成功时应该返回 healthy 状态', () => {
    setStartupResult({
      completed: new Set(['a', 'b']),
      degraded: [],
      skipped: [],
      results: [
        { id: 'a', label: 'Task A', status: 'success', duration: 10, critical: false },
        { id: 'b', label: 'Task B', status: 'success', duration: 20, critical: false },
      ],
      totalDuration: 30,
    });
    
    const summary = getStartupSummary();
    expect(summary.status).toBe('healthy');
    expect(summary.tasks).toHaveLength(2);
    expect(summary.totalDuration).toBe(30);
  });

  it('有降级任务时应该返回 degraded 状态', () => {
    setStartupResult({
      completed: new Set(['a']),
      degraded: ['b'],
      skipped: [],
      results: [
        { id: 'a', label: 'Task A', status: 'success', duration: 10, critical: false },
        { id: 'b', label: 'Task B', status: 'failed', duration: 5, error: 'err', critical: false },
      ],
      totalDuration: 15,
    });
    
    const summary = getStartupSummary();
    expect(summary.status).toBe('degraded');
  });
});
