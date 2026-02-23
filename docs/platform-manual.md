# 西联智能平台（洗炼平台）技术说明文档

> **文档编号**：XLP-MANUAL-001  
> **版本**：v1.0  
> **编制日期**：2026-02-24  
> **适用范围**：西联智能平台全模块  
> **编制**：Manus AI

---

## 目录

1. [平台概述](#一平台概述)
2. [技术架构](#二技术架构)
3. [底层技术栈](#三底层技术栈)
4. [数据库设计](#四数据库设计)
5. [插件引擎](#五插件引擎)
6. [安全机制](#六安全机制)
7. [感知层](#七感知层)
8. [认知推理层](#八认知推理层)
9. [进化引擎](#九进化引擎)
10. [知识管理](#十知识管理)
11. [数字孪生](#十一数字孪生)
12. [智能诊断](#十二智能诊断)
13. [平台管理](#十三平台管理)
14. [前端导航与页面](#十四前端导航与页面)
15. [部署与运维](#十五部署与运维)
16. [测试体系](#十六测试体系)
17. [附录](#十七附录)

---

## 一、平台概述

### 1.1 平台定位

西联智能平台（内部代号"洗炼平台"）是一套面向工业物联网场景的 **AI 驱动自进化赋能平台**。平台以"感知—认知—进化"三层闭环为核心理念，将工业设备数据采集、多源融合诊断、知识图谱推理、模型自动训练与部署整合为统一的技术底座，为上层业务应用提供开箱即用的智能化能力。

平台的核心设计哲学是 **"自进化"**：不仅提供静态的诊断和分析工具，更通过进化引擎（Evolution Engine）实现模型的自动评估、竞争、部署和知识沉淀，形成数据驱动的持续改进飞轮。

### 1.2 核心能力

平台提供以下六大核心能力：

| 能力域 | 核心功能 | 技术亮点 |
|---|---|---|
| **感知采集** | 多协议数据采集、自适应采样、DS 证据融合 | 18 种协议适配器、环形缓冲区、BPA 构建器 |
| **认知推理** | 因果图推理、经验池匹配、物理验证、混合编排 | Grok 大模型集成、世界模型、数字孪生 |
| **进化引擎** | 影子评估、冠军-挑战者、金丝雀部署、飞轮编排 | 统计显著性检验、自动晋升、渐进式部署 |
| **知识管理** | 知识图谱、知识结晶、迁移学习、模型仓库 | Neo4j 图数据库、向量检索、知识蒸馏 |
| **智能诊断** | 融合诊断、Grok Agent 诊断、诊断报告生成 | DS 证据理论、多维度融合、自动报告 |
| **平台管理** | 插件引擎、Pipeline 编排、安全运维、基础设施监控 | 三层沙箱隔离、DAG 编排、Vault 密钥管理 |

### 1.3 代码规模

截至 2026 年 2 月 24 日，平台代码规模如下：

| 指标 | 数量 |
|---|---|
| TypeScript/TSX 源文件 | 685 个 |
| 代码总行数 | 256,662 行 |
| SQL 脚本行数 | 10,352 行 |
| 后端文件（server/） | 443 个 |
| 前端文件（client/） | 220 个 |
| 数据库表 | 171 张 |
| tRPC API 路由 | 30+ 个 |
| Domain 路由 | 8 个域 |
| 协议适配器 | 18 种 |
| 测试文件 | 26 个（400+ 测试用例） |

---

## 二、技术架构

### 2.1 整体架构

平台采用 **三层分离架构**（Platform → Operations → Business），将底层平台能力、运维配置和业务逻辑解耦：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          前端交互层 (React 19)                           │
│  Dashboard │ 知识库 │ 数据中心 │ 模型中心 │ 算法库 │ 诊断 │ 进化 │ 设置  │
├─────────────────────────────────────────────────────────────────────────┤
│                        tRPC API 网关层                                   │
│  30+ API Router │ 8 Domain Router │ 统一认证 │ 限流 │ 熔断 │ 审计       │
├─────────────────────────────────────────────────────────────────────────┤
│                     业务层 (Business Layer)                              │
│  遥测服务 │ 监控路由 │ 业务定制逻辑                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                     平台层 (Platform Layer)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ 感知层    │  │ 认知层    │  │ 进化层    │  │ 知识层    │               │
│  │Perception│  │Cognition │  │Evolution │  │Knowledge │               │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ 中间件    │  │ 编排器    │  │ 工具框架  │  │ 服务注册  │               │
│  │Middleware│  │Orchestra │  │ Tooling  │  │ Registry │               │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘               │
├─────────────────────────────────────────────────────────────────────────┤
│                     基础设施层 (Infrastructure)                           │
│  MySQL │ Redis │ ClickHouse │ Kafka │ Neo4j │ Qdrant │ MinIO │ ES     │
│  Prometheus │ Grafana │ Jaeger │ Vault │ Docker                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
xilian-platform/
├── client/                    # 前端 React 应用
│   ├── src/
│   │   ├── components/        # 可复用 UI 组件（shadcn/ui）
│   │   ├── config/            # 导航配置
│   │   ├── hooks/             # 自定义 React Hooks
│   │   ├── pages/             # 页面组件（按功能域分组）
│   │   ├── services/          # 前端服务（OCR、降维、文档解析）
│   │   ├── stores/            # Zustand 状态管理
│   │   └── types/             # TypeScript 类型定义
│   └── public/                # 静态资源
├── server/                    # 后端服务
│   ├── api/                   # tRPC API 路由（30+ 个）
│   ├── business/              # 业务层（遥测、监控）
│   ├── core/                  # 核心框架（配置、日志、认证、tRPC）
│   ├── domains/               # 域路由（8 个域）
│   ├── jobs/                  # 定时任务
│   ├── lib/                   # 底层库（DB、缓存）
│   ├── platform/              # 平台层（感知、认知、进化、知识、中间件）
│   ├── services/              # 服务层（插件、协议、特征提取、数据库）
│   └── shared/                # 共享常量和工具
├── drizzle/                   # Drizzle ORM Schema（5,369 行）
├── docker/                    # Docker 配置
│   ├── mysql/init/            # DDL + Seed 脚本（11 个文件）
│   ├── clickhouse/            # ClickHouse 初始化
│   ├── kafka-connect/         # Kafka Connect 配置
│   ├── prometheus/            # Prometheus 配置
│   ├── grafana/               # Grafana 仪表盘
│   ├── vault/                 # Vault 密钥管理
│   └── ...                    # 其他基础设施配置
├── shared/                    # 前后端共享类型
├── sdk/                       # TypeScript SDK
├── scripts/                   # 运维脚本
├── docs/                      # 文档
└── docker-compose.yml         # 全栈一键部署
```

### 2.3 Domain Router 架构

平台采用 **领域驱动设计（DDD）**，将业务逻辑组织为 8 个独立域，每个域拥有独立的路由、服务和数据模型：

| 域 | 路由文件 | 职责 |
|---|---|---|
| **Perception** | `perception.domain-router.ts` | 感知层数据采集、BPA 构建、DS 融合、状态向量 |
| **Cognition** | `cognition.domain-router.ts` | 认知推理、因果图、经验池、混合编排 |
| **Evolution** | `evolution.domain-router.ts` | 进化引擎、影子评估、冠军-挑战者、金丝雀 |
| **Knowledge** | `knowledge.domain-router.ts` | 知识图谱、知识结晶、迁移学习 |
| **Guardrail** | `guardrail.domain-router.ts` | 安全护栏、规则引擎、效果分析 |
| **Pipeline** | `pipeline.domain-router.ts` | Pipeline DAG 编排、孪生配置 |
| **Tooling** | `tooling.domain-router.ts` | 工具框架、内置工具、工具沙箱 |
| **Platform** | `platform.domain-router.ts` | 平台管理、配置中心、服务注册 |

---

## 三、底层技术栈

### 3.1 后端技术

| 技术 | 版本 | 用途 |
|---|---|---|
| **Node.js** | 22.13.0 | 运行时环境 |
| **TypeScript** | 5.9.3 | 类型安全的开发语言 |
| **Express** | 4.21.2 | HTTP 服务器框架 |
| **tRPC** | 11.10.0 | 端到端类型安全的 API 框架 |
| **Drizzle ORM** | 0.44.5 | 类型安全的 ORM，支持 MySQL |
| **Zod** | 4.1.12 | 运行时数据校验 |
| **KafkaJS** | 2.2.4 | Kafka 消息队列客户端 |
| **IORedis** | 5.9.2 | Redis 客户端（缓存、分布式锁） |
| **Prom-client** | 15.1.3 | Prometheus 指标采集 |
| **OpenTelemetry** | 2.5.x | 分布式追踪和可观测性 |
| **Helmet** | 8.1.0 | HTTP 安全头 |
| **Jose** | 6.1.0 | JWT 认证 |
| **Opossum** | 9.0.0 | 熔断器模式 |
| **Redlock** | 5.0.0 | 分布式锁 |

### 3.2 前端技术

| 技术 | 版本 | 用途 |
|---|---|---|
| **React** | 19.2.1 | UI 框架 |
| **Vite** | 7.3.1 | 构建工具和开发服务器 |
| **TailwindCSS** | 4.1.14 | 原子化 CSS 框架 |
| **shadcn/ui** | — | 基于 Radix UI 的组件库 |
| **Wouter** | 3.3.5 | 轻量级路由 |
| **Zustand** | 5.0.11 | 状态管理 |
| **TanStack Query** | 5.90.2 | 服务端状态管理和缓存 |
| **Recharts** | 2.15.2 | 数据可视化图表 |
| **Chart.js** | 4.5.1 | 图表库 |
| **Lucide React** | 0.453.0 | 图标库 |
| **Tesseract.js** | 7.0.0 | 浏览器端 OCR |

### 3.3 基础设施

| 组件 | 用途 | 部署方式 |
|---|---|---|
| **MySQL** | 主数据库（171 张表） | Docker |
| **Redis** | 缓存、分布式锁、会话 | Docker |
| **ClickHouse** | 时序数据存储、遥测分析 | Docker |
| **Kafka** | 消息队列、事件驱动 | Docker |
| **Neo4j** | 知识图谱存储 | Docker |
| **Qdrant** | 向量数据库（语义检索） | Docker |
| **MinIO** | 对象存储（文件、模型） | Docker |
| **Elasticsearch** | 全文检索（可选） | Docker (bigdata profile) |
| **Prometheus** | 指标采集和告警 | Docker (monitoring profile) |
| **Grafana** | 可视化监控仪表盘 | Docker (monitoring profile) |
| **Jaeger** | 分布式链路追踪 | Docker (monitoring profile) |
| **HashiCorp Vault** | 密钥管理 | Docker (security profile) |
| **Apache Flink** | 流计算（可选） | Docker (bigdata profile) |
| **Apache Airflow** | 工作流编排（可选） | Docker (bigdata profile) |

### 3.4 通信协议

平台内置 **18 种工业协议适配器**，覆盖主流工业通信标准：

| 类别 | 协议 | 适配器文件 |
|---|---|---|
| **工业现场总线** | OPC UA、Modbus、PROFINET、EtherCAT、EtherNet/IP | `opcua.adapter.ts` 等 |
| **消息中间件** | MQTT、Kafka、WebSocket | `mqtt.adapter.ts` 等 |
| **数据库** | MySQL、PostgreSQL、ClickHouse、InfluxDB、Neo4j、Qdrant | `mysql.adapter.ts` 等 |
| **通用协议** | HTTP/REST、gRPC | `http.adapter.ts`、`grpc.adapter.ts` |
| **对象存储** | MinIO (S3 兼容) | `minio.adapter.ts` |
| **缓存** | Redis | `redis.adapter.ts` |

每个适配器继承自统一的 `BaseProtocolAdapter` 基类，提供标准化的连接管理、健康检查和指标采集接口。

---

## 四、数据库设计

### 4.1 总体概况

平台使用 MySQL 作为主数据库，共 **171 张表**，分布在 11 个 DDL 脚本文件中。Drizzle ORM 提供类型安全的数据访问层，Schema 定义共 5,369 行。

| DDL 文件 | 表数量 | 覆盖范围 |
|---|---|---|
| `01-base-ddl.sql` | 121 | 基础业务表（设备、传感器、知识、模型、算法、诊断等） |
| `02-v5-ddl.sql` | 24 | v5.0 深度进化扩展（感知、认知、推理、护栏等） |
| `03-evolution-ddl.sql` | 15 | 进化引擎（影子评估、金丝雀、飞轮、Agent 等） |
| `04-twin-config-ddl.sql` | 4 | 数字孪生配置（仿真场景、世界模型等） |
| `09-phase4-ddl.sql` | 3 | Phase 4 扩展（护栏效果日志、结晶应用、迁移记录） |
| `11-evo-loop-ddl.sql` | 4 | 进化闭环（自动化规则、飞轮日志、模型注册、部署计划） |

### 4.2 核心表域划分

数据库表按业务域划分为以下 11 个域：

| 域 | 代表性表 | 说明 |
|---|---|---|
| **设备管理** | `devices`、`sensors`、`device_groups`、`device_templates` | 设备台账、传感器、分组、模板 |
| **数据采集** | `data_slices`、`data_labels`、`data_pipelines` | 数据切片、标注、管线 |
| **知识管理** | `knowledge_bases`、`knowledge_documents`、`knowledge_vectors` | 知识库、文档、向量 |
| **模型管理** | `models`、`model_versions`、`model_training_jobs` | 模型、版本、训练任务 |
| **算法库** | `algorithms`、`algorithm_executions`、`algorithm_templates` | 算法定义、执行记录、模板 |
| **诊断引擎** | `diagnosis_rules`、`diagnosis_reports`、`diagnosis_sessions` | 诊断规则、报告、会话 |
| **进化引擎** | `evolution_shadow_evaluations`、`evolution_canary_deployments`、`evolution_flywheel_cycles` | 影子评估、金丝雀、飞轮 |
| **认知推理** | `cognition_sessions`、`causal_graphs`、`experience_pool` | 认知会话、因果图、经验池 |
| **基础配置** | `dictionaries`、`organizations`、`system_configs` | 字典、组织、系统配置 |
| **安全审计** | `audit_logs`、`audit_logs_sensitive`、`guardrail_rules` | 审计日志、敏感操作、护栏规则 |
| **数字孪生** | `twin_configs`、`twin_simulations`、`twin_scenarios` | 孪生配置、仿真、场景 |

### 4.3 Drizzle ORM Schema

平台使用 Drizzle ORM 管理数据库访问，Schema 文件包括：

| 文件 | 行数 | 内容 |
|---|---|---|
| `drizzle/schema.ts` | 3,115 | 主 Schema（基础表 + v5 扩展表） |
| `drizzle/relations.ts` | 486 | 表关系定义 |
| `drizzle/evolution-schema.ts` | 1,768 | 进化引擎专属 Schema |

所有表定义均使用 Drizzle 的 `mysqlTable` 函数，支持完整的类型推导。每张表自动生成 `Insert` 和 `Select` 类型，确保前后端数据传输的类型安全。

### 4.4 数据库服务层

平台在 `server/services/database/` 下提供 18 个数据库服务文件，按业务域封装 CRUD 操作：

| 服务文件 | 职责 |
|---|---|
| `asset.service.ts` | 资产管理（设备、传感器、部件） |
| `config.service.ts` | 基础配置（字典、组织、系统配置） |
| `data.service.ts` | 数据管理（切片、标注、清洗） |
| `device.db.service.ts` | 设备专属操作 |
| `diagnosis.db.service.ts` | 诊断数据操作 |
| `edge.db.service.ts` | 边缘节点数据 |
| `governance.db.service.ts` | 数据治理 |
| `knowledge.db.service.ts` | 知识库操作 |
| `message.db.service.ts` | 消息和通知 |
| `model.db.service.ts` | 模型管理操作 |
| `ops.db.service.ts` | 运维数据 |
| `plugin.db.service.ts` | 插件数据 |
| `schedule.db.service.ts` | 调度任务 |
| `storageHealth.service.ts` | 存储健康检查 |
| `telemetry.db.service.ts` | 遥测数据 |
| `topo.db.service.ts` | 拓扑数据 |
| `workbench.service.ts` | 数据库工作台 |
| `restBridge.ts` | REST API 桥接 |

---

## 五、插件引擎

### 5.1 架构概述

插件引擎是平台可扩展性的核心，允许第三方开发者以标准化方式扩展平台能力。引擎由四个核心模块组成，总计 **3,296 行**代码：

| 模块 | 文件 | 行数 | 职责 |
|---|---|---|---|
| **插件引擎** | `plugin.engine.ts` | 801 | 插件加载、生命周期管理、依赖解析 |
| **安全沙箱** | `plugin.sandbox.ts` | 1,056 | 三层隔离执行环境 |
| **安全策略** | `plugin.security.ts` | 814 | 安装审查、运行时策略、信任等级 |
| **清单规范** | `plugin.manifest.ts` | 625 | 清单校验、签名验证、权限定义 |

### 5.2 插件类型

平台支持 7 种插件类型，覆盖数据处理全链路：

| 类型 | 标识 | 用途 |
|---|---|---|
| **数据源** | `source` | 新增数据采集通道 |
| **处理器** | `processor` | 数据转换和加工 |
| **输出端** | `sink` | 数据输出到外部系统 |
| **分析器** | `analyzer` | 数据分析和挖掘 |
| **可视化** | `visualizer` | 自定义可视化组件 |
| **集成** | `integration` | 第三方系统集成 |
| **工具** | `utility` | 通用工具和辅助功能 |

### 5.3 三层沙箱隔离

插件沙箱采用 **三层隔离架构**，确保插件运行安全：

| 层级 | 隔离机制 | 说明 |
|---|---|---|
| **L1** | Worker Threads | Node.js 原生进程隔离，每个插件运行在独立线程 |
| **L2** | VM Context | `vm.createContext` 受限上下文，限制全局变量访问 |
| **L3** | 权限网关 | API 调用审计 + 资源计量，拦截未授权操作 |
| **L0（可选）** | gVisor/Kata | 生产环境系统级隔离（容器级别） |

### 5.4 信任等级

插件安全策略引擎定义了 5 个信任等级，每个等级对应不同的权限策略：

| 信任等级 | 签名要求 | 自动审批 | 最大权限数 | 允许高风险 | 网络访问 |
|---|---|---|---|---|---|
| `untrusted` | 必须 | 否 | 3 | 否 | 否 |
| `basic` | 必须 | 否 | 5 | 否 | 受限 |
| `verified` | 必须 | 是 | 10 | 否 | 是 |
| `trusted` | 可选 | 是 | 20 | 是 | 是 |
| `system` | 免检 | 是 | 无限 | 是 | 是 |

### 5.5 插件生命周期

每个插件遵循标准化的生命周期：`installed → enabled → disabled → uninstalled`，支持以下生命周期钩子：

- **onInstall()**：安装时执行初始化（创建数据库表、注册路由等）
- **onEnable()**：启用时激活功能
- **onDisable()**：禁用时暂停功能（保留数据）
- **onUninstall()**：卸载时清理资源
- **onConfigChange()**：配置变更时热更新
- **healthCheck()**：定期健康检查

### 5.6 插件上下文

每个插件在执行时获得受限的上下文对象，包含：

- **config**：插件配置（只读）
- **logger**：受限日志记录器（info/warn/error/debug）
- **services.http**：受限 HTTP 客户端（遵循网络策略）
- **services.storage**：键值存储（隔离命名空间）
- **services.events**：事件总线（受限主题）

---

## 六、安全机制

### 6.1 安全架构总览

平台安全机制覆盖 **传输安全、访问控制、数据保护、运行时防护、审计追溯** 五个层面，中间件层总计 **3,806 行**代码：

| 中间件 | 文件 | 行数 | 职责 |
|---|---|---|---|
| **审计日志** | `auditLog.ts` | 454 | 所有 mutation 操作审计，敏感操作标记 |
| **背压控制** | `backpressure.ts` | 373 | 请求队列管理，防止系统过载 |
| **熔断器** | `circuitBreaker.ts` | 415 | 基于 Opossum 的熔断模式 |
| **熔断集成** | `circuitBreakerIntegration.ts` | 329 | 熔断器与服务层集成 |
| **优雅关停** | `gracefulShutdown.ts` | 325 | 进程退出时优雅关闭连接 |
| **指标采集** | `metricsCollector.ts` | 349 | Prometheus 指标自动采集 |
| **OpenTelemetry** | `opentelemetry.ts` | 453 | 分布式追踪集成 |
| **限流器** | `rateLimiter.ts` | 222 | 基于 express-rate-limit 的请求限流 |
| **安全头** | `securityHeaders.ts` | 183 | 基于 Helmet 的 HTTP 安全头 |
| **Vault 集成** | `vaultIntegration.ts` | 607 | HashiCorp Vault 密钥管理 |

### 6.2 HTTP 安全头

基于 Helmet 实现的安全头防护，包括：

- **Content-Security-Policy (CSP)**：限制脚本和样式来源，防御 XSS
- **X-Frame-Options**：防止点击劫持
- **X-Content-Type-Options**：防止 MIME 嗅探
- **Strict-Transport-Security (HSTS)**：强制 HTTPS（生产环境）
- **CORS 策略**：可配置的跨域访问控制

### 6.3 审计日志

审计日志中间件拦截所有 tRPC mutation 操作，实现完整的操作追溯：

- **持久化存储**：审计日志写入 MySQL `audit_logs` 表，非 console.log
- **敏感操作标记**：包含敏感关键词的操作自动写入 `audit_logs_sensitive` 表
- **异步写入**：不阻塞主请求，使用队列批量写入
- **OpenTelemetry 集成**：每条审计日志关联 traceId，支持链路追踪
- **可配置排除**：支持排除特定路径（如健康检查）

### 6.4 Vault 密钥管理

集成 HashiCorp Vault 实现企业级密钥管理：

- **动态密钥获取**：数据库凭据、API 密钥、TLS 证书按需获取
- **密钥自动轮换**：TTL 到期前自动刷新，零停机
- **Transit 引擎加密**：敏感数据字段级加密/解密
- **AppRole 认证**：服务间通信使用 AppRole 认证模式
- **密钥缓存**：本地缓存减少 Vault API 调用

### 6.5 熔断器

基于 Opossum 库实现的熔断器模式，保护下游服务：

- **三态切换**：Closed（正常）→ Open（熔断）→ Half-Open（探测）
- **可配置阈值**：错误率阈值、超时时间、重置时间
- **Prometheus 指标**：熔断状态、请求计数、错误率
- **服务级别配置**：每个下游服务独立的熔断策略

### 6.6 限流与背压

双重流量控制机制：

**限流器**：基于 express-rate-limit，支持按 IP、用户、API 路径的多维度限流，超限返回 429 状态码。

**背压控制**：当请求队列超过阈值时，自动拒绝新请求（503），防止系统过载。支持优先级队列，关键请求优先处理。

### 6.7 安全护栏引擎

护栏引擎（`guardrail-engine.ts`，998 行）为 AI 决策提供安全边界：

- **规则引擎**：可配置的安全规则（阈值、范围、模式匹配）
- **实时拦截**：不安全的 AI 决策在执行前被拦截
- **效果分析**：护栏触发频率、拦截准确率统计
- **自适应调整**：基于历史数据自动调整规则阈值

---

## 七、感知层

### 7.1 架构概述

感知层（Perception Layer）负责工业设备数据的采集、融合和编码，是平台数据输入的第一道关口。感知层采用 **三层管线架构**：

```
边缘层 (100kHz) → RingBuffer → AdaptiveSampler → FeatureVector
  → StateVectorSynthesizer → SensorStats
    → BPABuilder → BasicProbabilityAssignment[]
      → DSFusionEngine → EnhancedFusionResult
        → StateVectorEncoder → UnifiedStateVector → EventBus → 认知层
```

### 7.2 核心组件

| 组件 | 文件 | 职责 |
|---|---|---|
| **环形缓冲区** | `ring-buffer.ts` | 多通道高频数据缓冲（100kHz 级别） |
| **自适应采样器** | `adaptive-sampler.ts` | 根据信号特征动态调整采样率 |
| **BPA 构建器** | `bpa-builder.ts` | 构建基本概率分配（DS 证据理论输入） |
| **DS 融合引擎** | `ds-fusion-engine.ts` | Dempster-Shafer 证据融合 |
| **不确定性量化** | `uncertainty-quantifier.ts` | 融合结果不确定性评估 |
| **证据学习器** | `evidence-learner.ts` | 权重自学习，优化融合效果 |
| **状态向量合成器** | `state-vector-synthesizer.ts` | 从 ClickHouse 合成 21 维状态向量 |
| **状态向量编码器** | `state-vector-encoder.ts` | 统一状态向量编码 |
| **工况管理器** | `condition-profile-manager.ts` | 工况识别和管理 |
| **感知持久化** | `perception-persistence.service.ts` | 感知数据持久化到数据库 |

### 7.3 特征提取

平台内置 6 种专业特征提取器，覆盖工业设备主要信号类型：

| 提取器 | 文件 | 信号类型 | 提取特征 |
|---|---|---|---|
| **振动** | `vibration.extractor.ts` | 加速度、速度 | FFT 频谱、包络、峭度、RMS |
| **声学** | `acoustic.extractor.ts` | 声压、超声 | MFCC、频谱质心、谐波比 |
| **电气** | `electrical.extractor.ts` | 电流、电压 | 谐波分析、功率因数、不平衡度 |
| **旋转** | `rotation.extractor.ts` | 转速、扭矩 | 阶次分析、相位、偏心度 |
| **标量** | `scalar.extractor.ts` | 温度、压力 | 趋势、变化率、统计特征 |
| **视觉** | `visual.extractor.ts` | 图像、视频 | 边缘检测、纹理、缺陷识别 |

### 7.4 前端页面

感知层提供 4 个专属前端页面：

| 页面 | 路径 | 功能 |
|---|---|---|
| **BPA 构建器** | `/v5/perception/bpa-builder` | 可视化配置 BPA 参数和证据源 |
| **状态向量合成器** | `/v5/perception/state-vector` | 查看和配置 21 维状态向量 |
| **DS 融合引擎** | `/v5/perception/ds-fusion` | 融合结果可视化和参数调优 |
| **持久化服务** | `/v5/perception/persistence` | 感知数据存储状态监控 |

---

## 八、认知推理层

### 8.1 架构概述

认知推理层（Cognition Layer）是平台的"大脑"，负责将感知层输出的状态向量转化为可执行的诊断决策。认知层包含 **66 个 TypeScript 文件**，总计 **25,718 行**代码，是平台最复杂的子系统。

### 8.2 核心子模块

#### 8.2.1 推理引擎

| 组件 | 文件 | 行数 | 职责 |
|---|---|---|---|
| **因果图** | `causal-graph.ts` | 999 | 构建和推理因果关系网络 |
| **经验池** | `experience-pool.ts` | 706 | 历史案例匹配和相似度检索 |
| **物理验证器** | `physics-verifier.ts` | 976 | 基于物理定律验证推理结果 |
| **混合编排器** | `hybrid-orchestrator.ts` | 1,370 | 编排多种推理策略的执行顺序 |
| **知识反馈环** | `knowledge-feedback-loop.ts` | — | 推理结果反馈到知识库 |
| **可观测性** | `observability.ts` | — | 推理过程的监控和追踪 |

#### 8.2.2 世界模型

世界模型（World Model）是认知层的核心数据结构，维护设备运行状态的全局视图：

| 组件 | 文件 | 行数 | 职责 |
|---|---|---|---|
| **增强世界模型** | `world-model-enhanced.ts` | 1,331 | 融合多源数据的增强世界模型 |
| **基础世界模型** | `world-model.ts` | 621 | 设备状态基础模型 |
| **Grok 增强器** | `grok-enhancer.ts` | — | 使用 Grok 大模型增强世界模型 |
| **DBSCAN 引擎** | `dbscan-engine.ts` | — | 密度聚类分析 |
| **OTel 指标** | `otel-metrics.ts` | — | OpenTelemetry 指标采集 |
| **事件总线** | `twin-event-bus.ts` | 545 | 孪生事件发布/订阅 |
| **Outbox 中继** | `outbox-relay.ts` | 345 | 事件可靠投递（Outbox 模式） |

#### 8.2.3 Grok 大模型集成

平台集成 xAI 的 Grok 大模型，提供智能推理能力：

| 组件 | 文件 | 行数 | 职责 |
|---|---|---|---|
| **Grok 推理链** | `grok-reasoning-chain.ts` | 190 | 多步推理链构建 |
| **Grok 推理服务** | `grok-reasoning.service.ts` | 262 | Grok API 调用封装 |
| **Grok 工具调用** | `grok-tool-calling.ts` | — | Function Calling 集成 |
| **Grok 工具定义** | `grok-tools.ts` | — | 可用工具定义 |

Grok 集成支持双模式：在线模式调用 xAI API（`grok-4-0709`），离线模式回退到本地 Ollama（`llama3.1:70b`）。

#### 8.2.4 安全护栏

护栏引擎（998 行）为所有 AI 决策提供安全边界检查，确保推理结果在安全范围内。

### 8.3 认知状态机

认知引擎使用状态机管理推理会话的生命周期：

```
idle → preprocessing → perceiving → reasoning → deciding → executing → reflecting → idle
```

每个状态转换都会触发相应的处理器（Perception Processor → Reasoning Processor → Decision Processor → Fusion Processor），形成完整的认知闭环。

### 8.4 前端页面

认知推理层提供以下前端页面：

| 页面 | 路径 | 功能 |
|---|---|---|
| **因果图** | `/v5/cognition/causal-graph` | 可视化因果关系网络 |
| **经验池** | `/v5/cognition/experience-pool` | 历史案例浏览和管理 |
| **物理验证器** | `/v5/cognition/physics-verifier` | 物理约束配置和验证结果 |
| **混合编排器** | `/v5/cognition/orchestrator` | 推理策略编排和执行监控 |
| **知识反馈环** | `/v5/cognition/feedback-loop` | 反馈数据和知识更新状态 |
| **可观测性** | `/v5/cognition/observability` | 推理过程追踪和指标 |
| **认知仪表盘** | `/v5/cognitive` | 认知层综合监控面板 |
| **认知引擎** | `/v5/engine` | 认知引擎状态和配置 |

---

## 九、进化引擎

### 9.1 架构概述

进化引擎（Evolution Engine）是平台"自进化"能力的核心，通过 **影子评估 → 冠军-挑战者 → 金丝雀部署 → 飞轮编排** 四步闭环，实现模型的自动评估、竞争、部署和知识沉淀。

```
┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│ 影子评估  │───▶│ 冠军-挑战者   │───▶│ 金丝雀部署│───▶│ 飞轮编排  │
│ Shadow   │    │ Champion-    │    │ Canary   │    │ Flywheel │
│ Evaluator│    │ Challenger   │    │ Deployer │    │ Orchestr │
└──────────┘    └──────────────┘    └──────────┘    └──────────┘
     ▲                                                    │
     └────────────────── 知识结晶 ◀───────────────────────┘
```

### 9.2 影子评估器

影子评估器（`shadow-evaluator.ts`，580 行）在不影响生产流量的前提下评估新模型：

- **McNemar 检验**：比较新旧模型在相同样本上的表现差异
- **DS 证据融合**：多维度指标融合为综合评分
- **蒙特卡洛模拟**：通过随机模拟估计评估结果的置信区间
- **Welch's t-test**：统计显著性检验
- **Bootstrap 置信区间**：非参数置信区间估计
- **DB 持久化**：评估报告写入 `evolution_shadow_evaluations` 表
- **Prometheus 埋点**：评估总数、耗时、得分分布

### 9.3 冠军-挑战者

冠军-挑战者机制（`champion-challenger.ts`，550 行）实现多模型竞争和自动晋升：

- **多模型竞争**：支持 3+ 个挑战者同时注册和竞争
- **锦标赛逻辑**：基于影子评估得分的排名和淘汰
- **自动晋升**：评估通过后自动创建部署计划
- **健康检查**：多维度健康检查（延迟、错误率、资源占用）
- **模型生命周期**：完整状态机 `registered → evaluating → champion → retired`

### 9.4 金丝雀部署器

金丝雀部署器（`canary-deployer.ts`，370 行）实现渐进式流量切换：

- **5 阶段部署**：Shadow(0%) → Canary(5%) → Gray(20%) → Half(50%) → Full(100%)
- **自动回滚**：健康检查失败时自动回滚至冠军版本
- **流量路由**：基于权重的请求路由
- **指标监控**：实时监控延迟、错误率、准确率

### 9.5 飞轮编排器

飞轮编排器（`evolution-flywheel.ts`，343 行）将上述组件串联为完整的进化周期：

1. **数据收集**：从生产环境收集反馈数据
2. **模型训练**：基于新数据训练候选模型
3. **影子评估**：在镜像流量上评估候选模型
4. **竞争部署**：通过冠军-挑战者和金丝雀部署上线
5. **知识沉淀**：将进化过程中的知识结晶化

### 9.6 辅助组件

| 组件 | 文件 | 职责 |
|---|---|---|
| **数据引擎** | `data-engine.ts` | 进化数据的采集和预处理 |
| **元学习器** | `meta-learner.ts` | 学习进化策略的元参数 |
| **进化指标** | `evolution-metrics.ts` | Prometheus 指标定义 |

### 9.7 前端页面

| 页面 | 路径 | 功能 |
|---|---|---|
| **反馈中心** | `/evolution/feedback` | 用户反馈收集和管理 |
| **主动学习** | `/evolution/learning` | 主动学习策略配置 |
| **自动训练** | `/evolution/train` | 自动训练任务管理 |
| **进化看板** | `/evolution/board` | 进化引擎综合监控（4 个 Tab） |
| **护栏控制台** | `/v5/guardrail` | 安全护栏规则和效果分析 |

---

## 十、知识管理

### 10.1 架构概述

知识管理层负责平台知识资产的存储、检索、演化和应用，包含 **15 个 TypeScript 文件**。

### 10.2 核心组件

| 组件 | 文件 | 职责 |
|---|---|---|
| **知识图谱** | `knowledge-graph.ts` | 基于 Neo4j 的知识图谱构建和查询 |
| **知识结晶器** | `knowledge-crystallizer.ts` | 将隐性知识转化为显性知识 |
| **DB 知识存储** | `db-knowledge-store.ts` | 知识数据的 MySQL 持久化 |
| **特征注册表** | `feature-registry.ts` | 特征定义和版本管理 |
| **链式推理** | `chain-reasoning.ts` | 多步推理链构建 |
| **知识结晶服务** | `crystal.service.ts` | 结晶过程的服务层封装 |
| **KG 进化服务** | `kg-evolution.service.ts` | 知识图谱的自动进化 |
| **KG 查询服务** | `kg-query.service.ts` | 知识图谱查询优化 |
| **模型工件服务** | `model-artifact.service.ts` | 模型文件和工件管理 |
| **模型注册服务** | `model-registry.service.ts` | 模型版本注册和管理 |
| **迁移学习** | `transfer-learning.ts` | 跨域知识迁移 |

### 10.3 知识存储矩阵

| 存储类型 | 技术 | 用途 |
|---|---|---|
| **结构化知识** | MySQL | 规则、配置、元数据 |
| **图谱知识** | Neo4j | 实体关系、因果链、知识网络 |
| **向量知识** | Qdrant | 语义检索、相似度匹配 |
| **文档知识** | MinIO | 文件、报告、模型工件 |
| **时序知识** | ClickHouse | 历史趋势、时序模式 |

### 10.4 前端页面

| 页面 | 路径 | 功能 |
|---|---|---|
| **知识管理** | `/knowledge/manager` | 知识库 CRUD 管理 |
| **知识图谱** | `/knowledge/graph` | 知识图谱可视化浏览 |
| **向量管理** | `/knowledge/vectors` | 向量数据库管理 |
| **知识探索器** | `/v5/knowledge` | 深度知识探索和分析 |

---

## 十一、数字孪生

### 11.1 架构概述

数字孪生模块将物理设备映射为虚拟模型，支持状态监控、仿真推演、历史回放和世界模型构建。

### 11.2 核心功能

| 功能 | 页面路径 | 说明 |
|---|---|---|
| **设备状态** | `/digital-twin` | 实时设备状态监控和拓扑视图 |
| **仿真推演** | `/digital-twin/simulation` | 基于世界模型的"假设分析"仿真 |
| **历史回放** | `/digital-twin/replay` | 历史数据回放和事件重现 |
| **世界模型** | `/digital-twin/worldmodel` | 世界模型配置和可视化 |

### 11.3 配置面板

数字孪生提供 14 个专业配置面板，支持精细化调优：

| 面板 | 功能 |
|---|---|
| **因果图面板** | 设备因果关系网络配置 |
| **配置差异视图** | 配置变更对比 |
| **经验池面板** | 历史案例配置 |
| **反馈环面板** | 反馈回路参数 |
| **Grok 增强面板** | Grok 大模型增强参数 |
| **OTel 指标面板** | OpenTelemetry 指标配置 |
| **编排器面板** | 推理编排策略 |
| **物理验证面板** | 物理约束参数 |
| **RUL 预测面板** | 剩余使用寿命预测配置 |
| **仿真运行器** | 仿真参数和执行 |
| **仿真面板** | 仿真场景管理 |
| **状态同步面板** | 物理-虚拟状态同步 |
| **世界模型面板** | 世界模型参数 |

---

## 十二、智能诊断

### 12.1 诊断引擎

平台提供两种诊断模式：

**Grok Agent 诊断**（`grokDiagnosticAgent.service.ts`，1,138 行）：基于 xAI Grok 大模型的智能诊断 Agent，支持多轮对话、工具调用和推理链构建。

**融合诊断**（`fusionDiagnosis.service.ts`）：基于 DS 证据理论的多源融合诊断，将多个传感器的证据融合为统一的诊断结论。

### 12.2 诊断流程

```
传感器数据 → 特征提取 → BPA 构建 → DS 融合 → 因果推理 → 物理验证 → 诊断报告
                                                    ↓
                                              Grok Agent 增强
```

### 12.3 前端页面

| 页面 | 路径 | 功能 |
|---|---|---|
| **智能体诊断** | `/agents` | Grok Agent 对话式诊断 |
| **融合诊断** | `/diagnosis/fusion` | DS 融合诊断配置和结果 |
| **诊断分析** | `/diagnosis/analysis` | 诊断结果分析 |
| **诊断报告** | `/diagnosis/report` | 诊断报告生成和管理 |

---

## 十三、平台管理

### 13.1 设计工具

| 工具 | 路径 | 功能 |
|---|---|---|
| **Pipeline 编排** | `/settings/design/pipeline` | 可视化 DAG 流水线编排 |
| **知识图谱编排** | `/settings/design/kg-orchestrator` | 知识图谱构建和编排 |
| **数据库工作台** | `/settings/design/workbench` | 数据库管理和查询 |

**Pipeline 引擎**（`pipeline.engine.ts`，1,713 行）是平台最大的单文件服务，支持 DAG 有向无环图编排，包含节点定义、边连接、条件分支、并行执行和错误处理。

### 13.2 基础设置

| 页面 | 路径 | 功能 |
|---|---|---|
| **字典管理** | `/basic/dictionary` | 数据字典定义和维护 |
| **组织机构** | `/basic/organization` | 组织架构管理 |
| **设备管理** | `/basic/device` | 设备台账管理 |
| **机构管理** | `/basic/mechanism` | 机构信息管理 |
| **部件管理** | `/basic/component` | 部件库管理 |
| **零件库** | `/basic/parts` | 零件库管理 |

基础设置支持 **自定义编码规则**（通过 `useCustomColumns` Hook），用户可定义编码格式并自动生成。

### 13.3 状态监控

| 页面 | 路径 | 功能 |
|---|---|---|
| **基础设施** | `/settings/config/infrastructure` | 服务器、容器、网络状态 |
| **接入层管理** | `/settings/config/access-layer` | 协议适配器状态管理 |
| **系统拓扑** | `/settings/status/topology` | 系统拓扑自动发现和可视化 |
| **网关概览** | `/settings/gateway/dashboard` | API 网关状态和流量 |
| **沙箱概览** | `/settings/plugin-sandbox` | 插件沙箱运行状态 |
| **微服务监控** | `/settings/status/microservices` | 微服务健康和指标 |
| **性能总览** | `/settings/status/performance` | 系统性能指标汇总 |
| **Kafka 监控** | `/settings/config/kafka` | Kafka 主题、消费者、延迟 |
| **ClickHouse 监控** | `/monitoring/clickhouse` | ClickHouse 查询和存储状态 |
| **数据流监控** | `/settings/design/datastream` | 实时数据流可视化 |
| **平台诊断** | `/settings/status/diagnostic` | 平台自诊断工具 |

### 13.4 安全运维

| 页面 | 路径 | 功能 |
|---|---|---|
| **安全中心** | `/settings/security/falco` | 安全事件监控和告警 |

### 13.5 工具框架

平台工具框架（`tool-framework.ts`，350 行）提供标准化的工具注册和执行机制，内置 7 种工具：

| 工具 | 文件 | 功能 |
|---|---|---|
| **内置工具集** | `builtin-tools.ts`（514 行） | 平台内置工具定义 |
| **标注工具** | `annotation-tool.ts` | 数据标注 |
| **采集工具** | `collection-tool.ts` | 数据采集 |
| **评估工具** | `evaluation-tool.ts` | 模型评估 |
| **存储路由** | `storage-router.ts`（503 行） | 多后端存储路由 |
| **工具沙箱** | `tool-sandbox.ts` | 工具隔离执行 |
| **训练工具** | `training-tool.ts` | 模型训练 |
| **调优工具** | `tuning-tool.ts` | 参数调优 |

---

## 十四、前端导航与页面

### 14.1 导航结构

前端采用 **四级导航菜单**，按功能域分为 5 个大区：

| 区域 | 包含模块 |
|---|---|
| **核心业务** | 首页概览 |
| **资产与数据** | 知识库、数据中心、数据库 |
| **基础设置** | 字典、组织、设备、机构、部件、零件 |
| **智能引擎** | 模型中心、算法库、智能诊断、进化引擎 |
| **深度进化** | 护栏控制台、数字孪生、感知层增强、认知推理引擎、认知中枢 |
| **平台管理** | 设计工具、状态监控、安全运维 |

### 14.2 页面统计

平台共有 **220 个前端文件**，包含以下页面组：

| 页面组 | 页面数 | 说明 |
|---|---|---|
| 数据库管理 | 8 | 总览、配置、切片、清洗、事件、存储等 |
| 基础设置 | 6 | 字典、组织、设备、机构、部件、零件 |
| 数字孪生 | 7 + 14 面板 | 状态、仿真、回放、世界模型 + 配置面板 |
| 认知推理 | 6 | 因果图、经验池、物理验证、编排、反馈、可观测 |
| 认知中枢 | 4 | 仪表盘、感知监控、知识探索、认知引擎 |
| 感知增强 | 4 | BPA、状态向量、DS 融合、持久化 |
| 进化引擎 | 4 | 反馈、学习、训练、看板 |
| 状态监控 | 11 | 基础设施、拓扑、网关、微服务、性能等 |
| 设计工具 | 3 | Pipeline、KG 编排、数据库工作台 |
| 其他 | 若干 | AI 对话、模型中心、算法库、诊断等 |

### 14.3 快捷入口

平台提供 4 个快捷入口，方便用户快速访问高频功能：

| 快捷入口 | 路径 | 功能 |
|---|---|---|
| 智能体诊断 | `/agents` | Grok Agent 对话诊断 |
| Pipeline | `/settings/design/pipeline` | 流水线编排 |
| AI 对话 | `/chat` | AI 对话界面 |
| 知识管理 | `/knowledge/manager` | 知识库管理 |

---

## 十五、部署与运维

### 15.1 Docker Compose 部署

平台提供 **全栈一键部署** 的 Docker Compose 配置，支持多种启动模式：

| 启动模式 | 命令 | 包含服务 |
|---|---|---|
| **最小启动** | `docker-compose up -d mysql redis` | MySQL + Redis |
| **核心服务** | `docker-compose up -d mysql redis clickhouse kafka qdrant neo4j` | 6 个核心服务 |
| **全部启动** | `docker-compose up -d` | 所有默认服务 |
| **大数据服务** | `docker-compose --profile bigdata up -d` | + ES、Kafka Connect、Flink、Airflow |
| **安全服务** | `docker-compose --profile security up -d` | + Vault |
| **完整部署** | `docker-compose --profile full up -d` | 全部服务 |

### 15.2 环境变量

关键环境变量配置：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | MySQL 连接字符串 | `mysql://portai:***@mysql:3306/portai_nexus` |
| `REDIS_HOST` | Redis 地址 | `redis` |
| `KAFKA_BROKERS` | Kafka Broker 地址 | `kafka:29092` |
| `OLLAMA_HOST` | Ollama 地址 | `http://ollama:11434` |
| `OLLAMA_MODEL` | 默认 LLM 模型 | `llama3.1:70b` |
| `XAI_API_URL` | xAI API 地址 | `https://api.x.ai` |
| `XAI_MODEL` | Grok 模型 | `grok-4-0709` |
| `FEATURE_GROK_ENABLED` | 是否启用 Grok | `false` |
| `VAULT_ADDR` | Vault 地址 | `http://vault:8200` |
| `LOG_LEVEL` | 日志级别 | `info` |

### 15.3 健康检查

平台内置多层健康检查机制：

- **服务级**：每个 Docker 服务配置独立的 healthcheck
- **连接器级**：`connectorHealthCheck.job.ts` 定期检查所有外部连接
- **平台级**：`platformHealth.router.ts` 提供统一的健康检查 API
- **插件级**：每个插件支持独立的 `healthCheck()` 方法

### 15.4 监控体系

| 组件 | 职责 |
|---|---|
| **Prometheus** | 指标采集（所有模块暴露标准指标） |
| **Grafana** | 可视化仪表盘（预配置数据源和面板） |
| **Jaeger** | 分布式链路追踪 |
| **OpenTelemetry** | 统一可观测性框架 |
| **ClickHouse** | 遥测数据长期存储和分析 |

---

## 十六、测试体系

### 16.1 测试框架

平台使用 **Vitest** 作为测试框架，配合 `@vitest/coverage-v8` 进行覆盖率统计。

### 16.2 测试覆盖

| 测试类别 | 文件数 | 测试用例数 | 覆盖范围 |
|---|---|---|---|
| 核心框架 | 5 | ~50 | 配置、日志、启动、环境加载、tRPC |
| 中间件 | 5 | ~80 | 背压、熔断、限流、安全头、指标 |
| 平台服务 | 2 | ~30 | 配置中心、事件 Schema |
| 平台合约 | 2 | ~40 | 事件 Schema 注册、物理公式 |
| 集成测试 | 4 | ~60 | 认知引擎、事件系统、进化飞轮、感知管线 |
| 插件引擎 | 1 | ~20 | 插件加载、执行、安全 |
| 底层库 | 2 | ~30 | 缓存服务、DB 追踪 |
| 算法 | 1 | ~20 | DSP 工具 |
| Agent | 2 | ~40 | Agent 注册、OTel 集成 |
| **合计** | **26** | **~400** | 后端核心模块 |

当前测试覆盖率为 **2.83%**（基于代码行数），主要覆盖后端核心模块。前端测试尚未实施。

---

## 十七、附录

### A. 技术术语表

| 术语 | 全称 | 说明 |
|---|---|---|
| **BPA** | Basic Probability Assignment | DS 证据理论中的基本概率分配 |
| **DS** | Dempster-Shafer | 证据理论，用于多源信息融合 |
| **tRPC** | TypeScript Remote Procedure Call | 端到端类型安全的 RPC 框架 |
| **ORM** | Object-Relational Mapping | 对象关系映射 |
| **DAG** | Directed Acyclic Graph | 有向无环图 |
| **OTel** | OpenTelemetry | 开源可观测性框架 |
| **HSTS** | HTTP Strict Transport Security | HTTP 严格传输安全 |
| **CSP** | Content Security Policy | 内容安全策略 |
| **KG** | Knowledge Graph | 知识图谱 |
| **RUL** | Remaining Useful Life | 剩余使用寿命 |
| **MFCC** | Mel-Frequency Cepstral Coefficients | 梅尔频率倒谱系数 |

### B. 版本历史

| 版本 | 日期 | 主要变更 |
|---|---|---|
| v1.0 | 2025 | 基础平台搭建（设备管理、数据采集、知识库） |
| v1.5 | 2025 | 数据库模块、Pipeline 编排 |
| v1.9 | 2025 | 性能优化（Outbox、Saga、自适应采样、去重、读副本） |
| v3.1 | 2025 | 自适应智能架构（平台健康、微服务监控） |
| v4.0 | 2026 | 三层架构重构（Platform/Operations/Business） |
| v5.0 | 2026 | 深度进化（感知增强、认知推理、数字孪生、进化引擎） |
| v5.1 | 2026-02 | Phase 4（安全护栏 + 知识结晶）+ 进化闭环升级 |

### C. 相关文档

| 文档 | 路径 | 说明 |
|---|---|---|
| Phase 4 升级方案 | `docs/phase4-upgrade-plan-v5.0.md` | 安全护栏 + 知识结晶升级方案 |
| 进化闭环升级方案 | `docs/evo-loop-upgrade-plan.md` | 自主进化闭环 v2.0（FSD 驱动） |
| API 规范 | `shared/apiSpec.ts` | OpenAPI 规范定义 |
| 类型定义 | `shared/types.ts` | 前后端共享类型 |
