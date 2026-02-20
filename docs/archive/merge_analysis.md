# 深度审查结果：xilian-platform 现有架构 vs V4 手册

## 现有 Drizzle Schema (54 张表)

### 已有表清单（按域分类）
1. **用户**: users
2. **知识库**: kb_collections, kb_documents, kb_points
3. **知识图谱**: kg_nodes, kg_edges
4. **系统拓扑**: topo_nodes, topo_edges, topo_layouts
5. **模型管理**: models, model_conversations, model_messages, model_fine_tune_tasks, model_evaluations, model_usage_logs
6. **事件/诊断**: event_logs, anomaly_detections, diagnosis_rules, diagnosis_tasks
7. **设备扩展**: device_maintenance_records, device_spare_parts, device_operation_logs, device_alerts, device_kpis, device_sampling_config
8. **性能优化**: outbox_events, outbox_routing_config, saga_instances, saga_steps, saga_dead_letters, processed_events, idempotent_records, rollback_executions, system_capacity_metrics
9. **数据库模块v1.5**: base_code_rules, base_node_templates, base_mp_templates, asset_nodes, asset_measurement_points, asset_sensors, base_label_dimensions, base_label_options, base_slice_rules, data_slices, data_slice_label_history, base_clean_rules, data_clean_tasks, data_clean_logs, data_quality_reports, sensor_calibrations, base_dict_categories, base_dict_items, event_store, event_snapshots

## V4 手册要求的 70 张表（14 域）

### 需要新增的表（对比后缺失的）
根据 V4 手册，以下表在现有 Drizzle schema 中不存在：

1. **sensor_mp_mapping** - 传感器-测点映射
2. **device_protocol_config** - 设备协议配置
3. **device_rule_versions** - 诊断规则版本
4. **data_lineage** - 数据血缘
5. **data_governance_jobs** - 数据治理任务
6. **data_export_tasks** - 数据导出任务
7. **message_queue_log** - 消息队列日志
8. **async_task_log** - 异步任务日志
9. **plugin_registry** - 插件注册表
10. **plugin_instances** - 插件实例
11. **plugin_events** - 插件事件
12. **message_routing_config** - 消息路由配置
13. **topo_snapshots** - 拓扑快照
14. **topo_alerts** - 拓扑告警
15. **audit_logs** - 审计日志
16. **audit_logs_sensitive** - 敏感审计日志
17. **system_configs** - 系统配置
18. **alert_rules** - 告警规则
19. **device_maintenance_logs** - 设备维保日志（与 device_maintenance_records 不同）

## 融合方案

### 原则
1. **不修改现有 54 张表的任何字段** — 保持后端 tRPC 链路完整
2. **只新增缺失表** — 在 schema.ts 末尾追加新表定义
3. **新增 tRPC router** — 为新表提供 CRUD 接口
4. **前端页面接入真实 tRPC** — 替换 Mock 数据

### 执行步骤
1. 在 drizzle/schema.ts 末尾追加 ~16 张新表
2. 在 drizzle/relations.ts 中定义外键关系
3. 创建 server/services/database/v4.service.ts 提供新表服务
4. 在 server/api/database.router.ts 中注册新路由
5. 运行 drizzle-kit push 同步到数据库
6. 更新前端数据库模块页面接入真实 tRPC
