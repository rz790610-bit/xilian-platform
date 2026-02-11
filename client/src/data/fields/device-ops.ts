/**
 * V4.0 device-ops 域表定义
 * 表数量: 8
 */
import type { TableRegistryEntry } from "../types";

export const DEVICE_OPS_TABLES: TableRegistryEntry[] = [
{
    "tableName": "device_sampling_config",
    "tableComment": "",
    "displayName": "采样配置",
    "description": "采样配置管理",
    "domain": "device-ops",
    "icon": "Cpu",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
        "name": "id",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": true,
        "autoIncrement": true,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "node_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "sensor_type",
        "type": "VARCHAR",
        "length": "50",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "base_sampling_rate_ms",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1000",
        "comment": ""
      },
      {
        "name": "current_sampling_rate_ms",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1000",
        "comment": ""
      },
      {
        "name": "min_sampling_rate_ms",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "100",
        "comment": ""
      },
      {
        "name": "max_sampling_rate_ms",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "60000",
        "comment": ""
      },
      {
        "name": "adaptive_enabled",
        "type": "TINYINT",
        "length": "1",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": ""
      },
      {
        "name": "last_adjusted_at",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "adjustment_reason",
        "type": "VARCHAR",
        "length": "200",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "priority",
        "type": "ENUM",
        "length": "'low','normal','high','critical'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "normal",
        "comment": ""
      },
      {
        "name": "created_at",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP",
        "comment": ""
      },
      {
        "name": "updated_at",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP",
        "comment": ""
      },
      {
        "name": "gateway_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联边缘网关 → edge_gateways"
      },
      {
        "name": "endpoint",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "连接参数(port/baudrate/slave_id)"
      },
      {
        "name": "register_map",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "寄存器映射"
      },
      {
        "name": "preprocessing_rules",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "边缘预处理规则(compute_rms/peak/kurtosis)"
      },
      {
        "name": "trigger_rules",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "FSD触发规则(rms_threshold/buffer_before_s/buffer_after_s)"
      },
      {
        "name": "compression",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "zstd-5",
        "comment": "压缩算法(zstd-5/snappy/none)"
      },
      {
        "name": "storage_strategy",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "L0+L1",
        "comment": "存储策略(L0+L1/L1_only/L0_only)"
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "INT",
        "pk": true
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "sensor_type",
        "type": "VARCHAR(50)"
      },
      {
        "name": "base_sampling_rate_ms",
        "type": "INT"
      },
      {
        "name": "current_sampling_rate_ms",
        "type": "INT"
      },
      {
        "name": "min_sampling_rate_ms",
        "type": "INT"
      },
      {
        "name": "max_sampling_rate_ms",
        "type": "INT"
      },
      {
        "name": "adaptive_enabled",
        "type": "TINYINT(1)"
      }
    ]
  },
{
    "tableName": "device_protocol_config",
    "tableComment": "设备通信协议配置",
    "displayName": "协议配置",
    "description": "协议配置（V4.0新增）",
    "domain": "device-ops",
    "icon": "Cpu",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
        "name": "id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": true,
        "autoIncrement": true,
        "unique": false,
        "defaultVal": "",
        "comment": "主键"
      },
      {
        "name": "protocol_name",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "协议名称"
      },
      {
        "name": "protocol_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "协议类型(modbus/opcua/mqtt/bacnet)"
      },
      {
        "name": "device_type",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "适用设备类型"
      },
      {
        "name": "connection_params",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "连接参数JSON"
      },
      {
        "name": "register_map",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "寄存器映射"
      },
      {
        "name": "polling_interval_ms",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1000",
        "comment": "轮询间隔(ms)"
      },
      {
        "name": "timeout_ms",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "5000",
        "comment": "超时时间(ms)"
      },
      {
        "name": "retry_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "3",
        "comment": "重试次数"
      },
      {
        "name": "is_enabled",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": "是否启用"
      },
      {
        "name": "description",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "描述"
      },
      {
        "name": "created_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP(3)",
        "comment": "创建时间"
      },
      {
        "name": "updated_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "更新时间"
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "pk": true
      },
      {
        "name": "protocol_name",
        "type": "VARCHAR"
      },
      {
        "name": "protocol_type",
        "type": "VARCHAR"
      },
      {
        "name": "device_type",
        "type": "VARCHAR"
      },
      {
        "name": "connection_params",
        "type": "JSON"
      },
      {
        "name": "register_map",
        "type": "JSON"
      },
      {
        "name": "polling_interval_ms",
        "type": "INT"
      },
      {
        "name": "timeout_ms",
        "type": "INT"
      },
      {
        "name": "retry_count",
        "type": "INT"
      },
      {
        "name": "is_enabled",
        "type": "TINYINT"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      },
      {
        "name": "updated_at",
        "type": "DATETIME"
      }
    ]
  },
{
        "tableName": "device_alerts",
        "tableComment": "设备告警",
        "displayName": "设备告警记录",
        "description": "记录设备运行中产生的各类告警信息",
        "domain": "device-ops",
        "icon": "Bell",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "alert_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "node_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "sensor_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "title", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "message", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "acknowledged_by", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "acknowledged_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "resolved_by", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "resolved_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "resolution", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "escalation_level", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "notifications_sent", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metadata", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "alert_id", "type": "VARCHAR" },
            { "name": "node_id", "type": "VARCHAR" },
            { "name": "sensor_id", "type": "VARCHAR" },
            { "name": "title", "type": "VARCHAR" },
            { "name": "message", "type": "TEXT" },
            { "name": "acknowledged_by", "type": "VARCHAR" },
            { "name": "acknowledged_at", "type": "TIMESTAMP" },
            { "name": "resolved_by", "type": "VARCHAR" },
            { "name": "resolved_at", "type": "TIMESTAMP" },
            { "name": "resolution", "type": "TEXT" },
            { "name": "escalation_level", "type": "INT" },
            { "name": "notifications_sent", "type": "JSON" },
            { "name": "metadata", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "device_maintenance_records",
        "tableComment": "维保记录",
        "displayName": "维保记录",
        "description": "设备维护保养记录管理",
        "domain": "device-ops",
        "icon": "Wrench",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "record_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "node_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "title", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "scheduled_date", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "started_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "completed_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "assigned_to", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "performed_by", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "currency", "type": "VARCHAR", "length": "10", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "CNY", "comment": "" },
            { "name": "parts", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "findings", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "recommendations", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "attachments", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "next_maintenance_date", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "record_id", "type": "VARCHAR" },
            { "name": "node_id", "type": "VARCHAR" },
            { "name": "title", "type": "VARCHAR" },
            { "name": "description", "type": "TEXT" },
            { "name": "scheduled_date", "type": "TIMESTAMP" },
            { "name": "started_at", "type": "TIMESTAMP" },
            { "name": "completed_at", "type": "TIMESTAMP" },
            { "name": "assigned_to", "type": "VARCHAR" },
            { "name": "performed_by", "type": "VARCHAR" },
            { "name": "currency", "type": "VARCHAR" },
            { "name": "parts", "type": "JSON" },
            { "name": "findings", "type": "TEXT" },
            { "name": "recommendations", "type": "TEXT" },
            { "name": "attachments", "type": "JSON" },
            { "name": "next_maintenance_date", "type": "TIMESTAMP" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "device_operation_logs",
        "tableComment": "操作日志",
        "displayName": "操作日志",
        "description": "设备操作行为日志",
        "domain": "device-ops",
        "icon": "ClipboardList",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "log_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "node_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "previous_state", "type": "VARCHAR", "length": "50", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "new_state", "type": "VARCHAR", "length": "50", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "operated_by", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "reason", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "details", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "success", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "true", "comment": "" },
            { "name": "error_message", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "duration", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "timestamp", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "log_id", "type": "VARCHAR" },
            { "name": "node_id", "type": "VARCHAR" },
            { "name": "previous_state", "type": "VARCHAR" },
            { "name": "new_state", "type": "VARCHAR" },
            { "name": "operated_by", "type": "VARCHAR" },
            { "name": "reason", "type": "TEXT" },
            { "name": "details", "type": "JSON" },
            { "name": "success", "type": "TINYINT" },
            { "name": "error_message", "type": "TEXT" },
            { "name": "duration", "type": "INT" },
            { "name": "timestamp", "type": "TIMESTAMP" },
            { "name": "created_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "device_spare_parts",
        "tableComment": "备件管理",
        "displayName": "备件管理",
        "description": "设备备件库存与供应管理",
        "domain": "device-ops",
        "icon": "Package",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "part_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "part_number", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "category", "type": "VARCHAR", "length": "50", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "compatible_device_types", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "manufacturer", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "supplier", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "quantity", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "min_quantity", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "1", "comment": "" },
            { "name": "max_quantity", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "currency", "type": "VARCHAR", "length": "10", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "CNY", "comment": "" },
            { "name": "location", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "last_restocked_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "expiry_date", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metadata", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "part_id", "type": "VARCHAR" },
            { "name": "name", "type": "VARCHAR" },
            { "name": "part_number", "type": "VARCHAR" },
            { "name": "category", "type": "VARCHAR" },
            { "name": "compatible_device_types", "type": "JSON" },
            { "name": "manufacturer", "type": "VARCHAR" },
            { "name": "supplier", "type": "VARCHAR" },
            { "name": "quantity", "type": "INT" },
            { "name": "min_quantity", "type": "INT" },
            { "name": "max_quantity", "type": "INT" },
            { "name": "currency", "type": "VARCHAR" },
            { "name": "location", "type": "VARCHAR" },
            { "name": "last_restocked_at", "type": "TIMESTAMP" },
            { "name": "expiry_date", "type": "TIMESTAMP" },
            { "name": "metadata", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
    "tableName": "device_kpis",
    "tableComment": "",
    "displayName": "设备KPI",
    "description": "设备KPI管理",
    "domain": "device-ops",
    "icon": "Cpu",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
        "name": "id",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": true,
        "autoIncrement": true,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "node_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "period_type",
        "type": "ENUM",
        "length": "'hourly','daily','weekly','monthly'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "period_start",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "period_end",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "availability",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "performance",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "quality",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "oee",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "running_time",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "downtime",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "idle_time",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "planned_downtime",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "unplanned_downtime",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "mtbf",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "mttr",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "failure_count",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "production_count",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "defect_count",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "energy_consumption",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "energy_efficiency",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "created_at",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP",
        "comment": ""
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "INT",
        "pk": true
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "period_type",
        "type": "ENUM('HOURLY','DAILY','WEEKLY'"
      },
      {
        "name": "period_start",
        "type": "TIMESTAMP"
      },
      {
        "name": "period_end",
        "type": "TIMESTAMP"
      },
      {
        "name": "availability",
        "type": "DOUBLE"
      },
      {
        "name": "performance",
        "type": "DOUBLE"
      },
      {
        "name": "quality",
        "type": "DOUBLE"
      }
    ]
  },
{
    "tableName": "device_rule_versions",
    "tableComment": "设备规则版本管理",
    "displayName": "规则版本",
    "description": "规则版本（V4.0新增）",
    "domain": "device-ops",
    "icon": "Cpu",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
        "name": "id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": true,
        "autoIncrement": true,
        "unique": false,
        "defaultVal": "",
        "comment": "主键"
      },
      {
        "name": "rule_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联规则ID"
      },
      {
        "name": "version",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": "版本号"
      },
      {
        "name": "rule_content",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "规则内容JSON"
      },
      {
        "name": "change_log",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "变更日志"
      },
      {
        "name": "is_active",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否激活版本"
      },
      {
        "name": "created_by",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "创建人"
      },
      {
        "name": "created_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP(3)",
        "comment": "创建时间"
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "pk": true
      },
      {
        "name": "rule_id",
        "type": "BIGINT"
      },
      {
        "name": "version",
        "type": "INT"
      },
      {
        "name": "rule_content",
        "type": "JSON"
      },
      {
        "name": "change_log",
        "type": "TEXT"
      },
      {
        "name": "is_active",
        "type": "TINYINT"
      },
      {
        "name": "created_by",
        "type": "VARCHAR"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  }
];
