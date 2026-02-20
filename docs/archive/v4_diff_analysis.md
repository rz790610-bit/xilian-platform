# V4 手册 vs 现有 Drizzle Schema 差异分析

## 手册 V4 完整表清单（70 张 MySQL 表 + 5 ClickHouse 表）

### §11 基础配置域（6 张表）
1. base_node_templates - 已有
2. base_mp_templates - 已有
3. base_dict_categories - 已有
4. base_dict_items - 已有
5. base_label_dimensions - 已有
6. base_slice_rules - 已有

### §12 资产管理域（4 张表）
7. asset_nodes - 已有
8. asset_measurement_points - 已有
9. asset_sensors - 已有
10. sensor_mp_mapping - **需新增** (V4.0)

### §13 设备运维域（8 张表）
11. device_alerts - 已有
12. device_maintenance_records - 已有
13. device_kpis - 已有
14. device_operation_logs - 已有
15. device_sampling_config - 已有
16. device_spare_parts - 已有
17. device_protocol_config - **需新增** (V4.0)
18. device_rule_versions - **需新增** (V4.0)

### §14 诊断分析域（4 张表）
19. diagnosis_rules - 已有
20. diagnosis_tasks - 已有
21. anomaly_detections - 已有
22. sensor_calibrations - 已有

### §15 数据治理域（12 张表）
23. data_slices - 已有
24. data_slice_label_history - 已有
25. data_clean_tasks - 已有
26. data_clean_logs - 已有
27. data_quality_reports - 已有
28. data_assets - 已有
29. data_collection_tasks - 已有
30. data_collection_metrics - 已有
31. data_lifecycle_policies - 已有
32. data_governance_jobs - **需新增** (V4.0)
33. minio_cleanup_log - **需新增** (V4.0)
34. data_lineage - **需新增** (V4.0)

### §16 边缘采集域（1 张表）
35. edge_gateways - 已有

### §17 实时遥测域（1 张表）
36. realtime_telemetry - 已有

### §18 消息与任务域（5 张表）
37. event_logs - 已有
38. outbox_routing_config - 已有
39. idempotent_records - 已有
40. message_queue_log - **需新增** (V4.0)
41. async_task_log - **需新增** (V4.0)

### §19 AI 与知识域（11 张表）
42. models - 已有
43. model_fine_tune_tasks - 已有
44. model_evaluations - 已有
45. model_usage_logs - 已有
46. model_conversations - 已有
47. model_messages - 已有
48. kb_collections - 已有
49. kb_documents - 已有
50. kb_points - 已有
51. kg_nodes - 已有
52. kg_edges - 已有

### §20 系统拓扑域（5 张表）
53. topo_nodes - 已有
54. topo_edges - 已有
55. topo_layouts - 已有
56. system_capacity_metrics - 已有
57. users - 已有

### §21 插件引擎域（3 张表）
58. plugin_registry - **需新增** (V4.0)
59. plugin_instances - **需新增** (V4.0)
60. plugin_events - **需新增** (V4.0)

### §22 配置中心域（2 张表）
61. system_configs - **需新增** (V4.0)
62. config_change_logs - **需新增** (V4.0)

### §22a 运营管理域（3 张表）
63. alert_rules - **需新增** (V4.0)
64. audit_logs - **需新增** (V4.0)
65. data_export_tasks - **需新增** (V4.0)

### §22b 调度管理域（2 张表）
66. scheduled_tasks - **需新增** (V4.0)
67. rollback_triggers - **需新增** (V4.0)

### ClickHouse 表（5 张，不在 Drizzle 中）
- sensor_data
- sensor_data_daily
- device_status_log
- alert_event_log
- data_ingestion_log

## 汇总

| 类别 | 数量 |
|------|------|
| 手册 MySQL 表总数 | 67 |
| 现有 Drizzle 表 | 54（含 users、sessions 等） |
| 手册中已有的表 | 50 |
| **需新增的 V4.0 表** | **17** |
| ClickHouse 表（不在 Drizzle 中） | 5 |

## 需新增的 17 张表清单

1. sensor_mp_mapping (§12, 10 字段)
2. device_protocol_config (§13, 15 字段)
3. device_rule_versions (§13, 13 字段)
4. data_governance_jobs (§15, 13 字段)
5. minio_cleanup_log (§15, 8 字段)
6. data_lineage (§15, 12 字段)
7. message_queue_log (§18, 11 字段)
8. async_task_log (§18, 14 字段)
9. plugin_registry (§21, 19 字段)
10. plugin_instances (§21, 15 字段)
11. plugin_events (§21, 12 字段)
12. system_configs (§22, 14 字段)
13. config_change_logs (§22, 11 字段)
14. alert_rules (§22a, 17 字段)
15. audit_logs (§22a, 13 字段)
16. data_export_tasks (§22a, 17 字段)
17. scheduled_tasks (§22b, 21 字段)
18. rollback_triggers (§22b, 16 字段)

实际是 18 张新表（漏数了 rollback_triggers）。

## 现有表字段差异（需要补充的字段）

根据冲突优化报告：
- data_slices: 需要新增 trigger_type, trigger_confidence, storage_path, upload_status, source_type, data_points 6 个字段
- base_node_templates: +4 版本化字段 (is_current, version, created_by, updated_by)
- base_mp_templates: +4 版本化字段
- diagnosis_rules: +4 版本化字段（如果尚未有）
- asset_nodes: +3 字段 (category_path, maintenance_strategy, commissioned_date, lifecycle_status)
- asset_sensors: +6 字段 (mount_direction, protocol, sampling_rate, data_format, threshold_config, next_calibration_date)
- device_sampling_config: +7 字段 (gateway_id, endpoint, register_map, preprocessing_rules, trigger_rules, compression, storage_strategy)
- data_slice_label_history: +5 字段 (fault_class, confidence, label_source, review_status, reviewer_id, label_data)
- model_usage_logs: +5 字段 (device_code, sensor_code, inference_result, triggered_alert, feedback_status)
- models: +6 字段 (dataset_version, dataset_clip_count, dataset_total_duration_s, deployment_target, input_format, output_format)

## 外键关系
手册定义 40 条外键关系，需要在 Drizzle relations.ts 中补充新表的关系。
