/**
 * ER 图中表节点的默认位置
 * 按域分组布局，每域一个区域
 * V4.0: 覆盖全部 64 张表
 */
import type { ERNodePosition } from "./types";

/** 核心展示表的 ER 图位置 */
export const ER_POSITIONS: Record<string, ERNodePosition> = {
  // AI知识域
  models:                        { x: 1140, y:  440 },
  model_fine_tune_tasks:         { x: 1360, y:  440 },
  model_evaluations:             { x: 1140, y:  600 },
  model_usage_logs:              { x: 1360, y:  600 },
  model_conversations:           { x: 1140, y:  760 },
  model_messages:                { x: 1360, y:  760 },
  kb_collections:                { x:  940, y:  440 },
  kb_documents:                  { x:  940, y:  620 },
  kb_points:                     { x: 1140, y: 1080 },
  kg_nodes:                      { x: 1360, y: 1080 },
  kg_edges:                      { x: 1140, y: 1240 },
  // 资产管理域
  asset_nodes:                   { x:   80, y:   60 },
  asset_measurement_points:      { x:   80, y:  280 },
  asset_sensors:                 { x:  300, y:  170 },
  sensor_mp_mapping:             { x:  180, y:  400 },
  // 审计日志域
  audit_logs:                    { x: 1540, y:  920 },
  audit_logs_sensitive:          { x: 1540, y: 1080 },
  // 基础配置域
  base_node_templates:           { x:  300, y: 1420 },
  base_mp_templates:             { x:   80, y: 1420 },
  base_dict_categories:          { x:   80, y:  920 },
  base_dict_items:               { x:   80, y: 1060 },
  base_label_dimensions:         { x:   80, y: 1260 },
  base_label_options:            { x:  300, y: 1260 },
  base_code_rules:               { x:   80, y: 1400 },
  base_clean_rules:              { x:  300, y: 1100 },
  base_slice_rules:              { x:  300, y:  960 },
  // 数据治理域
  data_slices:                   { x:   80, y:  540 },
  data_clean_tasks:              { x:  300, y:  620 },
  data_clean_logs:               { x:   80, y:  700 },
  data_quality_reports:          { x:  300, y:  800 },
  data_slice_label_history:      { x:   80, y:  720 },
  data_assets:                   { x:  300, y:  860 },
  data_lifecycle_policies:       { x:   80, y: 1020 },
  data_collection_tasks:         { x:  900, y:  400 },
  data_collection_metrics:       { x:   80, y: 1180 },
  data_lineage:                  { x: 1120, y: 1120 },
  data_governance_jobs:          { x:  900, y: 1120 },
  // 设备运维域
  device_sampling_config:        { x:  520, y:  200 },
  device_protocol_config:        { x:  720, y:  120 },
  device_alerts:                 { x:  520, y:  200 },
  device_maintenance_records:    { x:  740, y:  200 },
  device_operation_logs:         { x:  520, y:  360 },
  device_spare_parts:            { x:  740, y:  360 },
  device_kpis:                   { x:  520, y:   40 },
  device_rule_versions:          { x:  740, y:  680 },
  // 诊断分析域
  diagnosis_rules:               { x:  940, y:   60 },
  diagnosis_tasks:               { x: 1160, y:   60 },
  anomaly_detections:            { x: 1140, y:   60 },
  sensor_calibrations:           { x:  520, y:  360 },
  // 边缘采集域
  edge_gateways:                 { x:  940, y:  400 },
  realtime_telemetry:            { x: 1160, y:  400 },
  // 消息与任务域
  event_logs:                    { x:  520, y:  540 },
  idempotent_records:            { x:  720, y:  620 },
  message_routing_config:        { x:  520, y:  700 },
  message_queue_log:             { x: 1520, y:  860 },
  async_task_log:                { x: 1300, y:  860 },
  // 插件引擎域
  plugin_registry:               { x: 1140, y:  920 },
  plugin_instances:              { x: 1140, y: 1080 },
  plugin_events:                 { x: 1340, y: 1000 },
  // 系统拓扑域
  topo_nodes:                    { x:  720, y:  920 },
  topo_edges:                    { x:  940, y:  920 },
  topo_layouts:                  { x:  720, y: 1080 },
  system_capacity_metrics:       { x:  940, y: 1080 },
  users:                         { x:  520, y:  920 },
};
