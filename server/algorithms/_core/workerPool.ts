/**
 * DSP Worker 线程池
 *
 * 基于 Node.js worker_threads 的真实多线程计算池。
 * 设计原则：
 *   1. 固定大小线程池 — 避免频繁创建/销毁 Worker 的开销
 *   2. 任务队列 — 超出并发时排队，支持优先级
 *   3. 超时控制 — 每个任务独立超时，Worker 超时后强制终止并重建
 *   4. 健康检查 — 定期检测 Worker 存活状态
 *   5. 优雅关闭 — 等待进行中任务完成后再销毁
 *
 * 使用方式：
 *   const pool = DspWorkerPool.getInstance();
 *   const result = await pool.execute('fft', { signal: [...], sampleRate: 1000 });
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('dsp-worker-pool');

// ============================================================
// 类型定义
// ============================================================

/** Worker 任务消息 */
export interface WorkerTask {
  taskId: string;
  operation: string;
  payload: Record<string, any>;
  timeout: number;
}

/** Worker 响应消息 */
export interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
}

/** 排队任务 */
interface QueuedTask {
  task: WorkerTask;
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  priority: number;
  enqueuedAt: number;
}

/** Worker 包装器 */
interface WorkerWrapper {
  worker: Worker;
  id: number;
  busy: boolean;
  currentTaskId: string | null;
  taskCount: number;
  createdAt: number;
  lastActiveAt: number;
}

/** 线程池配置 */
export interface WorkerPoolConfig {
  /** 线程数量，默认 max(1, cpus - 2) */
  poolSize?: number;
  /** 单任务超时 (ms)，默认 60000 */
  taskTimeout?: number;
  /** 任务队列最大长度，默认 200 */
  maxQueueSize?: number;
  /** Worker 最大任务数后重建（防内存泄漏），默认 500 */
  maxTasksPerWorker?: number;
  /** 健康检查间隔 (ms)，默认 30000 */
  healthCheckInterval?: number;
}

// ============================================================
// Worker 线程池实现
// ============================================================

export class DspWorkerPool {
  private static instance: DspWorkerPool | null = null;

  private workers: WorkerWrapper[] = [];
  private taskQueue: QueuedTask[] = [];
  private config: Required<WorkerPoolConfig>;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private workerIdCounter = 0;

  // 统计
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    timedOutTasks: 0,
    totalDurationMs: 0,
    workersRecycled: 0,
  };

  private constructor(config: WorkerPoolConfig = {}) {
    const numCpus = cpus().length;
    this.config = {
      poolSize: config.poolSize ?? Math.max(1, numCpus - 2),
      taskTimeout: config.taskTimeout ?? 60000,
      maxQueueSize: config.maxQueueSize ?? 200,
      maxTasksPerWorker: config.maxTasksPerWorker ?? 500,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
    };

    log.info(`[WorkerPool] Initializing with ${this.config.poolSize} workers (${numCpus} CPUs detected)`);
    this.initializeWorkers();
    this.startHealthCheck();
  }

  static getInstance(config?: WorkerPoolConfig): DspWorkerPool {
    if (!DspWorkerPool.instance) {
      DspWorkerPool.instance = new DspWorkerPool(config);
    }
    return DspWorkerPool.instance;
  }

  // ============================================================
  // Worker 生命周期
  // ============================================================

  private initializeWorkers(): void {
    for (let i = 0; i < this.config.poolSize; i++) {
      this.createWorker();
    }
  }

  private createWorker(): WorkerWrapper {
    const id = ++this.workerIdCounter;
    const workerPath = join(__dirname, 'dspWorker.ts');

    // 使用 tsx 作为 loader 以支持 TypeScript Worker
    // 生产环境应编译为 .js 后直接加载
    const worker = new Worker(workerPath, {
      execArgv: ['--import', 'tsx'],
      workerData: { workerId: id },
    });

    const wrapper: WorkerWrapper = {
      worker,
      id,
      busy: false,
      currentTaskId: null,
      taskCount: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    worker.on('message', (response: WorkerResponse) => {
      this.handleWorkerResponse(wrapper, response);
    });

    worker.on('error', (err) => {
      log.warn(`[WorkerPool] Worker #${id} error:`, err.message);
      this.handleWorkerCrash(wrapper);
    });

    worker.on('exit', (code) => {
      if (!this.isShuttingDown && code !== 0) {
        log.warn(`[WorkerPool] Worker #${id} exited with code ${code}, replacing...`);
        this.replaceWorker(wrapper);
      }
    });

    this.workers.push(wrapper);
    log.debug(`[WorkerPool] Worker #${id} created`);
    return wrapper;
  }

  private replaceWorker(oldWrapper: WorkerWrapper): void {
    const idx = this.workers.indexOf(oldWrapper);
    if (idx !== -1) {
      this.workers.splice(idx, 1);
    }
    this.stats.workersRecycled++;
    this.createWorker();
    this.processQueue();
  }

  private async recycleWorker(wrapper: WorkerWrapper): Promise<void> {
    log.info(`[WorkerPool] Recycling Worker #${wrapper.id} after ${wrapper.taskCount} tasks`);
    try {
      await wrapper.worker.terminate();
    } catch {
      // Worker 可能已经退出
    }
    this.replaceWorker(wrapper);
  }

  // ============================================================
  // 任务执行
  // ============================================================

  /**
   * 提交 DSP 计算任务到线程池
   *
   * @param operation - DSP 操作名（如 'fft', 'filter', 'envelope'）
   * @param payload   - 操作参数（信号数据、采样率、配置等）
   * @param options   - 可选：超时、优先级
   */
  async execute(
    operation: string,
    payload: Record<string, any>,
    options: { timeout?: number; priority?: number } = {}
  ): Promise<any> {
    if (this.isShuttingDown) {
      throw new Error('[WorkerPool] Pool is shutting down, cannot accept new tasks');
    }

    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error(`[WorkerPool] Task queue full (${this.config.maxQueueSize}), rejecting task`);
    }

    const task: WorkerTask = {
      taskId: `dsp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      operation,
      payload,
      timeout: options.timeout ?? this.config.taskTimeout,
    };

    this.stats.totalTasks++;

    return new Promise<any>((resolve, reject) => {
      const queuedTask: QueuedTask = {
        task,
        resolve: (response: WorkerResponse) => {
          if (response.success) {
            resolve(response.result);
          } else {
            reject(new Error(response.error || 'Unknown worker error'));
          }
        },
        reject,
        priority: options.priority ?? 5,
        enqueuedAt: Date.now(),
      };

      // 尝试直接分配到空闲 Worker
      const idleWorker = this.workers.find(w => !w.busy);
      if (idleWorker) {
        this.dispatchTask(idleWorker, queuedTask);
      } else {
        // 按优先级插入队列（数字越小优先级越高）
        const insertIdx = this.taskQueue.findIndex(t => t.priority > queuedTask.priority);
        if (insertIdx === -1) {
          this.taskQueue.push(queuedTask);
        } else {
          this.taskQueue.splice(insertIdx, 0, queuedTask);
        }
      }
    });
  }

  private dispatchTask(wrapper: WorkerWrapper, queuedTask: QueuedTask): void {
    wrapper.busy = true;
    wrapper.currentTaskId = queuedTask.task.taskId;
    wrapper.lastActiveAt = Date.now();

    // 超时控制
    const timer = setTimeout(() => {
      log.warn(`[WorkerPool] Task ${queuedTask.task.taskId} timed out on Worker #${wrapper.id}`);
      this.stats.timedOutTasks++;
      wrapper.busy = false;
      wrapper.currentTaskId = null;
      queuedTask.reject(new Error(`DSP task timed out after ${queuedTask.task.timeout}ms`));

      // 超时的 Worker 可能卡死，强制终止并重建
      wrapper.worker.terminate().then(() => {
        this.replaceWorker(wrapper);
      });
    }, queuedTask.task.timeout);

    // 将 timer 附加到 task 上以便在正常完成时清除
    (queuedTask as any)._timer = timer;

    wrapper.worker.postMessage(queuedTask.task);
  }

  private handleWorkerResponse(wrapper: WorkerWrapper, response: WorkerResponse): void {
    wrapper.busy = false;
    wrapper.currentTaskId = null;
    wrapper.taskCount++;
    wrapper.lastActiveAt = Date.now();

    // 查找对应的排队任务（通过 taskId 匹配）
    // 注意：当前设计中 Worker 是 1:1 绑定任务的，直接通过 resolve 回调
    if (response.success) {
      this.stats.completedTasks++;
    } else {
      this.stats.failedTasks++;
    }
    this.stats.totalDurationMs += response.durationMs;

    // 检查是否需要回收 Worker
    if (wrapper.taskCount >= this.config.maxTasksPerWorker) {
      this.recycleWorker(wrapper);
    } else {
      // 处理队列中的下一个任务
      this.processQueue();
    }
  }

  private handleWorkerCrash(wrapper: WorkerWrapper): void {
    if (wrapper.currentTaskId) {
      // Worker 崩溃时正在执行的任务会通过 error 事件处理
      wrapper.busy = false;
      wrapper.currentTaskId = null;
    }
    // exit 事件会触发 replaceWorker
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const idleWorker = this.workers.find(w => !w.busy);
    if (!idleWorker) return;

    const nextTask = this.taskQueue.shift()!;

    // 清除队列等待超时（如果有的话）
    const waitTime = Date.now() - nextTask.enqueuedAt;
    if (waitTime > 5000) {
      log.warn(`[WorkerPool] Task ${nextTask.task.taskId} waited ${waitTime}ms in queue`);
    }

    this.dispatchTask(idleWorker, nextTask);
  }

  // ============================================================
  // 健康检查
  // ============================================================

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();
      for (const wrapper of this.workers) {
        // 检测卡死的 Worker（busy 超过 2 倍超时时间）
        if (wrapper.busy && (now - wrapper.lastActiveAt) > this.config.taskTimeout * 2) {
          log.warn(`[WorkerPool] Worker #${wrapper.id} appears stuck, terminating`);
          wrapper.worker.terminate().then(() => {
            this.replaceWorker(wrapper);
          });
        }
      }
    }, this.config.healthCheckInterval);
  }

  // ============================================================
  // 统计与管理
  // ============================================================

  getStats(): {
    poolSize: number;
    busyWorkers: number;
    idleWorkers: number;
    queueLength: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    timedOutTasks: number;
    avgDurationMs: number;
    workersRecycled: number;
  } {
    const busyCount = this.workers.filter(w => w.busy).length;
    return {
      poolSize: this.workers.length,
      busyWorkers: busyCount,
      idleWorkers: this.workers.length - busyCount,
      queueLength: this.taskQueue.length,
      ...this.stats,
      avgDurationMs: this.stats.completedTasks > 0
        ? Math.round(this.stats.totalDurationMs / this.stats.completedTasks)
        : 0,
    };
  }

  /**
   * 判断是否应该将任务路由到 Worker 线程
   * 规则：数据量 > 阈值 或 操作为 CPU 密集型
   */
  static shouldOffload(operation: string, dataLength: number): boolean {
    // CPU 密集型操作，数据量 > 1024 点时使用 Worker
    const cpuIntensiveOps = new Set([
      'fft', 'ifft', 'stft', 'amplitudeSpectrum', 'powerSpectrum',
      'filter', 'firFilter', 'iirFilter',
      'hilbertTransform', 'envelopeAnalysis',
      'crossCorrelation', 'autocorrelation',
      'isolationForest', 'lstmAnomaly', 'autoencoderAnomaly',
    ]);

    if (cpuIntensiveOps.has(operation)) {
      return dataLength > 1024;
    }

    // 通用阈值：数据量 > 8192 点
    return dataLength > 8192;
  }

  /**
   * 优雅关闭线程池
   * 等待所有进行中的任务完成，拒绝新任务
   */
  async shutdown(timeoutMs: number = 10000): Promise<void> {
    log.info('[WorkerPool] Shutting down...');
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 拒绝队列中的所有任务
    for (const queued of this.taskQueue) {
      queued.reject(new Error('[WorkerPool] Pool shutting down'));
    }
    this.taskQueue = [];

    // 等待进行中的任务完成（带超时）
    const deadline = Date.now() + timeoutMs;
    while (this.workers.some(w => w.busy) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    // 终止所有 Worker
    await Promise.allSettled(
      this.workers.map(w => w.worker.terminate())
    );
    this.workers = [];

    log.info(`[WorkerPool] Shutdown complete. Stats: ${JSON.stringify(this.stats)}`);
    DspWorkerPool.instance = null;
  }
}
