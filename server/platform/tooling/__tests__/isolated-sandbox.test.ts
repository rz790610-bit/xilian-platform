/**
 * IsolatedSandbox 单元测试 (FIX-119)
 *
 * 测试 vm.createContext 降级路径（CI 环境无 isolated-vm native addon）
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { IsolatedSandbox, resetIsolatedSandbox } from '../tools/isolated-sandbox';

describe('IsolatedSandbox', () => {
  let sandbox: IsolatedSandbox;

  beforeAll(async () => {
    resetIsolatedSandbox();
    sandbox = new IsolatedSandbox({ maxExecutionTimeMs: 3000 });
    await sandbox.init();
  });

  it('可实例化', () => {
    expect(sandbox).toBeInstanceOf(IsolatedSandbox);
  });

  it('init 后有可用性状态', () => {
    // isolated-vm 未安装时为 false（降级为 vm 模式），安装时为 true
    expect(typeof sandbox.isAvailable()).toBe('boolean');
  });

  it('执行简单算术', async () => {
    const result = await sandbox.execute('return input.a + input.b;', { a: 3, b: 4 });
    expect(result.status).toBe('success');
    expect(result.output).toBe(7);
  });

  it('执行数组操作', async () => {
    const result = await sandbox.execute(
      'return input.map(x => x * 2);',
      [1, 2, 3],
    );
    expect(result.status).toBe('success');
    expect(result.output).toEqual([2, 4, 6]);
  });

  it('拦截安全违规代码', async () => {
    const result = await sandbox.execute('const fs = require("fs");', {});
    expect(result.status).toBe('security_violation');
    expect(result.securityViolations.length).toBeGreaterThan(0);
  });

  it('拦截 eval', async () => {
    const result = await sandbox.execute('eval("1+1");', {});
    expect(result.status).toBe('security_violation');
  });

  it('拦截 process 访问', async () => {
    const result = await sandbox.execute('return process.env;', {});
    expect(result.status).toBe('security_violation');
  });

  it('执行错误返回 error 状态', async () => {
    const result = await sandbox.execute('throw new Error("test");', {});
    expect(result.status).toBe('error');
    expect(result.error).toContain('test');
  });

  it('超长代码被拒绝', async () => {
    const longCode = 'return 1;' + ' '.repeat(60_000);
    const result = await sandbox.execute(longCode, {});
    expect(result.status).toBe('security_violation');
  });

  it('执行日志记录', async () => {
    // 先清空：创建新实例
    const fresh = new IsolatedSandbox();
    await fresh.init();

    await fresh.execute('return 1;', {});
    await fresh.execute('return 2;', {});

    const log = fresh.getExecutionLog();
    expect(log.length).toBe(2);
  });

  it('统计信息正确', async () => {
    const fresh = new IsolatedSandbox();
    await fresh.init();

    await fresh.execute('return 1;', {});
    await fresh.execute('return process.env;', {}); // security violation

    const stats = fresh.getStats();
    expect(stats.totalExecutions).toBe(2);
    expect(stats.successRate).toBe(0.5);
    expect(typeof stats.isolatedVmAvailable).toBe('boolean');
  });
});
