/**
 * XiLian Platform V4.0 — 外键关系定义
 * 对齐 V4.0 手册 §20 ER 关系 — 全部引用 64 张有效表
 */
import type { Relation } from "./types";

export const RELATIONS: Relation[] = [
  // ━━━ 资产树核心链路 ━━━
  { from: "asset_nodes", fromCol: "node_id", to: "asset_nodes", toCol: "parent_node_id", type: "1:N", label: "父子层级" },
  { from: "asset_nodes", fromCol: "node_id", to: "asset_measurement_points", toCol: "node_id", type: "1:N", label: "挂载测点" },
  { from: "asset_nodes", fromCol: "code", to: "asset_sensors", toCol: "device_code", type: "1:N", label: "绑定传感器" },
  { from: "asset_sensors", fromCol: "id", to: "sensor_mp_mapping", toCol: "sensor_id", type: "1:N", label: "传感器映射" },
  { from: "asset_measurement_points", fromCol: "id", to: "sensor_mp_mapping", toCol: "mp_id", type: "1:N", label: "测点映射" },

  // ━━━ 设备运维链路 ━━━
  { from: "asset_nodes", fromCol: "code", to: "device_kpis", toCol: "device_code", type: "1:N", label: "设备指标" },
  { from: "asset_nodes", fromCol: "code", to: "device_sampling_config", toCol: "device_code", type: "1:N", label: "采样配置" },
  { from: "asset_nodes", fromCol: "code", to: "device_protocol_config", toCol: "device_code", type: "1:N", label: "协议配置" },
  { from: "asset_nodes", fromCol: "code", to: "device_maintenance_records", toCol: "device_code", type: "1:N", label: "维护记录" },
  { from: "asset_nodes", fromCol: "code", to: "device_alerts", toCol: "device_code", type: "1:N", label: "设备告警" },
  { from: "asset_nodes", fromCol: "code", to: "device_operation_logs", toCol: "device_code", type: "1:N", label: "操作日志" },
  { from: "asset_nodes", fromCol: "code", to: "sensor_calibrations", toCol: "device_code", type: "1:N", label: "校准记录" },
  { from: "diagnosis_rules", fromCol: "rule_id", to: "device_rule_versions", toCol: "rule_id", type: "1:N", label: "规则版本" },

  // ━━━ 诊断分析链路 ━━━
  { from: "diagnosis_rules", fromCol: "rule_id", to: "diagnosis_tasks", toCol: "rule_id", type: "1:N", label: "规则触发" },
  { from: "diagnosis_rules", fromCol: "rule_id", to: "anomaly_detections", toCol: "rule_id", type: "1:N", label: "异常检测" },

  // ━━━ 数据治理链路 ━━━
  { from: "base_slice_rules", fromCol: "rule_id", to: "data_slices", toCol: "trigger_rule_id", type: "1:N", label: "规则生成切片" },
  { from: "data_slices", fromCol: "slice_id", to: "data_slice_label_history", toCol: "slice_id", type: "1:N", label: "标注记录" },
  { from: "base_clean_rules", fromCol: "rule_id", to: "data_clean_tasks", toCol: "rule_id", type: "1:N", label: "规则执行" },
  { from: "data_clean_tasks", fromCol: "task_id", to: "data_clean_logs", toCol: "task_id", type: "1:N", label: "任务日志" },
  { from: "data_slices", fromCol: "slice_id", to: "data_lineage", toCol: "source_id", type: "1:N", label: "数据血缘" },
  { from: "data_assets", fromCol: "id", to: "data_lifecycle_policies", toCol: "asset_id", type: "1:N", label: "生命周期" },
  { from: "data_governance_jobs", fromCol: "id", to: "data_quality_reports", toCol: "job_id", type: "1:N", label: "治理报告" },

  // ━━━ 知识库链路 ━━━
  { from: "kb_collections", fromCol: "id", to: "kb_documents", toCol: "collection_id", type: "1:N", label: "集合文档" },
  { from: "kb_documents", fromCol: "id", to: "kb_points", toCol: "document_id", type: "1:N", label: "文档知识点" },
  { from: "kg_nodes", fromCol: "id", to: "kg_edges", toCol: "source_id", type: "1:N", label: "出边" },
  { from: "kg_nodes", fromCol: "id", to: "kg_edges", toCol: "target_id", type: "1:N", label: "入边" },

  // ━━━ 模型中心链路 ━━━
  { from: "models", fromCol: "id", to: "model_fine_tune_tasks", toCol: "model_id", type: "1:N", label: "微调任务" },
  { from: "models", fromCol: "id", to: "model_evaluations", toCol: "model_id", type: "1:N", label: "模型评估" },
  { from: "models", fromCol: "id", to: "model_usage_logs", toCol: "model_id", type: "1:N", label: "使用日志" },
  { from: "models", fromCol: "id", to: "model_conversations", toCol: "model_id", type: "1:N", label: "模型对话" },
  { from: "model_conversations", fromCol: "id", to: "model_messages", toCol: "conversation_id", type: "1:N", label: "对话消息" },

  // ━━━ 系统拓扑链路 ━━━
  { from: "topo_nodes", fromCol: "node_id", to: "topo_edges", toCol: "source_id", type: "1:N", label: "出边" },
  { from: "topo_nodes", fromCol: "node_id", to: "topo_edges", toCol: "target_id", type: "1:N", label: "入边" },

  // ━━━ 插件引擎链路 ━━━
  { from: "plugin_registry", fromCol: "id", to: "plugin_instances", toCol: "plugin_id", type: "1:N", label: "插件实例" },
  { from: "plugin_instances", fromCol: "id", to: "plugin_events", toCol: "instance_id", type: "1:N", label: "实例事件" },

  // ━━━ 审计链路 ━━━
  { from: "audit_logs", fromCol: "id", to: "audit_logs_sensitive", toCol: "audit_log_id", type: "1:N", label: "敏感操作分表" },

  // ━━━ 消息/任务链路 ━━━
  { from: "event_logs", fromCol: "event_id", to: "idempotent_records", toCol: "event_id", type: "1:1", label: "幂等校验" },
  { from: "message_routing_config", fromCol: "id", to: "message_queue_log", toCol: "route_id", type: "1:N", label: "路由日志" },

  // ━━━ 边缘采集链路 ━━━
  { from: "edge_gateways", fromCol: "id", to: "realtime_telemetry", toCol: "gateway_id", type: "1:N", label: "网关遥测" },
];
