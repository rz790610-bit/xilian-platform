/**
 * XPE v1.1 — PluginEngine 核心测试
 *
 * 覆盖场景：
 * 1. Manifest Zod 验证（合法 + 非法）
 * 2. DAG 拓扑排序（正常 + 环检测 + 软依赖）
 * 3. Mermaid 流程图生成
 * 4. 生命周期状态机（正常流转 + 非法转换 + 降级）
 * 5. PluginEngine 注册 + bootstrap
 * 6. PluginEngine 配置变更通知
 * 7. PluginEngine 优雅关闭
 * 8. PluginContext cache TTL
 * 9. critical 插件失败中止启动
 * 10. 重复注册幂等性
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PluginManifestSchema,
  type PluginManifest,
} from '../manifest.schema';
import {
  topologicalSort,
  generateFlowDiagram,
  CyclicDependencyError,
  type DAGNode,
} from '../dag';
import {
  validateTransition,
  executePhase,
  executeStartupSequence,
  LifecycleError,
} from '../lifecycle';
import { PluginCache, createPluginContext } from '../plugin-context';
import { PluginEngine, resetPluginEngine } from '../index';
import type { PluginDefinition } from '../types';

// ── 辅助：创建最小合法 Manifest ─────────────────────────────
function makeManifest(overrides: Partial<PluginManifest> & { type: string; id: string }): PluginManifest {
  const base = {
    name: overrides.id,
    version: '1.0.0',
    description: 'test plugin',
    dependencies: [],
    after: [],
    enabled: true,
    critical: false,
    tags: [],
    capabilities: [],
    ...overrides,
  };

  // 按 type 补充必填字段
  switch (base.type) {
    case 'agent':
      return { loopStage: 'utility', parallel: false, sdkAdapter: 'custom', maxConcurrency: 5, timeoutMs: 30000, ...base } as PluginManifest;
    case 'tool':
      return base as PluginManifest;
    case 'storage':
      return { storageType: 'redis', ...base } as PluginManifest;
    case 'observability':
      return { exporterType: 'console', ...base } as PluginManifest;
    case 'vite':
      return { devOnly: false, buildOnly: false, ...base } as PluginManifest;
    case 'infra':
      return { infraRole: 'config-bridge', ...base } as PluginManifest;
    default:
      return base as PluginManifest;
  }
}

function makeDefinition(
  id: string,
  type: string = 'tool',
  overrides: Partial<PluginDefinition> = {},
  manifestOverrides: Record<string, unknown> = {},
): PluginDefinition {
  return {
    manifest: makeManifest({ id, type, ...manifestOverrides } as any),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// 场景 1: Manifest Zod 验证
// ═══════════════════════════════════════════════════════════════
describe('Manifest Zod 验证', () => {
  it('合法的 tool manifest 应通过验证', () => {
    const manifest = makeManifest({ id: 'my-tool', type: 'tool' });
    const result = PluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('合法的 agent manifest 应通过验证', () => {
    const manifest = makeManifest({
      id: 'diag-agent',
      type: 'agent',
      loopStage: 'diagnosis',
      parallel: true,
    } as any);
    const result = PluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('agent');
    }
  });

  it('合法的 infra manifest 应通过验证（审查修正 2）', () => {
    const manifest = makeManifest({
      id: 'config-bridge',
      type: 'infra',
      infraRole: 'config-bridge',
    } as any);
    const result = PluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('infra');
    }
  });

  it('非法 ID（大写字母）应验证失败', () => {
    const manifest = makeManifest({ id: 'MyPlugin', type: 'tool' });
    const result = PluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('未知 type 应验证失败', () => {
    const manifest = { id: 'bad', name: 'bad', version: '1.0.0', type: 'unknown' };
    const result = PluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('非法 semver 版本号应验证失败', () => {
    const manifest = makeManifest({ id: 'bad-ver', type: 'tool' });
    (manifest as any).version = 'abc';
    const result = PluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 2: DAG 拓扑排序
// ═══════════════════════════════════════════════════════════════
describe('DAG 拓扑排序', () => {
  it('线性依赖链应按正确顺序排序', () => {
    const nodes: DAGNode[] = [
      { id: 'c', dependencies: ['b'] },
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: ['a'] },
    ];
    const sorted = topologicalSort(nodes);
    expect(sorted).toEqual(['a', 'b', 'c']);
  });

  it('无依赖节点应按字典序排列', () => {
    const nodes: DAGNode[] = [
      { id: 'z', dependencies: [] },
      { id: 'a', dependencies: [] },
      { id: 'm', dependencies: [] },
    ];
    const sorted = topologicalSort(nodes);
    expect(sorted).toEqual(['a', 'm', 'z']);
  });

  it('循环依赖应抛出 CyclicDependencyError（审查修正 6）', () => {
    const nodes: DAGNode[] = [
      { id: 'a', dependencies: ['b'] },
      { id: 'b', dependencies: ['c'] },
      { id: 'c', dependencies: ['a'] },
    ];
    expect(() => topologicalSort(nodes)).toThrow(CyclicDependencyError);
    try {
      topologicalSort(nodes);
    } catch (err) {
      expect(err).toBeInstanceOf(CyclicDependencyError);
      expect((err as CyclicDependencyError).cycle).toEqual(
        expect.arrayContaining(['a', 'b', 'c']),
      );
    }
  });

  it('不存在的硬依赖应抛出错误', () => {
    const nodes: DAGNode[] = [
      { id: 'a', dependencies: ['nonexistent'] },
    ];
    expect(() => topologicalSort(nodes)).toThrow('不存在的硬依赖');
  });

  it('软依赖（after）目标不存在时应静默跳过', () => {
    const nodes: DAGNode[] = [
      { id: 'a', dependencies: [], after: ['nonexistent'] },
      { id: 'b', dependencies: [] },
    ];
    const sorted = topologicalSort(nodes);
    expect(sorted).toContain('a');
    expect(sorted).toContain('b');
  });

  it('软依赖（after）目标存在时应影响排序', () => {
    const nodes: DAGNode[] = [
      { id: 'a', dependencies: [], after: ['b'] },
      { id: 'b', dependencies: [] },
    ];
    const sorted = topologicalSort(nodes);
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('a'));
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 3: Mermaid 流程图生成
// ═══════════════════════════════════════════════════════════════
describe('Mermaid 流程图生成', () => {
  it('应生成有效的 Mermaid flowchart 语法', () => {
    const nodes: DAGNode[] = [
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: ['a'] },
      { id: 'c', dependencies: ['a'], after: ['b'] },
    ];
    const diagram = generateFlowDiagram(nodes, { title: 'Test DAG' });
    expect(diagram).toContain('flowchart TB');
    expect(diagram).toContain('title: Test DAG');
    expect(diagram).toContain('a --> b');
    expect(diagram).toContain('a --> c');
    expect(diagram).toContain('b -.-> c');
  });

  it('应支持 subgraph 分组', () => {
    const nodes: DAGNode[] = [
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [] },
    ];
    const stageMap = new Map([['a', 'infra'], ['b', 'agent']]);
    const diagram = generateFlowDiagram(nodes, {
      groupByStage: true,
      stageMap,
    });
    expect(diagram).toContain('subgraph infra');
    expect(diagram).toContain('subgraph agent');
  });

  it('应标记并行节点为双花括号形状', () => {
    const nodes: DAGNode[] = [
      { id: 'parallel-agent', dependencies: [] },
    ];
    const diagram = generateFlowDiagram(nodes, {
      parallelIds: new Set(['parallel-agent']),
    });
    expect(diagram).toContain('{{parallel-agent}}');
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 4: 生命周期状态机
// ═══════════════════════════════════════════════════════════════
describe('生命周期状态机', () => {
  it('合法转换 registered → installed 应通过', () => {
    expect(() => validateTransition('test', 'registered', 'installed')).not.toThrow();
  });

  it('非法转换 registered → active 应抛出 LifecycleError', () => {
    expect(() => validateTransition('test', 'registered', 'active')).toThrow(LifecycleError);
  });

  it('非法转换 deactivated → active 应抛出 LifecycleError', () => {
    expect(() => validateTransition('test', 'deactivated', 'active')).toThrow(LifecycleError);
  });

  it('降级后可恢复到 installed', () => {
    expect(() => validateTransition('test', 'degraded', 'installed')).not.toThrow();
  });

  it('executeStartupSequence 应按 register → install → activate 顺序执行', async () => {
    const order: string[] = [];
    const manifest = makeManifest({ id: 'lifecycle-test', type: 'tool' });
    const deps = {
      getPlugin: () => undefined,
      getPluginsByType: () => [],
      getPluginsByTag: () => [],
      isPluginActive: () => false,
    };
    const context = createPluginContext(manifest, deps);

    const instance = {
      manifest,
      context,
      state: 'registered' as const,
      onRegister: async () => { order.push('register'); },
      onInstall: async () => { order.push('install'); },
      onActivate: async () => { order.push('activate'); },
    };

    const finalState = await executeStartupSequence(instance as any);
    expect(finalState).toBe('active');
    expect(order).toEqual(['register', 'install', 'activate']);
  });

  it('非 critical 插件 install 失败应降级而非抛出', async () => {
    const manifest = makeManifest({ id: 'degradable', type: 'tool', critical: false });
    const deps = {
      getPlugin: () => undefined,
      getPluginsByType: () => [],
      getPluginsByTag: () => [],
      isPluginActive: () => false,
    };
    const context = createPluginContext(manifest, deps);

    const instance = {
      manifest,
      context,
      state: 'registered' as const,
      onRegister: async () => {},
      onInstall: async () => { throw new Error('模拟安装失败'); },
      onActivate: async () => {},
    };

    const finalState = await executeStartupSequence(instance as any);
    expect(finalState).toBe('degraded');
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 5: PluginEngine 注册 + bootstrap
// ═══════════════════════════════════════════════════════════════
describe('PluginEngine 注册 + bootstrap', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    resetPluginEngine();
    engine = new PluginEngine();
  });

  it('应成功注册并启动单个插件', async () => {
    const activateHook = vi.fn();
    engine.register(makeDefinition('simple-tool', 'tool', {
      onActivate: activateHook,
    }));

    const states = await engine.bootstrap();
    expect(states.get('simple-tool')).toBe('active');
    expect(activateHook).toHaveBeenCalledTimes(1);
    expect(engine.activeCount).toBe(1);
  });

  it('应按依赖顺序启动多个插件', async () => {
    const order: string[] = [];

    engine.register(makeDefinition('dep-b', 'tool', {
      onActivate: async () => { order.push('b'); },
    }, { dependencies: ['dep-a'] }));

    engine.register(makeDefinition('dep-a', 'tool', {
      onActivate: async () => { order.push('a'); },
    }));

    await engine.bootstrap();
    expect(order).toEqual(['a', 'b']);
  });

  it('disabled 插件应跳过注册', () => {
    engine.register(makeDefinition('disabled-plugin', 'tool', {}, { enabled: false }));
    expect(engine.totalCount).toBe(0);
  });

  it('重复注册应幂等（跳过第二次）', () => {
    engine.register(makeDefinition('idempotent', 'tool'));
    engine.register(makeDefinition('idempotent', 'tool'));
    expect(engine.totalCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 6: 配置变更通知
// ═══════════════════════════════════════════════════════════════
describe('配置变更通知', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    resetPluginEngine();
    engine = new PluginEngine();
  });

  it('应通知所有活跃插件配置变更', async () => {
    const handler = vi.fn();

    engine.register(makeDefinition('config-listener', 'tool', {
      onConfigChange: handler,
    }));

    await engine.bootstrap();
    await engine.notifyConfigChange(['db.host', 'db.port']);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      ['db.host', 'db.port'],
      expect.objectContaining({ pluginId: 'config-listener' }),
    );
  });

  it('降级插件不应收到配置变更通知', async () => {
    const handler = vi.fn();

    engine.register(makeDefinition('degraded-plugin', 'tool', {
      onInstall: async () => { throw new Error('fail'); },
      onConfigChange: handler,
    }));

    await engine.bootstrap();
    await engine.notifyConfigChange(['some.key']);

    expect(handler).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 7: 优雅关闭
// ═══════════════════════════════════════════════════════════════
describe('优雅关闭', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    resetPluginEngine();
    engine = new PluginEngine();
  });

  it('应按逆拓扑顺序关闭所有活跃插件', async () => {
    const order: string[] = [];

    engine.register(makeDefinition('shutdown-a', 'tool', {
      onDeactivate: async () => { order.push('a'); },
    }));

    engine.register(makeDefinition('shutdown-b', 'tool', {
      onDeactivate: async () => { order.push('b'); },
    }, { dependencies: ['shutdown-a'] }));

    await engine.bootstrap();
    await engine.shutdown();

    // b 依赖 a，所以 b 应先关闭
    expect(order).toEqual(['b', 'a']);
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 8: PluginContext cache TTL
// ═══════════════════════════════════════════════════════════════
describe('PluginContext cache', () => {
  it('无 TTL 的条目应永不过期', () => {
    const cache = new PluginCache('test');
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('TTL 过期的条目应返回 undefined', async () => {
    const cache = new PluginCache('test');
    cache.set('ephemeral', 'data', 50); // 50ms TTL
    expect(cache.get('ephemeral')).toBe('data');

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(cache.get('ephemeral')).toBeUndefined();
  });

  it('gc() 应清理过期条目', async () => {
    const cache = new PluginCache('test');
    cache.set('keep', 'forever');
    cache.set('expire', 'soon', 10);

    await new Promise(resolve => setTimeout(resolve, 20));
    const cleaned = cache.gc();
    expect(cleaned).toBe(1);
    expect(cache.has('keep')).toBe(true);
    expect(cache.has('expire')).toBe(false);
  });

  it('不同 pluginId 的 cache 应隔离', () => {
    const cache1 = new PluginCache('plugin-a');
    const cache2 = new PluginCache('plugin-b');
    cache1.set('shared-key', 'value-a');
    cache2.set('shared-key', 'value-b');
    expect(cache1.get('shared-key')).toBe('value-a');
    expect(cache2.get('shared-key')).toBe('value-b');
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 9: critical 插件失败中止启动
// ═══════════════════════════════════════════════════════════════
describe('critical 插件失败', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    resetPluginEngine();
    engine = new PluginEngine();
  });

  it('critical 插件 activate 失败应抛出 LifecycleError', async () => {
    engine.register(makeDefinition('critical-infra', 'infra', {
      onActivate: async () => { throw new Error('关键服务不可用'); },
    }, { critical: true, infraRole: 'config-bridge' }));

    await expect(engine.bootstrap()).rejects.toThrow(LifecycleError);
  });
});

// ═══════════════════════════════════════════════════════════════
// 场景 10: 流程图生成（集成）
// ═══════════════════════════════════════════════════════════════
describe('PluginEngine 流程图', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    resetPluginEngine();
    engine = new PluginEngine();
  });

  it('getFlowDiagram 应返回包含所有已注册插件的 Mermaid 图', async () => {
    engine.register(makeDefinition('infra-a', 'infra', {}, { infraRole: 'config-bridge' }));
    engine.register(makeDefinition('tool-b', 'tool', {}, { dependencies: ['infra-a'] }));

    const diagram = engine.getFlowDiagram();
    expect(diagram).toContain('flowchart LR');
    expect(diagram).toContain('infra-a');
    expect(diagram).toContain('tool-b');
    expect(diagram).toContain('infra-a --> tool-b');
  });
});
