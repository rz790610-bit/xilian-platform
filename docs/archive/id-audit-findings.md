# ID 体系审计：Schema 层

## 三套 ID 在 schema 中的分布

### 仅使用 nodeId 的表（12 个）— 新体系
- asset_nodes (权威表)
- device_kpis
- device_maintenance_records
- device_operation_logs
- device_sampling_config
- kg_nodes, kg_edges, kg_graph_nodes, kg_graph_edges, kg_evolution_log
- pipeline_node_metrics
- topo_nodes, topo_edges, topo_layouts, topo_alerts

### 仅使用 deviceCode 的表（11 个）— 新体系
- alert_event_log
- algorithm_device_bindings, algorithm_executions
- data_collection_metrics
- device_daily_summary
- device_maintenance_logs
- device_protocol_config
- device_status_log
- diagnosis_results
- model_usage_logs
- realtime_data_latest, realtime_telemetry, vibration_1hour_agg

### 仅使用 sensorId 的表（2 个）
- data_collection_tasks
- sensor_mp_mapping

### 同时使用 nodeId + sensorId 的表（5 个）— 冲突区域
- anomaly_detections
- device_alerts
- diagnosis_tasks
- event_logs
- data_endpoints (sensorId only but related)

### 同时使用 nodeId + deviceCode 的表（1 个）— 冲突区域
- data_slices

### 同时使用 deviceCode + sensorId 的表（4 个）
- asset_sensors (权威表)
- data_clean_logs
- data_clean_tasks
- data_quality_reports
- sensor_calibrations

### 同时使用 nodeId + deviceCode + sensorId 的表（0 个）
无

### 使用 deviceId 的表（1 个）— 旧体系残留
- rollback_executions

## 关键关系链
asset_nodes.nodeId → asset_measurement_points.nodeId + deviceCode → asset_sensors.deviceCode + sensorId

即：nodeId 标识设备树节点，deviceCode 标识具体设备（是 nodeId 的一个属性），sensorId 标识传感器
