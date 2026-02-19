# 数据库迁移审计数据

## 四个来源的表数量统计

| 来源 | 表数量 | 列名风格 | 说明 |
|------|--------|---------|------|
| `drizzle/schema.ts` | **121** | snake_case (TypeScript 属性 camelCase, SQL 列名 snake_case) | TypeScript 权威定义 |
| `docker/mysql/init/01-schema.sql` | 54 | snake_case | Docker 首次初始化 |
| `docker/mysql/init/03-schema-upgrade-v2.sql` | 6 (新增) | snake_case | Docker 升级脚本 |
| Docker 合计 | **60** | snake_case | 01 + 03 |
| `migrations/create_algorithm_tables.sql` | 5 | snake_case | 独立算法表 |
| `drizzle/0000_strong_gravity.sql` | 30 | **camelCase** | Drizzle 自动生成（已过时） |
| 所有 SQL 合计 | **71** | 混合 | — |

## 关键发现

### 1. schema.ts 中有但所有 SQL 都没有的表 (56 张)
这些表在 TypeScript 中定义了但从未生成过 SQL 迁移：
alert_event_log, alert_rules, anomaly_models, async_task_log, audit_logs, audit_logs_sensitive,
config_change_logs, data_bindings, data_clean_results, data_connectors, data_endpoints,
data_export_tasks, data_governance_jobs, data_lineage, device_daily_summary, device_firmware_versions,
device_maintenance_logs, device_protocol_config, device_rule_versions, device_status_log,
diagnosis_results, edge_gateway_config, kb_chunks, kb_conversation_messages, kb_conversations,
kb_embeddings, kb_qa_pairs, kg_diagnosis_paths, kg_diagnosis_runs, kg_evolution_log,
kg_graph_edges, kg_graph_nodes, kg_graphs, message_queue_log, message_routing_config,
minio_file_metadata, minio_upload_logs, model_deployments, model_inference_logs, model_registry,
model_training_jobs, pipeline_node_metrics, pipeline_runs, pipelines, plugin_events,
plugin_instances, plugin_registry, realtime_data_latest, rollback_triggers, scheduled_tasks,
sensor_mp_mapping, system_configs, topo_alerts, topo_layers, topo_snapshots, vibration_1hour_agg

### 2. SQL 中有但 schema.ts 中没有的表 (6 张 — 已废弃)
这些是旧的 camelCase 表，已在 004 迁移中 DROP：
devices, sensors, sensor_readings, sensor_aggregates, data_aggregations, telemetry_data

### 3. drizzle/_journal.json 只有 1 个 entry 但有 9 个 SQL 文件
- journal 中只注册了 `0000_strong_gravity.sql`
- `0000_complex_exodus.sql` (只有 users 表) 未注册
- `0001-0007` 是增量迁移但也未注册
- 说明 journal 被重置过，0001-0007 是历史残留

### 4. docker/mysql/migrations/004 有 20 个重复的 PART D
- 6271 行，同一张表被 CREATE 了 20 次
- 明显是脚本生成错误导致的重复

### 5. 三套迁移的角色
- `docker/mysql/init/` — Docker 首次部署时的初始化（01-schema + 02-seed + 03-upgrade）
- `docker/mysql/migrations/` — Docker 增量补丁（003-fix + 004-alignment）
- `drizzle/` — Drizzle ORM 自动生成的迁移（但 journal 损坏，且列名是 camelCase）
- `migrations/` — 独立的手写迁移（算法表）
- `server/services/access-layer.service.ts` — 运行时 ensureTable（接入层 3 张表）

### 6. 核心矛盾
- **schema.ts 定义了 121 张表，但实际 SQL 只覆盖了 65 张**（54+6+5）
- **drizzle 迁移使用 camelCase 列名，但 schema.ts 和 docker 迁移使用 snake_case**
- **drizzle journal 损坏**，无法正确追踪迁移历史
- **多处 ensureTable 绕过了迁移系统**
