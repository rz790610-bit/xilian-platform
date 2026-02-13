# 接入层行动方案 v2 与 xilian-platform 代码库对照分析

> **目的**：逐阶段对照 Grok 生成的《接入层行动方案 v2.1》与 xilian-platform 代码库现状，明确哪些已有基础可以直接复用、哪些需要新建、哪些需要改造，并给出落地到代码库的具体建议。

---

## 一、总体对照：方案 vs 代码库现状

方案 v2.1 描述的是一个**基础设施级**的端到端数据管道（传感器 → EMQX → Kafka → Flink → 存储 → ML），涉及 Docker Compose 部署、Telegraf 采集、Flink SQL 流处理等。而 xilian-platform 代码库是一个 **Node.js/TypeScript 全栈 Web 应用**，已经用"模拟实现"的方式覆盖了方案中大部分逻辑层。

| 方案 v2.1 组件 | 代码库对应 | 现状 |
|---------------|-----------|------|
| MySQL 37+ 张表 | `drizzle/schema.ts` 113 张表 | **已超额覆盖**，包含方案提到的所有表 |
| Kafka 事件流 | `eventBus.service.ts` + `kafkaStream.processor.ts` | 内存 EventEmitter 模拟 + Kafka client 封装，**结构已有** |
| Flink 流处理 | `streamProcessor.service.ts` | 滑动窗口异常检测的 Node.js 模拟，**逻辑已有** |
| EMQX MQTT | `MQTTScanner` in resource-discovery | 扫描器已有，但**无 MQTT 客户端连接管理** |
| Outbox/CDC | `outboxEvents` + `outboxRoutingConfig` 表 + `outbox.publisher.ts` | **Schema 和发布器已有** |
| Saga 补偿 | `sagaInstances` + `sagaSteps` + `sagaDeadLetters` 表 + `saga.orchestrator.ts` | **完整实现** |
| 设备树/传感器 | `asset_nodes` + `asset_sensors` + `asset_measurement_points` | **完整 Schema** |
| 数据切片 | `data_slices` + `base_slice_rules` | **完整 Schema** |
| 清洗规则 | `base_clean_rules` + `data_clean_tasks` + `data_clean_results` | **完整 Schema** |
| ML 生命周期 | `model_registry` + `model_training_jobs` + `model_deployments` + `model_inference_logs` | **完整 Schema** |
| 边缘网关 | `edge_gateway_config` 表 | **Schema 已有**，无前端管理 |
| 自适应采样 | `device_sampling_config` + `adaptiveSampling.service.ts` | **服务和 Schema 已有** |
| Nebula 图数据库 | 代码库用 Neo4j | 需要决策：**沿用 Neo4j 还是换 Nebula** |
| ClickHouse 时序 | `clickhouse.router.ts` + 前端 ClickHouse 监控页 | **路由已有**，需补充时序特征表 |
| MinIO 存储 | `minio_file_metadata` + `minio_upload_logs` 表 | **Schema 已有** |
| Prometheus 监控 | 无 | **需新建**（方案 v2.1 的监控指标层） |
| Docker Compose | 无 | **需新建**（方案阶段 1 的部署文件） |

**结论**：代码库的 Schema 层和服务模拟层已经覆盖了方案 v2.1 约 70% 的数据模型。缺失的主要是**真实中间件连接**（EMQX/Kafka/Flink 的真实客户端）和**部署编排**（Docker Compose）。

---

## 二、逐阶段对照与落地建议

### 阶段 1：准备 & 环境搭建（方案 Week 1）

**方案要求**：Docker Compose 部署 MySQL/Kafka/Flink/EMQX/ClickHouse/MinIO/Nebula/Prometheus。

**代码库现状**：

| 组件 | 代码库状态 | 落地动作 |
|------|-----------|---------|
| MySQL 37 张表 | 113 张表已定义在 `drizzle/schema.ts` | 直接用 `drizzle-kit push` 同步到真实 MySQL |
| Kafka | `kafkaStream.processor.ts` 有 client 封装 | 需要 `.env` 配置真实 Kafka 地址 |
| EMQX | `MQTTScanner` 只做扫描 | **需新建** `mqtt.client.ts`，管理 MQTT 连接 |
| ClickHouse | `clickhouse.router.ts` 有查询路由 | 需补充 `vibration_features` 等时序表 DDL |
| MinIO | Schema 已有 | 需要 `.env` 配置真实 MinIO 地址 |
| Neo4j/Nebula | 代码库用 Neo4j | **建议沿用 Neo4j**（代码库已有完整集成） |
| Flink | `streamProcessor.service.ts` 模拟 | 真实 Flink 通过 Kafka 消费，Node.js 侧不需改动 |
| Prometheus | 无 | **新建** `docker/prometheus.yml` 配置文件 |

**具体落地建议**：

1. **新建 `docker/docker-compose.yml`**：将方案中的 Docker Compose 配置落地，但做以下调整：
   - Nebula → Neo4j（与代码库一致）
   - 增加 `xilian-app` 服务（Node.js 应用本身）
   - init.sql 不需要手写，用 `drizzle-kit push` 自动同步

2. **新建 `docker/init/` 目录**：放置各中间件初始化脚本
   - `emqx-kafka-bridge.conf`（方案中的 MQTT→Kafka 桥接配置）
   - `neo4j-schema.cypher`（替代方案中的 nebula-schema.cypher）
   - `clickhouse-init.sql`（时序特征表）

3. **新建 `.env.production` 模板**：统一所有中间件连接参数

### 阶段 2：边缘接入 & 传输（方案 Week 2）

**方案要求**：Telegraf 采集 → EMQX → Kafka 桥接 → Flink 触发切片。

**代码库现状与落地**：

方案的这一阶段主要是**基础设施配置**（Telegraf conf、EMQX 桥接、Flink SQL），不直接涉及 Node.js 代码。但需要在代码库中新增**接入层管理服务**来管理这些配置。

| 方案动作 | 代码库落地 |
|----------|-----------|
| Telegraf Modbus/OPC 配置 | 新建 `server/services/protocol-adapters/` 目录，每种协议一个适配器 |
| EMQX Kafka 桥接 | 新建 `server/lib/clients/mqtt.client.ts`，复用 Scanner 中的 MQTT 逻辑 |
| Flink 触发切片 SQL | 这是 Flink 侧配置，Node.js 侧通过 Kafka 消费切片结果 |
| FSD 触发式采集 | 代码库的 `base_slice_rules` 表已有 `triggerType` + `triggerConfig`，**直接复用** |
| 自适应采样 | `adaptiveSampling.service.ts` **已有完整实现** |

**关键新建文件**：

```
server/services/access-layer.service.ts          # 接入层统一管理服务
server/services/protocol-adapters/
  ├── index.ts                                    # 适配器注册表
  ├── mqtt.adapter.ts                             # MQTT 协议适配
  ├── modbus.adapter.ts                           # Modbus 协议适配
  ├── opcua.adapter.ts                            # OPC-UA 协议适配
  ├── database.adapter.ts                         # 数据库协议适配（MySQL/PG/InfluxDB）
  └── kafka.adapter.ts                            # Kafka 协议适配
server/api/accessLayer.router.ts                  # tRPC 路由
shared/accessLayerTypes.ts                        # 共享类型
```

**Schema 新增**（补充方案中缺失的接入层配置持久化）：

代码库当前没有统一的"数据源连接器"表。方案 v2.1 假设配置写在 Telegraf conf 和 EMQX conf 中，但平台需要**通过 Web UI 管理这些配置**。因此需要新增：

```
data_connectors     # 连接器注册表（统一管理所有外部数据源的连接配置）
data_endpoints      # 端点表（连接器下的具体资源：Topic/Table/NodeId）
data_bindings       # 绑定表（端点与平台内部消费者的关联）
```

这 3 张表是我之前建议方案中提出的，与方案 v2.1 互补——v2.1 关注基础设施部署，这 3 张表关注**Web 层的配置管理和跨模块共享**。

### 阶段 3：实时处理 & 自动标注（方案 Week 3）

**方案要求**：Flink 清洗/特征提取 → 自动标注 → Saga 补偿 → 闭环迭代。

**代码库现状**：

| 方案动作 | 代码库对应 | 状态 |
|----------|-----------|------|
| Flink 清洗 | `base_clean_rules` + `data_clean_tasks` + `data_clean_results` | **Schema 完整** |
| 特征提取 → vibration_features | ClickHouse 路由已有 | 需补充 ClickHouse DDL |
| ML 自动标注 | `model_deployments` + `model_inference_logs` | **Schema 完整** |
| 低置信 → saga_dead_letters | `saga_dead_letters` 表 + `saga.orchestrator.ts` | **完整实现** |
| 数据质量报告 | `data_quality` 字段在 `data_slices` 中 | **已有**，可扩展独立表 |
| 闭环迭代 | `model_training_jobs` → `model_registry` → `model_deployments` | **Schema 链路完整** |

**落地动作**：这一阶段代码库已有充分基础，主要工作是：

1. **补充 ClickHouse 时序表 DDL**：`vibration_features`、`vibration_1hour_agg`（后者已有 Schema）
2. **新建 `server/services/auto-labeling.service.ts`**：调用已部署模型进行自动标注
3. **串联现有服务**：streamProcessor → cleanRules → autoLabeling → sagaOrchestrator

### 阶段 4：集成 & 测试（方案 Week 4）

**方案要求**：端到端集成测试、FSD 容错测试、闭环验证。

**代码库落地**：

1. **新建 `tests/integration/access-layer.test.ts`**：端到端集成测试
2. **复用现有测试框架**：代码库已有 `*.test.ts` 文件（pipeline.engine.test.ts、saga.rollback.ts 等）
3. **前端 DataAccess 页面改造**：从 Mock 切换到 tRPC 调用 `accessLayer.router.ts`

### 阶段 5：上线 & 迭代（方案 Week 5-6）

**方案要求**：K8s 迁移、A/B 测试、生产迭代。

**代码库落地**：这一阶段超出代码库范围，属于 DevOps 工作。可以新建 `k8s/` 目录存放 Helm Chart 或 K8s manifests。

---

## 三、核心差异与决策点

### 决策 1：图数据库选型

| | 方案 v2.1（Nebula） | 代码库现状（Neo4j） |
|---|---|---|
| 已有代码 | 无 | `Neo4jScanner`、KG 编排器全部基于 Neo4j |
| 性能 | 分布式，大规模图更优 | 单机够用，社区版免费 |
| 部署复杂度 | 高（3 个服务：graphd/metad/storaged） | 低（单容器） |

**建议**：**沿用 Neo4j**。代码库已有完整集成，KG 编排器刚做完，切换成本大。如果未来数据量超过单机 Neo4j 能力，再考虑迁移。

### 决策 2：接入层配置管理方式

| | 方案 v2.1 | 建议补充 |
|---|---|---|
| 配置方式 | Telegraf conf + EMQX conf（文件级） | Web UI + `data_connectors` 表（数据库级） |
| 管理粒度 | 按中间件分散管理 | 统一 Connector → Endpoint → Binding 三级模型 |
| 跨模块共享 | 无（各中间件独立） | Pipeline/KG/设备采样共用同一数据源 |

**建议**：**两者结合**。基础设施层用 conf 文件（Docker Compose 管理），应用层用 `data_connectors` 表（Web UI 管理）。conf 文件是"部署时配置"，data_connectors 是"运行时配置"。

### 决策 3：Node.js 模拟 vs 真实中间件

代码库当前用 Node.js 模拟了 Kafka（EventEmitter）、Flink（滑动窗口）、MQTT（Scanner）。方案 v2.1 要求部署真实中间件。

**建议**：**渐进式替换**。

1. **第一步**（现在）：保持 Node.js 模拟，新增 `data_connectors` 等 Schema 和接入层管理服务，前端 DataAccess 页面改造
2. **第二步**（部署真实中间件后）：在 `protocol-adapters/` 中实现真实连接，通过 `.env` 切换模拟/真实模式
3. **第三步**（生产环境）：Flink 接管流处理，Node.js 侧只做配置管理和结果消费

---

## 四、推荐实施顺序（代码库落地）

### 第 1 步：Schema + 类型 + 服务骨架（1 天）

| 文件 | 内容 |
|------|------|
| `drizzle/schema.ts` | 新增 `data_connectors` / `data_endpoints` / `data_bindings` 3 张表 |
| `shared/accessLayerTypes.ts` | 连接器/端点/绑定的 TypeScript 类型 + 协议枚举 + 配置 Schema |
| `server/services/access-layer.service.ts` | CRUD + 连接测试 + 资源发现 + 绑定管理 |
| `server/api/accessLayer.router.ts` | tRPC 路由 |
| `server/routers.ts` | 注册 accessLayer 路由 |

### 第 2 步：协议适配器（1-2 天）

| 文件 | 内容 |
|------|------|
| `server/services/protocol-adapters/index.ts` | ProtocolAdapter 接口 + 注册表 |
| `server/services/protocol-adapters/mqtt.adapter.ts` | MQTT 连接测试 + Topic 发现 |
| `server/services/protocol-adapters/database.adapter.ts` | MySQL/PG/InfluxDB 连接测试 + 表发现 |
| `server/services/protocol-adapters/modbus.adapter.ts` | Modbus 连接测试 + 寄存器发现 |
| `server/services/protocol-adapters/kafka.adapter.ts` | Kafka 连接测试 + Topic 发现 |
| `server/services/protocol-adapters/opcua.adapter.ts` | OPC-UA 连接测试 + NodeId 发现 |

复用现有 `resource-discovery.service.ts` 中 10 个 Scanner 的扫描逻辑，重构为 Adapter 模式。

### 第 3 步：前端 DataAccess 页面改造（1-2 天）

将 `/data/access` 页面从纯 Mock 升级为真实 CRUD：
- 连接器列表 → `trpc.accessLayer.listConnectors`
- 新增连接器 → `trpc.accessLayer.createConnector`
- 连接测试 → `trpc.accessLayer.testConnection`
- 资源发现 → `trpc.accessLayer.discoverEndpoints`
- 端点管理 → `trpc.accessLayer.listEndpoints`

### 第 4 步：跨模块绑定（1 天）

- Pipeline 组件面板：自动发现 Tab 从 `data_connectors` 读取
- KG 数据层节点：配置面板新增"绑定数据源"
- 设备采样配置：关联到 `data_endpoints`

### 第 5 步：Docker Compose 部署文件（1 天）

新建 `docker/` 目录，包含完整的 Docker Compose 配置（对应方案阶段 1）。

---

## 五、总结

方案 v2.1 是一份**基础设施导向**的行动方案，重点在 Docker 部署、中间件配置、Flink SQL。代码库是一个**应用层导向**的全栈平台，重点在 Schema 设计、tRPC API、React UI。

两者的关系是**互补**而非替代：

- **方案 v2.1 解决**：真实中间件怎么部署、数据怎么从传感器流到存储
- **代码库需要解决**：接入配置怎么通过 Web UI 管理、跨模块怎么共享数据源、用户怎么可视化操作

**代码库的当务之急**是补上**接入层管理服务**（data_connectors + protocol-adapters + accessLayer.router），让 DataAccess 页面从 Mock 变成真实 CRUD，让 Pipeline 和 KG 编排器能绑定真实数据源。基础设施部署（Docker Compose）可以并行推进。
