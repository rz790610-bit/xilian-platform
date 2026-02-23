/**
 * PortAI Nexus — 启动序列编排器
 * 
 * 整改方案 v2.1 — B-02 启动序列显式化
 * 
 * 功能：
 *   1. 拓扑排序：根据依赖关系确定初始化顺序
 *   2. 并行初始化：无依赖关系的任务并行执行
 *   3. 分级容错：critical 任务失败 → process.exit(1)，non-critical → degraded mode
 *   4. 超时保护：每个任务有独立超时
 *   5. 可观测性：每个任务的耗时和状态清晰可见
 */

import { createModuleLogger } from './logger';

const log = createModuleLogger('startup');

// ============================================================
// 类型定义
// ============================================================

export interface StartupTask {
  /** 唯一标识符 */
  id: string;
  /** 人类可读标签（用于日志输出） */
  label: string;
  /** 依赖的任务 ID 列表（这些任务必须先完成） */
  dependencies: string[];
  /** 是否为关键任务（失败则 process.exit(1)） */
  critical: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 初始化函数 */
  init: () => Promise<void>;
}

export interface TaskResult {
  id: string;
  label: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  critical: boolean;
}

export interface StartupResult {
  /** 成功完成的任务 */
  completed: Set<string>;
  /** 降级运行的任务（non-critical 失败） */
  degraded: string[];
  /** 跳过的任务（依赖失败导致跳过） */
  skipped: string[];
  /** 每个任务的详细结果 */
  results: TaskResult[];
  /** 总耗时（毫秒） */
  totalDuration: number;
}

// ============================================================
// 拓扑排序（Kahn's Algorithm）
// ============================================================

/**
 * 对任务列表进行拓扑排序，返回分层结果。
 * 同一层内的任务可以并行执行。
 * 
 * @throws 如果存在循环依赖
 */
export function topologicalSort(tasks: StartupTask[]): StartupTask[][] {
  const taskMap = new Map<string, StartupTask>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // 初始化
  for (const task of tasks) {
    taskMap.set(task.id, task);
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  // 构建依赖图
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!taskMap.has(dep)) {
        throw new Error(
          `[Startup] Task "${task.id}" depends on "${dep}" which does not exist. ` +
          `Available tasks: ${tasks.map(t => t.id).join(', ')}`
        );
      }
      adjacency.get(dep)!.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
    }
  }

  // Kahn's Algorithm — 分层输出
  const layers: StartupTask[][] = [];
  let queue = tasks.filter(t => inDegree.get(t.id) === 0);

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: StartupTask[] = [];

    for (const task of queue) {
      for (const neighbor of adjacency.get(task.id) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          nextQueue.push(taskMap.get(neighbor)!);
        }
      }
    }

    queue = nextQueue;
  }

  // 检测循环依赖
  const sortedCount = layers.reduce((sum, layer) => sum + layer.length, 0);
  if (sortedCount !== tasks.length) {
    const remaining = tasks.filter(t => !layers.flat().includes(t)).map(t => t.id);
    throw new Error(
      `[Startup] Circular dependency detected among tasks: ${remaining.join(', ')}`
    );
  }

  return layers;
}

// ============================================================
// 超时包装器
// ============================================================

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Task "${label}" timed out after ${ms}ms`));
    }, ms);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ============================================================
// 启动编排器
// ============================================================

/**
 * 执行启动序列。
 * 
 * 1. 对任务进行拓扑排序，得到分层结果
 * 2. 同一层内的任务并行执行
 * 3. critical 任务失败 → process.exit(1)
 * 4. non-critical 任务失败 → 记录为 degraded，继续执行
 * 5. 如果某个任务的依赖失败了，该任务被 skip
 */
export async function executeStartupSequence(
  tasks: StartupTask[],
  options: { exitOnCriticalFailure?: boolean } = {}
): Promise<StartupResult> {
  const { exitOnCriticalFailure = true } = options;
  const startTime = Date.now();

  const completed = new Set<string>();
  const degraded: string[] = [];
  const skipped: string[] = [];
  const results: TaskResult[] = [];
  const failed = new Set<string>();

  // 拓扑排序
  const layers = topologicalSort(tasks);

  log.info(`[Startup] Executing ${tasks.length} tasks in ${layers.length} layers`);

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];

    // 同一层内并行执行
    const layerPromises = layer.map(async (task): Promise<TaskResult> => {
      // 检查依赖是否都已完成
      const unmetDeps = task.dependencies.filter(dep => !completed.has(dep));
      if (unmetDeps.length > 0) {
        const msg = `Skipped: dependencies failed [${unmetDeps.join(', ')}]`;
        log.warn(`[Startup] ⊘ ${task.label} — ${msg}`);
        skipped.push(task.id);
        return {
          id: task.id,
          label: task.label,
          status: 'skipped',
          duration: 0,
          error: msg,
          critical: task.critical,
        };
      }

      const t0 = Date.now();
      try {
        await withTimeout(task.init(), task.timeout, task.label);
        const duration = Date.now() - t0;
        completed.add(task.id);
        log.info(`[Startup] ✓ ${task.label} (${duration}ms)`);
        return {
          id: task.id,
          label: task.label,
          status: 'success',
          duration,
          critical: task.critical,
        };
      } catch (err: any) {
        const duration = Date.now() - t0;
        const errorMsg = err?.message || String(err);
        failed.add(task.id);

        if (task.critical) {
          log.fatal(`[Startup] ✗ ${task.label} FAILED (critical, ${duration}ms) — ${errorMsg}`);
          if (exitOnCriticalFailure) {
            process.exit(1);
          }
          return {
            id: task.id,
            label: task.label,
            status: 'failed',
            duration,
            error: errorMsg,
            critical: true,
          };
        } else {
          degraded.push(task.id);
          log.warn(`[Startup] ⚠ ${task.label} FAILED (non-critical, ${duration}ms) — ${errorMsg}`);
          return {
            id: task.id,
            label: task.label,
            status: 'failed',
            duration,
            error: errorMsg,
            critical: false,
          };
        }
      }
    });

    const layerResults = await Promise.all(layerPromises);
    results.push(...layerResults);
  }

  const totalDuration = Date.now() - startTime;

  // 打印启动摘要
  const successCount = completed.size;
  const degradedCount = degraded.length;
  const skippedCount = skipped.length;

  log.info(
    `[Startup] Complete: ${successCount}/${tasks.length} tasks ` +
    `(${degradedCount} degraded, ${skippedCount} skipped) — ${totalDuration}ms`
  );

  return { completed, degraded, skipped, results, totalDuration };
}

// ============================================================
// 启动状态查询
// ============================================================

let _lastStartupResult: StartupResult | null = null;

export function setStartupResult(result: StartupResult): void {
  _lastStartupResult = result;
}

export function getStartupResult(): StartupResult | null {
  return _lastStartupResult;
}

/**
 * 获取启动状态摘要（用于健康检查端点）
 */
export function getStartupSummary(): {
  status: 'healthy' | 'degraded' | 'failed';
  tasks: Array<{ id: string; label: string; status: string; duration: number }>;
  totalDuration: number;
} {
  if (!_lastStartupResult) {
    return { status: 'failed', tasks: [], totalDuration: 0 };
  }

  const status = _lastStartupResult.degraded.length > 0 ? 'degraded' : 'healthy';
  return {
    status,
    tasks: _lastStartupResult.results.map(r => ({
      id: r.id,
      label: r.label,
      status: r.status,
      duration: r.duration,
    })),
    totalDuration: _lastStartupResult.totalDuration,
  };
}
