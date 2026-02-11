/**
 * 行级示例数据 — DataBrowser 和 SqlEditor 共享
 */
import type { MockRow } from "./types";

export const MOCK_ROWS: Record<string, MockRow[]> = {
  asset_nodes: [
    { id: 1, node_id: "PORT-001", code: "QC-001", name: "1号岸桥", level: 1, node_type: "DEVICE", parent_node_id: "AREA-A", status: "active" },
    { id: 2, node_id: "PORT-002", code: "RTG-001", name: "1号场桥", level: 1, node_type: "DEVICE", parent_node_id: "AREA-B", status: "active" },
    { id: 3, node_id: "AREA-A", code: "AREA-A", name: "A区", level: 0, node_type: "AREA", parent_node_id: null, status: "active" },
  ],
  device_kpis: [
    { id: 1, device_code: "QC-001", metric_name: "vibration_rms", metric_value: 2.35, unit: "mm/s", collected_at: "2026-02-10 14:30:00" },
    { id: 2, device_code: "QC-001", metric_name: "temperature", metric_value: 67.8, unit: "°C", collected_at: "2026-02-10 14:30:00" },
    { id: 3, device_code: "RTG-001", metric_name: "current", metric_value: 125.6, unit: "A", collected_at: "2026-02-10 14:30:00" },
  ],
  diagnosis_rules: [
    { id: 1, rule_id: "RULE-VIB-001", name: "振动超限告警", device_type: "岸桥", severity: "warning", is_active: 1 },
    { id: 2, rule_id: "RULE-TEMP-001", name: "温度异常检测", device_type: "场桥", severity: "critical", is_active: 1 },
  ],
  data_slices: [
    { id: 1, slice_id: "SLC-20260210-001", name: "QC-001振动异常切片", source_table: "telemetry_vibration", record_count: 14400, status: "labeled" },
    { id: 2, slice_id: "SLC-20260210-002", name: "RTG-001温度飙升切片", source_table: "telemetry_temperature", record_count: 7200, status: "pending" },
  ],
  event_logs: [
    { id: 1, event_id: "EVT-001", event_type: "device.alarm.triggered", source: "diagnosis-engine", severity: "warning", created_at: "2026-02-10 14:35:00" },
    { id: 2, event_id: "EVT-002", event_type: "data.slice.created", source: "fsd-engine", severity: "info", created_at: "2026-02-10 14:36:00" },
  ],
  kb_documents: [
    { id: 1, collection_id: 1, title: "岸桥维护手册 v3.2", content_type: "pdf", status: "completed", chunks_count: 128 },
    { id: 2, collection_id: 1, title: "振动分析标准 GB/T 19873", content_type: "pdf", status: "processing", chunks_count: 0 },
  ],
  base_dict_items: [
    { id: 1, category_code: "DEVICE_TYPE", item_code: "QC", item_label: "岸桥", item_value: "quay_crane", sort_order: 1 },
    { id: 2, category_code: "DEVICE_TYPE", item_code: "RTG", item_label: "场桥", item_value: "rubber_tired_gantry", sort_order: 2 },
  ],
  users: [
    { id: 1, username: "admin", email: "admin@xilian.io", role: "admin", is_active: 1 },
    { id: 2, username: "operator01", email: "op01@xilian.io", role: "operator", is_active: 1 },
  ],
  plugin_registry: [
    { id: 1, name: "OPC-UA 协议插件", plugin_type: "protocol", version: "1.0.0", status: "active" },
    { id: 2, name: "振动频谱分析", plugin_type: "algorithm", version: "2.1.0", status: "active" },
  ],
  topo_nodes: [
    { id: 1, node_id: "mysql-master", node_type: "database", label: "MySQL 主库", status: "online" },
    { id: 2, node_id: "redis-01", node_type: "cache", label: "Redis 集群", status: "online" },
    { id: 3, node_id: "kafka-01", node_type: "queue", label: "Kafka Broker", status: "online" },
  ],
  audit_logs: [
    { id: 1, action_type: "CREATE", resource_type: "device", resource_id: "QC-001", resource_name: "1号岸桥", operator_id: "admin", operator_name: "管理员", status: "success", created_at: "2026-02-10 09:15:00" },
    { id: 2, action_type: "UPDATE", resource_type: "rule", resource_id: "RULE-VIB-001", resource_name: "振动超限告警", operator_id: "admin", operator_name: "管理员", status: "success", created_at: "2026-02-10 10:30:00" },
    { id: 3, action_type: "DELETE", resource_type: "plugin", resource_id: "3", resource_name: "废弃插件", operator_id: "admin", operator_name: "管理员", status: "failure", created_at: "2026-02-10 11:00:00" },
  ],
  audit_logs_sensitive: [
    { id: 1, audit_log_id: 10, sensitive_type: "password_change", risk_level: "high", requires_approval: 1, approved_by: "super_admin", approved_at: "2026-02-10 09:20:00", created_at: "2026-02-10 09:18:00" },
    { id: 2, audit_log_id: 15, sensitive_type: "permission_grant", risk_level: "medium", requires_approval: 0, approved_by: null, approved_at: null, created_at: "2026-02-10 10:45:00" },
  ],
  system_configs: [
    { id: 1, config_key: "system.name", config_value: '"XiLian IoT Platform"', config_group: "general", description: "系统名称", is_encrypted: 0 },
    { id: 2, config_key: "mqtt.broker.url", config_value: '"tcp://mqtt.xilian.io:1883"', config_group: "mqtt", description: "MQTT Broker 地址", is_encrypted: 0 },
    { id: 3, config_key: "db.password", config_value: '"***"', config_group: "database", description: "数据库密码", is_encrypted: 1 },
  ],
};

/** 获取表的示例数据行 */
export function getMockRows(tableName: string): MockRow[] {
  return MOCK_ROWS[tableName] || [];
}

/** 获取表的列名列表（从示例数据推断） */
export function getMockColumns(tableName: string): string[] {
  const rows = MOCK_ROWS[tableName];
  if (!rows || rows.length === 0) return [];
  return Object.keys(rows[0]);
}
