# SESSION_STATE.md — 三方协作状态锚点

> 最后更新: 2026-03-02 | 分支: feature/hde-v3-phase0 | 维护者: Claude Code

---

## 1. 项目概况

| 维度 | 值 |
|------|---|
| **平台名称** | 西联港机智能运维平台 (xilian-platform-app) |
| **架构模式** | 单体 + 8 域微服务就绪（DEPLOYMENT_MODE 切换） |
| **前端** | React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 + shadcn/ui + Wouter 3 |
| **后端** | Node.js 18+ + Express 4 + tRPC 11 + Drizzle ORM 0.44 |
| **状态管理** | Zustand 5 + React Query (tanstack) |

### 代码量

| 指标 | 数值 |
|------|------|
| TypeScript/TSX 文件 | 951 |
| 总代码行数 | 354,790 |
| 服务端文件 | 626 |
| 客户端文件 | 291 |
| 共享类型文件 | 10 |
| 测试文件 | 58 |
| tRPC 路由文件 | 57 |
| 前端页面 | 147 |
| 算法文件 | 18 (含 49 个算法实现) |
| 协议适配器 | 19 |
| Proto 文件 | 10 |
| TODO/FIXME/HACK | 31 处 |

### 数据库栈

| 数据库 | 表数 | 用途 |
|--------|------|------|
| MySQL (Drizzle) | 206 表 (127+74+5) | 关系型业务数据 |
| ClickHouse | 4 核心表 + 物化视图 | 时序数据 (7d/2y/5y 分层) |
| Neo4j | 8 节点 + 8 关系类型 | 知识图谱 |
| Redis | 5 命名空间 | 缓存 + 消息 |
| Qdrant | 向量索引 | 相似性搜索 |
| MinIO | 对象存储 | 文件/模型存储 |

### 当前运行状态

```
开发服务器: localhost:3002 (端口 3000 常被占用)
MySQL: 正常
Redis: 正常
ClickHouse: 降级 (开发环境预期)
Kafka: 降级 (开发环境预期)
Neo4j: 降级 (开发环境预期)
Docker: 31 服务定义 (docker-compose.yml)
```

---

## 2. 已完成模块清单

### P0: 基础框架层 (Done)

| 模块 | 文件 | 状态 |
|------|------|------|
| tRPC 框架 | `server/core/trpc.ts` | Done |
| 统一配置 | `server/core/config.ts` (790 行) | Done |
| 日志系统 | `server/core/logger.ts` | Done |
| 启动编排 | `server/core/startup-tasks.ts` | Done |
| LLM 抽象 | `server/core/llm.ts` | Done |
| MySQL Schema | `drizzle/schema.ts` (127 表) | Done |
| Evolution Schema | `drizzle/evolution-schema.ts` (74 表) | Done |
| HDE Schema | `drizzle/hde-schema.ts` (5 表) | Done |
| Relations | `drizzle/relations.ts` | Done |

### P1: 感知-认知-进化闭环

| 模块 | 关键文件 | 状态 |
|------|---------|------|
| 感知管线 | `server/platform/perception/perception-pipeline.ts` | Partial |
| 数据质量评分 | `server/platform/perception/quality/data-quality-scorer.ts` (787 行) | Partial |
| 单位注册表 | `server/platform/perception/normalization/unit-registry.ts` (658 行) | Partial |
| 跨设备对齐 | `server/platform/perception/alignment/multi-device-aligner.ts` (688 行) | Partial |
| DS 融合引擎 | `server/platform/cognition/engines/ds-fusion.engine.ts` | Partial |
| Grok 推理 | `server/platform/cognition/grok/grok-reasoning.service.ts` | Partial |
| Grok 工具调用 | `server/platform/cognition/grok/grok-tool-calling.ts` (416 行) | Partial |
| HDE 编排器 | `server/platform/hde/orchestrator/diagnostic-orchestrator.ts` (378 行) | Partial |
| 进化引擎 | `server/platform/evolution/` (19 子目录) | Partial |
| 知识结晶 | `server/platform/evolution/crystallization/knowledge-crystallizer.ts` (508 行) | Partial |

### P2: 算法库 (49 算法)

| 分类 | 算法数 | 文件 |
|------|--------|------|
| 机械 (mechanical) | 8 | `server/algorithms/mechanical/index.ts` |
| 电气 (electrical) | 4 | `server/algorithms/electrical/index.ts` |
| 结构 (structural) | 5 | `server/algorithms/structural/index.ts` |
| 异常检测 (anomaly) | 4 | `server/algorithms/anomaly/index.ts` |
| 特征提取 (feature-extraction) | 5 | `server/algorithms/feature-extraction/index.ts` |
| 优化 (optimization) | 4 | `server/algorithms/optimization/index.ts` |
| 综合融合 (comprehensive) | 4 | `server/algorithms/comprehensive/index.ts` |
| 模型迭代 (model-iteration) | 4 | `server/algorithms/model-iteration/index.ts` |
| 规则学习 (rule-learning) | 4 | `server/algorithms/rule-learning/index.ts` |
| Agent 插件 (agent-plugins) | 6 | `server/algorithms/agent-plugins/index.ts` |
| DSP 核心库 | 66 函数 | `server/algorithms/_core/dsp.ts` (1,199 行) |

### P3: 协议适配器 (19 个)

工业: mqtt, opcua, modbus, ethernet-ip, profinet, ethercat
数据库: mysql, postgresql, clickhouse, influxdb, redis, neo4j, qdrant
消息: kafka
存储: minio
API: http, grpc, websocket
专用: hikvision

### 数据契约层

| 文件 | 行数 | 状态 |
|------|------|------|
| `server/platform/contracts/data-contracts.ts` | ~643 | Partial (31 处断裂) |
| `server/platform/contracts/event-schema-registry.ts` | ~400 | Partial (未强制执行) |
| `server/platform/contracts/builtin-schemas.ts` | ~200 | Done |
| `server/platform/contracts/physics-formulas.ts` | ~150 | Partial |
| `server/platform/contracts/cross-domain-adapters.ts` | ~400 | Done (5 P0 适配器, 27 tests) |

### 前端页面 (147 个 .tsx 文件)

| 模块 | 页面数 | 状态 |
|------|--------|------|
| 数字孪生 | 7 + 11 配置面板 | Partial |
| 诊断 | 2 (FusionDiagnosis 1654 行) | Partial |
| 进化 | 21 | Partial |
| 数据库 | 8 | Partial |
| 算法 | 5 | Partial |
| 设置 | 10 (6 子目录) | Partial |
| AI | 4 | Partial |
| 认知推理 | 6 | Partial |
| 其余 | ~84 | Partial/Stub |

### 文档 (10 份)

| 文档 | 位置 | 行数 |
|------|------|------|
| CLAUDE.md | 项目根 | 488 |
| MASTER_DEVELOPMENT_PLAN.md | docs/ | 837 |
| ARCHITECTURE_DESIGN.md | docs/ | ~450 |
| PLATFORM_SPLIT_ARCHITECTURE.md | docs/ | 717 |
| KNOWLEDGE_ARCHITECTURE.md | docs/ | 1,186 |
| ALGORITHM_INVENTORY.md | docs/ | 504 |
| MICROSERVICE_CONFIG_ARCHITECTURE.md | docs/ | 850 |
| FEDERATED_KNOWLEDGE_DISTILLATION.md | docs/ | ~400 |
| LESSONS_LEARNED.md | docs/ | 72 |

### Skills (8 个)

| Skill | 位置 | 覆盖 |
|-------|------|------|
| skill-add-algorithm | `skills/skill-add-algorithm/SKILL.md` | 算法新增全流程 |
| skill-add-trpc-route | `skills/skill-add-trpc-route/SKILL.md` | tRPC 路由新增 |
| skill-add-kafka-consumer | `skills/skill-add-kafka-consumer/SKILL.md` | Kafka 消费者新增 |
| skill-fix-frontend-shell | `skills/skill-fix-frontend-shell/SKILL.md` | 前端空壳修复 |
| skill-add-db-table | `skills/skill-add-db-table/SKILL.md` | 数据库表新增 |
| skill-add-adapter | `skills/skill-add-adapter/SKILL.md` | 协议适配器新增 |
| skill-quality-audit | `skills/skill-quality-audit/SKILL.md` | 质量审计流程 |
| skill-restore-session | `skills/skill-restore-session/SKILL.md` | 会话恢复流程 |

---

## 3. 当前质量基线

### 编译状态

```
pnpm check: 0 错误 ✅ (2026-03-02)
pnpm test:  61 套件, 1517 测试 全部通过 ✅
质量门禁: 6/6 通过 ✅
any 类型: 2739 (基线 2750, generated/ 已排除)
覆盖率基线 (FIX-134, 2026-03-02):
  Statements: 17.2% | Branches: 72.3% | Functions: 47.1% | Lines: 17.2%
  阈值门禁: Stmt≥15% | Branch≥70% | Func≥45% | Lines≥15%
FIX 实际完成 (代码审核): 132/143 (92.3%) — 仅 FIX-111~118 前端页面推入下一迭代
```

### Sprint 进度

| Sprint | 状态 | 完成 | 详情 |
|--------|------|------|------|
| Sprint 1 | ✅ 完成 | 15/15 | 致命问题+安全加固 |
| Sprint 2 | ✅ 完成 | 25/25 | 严重问题+核心功能 |
| Sprint 3 | ✅ 完成 | 22/22 | 中优先级+体系化, confidence 配置化 |
| Sprint 4 | 🔄 ~60/70 | ~60/70 | 低优先级+收尾, 剩余 XL 任务评估中 |

### 算法库评级 (48+1 个)

- 国际标准对齐: 48 个算法对标 ISO/IEC/IEEE
- I/O 标准化: IAlgorithmExecutor 接口统一
- DSP 核心库: 66 个信号处理函数
- 物理约束: ADR-001 强制校验
- confidence 要求: 必须从数据计算，禁止硬编码

### 流程可走通状态

| # | 流程 | 状态 | 备注 |
|---|------|------|------|
| 1 | 传感器→感知管线→状态向量 | ✅ 通 | FIX-090 E2E 测试 + pipeline-orchestrator |
| 2 | 状态向量→DS 融合→诊断结论 | ✅ 通 | FIX-091 Severity 统一 + 映射函数 |
| 3 | 诊断结论→护栏校验→安全干预 | ✅ 通 | FIX-092 GuardrailCheck 接入 |
| 4 | HDE 双轨→物理+数据→融合结论 | ✅ 通 | FIX-093 E2E 测试通过 |
| 5 | 知识图谱→推理链→诊断增强 | ✅ 通 | FIX-094 Neo4j 种子数据 + 知识查询 |
| 6 | 进化飞轮→影子评估→冠军挑战者 | ✅ 通 | FIX-095 持久化接入 |
| 7 | 算法库→执行→结果持久化 | ✅ 通 | syncBuiltinAlgorithms 自动 |
| 8 | tRPC API→前端调用→数据展示 | ✅ 通 | 类型安全端到端 |
| 9 | 编码体系→4 段统一→跨系统关联 | ✅ 通 | encoding-seed + encoding-validator |
| 10 | Kafka 事件→Schema 校验→消费 | ✅ 通 | FIX-020/021/096 Schema 强制校验 |
| 11 | 数据质量评分→分级→告警 | ✅ 通 | FIX-097 集成测试 54 个通过 |
| 12 | 跨设备对比→共享组件发现 | ✅ 通 | FIX-098 批量并行查询优化 |
| 13 | 前端数字孪生→3D 模型→传感器热图 | ✅ 通 | Three.js 渲染正常 |
| 14 | 协议适配→接入层→Connector CRUD | ✅ 通 | 18 协议自动暴露 |

---

## 4. 进行中任务

### 4.1 Sprint 1 (✅ 完成 2026-03-02)

15/15 任务全部完成：
- [x] FIX-002 Severity枚举统一 → `shared/contracts/v1/base.ts`
- [x] FIX-040 contracts/v1/ 目录创建
- [x] FIX-020 EventBus Schema校验
- [x] FIX-101/102/103/104/106 安全加固 (5项)
- [x] FIX-091 DS融合Severity修正
- [x] FIX-090 感知管线E2E测试 (18 tests)
- [x] FIX-092 护栏引擎接入
- [x] FIX-119 插件沙箱isolated-vm (11 tests)
- [x] FIX-047 gRPC类型生成
- [x] FIX-134 测试覆盖率基线

### 4.2 Sprint 2 (✅ 完成 2026-03-02)

25/25 任务全部完成：
- [x] FIX-004 DiagnosisConclusion 统一
- [x] FIX-005 UrgencyLevel 统一
- [x] FIX-025/026 Severity 兼容映射
- [x] FIX-060 mysqlEnum severity 统一
- [x] FIX-010 前端 equipmentId 映射
- [x] FIX-011 Neo4j deviceId 统一
- [x] FIX-016 契约字段名修正
- [x] FIX-021 Schema 注册表激活
- [x] FIX-043 类型断言替换
- [x] FIX-096 Kafka Schema 校验
- [x] FIX-028 tRPC 输出校验中间件
- [x] FIX-029 错误码接入 tRPC
- [x] FIX-063/064/070 GrokTool 3 个高频工具
- [x] FIX-082 confidence 硬编码清理 Phase 1
- [x] FIX-094 Neo4j 种子数据
- [x] FIX-095 进化飞轮持久化
- [x] FIX-120 安全检查 AST
- [x] FIX-122 插件签名验证
- [x] FIX-003 时间戳统一 Phase 1
- [x] FIX-077 AlertManager 集成
- [x] FIX-093 HDE 端到端测试
- [x] FIX-135 AI 模块测试
- [x] MQTT→ClickHouse 写桥 + 告警订阅者 + 跨域适配器5个

### 4.3 Sprint 3 (✅ 完成 2026-03-02)

22/22 任务全部完成：
- [x] FIX-022 UnifiedEventBus Facade (Kafka+内存路由)
- [x] FIX-023 DLQ 死信队列实现
- [x] FIX-024 消费者 30s 心跳健康检查
- [x] FIX-126 双总线路由策略
- [x] FIX-017/018/019 契约类型修正+补全+清理
- [x] FIX-031 Zod schema 提取到 shared/contracts/schemas/
- [x] FIX-035/036 时间戳统一 (toEpochMs + datesToEpoch)
- [x] FIX-083 agent-plugins confidence 配置化 (3 个专家类)
- [x] FIX-086 fusionDiagnosis confidence 重构 (决策处理器阈值命名化)
- [x] FIX-088 meta-learner 阈值配置化
- [x] FIX-065/066/071 GrokTool 3 个工具实现
- [x] FIX-048 evolution-schema 类型细化 (剩余 5 处合理 Record)
- [x] FIX-081/123 ToolContract 统一接口 + 注册表
- [x] FIX-100 配置参数清理
- [x] FIX-114 前端 5 核心页面修复
- [x] FIX-139 算法库 12 分类测试

### 4.4 Sprint 4 (🔄 ~60/70 完成)

**已完成 (~60 项)**:
- [x] FIX-006~009 PipelineStatus/Kafka命名/eventBus签名
- [x] FIX-012~015 sensor-simulator/映射表/config文档/metrics
- [x] FIX-027/030/033/034 AnomalySeverity/API版本/类型重组/@deprecated
- [x] FIX-037~039 ClickHouse/streamProcessor/feature-extraction timestamp
- [x] FIX-042/044/045 Topic版本策略/Schema Registry/CI契约检测
- [x] FIX-046/049~058 前后端同步/类型细化/Zod schema/类型断言
- [x] FIX-059/061/062 ConditionNormalizer/Store对齐/WorldModel标记
- [x] FIX-067~069/072 GrokTool 4 个工具
- [x] FIX-078/079/080 AlertManager/orchestrator-hub/tooling域
- [x] FIX-084/085/087/089 算法参数配置化
- [x] FIX-097/098/099 数据质量/跨设备优化/工况归一化
- [x] FIX-105~110 Grafana/Vault/Prometheus/Helm/gRPC健康检查
- [x] FIX-121/128/129 插件生命周期/Neo4j备份/Redis淘汰
- [x] FIX-124/125 ReAct回放/EventBus接入工具
- [x] FIX-136~141 核心模块测试套件 (event-sourcing/base-adapter/pipeline等)

**剩余 ~10 项 (需评估)**:
- [ ] FIX-111~118 前端页面补全 Phase 2 (XL)
- [ ] FIX-073~076 前端 placeholder 标记
- [ ] FIX-130 MySQL 分片键注释 (XL)
- [ ] FIX-131 Saga/Outbox 补偿逻辑
- [ ] FIX-132 Grafana dashboard ID
- [ ] FIX-133 PodSecurityStandards 迁移
- [ ] FIX-134 测试覆盖率基线验证
- [ ] FIX-142 Proto CI 验证
- [ ] FIX-143 MySQL 初始化脚本

### 4.3 质量监督体系 (✅ 完成 2026-03-02)

- [x] `scripts/quality-gate.ts` — 6项自动检查
- [x] `scripts/fix-tracker.ts` — 143项FIX追踪
- [x] `scripts/daily-report.ts` — 每日质量报告
- [x] `.husky/pre-commit` — 提交门禁
- [x] `docs/REVIEW_CHECKPOINTS.md` — 人工验收清单
- [x] 质量仪表盘 — `/platform/quality` (5面板)

---

## 5. 已知问题清单

### 致命级 (已修复)

| # | 问题 | 状态 | 修复 |
|---|------|------|------|
| ~~F1~~ | ~~设备 ID 4 种命名~~ | ✅ 已修复 | FIX-001 DeviceIdMapper + normalizeDeviceId() |
| ~~F2~~ | ~~Severity 枚举 7 种定义~~ | ✅ 已修复 | FIX-002 统一 SeverityLevel + 6 个映射函数 |
| ~~F3~~ | ~~31 处数据格式断裂~~ | ✅ 已修复 | FIX-017/018/019 契约修正 |

### 高优先级 (已修复)

| # | 问题 | 状态 | 修复 |
|---|------|------|------|
| ~~H1~~ | ~~时间戳混用~~ | ✅ 已修复 | FIX-035/036 toEpochMs + UnixTimestampMs |
| H2 | WorldModel 训练仍是 stub | ⚠️ 已标记 | FIX-062 status:'not_implemented' + 前端提示 |
| ~~H3~~ | ~~EventBus Schema 校验未强制~~ | ✅ 已修复 | FIX-020/021 UnifiedEventBus Schema 校验 |
| ~~H4~~ | ~~gRPC 类型全是 Record~~ | ✅ 已修复 | FIX-047 proto:gen 生成 TypeScript 类型 |

### 中优先级 (大部分已修复)

| # | 问题 | 状态 | 修复 |
|---|------|------|------|
| ~~M1~~ | ~~11 个配置参数被忽略~~ | ✅ 已修复 | FIX-100 配置清理 |
| ~~M2~~ | ~~工况归一化特征顺序 bug~~ | ✅ 已修复 | FIX-099 |
| ~~M3~~ | ~~GrokTool 10 个 stub~~ | ✅ 已修复 | FIX-063~072 全部实现或明确标记 |
| ~~M4~~ | ~~插件沙箱 Function 构造器~~ | ✅ 已修复 | FIX-119 isolated-vm + FIX-122 签名验证 |

---

## 6. 下一步精确指令

### 新会话第一件事

```
读取 docs/SESSION_STATE.md（本文件）
读取 docs/MASTER_DEVELOPMENT_PLAN.md
读取 docs/PITFALLS.md
```

### 当前推荐执行顺序

```
Sprint 1~3 全部完成，Sprint 4 约 60/70 完成。

剩余任务按优先级排序：
1. FIX-073~076 前端 placeholder 页面标记 (S, 2h)
2. FIX-132 Grafana dashboard ID 修复 (XS, <1h)
3. FIX-134 测试覆盖率基线 (M, 验证当前 1517 测试)
4. FIX-142 Proto CI 验证 (S, 2h)
5. FIX-143 MySQL 初始化脚本 (S, 2h)
6. FIX-133 PodSecurityStandards 迁移 (S, 2h)
7. FIX-131 Saga/Outbox 补偿逻辑 (L, 推入下一迭代)
8. FIX-130 MySQL 分片键注释 (XL, 推入下一迭代)
9. FIX-111~118 前端页面补全 Phase 2 (XL, 推入下一迭代)
```

---

## 7. 禁止修改的稳定模块

以下文件已验证稳定运行，**不得随意修改**（修改需在此记录理由和日期）：

| 文件 | 理由 |
|------|------|
| `server/core/trpc.ts` | tRPC 基础框架，所有路由依赖 |
| `server/algorithms/_core/types.ts` | IAlgorithmExecutor 接口，49 个算法依赖 |
| `server/algorithms/_core/dsp.ts` | 66 个 DSP 函数，算法层核心依赖 |
| `server/algorithms/_core/engine.ts` | 算法执行引擎，注册+缓存+Worker 池 |
| `server/algorithms/index.ts` | 算法注册中心，自动收集所有分类 |
| `server/services/protocol-adapters/base.ts` | 适配器基类，19 个适配器继承 |
| `server/services/protocol-adapters/index.ts` | 适配器注册表 |
| `server/platform/tooling/framework/tool-framework.ts` | 工具框架，权限+审计+超时 |
| `drizzle/schema.ts` | 127 张主表定义 |
| `drizzle/evolution-schema.ts` | 74 张进化表定义 |
| `drizzle/relations.ts` | 所有表关系定义 |
| `shared/accessLayerTypes.ts` | 接入层类型，19 协议依赖 |
| `client/src/lib/trpc.ts` | tRPC 客户端，所有前端调用依赖 |
| `CLAUDE.md` | 永久记忆，ADR 不可删除 |

---

## 8. 关键文件索引

### 架构与规划

| 功能 | 文件 |
|------|------|
| 项目上下文 + ADR | `CLAUDE.md` |
| 开发总纲 | `docs/MASTER_DEVELOPMENT_PLAN.md` |
| 基础设施架构 | `docs/ARCHITECTURE_DESIGN.md` |
| 知识体系架构 | `docs/KNOWLEDGE_ARCHITECTURE.md` |
| 双平台架构 | `docs/PLATFORM_SPLIT_ARCHITECTURE.md` |
| 经验库 | `docs/LESSONS_LEARNED.md` |
| 踩坑记录 | `docs/PITFALLS.md` |

### 核心框架

| 功能 | 文件 |
|------|------|
| 服务器启动 | `server/core/index.ts` |
| 统一配置 | `server/core/config.ts` |
| tRPC 定义 | `server/core/trpc.ts` |
| 路由注册 | `server/routers.ts` |
| 启动任务 | `server/core/startup-tasks.ts` |
| LLM 抽象 | `server/core/llm.ts` |

### 感知层

| 功能 | 文件 |
|------|------|
| 感知管线 | `server/platform/perception/perception-pipeline.ts` |
| 数据质量评分 | `server/platform/perception/quality/data-quality-scorer.ts` |
| 单位换算 | `server/platform/perception/normalization/unit-registry.ts` |
| 跨设备对齐 | `server/platform/perception/alignment/multi-device-aligner.ts` |
| DS 融合 | `server/platform/perception/fusion/ds-fusion-engine.ts` |

### 认知层

| 功能 | 文件 |
|------|------|
| Grok 推理 | `server/platform/cognition/grok/grok-reasoning.service.ts` |
| Grok 工具调用 | `server/platform/cognition/grok/grok-tool-calling.ts` |
| Grok 工具定义 | `server/platform/cognition/grok/grok-tools.ts` |
| DS 融合引擎 | `server/platform/cognition/engines/ds-fusion.engine.ts` |
| HDE 类型 | `server/platform/hde/types/index.ts` |
| HDE 编排器 | `server/platform/hde/orchestrator/diagnostic-orchestrator.ts` |

### 算法层

| 功能 | 文件 |
|------|------|
| 执行引擎 | `server/algorithms/_core/engine.ts` |
| DSP 核心 | `server/algorithms/_core/dsp.ts` |
| 接口定义 | `server/algorithms/_core/types.ts` |
| 机械算法 (8) | `server/algorithms/mechanical/index.ts` |
| 异常检测 (4) | `server/algorithms/anomaly/index.ts` |

### 数据层

| 功能 | 文件 |
|------|------|
| MySQL 主 Schema | `drizzle/schema.ts` |
| 进化 Schema | `drizzle/evolution-schema.ts` |
| HDE Schema | `drizzle/hde-schema.ts` |
| ClickHouse | `server/lib/storage/clickhouse.storage.ts` |
| Neo4j | `server/lib/storage/neo4j.storage.ts` |
| Redis | `server/lib/clients/redis.ts` |

### 数据契约

| 功能 | 文件 |
|------|------|
| 事件契约 | `server/platform/contracts/data-contracts.ts` |
| Schema 注册表 | `server/platform/contracts/event-schema-registry.ts` |
| 物理公式 | `server/platform/contracts/physics-formulas.ts` |
| 跨域适配器 (5个) | `server/platform/contracts/cross-domain-adapters.ts` |
| Kafka Topics | `server/shared/constants/kafka-topics.const.ts` |

### Sprint 2 新增服务

| 功能 | 文件 |
|------|------|
| MQTT→ClickHouse 写桥 | `server/services/mqtt-clickhouse-bridge.service.ts` |
| 告警事件订阅者 | `server/services/alert-event-subscriber.service.ts` |

### 前端核心

| 功能 | 文件 |
|------|------|
| 主入口 + 路由 | `client/src/App.tsx` |
| 导航配置 | `client/src/config/navigation.ts` |
| tRPC 客户端 | `client/src/lib/trpc.ts` |
| 数字孪生布局 | `client/src/pages/digital-twin/DigitalTwinLayout.tsx` |
| 融合诊断 (1654 行) | `client/src/pages/diagnosis/FusionDiagnosis.tsx` |
| Twin Store | `client/src/stores/twinStore.ts` |

---

## 9. 协作规则

### 角色分工

| 角色 | 职责 | 工具 |
|------|------|------|
| **用户 (你)** | 方向判断、业务决策、验收标准、优先级排序 | 对话窗口 |
| **Claude Code** | 代码实现、文件修改、测试执行、质量验证 | CLI 工具链 |
| **对话窗口** | 架构审查、策略讨论、方案对比、文档评审 | 文本交互 |

### 工作流约定

1. **每次工作开始**: 读取本文件 + `MASTER_DEVELOPMENT_PLAN.md`
2. **每次代码变更**: 遵循 `CLAUDE.md` §9 七条设计原则
3. **每次新增模块**: 参考 `skills/` 对应 Skill 步骤
4. **每次工作结束**: 更新本文件 §4 "进行中任务" + 执行 `/daily`
5. **发现新坑**: 更新 `docs/PITFALLS.md` + 执行 `/lesson`

### 禁止事项

- 禁止修改 §7 列出的稳定模块（除非明确记录理由）
- 禁止硬编码 confidence 值（ADR-001）
- 禁止跳过感知三层架构（ADR-003）
- 禁止跨域直接 import（ADR-002，用 EventBus）
- 禁止删除 CLAUDE.md 中的 ADR（只增不删）

---

## 10. 上下文恢复指令

### Claude Code /clear 后粘贴：

```
读取 docs/SESSION_STATE.md 和 docs/MASTER_DEVELOPMENT_PLAN.md。
当前分支: feature/hde-v3-phase0。
当前任务: [填写具体任务]。
继续从 [填写具体步骤] 开始。
不要重复已完成的工作，直接执行下一步。
```

### 新窗口标准恢复指令：

```
读取以下文件恢复上下文：
1. docs/SESSION_STATE.md — 项目全局状态
2. docs/MASTER_DEVELOPMENT_PLAN.md — 开发总纲
3. docs/PITFALLS.md — 已知陷阱
4. docs/LESSONS_LEARNED.md — 经验库

当前分支: feature/hde-v3-phase0
开发服务器: localhost:3002
降级组件: ClickHouse/Kafka/Neo4j (开发环境预期)

当前任务是: [填写]
从 [填写具体文件/步骤] 开始继续。
```

### 紧急恢复（最小上下文）：

```
读取 docs/SESSION_STATE.md。
分支: feature/hde-v3-phase0。
任务: [填写]。
开始。
```
