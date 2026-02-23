# Agent 注册中心 (AgentRegistry) 设计文档

> **版本**: 1.0.0  
> **状态**: 已实现 (Phase 1) + 增强规划 (Phase 2)  
> **作者**: 整改方案 v2.1 · B-07  
> **最后更新**: 2026-02-24

---

## 1. 概述

AgentRegistry 是西联智能平台的**平台级 AI Agent 统一管理中心**，负责所有 AI Agent 的注册、发现、调用和生命周期管理。它是平台"感知 → 诊断 → 护栏 → 进化"闭环架构的核心基础设施。

### 1.1 设计目标

| 目标 | 描述 |
|------|------|
| **统一管理** | 所有 AI Agent 通过同一注册中心管理，避免散布在各处的独立初始化 |
| **多 SDK 适配** | 支持 custom（现有 grok-tool-calling）、vercel-ai、langgraph、mastra 四种适配器 |
| **闭环对齐** | 每个 Agent 声明所属的 `loopStage`，与平台闭环阶段精确对应 |
| **可观测性** | 每次调用的耗时、成功率、token 消耗均可追踪 |
| **分级容错** | Agent 注册/调用失败不影响平台核心功能 |

### 1.2 架构位置

```
server/
├── core/
│   ├── agent-registry.ts          ← 核心类 + 类型定义（515 行）
│   ├── agent-registry.bootstrap.ts ← 启动桥接层（197 行）
│   └── startup-tasks.ts           ← 通过启动编排器调用
├── services/
│   ├── grokDiagnosticAgent.service.ts  ← 诊断 Agent 实现
│   └── grokPlatformAgent.service.ts    ← 平台自省 Agent 实现
└── algorithms/
    └── agent-plugins/              ← 未来 Agent 插件目录
```

---

## 2. 核心概念

### 2.1 AgentManifest（Agent 清单）

每个 Agent 在注册时必须提供一个 `AgentManifest`，这是 Agent 的**自描述元数据 + 执行函数**的完整声明。

```typescript
interface AgentManifest {
  // ── 元数据 ──
  id: string;              // 唯一标识符（kebab-case）
  name: string;            // 显示名称
  description: string;     // 描述
  version: string;         // 语义化版本
  loopStage: LoopStage;   // 闭环阶段
  sdkAdapter: SdkAdapter;  // SDK 适配器类型
  tags?: string[];         // 搜索标签
  capabilities?: string[]; // 能力声明
  tools?: string[];        // 关联的工具名称
  maxConcurrency?: number; // 最大并发数
  timeoutMs?: number;      // 超时时间

  // ── 执行函数 ──
  invoke: (input, context) => Promise<AgentResult>;
  invokeStream?: (input, context) => AsyncGenerator<StreamChunk>;
  healthCheck?: () => Promise<AgentHealth>;
}
```

### 2.2 LoopStage（闭环阶段）

| 阶段 | 含义 | 当前 Agent |
|------|------|-----------|
| `perception` | 感知层 — 数据采集、特征提取 | （规划中）|
| `diagnosis` | 诊断层 — 故障分析、异常检测 | `diagnostic-agent` |
| `guardrail` | 护栏层 — 安全检查、合规验证 | （规划中）|
| `evolution` | 进化层 — 模型优化、自适应 | （规划中）|
| `utility` | 工具层 — 平台自省、辅助功能 | `platform-agent` |

### 2.3 SdkAdapter（SDK 适配器）

| 适配器 | 描述 | 状态 |
|--------|------|------|
| `custom` | 现有 grok-tool-calling 引擎 | **已实现** |
| `vercel-ai` | Vercel AI SDK（ai 包） | 规划中 |
| `langgraph` | LangChain LangGraph | 规划中 |
| `mastra` | Mastra Agent Framework | 规划中 |

---

## 3. 依赖图

```
                    ┌──────────────┐
                    │ config-center│
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │agent-registry│
                    │  (bootstrap) │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      ┌───────▼──────┐ ┌──▼──────────┐ │
      │ diagnostic-  │ │ platform-   │ │
      │ agent        │ │ agent       │ ...
      └──────────────┘ └─────────────┘
```

启动顺序由 `startup-tasks.ts` 中的拓扑排序决定：
- `agent-registry` 依赖 `config-center`
- 在启动编排器的并行初始化层中执行

---

## 4. 运行时行为

### 4.1 调用流程

```
客户端请求
    │
    ▼
tRPC Router → agentRegistry.invoke(agentId, input, context)
    │
    ├── 1. 查找 Agent manifest
    ├── 2. 并发控制检查
    ├── 3. 超时保护包装
    ├── 4. 调用 manifest.invoke()
    ├── 5. 记录运行时统计
    └── 6. 发出 RegistryEvent
```

### 4.2 流式调用

```
客户端请求（SSE/WebSocket）
    │
    ▼
agentRegistry.invokeStream(agentId, input, context)
    │
    ├── 有 invokeStream → 使用原生流式实现
    └── 无 invokeStream → 降级为 invoke 的单块输出
```

### 4.3 容错策略

| 场景 | 行为 |
|------|------|
| Agent 注册失败 | 记录 warn 日志，不影响其他 Agent |
| Agent 调用超时 | 返回 `{ success: false, error: "timeout" }` |
| 并发超限 | 返回 `{ success: false, error: "concurrency limit" }` |
| Agent 未找到 | 抛出 Error（调用方应处理） |
| 健康检查失败 | 标记为 `unavailable`，不移除注册 |

---

## 5. 已注册 Agent 详情

### 5.1 诊断 Agent (`diagnostic-agent`)

| 属性 | 值 |
|------|-----|
| 闭环阶段 | `diagnosis` |
| SDK 适配器 | `custom`（grok-tool-calling） |
| 最大并发 | 5 |
| 超时 | 120s |
| 工具数量 | 8 个 |
| 能力 | multi-turn, tool-calling, structured-output, ollama-fallback |

**工具列表**：
1. `query_sensor_realtime` — 实时传感器数据查询
2. `query_clickhouse_analytics` — ClickHouse 分析查询
3. `query_knowledge_graph` — 知识图谱查询
4. `compute_physics_formula` — 物理公式计算
5. `search_similar_cases` — 相似案例搜索
6. `predict_device_state` — 设备状态预测
7. `counterfactual_analysis` — 反事实分析
8. `generate_diagnosis_report` — 诊断报告生成

### 5.2 平台自省 Agent (`platform-agent`)

| 属性 | 值 |
|------|-----|
| 闭环阶段 | `utility` |
| SDK 适配器 | `custom`（grok-tool-calling） |
| 最大并发 | 2 |
| 超时 | 90s |
| 工具数量 | 6 个 |
| 能力 | self-diagnosis, infra-health, module-analysis, local-fallback |

**工具列表**：
1. `get_module_status` — 模块状态查询
2. `get_completeness_report` — 完整度报告
3. `get_stub_hotspots` — 桩函数热点
4. `check_infra_health` — 基础设施健康检查
5. `get_feature_flags` — Feature Flags 查询
6. `get_dependency_graph` — 依赖图谱

---

## 6. API 参考

### 6.1 注册与发现

```typescript
import { agentRegistry } from '../core/agent-registry';

// 注册
agentRegistry.register(manifest);

// 注销
agentRegistry.unregister('diagnostic-agent');

// 发现
agentRegistry.listAll();                          // 所有 Agent
agentRegistry.discoverByStage('diagnosis');       // 按闭环阶段
agentRegistry.discoverByAdapter('custom');        // 按 SDK
agentRegistry.discoverByTag('grok');              // 按标签
agentRegistry.discoverByCapability('tool-calling'); // 按能力
```

### 6.2 调用

```typescript
// 一次性调用
const result = await agentRegistry.invoke('diagnostic-agent', {
  deviceCode: 'PUMP-001',
  description: '振动异常',
  mode: 'deep',
}, {
  sessionId: 'session-123',
  machineId: 'machine-456',
});

// 流式调用
for await (const chunk of agentRegistry.invokeStream('diagnostic-agent', input, ctx)) {
  process.stdout.write(chunk.content);
}
```

### 6.3 监控

```typescript
// 单个 Agent 统计
const stats = agentRegistry.getStats('diagnostic-agent');
// → { registeredAt, lastInvokedAt, totalInvocations, failureCount, activeConcurrency, lastHealth }

// 全局摘要
const summary = agentRegistry.getSummary();
// → { totalAgents, byStage, byAdapter, totalInvocations, totalFailures }

// 全量健康检查
const health = await agentRegistry.healthCheckAll();
// → Map<agentId, 'healthy' | 'degraded' | 'unavailable'>

// 事件监听
const unsubscribe = agentRegistry.onEvent(event => {
  console.log(event.type, event.agentId, event.durationMs);
});
```

---

## 7. Phase 2 增强规划

### 7.1 多 SDK 适配器实现

**目标**：支持 vercel-ai、langgraph、mastra 三种外部 SDK。

**实现方案**：

```typescript
// 适配器接口
interface AgentAdapter {
  type: SdkAdapter;
  invoke(manifest: AgentManifest, input: unknown, ctx: AgentContext): Promise<AgentResult>;
  invokeStream?(manifest: AgentManifest, input: unknown, ctx: AgentContext): AsyncGenerator<StreamChunk>;
}

// 适配器注册
class AgentRegistry {
  private adapters: Map<SdkAdapter, AgentAdapter> = new Map();
  
  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }
}
```

**各适配器实现要点**：

| 适配器 | 依赖包 | 核心集成点 |
|--------|--------|-----------|
| `vercel-ai` | `ai` | `generateText()` / `streamText()` |
| `langgraph` | `@langchain/langgraph` | `StateGraph.compile().invoke()` |
| `mastra` | `@mastra/core` | `Agent.generate()` / `Agent.stream()` |

### 7.2 Agent 热加载

**目标**：支持运行时动态加载/卸载 Agent，无需重启服务。

```typescript
// 热加载接口
agentRegistry.loadFromPlugin(pluginPath: string): Promise<void>;
agentRegistry.unloadPlugin(pluginId: string): Promise<void>;
```

**实现路径**：
1. 定义 Agent 插件目录结构（`server/algorithms/agent-plugins/{name}/`）
2. 每个插件包含 `manifest.json` + `index.ts`
3. 使用 `import()` 动态加载
4. 文件监听（`chokidar`）实现开发模式热重载

### 7.3 Agent 链式编排

**目标**：支持多个 Agent 的串行/并行编排。

```typescript
// 链式调用
const result = await agentRegistry.chain([
  { agentId: 'perception-agent', input: rawData },
  { agentId: 'diagnostic-agent', inputFrom: 'previous' },
  { agentId: 'guardrail-agent', inputFrom: 'previous' },
]);

// 并行扇出
const results = await agentRegistry.fanOut([
  { agentId: 'diagnostic-agent', input: data1 },
  { agentId: 'predictive-agent', input: data2 },
]);
```

### 7.4 Agent 可视化面板

**目标**：在前端提供 Agent 管理面板。

**功能**：
- Agent 列表（状态、版本、闭环阶段）
- 实时调用统计（QPS、延迟、成功率）
- 健康状态仪表盘
- 调用日志查看
- Agent 配置热更新

**前端路由**：`/agents`（已有 `Agents.tsx` 页面骨架）

---

## 8. 测试覆盖

| 测试文件 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| `server/__tests__/agent-registry.test.ts` | 7 | 注册、发现、调用、流式、健康检查 |
| `server/__tests__/agent-otel.test.ts` | 7 | OTel 集成、trace_id 注入 |

### 8.1 关键测试场景

1. **注册与发现**：注册 Agent → 按 stage/adapter/tag 发现
2. **调用与超时**：正常调用 → 超时保护 → 并发控制
3. **流式降级**：有 invokeStream → 使用原生流式；无 → 降级为单块
4. **容错**：注册失败不影响其他 Agent；调用失败返回结构化错误
5. **运行时统计**：调用次数、失败次数、并发数准确追踪

---

## 9. 与平台架构的关系

AgentRegistry 位于平台 10 层架构的 **L5 认知层**：

```
L9  可视化层     ← Agent 管理面板（/agents）
L8  API 层       ← tRPC router 调用 agentRegistry
L7  业务层       ← 业务逻辑触发 Agent 调用
L6  编排层       ← Agent 链式编排（Phase 2）
L5  认知层       ← AgentRegistry ★
L4  算法层       ← Agent 使用的算法库
L3  数据层       ← Agent 访问的数据源
L2  自省层       ← platform-agent（L2 自省）
L1  基础设施层   ← OTel、配置中心
L0  运行时层     ← Node.js、Docker
```

---

## 10. 变更日志

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-22 | 初始实现：AgentRegistry 核心类 + 2 个内置 Agent 注册 |
| 1.1.0 | 2026-02-24 | 集成启动编排器（B-02），通过拓扑排序管理启动依赖 |
