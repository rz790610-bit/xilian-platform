import type { TableRegistryEntry } from "../types";

export const DEVICE_OPS_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "alert_rules",
    "tableComment": "告警规则配置",
    "displayName": "告警规则",
    "description": "告警规则（V4.0新增）",
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
        "name": "rule_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "规则编码"
      },
      {
        "name": "rule_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "规则名称"
      },
      {
        "name": "rule_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "规则类型(threshold/trend/anomaly)"
      },
      {
        "name": "severity",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "warning",
        "comment": "严重级别"
      },
      {
        "name": "target_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标类型(device/sensor/mp)"
      },
      {
        "name": "target_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标编码"
      },
      {
        "name": "condition_expr",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "条件表达式JSON"
      },
      {
        "name": "threshold_value",
        "type": "DECIMAL",
        "length": "12,4",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "阈值"
      },
      {
        "name": "duration_seconds",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "60",
        "comment": "持续时间(秒)"
      },
      {
        "name": "cooldown_seconds",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "300",
        "comment": "冷却时间(秒)"
      },
      {
        "name": "notification_channels",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "通知渠道"
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
        "comment": "规则描述"
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
        "name": "rule_code",
        "type": "VARCHAR"
      },
      {
        "name": "rule_name",
        "type": "VARCHAR"
      },
      {
        "name": "rule_type",
        "type": "VARCHAR"
      },
      {
        "name": "severity",
        "type": "VARCHAR"
      },
      {
        "name": "target_type",
        "type": "VARCHAR"
      },
      {
        "name": "target_code",
        "type": "VARCHAR"
      },
      {
        "name": "condition_expr",
        "type": "JSON"
      },
      {
        "name": "threshold_value",
        "type": "DECIMAL"
      },
      {
        "name": "duration_seconds",
        "type": "INT"
      },
      {
        "name": "cooldown_seconds",
        "type": "INT"
      },
      {
        "name": "notification_channels",
        "type": "JSON"
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
        "name": "created_by",
        "type": "VARCHAR"
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
    "tableName": "device_firmware_versions",
    "tableComment": "设备固件版本管理",
    "displayName": "固件版本",
    "description": "固件版本（V4.0新增）",
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
        "name": "device_type",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "设备类型"
      },
      {
        "name": "firmware_version",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "固件版本号"
      },
      {
        "name": "release_notes",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "发布说明"
      },
      {
        "name": "file_url",
        "type": "VARCHAR",
        "length": "512",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "固件文件URL"
      },
      {
        "name": "file_hash",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "文件哈希"
      },
      {
        "name": "file_size",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "文件大小(字节)"
      },
      {
        "name": "is_mandatory",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否强制升级"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "draft",
        "comment": "状态(draft/released/deprecated)"
      },
      {
        "name": "released_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "发布时间"
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
        "name": "device_type",
        "type": "VARCHAR"
      },
      {
        "name": "firmware_version",
        "type": "VARCHAR"
      },
      {
        "name": "release_notes",
        "type": "TEXT"
      },
      {
        "name": "file_url",
        "type": "VARCHAR"
      },
      {
        "name": "file_hash",
        "type": "VARCHAR"
      },
      {
        "name": "file_size",
        "type": "BIGINT"
      },
      {
        "name": "is_mandatory",
        "type": "TINYINT"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "released_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
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
    "tableName": "device_maintenance_logs",
    "tableComment": "设备维护记录",
    "displayName": "维护日志",
    "description": "维护日志（V4.0新增）",
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
        "name": "device_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "设备编码"
      },
      {
        "name": "maintenance_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "维护类型(preventive/corrective/predictive)"
      },
      {
        "name": "title",
        "type": "VARCHAR",
        "length": "255",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "维护标题"
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
        "comment": "维护描述"
      },
      {
        "name": "operator",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "操作人"
      },
      {
        "name": "started_at",
        "type": "DATETIME",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "开始时间"
      },
      {
        "name": "completed_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "完成时间"
      },
      {
        "name": "result",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "维护结果(success/partial/failed)"
      },
      {
        "name": "cost",
        "type": "DECIMAL",
        "length": "10,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "维护成本"
      },
      {
        "name": "parts_replaced",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "更换部件JSON"
      },
      {
        "name": "attachments",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "附件列表"
      },
      {
        "name": "next_maintenance_date",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "下次维护日期"
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
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "maintenance_type",
        "type": "VARCHAR"
      },
      {
        "name": "title",
        "type": "VARCHAR"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "operator",
        "type": "VARCHAR"
      },
      {
        "name": "started_at",
        "type": "DATETIME"
      },
      {
        "name": "completed_at",
        "type": "DATETIME"
      },
      {
        "name": "result",
        "type": "VARCHAR"
      },
      {
        "name": "cost",
        "type": "DECIMAL"
      },
      {
        "name": "parts_replaced",
        "type": "JSON"
      },
      {
        "name": "attachments",
        "type": "JSON"
      },
      {
        "name": "next_maintenance_date",
        "type": "DATE"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
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
  },
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
    "tableName": "sensor_calibrations",
    "tableComment": "传感器校准",
    "displayName": "传感器校准",
    "description": "传感器校准管理",
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
        "name": "device_code",
        "type": "VARCHAR",
        "length": "100",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "sensor_id",
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
        "name": "calibration_date",
        "type": "DATE",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "calibration_type",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "manual/auto/factory"
      },
      {
        "name": "offset_before",
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
        "name": "offset_after",
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
        "name": "scale_before",
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
        "name": "scale_after",
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
        "name": "calibration_formula",
        "type": "VARCHAR",
        "length": "255",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "apply_to_history",
        "type": "TINYINT",
        "length": "1",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "history_start_time",
        "type": "DATETIME",
        "length": "3",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "pending",
        "comment": ""
      },
      {
        "name": "applied_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "notes",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
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
        "comment": ""
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
        "comment": ""
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
        "comment": ""
      },
      {
        "name": "updated_by",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "updated_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP(3)",
        "comment": ""
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "INT UNSIGNED",
        "pk": true
      },
      {
        "name": "device_code",
        "type": "VARCHAR(100)"
      },
      {
        "name": "sensor_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "calibration_date",
        "type": "DATE"
      },
      {
        "name": "calibration_type",
        "type": "VARCHAR(20)"
      },
      {
        "name": "offset_before",
        "type": "DOUBLE"
      },
      {
        "name": "offset_after",
        "type": "DOUBLE"
      },
      {
        "name": "scale_before",
        "type": "DOUBLE"
      }
    ]
  }
];
