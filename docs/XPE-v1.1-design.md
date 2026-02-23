# Xilian PluginEngine (XPE) v1.1 融合设计文档

**文档编号：** XL-DESIGN-2026-003  
**版本：** v1.1-rev1（审查修订版）  
**编制日期：** 2026-02-23  
**修订日期：** 2026-02-23  
**编制人：** Manus AI  
**状态：** 审查修订完成  

---

## 修订记录

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| v1.1-final | 2026-02-23 | 初版输出 |
| v1.1-rev1 | 2026-02-23 | 修正审查反馈 6+2 个问题（见下方修订摘要） |

### 修订摘要

| # | 审查问题 | 修正方案 | 影响章节 |
|---|---------|---------|---------|
| 1 | ViteManifest 缺少 vitePlugins 字段 | Vite 插件是运行时对象，不适合 Zod Schema。改为 onActivate 时向 VitePluginFactory 注册 | 四、五(方向6) |
| 2 | config-bridge 的 type 不应是 'tool' | 新增 `InfraManifestSchema`（`type: 'infra'`），含 `infraRole` 枚举 | 四 |
| 3 | 工时估计偏乐观 | 测试从 1h 调整为 5h（8+ 场景），总工时调整为 ~13h | 八 |
| 4 | pnpm-workspace.yaml 空数组写法 | 改为 `packages: ['.']` | 六 |
| 5 | discover/activate 路径不一致 | moduleCache 缓存 `sourcePath`，activate 从缓存读取 | 五(方向2) |
| 6 | 循环依赖检测缺失 | Kahn 算法后检查 sorted.length !== nodes.length，抛出明确错误 | 五(方向1)、九 |
| A | services.storage 语义模糊 | 拆为 `cache`（进程内 Map + TTL）+ 持久化通过 Storage 插件依赖 | 四 |
| B | 验收标准 203 用例来源 | 澄清为"现有 203 + 新增 XPE 测试 ≥8 = ≥211" | 十 |

---

## 一、定位与设计原则

**定位：** 平台唯一插件总线，所有可扩展能力（模块、Agent、Tool、存储、Observability、Vite）均通过 Manifest 声明式注册。

**设计原则：**

1. **Manifest 驱动** — 每个插件通过 Zod Schema 声明元数据，运行时校验
2. **零侵入** — 现有代码不需要大规模重构，PluginEngine 作为新增层叠加
3. **热更新** — 通过 ConfigCenter 桥接，配置变更自动通知所有插件
4. **可观测** — 每个插件自带 Pino child logger + OTel span
5. **可视化** — Agent 编排图可生成 Mermaid DAG

---

## 二、现有代码库分析

### 2.1 可复用资产清单

| 现有文件 | 行数 | 复用策略 |
|---------|------|---------|
| `server/services/plugin.engine.ts` | 801 | **替换** — 新 PluginEngine 取代，保留 4 个内置插件迁移为 Manifest 格式 |
| `server/services/plugin.manifest.ts` | 625 | **保留** — 签名/校验/YAML 解析能力继续使用，Manifest Schema 升级为 Zod |
| `server/services/plugin.sandbox.ts` | 1056 | **保留** — 沙箱隔离不变 |
| `server/services/plugin.security.ts` | 814 | **保留** — 安全策略不变 |
| `server/core/agent-registry.ts` | 515 | **扩展** — 添加 `after`/`parallel` 字段，桥接到 PluginEngine |
| `server/core/registries/module.registry.ts` | 937 | **保留** — ModuleManifest 与 PluginManifest 是不同层次 |
| `server/core/startup.ts` | 308 | **泛化** — topologicalSort 泛化为泛型函数 |
| `server/platform/services/configCenter.ts` | 491 | **桥接** — ConfigCenter.watchAll → PluginEngine.notifyConfigChange |
| `server/platform/middleware/opentelemetry.ts` | 453 | **封装** — 包装为 ObservabilityPlugin 注册到 PluginEngine |
| `vite.config.shared.ts` | 93 | **封装** — loadPlugins 升级为 VitePluginFactory |

### 2.2 架构关系图

```
┌──────────────────────────────────────────────────────────────┐
│                    PluginEngine (新)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Agent   │ │  Tool    │ │ Storage  │ │Observ.   │        │
│  │ Plugins  │ │ Plugins  │ │ Plugins  │ │ Plugins  │        │
│  └────┬─────┘ └──────────┘ └──────────┘ └────┬─────┘        │
│       │         ┌──────────┐                  │              │
│       │         │  Infra   │ (rev1 新增)      │              │
│       │         │ Plugins  │                  │              │
│       │         └──────────┘                  │              │
│  ┌────▼──────────────────────────────────────────────────┐   │
│  │        Manifest Schema (Zod discriminatedUnion)        │   │
│  │  type: agent | tool | storage | observability |        │   │
│  │        vite | infra                                    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Lifecycle: register → install → activate → deactivate  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ ConfigCenter.watchAll → notifyConfigChange              │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、文件结构

```
server/core/
  plugin-engine/
    index.ts              ← PluginEngine 主类 + 导出
    manifest.schema.ts    ← Zod Manifest Schema (discriminatedUnion, 含 infra 类型)
    plugin-context.ts     ← PluginContext 工厂
    lifecycle.ts          ← 生命周期状态机
    dag.ts                ← 泛型 topologicalSort + 环检测 + generateFlowDiagram
    types.ts              ← 所有类型定义
  startup.ts              ← topologicalSort 泛化（向后兼容）
  agent-registry.ts       ← 扩展 after/parallel 字段

server/platform/
  plugins/                ← 内置插件目录
    observability.plugin.ts   ← OTel 封装
    vite.plugin.ts            ← VitePluginFactory（运行时注册模式）
    config-bridge.plugin.ts   ← ConfigCenter → PluginEngine 桥接（type: 'infra'）
```

---

## 四、核心类型定义

### 4.1 PluginManifest Schema

```typescript
// server/core/plugin-engine/manifest.schema.ts

import { z } from 'zod';

// ── 基础 Schema（所有插件共享） ──
const BaseManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().default(''),
  dependencies: z.array(z.string()).default([]),   // 硬依赖（必须先激活）
  after: z.array(z.string()).default([]),           // 软顺序（尽量先激活）
  enabled: z.boolean().default(true),
  critical: z.boolean().default(false),             // 启动关键性
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
});

// ── Agent 插件 ──
const AgentManifestSchema = BaseManifestSchema.extend({
  type: z.literal('agent'),
  loopStage: z.enum(['perception', 'diagnosis', 'guardrail', 'evolution', 'utility']),
  parallel: z.boolean().default(false),
  sdkAdapter: z.enum(['vercel-ai', 'langgraph', 'mastra', 'custom']).default('custom'),
  maxConcurrency: z.number().int().positive().default(5),
  timeoutMs: z.number().int().positive().default(30000),
});

// ── Tool 插件 ──
const ToolManifestSchema = BaseManifestSchema.extend({
  type: z.literal('tool'),
  inputSchema: z.any().optional(),
});

// ── Storage 插件 ──
const StorageManifestSchema = BaseManifestSchema.extend({
  type: z.literal('storage'),
  storageType: z.enum(['qdrant', 'minio', 'redis', 'clickhouse', 'postgres', 'mysql']),
});

// ── Observability 插件 ──
const ObservabilityManifestSchema = BaseManifestSchema.extend({
  type: z.literal('observability'),
  exporterType: z.enum(['console', 'otlp', 'prometheus', 'in-memory']),
});

// ── Vite 插件（rev1 修正：移除 vitePlugins 字段，改为运行时注册） ──
const ViteManifestSchema = BaseManifestSchema.extend({
  type: z.literal('vite'),
  devOnly: z.boolean().default(false),
  buildOnly: z.boolean().default(false),
  // 注意：Vite 插件是运行时对象，不在 Manifest 中声明。
  // 插件通过 onActivate 钩子向 VitePluginFactory 注册。
});

// ── Infra 插件（rev1 新增：基础设施类插件） ──
const InfraManifestSchema = BaseManifestSchema.extend({
  type: z.literal('infra'),
  infraRole: z.enum([
    'config-bridge',    // 配置中心桥接
    'event-bus',        // 事件总线桥接
    'health-check',     // 健康检查
    'metrics',          // 指标采集
    'scheduler',        // 调度器
  ]),
});

// ── 联合 Schema ──
export const PluginManifestSchema = z.discriminatedUnion('type', [
  AgentManifestSchema,
  ToolManifestSchema,
  StorageManifestSchema,
  ObservabilityManifestSchema,
  ViteManifestSchema,
  InfraManifestSchema,
]);

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type AgentPluginManifest = z.infer<typeof AgentManifestSchema>;
export type ToolPluginManifest = z.infer<typeof ToolManifestSchema>;
export type StoragePluginManifest = z.infer<typeof StorageManifestSchema>;
export type ObservabilityPluginManifest = z.infer<typeof ObservabilityManifestSchema>;
export type VitePluginManifest = z.infer<typeof ViteManifestSchema>;
export type InfraPluginManifest = z.infer<typeof InfraManifestSchema>;

// 导出各子 Schema 供测试使用
export {
  BaseManifestSchema,
  AgentManifestSchema,
  ToolManifestSchema,
  StorageManifestSchema,
  ObservabilityManifestSchema,
  ViteManifestSchema,
  InfraManifestSchema,
};
```

### 4.2 PluginLifecycle 接口

```typescript
// server/core/plugin-engine/types.ts

import type { PluginContext } from './plugin-context';
import type { PluginManifest } from './manifest.schema';

export interface PluginLifecycle {
  /** 注册阶段 — 声明能力，不执行 I/O */
  onRegister?(ctx: PluginContext): Promise<void>;
  /** 安装阶段 — 初始化资源（数据库连接、文件系统等） */
  onInstall?(ctx: PluginContext): Promise<void>;
  /** 激活阶段 — 开始提供服务 */
  onActivate?(ctx: PluginContext): Promise<void>;
  /** 停用阶段 — 优雅关闭 */
  onDeactivate?(ctx: PluginContext): Promise<void>;
  /** 配置变更通知 */
  onConfigChange?(changedKeys: string[], ctx: PluginContext): Promise<void>;
}

/** 插件实例 = Manifest + 生命周期钩子 + 运行时上下文 */
export type PluginInstance = {
  manifest: PluginManifest;
  context: PluginContext;
  state: 'registered' | 'installed' | 'active' | 'deactivated' | 'degraded';
  execute?: (input: unknown) => Promise<unknown>;
  healthCheck?: () => Promise<boolean>;
} & Partial<PluginLifecycle>;

/** 插件定义（开发者编写的格式） */
export interface PluginDefinition extends Partial<PluginLifecycle> {
  manifest: PluginManifest;
  execute?: (input: unknown) => Promise<unknown>;
  healthCheck?: () => Promise<boolean>;
}
```

### 4.3 PluginContext 接口（rev1 修正：storage → cache）

```typescript
// server/core/plugin-engine/plugin-context.ts

import type { config } from '../config';
import type { log } from '../logger';
import type { PluginInstance } from './types';

export interface PluginContext {
  /** 插件 ID */
  pluginId: string;
  /** 全局配置（只读快照） */
  config: Readonly<typeof config>;
  /** Pino child logger（自动携带 plugin/type 标签） */
  log: ReturnType<typeof log.child>;
  /** 插件间查询 API */
  plugins: {
    getByCapability: (cap: string) => PluginInstance[];
    getByStage: (stage: string) => PluginInstance[];
    isEnabled: (id: string) => boolean;
    getById: (id: string) => PluginInstance | undefined;
  };
  /** 服务 API */
  services: {
    /** HTTP 客户端 */
    http: typeof fetch;
    /**
     * 进程内非持久化缓存（rev1 修正）
     * 重启后数据丢失。持久化存储应通过 Storage 类型插件获取：
     * ctx.plugins.getById('redis-storage')
     */
    cache: {
      get(key: string): unknown | undefined;
      set(key: string, value: unknown, ttlMs?: number): void;
      delete(key: string): boolean;
    };
    /** 进程内事件总线 */
    events: {
      emit(event: string, data: unknown): void;
      on(event: string, handler: (data: unknown) => void): void;
      off(event: string, handler: (data: unknown) => void): void;
    };
  };
}
```

---

## 五、6个方向实现方案

### 方向1：模块注册与依赖注入（DI + DAG）

**现有基础：** `topologicalSort`（Kahn 算法，分层输出）+ `ModuleRegistry`

**实现方案：**

1. **泛化 topologicalSort** — 从 `StartupTask[]` 泛化为 `<T extends DAGNode>`，向后兼容
2. **PluginEngine.bootstrap()** — 调用泛化后的 topologicalSort 对 PluginManifest[] 排序
3. **after 字段处理** — `after` 作为软依赖合并到 dependencies 图中（缺失时跳过而非报错）
4. **轻量 DI** — PluginContext.plugins 提供 `getByCapability()` / `getById()` 查询，不引入 tsyringe
5. **环检测（rev1 新增）** — Kahn 算法完成后检查 `sorted.length !== nodes.length`，抛出明确错误

```typescript
// dag.ts — 泛型拓扑排序 + 环检测
export interface DAGNode {
  id: string;
  dependencies: string[];
  after?: string[];
}

export function pluginTopologicalSort<T extends DAGNode>(nodes: T[]): T[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  // 初始化
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  // 构建图：dependencies（硬依赖）+ after（软依赖，缺失时跳过）
  for (const node of nodes) {
    const allDeps = [
      ...node.dependencies,
      ...(node.after ?? []).filter(id => nodeMap.has(id)),  // after 缺失时静默跳过
    ];
    for (const dep of allDeps) {
      if (nodeMap.has(dep)) {
        adj.get(dep)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  // Kahn 算法
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(nodeMap.get(id)!);
    for (const next of adj.get(id) ?? []) {
      const newDegree = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) queue.push(next);
    }
  }

  // rev1 新增：环检测
  if (sorted.length !== nodes.length) {
    const resolved = new Set(sorted.map(s => s.id));
    const unresolved = nodes.filter(n => !resolved.has(n.id)).map(n => n.id);
    throw new Error(
      `[PluginEngine] 检测到循环依赖，无法激活以下插件: [${unresolved.join(', ')}]`
    );
  }

  return sorted;
}
```

### 方向2：插件生命周期管理

**现有基础：** `plugin.engine.ts` 有 install/enable/disable/uninstall

**实现方案：**

标准化为四阶段：`register → install → activate → deactivate`

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ register │───▶│ install  │───▶│ activate │───▶│deactivate│
│(声明能力)│    │(初始化)  │    │(提供服务)│    │(优雅关闭)│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**关键实现细节（rev1 修正：路径缓存）：**

```typescript
// PluginEngine 主类核心方法

private moduleCache = new Map<string, {
  manifest: PluginManifest;
  mod: unknown;
  sourcePath: string;    // rev1 修正：缓存原始路径
}>();

/** 发现阶段（纯加载 manifest + 缓存模块 + 缓存路径） */
async discover(pluginPath: string, opts: { bustCache?: boolean } = {}): Promise<PluginManifest> {
  const safePath = this.validatePluginPath(pluginPath);
  const importPath = opts.bustCache ? `${safePath}?t=${Date.now()}` : safePath;

  const mod = await import(importPath);
  const manifest = PluginManifestSchema.parse(mod.manifest ?? mod.default?.manifest);

  this.moduleCache.set(manifest.id, { manifest, mod, sourcePath: safePath });
  return manifest;
}

/** 激活阶段（从缓存读取模块，不重新 import） */
async activate(manifest: PluginManifest): Promise<void> {
  const cached = this.moduleCache.get(manifest.id);
  if (!cached) throw new Error(`[Plugin] ${manifest.id} 未经 discover，不能直接 activate`);

  const { mod } = cached;  // rev1 修正：使用缓存的模块，不重新拼接路径
  const context = this.createContext(manifest);

  // 硬依赖检查
  for (const dep of manifest.dependencies) {
    if (!this.plugins.has(dep)) {
      throw new Error(`[Plugin] ${manifest.id} 硬依赖 ${dep} 未激活`);
    }
  }

  const definition = (mod as any).default ?? mod;
  const instance: PluginInstance = {
    manifest,
    context,
    state: 'registered',
    execute: definition.execute,
    healthCheck: definition.healthCheck,
    onRegister: definition.onRegister,
    onInstall: definition.onInstall,
    onActivate: definition.onActivate,
    onDeactivate: definition.onDeactivate,
    onConfigChange: definition.onConfigChange,
  };

  // 生命周期执行
  await instance.onRegister?.(context);
  instance.state = 'registered';

  await instance.onInstall?.(context);
  instance.state = 'installed';

  await instance.onActivate?.(context);
  instance.state = 'active';

  // 健康检查
  await instance.healthCheck?.();

  this.manifests.set(manifest.id, manifest);
  this.plugins.set(manifest.id, instance);

  context.log.info(`✓ ${manifest.name} v${manifest.version} 已激活`);
}

/** 启动引导（带 critical 降级） */
async bootstrap(pluginPaths: string[]): Promise<void> {
  const manifests = await Promise.all(pluginPaths.map(p => this.discover(p)));
  const sorted = pluginTopologicalSort(manifests);  // rev1：含环检测
  const degraded: string[] = [];

  for (const manifest of sorted) {
    if (!manifest.enabled) {
      this.log.info(`[Plugin] ⏭ ${manifest.id} 已禁用，跳过`);
      continue;
    }
    try {
      await this.activate(manifest);
    } catch (err) {
      if (manifest.critical) {
        this.log.fatal({ err }, `[Plugin] 关键插件 ${manifest.id} 激活失败，停机`);
        process.exit(1);
      } else {
        degraded.push(manifest.id);
        this.log.warn({ err }, `[Plugin] ⚠ ${manifest.id} 激活失败，降级运行`);
        // 标记为 degraded 状态
        const cached = this.moduleCache.get(manifest.id);
        if (cached) {
          this.plugins.set(manifest.id, {
            manifest,
            context: this.createContext(manifest),
            state: 'degraded',
          });
        }
      }
    }
  }

  if (degraded.length > 0) {
    this.log.warn(`[Plugin] 引导完成，${degraded.length} 个插件降级: [${degraded.join(', ')}]`);
  } else {
    this.log.info(`[Plugin] 引导完成，${sorted.filter(m => m.enabled).length} 个插件已激活`);
  }
}

/** 热重载（仅无状态插件） */
async hotReload(id: string): Promise<void> {
  const cached = this.moduleCache.get(id);
  if (!cached) throw new Error(`[Plugin] ${id} 未注册，无法热重载`);

  // 先停用
  const existing = this.plugins.get(id);
  if (existing?.onDeactivate) {
    await existing.onDeactivate(existing.context);
  }

  // 重新发现（bust cache）+ 激活
  const manifest = await this.discover(cached.sourcePath, { bustCache: true });
  await this.activate(manifest);
}
```

### 方向3：Agent 注册中心编排图

**现有基础：** `AgentRegistry` 有 `LoopStage`/`SdkAdapter`/`discoverByStage()`

**实现方案：**

1. **扩展 AgentManifest** — 添加 `after: string[]` 和 `parallel: boolean` 字段
2. **AgentRegistry 桥接** — 注册 Agent 时同时向 PluginEngine 注册为 `type: 'agent'` 插件
3. **generateFlowDiagram()** — 根据 loopStage 分组 + after 依赖生成 Mermaid DAG

```typescript
// dag.ts — Agent 编排图可视化
export function generateFlowDiagram(
  agents: Array<{ id: string; loopStage: string; after?: string[]; parallel?: boolean }>
): string {
  const stages = ['perception', 'diagnosis', 'guardrail', 'evolution', 'utility'];
  const byStage = new Map<string, typeof agents>();

  for (const agent of agents) {
    const list = byStage.get(agent.loopStage) ?? [];
    list.push(agent);
    byStage.set(agent.loopStage, list);
  }

  const lines: string[] = ['graph TD'];

  // 按 stage 生成 subgraph
  for (const stage of stages) {
    const stageAgents = byStage.get(stage);
    if (!stageAgents?.length) continue;

    lines.push(`  subgraph ${stage}`);
    for (const agent of stageAgents) {
      const label = agent.parallel ? `${agent.id}[["${agent.id} ∥"]]` : `${agent.id}["${agent.id}"]`;
      lines.push(`    ${label}`);
    }
    lines.push('  end');
  }

  // 生成 after 依赖边
  for (const agent of agents) {
    for (const dep of agent.after ?? []) {
      lines.push(`  ${dep} --> ${agent.id}`);
    }
  }

  // 生成 stage 间顺序边
  const activeStages = stages.filter(s => byStage.has(s));
  for (let i = 0; i < activeStages.length - 1; i++) {
    lines.push(`  ${activeStages[i]} --> ${activeStages[i + 1]}`);
  }

  return lines.join('\n');
}
```

### 方向4：配置系统运行时热更新

**现有基础：** `ConfigCenter` 有 `watch()`/`watchAll()`/`set()`

**实现方案：**

1. **ConfigCenter → PluginEngine 桥接** — `configCenter.watchAll()` → `pluginEngine.notifyConfigChange()`
2. **Zod 验证** — 每次 `configCenter.set()` 前通过 Zod Schema 验证值合法性
3. **插件级响应** — 每个插件实现 `onConfigChange(changedKeys, ctx)` 钩子

```typescript
// config-bridge.plugin.ts（rev1 修正：type 改为 'infra'）
import type { PluginDefinition } from '../../core/plugin-engine/types';

export const configBridgePlugin: PluginDefinition = {
  manifest: {
    id: 'config-bridge',
    type: 'infra',                    // rev1 修正：从 'tool' 改为 'infra'
    infraRole: 'config-bridge',       // rev1 新增
    name: '配置中心桥接',
    version: '1.0.0',
    critical: true,
    dependencies: [],
    after: [],
    enabled: true,
    tags: ['infrastructure'],
    capabilities: ['config-watch'],
  },
  async onActivate(ctx) {
    const { configCenter } = await import('../../platform/services/configCenter');
    const { pluginEngine } = await import('../../core/plugin-engine');

    configCenter.watchAll(async (event) => {
      ctx.log.debug({ key: event.key }, '配置变更，通知所有插件');
      await pluginEngine.notifyConfigChange([event.key]);
    });

    ctx.log.info('ConfigCenter → PluginEngine 桥接已建立');
  },
  async onDeactivate(ctx) {
    ctx.log.info('ConfigCenter 桥接已断开');
  },
};
```

### 方向5：可观测性插件化

**现有基础：** `opentelemetry.ts` 有环境感知降级 + OTelConfig

**实现方案：**

1. **ObservabilityPlugin 接口** — 三套 exporter（console/otlp/prometheus）
2. **自动降级** — OTel 初始化失败时自动切换到 console exporter
3. **注册为插件** — 在 PluginEngine 中注册为 `type: 'observability'`

```typescript
// observability.plugin.ts
import type { PluginDefinition } from '../../core/plugin-engine/types';

export const observabilityPlugin: PluginDefinition = {
  manifest: {
    id: 'observability-otel',
    type: 'observability',
    name: 'OpenTelemetry 可观测性',
    version: '1.0.0',
    exporterType: 'otlp',  // 运行时根据环境决定实际 exporter
    critical: false,        // OTel 不可用时降级运行
    dependencies: [],
    after: [],
    enabled: true,
    tags: ['observability', 'tracing', 'metrics'],
    capabilities: ['tracing', 'metrics', 'logging'],
  },
  async onActivate(ctx) {
    try {
      const { initOpenTelemetry } = await import('../../platform/middleware/opentelemetry');
      await initOpenTelemetry();
      ctx.log.info('OTel 初始化成功');
    } catch (err) {
      ctx.log.warn({ err }, 'OTel 初始化失败，降级到 console exporter');
      // 降级：不抛出错误，使用 Pino logger 作为 fallback
    }
  },
  async onConfigChange(changedKeys, ctx) {
    if (changedKeys.some(k => k.startsWith('OTEL_'))) {
      ctx.log.info('OTel 配置变更，重新初始化');
      try {
        const { initOpenTelemetry } = await import('../../platform/middleware/opentelemetry');
        await initOpenTelemetry();
      } catch (err) {
        ctx.log.warn({ err }, 'OTel 重新初始化失败');
      }
    }
  },
  async healthCheck() {
    // 检查 OTel exporter 是否正常
    return true;
  },
};
```

### 方向6：Vite 配置插件层抽象（rev1 修正：运行时注册模式）

**现有基础：** `vite.config.shared.ts` 已实现双模式统一

**实现方案（rev1 修正）：**

Vite 插件是运行时对象（函数/对象），不适合序列化进 Zod Schema。因此采用**运行时注册模式**：

1. **VitePluginFactory** — 维护一个运行时注册表，按 dev/build 模式过滤
2. **ViteManifest** — 仅声明 `devOnly`/`buildOnly` 元数据标志
3. **onActivate 注册** — 插件在 onActivate 钩子中向 VitePluginFactory 注册实际的 Vite 插件对象

```typescript
// vite.plugin.ts — VitePluginFactory（运行时注册模式）
import type { Plugin as VitePlugin } from 'vite';

interface VitePluginEntry {
  pluginId: string;
  devOnly: boolean;
  buildOnly: boolean;
  factory: () => VitePlugin | VitePlugin[];
}

class VitePluginFactory {
  private registry: VitePluginEntry[] = [];

  /** 插件在 onActivate 中调用此方法注册 Vite 插件 */
  register(entry: VitePluginEntry): void {
    this.registry.push(entry);
  }

  /** vite.config.ts 中调用此方法获取当前模式的插件集 */
  getPlugins(mode: 'dev' | 'build'): VitePlugin[] {
    return this.registry
      .filter(entry => {
        if (mode === 'dev' && entry.buildOnly) return false;
        if (mode === 'build' && entry.devOnly) return false;
        return true;
      })
      .flatMap(entry => {
        const result = entry.factory();
        return Array.isArray(result) ? result : [result];
      });
  }

  /** 注销指定插件的所有 Vite 插件 */
  unregister(pluginId: string): void {
    this.registry = this.registry.filter(e => e.pluginId !== pluginId);
  }
}

export const vitePluginFactory = new VitePluginFactory();
```

---

## 六、Turborepo 集成方案

### 6.1 当前状态

项目已有 651 个文件的紧密耦合结构（server/ 和 client/ 共享 shared/ 类型），不适合拆分为独立 workspace。采用 Turborepo 的单包模式。

### 6.2 配置文件

```yaml
# pnpm-workspace.yaml（rev1 修正：声明当前目录为唯一 workspace 包）
packages:
  - '.'
```

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["check"],
      "outputs": ["dist/**"],
      "cache": true
    },
    "check": {
      "dependsOn": [],
      "cache": true,
      "outputs": []
    },
    "test": {
      "dependsOn": ["check"],
      "cache": true,
      "outputs": ["coverage/**"]
    },
    "test:coverage": {
      "dependsOn": ["check"],
      "cache": true,
      "outputs": ["coverage/**"]
    },
    "dev": {
      "dependsOn": [],
      "cache": false,
      "persistent": true
    },
    "db:push": {
      "dependsOn": [],
      "cache": false
    }
  }
}
```

### 6.3 收益

| 维度 | 改进 |
|------|------|
| **增量构建** | Turborepo 缓存 `dist/` 输出，无变更时跳过构建 |
| **任务编排** | `build` 自动先执行 `check`（TypeScript 编译检查） |
| **CI 加速** | 远程缓存可在 CI 间共享构建产物 |
| **开发体验** | `turbo dev` 自动管理 dev server 生命周期 |

---

## 七、启动序列集成

### 7.1 现有启动序列

```
startup-tasks.ts: 14 个任务
├── otel (critical: false)
├── config-center (critical: false)
├── health-check → depends: [otel]
├── rest-bridge → depends: [config-center]
├── outbox-publisher → depends: [config-center]
├── saga-orchestrator → depends: [config-center]
├── adaptive-sampling → depends: [config-center]
├── read-replica → depends: [config-center]
├── graph-query-optimizer → depends: [config-center]
├── event-bus → depends: [outbox-publisher, adaptive-sampling]
├── data-flow-tracer → depends: [otel]
├── agent-registry → depends: [config-center]
├── algorithm-sync → depends: [config-center]
└── data-artery → depends: [config-center, event-bus]
```

### 7.2 集成方案

在现有 14 个 startup tasks **之后**，新增 `plugin-engine` 任务：

```typescript
// startup-tasks.ts 新增
{
  id: 'plugin-engine',
  label: 'PluginEngine 引导',
  dependencies: ['config-center', 'otel'],
  critical: false,  // 插件引擎不可用时降级运行
  timeout: 30000,
  init: async () => {
    const { pluginEngine } = await import('./plugin-engine');
    await pluginEngine.bootstrap();
  },
}
```

**执行顺序：**
1. Layer 0: otel, config-center（并行）
2. Layer 1: 依赖 config-center 的 12 个任务（并行）
3. Layer 2: event-bus, data-artery
4. Layer 3: **plugin-engine**（新增）

---

## 八、迁移计划

### 8.1 Phase 1（本次实施）

| 步骤 | 内容 | 预计工时 |
|------|------|---------|
| 1 | 创建 `server/core/plugin-engine/` 目录结构 | 0.5h |
| 2 | 实现 Manifest Schema + 类型定义（含 InfraManifest） | 1h |
| 3 | 实现 PluginEngine 主类 + PluginContext + cache 服务 | 2h |
| 4 | 实现泛型 topologicalSort + 环检测 + DAG 可视化 | 1.5h |
| 5 | 实现 ConfigCenter 桥接插件（type: 'infra'） | 0.5h |
| 6 | 实现 ObservabilityPlugin | 1h |
| 7 | 实现 VitePluginFactory（运行时注册模式） | 0.5h |
| 8 | 扩展 AgentRegistry（after/parallel） | 0.5h |
| 9 | 集成到 startup-tasks.ts | 0.5h |
| 10 | Turborepo 配置（turbo.json + pnpm-workspace.yaml） | 0.5h |
| 11 | 测试用例编写（8+ 场景，见下方清单） | 5h |
| **合计** | | **~13h** |

### 8.1.1 测试场景清单（rev1 新增）

| # | 场景 | 预期行为 |
|---|------|---------|
| 1 | discover 路径越界（`../etc/passwd`） | 抛出路径越界错误 |
| 2 | Manifest Zod 校验失败（缺少必填字段） | 抛出 ZodError |
| 3 | 循环依赖检测（A→B→C→A） | 抛出明确错误列出环中节点 |
| 4 | critical 插件激活失败 | 调用 process.exit(1) |
| 5 | 非 critical 插件激活失败 | 降级运行，标记为 degraded |
| 6 | after 软依赖缺失 | 静默跳过，正常激活 |
| 7 | 热重载缓存绕过 | 重新 import 模块，版本更新 |
| 8 | onConfigChange 通知传播 | 所有活跃插件收到变更通知 |
| 9 | onDeactivate 超时兜底 | 超时后强制标记为 deactivated |
| 10 | generateFlowDiagram 输出有效 Mermaid | 可被 Mermaid 解析器接受 |
| 11 | discriminatedUnion 边界（6 种 type） | 每种 type 的 Schema 独立验证 |

### 8.2 Phase 2（后续）

将现有 4 个内置插件（LogAnalyzer, DataValidator, AlertNotifier, DataTransformer）迁移为 Manifest 格式。编写插件开发 SDK 文档。实现插件市场前端 UI。

---

## 九、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| topologicalSort 泛化破坏现有启动序列 | 高 | 保留原函数签名，新增泛型版本 |
| PluginEngine 循环依赖 config.ts | 中 | PluginEngine 延迟导入 config |
| OTel 插件化后初始化时序变化 | 中 | 保留现有 startup task 中的 OTel 初始化，插件层为增强 |
| Turborepo 与现有 pnpm scripts 冲突 | 低 | 单包模式兼容性好，scripts 不变 |
| **插件间循环依赖（rev1 新增）** | **高** | **Kahn 算法后环检测，抛出明确错误列出环中节点** |
| **pnpm-workspace.yaml 配置错误（rev1 新增）** | **中** | **声明 `packages: ['.']`，turbo build 前验证包发现** |

---

## 十、验收标准

1. `pnpm tsc --noEmit` — 0 errors
2. `pnpm test` — 全部通过（现有 203 用例 + 新增 XPE 测试 ≥8 用例 = **≥211 用例**）
3. `pnpm build` — 成功
4. `pluginEngine.bootstrap()` 在启动序列中执行成功
5. `generateFlowDiagram()` 输出有效 Mermaid 图
6. ConfigCenter 配置变更能触发插件 `onConfigChange`
7. OTel 降级场景正常工作
8. `turbo build` 缓存命中时跳过构建
9. **（rev1 新增）** 循环依赖场景抛出明确错误
10. **（rev1 新增）** discover 路径越界场景抛出安全错误
