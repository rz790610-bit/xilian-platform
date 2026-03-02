/**
 * ============================================================================
 * P3-3: 工具域完整实现 — 端到端集成测试
 * ============================================================================
 *
 * 覆盖四大模块：
 *   - ToolFramework: 注册/发现/执行/链式/权限/超时/审计
 *   - ToolSandbox: 安全检查/沙箱执行/执行日志/统计
 *   - ToolFramework Singleton: 工厂函数/内置工具/动态工具
 *   - 集成: Grok tool definitions / 链式执行 / 降级场景
 *
 * 验收标准（30+ 测试用例）：
 *   ✓ 注册 7 个内置工具后，discover() 返回全部
 *   ✓ 按 category/tags/search 过滤正确
 *   ✓ 执行工具成功并返回 output
 *   ✓ 缺少权限时返回 success: false + error
 *   ✓ 输入校验失败时返回 success: false
 *   ✓ 超时保护生效（timeoutMs）
 *   ✓ 链式执行 — 前一个工具的 output 作为下一个的 input
 *   ✓ 链式执行中途失败立即中断
 *   ✓ 审计日志正确记录
 *   ✓ Grok function calling 格式正确
 *   ✓ 沙箱检测到 eval/require/import/process 拒绝执行
 *   ✓ 沙箱超时保护
 *   ✓ 沙箱执行统计正确
 *   ✓ 单例工厂：getToolFramework() 返回同一实例
 *   ✓ 动态工具注册/注销
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolFramework, type ToolDefinition, type ToolExecutionContext } from '../framework/tool-framework';
import { ToolSandbox, DEFAULT_SANDBOX_CONFIG } from '../tools/tool-sandbox';
import {
  getToolFramework,
  resetToolFramework,
  getToolSandbox,
  resetToolSandbox,
  registerDynamicTool,
  unregisterDynamicTool,
  getToolSummary,
} from '../framework/tool-framework-singleton';

// ============================================================================
// 测试辅助
// ============================================================================

function createTestContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    callerId: 'test-user',
    source: 'api',
    permissions: ['read:device', 'read:diagnosis', 'read:analysis', 'read:knowledge',
                   'write:guardrail', 'write:diagnosis', 'write:knowledge'],
    traceId: `trace-${Date.now()}`,
    ...overrides,
  };
}

function createSimpleTool(id: string, overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    id,
    name: `测试工具-${id}`,
    description: `测试工具 ${id} 的描述`,
    category: 'query',
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    requiredPermissions: ['read:device'],
    timeoutMs: 5000,
    requiresConfirmation: false,
    tags: ['test'],
    version: '1.0.0',
    execute: async (input: unknown) => {
      const { value } = input as { value: string };
      return { result: `processed-${value}` };
    },
    ...overrides,
  };
}

// ============================================================================
// 1. ToolFramework 核心测试
// ============================================================================

describe('ToolFramework', () => {
  let fw: ToolFramework;

  beforeEach(() => {
    fw = new ToolFramework();
  });

  // --------------------------------------------------------------------------
  // 注册
  // --------------------------------------------------------------------------

  describe('注册', () => {
    it('应注册单个工具', () => {
      fw.register(createSimpleTool('tool-a'));
      const tools = fw.discover();
      expect(tools).toHaveLength(1);
      expect(tools[0].id).toBe('tool-a');
    });

    it('应批量注册多个工具', () => {
      fw.registerAll([
        createSimpleTool('tool-a'),
        createSimpleTool('tool-b'),
        createSimpleTool('tool-c'),
      ]);
      expect(fw.discover()).toHaveLength(3);
    });

    it('重复注册应覆盖旧工具', () => {
      fw.register(createSimpleTool('tool-a', { name: '旧名称' }));
      fw.register(createSimpleTool('tool-a', { name: '新名称' }));
      const tools = fw.discover();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('新名称');
    });
  });

  // --------------------------------------------------------------------------
  // 发现
  // --------------------------------------------------------------------------

  describe('发现', () => {
    beforeEach(() => {
      fw.registerAll([
        createSimpleTool('query_device', { category: 'query', tags: ['device', 'state'] }),
        createSimpleTool('analyze_trend', { category: 'analyze', tags: ['trend', 'statistics'] }),
        createSimpleTool('execute_guard', { category: 'execute', tags: ['guardrail'] }),
        createSimpleTool('integrate_kg', { category: 'integrate', tags: ['knowledge'] }),
      ]);
    });

    it('无过滤条件返回全部工具', () => {
      expect(fw.discover()).toHaveLength(4);
    });

    it('按 category 过滤', () => {
      const queryTools = fw.discover({ category: 'query' });
      expect(queryTools).toHaveLength(1);
      expect(queryTools[0].id).toBe('query_device');
    });

    it('按 tags 过滤（任一匹配）', () => {
      const tagged = fw.discover({ tags: ['device', 'knowledge'] });
      expect(tagged).toHaveLength(2);
    });

    it('按 search 关键词过滤', () => {
      const searched = fw.discover({ search: 'trend' });
      expect(searched).toHaveLength(1);
      expect(searched[0].id).toBe('analyze_trend');
    });

    it('组合过滤：category + tags', () => {
      const result = fw.discover({ category: 'query', tags: ['device'] });
      expect(result).toHaveLength(1);
    });

    it('过滤结果为空时返回空数组', () => {
      expect(fw.discover({ category: 'query', tags: ['nonexistent'] })).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // 执行
  // --------------------------------------------------------------------------

  describe('执行', () => {
    it('成功执行工具并返回 output', async () => {
      fw.register(createSimpleTool('tool-a'));
      const ctx = createTestContext();
      const result = await fw.execute('tool-a', { value: 'hello' }, ctx);

      expect(result.success).toBe(true);
      expect(result.toolId).toBe('tool-a');
      expect(result.output).toEqual({ result: 'processed-hello' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.traceId).toBe(ctx.traceId);
    });

    it('工具不存在时返回错误', async () => {
      const result = await fw.execute('nonexistent', {}, createTestContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });

    it('缺少权限时返回错误', async () => {
      fw.register(createSimpleTool('secure-tool', {
        requiredPermissions: ['admin:super'],
      }));
      const ctx = createTestContext({ permissions: ['read:device'] });
      const result = await fw.execute('secure-tool', { value: 'test' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing permissions');
      expect(result.error).toContain('admin:super');
    });

    it('输入校验失败时返回错误', async () => {
      fw.register(createSimpleTool('tool-a'));
      const result = await fw.execute('tool-a', { wrong: 123 }, createTestContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Input validation failed');
    });

    it('超时保护生效', async () => {
      fw.register(createSimpleTool('slow-tool', {
        timeoutMs: 100,
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { result: 'late' };
        },
      }));

      const result = await fw.execute('slow-tool', { value: 'x' }, createTestContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('execute 异常被捕获并记录', async () => {
      fw.register(createSimpleTool('error-tool', {
        execute: async () => { throw new Error('internal failure'); },
      }));

      const result = await fw.execute('error-tool', { value: 'x' }, createTestContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('internal failure');
    });
  });

  // --------------------------------------------------------------------------
  // 链式执行
  // --------------------------------------------------------------------------

  describe('链式执行', () => {
    beforeEach(() => {
      // 工具 A: input.value → uppercase
      fw.register(createSimpleTool('upper', {
        inputSchema: z.object({ value: z.string() }),
        execute: async (input: unknown) => {
          const { value } = input as { value: string };
          return { value: value.toUpperCase() };
        },
      }));

      // 工具 B: input.value → add suffix
      fw.register(createSimpleTool('suffix', {
        inputSchema: z.object({ value: z.string() }),
        execute: async (input: unknown) => {
          const { value } = input as { value: string };
          return { value: `${value}_done` };
        },
      }));
    });

    it('链式执行：上一个 output 作为下一个 input', async () => {
      const results = await fw.executeChain(
        ['upper', 'suffix'],
        { value: 'hello' },
        createTestContext(),
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toEqual({ value: 'HELLO' });
      expect(results[1].success).toBe(true);
      expect(results[1].output).toEqual({ value: 'HELLO_done' });
    });

    it('链式执行中途失败立即中断', async () => {
      fw.register(createSimpleTool('fail-tool', {
        execute: async () => { throw new Error('boom'); },
      }));

      const results = await fw.executeChain(
        ['upper', 'fail-tool', 'suffix'],
        { value: 'hello' },
        createTestContext(),
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      // suffix should not have been executed
    });
  });

  // --------------------------------------------------------------------------
  // 审计日志
  // --------------------------------------------------------------------------

  describe('审计日志', () => {
    it('成功执行记录审计日志', async () => {
      fw.register(createSimpleTool('tool-a'));
      await fw.execute('tool-a', { value: 'test' }, createTestContext({ callerId: 'user-1' }));

      const logs = fw.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].toolId).toBe('tool-a');
      expect(logs[0].callerId).toBe('user-1');
      expect(logs[0].success).toBe(true);
    });

    it('失败执行也记录审计日志', async () => {
      fw.register(createSimpleTool('err', {
        execute: async () => { throw new Error('fail'); },
      }));
      await fw.execute('err', { value: 'x' }, createTestContext());

      const logs = fw.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('fail');
    });

    it('按 toolId 过滤审计日志', async () => {
      fw.register(createSimpleTool('a'));
      fw.register(createSimpleTool('b'));
      const ctx = createTestContext();
      await fw.execute('a', { value: '1' }, ctx);
      await fw.execute('b', { value: '2' }, ctx);
      await fw.execute('a', { value: '3' }, ctx);

      expect(fw.getAuditLogs({ toolId: 'a' })).toHaveLength(2);
      expect(fw.getAuditLogs({ toolId: 'b' })).toHaveLength(1);
    });

    it('limit 截断审计日志', async () => {
      fw.register(createSimpleTool('a'));
      const ctx = createTestContext();
      for (let i = 0; i < 5; i++) {
        await fw.execute('a', { value: String(i) }, ctx);
      }

      expect(fw.getAuditLogs({ limit: 2 })).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // 统计
  // --------------------------------------------------------------------------

  describe('统计', () => {
    it('正确统计调用次数和成功率', async () => {
      fw.register(createSimpleTool('a'));
      fw.register(createSimpleTool('fail', {
        execute: async () => { throw new Error('x'); },
      }));

      const ctx = createTestContext();
      await fw.execute('a', { value: '1' }, ctx);
      await fw.execute('a', { value: '2' }, ctx);
      await fw.execute('fail', { value: '3' }, ctx);

      const stats = fw.getStats();
      expect(stats['a'].calls).toBe(2);
      expect(stats['a'].successRate).toBe(1);
      expect(stats['fail'].calls).toBe(1);
      expect(stats['fail'].successRate).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Grok Tool Definitions
  // --------------------------------------------------------------------------

  describe('Grok Tool Definitions', () => {
    it('生成 function calling 格式', () => {
      fw.register(createSimpleTool('tool-a'));

      const defs = fw.getToolDefinitionsForGrok();
      expect(defs).toHaveLength(1);
      expect(defs[0].type).toBe('function');
      expect(defs[0].function.name).toBe('tool-a');
      expect(defs[0].function.description).toContain('tool-a');
      expect(defs[0].function.parameters).toBeDefined();
    });
  });
});

// ============================================================================
// 2. ToolSandbox 测试
// ============================================================================

describe('ToolSandbox', () => {
  let sandbox: ToolSandbox;

  beforeEach(() => {
    sandbox = new ToolSandbox();
  });

  // --------------------------------------------------------------------------
  // 安全检查
  // --------------------------------------------------------------------------

  describe('安全检查', () => {
    it('安全代码通过检查', () => {
      const result = sandbox.securityCheck('return input.value * 2;');
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('检测到 eval 拒绝', () => {
      const result = sandbox.securityCheck('eval("alert(1)")');
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('检测到 require 拒绝', () => {
      const result = sandbox.securityCheck('const fs = require("fs")');
      expect(result.safe).toBe(false);
    });

    it('检测到 import() 拒绝', () => {
      const result = sandbox.securityCheck('await import("os")');
      expect(result.safe).toBe(false);
    });

    it('检测到 process 拒绝', () => {
      const result = sandbox.securityCheck('process.exit(1)');
      expect(result.safe).toBe(false);
    });

    it('检测到 __proto__ 拒绝', () => {
      const result = sandbox.securityCheck('obj.__proto__.polluted = true');
      expect(result.safe).toBe(false);
    });

    it('检测到 globalThis 拒绝', () => {
      const result = sandbox.securityCheck('globalThis.secret = 1');
      expect(result.safe).toBe(false);
    });

    it('代码超过 50000 字符拒绝', () => {
      const result = sandbox.securityCheck('x'.repeat(50001));
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('50,000'))).toBe(true);
    });

    it('嵌套深度超过 20 拒绝', () => {
      const deep = '{'.repeat(25) + '}'.repeat(25);
      const result = sandbox.securityCheck(deep);
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('嵌套深度'))).toBe(true);
    });

    it('循环过多拒绝', () => {
      const code = Array(12).fill('for(let i=0;i<10;i++){}').join('\n');
      const result = sandbox.securityCheck(code);
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('循环语句'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 沙箱执行
  // --------------------------------------------------------------------------

  describe('沙箱执行', () => {
    it('成功执行安全代码', async () => {
      const result = await sandbox.execute('return input.a + input.b;', { a: 1, b: 2 });
      expect(result.status).toBe('success');
      expect(result.output).toBe(3);
    });

    it('不安全代码被拦截', async () => {
      const result = await sandbox.execute('eval("1+1")', {});
      expect(result.status).toBe('security_violation');
      expect(result.securityViolations.length).toBeGreaterThan(0);
    });

    it('运行时错误被捕获', async () => {
      const result = await sandbox.execute('throw new Error("runtime fail");', {});
      expect(result.status).toBe('error');
      expect(result.error).toContain('runtime fail');
    });

    it('超时保护生效', async () => {
      const quickSandbox = new ToolSandbox({ maxExecutionTimeMs: 50 });
      const result = await quickSandbox.execute(
        'return new Promise(resolve => setTimeout(() => resolve(1), 500));',
        {},
      );
      expect(result.status).toBe('timeout');
    });
  });

  // --------------------------------------------------------------------------
  // 执行日志 & 统计
  // --------------------------------------------------------------------------

  describe('执行日志与统计', () => {
    it('记录执行日志', async () => {
      await sandbox.execute('return 1;', {});
      await sandbox.execute('return 2;', {});

      const logs = sandbox.getExecutionLog();
      expect(logs).toHaveLength(2);
      expect(logs[0].status).toBe('success');
    });

    it('limit 截断日志', async () => {
      await sandbox.execute('return 1;', {});
      await sandbox.execute('return 2;', {});
      await sandbox.execute('return 3;', {});

      expect(sandbox.getExecutionLog(2)).toHaveLength(2);
    });

    it('统计正确计算', async () => {
      await sandbox.execute('return 1;', {});
      await sandbox.execute('eval("x")', {});  // security violation
      await sandbox.execute('return 2;', {});

      const stats = sandbox.getStats();
      expect(stats.totalExecutions).toBe(3);
      expect(stats.securityViolations).toBe(1);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
    });
  });
});

// ============================================================================
// 3. ToolFramework Singleton 测试
// ============================================================================

describe('ToolFramework Singleton', () => {
  beforeEach(() => {
    resetToolFramework();
    resetToolSandbox();
  });

  it('getToolFramework() 返回同一实例', () => {
    const a = getToolFramework();
    const b = getToolFramework();
    expect(a).toBe(b);
  });

  it('resetToolFramework() 后返回新实例', () => {
    const a = getToolFramework();
    resetToolFramework();
    const b = getToolFramework();
    expect(a).not.toBe(b);
  });

  it('初始化后注册了内置工具（7 个）', () => {
    const fw = getToolFramework();
    const tools = fw.discover();
    // 7 内置 + 最多 4 专业工具（annotation, training, evaluation, tuning）
    expect(tools.length).toBeGreaterThanOrEqual(7);
  });

  it('内置工具包含 query_device_state', () => {
    const fw = getToolFramework();
    const tools = fw.discover();
    expect(tools.some(t => t.id === 'query_device_state')).toBe(true);
  });

  it('内置工具包含 execute_diagnosis', () => {
    const fw = getToolFramework();
    const tools = fw.discover();
    expect(tools.some(t => t.id === 'execute_diagnosis')).toBe(true);
  });

  it('getToolSandbox() 返回同一实例', () => {
    const a = getToolSandbox();
    const b = getToolSandbox();
    expect(a).toBe(b);
  });

  // --------------------------------------------------------------------------
  // 动态工具
  // --------------------------------------------------------------------------

  describe('动态工具管理', () => {
    it('registerDynamicTool 注册后立即可用', () => {
      const fw = getToolFramework();
      const before = fw.discover().length;

      registerDynamicTool(createSimpleTool('dynamic-001'));

      const after = fw.discover().length;
      expect(after).toBe(before + 1);
    });

    it('unregisterDynamicTool 返回是否存在', () => {
      registerDynamicTool(createSimpleTool('dynamic-002'));
      expect(unregisterDynamicTool('dynamic-002')).toBe(true);
      expect(unregisterDynamicTool('dynamic-002')).toBe(false);
    });

    it('getToolSummary 返回正确统计', () => {
      const summary = getToolSummary();
      expect(summary.builtinCount).toBe(7);
      expect(summary.totalCount).toBeGreaterThanOrEqual(7);
      expect(summary.tools.length).toBe(summary.totalCount);
    });
  });
});

// ============================================================================
// 4. 集成测试：完整工具执行流程
// ============================================================================

describe('工具域集成测试', () => {
  beforeEach(() => {
    resetToolFramework();
    resetToolSandbox();
  });

  it('注册 → 发现 → 执行 → 审计完整流程', async () => {
    const fw = getToolFramework();

    // 注册自定义工具
    registerDynamicTool({
      id: 'custom_analyzer',
      name: '自定义分析器',
      description: '对输入数值做简单分析',
      category: 'analyze',
      inputSchema: z.object({ values: z.array(z.number()) }),
      outputSchema: z.object({ mean: z.number(), max: z.number() }),
      requiredPermissions: ['read:analysis'],
      timeoutMs: 5000,
      requiresConfirmation: false,
      tags: ['custom', 'analysis'],
      version: '1.0.0',
      execute: async (input: unknown) => {
        const { values } = input as { values: number[] };
        return {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          max: Math.max(...values),
        };
      },
    });

    // 发现
    const tools = fw.discover({ category: 'analyze' });
    expect(tools.some(t => t.id === 'custom_analyzer')).toBe(true);

    // 执行
    const ctx = createTestContext({ permissions: ['read:analysis'] });
    const result = await fw.execute('custom_analyzer', { values: [10, 20, 30] }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ mean: 20, max: 30 });

    // 审计
    const logs = fw.getAuditLogs({ toolId: 'custom_analyzer' });
    expect(logs).toHaveLength(1);
    expect(logs[0].success).toBe(true);
  });

  it('Grok tool definitions 包含所有已注册工具', () => {
    const fw = getToolFramework();
    const defs = fw.getToolDefinitionsForGrok();

    expect(defs.length).toBeGreaterThanOrEqual(7);
    for (const def of defs) {
      expect(def.type).toBe('function');
      expect(def.function.name).toBeTruthy();
      expect(def.function.description).toBeTruthy();
      expect(def.function.parameters).toBeDefined();
    }
  });

  it('沙箱安全检查 + 执行端到端', async () => {
    const sandbox = getToolSandbox();

    // 安全检查通过
    const check = sandbox.securityCheck('return input.x * 2;');
    expect(check.safe).toBe(true);

    // 执行
    const result = await sandbox.execute('return input.x * 2;', { x: 21 });
    expect(result.status).toBe('success');
    expect(result.output).toBe(42);

    // 统计
    const stats = sandbox.getStats();
    expect(stats.totalExecutions).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it('内置工具 query_device_state 可以执行', async () => {
    const fw = getToolFramework();
    const ctx = createTestContext();

    const result = await fw.execute('query_device_state', {
      machineId: 'QC-001',
    }, ctx);

    // 内置工具返回 mock 数据，应成功
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it('内置工具 integrate_knowledge 可以执行', async () => {
    const fw = getToolFramework();
    const ctx = createTestContext();

    const result = await fw.execute('integrate_knowledge', {
      action: 'query',
      subject: '制动器',
      query: '制动器 故障',
    }, ctx);

    expect(result.success).toBe(true);
    expect((result.output as any).results).toBeDefined();
  });
});
