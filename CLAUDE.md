# CLAUDE.md

> 本文件为 AI 助手提供项目上下文，帮助理解代码库结构、技术栈和业务背景。

---

## 1. 业务上下文

### 1.1 业务背景

**复杂工业场景下港机设备智能运维平台**

本平台面向港口机械设备的智能化运维管理，处理大规模工业设备的实时监控、故障诊断、预测性维护等核心业务场景。

### 1.2 核心数据规模

- **设备规模**: 1000 台港机设备
- **数据规模**: PB 级历史数据
- **远程能力**: VPN 远程诊断

### 1.3 数据来源

- 世界主要港机制造商原始数据（正式合作供应商）
- 世界前十码头 5 家信息化供应商

### 1.4 核心能力

| 能力 | 说明 |
|------|------|
| **数据奇点挖掘** | 从海量数据中发现异常模式和关键特征 |
| **预测性维护** | 基于设备状态数据预测故障，提前安排维护 |
| **跨设备横向对比** | 相同型号设备间的性能对比和异常检测 |
| **自进化诊断** | 诊断模型持续学习优化，提升准确率 |

### 1.5 开发原则

1. **物理约束优先于数据驱动结论** - 任何数据分析结论必须符合物理规律
2. **每个功能必须有验证闭环** - 功能上线前必须有完整的验证机制
3. **优先复用现有模块** - 减少重复开发，保持系统一致性

---

## 2. 代码库模块结构

### 2.1 顶层目录结构

```
xilian-platform-app/
├── client/                 # 前端代码 (React 19 + TypeScript)
├── server/                 # 后端代码 (Node.js + Express + tRPC)
├── shared/                 # 前后端共享类型和常量
├── drizzle/                # 数据库 Schema (Drizzle ORM)
├── docker/                 # Docker 配置
├── deploy/                 # 部署配置
├── k8s/                    # Kubernetes 配置
├── helm/                   # Helm Chart
├── terraform/              # IaC 基础设施配置
├── monitoring/             # 监控配置
├── scripts/                # 构建和部署脚本
├── tests/                  # 测试用例
└── docs/                   # 文档
```

### 2.2 前端模块 (client/)

```
client/src/
├── _core/                  # 核心框架 (hooks)
├── components/             # UI 组件库
│   ├── ui/                 # 基础 UI (shadcn/ui)
│   ├── charts/             # 图表组件
│   ├── cognitive/          # 认知引擎 UI
│   ├── evolution/          # 进化引擎 UI
│   ├── kg-orchestrator/    # 知识图谱编排 UI
│   ├── pipeline/           # 管线编排 UI
│   └── designer/           # 设计工具 UI
├── pages/                  # 路由页面 (31 个模块)
│   ├── algorithm/          # 算法库
│   ├── cognition-reasoning/# 认知推理引擎
│   ├── database/           # 数据库管理
│   ├── device/             # 设备管理
│   ├── diagnosis/          # 诊断管理
│   ├── digital-twin/       # 数字孪生
│   ├── evolution/          # 进化引擎
│   ├── guardrail/          # 护栏规则
│   ├── monitoring/         # 监控大屏
│   ├── perception/         # 感知域
│   └── settings/           # 平台设置
├── hooks/                  # 自定义 React Hooks
├── services/               # API 调用服务
├── stores/                 # 状态管理 (Zustand)
├── types/                  # TypeScript 类型定义
└── contexts/               # React Context
```

### 2.3 后端模块 (server/)

```
server/
├── core/                   # 核心框架
│   ├── index.ts            # 服务器启动入口
│   ├── config.ts           # 统一配置中心
│   ├── trpc.ts             # tRPC 路由定义
│   ├── context.ts          # 请求上下文
│   ├── logger.ts           # 日志系统
│   ├── llm.ts              # LLM 集成
│   └── startup.ts          # 启动编排器
│
├── platform/               # 平台基础设施
│   ├── middleware/         # 中间件 (安全、限流、监控、追踪)
│   ├── services/           # 平台服务 (配置、事件总线)
│   ├── connectors/         # 协议连接器
│   ├── knowledge/          # 知识库模块
│   ├── evolution/          # 进化引擎
│   ├── perception/         # 感知处理
│   ├── cognition/          # 认知推理
│   ├── digital-twin/       # 数字孪生
│   ├── orchestrator/       # 编排器
│   └── pipeline/           # 管线处理
│
├── domains/                # 8 域微服务路由
│   ├── perception/         # 感知域
│   ├── cognition/          # 认知域
│   ├── guardrail/          # 护栏域
│   ├── evolution/          # 进化域
│   ├── knowledge/          # 知识域
│   ├── tooling/            # 工具域
│   ├── pipeline/           # 管线域
│   └── platform/           # 平台域
│
├── api/                    # API 路由层 (33 个路由)
│   ├── database.router.ts  # 数据库管理
│   ├── algorithm.router.ts # 算法引擎
│   ├── pipeline.router.ts  # 数据管道
│   ├── kgOrchestrator.router.ts  # 知识图谱编排
│   ├── grokDiagnostic.router.ts  # AI 诊断
│   └── ...
│
├── services/               # 业务服务层 (~50 个服务)
│   ├── knowledge.service.ts
│   ├── device.service.ts
│   ├── algorithm.service.ts
│   ├── grokDiagnosticAgent.service.ts
│   └── protocol-adapters/  # 14 个协议适配器
│       ├── mqtt.adapter.ts
│       ├── modbus.adapter.ts
│       ├── opcua.adapter.ts
│       └── ...
│
├── algorithms/             # 算法库 (12 个分类)
│   ├── _core/              # 算法基础框架
│   ├── mechanical/         # 机械特征算法
│   ├── electrical/         # 电气特征算法
│   ├── structural/         # 结构特征算法
│   ├── anomaly/            # 异常检测算法
│   └── ...
│
└── lib/                    # 工具库
    ├── clients/            # 外部客户端 (16 个)
    ├── db/                 # 数据库操作
    ├── dataflow/           # 数据流处理
    └── math/               # 数学计算
```

### 2.4 共享模块 (shared/)

```
shared/
├── _core/                  # 共享核心
├── accessLayerTypes.ts     # 接入层类型定义
├── apiSpec.ts              # API 规范
├── pipelineTypes.ts        # 管线类型
├── kgOrchestratorTypes.ts  # 知识图谱类型
├── evolution-modules.ts    # 进化模块定义
└── types.ts                # 通用类型
```

### 2.5 数据库 Schema (drizzle/)

```
drizzle/
├── schema.ts               # MySQL 主 Schema (160 张表)
├── evolution-schema.ts     # 进化层 Schema
├── relations.ts            # 关系定义
└── migrations/             # 迁移脚本
```

---

## 3. 技术栈说明

### 3.1 前端技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **框架** | React | 19.x | UI 框架 |
| **语言** | TypeScript | 5.9.x | 类型安全 |
| **构建** | Vite | 7.x | 快速构建和 HMR |
| **样式** | Tailwind CSS | 4.x | 原子化 CSS |
| **UI 库** | shadcn/ui + Radix UI | - | 无头组件库 |
| **路由** | Wouter | 3.x | 轻量级路由 |
| **API** | tRPC | 11.x | 类型安全 RPC |
| **状态** | Zustand + React Query | 5.x | 状态管理 |
| **图表** | Chart.js + Recharts | - | 数据可视化 |

### 3.2 后端技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | 18+ | JavaScript 运行时 |
| **框架** | Express | 4.x | Web 框架 |
| **RPC** | tRPC | 11.x | 类型安全 API |
| **ORM** | Drizzle ORM | 0.44.x | 数据库操作 |
| **日志** | Pino | - | 高性能日志 |
| **认证** | Jose (JWT) | 6.x | JWT 处理 |
| **安全** | Helmet | 8.x | HTTP 安全头 |

### 3.3 数据库和存储

| 数据库 | 用途 | 说明 |
|--------|------|------|
| **MySQL** | 关系型业务数据 | 160 张表，支持 TiDB |
| **ClickHouse** | 时序数据分析 | MergeTree 引擎，物化视图 |
| **Redis** | 缓存和消息队列 | ioredis 客户端 |
| **Neo4j** | 知识图谱 | 图数据库 |
| **Qdrant** | 向量数据库 | 相似性搜索 |
| **MinIO** | 对象存储 | S3 兼容 |
| **Elasticsearch** | 日志分析 | 全文搜索 |

### 3.4 消息和流处理

| 组件 | 用途 |
|------|------|
| **Kafka** | 事件流处理 |
| **MQTT** | IoT 设备通信 |
| **WebSocket** | 实时双向通信 |

### 3.5 工业协议支持

| 协议 | 适配器文件 | 用途 |
|------|------------|------|
| **MQTT** | mqtt.adapter.ts | 物联网消息 |
| **Modbus** | modbus.adapter.ts | 工业串行通信 |
| **OPC UA** | opcua.adapter.ts | 工业数据交互 |
| **PROFINET** | profinet.adapter.ts | 工业以太网 |

### 3.6 可观测性

| 组件 | 用途 |
|------|------|
| **OpenTelemetry** | 分布式追踪和指标 |
| **Prometheus** | 指标收集 |
| **Jaeger** | 链路追踪 |
| **Grafana** | 仪表盘展示 |
| **ELK Stack** | 日志分析 |

---

## 4. 核心架构

### 4.1 三层架构

```
┌─────────────────────────────────────────┐
│        客户端 (React 前端)              │
│     pages / components / services        │
└─────────────────────────────────────────┘
              ↓ (tRPC)
┌─────────────────────────────────────────┐
│        业务应用层 (Routes)              │
│  monitoring / perception / cognition     │
│    diagnosis / evolution / knowledge     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      平台基础层 (Infrastructure)        │
│  middleware / services / connectors      │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│       数据访问层 (Data Access)          │
│  MySQL / ClickHouse / Redis / Neo4j     │
└─────────────────────────────────────────┘
```

### 4.2 8 域微服务架构

| 域 | 职责 |
|----|------|
| **感知域 (Perception)** | 数据采集、融合、编码、工况管理 |
| **认知域 (Cognition)** | Grok 推理、WorldModel、四维诊断 |
| **护栏域 (Guardrail)** | 安全规则、健康规则引擎 |
| **进化域 (Evolution)** | 影子评估、冠军挑战者、知识结晶 |
| **知识域 (Knowledge)** | 知识图谱、特征注册表、链式推理 |
| **工具域 (Tooling)** | 工具注册、发现、执行、沙箱 |
| **管线域 (Pipeline)** | DAG 引擎、数字孪生、回放、仿真 |
| **平台域 (Platform)** | 编排器、仪表盘、健康检查、配置 |

---

## 5. 常用命令

```bash
# 开发
pnpm dev                  # 启动开发服务器

# 构建
pnpm build               # 生产构建
pnpm start               # 生产启动

# 测试
pnpm test                # 单元测试
pnpm test:e2e            # E2E 测试

# 数据库
pnpm db:push             # 数据库迁移

# 代码质量
pnpm check               # TypeScript 类型检查
pnpm format              # 代码格式化
```

---

## 6. 关键文件索引

| 文件 | 说明 |
|------|------|
| `server/core/config.ts` | 统一配置中心 |
| `server/core/trpc.ts` | tRPC 路由定义 |
| `server/routers.ts` | 所有路由注册 |
| `drizzle/schema.ts` | MySQL 主数据库 Schema |
| `shared/pipelineTypes.ts` | 管线类型定义 |
| `client/src/App.tsx` | 前端主入口 |
| `docker-compose.yml` | 完整服务栈配置 |

---

## 7. 开发注意事项

1. **物理约束检查**: 所有算法输出需验证是否符合设备物理特性
2. **模块复用**: 新功能开发前先检查 `server/services/` 和 `server/algorithms/` 是否有可复用模块
3. **类型安全**: 利用 tRPC 端到端类型安全，避免手动类型定义
4. **验证闭环**: 每个功能需要在 `tests/` 中添加对应测试用例
5. **协议适配**: 新增设备接入优先使用现有 `protocol-adapters/` 适配器

---

## 8. 核心架构决策记录 (ADR)

> 以下决策一经确认不可随意变更，修改需在此记录变更理由和日期。

### ADR-001: 物理约束作为最高优先级护栏

- **决策**: 任何算法输出、数据分析结论、模型推理结果，必须通过物理约束校验后才能进入下游流程
- **理由**: 工业设备诊断中，违反物理规律的结论不仅无用，更可能导致误操作损坏设备
- **约束**: 振动值不为负、温度有上下限、功率因数 [0,1]、轴承温度 >= 环境温度（运行时）
- **实现**: `server/platform/perception/quality/data-quality-scorer.ts` 物理合理性检查, `server/platform/perception/normalization/unit-registry.ts` PHYSICAL_VALID_RANGES

### ADR-002: 8 域微服务内聚、域间通过事件总线解耦

- **决策**: 感知/认知/护栏/进化/知识/工具/管线/平台 8 个域各自内聚，域间不直接 import，通过 EventBus 通信
- **理由**: 降低耦合度，支持未来拆分为独立微服务
- **实现**: `server/domains/` 8 个域路由, `server/platform/services/` 事件总线

### ADR-003: 感知管线三层架构不可跳层

- **决策**: 数据必须按 边缘层(RingBuffer+采样) → 汇聚层(BPA+DS融合) → 平台层(状态向量+事件) 顺序流转
- **理由**: 跳层会丢失质量标记和追溯信息，导致下游诊断不可信
- **实现**: `server/platform/perception/perception-pipeline.ts`

### ADR-004: 4 段式统一编码覆盖全平台

- **决策**: 设备编码(5段)、部件编码(4段)、故障编码(3段)、工况编码(3段) 作为全平台唯一标识体系
- **理由**: 跨系统、跨设备、跨时间的数据关联必须有统一语义锚点
- **实现**: `docs/KNOWLEDGE_ARCHITECTURE.md` §2, `server/platform/knowledge/seed-data/`

### ADR-005: 数据质量评分公式

- **决策**: `综合评分 = 完整度 × 0.4 + 准确度 × 0.6`
- **完整度**: 机械/电气/结构/环境/作业 五类等权 (各 20%)
- **准确度**: 传感器健康(30%) + 连续性(25%) + 一致性(20%) + 物理合理性(25%)
- **理由**: 准确度权重高于完整度，因为错误数据比缺失数据危害更大
- **实现**: `server/platform/perception/quality/data-quality-scorer.ts`

---

## 9. 不可修改的设计原则

> 以下原则是系统的基石，所有新增代码必须遵守。

1. **物理世界优先** — 数据驱动的结论必须通过物理约束校验，不通过则丢弃并告警
2. **验证闭环** — 每个功能模块必须有：输入校验 → 处理 → 输出校验 → 结果可追溯
3. **单例+工厂** — 基础设施服务（引擎、注册表、评分器）统一用单例模式 + `get/reset` 工厂函数
4. **类型即文档** — 所有模块的公开接口必须有完整的 TypeScript 类型定义，类型注释即 API 文档
5. **降级不崩溃** — 外部依赖（Kafka/ClickHouse/Neo4j）不可用时服务降级运行，不阻塞启动
6. **编码即语义** — 所有实体（设备/部件/故障/工况）必须有编码，编码是跨模块关联的唯一桥梁
7. **新增不修改** — 扩展功能优先通过新增文件实现，避免修改已稳定运行的现有文件

---

## 10. 三类评价标准

### 10.1 代码质量标准

| 维度 | 优秀 | 合格 | 不合格 |
|------|------|------|--------|
| 类型覆盖 | 100% 导出接口有类型 | 核心接口有类型 | any 泛滥 |
| 物理约束 | 所有输出经过物理校验 | 关键路径有校验 | 无校验 |
| 错误处理 | 分层降级 + 日志 + 告警 | try-catch + 日志 | 无处理或静默吞错 |
| 模块边界 | 严格单向依赖 | 少量跨域引用 | 循环依赖 |

### 10.2 数据质量标准

| 等级 | 综合评分 | 含义 |
|------|---------|------|
| A | >= 90 | 可直接用于模型训练和诊断决策 |
| B | >= 75 | 可用于趋势分析，诊断需人工确认 |
| C | >= 60 | 仅可用于统计概览，不可用于诊断 |
| D | >= 40 | 数据质量差，需排查传感器和链路 |
| F | < 40 | 数据不可用，必须现场检修 |

### 10.3 模块完成度标准

| 等级 | 标准 | 验证方式 |
|------|------|---------|
| Done | 有类型 + 有实现 + 有测试 + 通过 CI | `pnpm test && pnpm check` |
| Partial | 有类型 + 有实现，缺测试或未通过 CI | 代码审查 |
| Stub | 仅有接口定义或空壳实现 | Grep `stub` / `TODO` |
| Planned | 仅在文档/计划中提及 | 检查 docs/ |

---

## 11. 三重记忆系统

本项目使用三重记忆系统保持跨会话的上下文连续性：

### 11.1 永久记忆 — `CLAUDE.md` (本文件)

- 核心架构决策 (§8)、设计原则 (§9)、评价标准 (§10)
- **只增不删**，修改需记录变更理由和日期
- 所有会话共享，是 AI 助手的"长期记忆"

### 11.2 每日记忆 — `docs/daily/YYYY-MM-DD.md`

- 每次对话结束前执行 `/daily` 命令自动生成
- 记录：当天完成的模块、关键决策、未完成任务、明天的起点
- 是会话间的"工作日志"，帮助下一次对话快速恢复上下文
- 模板见 `docs/daily/TEMPLATE.md`

### 11.3 经验库 — `docs/LESSONS_LEARNED.md`

- 发现问题时手动追加（使用 `/lesson` 提示）
- 记录：踩过的坑、有效的指令模式、影响系统稳定性的操作
- 按类别组织：架构、数据、部署、调试

### 11.4 反思命令 — `/insight`

执行 `/insight` 时，AI 助手应分析当前上下文并主动报告：

1. **未落地的讨论** — 哪些讨论过的方案还没变成代码
2. **潜在冲突** — 哪些模块之间存在接口不匹配或语义冲突
3. **下一步建议** — 当前最值得做的一件事（ROI 最高）

输出格式：
```
## /insight 反思报告 — YYYY-MM-DD

### 未落地
- [ ] ...

### 潜在冲突
- ...

### 下一步建议
> ...
```

---

## 12. 自定义命令参考

| 命令 | 触发 | 说明 |
|------|------|------|
| `/daily` | 对话结束前 | 生成当天工作日志到 `docs/daily/` |
| `/insight` | 随时 | 分析上下文，报告未落地/冲突/建议 |
| `/lesson` | 发现问题时 | 追加经验到 `docs/LESSONS_LEARNED.md` |

---

## 13. 每次启动必读清单

> **2026-03-02 新增** — 确保每次会话启动时自动恢复完整上下文。

### 13.1 必读文件（按优先级）

| 优先级 | 文件 | 用途 |
|--------|------|------|
| P0 | `CLAUDE.md` (本文件) | ADR、设计原则、禁止事项 |
| P0 | `docs/SESSION_STATE.md` | 当前状态、已知问题、下一步 |
| P1 | `docs/COMPLETE_FIX_PLAN.md` | 143 项修复计划 (FIX-001~FIX-143) |
| P1 | `docs/SPRINT_PLAN.md` | 当前 Sprint 任务列表和验收标准 |
| P2 | `docs/PITFALLS.md` | 10 条已知陷阱，避免重踩 |
| P2 | `docs/LESSONS_LEARNED.md` | 经验库 |

### 13.2 开发规范补充（2026-03-02 起生效）

以下规范是对 §9 设计原则的具体化，修复计划执行期间**强制遵守**：

| 规范 | 说明 |
|------|------|
| **类型定义位置** | 所有新增跨域类型必须定义在 `shared/contracts/v1/` (待创建，见 FIX-040) |
| **设备 ID** | 后端统一用 `machineId` (camelCase)，数据库列用 `machine_id` (snake_case)，禁止新增 deviceId/equipmentId/device_id (见 FIX-001) |
| **时间戳** | JSON 字段内统一用 `number` (epoch ms)，Drizzle 列保持 `timestamp()` 返回 Date，API 层转换 (见 FIX-003) |
| **Severity 枚举** | 统一用 `shared/contracts/v1/common.contract.ts` 的 SeverityLevel (待创建，见 FIX-002) |
| **EventBus** | 禁止 `eventBus.publish()` 不经 Schema 校验 (见 FIX-020) |
| **confidence 值** | 禁止硬编码 confidence 字面量，必须从数据计算或配置读取 (ADR-001, FIX-082) |
| **any 类型** | 禁止新增 `any` 类型，使用具体接口或 `unknown` + 类型守卫 |
| **路由 Zod** | 新路由的 Zod schema 必须从 `shared/contracts/` import，禁止内联定义 |
| **pnpm check** | 每次代码变更后必须 0 错误 |

### 13.3 当前最高优先级

Sprint 1 任务（本周），读取 `docs/SPRINT_PLAN.md` 查看 15 个任务。

**Sprint 1 核心目标:**
- FIX-001 DeviceIdNormalizer（设备 ID 统一）
- FIX-002 SeverityMapper（严重度枚举统一）
- FIX-003 TimestampNormalizer（时间戳统一）
- FIX-004~008 P0 适配器 5 个（打通 Flow F/B 主路径）
- 消除致命问题 18 个中的前 15 个

**验收标准:**
- `pnpm check` 0 错误
- `pnpm test:flows` 通过
- Flow F 和 Flow B 端到端可走通

**Sprint 日期:**
- Sprint 1: 2026-03-02 ~ 03-06 (致命问题 + 安全加固)
- Sprint 2: 2026-03-09 ~ 03-13 (严重问题 + 核心功能)
- Sprint 3: 2026-03-16 ~ 03-20 (中优先级 + 体系化)
- Sprint 4: 2026-03-23 ~ 03-27 (低优先级 + 收尾)

### 13.4 快速恢复指令

会话中断后输入:

```
读取 CLAUDE.md 和 docs/SESSION_STATE.md。
分支: feature/hde-v3-phase0。
查看 docs/SPRINT_PLAN.md 确定当前 Sprint。
继续当前 Sprint 任务。
```

### 13.5 Skill 文件位置

开发新功能前先读取对应 Skill:

| Skill | 位置 | 场景 |
|-------|------|------|
| skill-add-algorithm | `skills/skill-add-algorithm/SKILL.md` | 新增算法 |
| skill-add-trpc-route | `skills/skill-add-trpc-route/SKILL.md` | 新增 tRPC 路由 |
| skill-add-kafka-consumer | `skills/skill-add-kafka-consumer/SKILL.md` | 新增 Kafka 消费者 |
| skill-fix-frontend-shell | `skills/skill-fix-frontend-shell/SKILL.md` | 修复前端空壳页面 |
| skill-add-db-table | `skills/skill-add-db-table/SKILL.md` | 新增数据库表 |
| skill-add-adapter | `skills/skill-add-adapter/SKILL.md` | 新增协议适配器 |
| skill-quality-audit | `skills/skill-quality-audit/SKILL.md` | 质量审计 |
| skill-restore-session | `skills/skill-restore-session/SKILL.md` | 会话恢复 |
