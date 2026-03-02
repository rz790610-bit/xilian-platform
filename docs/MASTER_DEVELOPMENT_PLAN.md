# 开发总纲

> **版本**: 1.0.0
> **日期**: 2026-02-28
> **分支**: `feature/hde-v3-phase0`
> **综合来源**: CLAUDE.md, PLATFORM_SPLIT_ARCHITECTURE.md, KNOWLEDGE_ARCHITECTURE.md, ALGORITHM_INVENTORY.md, MICROSERVICE_CONFIG_ARCHITECTURE.md, LESSONS_LEARNED.md, docs/daily/

---

## 一、平台愿景与核心定位

### 1.1 愿景

**复杂工业场景下港机设备智能运维平台** — 面向全球 1000 台港机设备的全生命周期智能运维，处理 PB 级历史数据，实现从被动维修到预测性维护的范式转变。

### 1.2 核心定位

| 维度 | 定位 |
|------|------|
| **业务价值** | 数据奇点挖掘、预测性维护、跨设备横向对比、自进化诊断 |
| **技术差异** | 三源融合（OEM 原始数据 + 港口运营数据 + 物理机理约束）→ 物理约束优先的可信诊断 |
| **交付形态** | 双平台架构 — 赋能平台（内部研发）+ 应用平台（客户运维） |
| **数据来源** | 世界主要港机制造商原始数据 + 世界前十码头 5 家信息化供应商 |

### 1.3 不可违反的设计原则（ADR 摘要）

| # | 原则 | 关键约束 |
|---|------|---------|
| ADR-001 | 物理约束最高优先级 | 振动值非负、温度有上下限、功率因数 [0,1]、轴承温度 >= 环境温度 |
| ADR-002 | 8 域微服务内聚 | 域间不直接 import，通过 EventBus 通信 |
| ADR-003 | 感知管线三层不可跳层 | 边缘层 → 汇聚层 → 平台层，不可跳层 |
| ADR-004 | 4 段式统一编码 | 设备(5级)/部件(4级)/故障(3级)/工况(3级) |
| ADR-005 | 数据质量公式 | `综合 = 完整度×0.4 + 准确度×0.6` |

---

## 二、已完成模块清单

> 完成度标准：Done = 有类型+实现+测试+CI | Partial = 有类型+实现 | Stub = 接口/空壳 | Planned = 仅文档

### 2.1 算法引擎层（Done/Partial）

| 模块 | 路径 | 行数 | 完成度 | 说明 |
|------|------|------|--------|------|
| AlgorithmEngine 核心 | `algorithms/_core/engine.ts` | 694 | Partial | 单例+缓存+Worker+批量，缺单元测试 |
| DSP 底层函数库 | `algorithms/_core/dsp.ts` | ~1,199 | Partial | 66 个导出函数（FFT/STFT/包络/窗函数/统计量） |
| IAlgorithmExecutor 接口 | `algorithms/_core/types.ts` | 149 | Done | 标准化接口定义 |
| Worker 线程池 | `algorithms/_core/workerPool.ts` | ~300 | Partial | 大数据自动分流 |
| 机械算法（8 个） | `algorithms/mechanical/` | 2,402 | Partial | FFT/倒谱/包络/小波/带通/谱峭度/重采样/阶次 |
| 电气算法（4 个） | `algorithms/electrical/` | 659 | Partial | MCSA/PD/VFD/电能质量 |
| 结构算法（5 个） | `algorithms/structural/` | 633 | Partial | Miner/AE/模态/热点应力/雨流 |
| 异常检测（4 个） | `algorithms/anomaly/` | 649 | Partial | IsolationForest/LSTM/AE/SPC |
| 优化算法（4 个） | `algorithms/optimization/` | 705 | Partial | PSO/GA/贝叶斯/模拟退火 |
| 综合算法（4 个） | `algorithms/comprehensive/` | 721 | Partial | DS融合/关联规则/因果推理/工况归一化 |
| 特征提取（5 个） | `algorithms/feature-extraction/` | 694 | Partial | 时域/频域/时频/统计/深度 |
| Agent 插件（6 个） | `algorithms/agent-plugins/` | 850 | Partial | 模式/案例/物理约束/空间/融合/预测专家 |
| 模型迭代（4 个） | `algorithms/model-iteration/` | 670 | Partial | LoRA/全量/增量/蒸馏 |
| 规则学习（4 个） | `algorithms/rule-learning/` | 855 | Partial | LLM/关联规则/决策树/频繁模式 |

**汇总**: 49 个算法全部实现 `IAlgorithmExecutor`，100% 标准化接口覆盖，85.7% 可边缘部署。

### 2.2 平台基础设施层（Partial）

| 模块 | 路径 | 行数 | 完成度 | 说明 |
|------|------|------|--------|------|
| 核心启动框架 | `core/index.ts`, `startup.ts` | ~500 | Partial | 15 步启动编排器 |
| 统一配置中心 | `core/config.ts` | ~600 | Partial | 环境变量+默认值 |
| tRPC 路由框架 | `core/trpc.ts` | ~200 | Done | 33 个 API 路由注册 |
| 日志系统 | `core/logger.ts` | ~150 | Done | Pino + OTel |
| LLM 抽象层 | `core/llm.ts` | 431 | Partial | Provider 链+重试+配置驱动 |
| 动态配置引擎 | `platform/config/dynamic-config.ts` | 502 | Partial | 三级继承+版本+回滚+Watch |
| 事件总线 | `platform/events/event-bus.ts` | 338 | Partial | 内存实现，缺 Redis 后端 |
| 安全中间件 | `platform/middleware/` | ~400 | Partial | Helmet+CORS+限流+优雅关闭 |
| 协议适配器（14 个） | `services/protocol-adapters/` | ~2,000 | Partial | MQTT/Modbus/OPC-UA/PROFINET 等 |
| 设备类型注册表 | `core/registries/device-type.registry.ts` | 380 | Partial | 运行时注册+元数据 |

### 2.3 8 域微服务路由层（Partial）

| 域 | 路径 | 完成度 | 说明 |
|----|------|--------|------|
| 感知域 | `domains/perception/` | Partial | 数据采集+融合+编码+工况 |
| 认知域 | `domains/cognition/` | Partial | Grok 推理+WorldModel+四维诊断 |
| 护栏域 | `domains/guardrail/` | Partial | 安全规则+健康规则引擎 |
| 进化域 | `domains/evolution/` | Partial | 影子评估+冠军挑战者+知识结晶 |
| 知识域 | `domains/knowledge/` | Partial | 知识图谱+特征注册表+链式推理 |
| 工具域 | `domains/tooling/` | Stub | 工具注册/发现/执行 |
| 管线域 | `domains/pipeline/` | Partial | DAG 引擎+数字孪生+回放+仿真 |
| 平台域 | `domains/platform/` | Partial | 编排器+仪表盘+健康检查 |

### 2.4 认知引擎层（Partial）

| 模块 | 路径 | 行数 | 完成度 |
|------|------|------|--------|
| DS 融合引擎 | `cognition/engines/ds-fusion.engine.ts` | 634 | Partial |
| 融合诊断服务 | `cognition/diagnosis/fusion-diagnosis.service.ts` | 575 | Partial |
| Grok 推理 | `cognition/grok/` | ~500 | Partial |
| WorldModel | `cognition/worldmodel/world-model.ts` | ~400 | Partial |
| Grok 诊断 Agent | `services/grokDiagnosticAgent.service.ts` | 1,138 | Partial |

### 2.5 进化引擎层（Partial）

| 模块 | 路径 | 行数 | 完成度 |
|------|------|------|--------|
| 影子评估器 | `evolution/shadow/shadow-evaluator.ts` | 487 | Partial |
| 冠军挑战者 | `evolution/champion/champion-challenger.ts` | 339 | Partial（内存状态需持久化） |
| 知识结晶器 | `evolution/crystallization/knowledge-crystallizer.ts` | 508 | Partial |
| 结晶服务 | `knowledge/services/crystal.service.ts` | 287 | Stub（Map 内存，未持久化） |
| 统一结晶器 | `hde/crystallization/unified-crystallizer.ts` | ~200 | Partial |
| 进化指标 | `evolution/metrics/evolution-metrics.ts` | ~200 | Partial |
| 闭环追踪器 | `evolution/closed-loop/closed-loop-tracker.ts` | ~200 | Partial |
| 数据引擎 | `evolution/data-engine/data-engine.ts` | ~200 | Partial |
| 自动标注管线 | `evolution/fsd/auto-labeling-pipeline.ts` | ~300 | Partial |
| AI 标注降级 | `evolution/labeling/grok-label-provider.ts` | ~200 | Partial |

### 2.6 HDE 双轨诊断（Partial）

| 模块 | 路径 | 行数 | 完成度 |
|------|------|------|--------|
| HDE 编排器 | `hde/orchestrator/diagnostic-orchestrator.ts` | 378 | Partial |
| HDE 类型定义 | `hde/types/index.ts` | 403 | Done |
| HDE Schema | `drizzle/hde-schema.ts` | 338 | Done |
| 跨设备对比器 | `hde/comparator/cross-device-comparator.ts` | ~300 | Partial |
| HDE 融合引擎 | `hde/fusion/` | ~300 | Partial |

### 2.7 感知层新增模块（2026-02-28，Partial）

| 模块 | 路径 | 行数 | 完成度 |
|------|------|------|--------|
| 单位换算注册表 | `perception/normalization/unit-registry.ts` | 658 | Partial（缺测试） |
| 跨设备时间对齐器 | `perception/alignment/multi-device-aligner.ts` | 688 | Partial（缺测试） |
| 数据质量评分器 | `perception/quality/data-quality-scorer.ts` | 786 | Partial（缺测试） |
| 音频感知 | `perception/audio/` | ~300 | Stub |
| 视频感知 | `perception/video/` | ~300 | Stub |

### 2.8 知识图谱层（Partial）

| 模块 | 路径 | 完成度 |
|------|------|--------|
| Neo4j 存储（6 节点+5 关系） | `lib/storage/neo4j.storage.ts` | Partial |
| 内存 KG 引擎 | `knowledge/graph/knowledge-graph.ts` | Partial |
| KG 编排器类型（6 类 21 子类型 12 关系） | `shared/kgOrchestratorTypes.ts` | Done |
| KG 演化服务 | `knowledge/services/kg-evolution.service.ts` | Partial |
| Louvain/PageRank/向量相似度 | `neo4j.storage.ts:700-818` | Partial |

### 2.9 数字孪生层（Partial）

| 模块 | 路径 | 完成度 | 说明 |
|------|------|--------|------|
| 数字孪生布局（7 Tab） | `pages/digital-twin/` | Partial | 设备状态/仿真/回放/世界模型/3D/配置 |
| Three.js 三维 RTG 模型 | `components/digital-twin/rtg-model/` | Partial | 程序化几何体+16 传感器热点 |
| 工业图表库（5 图表） | `components/charts/industrial/` | Partial | 频谱/包络/瀑布/热力/时频 |
| 传感器图表弹窗 | `components/digital-twin/SensorChartDialog.tsx` | Partial | 按类型自动选图表+客户端 FFT |
| 数字孪生 Store | `stores/twinStore.ts` | Done | Zustand 持久化 |

### 2.10 数据库层

| 模块 | 路径 | 表数 | 完成度 |
|------|------|------|--------|
| MySQL 主 Schema | `drizzle/schema.ts` | 160 | Done |
| 进化层 Schema | `drizzle/evolution-schema.ts` | ~30 | Done |
| HDE Schema | `drizzle/hde-schema.ts` | ~10 | Done |

### 2.11 前端页面（31 个模块）

| 类别 | 页面模块 | 完成度 |
|------|---------|--------|
| 算法管理 | `pages/algorithm/` | Partial |
| 认知推理 | `pages/cognition-reasoning/` | Partial |
| 数据库管理 | `pages/database/` | Partial |
| 设备管理 | `pages/device/` | Partial |
| 诊断管理 | `pages/diagnosis/` | Partial |
| 数字孪生 | `pages/digital-twin/` (7 子页面) | Partial |
| 进化引擎 | `pages/evolution/` (21 文件) | Partial |
| 护栏规则 | `pages/guardrail/` | Partial |
| 监控大屏 | `pages/monitoring/` | Partial |
| 感知域 | `pages/perception/` | Stub |
| 平台设置 | `pages/settings/` | Partial |

### 2.12 文档体系

| 文档 | 状态 |
|------|------|
| `CLAUDE.md` (488 行) | Done — 12 章节完整 |
| `PLATFORM_SPLIT_ARCHITECTURE.md` (717 行) | Done — 双平台架构设计 |
| `KNOWLEDGE_ARCHITECTURE.md` (1,186 行) | Done — 知识体系+编码+图谱+标注 |
| `ALGORITHM_INVENTORY.md` (504 行) | Done — 49 算法清单 |
| `MICROSERVICE_CONFIG_ARCHITECTURE.md` (850 行) | Done — 5 微服务架构设计 |
| `LESSONS_LEARNED.md` (72 行) | Done — 经验库初始化 |
| `FEDERATED_KNOWLEDGE_DISTILLATION.md` | Done — 联邦知识蒸馏 |
| `DISTRIBUTED_DB_ARCHITECTURE.md` | Done — 分布式数据库架构 |
| `ALGORITHM_CONFIGURATION_LAYER.md` | Done — 算法配置层 |

---

## 三、待开发模块清单（按优先级排序）

### 3.1 P0 — 平台可运行的基础闭环

必须先完成，否则其他模块无法验证。

| # | 模块 | 依赖 | 当前状态 | 工作量 |
|---|------|------|---------|--------|
| P0-1 | 统一编码注册表实现（4 类编码 seed data） | 无 | 设计完成，代码未实现 | 1 周 |
| P0-2 | 感知管线端到端打通（协议采集 → 状态向量） | P0-1 | 各层独立存在，未串联 | 2 周 |
| P0-3 | 数据质量评分集成（感知层三模块注册 + 测试） | P0-2 | 模块存在，缺测试+集成 | 1 周 |
| P0-4 | 知识图谱基础实例化（Condition+Case 节点，3 新关系） | P0-1 | Schema 设计完成 | 1 周 |
| P0-5 | HDE 双轨诊断端到端验证（单设备完整流程） | P0-2, P0-3 | 编排器存在，未端到端验证 | 2 周 |

### 3.2 P1 — 核心差异化能力

平台竞争力的关键模块。

| # | 模块 | 依赖 | 当前状态 | 工作量 |
|---|------|------|---------|--------|
| P1-1 | DS 融合引擎端到端验证（多源证据→融合→物理约束校验） | P0-5 | 引擎存在，未端到端验证 | 2 周 |
| P1-2 | 自动标注管线闭环（3 层 AI 降级 → 审核 → 入库） | P0-4, P0-5 | 管线存在，审核流程未闭环 | 2 周 |
| P1-3 | 进化飞轮 MVP（知识结晶 → 影子评估 → 灰度 1 轮） | P1-1, P1-2 | 各模块存在但未串联 | 3 周 |
| P1-4 | 跨设备横向对比（SHARED_COMPONENT 图谱查询） | P0-4 | 对比器存在，图谱关系未建 | 1 周 |
| P1-5 | 数字孪生实时数据接入（替换演示数据） | P0-2 | 前端完成，后端数据管道缺失 | 2 周 |
| P1-6 | 工况归一化端到端（工况识别 → 编码 → 归一化 → 标准基线） | P0-1, P0-2 | 算法存在，流程未串联 | 2 周 |
| P1-7 | CAD 图纸知识图谱化（DXF/DWG → 编码+关系 → Neo4j） | P0-4 | 脚本原型存在，图谱集成缺失 | 2 周 |
| P1-8 | 数字孪生三维可视化 + 专业工业图表 | P0-2 | 前端组件已完成，需实时数据集成 | 1 周 |

### 3.3 P2 — 生产就绪

从单体到微服务，从开发到生产。

| # | 模块 | 依赖 | 当前状态 | 工作量 |
|---|------|------|---------|--------|
| P2-1 | 微服务拆分 Phase 0-1（配置中心独立 + 算法服务 gRPC） | P0-* 全部 | 架构设计完成 | 5 周 |
| P2-2 | 微服务拆分 Phase 2-3（AI 推理独立 + 诊断服务独立） | P2-1 | 架构设计完成 | 6 周 |
| P2-3 | 应用平台 MVP（三功能：健康总览+单设备诊断+预警处置） | P1-1 | 架构设计完成 | 3 周 |
| P2-4 | API Gateway（Kong）部署 + 速率限制 + 认证 | P2-1 | 未开始 | 2 周 |
| P2-5 | 单元测试覆盖率提升至 60%（49 算法+核心服务） | 无 | 大部分缺测试 | 持续 |
| P2-6 | database.router.ts 拆分（72.7 KB → 6 子路由） | 无 | 设计完成 | 2 周 |
| P2-7 | 音视频处理（声音背景分离 + 海康视频接入） | P0-2 | Stub 存在（audio/video 模块） | 3 周 |
| P2-8 | ObservabilityHub 统一观测中枢 | P0-* 全部 | 路由+类型已创建 | 2 周 |
| P2-9 | 大模型价值发挥（诊断增强/自然语言/技术情报/进化实验室） | P1-1 | 架构设计完成 | 4 周 |
| P2-10 | 评估与组合优化体系（EvaluationFramework） | P1-3 | 框架已创建 | 3 周 |

### 3.4 P3 — 增强能力

提升用户体验和系统能力。

| # | 模块 | 依赖 | 当前状态 | 工作量 |
|---|------|------|---------|--------|
| P3-1 | 联邦知识蒸馏（跨客户脱敏图谱融合） | P1-3 | 文档完成 | 4 周 |
| P3-2 | 音频/视频感知模块 | P0-1 | Stub | 3 周 |
| P3-3 | 工具域完整实现（注册/发现/执行/沙箱） | 无 | Stub | 3 周 |
| P3-4 | 全链路可观测性部署（OTel+Prometheus+Jaeger+Grafana） | P2-1 | 配置存在，未部署 | 2 周 |
| P3-5 | K8s + Helm 生产部署 + HPA 自动扩缩 | P2-* | Helm Chart 存在 | 3 周 |
| P3-6 | E2E 测试（Playwright/Cypress） | P2-5 | 未开始 | 持续 |

---

## 四、模块间交互关系图

### 4.1 全局数据流拓扑

```
                                物理世界
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              OEM 原始数据    港口运营数据    传感器实时数据
                    │              │              │
                    └──────────────┼──────────────┘
                                   │
                                   ▼
               ┌───────────────────────────────────┐
               │          感知域 (Perception)        │
               │                                    │
               │  协议适配 → RingBuffer → BPA+DS融合  │
               │  → 状态向量 + 数据质量评分            │
               │  → 单位换算 + 时间对齐               │
               └──────────────┬────────────────────┘
                              │ 状态向量 + 质量标签
                              ▼
               ┌───────────────────────────────────┐
               │          认知域 (Cognition)         │
               │                                    │
               │  HDE 双轨: 物理轨 + 数据轨          │
               │  → DS 融合 → 物理约束校验            │
               │  → 9 种故障假设 → 诊断结论           │
               │  → Grok Agent 自然语言推理           │
               └──────┬──────────────┬─────────────┘
                      │              │
              诊断结论 │              │ 校验请求
                      ▼              ▼
     ┌────────────────────┐  ┌──────────────────┐
     │ 护栏域 (Guardrail) │  │ 知识域 (Knowledge)│
     │                    │  │                  │
     │ 安全规则 + 健康规则  │  │ 因果链追踪       │
     │ 物理约束最终校验     │  │ 案例相似度       │
     │ → 通过/否决/调整    │  │ 图谱子图提取     │
     └────────┬───────────┘  └────────┬─────────┘
              │                       │
              │ 校验后诊断结论          │ KG 上下文
              ▼                       ▼
     ┌─────────────────────────────────────────┐
     │            进化域 (Evolution)             │
     │                                         │
     │  诊断结论 → 模式发现 → 知识结晶           │
     │  → 影子评估 → 冠军挑战者 → 灰度部署       │
     │  → 新规则/阈值反馈回 KG + 感知 + 认知     │
     └──────────────┬──────────────────────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    新规则更新   模型更新    KG 反哺
         │          │          │
         ▼          ▼          ▼
    护栏域更新  认知域更新  知识域更新
```

### 4.2 域间依赖顺序（必须遵循的开发顺序）

```
Level 0 (无依赖):
  感知域 ─── 独立数据采集
  知识域 ─── 独立图谱管理

Level 1 (依赖 Level 0):
  认知域 ─── 依赖感知域(状态向量) + 知识域(因果链)
  工具域 ─── 独立但为认知域提供工具调用

Level 2 (依赖 Level 1):
  护栏域 ─── 依赖认知域(诊断结论) 进行校验

Level 3 (依赖 Level 2):
  进化域 ─── 依赖认知域(诊断结论) + 护栏域(校验结果) + 知识域(图谱)

Level 4 (依赖 Level 3):
  管线域 ─── 编排上述所有域的 DAG 执行
  平台域 ─── 编排器+仪表盘，依赖所有域的 API
```

### 4.3 关键服务间调用关系（微服务拆分后）

| 调用方 → 被调用方 | 协议 | 场景 | 延迟要求 |
|-------------------|------|------|---------|
| 智能体诊断 → 算法服务 | gRPC | FFT/包络/BPFO 计算 | < 100ms |
| 智能体诊断 → AI 推理 | HTTP | Grok/LLM 推理 | < 30s |
| 自进化 → 智能体诊断 | HTTP | 读取诊断历史 | < 1s |
| 所有服务 → 配置中心 | HTTP+Redis | 配置读取 | < 10ms |
| 智能体诊断 → 自进化 | Kafka | `diagnosis.completed` 事件 | 异步 |
| 自进化 → 配置中心 | Kafka | `evolution.crystal.approved` | 异步 |

---

## 五、三类评价标准功能映射

### 5.1 代码质量标准 × 功能模块映射

| 维度 | 优秀标准 | 对应模块 | 当前状态 |
|------|---------|---------|---------|
| **类型覆盖** | 100% 导出接口有类型 | `shared/kgOrchestratorTypes.ts`, `hde/types/`, `algorithms/_core/types.ts` | 核心模块 Done，边缘模块有 `any` |
| **物理约束** | 所有输出经物理校验 | `perception/quality/data-quality-scorer.ts`, `hde/orchestrator/`, `cognition/engines/ds-fusion.engine.ts` | 评分器实现，诊断流需校验集成 |
| **错误处理** | 分层降级+日志+告警 | `core/llm.ts`(3 层降级), `evolution/labeling/grok-label-provider.ts`(3 层 AI 降级) | LLM 层完善，其他模块需加强 |
| **模块边界** | 严格单向依赖 | 8 域路由(`domains/`) + EventBus | 域路由已解耦，部分服务层有跨域引用 |

### 5.2 数据质量标准 × 数据管道映射

| 等级 | 评分 | 允许用途 | 管道节点 | 实现状态 |
|------|------|---------|---------|---------|
| A (>=90) | 可诊断 | 模型训练+诊断决策 | `data-quality-scorer.ts` → HDE 双轨 | 评分器完成，管道未打通 |
| B (>=75) | 趋势分析 | 趋势图表+人工确认诊断 | `data-quality-scorer.ts` → 数字孪生 | 评分器完成，标签传递缺失 |
| C (>=60) | 概览 | 仅统计概览 | `data-quality-scorer.ts` → 监控大屏 | 评分器完成，路由缺失 |
| D (>=40) | 排查 | 触发传感器排查工单 | `data-quality-scorer.ts` → 告警 | 未实现 |
| F (<40) | 不可用 | 触发现场检修工单 | `data-quality-scorer.ts` → 紧急告警 | 未实现 |

### 5.3 模块完成度标准 × 当前清单

| 等级 | 数量 | 典型模块 |
|------|------|---------|
| **Done** | ~15 | HDE 类型定义, Schema 文件, KG 类型, 数字孪生 Store, 文档体系 |
| **Partial** | ~60 | 49 算法, 认知引擎, 进化引擎, 感知层, 数字孪生前端, 大部分 API 路由 |
| **Stub** | ~5 | 工具域, 音频/视频感知 |
| **Planned** | ~10 | 联邦蒸馏实现, 应用平台前端, K8s 生产部署, E2E 测试 |

---

## 六、数据流完整路径

### 6.1 完整路径：从传感器到诊断结论

```
Step 1: 物理世界 → 协议适配
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
传感器信号 → MQTT/Modbus/OPC-UA/PROFINET
  → protocol-adapters/ (14 个适配器)
  → RingBuffer (边缘层缓冲)
  → BackpressureController (限流)

Step 2: 边缘层 → 汇聚层
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
原始采样 → unit-registry.ts (单位标准化)
  → multi-device-aligner.ts (跨设备时间对齐)
  → BPA Builder (基本概率赋值)
  → DS Fusion (多传感器证据融合)

Step 3: 汇聚层 → 平台层
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
融合结果 → data-quality-scorer.ts (质量评分)
  → 状态向量编码 (perception/encoding/)
  → conditionProfiles 匹配 (工况编码)
  → ClickHouse 写入 (时序存储)
  → Kafka 发布: sensor.data.ready

Step 4: 平台层 → 诊断
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
状态向量 → HDE DiagnosticOrchestrator

  物理轨:
    物理模型 → 能量约束 + 力学约束 + 材料约束
    → 物理轨 BPA (9 假设)

  数据轨:
    AlgorithmEngine.execute() (gRPC → 算法服务)
    → FFT + 包络 + BPFO/BPFI → 特征向量
    → IsolationForest / SPC 异常检测
    → 数据轨 BPA (9 假设)

  融合:
    DS Fusion Engine
    → Dempster (默认) / Murphy (高冲突) / Yager (极端)
    → 物理约束最终校验
    → DiagnosisConclusion

Step 5: 诊断 → 护栏
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DiagnosisConclusion → Guardrail 域
  → 安全规则校验 (能量/力/材料/时序/逻辑)
  → 健康规则校验
  → 通过 → 发布结论
  → 否决 → 标记 + 降级处理
  → 调整 → 修正置信度

Step 6: 诊断 → 知识
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DiagnosisConclusion → Knowledge 域
  → traceCausalChain() (因果链追溯)
  → 向量相似度搜索 (历史相似案例)
  → UNDER_CONDITION 关系匹配 (工况概率)
  → 丰富诊断结论上下文

Step 7: 诊断 → 进化
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kafka: diagnosis.completed
  → 自进化服务接收
  → 模式发现 (5 大物理模式)
  → 知识结晶 → 专家审核 → 规则/三元组/阈值
  → 影子评估 (5 维度: 准确性/异常/延迟/资源/安全)
  → 冠军挑战者 A/B 测试
  → 灰度部署 5 阶段 (0%→5%→20%→50%→100%)

Step 8: 进化 → 反馈闭环
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kafka: evolution.crystal.approved
  → 配置中心更新
  → Redis Pub/Sub: config.changed
  → 算法服务: 更新阈值/参数
  → 诊断服务: 更新融合策略
  → KG 注入: 新三元组 + Case 节点 + VALIDATES 关系
  → 标注更新: 自动标注上下文增强
```

### 6.2 应用平台数据流（只消费结论）

```
赋能平台 → 诊断结论 API → 应用平台

应用平台:
  Redis 缓存层 (TTL: 诊断结论 5min, 健康排名 1min, 告警 实时)
    │
    ├── 设备健康总览: GET /api/fleet/health-overview
    ├── 单设备诊断: GET /api/diagnosis/result/{deviceId}
    ├── 预警处置: GET /api/alerts/active
    └── 反馈: POST /api/alerts/{id}/acknowledge (→ 进化飞轮)

不暴露: 算法名称、模型参数、中间计算、融合权重、原始特征
```

---

## 七、开发优先级排序

### 7.1 总览

```
P0 (基础闭环)    ─── 7 周 ─── 平台可运行的最小完整路径
P1 (核心差异)    ─── 12 周 ── 三源融合+自进化+跨设备对比
P2 (生产就绪)    ─── 18 周 ── 微服务+应用平台+测试
P3 (增强能力)    ─── 12 周 ── 联邦蒸馏+可观测性+K8s
                              (与 P2 可并行)
```

### 7.2 优先级依赖甘特图

```
Week:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19
       ├───┤
P0-1   │编码│
       ├───────┤
P0-2   │感知管线│
       │   ├───┤
P0-3   │   │质量│
       │   ├───┤
P0-4   │   │KG │
       │       ├───────┤
P0-5   │       │HDE验证│
       │           ├───────┤
P1-1   │           │DS融合 │
       │           ├───────┤
P1-6   │           │工况归一│
       │               ├───────┤
P1-2   │               │标注闭环│
       │       ├───┤
P1-4   │       │横向│
       │           ├───────┤
P1-5   │           │孪生数据│
       │                   ├───────────┤
P1-3   │                   │进化飞轮MVP│
       │                               ├───────────────────┤
P2-1   │                               │微服务 Phase 0-1   │
       │                                           ├───────────────────────┤
P2-2   │                                           │微服务 Phase 2-3      │
```

### 7.3 优先级排序理由

| 优先级 | 理由 |
|--------|------|
| **P0** | 感知→诊断的端到端通路是验证所有其他模块的基础。没有数据流入和诊断输出，进化/标注/图谱全无意义。 |
| **P1** | DS 融合+进化飞轮+跨设备对比是平台核心竞争力（三源融合+自进化），必须在微服务拆分前验证业务逻辑正确。 |
| **P2** | 微服务拆分是生产部署的前提；应用平台是客户交付物；测试是质量保证。但在业务逻辑验证前拆分微服务是过早优化。 |
| **P3** | 联邦蒸馏、音视频感知等是能力增强而非核心闭环，可在 P1/P2 推进中逐步补充。 |

---

## 八、P0/P1 模块具体开发任务与验收标准

### P0-1: 统一编码注册表实现

**前置依赖**: 无（P0 起点，为其他所有 P0 模块提供编码基础）

**目标**: 4 类编码（设备/部件/故障/工况）的 seed data 入库 + 校验服务

**开发任务**:

1. 创建 `server/platform/knowledge/seed-data/encoding-seed.ts`，包含 4 类编码的初始有效值
2. 编写 seed 脚本将编码值写入 `baseDictCategories` + `baseDictItems`
3. 创建 `server/platform/knowledge/services/encoding-validator.ts`，提供编码格式校验 + 有效值校验
4. 将编码校验集成到设备创建/故障记录/工况切换流程

**验收标准**:
- [ ] 4 个 `baseDictCategory` 记录创建成功：`ENCODING_DEVICE`, `ENCODING_COMPONENT`, `ENCODING_FAULT`, `ENCODING_CONDITION`
- [ ] 设备编码校验：`PORT.STS.ZPMC.STS-65t.SN20240001` → 通过；`port.sts` → 拒绝（小写）
- [ ] 故障编码校验：`MECH.BEARING_WEAR.MAJOR` → 通过；`MECH.BEARING_WEAR.SEVERE` → 拒绝（无效严重程度）
- [ ] 工况编码校验：`HOIST.FULL_LOAD.HIGH_WIND` → 通过
- [ ] 正则匹配所有 4 类编码格式（附录 A 中定义的正则）
- [ ] 端到端集成测试：创建设备+部件+故障+工况编码 → 全部通过格式校验+有效值校验 → 写入字典表 → 通过 API 查询返回正确结果，全链路 < 500ms

---

### P0-2: 感知管线端到端打通

**前置依赖**: P0-1（统一编码注册表 — 状态向量需携带标准设备编码）

**目标**: 从协议采集到状态向量输出的完整数据通路

**开发任务**:

1. 创建 `server/platform/perception/pipeline-orchestrator.ts`，编排：协议适配 → RingBuffer → BPA → DS 融合 → 状态向量
2. 集成 `unit-registry.ts` 到管线入口（采集后立即标准化）
3. 集成 `multi-device-aligner.ts` 到 BPA 之前（多设备时间对齐）
4. 实现状态向量写入 ClickHouse 的 sink
5. 实现 Kafka `sensor.data.ready` 发布

**验收标准**:
- [ ] `pnpm check` 零新增 TypeScript 错误
- [ ] 模拟 MQTT 消息 → 管线处理 → 状态向量 JSON 输出，字段完整（设备编码/通道值/质量标签/时间戳）
- [ ] 单位换算正确：输入 `2.5 g` → 输出 `24.525 m/s²`
- [ ] 跨设备对齐误差 < 1 个采样周期（±1/fs 秒）
- [ ] 长缺口（>10x 采样周期）标记为 `quality: 'gap'`，不插值
- [ ] 管线 5 秒内处理 1000 个测点的单次批量
- [ ] 端到端集成测试：模拟 MQTT 消息 → 协议适配 → 单位换算 → 时间对齐 → BPA → DS 融合 → 状态向量输出 → ClickHouse 写入 → Kafka 发布 sensor.data.ready，全链路 < 5s（1000 测点）

---

### P0-3: 数据质量评分集成

**前置依赖**: P0-2（感知管线 — 评分器嵌入管线输出阶段）

**目标**: 数据质量评分嵌入感知管线，质量标签随数据流转

**开发任务**:

1. 在 pipeline-orchestrator 的输出阶段调用 `DataQualityScorer.score()`
2. 质量评分写入 ClickHouse `quality_score` 列
3. 质量标签（A/B/C/D/F）附加到状态向量 metadata
4. 为 `unit-registry`、`multi-device-aligner`、`data-quality-scorer` 编写单元测试

**验收标准**:
- [ ] `pnpm test` 通过三个模块各 10+ 个测试用例
- [ ] 完整度测试：5 类传感器全有 → `completeness = 1.0`；缺 2 类 → `completeness = 0.6`
- [ ] 准确度测试：传感器健康(30%)+连续性(25%)+一致性(20%)+物理合理性(25%) 权重正确
- [ ] 综合评分 = `完整度×0.4 + 准确度×0.6`，数值验证精确到小数点后 2 位
- [ ] 评分 < 75 的数据自动标记 `labelStatus = 'needs_review'`
- [ ] 端到端集成测试：状态向量输入 → 质量评分计算 → 质量标签(A/B/C/D/F)附加到 metadata → ClickHouse 写入 quality_score 列 → 评分 < 75 自动标记 needs_review，与感知管线同步完成无额外延迟

---

### P0-4: 知识图谱基础实例化

**前置依赖**: P0-1（统一编码注册表 — 图谱节点需使用标准编码）

**目标**: Condition 和 Case 节点类型 + 3 新关系 + 种子数据

**开发任务**:

1. 扩展 `neo4j.storage.ts`：添加 Condition 和 Case 节点的 CRUD
2. 扩展 `neo4j.storage.ts`：添加 UNDER_CONDITION, VALIDATES, SHARED_COMPONENT 关系
3. 添加 Neo4j 约束和索引（附录 B 中定义的 DDL）
4. 扩展 `kgOrchestratorTypes.ts`：添加 `'condition'`, `'case'` 节点类型 + 3 新关系类型
5. 导入 GJM12 种子数据（`cypher_init.cql`）

**验收标准**:
- [ ] Cypher 创建 Condition 节点成功：`MATCH (c:Condition {encoding: 'HOIST.FULL_LOAD.HIGH_WIND'}) RETURN c` 返回 1 条
- [ ] Cypher 创建 Case 节点成功：`MATCH (cs:Case) RETURN count(cs)` > 0
- [ ] UNDER_CONDITION 关系：`(Fault)-[:UNDER_CONDITION {probability: 0.35}]->(Condition)` 可查询
- [ ] VALIDATES 关系：`(Case)-[:VALIDATES {outcome: 'confirmed'}]->(Fault)` 可查询
- [ ] SHARED_COMPONENT 关系：跨设备共享部件查询返回正确结果
- [ ] `KGRelationType` 联合类型从 12 扩展到 15，`pnpm check` 无报错
- [ ] 复杂查询测试：给定设备+工况，返回故障列表及历史案例（§3.6 的 Cypher）
- [ ] 端到端集成测试：编码种子数据导入 → Neo4j Condition+Case 节点创建 → 3 类关系建立 → 复杂 Cypher 查询（设备+工况→故障列表+历史案例）返回正确结果，全链路 < 2s

---

### P0-5: HDE 双轨诊断端到端验证

**前置依赖**: P0-2（感知管线 — 提供状态向量输入）, P0-3（数据质量 — 质量标签影响诊断置信度）

**目标**: 单设备从状态向量到诊断结论的完整双轨诊断

**开发任务**:

1. 创建端到端测试脚本：生成模拟状态向量 → 调用 HDE 编排器 → 验证输出
2. 确保物理轨正确：能量约束+力学约束+材料约束 → 物理轨 BPA
3. 确保数据轨正确：AlgorithmEngine 执行 FFT+包络 → 数据轨 BPA
4. 确保 DS 融合正确：物理轨 BPA + 数据轨 BPA → 融合 → 9 假设置信度
5. 确保物理约束最终校验：诊断结论通过物理约束

**验收标准**:
- [ ] 正常设备状态向量 → 诊断结论 `severity: 'normal'`, `confidence >= 0.8`
- [ ] 轴承磨损模拟（BPFO 频率幅值 3x 基线）→ 诊断结论包含 `bearing_damage`
- [ ] 物理约束否决测试：数据轨输出 `振动值 = -5 mm/s` → 物理轨否决，结论不含此异常
- [ ] DS 融合冲突测试：物理轨和数据轨对同一假设置信度相差 > 0.7 → 自动切换 Murphy 策略
- [ ] 诊断耗时 < 5 秒（单设备 16 通道）
- [ ] `hde_diagnosis_sessions` 表写入记录，包含完整的物理轨+数据轨+融合结果
- [ ] 端到端集成测试：模拟状态向量 → 物理轨+数据轨并行执行 → DS 融合 → 物理约束校验 → 诊断结论写入 hde_diagnosis_sessions → Kafka 发布 diagnosis.completed，单设备 16 通道全链路 < 5s

---

### P1-1: DS 融合引擎端到端验证

**目标**: 多源证据 → DS 融合 → 物理约束校验的完整闭环

**开发任务**:

1. 创建 `tests/integration/ds-fusion-e2e.test.ts`
2. 构造多源证据场景：振动证据+温度证据+电流证据 → 3 个 BPA
3. 测试 Dempster 规则融合（正常场景）
4. 测试 Murphy 改进规则（高冲突 > 0.7 场景）
5. 测试 Yager 规则（极端冲突 > 0.95 场景）
6. 测试 `physics_veto` 策略：物理轨否决数据轨结论

**验收标准**:
- [ ] 3 源证据一致指向 `bearing_damage` → 融合后 `belief(bearing_damage) >= 0.8`
- [ ] 2 源冲突（轴承损坏 vs 正常）→ 自动切换 Murphy 策略，冲突度 K 输出正确
- [ ] `physics_veto` 测试：数据轨置信度 0.9 但违反能量守恒 → 最终结论不含该假设
- [ ] 融合结果 9 假设的 belief 之和 + uncertainty = 1.0（概率完备性）
- [ ] 融合日志写入 `hde_fusion_logs` 表，包含每步融合的 BPA 变化

---

### P1-2: 自动标注管线闭环

**目标**: 3 层 AI 降级标注 → 审核 → 入库的完整流程

**开发任务**:

1. 集成 `GrokLabelProvider` → `AutoLabelingPipeline` → `dataSlices` 写入
2. 实现 3 层降级：Grok 可用→用 Grok；不可用→LLM；全失败→规则矩阵
3. 实现置信度分级：>=0.85 自动入库；0.6~0.85 人工确认；<0.6 人工标注
4. 实现标注审核流程状态机：`auto_only` → `pending` → `approved`/`rejected`
5. 审核通过后 → `KGEvolutionService.extractFromDiagnosis()` 反哺图谱

**验收标准**:
- [ ] Grok 可用时：标注输出包含 `rootCause`(引用故障编码) + `severity` + `confidence`
- [ ] Grok 不可用时：自动降级到 LLM，日志记录降级原因
- [ ] LLM 也不可用时：降级到规则矩阵，置信度范围 0.6~0.82
- [ ] 置信度 0.92 的标注 → `dataSlices.labelStatus = 'approved'`（自动入库）
- [ ] 置信度 0.72 的标注 → `dataSlices.labelStatus = 'pending'`（待人工确认）
- [ ] 审核通过的标注 → Neo4j 新增 Case 节点 + VALIDATES 关系
- [ ] `dataSliceLabelHistory` 写入审计记录，包含 `oldValue`/`newValue`/`changedBy`/`reason`

---

### P1-3: 进化飞轮 MVP

**目标**: 完成知识结晶→影子评估→灰度部署的一轮完整迭代

**开发任务**:

1. 持久化 `ChampionChallengerManager` 状态到 Redis（活跃计划）+ MySQL（历史）
2. 持久化 `CrystalService` 到 MySQL `hde_knowledge_crystals` 表
3. 串联：诊断结论(Kafka) → 模式发现 → 知识结晶 → 审核 → 影子评估 → 灰度第一阶段(Shadow 0%)
4. 实现影子评估 5 维度指标计算（准确性/异常检测/延迟/资源/安全）
5. 实现晋升逻辑：>=3 维度改善+0 退化 → 晋升

**验收标准**:
- [ ] 10 条诊断历史 → 模式发现输出至少 1 个物理模式（5 大模式之一）
- [ ] 知识结晶创建成功：`hde_knowledge_crystals` 表有记录，`status = 'draft'`
- [ ] 结晶审核通过后 `status = 'approved'`，自动触发影子评估
- [ ] 影子评估输出 5 维度指标，每个维度有明确的 improve/degrade/neutral 判定
- [ ] 灰度 Shadow 阶段(0% 流量)持续 24h，无错误 → 自动推进到 Canary(5%)
- [ ] 回滚测试：Canary 阶段错误率 > 5% → 自动回滚到 Shadow
- [ ] `ChampionChallengerManager` 状态重启后从 Redis 恢复，不丢失

---

### P1-4: 跨设备横向对比

**目标**: 基于 SHARED_COMPONENT 图谱关系的跨设备故障传播预警

**开发任务**:

1. 实现 `SHARED_COMPONENT` 关系自动发现（同型号+制造商的设备）
2. 扩展 `cross-device-comparator.ts`：利用图谱查询共享部件故障
3. 实现"同型号部件故障传播预警"：A 设备轴承故障 → 预警 B 设备同型号轴承
4. 前端展示跨设备对比结果

**验收标准**:
- [ ] 2 台 STS 共享 SKF 6310 轴承 → 自动创建 `SHARED_COMPONENT` 关系
- [ ] 设备 A 诊断 `bearing_damage` → 查询返回设备 B 同型号部件及其健康状态
- [ ] Cypher 查询（§3.6 跨设备故障传播）在 < 500ms 内返回结果
- [ ] 前端横向对比页面展示：共享部件列表、对应故障历史、预警状态

---

### P1-5: 数字孪生实时数据接入

**目标**: 替换客户端演示数据，接入真实传感器波形

**开发任务**:

1. 新增 tRPC 端点：`getEquipmentWaveform(equipmentId, sensorId, timeRange)` 从 ClickHouse 查询原始波形
2. 前端 `SensorChartDialog.tsx` 支持实时数据模式（保留演示数据作为降级）
3. 3D 视图的传感器颜色根据实时 `getEquipmentTwinState` 数据更新
4. 实现 WebSocket 推送传感器实时值（5s 间隔）

**验收标准**:
- [ ] tRPC 端点返回 12,800 Hz 采样率的 2048 点波形数据（ClickHouse 查询 < 1s）
- [ ] 频谱图/包络谱基于真实波形渲染，BPFO/BPFI 标注线位置正确
- [ ] ClickHouse 不可用时自动降级到客户端演示波形，UI 显示"演示数据"标签
- [ ] 3D 视图 16 个传感器颜色实时更新，刷新间隔 5s，无闪烁

---

### P1-6: 工况归一化端到端

**目标**: 工况自动识别→编码→归一化→标准基线

**开发任务**:

1. 实现工况自动识别：基于负载/转速/环境参数匹配 `conditionProfiles`
2. 自动生成工况编码（3 级）并写入 `conditionInstances`
3. 调用 `condition_normalization` 算法消除工况影响
4. 输出标准化健康指标（与工况无关的设备本征状态）

**验收标准**:
- [ ] 满载大风工况 → 自动识别编码 `HOIST.FULL_LOAD.HIGH_WIND`
- [ ] 工况切换记录写入 `conditionInstances` 表，含 `stateSnapshot` JSON
- [ ] 归一化后：同一设备在不同工况下的健康指标偏差 < 5%
- [ ] 空载 vs 满载：归一化前振动值差 30%+，归一化后差 < 5%
- [ ] Condition 节点自动创建并关联到 KG

---

## 附录 A: 代码库规模统计

| 类别 | 文件数 | 代码行数 |
|------|--------|---------|
| 算法引擎 (49 个) | ~60 | ~11,000 |
| DSP 底层函数 (66 个) | 1 | ~1,200 |
| 平台基础设施 | ~30 | ~5,000 |
| 认知引擎 | ~15 | ~3,500 |
| 进化引擎 | ~12 | ~3,000 |
| HDE 双轨 | ~8 | ~2,000 |
| 感知层 | ~10 | ~3,000 |
| 知识图谱 | ~8 | ~2,500 |
| 数字孪生前端 | ~20 | ~4,000 |
| 数据库 Schema | 3 | ~3,500 |
| API 路由 | 33 | ~8,000 |
| 前端页面 | ~80 | ~15,000 |
| **合计** | **~280** | **~61,700** |

## 附录 B: 技术栈版本锁定

| 技术 | 版本 | 锁定原因 |
|------|------|---------|
| React | 19.x | 最新稳定 |
| TypeScript | 5.9.x | 严格模式 |
| Vite | 7.x | HMR 性能 |
| tRPC | 11.x | 端到端类型安全 |
| Drizzle ORM | 0.44.x | Schema 兼容 |
| Three.js | 0.183.x | 三维渲染 |
| Chart.js | 已安装 | 图表库 |
| Wouter | 3.x | 轻量路由 |
| Zustand | 5.x | 状态管理 |
| Pino | latest | 高性能日志 |

## 附录 C: 关键路径风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| ClickHouse 不可用 | 无时序数据 → 诊断无输入 | 降级到 MySQL 近期数据查询 |
| Neo4j 不可用 | 知识图谱查询失败 | 内存 KG 引擎降级运行 |
| Grok API 超时 | AI 标注延迟 | 3 层降级：Grok→LLM→规则矩阵 |
| Kafka 不可用 | 事件丢失 | 本地队列+重试+降级同步调用 |
| 微服务拆分复杂度 | 开发周期超预期 | Strangler Fig 渐进式迁移，每步可回滚 |

---

> **文档维护**: 本文档随项目迭代更新。重大变更需在 `CLAUDE.md` §8 记录 ADR。每日进展记录在 `docs/daily/` 中。
