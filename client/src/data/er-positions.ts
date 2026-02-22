/**
 * ER 图中表节点的默认位置
 * 按域分组布局，每域一个区域
 * V4.1: 覆盖全部 70 张表
 */
import type { ERNodePosition } from "./types";
/** 核心展示表的 ER 图位置 */
export const ER_POSITIONS: Record<string, ERNodePosition> = {
  // 资产管理域
  asset_measurement_points: { x:   80, y:  280 },
  asset_nodes:              { x:   80, y:   60 },
  asset_sensors:            { x:  300, y:  170 },
  sensor_mp_mapping:        { x:  180, y:  400 },
  // 设备运维域
  alert_rules:              { x:  520, y:  520 },
  device_firmware_versions: { x:  740, y:  520 },
  device_kpis:              { x:  520, y:   40 },
  device_maintenance_logs:  { x:  520, y:  680 },
  device_protocol_config:   { x:  720, y:  120 },
  device_rule_versions:     { x:  740, y:  680 },
  device_sampling_config:   { x:  520, y:  200 },
  sensor_calibrations:      { x:  520, y:  360 },
  // 基础配置域
  base_clean_rules:      { x:  300, y: 1100 },
  base_dict_categories:  { x:   80, y:  920 },
  base_dict_items:       { x:   80, y: 1060 },
  base_label_dimensions: { x:   80, y: 1260 },
  base_label_options:    { x:  300, y: 1260 },
  base_mp_templates:     { x:   80, y: 1420 },
  base_node_templates:   { x:  300, y: 1420 },
  base_slice_rules:      { x:  300, y:  960 },
  system_configs:        { x:  520, y: 1060 },
  users:                 { x:  520, y:  920 },
  // 诊断分析域
  anomaly_detections: { x: 1140, y:   60 },
  anomaly_models:     { x:  520, y:  400 },
  diagnosis_results:  { x:  940, y:  240 },
  diagnosis_rules:    { x:  940, y:   60 },
  // 数据治理域
  data_clean_results:       { x:  900, y:  960 },
  data_clean_tasks:         { x:  300, y:  620 },
  data_export_tasks:        { x: 1120, y:  960 },
  data_governance_jobs:     { x:  900, y: 1120 },
  data_lineage:             { x: 1120, y: 1120 },
  data_quality_reports:     { x:  300, y:  800 },
  data_slice_label_history: { x:   80, y:  720 },
  data_slices:              { x:   80, y:  540 },
  minio_cleanup_log:        { x:  900, y: 1280 },
  minio_file_metadata:      { x: 1120, y: 1280 },
  minio_upload_logs:        { x:  900, y: 1440 },
  // 边缘采集域
  data_collection_tasks: { x:  900, y:  400 },
  edge_gateway_config:   { x: 1120, y:  400 },
  // 实时遥测域
  alert_event_log:      { x: 1300, y:   60 },
  device_daily_summary: { x: 1520, y:   60 },
  device_status_log:    { x: 1300, y:  220 },
  realtime_data_latest: { x: 1520, y:  220 },
  vibration_1hour_agg:  { x: 1300, y:  380 },
  // 消息与任务域
  async_task_log:         { x: 1300, y:  860 },
  event_logs:             { x:  520, y:  540 },
  idempotent_records:     { x:  720, y:  620 },
  message_queue_log:      { x: 1520, y:  860 },
  message_routing_config: { x:  520, y:  700 },
  // AI知识域
  kb_chunks:                { x: 1140, y:  540 },
  kb_collections:           { x:  940, y:  440 },
  kb_conversation_messages: { x: 1700, y:  880 },
  kb_conversations:         { x: 1920, y:  880 },
  kb_documents:             { x:  940, y:  620 },
  kb_embeddings:            { x: 1140, y:  720 },
  kb_qa_pairs:              { x: 1700, y: 1040 },
  model_deployments:        { x: 1920, y: 1040 },
  model_inference_logs:     { x: 1700, y: 1200 },
  model_registry:           { x: 1340, y:  440 },
  model_training_jobs:      { x: 1920, y: 1200 },
  // 系统拓扑域
  audit_logs:           { x: 1540, y:  920 },
  audit_logs_sensitive: { x: 1540, y: 1080 },
  topo_alerts:          { x: 1700, y: 1240 },
  topo_edges:           { x:  940, y:  920 },
  topo_layers:          { x:  720, y: 1080 },
  topo_nodes:           { x:  720, y:  920 },
  topo_snapshots:       { x: 1920, y: 1240 },
  // 插件引擎域
  plugin_events:    { x: 1340, y: 1000 },
  plugin_instances: { x: 1140, y: 1080 },
  plugin_registry:  { x: 1140, y:  920 },
};
