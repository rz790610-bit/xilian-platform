# 西联智能平台 · 数据库架构文档

> **版本**: v5.0-stable  
> **最后更新**: 2026-02-22  
> **作者**: Manus AI  

---

## 1. 架构概览

西联智能平台采用 **MySQL 8.0 + ClickHouse 24.x** 双引擎架构，分别承担关系型业务数据和时序分析数据的存储职责。

| 数据库 | 引擎 | 库名 | 用途 | 对象总数 |
|--------|------|------|------|---------|
| MySQL 8.0 | InnoDB | `portai_nexus` | 核心业务数据（用户、资产、诊断、模型、知识库等） | **160 张表** |
| ClickHouse 24.x | MergeTree 系列 | `portai_timeseries` | 超高频时序数据（振动、温度、压力等传感器数据） | **37 个对象**（15 MergeTree + 2 Kafka + 18 物化视图 + 2 兼容视图） |

整体设计遵循以下原则：

- **单命令初始化**：`docker-compose up -d` 即可完成全部数据库创建、表结构建立和种子数据导入，无需手动执行迁移脚本。
- **分层 DDL + 幂等 Seed**：DDL 使用 `CREATE TABLE IF NOT EXISTS`，Seed 使用 `INSERT IGNORE`，支持重复执行不报错。
- **严格模式兼容**：所有 `NOT NULL` 字段均配置了合理的 `DEFAULT` 值，确保在 MySQL 严格模式下 INSERT 不会因缺少字段值而失败。

---

## 2. MySQL 架构（portai_nexus）

### 2.1 初始化脚本执行顺序

MySQL Docker 容器通过 `/docker-entrypoint-initdb.d/` 目录自动按字母序执行初始化脚本：

| 序号 | 文件名 | 类型 | 内容 | 表/记录数 |
|------|--------|------|------|----------|
| 1 | `01-base-ddl.sql` | DDL | 基础平台 121 张表（资产、设备、诊断、算法、数据、知识库、模型、拓扑等） | 121 表 |
| 2 | `02-v5-ddl.sql` | DDL | V5 认知层 24 张表（工况画像、认知会话、护栏规则、进化周期等） | 24 表 |
| 3 | `03-evolution-ddl.sql` | DDL | 进化层 15 张表（仿真、数字孪生、因果推理、影子评估等） | 15 表 |
| 4 | `05-base-seed.sql` | Seed | 基础种子数据（用户、拓扑、模型、诊断规则、资产树、编码规则等） | ~150 条 |
| 5 | `06-v5-seed.sql` | Seed | V5 种子数据（设备画像、工况画像、特征定义、护栏规则、认知会话等） | ~80 条 |
| 6 | `07-evolution-seed.sql` | Seed | 进化层种子数据（6 个仿真场景模板 + 7 个物理方程） | 13 条 |

### 2.2 业务域分布

160 张表按业务域分布如下：

| 业务域 | 前缀 | 表数量 | 说明 |
|--------|------|--------|------|
| 数据管理 | `data_*` | 16 | 数据采集、清洗、切片、导出、治理、生命周期 |
| 设备管理 | `device_*` | 12 | 告警、维护、固件、KPI、运行日志、采样配置 |
| 模型管理 | `model_*` | 10 | 模型注册、部署、评估、微调、推理日志 |
| 基础配置 | `base_*` | 9 | 编码规则、节点模板、测点模板、标签、字典 |
| 知识库 | `kb_*` | 8 | 文档、分块、嵌入、问答对、对话 |
| 知识图谱 | `kg_*` | 8 | 图节点、图边、诊断路径、进化日志 |
| 拓扑管理 | `topo_*` | 6 | 节点、边、层、布局、快照、告警 |
| 算法管理 | `algorithm_*` | 5 | 定义、组合、执行、路由、设备绑定 |
| 诊断管理 | `diagnosis_*` | 4 | 规则、任务、结果、物理方程 |
| 资产管理 | `asset_*` | 3 | 节点、测点、传感器 |
| 管道编排 | `pipeline_*` | 3 | 管道定义、运行记录、节点指标 |
| 边缘网关 | `edge_*` | 3 | 网关、网关配置、边缘案例 |
| 事务补偿 | `saga_*` | 3 | 实例、步骤、死信 |
| 数字孪生 | `twin_*` | 3 | 同步日志、事件、发件箱 |
| 影子评估 | `shadow_*` | 3 | 推理比较、评估记录、评估指标 |
| 工况管理 | `condition_*` | 3 | 画像、基线、实例 |
| 认知引擎 | `cognition_*` | 2 | 会话、维度结果 |
| 护栏规则 | `guardrail_*` | 2 | 规则、违规记录 |
| 仿真模拟 | `simulation_*` | 2 | 场景、结果 |
| 传感器 | `sensor_*` | 2 | 校准、测点映射 |
| 告警事件 | `alert_*` | 2 | 规则、事件日志 |
| 推理决策 | `reasoning_*` | 2 | 决策日志、经验 |
| 其他 | — | ~48 | users, models, event_store, outbox_events, audit_logs 等独立表 |

### 2.3 种子数据清单

| 表名 | 记录数 | 说明 |
|------|--------|------|
| `users` | 2 | 系统管理员 + 演示用户 |
| `topo_nodes` | 12 | 拓扑节点（设备、网关、服务器等） |
| `topo_edges` | 14 | 拓扑连接关系 |
| `topo_layouts` | 1 | 默认拓扑布局 |
| `models` | 4 | AI 模型定义 |
| `diagnosis_rules` | 7 | 诊断规则 |
| `base_code_rules` | 4 | 编码规则 |
| `base_node_templates` | 6 | 节点类型模板 |
| `base_mp_templates` | 5 | 测点模板 |
| `base_label_dimensions` | 5 | 标签维度 |
| `base_label_options` | 19 | 标签选项 |
| `base_slice_rules` | 3 | 切片规则 |
| `base_dict_categories` | 7 | 字典分类 |
| `base_clean_rules` | 4 | 数据清洗规则 |
| `asset_nodes` | 9 | 资产树节点 |
| `asset_sensors` | 6 | 传感器 |
| `device_spare_parts` | 8 | 备件 |
| `data_slices` | 4 | 数据切片 |
| `kb_collections` | 3 | 知识库集合 |
| `equipment_profiles` | 5 | 设备画像 |
| `condition_profiles` | 3 | 工况画像 |
| `feature_definitions` | 5 | 特征定义 |
| `guardrail_rules` | 5 | 护栏规则 |
| `guardrail_violations` | 6 | 护栏违规记录 |
| `cognition_sessions` | 5 | 认知会话 |
| `grok_reasoning_chains` | 6 | 推理链 |
| `knowledge_crystals` | 5 | 知识结晶 |
| `evolution_cycles` | 5 | 进化周期 |
| `sampling_configs` | 4 | 采样配置 |
| `simulation_scenarios` | 6 | 仿真场景模板 |
| `diagnosis_physics_formulas` | 7 | 物理方程 |

---

## 3. ClickHouse 架构（portai_timeseries）

### 3.1 初始化脚本

| 文件名 | 内容 |
|--------|------|
| `01_base_tables.sql` | 15 张 MergeTree 基础表（振动原始数据、频谱、统计聚合、告警、设备状态等） |
| `02_views_and_indexes.sql` | 2 张 Kafka 表 + 18 张物化视图 + 2 张兼容视图 |

### 3.2 数据流架构

```
传感器 → Kafka → Kafka Engine 表 → 物化视图（ETL） → MergeTree 存储表
                                          ↓
                                    聚合物化视图（分钟/小时/天级）
```

ClickHouse 通过 Kafka Engine 表直接消费 Kafka topic 中的传感器数据，物化视图实时将数据写入对应的 MergeTree 存储表，并同时生成多级时间聚合（分钟级、小时级、天级），支持从毫秒级原始数据到天级趋势的全时间尺度查询。

---

## 4. 一键初始化流程

### 4.1 完整重建命令

```bash
# 1. 停止并清除旧数据
docker stop portai-mysql portai-clickhouse
docker rm portai-mysql portai-clickhouse
docker volume rm portai-mysql-data portai-clickhouse-data

# 2. 启动（自动执行 init 脚本）
docker-compose up -d mysql clickhouse

# 3. 等待初始化完成（约 30-60 秒）
sleep 60

# 4. 验证
./scripts/verify-db.sh
```

### 4.2 验证脚本检查项

`scripts/verify-db.sh` 执行以下 9 项检查：

| 检查项 | 期望值 | 说明 |
|--------|--------|------|
| MySQL 总表数 | ≥ 160 | 全部 DDL 执行成功 |
| 基础表抽样 | ≥ 16 | 核心业务表存在 |
| V5 认知层表抽样 | ≥ 8 | 认知层表存在 |
| 进化层表全量 | ≥ 15 | 进化层表存在 |
| Pipeline 表 | ≥ 3 | 管道编排表存在 |
| 仿真场景种子数据 | ≥ 6 | seed 脚本执行成功 |
| 物理方程种子数据 | ≥ 7 | seed 脚本执行成功 |
| ClickHouse 总对象数 | ≥ 37 | 全部对象创建成功 |
| ClickHouse MergeTree 表 | ≥ 15 | 基础存储表存在 |

---

## 5. 设计约定

### 5.1 字段命名规范

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | `INT AUTO_INCREMENT` / `BIGINT AUTO_INCREMENT` | — | 主键 |
| `created_at` | `TIMESTAMP NOT NULL` | `DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `TIMESTAMP NOT NULL` | `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |
| `is_deleted` | `TINYINT NOT NULL` | `DEFAULT 0` | 软删除标记 |
| `is_active` | `TINYINT NOT NULL` / `VARCHAR(255) NOT NULL` | `DEFAULT 1` | 启用状态 |
| `created_by` | `VARCHAR(64)` | `NULL` | 创建人 |
| `version` | `INT NOT NULL` | `DEFAULT 1` | 乐观锁版本号 |

### 5.2 MySQL 严格模式兼容

所有 `NOT NULL` 字段必须配置 `DEFAULT` 值。这是因为 MySQL 8.0 默认启用 `STRICT_TRANS_TABLES` 模式，INSERT 语句中未显式赋值的 `NOT NULL` 字段如果没有 `DEFAULT`，将直接报错而非使用隐式默认值。

### 5.3 字符集

全库统一使用 `utf8mb4` 字符集 + `utf8mb4_unicode_ci` 排序规则，支持完整的 Unicode 字符（包括 emoji 和中文特殊字符）。

---

## 6. 未来扩展指南

当需要新增业务表时，应遵循以下流程：

1. **在对应的 DDL 文件中添加** `CREATE TABLE IF NOT EXISTS` 语句（基础表加到 `01-base-ddl.sql`，认知层加到 `02-v5-ddl.sql`，进化层加到 `03-evolution-ddl.sql`）。
2. **确保所有 NOT NULL 字段都有 DEFAULT 值**，特别是 `TIMESTAMP` 类型字段。
3. **种子数据使用 `INSERT IGNORE`**，确保幂等性。
4. **更新 `verify-db.sh`** 中的表计数和抽样检查。
5. **同步更新 Drizzle ORM schema**，保持代码层与数据库层一致。

---

## 7. 变更日志

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-02-22 | v5.0-stable | 全面修复 VARCHAR(255) → TIMESTAMP/TINYINT 类型映射；补充所有 NOT NULL DEFAULT 值；3 个 seed 脚本全部执行成功；验证脚本更新 |
| 2026-02-22 | v5.0-rc2 | 修复 16 个业务 TIMESTAMP 字段缺少 DEFAULT CURRENT_TIMESTAMP |
| 2026-02-22 | v5.0-rc1 | 合并 ClickHouse 4 个冲突 init 文件为 2 个；MySQL 160 表 DDL 整合完成 |
