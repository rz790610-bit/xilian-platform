# 数据库实际表 vs Drizzle Schema 对比分析

## 实际数据库表（portai_nexus，共 109 张）

__drizzle_migrations, alert_rules, algorithm_compositions, algorithm_definitions,
algorithm_device_bindings, algorithm_executions, algorithm_routing_rules, anomaly_detections,
asset_measurement_points, asset_nodes, asset_sensors, audit_logs, base_clean_rules,
base_code_rules, base_dict_categories, base_dict_items, base_label_dimensions,
base_label_options, base_mp_templates, base_node_templates, base_slice_rules,
canary_deployments, canary_traffic_splits, champion_challenger_experiments,
cognition_dimension_results, cognition_sessions, condition_baselines, condition_instances,
condition_profiles, config_change_logs, data_aggregations, data_assets, data_bindings,
data_clean_logs, data_clean_tasks, data_collection_metrics, data_collection_tasks,
data_connectors, data_endpoints, data_export_tasks, data_lifecycle_policies, data_lineage,
data_quality_reports, data_slice_label_history, data_slices, device_alerts, device_kpis,
device_maintenance_records, device_operation_logs, device_rule_versions,
device_sampling_config, device_spare_parts, devices, diagnosis_physics_formulas,
diagnosis_rules, diagnosis_tasks, edge_cases, edge_gateways, equipment_profiles,
event_logs, event_snapshots, event_store, evolution_cycles, feature_definitions,
feature_versions, grok_reasoning_chains, guardrail_rules, guardrail_violations,
idempotent_records, kb_collections, kb_documents, kb_points, kg_edges, kg_nodes,
knowledge_crystals, model_conversations, model_evaluations, model_fine_tune_tasks,
model_messages, model_usage_logs, models, outbox_events, outbox_routing_config,
plugin_events, plugin_instances, plugin_registry, processed_events, realtime_telemetry,
rollback_executions, rollback_triggers, saga_dead_letters, saga_instances, saga_steps,
sampling_configs, scheduled_tasks, sensor_aggregates, sensor_calibrations, sensor_readings,
sensors, shadow_eval_metrics, shadow_eval_records, system_capacity_metrics, telemetry_data,
tool_definitions, topo_edges, topo_layouts, topo_nodes, users, world_model_predictions,
world_model_snapshots

## getTopologyStatus 引用的表

### 来自 evolution-schema.ts
- cognitionSessions → cognition_sessions ✅ 存在
- grokReasoningChains → grok_reasoning_chains ✅ 存在
- guardrailViolations → guardrail_violations ✅ 存在
- guardrailRules → guardrail_rules ✅ 存在
- conditionProfiles → condition_profiles ✅ 存在
- samplingConfigs → sampling_configs ✅ 存在
- knowledgeCrystals → knowledge_crystals ✅ 存在
- featureDefinitions → feature_definitions ✅ 存在
- evolutionCycles → evolution_cycles ✅ 存在
- shadowEvalRecords → shadow_eval_records ✅ 存在
- championChallengerExperiments → champion_challenger_experiments ✅ 存在
- equipmentProfiles → equipment_profiles ✅ 存在
- toolDefinitions → tool_definitions ✅ 存在
- edgeCases → edge_cases ✅ 存在

### 来自 schema.ts
- dataConnectors → data_connectors ✅ 存在
- kgNodes → kg_nodes ✅ 存在
- kgEdges → kg_edges ✅ 存在
- pipelines → ??? 需要检查 schema.ts 中映射的实际表名
- pipelineRuns → ??? 需要检查 schema.ts 中映射的实际表名

## 关键发现
- **pipelines 和 pipelineRuns** — 数据库中没有名为 `pipelines` 或 `pipeline_runs` 的表！
  这两个表在 schema.ts 中定义，但数据库中不存在，这就是导致整个查询报错的根本原因。
