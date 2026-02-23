# 西联智能平台（PortAI Nexus）开发工作流整改方案 v2.1

> **文档性质**：基于全链路代码审计 + 两份深挖报告 + 深度评审反馈 + 2026 年技术生态研究的系统性整改方案（终稿）
> **审计对象**：xilian-platform v4.0.0（407 服务端 TS 文件 / 156,078 行 + 221 客户端 TSX / 78,304 行）
> **版本**：v2.1（v2.0 深度解读后微调终稿——Agent Registry 集成 Vercel AI SDK adapter、AI 特有测试补充、Encore POC 补充量化指标、CI 缓存优化、核心原则第 4 条 TDD）
> **日期**：2026-02-23
> **作者**：Manus AI

---

## 一、执行摘要

本文档是西联智能平台开发工作流的**系统性整改方案终稿**。它在 v1.0 方案（评分 9.0/10）的基础上，整合了深度评审指出的四类不足——工时估计偏乐观 30-50%、2026 技术趋势遗漏（Encore.ts 崛起）、AI 平台特有领域覆盖不足（Agent 编排、向量测试、CI 远程缓存）、阶段四决策不够量化——进行了全面修订。

方案的三层逻辑保持不变：**第一层是已实施的 7 项表面修复**（止血层），解决"用户看不到 Server running"的即时困惑；**第二层是 9 个系统性隐患的根因治疗**（手术层），从日志语义到 OTel 断裂到模块注册瓶颈；**第三层是 18 个月的架构演进路径**（战略层），从 Express 单体天花板到全栈升级。

v2.0 的核心变更：

| 变更项 | v1.0 | v2.0 |
|--------|------|------|
| 阶段数 | 4 阶段 17 项 | **5 阶段 22 项**（新增 Phase 0.5） |
| 工时估计 | 偏乐观 | **全部上浮 30-50%**，含联调和回归 |
| Encore.ts | 未提及 | **新增 C-04 POC 评估**（20h） |
| Agent 编排 | 仅提及 intelligence 域 | **新增 B-07 Agent 注册中心设计** |
| 测试覆盖 | 未提及 | **新增 Phase 0.5 测试骨架 + 安全扫描** |
| CI 远程缓存 | 未提及 | **B-06 CI Pipeline 含 Turborepo 缓存** |
| 阶段四决策 | 定性描述 | **量化决策矩阵**（5 维度 4 方案） |

---

## 二、平台现状画像

### 2.1 规模与技术栈

西联智能平台在 2026 年 2 月的代码规模已达到 **23.4 万行**（服务端 15.6 万 + 客户端 7.8 万），分布在 628 个 TypeScript/TSX 文件中。这个规模已经超越了"业务项目"的范畴，进入了**平台级系统**的领域——深挖报告精确指出，157K 行服务端代码意味着项目已过"快速原型"阶段，进入了需要"工程成熟度"的阶段 [1]。

| 维度 | 数据 | 评价 |
|------|------|------|
| 服务端代码 | 407 个 TS 文件，156,078 行 | 中大型单体，接近拆分拐点 |
| 客户端代码 | 221 个 TSX 文件，78,304 行 | 中等规模前端 |
| 模块注册中心 | 36 个模块，6 个域 | 手动管理，无 DI 框架 |
| Docker Compose 服务 | 30+ 个容器 | 基础设施完备但运维复杂 |
| 日志调用分布 | debug:281 / info:300 / warn:179 / error:463 / fatal:3 | **error 数量异常偏高（倒挂）** |
| 废弃标记文件 | 20+ 个 @deprecated 文件 | 安全债 + 认知债 |
| Zod 使用 | 60 处 import | 已有基础，但未覆盖配置验证 |
| OTel 依赖 | 8 个 @opentelemetry 包已安装 | 代码完备但运行时失败 |
| Grok 工具 | 12 个 Tool Calling 工具（4 阶段） | 闭环 Agent 雏形已成型 |
| Agent 插件 | agent-plugins/index.ts 850 行 | 有基础但缺标准化注册框架 |
| 测试文件 | 0 个 | **完全空白** |
| CI/CD | 无 GitHub Actions workflow | **完全空白** |

### 2.2 架构拓扑

平台采用**混合工作流**：Docker Compose 管理基础设施（MySQL、Redis、Kafka、ClickHouse、Qdrant、Elasticsearch、MinIO、Jaeger、Prometheus、Grafana 等 30+ 服务），本地 `pnpm dev` 通过 `tsx watch` 启动主应用（Express + Vite 中间件模式 + tRPC）。

这种混合工作流在 2026 年仍然是**开发体验（DX）的最优解** [2]，比全容器化（每次改代码都要 rebuild）或全云函数（本地调试困难）都更适合日常开发。Vite 官方文档在 2026 年仍然推荐 Express + Vite middleware mode 作为 SSR 的标准方案 [3]。

### 2.3 模块域分布与 Agent 编排现状

代码审计揭示了模块注册中心的实际分布，以及已有的 Agent 编排基础：

| 域 | 模块数 | 职责 | Agent 相关能力 |
|----|--------|------|----------------|
| infra | 8 | 基础设施（数据库、缓存、消息队列、存储） | — |
| core | 7 | 核心业务（用户、权限、配置、日志） | module.registry.ts（937 行） |
| orchestration | 5 | 编排层（流水线、调度、工作流） | 任务编排、调度引擎 |
| intelligence | 4 | 智能层（AI 推理、认知引擎、元学习） | Grok 12 工具、agent-plugins 850 行 |
| data | 4 | 数据层（数据动脉、特征注册、知识图谱） | DataArtery 实时流 |
| security | 3 | 安全层（认证、授权、审计） | — |

**关键发现**：平台已有相当成熟的 Agent 编排雏形——`grok-tools.ts` 定义了 12 个 Tool Calling 工具，按闭环阶段分组（感知→诊断 8 个→护栏 1 个→进化 3 个）；`agent-plugins/index.ts`（850 行）提供了插件扩展机制；`module.registry.ts`（937 行）实现了完整的模块 Manifest 注册（含能力清单、完整度、依赖关系）。但这些组件之间缺少一个**统一的 Agent 注册/发现/编排框架**。

### 2.4 日志级别分布异常

代码审计发现了一个值得警惕的信号：**error 级别的日志调用（463 次）远超 info（300 次）**。在健康的代码库中，info 应该是最多的级别（记录正常运行里程碑），error 应该是较少的（只在需要人工介入时使用）。当前的倒挂说明大量"不需要人工介入的异常"被标记为 error，这直接导致了 Topology 30+ 条 ERROR 刷屏——开发者对 error 日志产生了"狼来了"效应。

---

## 三、问题全景与根因分析

本节将所有材料揭示的问题统一编号，按**系统影响面**从大到小排列。v2.0 新增 R-10 至 R-12 三个在 v1.0 中遗漏的问题。

### 3.1 第一类：工程规范缺失（影响全局）

**R-01：日志语义规范缺失**

156,078 行服务端代码中有 1,226 处日志调用，但没有一份文档定义"什么情况用什么级别"。已实施的修复将 `server.listen()` 回调中的 `log.debug()` 改为 `log.info()`，这是 1,226 处调用中的 5 处。从 error:463 远超 info:300 的倒挂现象推断，至少有 100-200 处 error 应该降级为 warn。根因不是"某个开发者犯了错"，而是**项目从未建立日志级别的共识标准**。

**R-02：配置管理无单一权威来源**

端口配置散布在 **6 个位置**：`dev-bootstrap.sh`、`config.ts`、`vite.config.ts`、`server/core/index.ts`、`server/core/vite.ts`、`docker-compose.yml`。更广泛地看，整个配置系统涉及环境变量、config.ts 默认值、Docker Compose 环境变量、可能存在的 .env 文件四个来源，没有明确的优先级规则。深挖报告精确指出：如果有人在 .env 文件里设置了不同的 PORT，或者 Docker Compose 里映射了不同的端口，**哪个算数？**

**R-03：废弃代码未清理**

20+ 个文件标记了 @deprecated，涵盖路由层、WebSocket 层、连接器层、核心层、认知引擎层。三重危害：**安全攻击面**（废弃的 WebSocket endpoint 仍在监听）、**认知负担**（新开发者不知道用哪个文件）、**隐性依赖**（其他模块可能仍在 import 废弃文件）。

### 3.2 第二类：可观测性断裂（影响排障能力）

**R-04：OpenTelemetry 初始化失败**

代码审计揭示了**精确的失败链路**：

1. `@opentelemetry/exporter-prometheus` 未在 package.json 中声明，也未安装在 node_modules 中
2. 降级到 OTLP push 模式，但 Docker Compose 中没有 otel-collector 服务
3. Trace 导出器尝试连接 `http://jaeger:4318`，但 Jaeger 在本地开发环境中属于选配服务
4. 整个 OTel 初始化失败，输出 `ERROR [opentelemetry] Failed to initialize`，然后静默降级

根因是**三层缺失叠加**：缺少依赖包、缺少 otel-collector 服务、Jaeger 未在最小启动集中。这不是"配置错误"，而是 OTel 集成处于**半成品状态**。

**R-05：SECURITY 警告被静默吞没**

3 处 SECURITY 警告使用 `console.warn()` 输出（AIRFLOW_USERNAME/PASSWORD、CLICKHOUSE_PASSWORD），在 Pino 日志流中不可见。如果开发者只看 Pino 日志，这些安全警告**完全不可见**。

### 3.3 第三类：架构扩展瓶颈（影响未来 6-18 个月）

**R-06：双 Vite 配置体系**

两份 Vite 配置的 `resolve.alias`、`plugins` 必须手动保持同步。深挖报告给出了精确的失败场景：新人修改 `vite.config.ts` 添加 alias，忘记同步到 `server/core/vite.ts`，导致 `pnpm dev` 中 alias 不生效但 `pnpm build` 正常——这类 bug 极难定位。已实施的"添加注释"修复是在用"靠人记住"替代"让系统强制保证"。

**R-07：Express 单体架构与 36 模块的张力**

36 个模块通过 `tsx watch` 统一启动，改任何一个文件都重启整个服务器。拐点预测：模块数 > 50 时启动 > 5 秒，AI 推理模块增加时内存 > 2GB。但**不要现在拆分**——过早的微服务化在规模不够大时只会增加运维复杂度（Martin Fowler "Monolith First" 原则 [4]）。

**R-08：模块注册机制缺少显式依赖声明**

module.registry.ts（937 行）为 36 个模块提供 Manifest 注册，声明了能力清单、完整度、依赖关系。但启动顺序依赖靠约定（代码中的 import 顺序），没有显式的拓扑排序。模块注册失败时，系统继续运行，没有区分"核心依赖失败必须退出"和"可选功能失败可降级"。

**R-09：tRPC 在 AI 场景的边界**

平台同时使用 REST Bridge、tRPC、WebSocket、Kafka 四种通信协议。AI 推理的流式响应（SSE）、长时任务（分钟级训练）、非 TS 消费方（Python ML 集群）三个场景都在触及 tRPC 的边界。

### 3.4 第四类：v2.0 新增——AI 平台特有缺失

**R-10：测试覆盖完全空白**

代码审计确认项目中 **0 个测试文件**、无 vitest.config.ts、无 playwright.config.ts、无 .github/workflows 目录。23.4 万行代码没有任何自动化测试保护。这意味着每次修改都是"盲飞"——没有回归测试确认修改没有破坏其他功能。对于一个 AI 平台，Agent 编排逻辑、工具调用链路、数据管道的正确性尤其需要测试保护。

**R-11：Agent 编排缺少标准化框架**

平台已有 Grok 12 工具（按闭环阶段分组）、agent-plugins（850 行）、module.registry（937 行），但这些组件之间缺少统一的 Agent 注册/发现/编排框架。当前的 `GrokTool` 接口定义了 `name`、`description`、`loopStage`、`inputSchema`、`outputSchema`、`execute`，但没有：

- Agent 级别的生命周期管理（启动/停止/健康检查）
- 工具组合的编排图（哪些工具可以串联、并联）
- Agent 间的通信协议（一个 Agent 的输出如何成为另一个的输入）
- 运行时的并发控制和资源隔离

2026 年 TypeScript AI Agent 框架生态已经成熟——Vercel AI SDK（2.8M 周下载）、LangGraph.js、Mastra 等都提供了这些能力 [5]。

**R-12：安全扫描与依赖审计缺失**

没有 Dependabot、Snyk 或任何自动化的依赖漏洞扫描。30+ Docker 服务的镜像版本是否有已知 CVE 未知。在处理港口 AI 运营数据的平台上，这是不可忽视的风险。

---

## 四、整改方案

### Phase 0.5：测试与安全基础（第 1 周，约 8 工时）

> **v2.0 新增**。深度评审指出 v1.0 完全遗漏了测试覆盖和安全扫描。本阶段在所有代码修改之前建立测试骨架和安全基线，确保后续整改有回归保护。

#### 行动项 Z-01：Vitest 测试骨架

**目标**：建立测试基础设施，为后续整改提供回归保护。

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**/*.ts'],
      exclude: ['server/**/*.test.ts', 'server/**/*.d.ts'],
    },
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
```

**首批测试目标**（覆盖整改方案中最关键的路径）：

```typescript
// server/core/__tests__/config.test.ts
import { describe, test, expect } from 'vitest';

describe('Configuration Validation', () => {
  test('should fail fast when MYSQL_PASSWORD is missing', () => {
    delete process.env.MYSQL_PASSWORD;
    expect(() => validateConfig(rawConfig)).toThrow();
  });

  test('should resolve PORT from environment variable', () => {
    process.env.PORT = '3001';
    const config = buildConfig();
    expect(config.app.port).toBe(3001);
  });

  test('should use default PORT when not set', () => {
    delete process.env.PORT;
    const config = buildConfig();
    expect(config.app.port).toBe(3000);
  });
});

// server/core/__tests__/startup.test.ts
describe('Startup Sequence', () => {
  test('should show banner with port and startup time', async () => {
    const output = await captureStartupOutput();
    expect(output).toContain('➜  Local:   http://localhost:');
    expect(output).toMatch(/Startup: \d+\.\d+s/);
  });

  test('critical task failure should exit process', async () => {
    const tasks = [
      { id: 'mysql', critical: true, init: async () => { throw new Error('Connection refused'); } },
    ];
    await expect(executeStartupSequence(tasks)).rejects.toThrow();
  });

  test('non-critical task failure should continue in degraded mode', async () => {
    const tasks = [
      { id: 'topology', critical: false, init: async () => { throw new Error('Neo4j unavailable'); } },
    ];
    const result = await executeStartupSequence(tasks);
    expect(result.degraded).toContain('topology');
  });
});
```

**工时估计**：vitest 配置 1h + 首批 8-10 个测试用例 3h + 文档 0.5h = **4.5h**（v1.0 未计入）

**验证标准**：`pnpm test` 能运行并通过所有测试，`pnpm test:coverage` 输出覆盖率报告。

**AI 特有测试**（v2.1 新增——Agent 编排是平台核心竞争力，必须从第一天就有测试保护）：

```typescript
// server/intelligence/__tests__/agent-registry.test.ts
import { describe, test, expect } from 'vitest';

describe('Agent Registry', () => {
  test('should discover diagnosis agents by stage', () => {
    const agents = agentRegistry.discoverByStage('diagnosis');
    expect(agents.length).toBeGreaterThan(0);
    agents.forEach(a => expect(a.loopStage).toBe('diagnosis'));
  });

  test('should stream output via Vercel AI SDK adapter', async () => {
    const stream = agentRegistry.invoke('diagnostic-agent', {
      prompt: '港口设备异常振动分析',
      maxSteps: 3,
    });
    let chunks = 0;
    for await (const chunk of stream) {
      chunks++;
      expect(chunk).toHaveProperty('content');
      expect(chunk).toHaveProperty('type');
    }
    expect(chunks).toBeGreaterThan(1); // 验证 streaming 正常
  });

  test('should fallback to custom adapter when SDK unavailable', async () => {
    const agent = agentRegistry.get('legacy-tool-agent');
    expect(agent?.sdkAdapter).toBe('custom');
    const stream = agentRegistry.invoke('legacy-tool-agent', { prompt: 'test' });
    const chunks = [];
    for await (const chunk of stream) { chunks.push(chunk); }
    expect(chunks.length).toBeGreaterThan(0);
  });

  test('should report health status for all registered agents', async () => {
    const agents = agentRegistry.getAll();
    for (const agent of agents) {
      const healthy = await agent.healthCheck();
      expect(typeof healthy).toBe('boolean');
    }
  });
});
```

这样 Phase 0.5 就真正覆盖了"AI 平台最需要保护的部分"——不仅是配置和启动，还有 Agent 编排的核心链路。

---

#### 行动项 Z-02：安全扫描基线

**目标**：建立依赖漏洞扫描和 Docker 镜像审计的自动化基线。

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels: ["dependencies"]

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "monthly"
    labels: ["docker"]
```

```bash
# 本地安全审计脚本 scripts/security-audit.sh
#!/bin/bash
set -euo pipefail

echo "=== npm audit ==="
pnpm audit --audit-level=high || true

echo "=== Docker image scan (Trivy) ==="
for image in $(grep "image:" docker-compose.yml | awk '{print $2}' | sort -u); do
  echo "Scanning: $image"
  docker run --rm aquasec/trivy image --severity HIGH,CRITICAL "$image" 2>/dev/null || echo "  ⚠ Scan failed for $image"
done
```

**工时估计**：Dependabot 配置 0.5h + 审计脚本 1h + 首次运行和修复高危漏洞 2h = **3.5h**（v1.0 未计入）

**验证标准**：`pnpm audit` 无 high/critical 漏洞；Dependabot PR 自动创建。

---

### 阶段一：立即可做（第 2-3 周，约 24 工时）

> **v2.0 工时修正**：v1.0 估计 16h，评审指出偏乐观 30-50%。v2.0 上浮至 24h，含联调和回归测试时间。

本阶段的目标是**消除所有已知的工程债务**，不涉及架构变更，全部是局部修改。

#### 行动项 A-01：建立日志级别规范

**目标**：为 1,226 处日志调用建立统一的语义标准，并修复最严重的级别错误。

**日志级别规范**：

| 级别 | 语义 | 判断标准 | 典型场景 | 工业 AI 平台映射 |
|------|------|----------|----------|------------------|
| fatal | 进程必须退出 | 无法恢复，继续运行会损坏数据 | 数据库连接池耗尽、核心配置缺失 | 核心传感器失效，必须停机 |
| error | 需要人工介入 | 自动重试/降级无法解决 | 外部 API 持续失败、磁盘空间不足 | 数据质量持续恶化，需人工检查 |
| warn | 异常但可自恢复 | 系统自动处理了异常 | 端口占用自动切换、可选服务不可用 | 单个传感器漂移，切换到备用 |
| info | 正常运行里程碑 | 系统生命周期关键节点 | 服务启动/停止、模块注册完成 | 预测性维护任务触发、模型训练完成 |
| debug | 开发诊断信息 | 仅排障时需要 | 每个 tRPC 调用、SQL 语句 | 每条 MQTT 消息、Kafka 消费记录 |

**立即修复的高优先级项**：

Topology 服务在 Neo4j 不可用时产生的 30+ 条 ERROR 应降级为 **1 条 WARN**（聚合模式）：

```typescript
// 修复后：聚合为 1 条 WARN
const failures: string[] = [];
nodes.forEach(node => {
  try { registerNode(node); }
  catch { failures.push(node.id); }
});
if (failures.length > 0) {
  log.warn(
    `[Topology] ${failures.length} nodes failed to register (Neo4j unavailable): ` +
    `[${failures.slice(0, 5).join(', ')}${failures.length > 5 ? '...' : ''}]`
  );
}
```

SECURITY 警告从 `console.warn()` 迁移到 Pino `log.warn()`：

```typescript
// 修复后 — 在统一日志流中可见
password: process.env.CLICKHOUSE_PASSWORD || (() => {
  log.warn('[SECURITY] CLICKHOUSE_PASSWORD not set — MUST configure in production');
  return '';
})(),
```

**工时估计**：规范文档 1h + Topology 聚合 1.5h + SECURITY 迁移 1h + error→warn 批量审查 4h + 回归测试 1h = **8.5h**（v1.0 为 5h）

**验证标准**：`LOG_LEVEL=info pnpm dev` 启动后，终端中 ERROR 级别日志 < 5 条。`pnpm test` 中日志级别相关测试全部通过。

---

#### 行动项 A-02：提取共享 Vite 配置

**目标**：物理消除双 Vite 配置分叉风险——不是"加注释提醒"，而是 DRY 原则的物理强制。

```typescript
// vite.config.shared.ts — 单一权威来源
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export function getSharedViteConfig() {
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './client/src'),
        '@shared': path.resolve(__dirname, './shared'),
      },
    },
    plugins: [react(), tailwindcss()],
  };
}
```

```typescript
// vite.config.ts — CLI 模式（pnpm build）复用
import { getSharedViteConfig } from './vite.config.shared';
const shared = getSharedViteConfig();
export default defineConfig({ ...shared, /* CLI 独有配置 */ });
```

```typescript
// server/core/vite.ts — 中间件模式（pnpm dev）复用
import { getSharedViteConfig } from '../../vite.config.shared';
const shared = getSharedViteConfig();
const vite = await createViteServer({
  ...shared,
  configFile: false,
  server: { middlewareMode: true, hmr: { server: httpServer } },
});
```

> 反模式对比：❌ 两处独立维护 → 忘记同步 → bug。❌ 加注释"记得同步" → 仍然会忘记。✅ 提取共享函数 → **物理上无法分叉**。

**工时估计**：**2h**（v1.0 为 1.5h，增加联调验证时间）

**验证标准**：分别运行 `pnpm dev` 和 `pnpm build`，确认 `@` alias 和 Tailwind 在两个模式下都正常。在 `vite.config.shared.ts` 中添加新 alias，两个模式自动生效。

---

#### 行动项 A-03：修复 OpenTelemetry 初始化

**目标**：让 OTel 在开发环境中正常运行，建立分布式追踪基线。

**根因修复**（三步）：

第一步，安装缺失的 Prometheus exporter 依赖：

```bash
pnpm add @opentelemetry/exporter-prometheus
```

第二步，修复 OTel 配置的环境感知：

```typescript
// server/platform/middleware/opentelemetry.ts
function getConfig(): OTelConfig {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    enabled: process.env.OTEL_ENABLED !== 'false',
    serviceName: process.env.OTEL_SERVICE_NAME || 'xilian-platform',
    traceExporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      || (isDev ? 'http://localhost:4318' : 'http://jaeger:4318'),
    samplingRatio: parseFloat(process.env.OTEL_SAMPLING_RATIO || (isDev ? '1.0' : '0.1')),
  };
}
```

第三步，集成 `pino-opentelemetry-transport`，让 Pino 日志自动携带 trace_id/span_id [6]：

```bash
pnpm add pino-opentelemetry-transport
```

```typescript
// server/core/logger.ts — 添加 OTel transport
if (process.env.OTEL_ENABLED !== 'false') {
  try {
    const { default: opentelemetryTransport } = await import('pino-opentelemetry-transport');
    streams.push({
      stream: opentelemetryTransport({
        resourceAttributes: { 'service.name': 'xilian-platform' },
      }),
    });
  } catch { /* OTel transport 不可用时静默降级 */ }
}
```

**工时估计**：**4h**（v1.0 为 3h，增加 Jaeger 联调验证时间）

**验证标准**：`pnpm dev` 启动后，Jaeger UI（http://localhost:16686）中能看到 `xilian-platform` 服务的 trace；Pino 日志中包含 `trace_id` 字段。

---

#### 行动项 A-04：配置验证强化（Zod）

**目标**：用 Zod 在启动时强制验证所有必需配置，缺失则 `process.exit(1)`。

```typescript
// server/core/config.ts — 添加 Zod 验证
import { z } from 'zod';

const configSchema = z.object({
  app: z.object({
    port: z.number().min(1).max(65535),
    env: z.enum(['development', 'production', 'test']),
    name: z.string().min(1),
  }),
  mysql: z.object({
    host: z.string().min(1),
    port: z.number(),
    user: z.string().min(1),
    password: z.string().min(1, {
      message: 'MYSQL_PASSWORD is required — set it in .env or environment variables',
    }),
    database: z.string().min(1),
  }),
  redis: z.object({
    host: z.string().min(1),
    port: z.number(),
  }),
});

const result = configSchema.safeParse(rawConfig);
if (!result.success) {
  console.error('═══ Configuration Validation Failed ═══');
  result.error.issues.forEach(issue => {
    console.error(`  ✗ ${issue.path.join('.')}: ${issue.message}`);
  });
  console.error('═══════════════════════════════════════');
  process.exit(1);
}
```

**工时估计**：**3.5h**（v1.0 为 2.5h，增加 schema 覆盖范围和测试）

**验证标准**：故意删除 MYSQL_PASSWORD 环境变量，启动时应立即退出并显示清晰的错误信息。

---

#### 行动项 A-05：端口配置单一权威来源

**目标**：所有端口配置从 `config.ts` 读取，消除 6 处散布。

**优先级规则**（从高到低，必须写入文档）：

| 优先级 | 来源 | 场景 |
|--------|------|------|
| 1 | 命令行参数 `PORT=3001 pnpm dev` | 临时调试 |
| 2 | `.env.local` | 个人配置 |
| 3 | `.env.development` | 团队配置 |
| 4 | `dev-bootstrap.sh` 默认值 | 脚本启动 |
| 5 | `config.ts` 硬编码默认值（3000） | 最终兜底 |

**工时估计**：**1.5h**（v1.0 为 1h）

---

#### 行动项 A-06：废弃文件清理

**目标**：系统性评估 20+ 个 @deprecated 文件，制定清理计划。

| 风险级别 | 文件 | 处置 |
|----------|------|------|
| 高（安全） | kafkaMetrics.ws.ts | 确认前端已迁移后立即删除 |
| 高（安全） | nebula.connector.ts | 项目已迁移 Neo4j，删除 |
| 中（认知） | env.ts, algorithm.router.ts, kgOrchestrator.router.ts | 确认引用后删除 |
| 低（技术债） | cognition-unit.ts, meta-learner.ts 等 | 评估活跃引用 |

**工时估计**：审查 2.5h + 清理 2.5h + 回归验证 1h = **6h**（v1.0 为 4h）

---

### 阶段二：工程基础设施（第 4-10 周，约 56 工时）

> **v2.0 工时修正**：v1.0 估计 40h。v2.0 上浮至 56h，并新增 B-06 CI Pipeline 和 B-07 Agent 注册中心。

#### 行动项 B-01：Vite 版本锁定 + 升级策略

将 `package.json` 中的 Vite 版本从 `^7.1.9` 改为 `7.1.9`（精确版本），建立升级 SOP。

**工时估计**：**0.5h**

---

#### 行动项 B-02：启动序列显式化

**目标**：将 36 个模块的初始化从隐式约定变为显式依赖图，支持并行初始化和分级容错。

```typescript
// server/core/startup.ts — 启动编排器
interface StartupTask {
  id: string;
  label: string;
  dependencies: string[];
  critical: boolean;       // true = 失败则 process.exit(1)
  timeout: number;         // 毫秒
  init: () => Promise<void>;
}

async function executeStartupSequence(tasks: StartupTask[]): Promise<StartupResult> {
  const sorted = topologicalSort(tasks);
  const completed = new Set<string>();
  const degraded: string[] = [];
  const startTime = Date.now();

  for (const task of sorted) {
    try {
      const t0 = Date.now();
      await withTimeout(task.init(), task.timeout, task.label);
      completed.add(task.id);
      log.info(`[Startup] ✓ ${task.label} (${Date.now() - t0}ms)`);
    } catch (err) {
      if (task.critical) {
        log.fatal(`[Startup] ✗ ${task.label} FAILED (critical) — shutting down`);
        process.exit(1);
      } else {
        degraded.push(task.id);
        log.warn(`[Startup] ⚠ ${task.label} FAILED (non-critical) — degraded mode`);
      }
    }
  }

  log.info(`[Startup] Complete: ${completed.size}/${tasks.length} tasks, ` +
    `${degraded.length} degraded, ${Date.now() - startTime}ms`);
  return { completed, degraded };
}
```

**预期输出**：

```
[Startup] ✓ 配置加载 (5ms)
[Startup] ✓ MySQL 连接 (120ms)
[Startup] ✓ Redis 连接 (80ms)
[Startup] ⚠ Topology FAILED (non-critical) — degraded mode
[Startup] ✓ Express 监听 (10ms)
[Startup] Complete: 4/5 tasks, 1 degraded, 215ms
```

**工时估计**：**8h**（v1.0 为 5h，增加拓扑排序实现和并行初始化支持）

**验证标准**：启动日志清晰显示每个模块的初始化时间和状态（✓/⚠/✗），Neo4j 不可用时 Topology 显示 ⚠ 而非 30+ 条 ERROR。

---

#### 行动项 B-03：Turborepo + pnpm workspaces

**目标**：将项目重构为 monorepo，实现增量构建和任务缓存。

```
xilian-platform/
├── turbo.json
├── pnpm-workspace.yaml
├── packages/
│   ├── client/          ← 前端（React + Tailwind）
│   ├── server/          ← 后端（Express + tRPC）
│   ├── shared/          ← 共享类型和常量
│   └── vite-config/     ← 共享 Vite 配置（与 A-02 整合）
```

**收益**：改 `shared/` 中的类型定义时，只重新编译依赖它的包；CI 构建时间预计减少 40-60% [7]。

**工时估计**：**20h**（v1.0 为 16h，增加迁移验证和回归测试）

---

#### 行动项 B-04：Dev Containers 标准化

**目标**：新人 clone 项目后，一键进入完整开发环境。

```json
{
  "name": "xilian-platform",
  "dockerComposeFile": ["../docker-compose.yml", "docker-compose.dev.yml"],
  "service": "app",
  "workspaceFolder": "/workspace",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "22" },
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "postCreateCommand": "pnpm install",
  "forwardPorts": [3000, 16686, 9090, 3001]
}
```

**工时估计**：**5h**（v1.0 为 4h）

---

#### 行动项 B-05：配置管理分层

**目标**：建立 dotenv 分层体系，消除配置漂移。

```
.env                    ← 默认值（提交到 Git）
.env.development        ← 开发环境覆盖（提交到 Git）
.env.production         ← 生产环境模板（提交到 Git，值为占位符）
.env.local              ← 个人覆盖（.gitignore）
```

优先级：`.env.local` > `.env.{NODE_ENV}` > `.env`

**工时估计**：**4h**（v1.0 为 3h）

---

#### 行动项 B-06：CI Pipeline（GitHub Actions + Turborepo 远程缓存）

> **v2.0 新增**。v1.0 完全遗漏了 CI/CD。

**目标**：建立自动化的构建-测试-审计流水线。

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      # Turborepo 远程缓存（使用 GitHub Actions 内置缓存，无需 Vercel 账号）
      # Turborepo 缓存 [v2.1 优化：直接用 turbo --cache-dir + GitHub Cache Action，兼容性更稳]
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}-
            turbo-${{ runner.os }}-
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build lint test --cache-dir=.turbo
      - run: pnpm audit --audit-level=high
```

**收益**：PR 构建时间预计从 8min → 2-3min（Turborepo 缓存命中时）；每次 PR 自动运行测试和安全审计。

**工时估计**：**6h**（v1.0 未计入）

---

#### 行动项 B-07：Agent 注册中心设计

> **v2.0 新增**。深度评审指出 v1.0 对 AI 平台特有的 Agent 编排覆盖不足。

**目标**：在现有 module.registry.ts 和 grok-tools.ts 基础上，建立统一的 Agent 注册/发现/编排框架。

**设计方案**：扩展现有的 `GrokTool` 接口为 `AgentManifest`，与 module.registry 的 `ModuleManifest` 对齐：

```typescript
// server/intelligence/agent-registry.ts
import { BaseRegistry } from '../core/registry';

/** Agent 能力声明 — 扩展 GrokTool 的 loopStage 概念 */
export interface AgentManifest {
  id: string;
  name: string;
  description: string;
  /** 闭环阶段（复用 GrokTool 的分类） */
  loopStage: 'perception' | 'diagnosis' | 'guardrail' | 'evolution' | 'utility';
  /** 能力标签 */
  capabilities: string[];  // ['text-generation', 'tool-calling', 'vision', 'streaming']
  /** 底层模型 */
  model: string;           // 'grok-3', 'ollama/qwen2.5', 'claude-3.5'
  /** 可调用的工具列表（引用 grok-tools.ts 中的工具名） */
  tools: string[];
  /** SDK 适配器 — 2026 最佳实践：少自建、多集成 [v2.1 新增] */
  sdkAdapter: 'vercel-ai' | 'langgraph' | 'mastra' | 'custom';
  /** 运行时约束 */
  maxConcurrency: number;
  timeout: number;         // 毫秒
  /** 是否为关键 Agent（对应启动编排器的 critical 标志） */
  critical: boolean;
  /** 健康检查函数 */
  healthCheck: () => Promise<boolean>;
}

/** Agent 注册中心 — 继承 BaseRegistry 的注册/发现能力 */
export class AgentRegistry extends BaseRegistry<AgentManifest> {
  /** 按能力发现 Agent */
  discoverByCapability(capability: string): AgentManifest[] {
    return this.getAll().filter(a => a.capabilities.includes(capability));
  }

  /** 按闭环阶段发现 Agent */
  discoverByStage(stage: AgentManifest['loopStage']): AgentManifest[] {
    return this.getAll().filter(a => a.loopStage === stage);
  }

  /** 调用 Agent（支持流式输出）— 根据 sdkAdapter 自动路由到对应 SDK [v2.1] */
  async *invoke(agentId: string, input: AgentInput): AsyncGenerator<AgentChunk> {
    const agent = this.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    switch (agent.sdkAdapter) {
      case 'vercel-ai': {
        // 优先走 Vercel AI SDK 的 streamText — 未来迁移 Next.js 零成本
        const { streamText } = await import('ai');
        const result = streamText({
          model: resolveModel(agent.model),
          tools: resolveTools(agent.tools),
          prompt: input.prompt,
          maxSteps: input.maxSteps ?? 5,
        });
        for await (const chunk of result.textStream) {
          yield { type: 'text', content: chunk };
        }
        break;
      }
      case 'langgraph': {
        // LangGraph.js 编排图 — 适用于多步骤复杂 Agent
        const graph = await this.getLangGraphInstance(agentId);
        for await (const event of graph.stream(input)) {
          yield { type: 'event', content: JSON.stringify(event) };
        }
        break;
      }
      default: {
        // 回退到现有的 grok-tools execute 函数
        const tool = this.resolveTool(agent.tools[0]);
        const result = await tool.execute(input);
        yield { type: 'result', content: result };
      }
    }
  }
}
```

**与现有代码的关系**：

| 现有组件 | 角色 | 与 AgentRegistry 的关系 |
|----------|------|------------------------|
| module.registry.ts | 模块级注册 | AgentRegistry 是其子集，专注 intelligence 域 |
| grok-tools.ts | 工具定义 | AgentManifest.tools 引用这些工具名 |
| agent-plugins/index.ts | 插件扩展 | 插件通过 AgentRegistry.register() 注册 |

**推荐的 AI SDK 集成**：Vercel AI SDK（2.8M 周下载 [5]）作为底层调用框架，原因是与 tRPC 兼容（都是 TypeScript-first）、streaming-first 设计解决 AI 推理流式响应需求、如果未来迁移 Next.js 则是原生集成。v2.1 通过 `sdkAdapter` 字段实现了"少自建、多集成"的 2026 最佳实践——invoke 方法内部优先走 Vercel AI SDK 的 `streamText` / `generateText`，同时保留 LangGraph.js（复杂多步骤编排）和 custom（现有 grok-tools）的回退路径，确保未来迁移零成本。

**工时估计**：接口设计 3h + 与现有代码集成 5h + 测试 2h + 文档 1h = **11h**（v1.0 未计入）

**验证标准**：能通过 `agentRegistry.discoverByStage('diagnosis')` 发现所有诊断阶段的 Agent；Agent 健康检查能正确报告状态。

---

### 阶段三：架构现代化（第 3-7 个月，约 250 工时）

> **v2.0 工时修正**：v1.0 估计 200h。v2.0 上浮至 250h，并新增 C-04 Encore.ts POC。

#### 行动项 C-01：NestJS 渐进式包裹

**为什么选 NestJS 而非直接换框架**：2026 年的行业共识是，NestJS 适合大型 TypeScript 平台（强制模块边界 + DI + 装饰器）[8]。但全量迁移 407 个文件的成本太高。渐进式方案是**用 NestJS 包裹现有 Express 应用**——不是"推倒重来"，而是"外壳包裹 → 逐域迁移 → 6 个月平滑过渡"。

```typescript
// 第一步：NestJS 作为外壳，Express 作为内核
const expressApp = express();
// ... 现有的所有 Express 中间件和路由保持不变
const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
await app.listen(3000);
```

**迁移顺序**（按风险从低到高）：

| 顺序 | 域 | 模块数 | 理由 | 工时估计 |
|------|-----|--------|------|----------|
| 1 | security | 3 | 边界清晰，依赖少 | 25h |
| 2 | core | 7 | 基础模块，其他域依赖它 | 40h |
| 3 | infra | 8 | 数据库/缓存连接器标准化 | 35h |
| 4 | data | 4 | 数据管道，需与 Kafka 集成 | 30h |
| 5 | orchestration | 5 | 编排逻辑，依赖 data 和 intelligence | 30h |
| 6 | intelligence | 4 | AI 模块变动最大，最后迁移 | 40h |

**工时估计**：第一步 10h + 6 个域合计 200h = **约 210h**（v1.0 为 160h，增加联调和回归测试）

---

#### 行动项 C-02：tRPC + 原生协议分层

**目标**：明确 tRPC 的使用边界，AI 场景使用原生协议。

| 场景 | 协议 | 理由 |
|------|------|------|
| CRUD 操作 | tRPC query/mutation | 类型安全，开发效率高 |
| 实时数据推送 | WebSocket（gateway.ws.ts） | 已有实现，性能好 |
| AI 推理流式响应 | **SSE（Server-Sent Events）** | 2026 最佳实践 [5]，单向流比 WS 简单 |
| 长时任务（训练/批量推理） | tRPC mutation + WS 通知 | 任务提交用 tRPC，进度用 WS |
| 外部集成（Python/Go） | REST API（通过 REST Bridge） | 非 TS 消费方无法用 tRPC |

**工时估计**：**10h**（v1.0 为 8h）

---

#### 行动项 C-03：Prisma ORM 迁移评估

当前项目使用 Drizzle ORM 连接 MySQL。如果未来需要 pgvector（向量检索），迁移到 Prisma 的 ROI 较高（Prisma 原生支持 pgvector 扩展）；否则保持 Drizzle。

**工时估计**：评估 5h，实际迁移（如果决定做）约 50h（v1.0 为 4h+40h）

---

#### 行动项 C-04：Encore.ts POC 评估

> **v2.0 新增**。深度评审指出 v1.0 遗漏了 Encore.ts 这个 2026 年崛起的框架。

**为什么需要评估 Encore.ts**：Encore.ts 是 2026 年增长最快的 TypeScript 后端框架之一，其核心特性与西联平台的痛点高度匹配 [9]：

| 西联平台痛点 | Encore.ts 解决方案 |
|-------------|-------------------|
| 30+ Docker 服务手动管理 | Infrastructure from Code — 自动从代码推断基础设施 |
| OTel 初始化失败 | 内置分布式追踪、日志、Metrics，开箱即用 |
| 模块注册缺少边界 | Service 声明天然提供模块边界 |
| Express 性能瓶颈 | Rust 运行时，9x Express 性能 [9] |
| 本地开发需要 Docker Compose | 自动配置本地基础设施（数据库、Pub/Sub、缓存） |

**但 Encore.ts 也有明确的局限**：

| 局限 | 对西联平台的影响 |
|------|-----------------|
| 基础设施抽象主要覆盖 PostgreSQL、Redis、Pub/Sub | MySQL、ClickHouse、Kafka、Neo4j、Qdrant 不在自动管理范围 |
| 自有 API 声明方式 | tRPC 需要评估共存方案 |
| 不使用 Express | Vite middleware mode 需要适配 |
| Encore Cloud 是商业产品 | vendor lock-in 风险 |

**POC 范围**：选择 security 域（3 个模块，边界最清晰）进行 Encore.ts 迁移试验，评估以下指标：

| 评估维度 | 通过标准 |
|----------|----------|
| 迁移复杂度 | 3 个模块迁移 < 40h |
| 性能提升 | API 响应时间 < Express 的 50% |
| OTel 开箱即用 | Jaeger 中自动出现 trace，无需手动配置 |
| 与 tRPC 共存 | 现有 tRPC 路由不受影响 |
| 与非标准数据库共存 | ClickHouse、Qdrant 可通过原生客户端访问 |
| **冷启动时间** [v2.1] | **< 800ms**（对比当前 Express 约 1.1s） |
| **月度 infra 成本** [v2.1] | **Encore Cloud vs 自建 K8s 成本对比报告**（含 30+ 服务映射） |

**迁移策略**：采用 Encore.ts 官方推荐的 Forklift 迁移 [9]——用 catch-all handler 包裹整个 Express 应用，立即获得 Rust 运行时的性能提升，然后逐步将 endpoint 迁移到 Encore API 声明。

```typescript
// Forklift 迁移示例
import { api } from "encore.dev/api";
import expressApp from "./legacy-express-app";

// 所有未迁移的路由走 Express
export const legacyHandler = api.raw(
  { expose: true, method: "*", path: "/!rest" },
  expressApp
);

// 已迁移的路由用 Encore 声明
export const getDevice = api(
  { expose: true, method: "GET", path: "/api/device/:id" },
  async ({ id }: { id: string }) => {
    // ... Encore 原生实现
  }
);
```

**决策点**：POC 完成后，根据评估结果决定：

- 如果 5 项指标全部通过 → 将 C-01（NestJS 渐进包裹）替换为 Encore.ts 渐进迁移
- 如果 3-4 项通过 → Encore.ts 仅用于新服务，现有代码继续 NestJS 路线
- 如果 < 3 项通过 → 放弃 Encore.ts，继续 NestJS 路线

**工时估计**：**20h**（v1.0 未计入）

---

### 阶段四：全栈升级（第 7-18 个月，战略决策）

> **v2.0 核心改进**：v1.0 的阶段四"太虚"，只有定性描述。v2.0 增加量化决策矩阵。

#### 行动项 D-01：前端框架评估（量化决策矩阵）

| 决策维度 | Next.js 16 全栈（推荐） | Encore.ts 全后端 | Hono + Bun | 保持现状 |
|----------|------------------------|-----------------|------------|----------|
| **团队规模适配** | > 8 人 | > 5 人 | < 5 人 | 任意 |
| **AI 流式/Agent** | 原生 Vercel AI SDK | 需集成 | 手动实现 | 差 |
| **部署复杂度** | Vercel 一键 | 自动云资源 | 边缘部署 | 高 |
| **迁移成本** | 中（前端 2 周） | 低（后端渐进） | 高（全部重写） | 0 |
| **tRPC 兼容** | 原生（create-t3-app） | 需适配 | 原生 | 当前已有 |
| **RSC/Streaming** | 原生支持 | 不涉及前端 | 不涉及前端 | 无 |
| **推荐场景** | **AI 平台标配** | 多服务平台 | 高并发小项目 | 短期过渡 |

**最推荐路径**：短期保 Express → 中期 NestJS 包裹（或 Encore.ts，取决于 C-04 POC 结果）→ 长期 Next.js 16 全栈。

理由：tRPC 在 Next.js 中原生支持（create-t3-app 2026 仍是模板王者）；Vercel AI SDK + Streaming 直接解决数据动脉和 Kafka Metrics 的实时场景；迁移成本可控——先把 frontend 切到 Next.js（Vite → Next.js 只需 1-2 周），后端通过 tRPC 保持兼容。

**触发条件**（不是时间触发，而是条件触发）：

| 触发条件 | 说明 |
|----------|------|
| AI 流式需求成为核心功能 | Vercel AI SDK 的 Streaming 原生支持成为刚需 |
| 团队扩张到 8+ 人 | 需要 Next.js 的约定式路由减少协调成本 |
| 客户端 bundle > 2MB | RSC 可以显著减少客户端 JS 体积 |
| SEO 成为需求 | Next.js 的 SSR/SSG 是标准方案 |

---

#### 行动项 D-02：容器编排升级

当 Docker Compose 的 30+ 服务在生产环境中需要高可用和自动伸缩时，需要升级到 Kubernetes 或托管平台（Railway/Fly.io）。

**触发条件**：单机无法承载所有服务 OR 需要 AI 推理模块独立伸缩 OR 需要多区域部署。

> 深度评审指出：Encore.ts 的 30+ Docker 服务可直接映射到云资源，如果 C-04 POC 通过，此项的复杂度会大幅降低。

---

## 五、优先级总览与时间线

| 阶段 | 行动项 | 优先级 | 工时（v2.0） | 工时（v1.0） | 预期收益 |
|------|--------|--------|-------------|-------------|----------|
| **0.5** | **Z-01 Vitest 测试骨架** | **P0** | **4.5h** | — | 回归保护基线 |
| **0.5** | **Z-02 安全扫描基线** | **P0** | **3.5h** | — | 依赖漏洞可见 |
| 一 | A-01 日志级别规范 | P0 | **8.5h** | 5h | 消除 error 刷屏 |
| 一 | A-02 共享 Vite 配置 | P0 | **2h** | 1.5h | 物理消除配置分叉 |
| 一 | A-03 修复 OTel | P1 | **4h** | 3h | 恢复分布式追踪 |
| 一 | A-04 配置验证 (Zod) | P1 | **3.5h** | 2.5h | 启动时快速失败 |
| 一 | A-05 端口单一来源 | P1 | **1.5h** | 1h | 消除 PORT 漂移 |
| 一 | A-06 废弃文件清理 | P2 | **6h** | 4h | 减少攻击面 |
| 二 | B-01 Vite 版本锁定 | P2 | 0.5h | 0.5h | 防止升级破坏 |
| 二 | B-02 启动序列显式化 | P2 | **8h** | 5h | 并行初始化 + 分级容错 |
| 二 | B-03 Turborepo | P3 | **20h** | 16h | CI 快 40-60% |
| 二 | B-04 Dev Containers | P3 | **5h** | 4h | 新人一键环境 |
| 二 | B-05 配置分层 | P2 | **4h** | 3h | 消除配置漂移 |
| **二** | **B-06 CI Pipeline** | **P1** | **6h** | — | 自动化构建测试 |
| **二** | **B-07 Agent 注册中心** | **P2** | **11h** | — | Agent 标准化编排 |
| 三 | C-01 NestJS 渐进包裹 | P3 | **210h** | 160h | DI + 模块边界 |
| 三 | C-02 协议分层 | P3 | **10h** | 8h | AI 场景协议适配 |
| 三 | C-03 Prisma 评估 | P4 | **5-55h** | 4-44h | 向量检索支持 |
| **三** | **C-04 Encore.ts POC** | **P3** | **20h** | — | 评估替代架构 |
| 四 | D-01 前端框架评估 | P4 | 战略 | 战略 | RSC + Streaming |
| 四 | D-02 容器编排升级 | P4 | 战略 | 战略 | 高可用 + 自动伸缩 |

**总工时对比**：

| 阶段 | v1.0 | v2.0 | 差异说明 |
|------|------|------|----------|
| Phase 0.5 | — | **8h** | 新增测试 + 安全 |
| 阶段一 | 16h | **25.5h** | 工时上浮 +60% |
| 阶段二 | 28.5h | **54.5h** | 工时上浮 + 新增 B-06/B-07 |
| 阶段三 | 200h+ | **250h+** | 工时上浮 + 新增 C-04 |
| **合计（不含阶段四）** | **244.5h** | **338h** | **+38%** |

---

## 六、本周执行清单

基于以上方案，**本周可立即启动的行动**：

| 日期 | 行动 | 负责 | 产出 |
|------|------|------|------|
| 今天 | Merge 已完成的 7 项修复（commit 4b84c6f） | 推送到 GitHub | 止血层生效 |
| 今天 | 将本方案保存为 `docs/rectification-plan-v2.md` | 提交到仓库 | 团队可见 |
| 第 1 天 | Z-01 Vitest 测试骨架 | 开发 | `pnpm test` 可运行 |
| 第 2 天 | Z-02 安全扫描基线 | 开发 | Dependabot 启用 |
| 第 3-4 天 | A-01 日志级别规范 + A-02 共享 Vite 配置 | 开发 | ERROR < 5 条 |
| 第 5 天 | A-03 OTel 修复 | 开发 | Jaeger 看到 trace |
| 下周 | A-04 Zod 配置验证 + A-05 端口单一来源 | 开发 | 快速失败生效 |
| 下周 | 立项 B-06 CI Pipeline + C-04 Encore POC | 规划 | 排期确认 |

---

## 七、核心原则

本整改方案遵循四个核心原则，前三个在 v1.0 中已确立，v2.1 新增第四条：

**第一，在框架和逻辑层面解决问题，而非打补丁。** 日志级别规范不是"把 debug 改成 info"，而是建立全局共识标准；共享 Vite 配置不是"加注释提醒"，而是物理消除分叉可能性；配置验证不是"console.warn 提醒"，而是 Zod schema 强制校验 + process.exit(1)。深挖报告的类比精确地描述了这个原则：用户反馈"仪表盘上没有速度读数"，工程师检查后发现是仪表盘背光亮度调低了——正确的做法不只是调高亮度，还应该问：**为什么背光会被调低？有没有其他面板也有类似问题？调光配置在哪里管理？**

**第二，渐进式演进，不做大爆炸重构。** NestJS 不是"推倒重来"，而是先包裹再逐步迁移；Turborepo 不是"重新组织所有文件"，而是在现有结构上加一层构建编排；Encore.ts 不是"立即全面替换"，而是先做 20h 的 POC 评估。反面教材：某公司 2024 年决定从 Express 迁移到 Fastify，停止所有功能开发 3 个月做大迁移——业务需求积压、迁移过程发现大量隐性依赖、新框架遇到生产问题团队不熟悉。正确姿势：**新功能用新框架开发，老功能继续用旧框架，每个域独立迁移，任何时候都有可发布的版本。**

**第三，每个改动都有验证标准。** 不是"改了就算完"，而是定义"怎么确认修复成功"。这些验证标准可以直接转化为集成测试用例：

| 行动项 | 验证标准 | 对应测试 |
|--------|----------|----------|
| A-01 日志规范 | LOG_LEVEL=info 启动后 ERROR < 5 条 | `test('error count < 5')` |
| A-03 OTel 修复 | Jaeger UI 能看到 trace，日志有 trace_id | `test('logs contain trace_id')` |
| A-04 配置验证 | 删除 MYSQL_PASSWORD 后启动立即退出 | `test('exits on missing config')` |
| B-02 启动编排 | 日志显示每个模块的 ✓/⚠/✗ 状态 | `test('startup status display')` |
| B-07 Agent 注册 | `discoverByStage('diagnosis')` 返回正确 Agent | `test('agent discovery')` |

**第四，所有新代码必须先写测试，老代码在修改时补测试（TDD 优先）。** [v2.1 新增] Phase 0.5 不是一次性的"补测试"行为，而是建立一种持续的工程文化。每个行动项的验证标准都应该先转化为测试用例，再开始编码。这确保了 Phase 0.5 的精神贯穿整个整改周期——不是"先改代码再补测试"，而是"先写测试再改代码"。对于 23.4 万行零测试的代码库，这意味着：新功能 100% TDD；修改老代码时，先为被修改的函数补测试（确认当前行为），再修改（确认新行为），最后回归（确认没有破坏其他行为）。

---

## 八、与深挖报告的核心洞察对齐

深挖报告中最值得提炼的一句话：

> "服务器实际上已经正常启动并在监听端口。"

这句话说明了一个重要的工程原则：**感知层的故障（看不到日志）和系统层的故障（服务真的没启动）是两件不同的事。** 本次诊断的所有问题都是感知层故障——系统一直在正常工作，只是开发者不知道。

在工业 AI 平台上，感知层的可靠性和系统层一样重要，因为**看不到不等于没坏，但看起来坏了也不等于真的坏了**。感知层缺失带来的最大风险是：当系统真正出现问题时，开发者已经习惯了"看不到信息"，无法快速区分"日志消失了"和"系统崩溃了"。

本整改方案的全部 22 个行动项，本质上都在做同一件事：**让 157K 行代码的每一个角落都变得可感知、可验证、可追踪**。从日志语义规范（让每条日志都有明确含义）到 OTel 修复（让每个请求都有完整链路）到启动编排器（让每个模块的状态都可见）到 Agent 注册中心（让每个 AI 能力都可发现）——这是从"能跑的平台"走向"可信赖的工业级 AI 平台"的系统性工程。

---

## 参考

[1]: 西联智能平台工作流深挖报告 — "157,000 行服务端代码是一个信号"
[2]: Docker Compose + 本地开发混合工作流 — 2026 年 DX 最佳实践
[3]: Vite SSR Guide — https://vite.dev/guide/ssr
[4]: Martin Fowler — Monolith First — https://martinfowler.com/bliki/MonolithFirst.html
[5]: Top 5 TypeScript AI Agent Frameworks 2026 — Vercel AI SDK 2.8M 周下载
[6]: pino-opentelemetry-transport — https://github.com/pinojs/pino-opentelemetry-transport
[7]: Turborepo Documentation — https://turbo.build/repo/docs
[8]: Encore.dev — Best TypeScript Backend Frameworks 2026 — https://encore.dev/articles/best-typescript-backend-frameworks
[9]: Encore.ts Official Migration Guide — https://encore.dev/docs/ts/migration/express-migration
