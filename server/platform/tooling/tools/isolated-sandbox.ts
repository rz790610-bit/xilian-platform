/**
 * ============================================================================
 * V8 隔离沙箱 — IsolatedSandbox (FIX-119)
 * ============================================================================
 *
 * 基于 isolated-vm 的真正 V8 隔离执行环境，替代 Function 构造器方案。
 *
 * 安全保证：
 *   1. 独立 V8 Isolate — 完全隔离的堆和栈，无法访问宿主进程对象
 *   2. 内存硬限制 — V8 引擎级别的内存限制，超限立即终止
 *   3. CPU 超时 — 基于 wall-clock 的执行超时
 *   4. API 代理 — 仅暴露白名单 API（通过 Reference 传递）
 *
 * 降级策略：
 *   若 isolated-vm 未安装（可选依赖），自动降级为 vm.createContext 模式，
 *   并在日志中输出 warning。遵循"降级不崩溃"原则。
 */

import type { SandboxConfig, SandboxExecution } from './tool-sandbox';
import { DEFAULT_SANDBOX_CONFIG } from './tool-sandbox';

// ============================================================================
// isolated-vm 类型（动态导入，避免硬依赖）
// ============================================================================

interface IvmIsolate {
  createContextSync(): IvmContext;
  compileScriptSync(code: string): IvmScript;
  dispose(): void;
}

interface IvmContext {
  global: IvmReference;
  release(): void;
}

interface IvmScript {
  runSync(context: IvmContext, options?: { timeout?: number }): unknown;
  run(context: IvmContext, options?: { timeout?: number }): Promise<unknown>;
}

interface IvmReference {
  setSync(key: string, value: unknown): void;
  getSync(key: string): unknown;
}

interface IvmModule {
  Isolate: new (options?: { memoryLimit?: number }) => IvmIsolate;
}

// ============================================================================
// IsolatedSandbox
// ============================================================================

export class IsolatedSandbox {
  private config: SandboxConfig;
  private ivm: IvmModule | null = null;
  private available = false;
  private executionLog: SandboxExecution[] = [];
  private maxLogSize = 1_000;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  /**
   * 初始化：尝试加载 isolated-vm
   * 必须在使用前调用；若加载失败，isAvailable() 返回 false
   */
  async init(): Promise<boolean> {
    try {
      // 动态导入 isolated-vm（可选依赖，native addon）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await (Function('return import("isolated-vm")')() as Promise<IvmModule>);
      this.ivm = mod;
      this.available = true;
      return true;
    } catch {
      console.warn(
        '[IsolatedSandbox] isolated-vm not available, falling back to vm.createContext. ' +
        'Install with: pnpm add isolated-vm',
      );
      this.available = false;
      return false;
    }
  }

  /**
   * isolated-vm 是否可用
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * 在隔离环境中执行代码
   */
  async execute(code: string, input: unknown): Promise<SandboxExecution> {
    const startTime = Date.now();
    const execution: SandboxExecution = {
      id: `isoexec_${startTime}_${Math.random().toString(36).slice(2, 8)}`,
      code,
      input,
      output: null,
      error: null,
      executionTimeMs: 0,
      memoryUsedMb: 0,
      securityViolations: [],
      status: 'success',
      executedAt: startTime,
    };

    // 安全检查（复用 ToolSandbox 的 bannedPatterns 逻辑）
    const violations = this.securityCheck(code);
    if (violations.length > 0) {
      execution.securityViolations = violations;
      execution.status = 'security_violation';
      execution.error = `安全检查失败: ${violations.join('; ')}`;
      execution.executionTimeMs = Date.now() - startTime;
      this.logExecution(execution);
      return execution;
    }

    try {
      if (this.available && this.ivm) {
        execution.output = await this.executeInIsolate(code, input);
      } else {
        execution.output = await this.executeInVmFallback(code, input);
      }
      execution.status = 'success';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Script execution timed out') || msg === 'TIMEOUT') {
        execution.status = 'timeout';
        execution.error = `执行超时（限制 ${this.config.maxExecutionTimeMs}ms）`;
      } else {
        execution.status = 'error';
        execution.error = msg;
      }
    }

    execution.executionTimeMs = Date.now() - startTime;
    this.logExecution(execution);
    return execution;
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(limit?: number): SandboxExecution[] {
    return limit ? this.executionLog.slice(-limit) : [...this.executionLog];
  }

  /**
   * 获取执行统计
   */
  getStats() {
    const total = this.executionLog.length;
    const successes = this.executionLog.filter(e => e.status === 'success').length;
    return {
      totalExecutions: total,
      successRate: total > 0 ? successes / total : 0,
      avgExecutionTimeMs: total > 0
        ? this.executionLog.reduce((s, e) => s + e.executionTimeMs, 0) / total
        : 0,
      isolatedVmAvailable: this.available,
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  /**
   * 安全模式检查
   */
  private securityCheck(code: string): string[] {
    const violations: string[] = [];
    for (const pattern of this.config.bannedPatterns) {
      if (pattern.test(code)) {
        violations.push(`检测到禁止的模式: ${pattern.source}`);
      }
    }
    if (code.length > 50_000) {
      violations.push('代码长度超过 50,000 字符限制');
    }
    return violations;
  }

  /**
   * 使用 isolated-vm V8 Isolate 执行
   */
  private async executeInIsolate(code: string, input: unknown): Promise<unknown> {
    const ivm = this.ivm!;
    const isolate = new ivm.Isolate({ memoryLimit: this.config.maxMemoryMb });

    try {
      const context = isolate.createContextSync();

      // 注入白名单全局对象
      const jail = context.global;
      jail.setSync('global', jail);

      // 注入 input（通过 JSON 序列化传递，确保无引用逃逸）
      jail.setSync('__input__', JSON.stringify(input));

      // 注入 console.log 桩（隔离内无真实 console）
      jail.setSync('__logs__', '[]');

      const wrappedCode = `
        'use strict';
        const input = JSON.parse(__input__);
        const __logArr = [];
        const console = {
          log: (...args) => __logArr.push(args.map(String).join(' ')),
          warn: (...args) => __logArr.push('[WARN] ' + args.map(String).join(' ')),
          error: (...args) => __logArr.push('[ERROR] ' + args.map(String).join(' ')),
        };
        const __result = (function() {
          ${code}
        })();
        JSON.stringify({ result: __result, logs: __logArr });
      `;

      const script = isolate.compileScriptSync(wrappedCode);
      const raw = await script.run(context, {
        timeout: this.config.maxExecutionTimeMs,
      });

      context.release();

      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        return parsed.result;
      }
      return raw;
    } finally {
      isolate.dispose();
    }
  }

  /**
   * 降级方案：使用 Node.js vm 模块
   */
  private async executeInVmFallback(code: string, input: unknown): Promise<unknown> {
    const vm = await import('node:vm');

    const sandbox: Record<string, unknown> = {
      input,
      __result: undefined,
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      RegExp,
      Error,
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    };

    const context = vm.createContext(sandbox);

    const wrappedCode = `
      'use strict';
      __result = (function() {
        ${code}
      })();
    `;

    const script = new vm.Script(wrappedCode);

    await Promise.race([
      new Promise<void>((resolve) => {
        script.runInContext(context, {
          timeout: this.config.maxExecutionTimeMs,
          displayErrors: true,
        });
        resolve();
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), this.config.maxExecutionTimeMs),
      ),
    ]);

    return sandbox.__result;
  }

  private logExecution(execution: SandboxExecution): void {
    this.executionLog.push(execution);
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(-this.maxLogSize);
    }
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let instance: IsolatedSandbox | null = null;

/**
 * 获取 IsolatedSandbox 单例
 */
export async function getIsolatedSandbox(
  config?: Partial<SandboxConfig>,
): Promise<IsolatedSandbox> {
  if (!instance) {
    instance = new IsolatedSandbox(config);
    await instance.init();
  }
  return instance;
}

/**
 * 重置单例（测试用）
 */
export function resetIsolatedSandbox(): void {
  instance = null;
}
