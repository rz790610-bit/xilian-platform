/**
 * FIX-081/123: ToolContract 统一工具契约 — 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  adaptGrokTool,
  adaptToolDefinition,
  UnifiedToolRegistry,
  getUnifiedToolRegistry,
  resetUnifiedToolRegistry,
  type ToolContract,
  type UnifiedToolContext,
} from '../tool-contract';

// ============================================================================
// 测试用 mock 工具
// ============================================================================

function makeGrokTool(name: string, stage: 'perception' | 'diagnosis' | 'guardrail' | 'evolution' | 'utility' = 'diagnosis') {
  return {
    name,
    description: `Grok tool: ${name}`,
    loopStage: stage,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    execute: async (input: any, _ctx: any) => ({ result: `grok:${input.query}` }),
  };
}

function makeToolDefinition(id: string, category: 'query' | 'analyze' | 'execute' | 'integrate' = 'query') {
  return {
    id,
    name: id,
    description: `Platform tool: ${id}`,
    category,
    inputSchema: z.object({ data: z.string() }),
    outputSchema: z.object({ output: z.string() }),
    requiredPermissions: ['tool.execute'],
    timeoutMs: 10_000,
    requiresConfirmation: false,
    tags: ['platform', category],
    version: '2.0.0',
    execute: async (input: any, _ctx: any) => ({ output: `platform:${input.data}` }),
  };
}

function makeCtx(overrides?: Partial<UnifiedToolContext>): UnifiedToolContext {
  return {
    source: 'api',
    traceId: 'trace-001',
    sessionId: 'sess-001',
    machineId: 'GJM12',
    callerId: 'user-1',
    permissions: ['tool.execute'],
    ...overrides,
  };
}

// ============================================================================
// 1. 适配器测试
// ============================================================================

describe('adaptGrokTool', () => {
  it('GrokTool → ToolContract 字段映射正确', () => {
    const grok = makeGrokTool('query_sensor_realtime', 'perception');
    const contract = adaptGrokTool(grok);

    expect(contract.id).toBe('query_sensor_realtime');
    expect(contract.name).toBe('query_sensor_realtime');
    expect(contract.domain).toBe('perception');
    expect(contract.version).toBe('1.0.0');
    expect(contract.tags).toContain('grok');
    expect(contract.tags).toContain('perception');
    expect(contract.requiredPermissions).toEqual([]);
    expect(contract.timeoutMs).toBe(30_000);
    expect(contract.requiresConfirmation).toBe(false);
  });

  it('GrokTool 执行上下文正确转换', async () => {
    let capturedCtx: any;
    const grok = {
      ...makeGrokTool('test_tool'),
      execute: async (_input: any, ctx: any) => { capturedCtx = ctx; return {}; },
    };
    const contract = adaptGrokTool(grok);
    await contract.execute({ query: 'hello' }, makeCtx());

    expect(capturedCtx.sessionId).toBe('sess-001');
    expect(capturedCtx.machineId).toBe('GJM12');
    expect(capturedCtx.traceId).toBe('trace-001');
    expect(capturedCtx.userId).toBe('user-1');
  });
});

describe('adaptToolDefinition', () => {
  it('ToolDefinition → ToolContract 字段映射正确', () => {
    const def = makeToolDefinition('query_device_state', 'query');
    const contract = adaptToolDefinition(def);

    expect(contract.id).toBe('query_device_state');
    expect(contract.domain).toBe('query');
    expect(contract.version).toBe('2.0.0');
    expect(contract.tags).toEqual(['platform', 'query']);
    expect(contract.requiredPermissions).toEqual(['tool.execute']);
    expect(contract.timeoutMs).toBe(10_000);
  });

  it('ToolDefinition 执行上下文正确转换', async () => {
    let capturedCtx: any;
    const def = {
      ...makeToolDefinition('test_def'),
      execute: async (_input: any, ctx: any) => { capturedCtx = ctx; return {}; },
    };
    const contract = adaptToolDefinition(def);
    await contract.execute({ data: 'test' }, makeCtx());

    expect(capturedCtx.callerId).toBe('user-1');
    expect(capturedCtx.source).toBe('api');
    expect(capturedCtx.sessionId).toBe('sess-001');
    expect(capturedCtx.permissions).toEqual(['tool.execute']);
    expect(capturedCtx.traceId).toBe('trace-001');
  });
});

// ============================================================================
// 2. 注册表测试
// ============================================================================

describe('UnifiedToolRegistry', () => {
  let registry: UnifiedToolRegistry;

  beforeEach(() => {
    registry = new UnifiedToolRegistry();
  });

  it('注册和获取工具', () => {
    const contract = adaptGrokTool(makeGrokTool('tool_a'));
    registry.register(contract);

    expect(registry.size).toBe(1);
    expect(registry.get('tool_a')).toBeDefined();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('重复注册抛出异常', () => {
    const contract = adaptGrokTool(makeGrokTool('tool_a'));
    registry.register(contract);
    expect(() => registry.register(contract)).toThrow("Tool 'tool_a' already registered");
  });

  it('批量注册 GrokTool', () => {
    const tools = [
      makeGrokTool('grok_1', 'perception'),
      makeGrokTool('grok_2', 'diagnosis'),
      makeGrokTool('grok_3', 'evolution'),
    ];
    registry.registerGrokTools(tools);

    expect(registry.size).toBe(3);
    expect(registry.get('grok_1')?.domain).toBe('perception');
    expect(registry.get('grok_2')?.domain).toBe('diagnosis');
  });

  it('批量注册 ToolDefinition', () => {
    const defs = [
      makeToolDefinition('def_1', 'query'),
      makeToolDefinition('def_2', 'analyze'),
    ];
    registry.registerToolDefinitions(defs);

    expect(registry.size).toBe(2);
    expect(registry.get('def_1')?.domain).toBe('query');
  });

  it('按领域过滤', () => {
    registry.registerGrokTools([
      makeGrokTool('diag_1', 'diagnosis'),
      makeGrokTool('diag_2', 'diagnosis'),
      makeGrokTool('guard_1', 'guardrail'),
    ]);

    const diagTools = registry.findByDomain('diagnosis');
    expect(diagTools).toHaveLength(2);
    expect(diagTools.every(t => t.domain === 'diagnosis')).toBe(true);
  });

  it('按标签过滤', () => {
    registry.registerGrokTools([makeGrokTool('g1')]);
    registry.registerToolDefinitions([makeToolDefinition('d1')]);

    const grokTools = registry.findByTag('grok');
    expect(grokTools).toHaveLength(1);
    expect(grokTools[0].id).toBe('g1');

    const platformTools = registry.findByTag('platform');
    expect(platformTools).toHaveLength(1);
    expect(platformTools[0].id).toBe('d1');
  });

  it('搜索工具', () => {
    registry.registerGrokTools([
      makeGrokTool('query_sensor_realtime'),
      makeGrokTool('compute_physics_formula'),
    ]);

    const results = registry.search('sensor');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('query_sensor_realtime');
  });

  it('列出所有工具', () => {
    registry.registerGrokTools([makeGrokTool('a'), makeGrokTool('b')]);
    registry.registerToolDefinitions([makeToolDefinition('c')]);

    expect(registry.listAll()).toHaveLength(3);
  });

  it('重置清空注册表', () => {
    registry.registerGrokTools([makeGrokTool('a')]);
    expect(registry.size).toBe(1);

    registry.reset();
    expect(registry.size).toBe(0);
  });
});

// ============================================================================
// 3. 单例测试
// ============================================================================

describe('singleton', () => {
  beforeEach(() => {
    resetUnifiedToolRegistry();
  });

  it('getUnifiedToolRegistry 返回同一实例', () => {
    const r1 = getUnifiedToolRegistry();
    const r2 = getUnifiedToolRegistry();
    expect(r1).toBe(r2);
  });

  it('resetUnifiedToolRegistry 创建新实例', () => {
    const r1 = getUnifiedToolRegistry();
    r1.register(adaptGrokTool(makeGrokTool('tmp')));
    expect(r1.size).toBe(1);

    resetUnifiedToolRegistry();
    const r2 = getUnifiedToolRegistry();
    expect(r2.size).toBe(0);
    expect(r2).not.toBe(r1);
  });
});

// ============================================================================
// 4. 端到端执行测试
// ============================================================================

describe('end-to-end execution', () => {
  it('GrokTool 通过 ToolContract 执行', async () => {
    const grok = makeGrokTool('e2e_grok');
    const contract = adaptGrokTool(grok);
    const result = await contract.execute({ query: 'test' }, makeCtx()) as any;
    expect(result.result).toBe('grok:test');
  });

  it('ToolDefinition 通过 ToolContract 执行', async () => {
    const def = makeToolDefinition('e2e_def');
    const contract = adaptToolDefinition(def);
    const result = await contract.execute({ data: 'test' }, makeCtx()) as any;
    expect(result.output).toBe('platform:test');
  });

  it('两套工具在同一注册表中共存', async () => {
    const registry = new UnifiedToolRegistry();
    registry.registerGrokTools([makeGrokTool('grok_tool')]);
    registry.registerToolDefinitions([makeToolDefinition('platform_tool')]);

    const grokResult = await registry.get('grok_tool')!.execute({ query: 'hello' }, makeCtx()) as any;
    const platResult = await registry.get('platform_tool')!.execute({ data: 'world' }, makeCtx()) as any;

    expect(grokResult.result).toBe('grok:hello');
    expect(platResult.output).toBe('platform:world');
    expect(registry.size).toBe(2);
  });
});
