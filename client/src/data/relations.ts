/**
 * XiLian Platform — 外键关系定义
 * 对齐 V4.0 手册 §20 ER 关系
 */
import type { Relation } from "./types";

export const RELATIONS: Relation[] = [
  // 资产树自关联
  { from: "asset_nodes", fromCol: "node_id", to: "asset_nodes", toCol: "parent_node_id", type: "1:N", label: "父子层级" },
  // 资产 → 测点
  { from: "asset_nodes", fromCol: "node_id", to: "asset_measurement_points", toCol: "node_id", type: "1:N", label: "挂载测点" },
  // 资产 → 传感器
  { from: "asset_nodes", fromCol: "code", to: "asset_sensors", toCol: "device_code", type: "1:N", label: "绑定传感器" },
  // 传感器 ↔ 测点（多对多）
  { from: "asset_sensors", fromCol: "id", to: "sensor_mp_mapping", toCol: "sensor_id", type: "1:N", label: "传感器映射" },
  { from: "asset_measurement_points", fromCol: "id", to: "sensor_mp_mapping", toCol: "mp_id", type: "1:N", label: "测点映射" },
  // 设备 → KPI
  { from: "asset_nodes", fromCol: "code", to: "device_kpis", toCol: "device_code", type: "1:N", label: "设备指标" },
  // 设备 → 采样配置
  { from: "asset_nodes", fromCol: "code", to: "device_sampling_config", toCol: "device_code", type: "1:N", label: "采样配置" },
  // 设备 → 协议配置
  { from: "asset_nodes", fromCol: "code", to: "device_protocol_config", toCol: "device_code", type: "1:N", label: "协议配置" },
  // 设备 → 维护日志
  { from: "asset_nodes", fromCol: "code", to: "device_maintenance_logs", toCol: "device_code", type: "1:N", label: "维护记录" },
  // 设备 → 固件版本
  { from: "asset_nodes", fromCol: "code", to: "device_firmware_versions", toCol: "device_code", type: "1:N", label: "固件版本" },
  // 设备 → 传感器校准
  { from: "asset_nodes", fromCol: "code", to: "sensor_calibrations", toCol: "device_code", type: "1:N", label: "校准记录" },
  // 诊断规则 → 诊断结果
  { from: "diagnosis_rules", fromCol: "rule_id", to: "diagnosis_results", toCol: "rule_id", type: "1:N", label: "规则触发" },
  // 切片规则 → 数据切片
  { from: "base_slice_rules", fromCol: "rule_id", to: "data_slices", toCol: "trigger_rule_id", type: "1:N", label: "规则生成切片" },
  // 数据切片 → 标注历史
  { from: "data_slices", fromCol: "slice_id", to: "data_slice_label_history", toCol: "slice_id", type: "1:N", label: "标注记录" },
  // 清洗规则 → 清洗任务
  { from: "base_clean_rules", fromCol: "rule_id", to: "data_clean_tasks", toCol: "rule_id", type: "1:N", label: "规则执行" },
  // 清洗任务 → 清洗结果
  { from: "data_clean_tasks", fromCol: "task_id", to: "data_clean_results", toCol: "task_id", type: "1:N", label: "任务结果" },
  // 知识库集合 → 文档
  { from: "kb_collections", fromCol: "id", to: "kb_documents", toCol: "collection_id", type: "1:N", label: "集合文档" },
  // 文档 → 分块
  { from: "kb_documents", fromCol: "id", to: "kb_chunks", toCol: "document_id", type: "1:N", label: "文档分块" },
  // 分块 → 嵌入
  { from: "kb_chunks", fromCol: "id", to: "kb_embeddings", toCol: "chunk_id", type: "1:N", label: "向量化" },
  // 拓扑节点 → 边
  { from: "topo_nodes", fromCol: "node_id", to: "topo_edges", toCol: "source_id", type: "1:N", label: "出边" },
  { from: "topo_nodes", fromCol: "node_id", to: "topo_edges", toCol: "target_id", type: "1:N", label: "入边" },
  // 插件注册 → 实例
  { from: "plugin_registry", fromCol: "id", to: "plugin_instances", toCol: "plugin_id", type: "1:N", label: "插件实例" },
  // 插件实例 → 事件
  { from: "plugin_instances", fromCol: "id", to: "plugin_events", toCol: "instance_id", type: "1:N", label: "实例事件" },
  // 模型注册 → 部署
  { from: "model_registry", fromCol: "id", to: "model_deployments", toCol: "model_id", type: "1:N", label: "模型部署" },
  // 对话 → 消息
  { from: "kb_conversations", fromCol: "id", to: "kb_conversation_messages", toCol: "conversation_id", type: "1:N", label: "对话消息" },
  // 审计日志 → 敏感操作审计
  { from: "audit_logs", fromCol: "id", to: "audit_logs_sensitive", toCol: "audit_log_id", type: "1:N", label: "敏感操作分表" },
  // 规则 → 规则版本
  { from: "diagnosis_rules", fromCol: "rule_id", to: "device_rule_versions", toCol: "rule_id", type: "1:N", label: "规则版本" },
  // 数据治理 → 血缘追踪
  { from: "data_slices", fromCol: "slice_id", to: "data_lineage", toCol: "source_id", type: "1:N", label: "数据血缘" },
];
