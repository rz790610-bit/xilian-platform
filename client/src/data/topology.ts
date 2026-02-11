/**
 * XiLian Platform — 系统拓扑映射
 * 每张核心表在系统中的数据流位置
 */
import type { TopoMapping } from "./types";

export const TOPO_MAP: Record<string, TopoMapping> = {
  asset_nodes: {
    description: "设备资产主表，被设备管理服务直接读写，数据通过MQTT网关从PLC采集后写入",
    nodes: [
      { id: "plc", label: "PLC 控制器", type: "device", status: "online", icon: "Cpu" },
      { id: "mqtt", label: "MQTT 网关", type: "gateway", status: "online", icon: "Network" },
      { id: "device-svc", label: "设备管理服务", type: "service", status: "online", icon: "Server" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "asset_nodes", label: "asset_nodes", type: "table", status: "online", icon: "Layers" },
    ],
    edges: [
      { from: "plc", to: "mqtt", label: "Modbus/TCP" },
      { from: "mqtt", to: "device-svc", label: "MQTT Pub/Sub" },
      { from: "device-svc", to: "mysql", label: "Drizzle ORM" },
      { from: "mysql", to: "asset_nodes", label: "InnoDB" },
    ],
  },
  device_kpis: {
    description: "设备KPI时序数据表，由数据采集Pipeline写入，供Dashboard和告警引擎读取",
    nodes: [
      { id: "collector", label: "数据采集 Pipeline", type: "service", status: "online", icon: "Activity" },
      { id: "kafka", label: "Kafka", type: "queue", status: "online", icon: "Network" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "device_kpis", label: "device_kpis", type: "table", status: "online", icon: "Layers" },
      { id: "dashboard", label: "Dashboard 服务", type: "service", status: "online", icon: "Activity" },
      { id: "alert-engine", label: "告警引擎", type: "service", status: "warning", icon: "Activity" },
    ],
    edges: [
      { from: "collector", to: "kafka", label: "Produce" },
      { from: "kafka", to: "mysql", label: "Consume & Write" },
      { from: "mysql", to: "device_kpis", label: "InnoDB" },
      { from: "device_kpis", to: "dashboard", label: "聚合查询" },
      { from: "device_kpis", to: "alert-engine", label: "阈值检测" },
    ],
  },
  diagnosis_rules: {
    description: "诊断规则配置表，由管理后台维护，告警引擎实时加载规则进行评估",
    nodes: [
      { id: "admin", label: "管理后台", type: "service", status: "online", icon: "Server" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "diagnosis_rules", label: "diagnosis_rules", type: "table", status: "online", icon: "Layers" },
      { id: "alert-engine", label: "告警引擎", type: "service", status: "online", icon: "Activity" },
      { id: "redis", label: "Redis 缓存", type: "cache", status: "online", icon: "Database" },
    ],
    edges: [
      { from: "admin", to: "mysql", label: "CRUD" },
      { from: "mysql", to: "diagnosis_rules", label: "InnoDB" },
      { from: "diagnosis_rules", to: "redis", label: "规则缓存" },
      { from: "redis", to: "alert-engine", label: "热加载" },
    ],
  },
  event_logs: {
    description: "事件日志表，记录所有领域事件，通过消息路由配置分发到对应消费者",
    nodes: [
      { id: "domain-svc", label: "领域服务", type: "service", status: "online", icon: "Server" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "event_logs", label: "event_logs", type: "table", status: "online", icon: "Layers" },
      { id: "kafka", label: "Kafka 消息队列", type: "queue", status: "online", icon: "Network" },
      { id: "consumers", label: "事件消费者", type: "service", status: "online", icon: "Activity" },
    ],
    edges: [
      { from: "domain-svc", to: "mysql", label: "事务写入" },
      { from: "mysql", to: "event_logs", label: "InnoDB" },
      { from: "event_logs", to: "kafka", label: "CDC/轮询" },
      { from: "kafka", to: "consumers", label: "分发消费" },
    ],
  },
  kb_documents: {
    description: "知识库文档表，文件存储在MinIO，元数据在MySQL，向量化后写入Qdrant",
    nodes: [
      { id: "upload-svc", label: "上传服务", type: "service", status: "online", icon: "Server" },
      { id: "minio", label: "MinIO 对象存储", type: "storage", status: "online", icon: "Database" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "kb_documents", label: "kb_documents", type: "table", status: "online", icon: "Layers" },
      { id: "qdrant", label: "Qdrant 向量库", type: "vector", status: "online", icon: "MapPin" },
    ],
    edges: [
      { from: "upload-svc", to: "minio", label: "文件存储" },
      { from: "upload-svc", to: "mysql", label: "元数据" },
      { from: "mysql", to: "kb_documents", label: "InnoDB" },
      { from: "kb_documents", to: "qdrant", label: "向量化" },
    ],
  },
  data_slices: {
    description: "数据切片表，FSD智能切片引擎根据异常检测自动生成，供标注和训练使用",
    nodes: [
      { id: "fsd-engine", label: "FSD 切片引擎", type: "service", status: "online", icon: "Activity" },
      { id: "clickhouse", label: "ClickHouse", type: "database", status: "online", icon: "Database" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "data_slices", label: "data_slices", type: "table", status: "online", icon: "Layers" },
      { id: "labeling", label: "标注平台", type: "service", status: "online", icon: "Server" },
    ],
    edges: [
      { from: "fsd-engine", to: "clickhouse", label: "时序查询" },
      { from: "fsd-engine", to: "mysql", label: "写入切片" },
      { from: "mysql", to: "data_slices", label: "InnoDB" },
      { from: "data_slices", to: "labeling", label: "标注任务" },
    ],
  },
  plugin_registry: {
    description: "插件注册表，管理协议/算法/可视化等插件的生命周期",
    nodes: [
      { id: "plugin-mgr", label: "插件管理器", type: "service", status: "online", icon: "Server" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "plugin_registry", label: "plugin_registry", type: "table", status: "online", icon: "Layers" },
      { id: "docker", label: "Docker Runtime", type: "runtime", status: "online", icon: "Cpu" },
      { id: "instances", label: "插件实例", type: "service", status: "online", icon: "Activity" },
    ],
    edges: [
      { from: "plugin-mgr", to: "mysql", label: "注册/查询" },
      { from: "mysql", to: "plugin_registry", label: "InnoDB" },
      { from: "plugin-mgr", to: "docker", label: "启动容器" },
      { from: "docker", to: "instances", label: "运行实例" },
    ],
  },
  audit_logs: {
    description: "审计日志表，记录所有关键操作，敏感操作分表存储到 audit_logs_sensitive",
    nodes: [
      { id: "api-gateway", label: "API 网关", type: "gateway", status: "online", icon: "Network" },
      { id: "audit-svc", label: "审计服务", type: "service", status: "online", icon: "Server" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "audit_logs", label: "audit_logs", type: "table", status: "online", icon: "Layers" },
      { id: "audit_logs_sensitive", label: "audit_logs_sensitive", type: "table", status: "online", icon: "Layers" },
      { id: "security-dashboard", label: "安全中心", type: "service", status: "online", icon: "Activity" },
    ],
    edges: [
      { from: "api-gateway", to: "audit-svc", label: "AOP 拦截" },
      { from: "audit-svc", to: "mysql", label: "写入日志" },
      { from: "mysql", to: "audit_logs", label: "InnoDB" },
      { from: "mysql", to: "audit_logs_sensitive", label: "敏感分表" },
      { from: "audit_logs", to: "security-dashboard", label: "审计查询" },
    ],
  },
  system_capacity_metrics: {
    description: "系统容量指标表，存储各服务节点的资源使用情况，通过 Redis 缓存加速访问",
    nodes: [
      { id: "admin", label: "监控服务", type: "service", status: "online", icon: "Server" },
      { id: "mysql", label: "MySQL 主库", type: "database", status: "online", icon: "Database" },
      { id: "system_capacity_metrics", label: "system_capacity_metrics", type: "table", status: "online", icon: "Layers" },
      { id: "redis", label: "Redis 缓存", type: "cache", status: "online", icon: "Database" },
      { id: "all-services", label: "全平台服务", type: "service", status: "online", icon: "Activity" },
    ],
    edges: [
      { from: "admin", to: "mysql", label: "指标写入" },
      { from: "mysql", to: "system_capacity_metrics", label: "InnoDB" },
      { from: "system_capacity_metrics", to: "redis", label: "指标缓存" },
      { from: "redis", to: "all-services", label: "容量查询" },
    ],
  },
};
