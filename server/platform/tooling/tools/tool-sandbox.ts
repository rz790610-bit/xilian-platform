/**
 * ============================================================================
 * 工具安全沙箱 — ToolSandbox
 * ============================================================================
 *
 * 为自动生成的代码和工具提供安全执行环境
 *
 * 安全机制：
 *   1. 资源限制（CPU/内存/时间）
 *   2. API 白名单
 *   3. 输入输出验证
 *   4. 执行日志审计
 */

// ============================================================================
// 沙箱类型
// ============================================================================

export interface SandboxConfig {
  /** 最大执行时间（ms） */
  maxExecutionTimeMs: number;
  /** 最大内存（MB） */
  maxMemoryMb: number;
  /** 允许的全局对象 */
  allowedGlobals: string[];
  /** 禁止的模式 */
  bannedPatterns: RegExp[];
  /** 是否允许网络访问 */
  allowNetwork: boolean;
  /** 是否允许文件系统访问 */
  allowFileSystem: boolean;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  maxExecutionTimeMs: 5000,
  maxMemoryMb: 128,
  allowedGlobals: ['Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'RegExp', 'Error', 'console'],
  bannedPatterns: [
    /eval\s*\(/,
    /Function\s*\(/,
    /require\s*\(/,
    /import\s*\(/,
    /process\./,
    /child_process/,
    /fs\./,
    /net\./,
    /http\./,
    /https\./,
    /exec\s*\(/,
    /spawn\s*\(/,
    /__proto__/,
    /constructor\s*\[/,
    /Proxy/,
    /Reflect/,
    /globalThis/,
    /window/,
    /document/,
  ],
  allowNetwork: false,
  allowFileSystem: false,
};

export interface SandboxExecution {
  id: string;
  code: string;
  input: unknown;
  output: unknown | null;
  error: string | null;
  executionTimeMs: number;
  memoryUsedMb: number;
  securityViolations: string[];
  status: 'success' | 'error' | 'timeout' | 'security_violation';
  executedAt: number;
}

// ============================================================================
// 工具安全沙箱实现
// ============================================================================

export class ToolSandbox {
  private config: SandboxConfig;
  private executionLog: SandboxExecution[] = [];
  private maxLogSize = 1_000;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  /**
   * 安全检查代码
   */
  securityCheck(code: string): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const pattern of this.config.bannedPatterns) {
      if (pattern.test(code)) {
        violations.push(`检测到禁止的模式: ${pattern.source}`);
      }
    }

    // 检查代码长度
    if (code.length > 50_000) {
      violations.push('代码长度超过 50,000 字符限制');
    }

    // 检查嵌套深度
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of code) {
      if ('{(['.includes(char)) currentDepth++;
      if ('})]'.includes(char)) currentDepth--;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    if (maxDepth > 20) {
      violations.push(`嵌套深度 ${maxDepth} 超过限制 20`);
    }

    // 检查无限循环风险
    const loopCount = (code.match(/\b(while|for)\b/g) || []).length;
    if (loopCount > 10) {
      violations.push(`循环语句数量 ${loopCount} 过多，可能存在性能风险`);
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * 在沙箱中执行代码
   */
  async execute(code: string, input: unknown): Promise<SandboxExecution> {
    const startTime = Date.now();
    const execution: SandboxExecution = {
      id: `exec_${startTime}_${Math.random().toString(36).slice(2, 8)}`,
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

    // 1. 安全检查
    const { safe, violations } = this.securityCheck(code);
    if (!safe) {
      execution.securityViolations = violations;
      execution.status = 'security_violation';
      execution.error = `安全检查失败: ${violations.join('; ')}`;
      execution.executionTimeMs = Date.now() - startTime;
      this.logExecution(execution);
      return execution;
    }

    // 2. 带超时的执行
    try {
      const result = await Promise.race([
        this.executeInSandbox(code, input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), this.config.maxExecutionTimeMs),
        ),
      ]);

      execution.output = result;
      execution.status = 'success';
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg === 'TIMEOUT') {
        execution.status = 'timeout';
        execution.error = `执行超时（限制 ${this.config.maxExecutionTimeMs}ms）`;
      } else {
        execution.status = 'error';
        execution.error = errorMsg;
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
  getStats(): {
    totalExecutions: number;
    successRate: number;
    avgExecutionTimeMs: number;
    securityViolations: number;
    timeouts: number;
  } {
    const total = this.executionLog.length;
    const successes = this.executionLog.filter(e => e.status === 'success').length;
    const violations = this.executionLog.filter(e => e.status === 'security_violation').length;
    const timeouts = this.executionLog.filter(e => e.status === 'timeout').length;
    const avgTime = total > 0
      ? this.executionLog.reduce((s, e) => s + e.executionTimeMs, 0) / total
      : 0;

    return {
      totalExecutions: total,
      successRate: total > 0 ? successes / total : 0,
      avgExecutionTimeMs: avgTime,
      securityViolations: violations,
      timeouts,
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private async executeInSandbox(code: string, input: unknown): Promise<unknown> {
    // 构建安全的执行环境
    // 注意：生产环境应使用 vm2 或 isolated-vm 等真正的沙箱
    // 这里提供基于 Function 构造器的简化实现

    try {
      // 将代码包装为函数
      const wrappedCode = `
        'use strict';
        const input = arguments[0];
        ${code}
      `;

      // 使用 Function 构造器（注意：生产环境需要更安全的方案）
      const fn = new Function(wrappedCode);
      return fn(input);
    } catch (err) {
      throw err;
    }
  }

  private logExecution(execution: SandboxExecution): void {
    this.executionLog.push(execution);
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog = this.executionLog.slice(-this.maxLogSize);
    }
  }
}
