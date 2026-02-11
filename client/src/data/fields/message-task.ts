import type { TableRegistryEntry } from "../types";

export const MESSAGE_TASK_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "async_task_log",
    "tableComment": "异步任务日志",
    "displayName": "异步任务日志",
    "description": "异步任务日志（V4.0新增）",
    "domain": "message-task",
    "icon": "Zap",
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
        "name": "task_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "任务ID"
      },
      {
        "name": "task_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "任务类型"
      },
      {
        "name": "payload",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "任务载荷"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "pending",
        "comment": "状态(pending/running/success/failed)"
      },
      {
        "name": "retry_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "重试次数"
      },
      {
        "name": "max_retries",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "3",
        "comment": "最大重试次数"
      },
      {
        "name": "error_message",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "错误信息"
      },
      {
        "name": "started_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
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
        "name": "task_id",
        "type": "VARCHAR"
      },
      {
        "name": "task_type",
        "type": "VARCHAR"
      },
      {
        "name": "payload",
        "type": "JSON"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "retry_count",
        "type": "INT"
      },
      {
        "name": "max_retries",
        "type": "INT"
      },
      {
        "name": "error_message",
        "type": "TEXT"
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
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "event_logs",
    "tableComment": "",
    "displayName": "事件日志",
    "description": "事件日志管理",
    "domain": "message-task",
    "icon": "Zap",
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
        "name": "event_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "topic",
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
        "name": "event_type",
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
        "name": "source",
        "type": "VARCHAR",
        "length": "100",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "node_id",
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
        "name": "sensor_id",
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
        "name": "severity",
        "type": "ENUM",
        "length": "'info','warning','error','critical'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "info",
        "comment": ""
      },
      {
        "name": "payload",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "processed",
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
        "name": "processed_at",
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
        "name": "processed_by",
        "type": "VARCHAR",
        "length": "100",
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
        "name": "event_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "topic",
        "type": "VARCHAR(100)"
      },
      {
        "name": "event_type",
        "type": "VARCHAR(50)"
      },
      {
        "name": "source",
        "type": "VARCHAR(100)"
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "sensor_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "severity",
        "type": "ENUM('INFO','WARNING','ERROR',"
      }
    ]
  },
  {
    "tableName": "idempotent_records",
    "tableComment": "",
    "displayName": "幂等记录",
    "description": "幂等记录管理",
    "domain": "message-task",
    "icon": "Zap",
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
        "name": "idempotency_key",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "operation_type",
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
        "name": "status",
        "type": "ENUM",
        "length": "'processing','completed','failed'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "processing",
        "comment": ""
      },
      {
        "name": "request_hash",
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
        "name": "response",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "expires_at",
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
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "INT",
        "pk": true
      },
      {
        "name": "idempotency_key",
        "type": "VARCHAR(128)"
      },
      {
        "name": "operation_type",
        "type": "VARCHAR(100)"
      },
      {
        "name": "status",
        "type": "ENUM('PROCESSING','COMPLETED',"
      },
      {
        "name": "request_hash",
        "type": "VARCHAR(64)"
      },
      {
        "name": "response",
        "type": "JSON"
      },
      {
        "name": "expires_at",
        "type": "TIMESTAMP"
      },
      {
        "name": "created_at",
        "type": "TIMESTAMP"
      }
    ]
  },
  {
    "tableName": "message_queue_log",
    "tableComment": "消息队列日志",
    "displayName": "消息队列日志",
    "description": "消息队列日志（V4.0新增）",
    "domain": "message-task",
    "icon": "Zap",
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
        "name": "message_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "消息ID"
      },
      {
        "name": "topic",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "主题"
      },
      {
        "name": "partition_key",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "分区键"
      },
      {
        "name": "payload_size",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "载荷大小(字节)"
      },
      {
        "name": "direction",
        "type": "VARCHAR",
        "length": "8",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "方向(publish/consume)"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "状态"
      },
      {
        "name": "consumer_group",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "消费者组"
      },
      {
        "name": "latency_ms",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "延迟(ms)"
      },
      {
        "name": "error_message",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "错误信息"
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
        "name": "message_id",
        "type": "VARCHAR"
      },
      {
        "name": "topic",
        "type": "VARCHAR"
      },
      {
        "name": "partition_key",
        "type": "VARCHAR"
      },
      {
        "name": "payload_size",
        "type": "INT"
      },
      {
        "name": "direction",
        "type": "VARCHAR"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "consumer_group",
        "type": "VARCHAR"
      },
      {
        "name": "latency_ms",
        "type": "INT"
      },
      {
        "name": "error_message",
        "type": "TEXT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "message_routing_config",
    "tableComment": "消息路由配置",
    "displayName": "消息路由配置",
    "description": "消息路由配置（V4.0新增）",
    "domain": "message-task",
    "icon": "Zap",
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
        "name": "route_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "路由名称"
      },
      {
        "name": "source_topic",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "源主题"
      },
      {
        "name": "target_topic",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标主题"
      },
      {
        "name": "filter_expr",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "过滤表达式"
      },
      {
        "name": "transform_script",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "转换脚本"
      },
      {
        "name": "priority",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "优先级"
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
        "name": "route_name",
        "type": "VARCHAR"
      },
      {
        "name": "source_topic",
        "type": "VARCHAR"
      },
      {
        "name": "target_topic",
        "type": "VARCHAR"
      },
      {
        "name": "filter_expr",
        "type": "TEXT"
      },
      {
        "name": "transform_script",
        "type": "TEXT"
      },
      {
        "name": "priority",
        "type": "INT"
      },
      {
        "name": "is_enabled",
        "type": "TINYINT"
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
  }
,
    {
        "tableName": "config_change_logs",
        "tableComment": "配置变更",
        "displayName": "配置变更",
        "description": "系统配置变更审计日志",
        "domain": "message-task",
        "icon": "History",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "BIGINT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "config_id", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "config_key", "type": "VARCHAR", "length": "128", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "old_value", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "new_value", "type": "JSON", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "old_version", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "new_version", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "change_reason", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "changed_by", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "changed_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "rollback_to", "type": "BIGINT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "BIGINT", "pk": true },
            { "name": "config_id", "type": "INT" },
            { "name": "config_key", "type": "VARCHAR" },
            { "name": "old_value", "type": "JSON" },
            { "name": "new_value", "type": "JSON" },
            { "name": "old_version", "type": "INT" },
            { "name": "new_version", "type": "INT" },
            { "name": "change_reason", "type": "TEXT" },
            { "name": "changed_by", "type": "VARCHAR" },
            { "name": "changed_at", "type": "TIMESTAMP" },
            { "name": "rollback_to", "type": "BIGINT" }
        ]
    },
    {
        "tableName": "outbox_routing_config",
        "tableComment": "发件路由",
        "displayName": "发件路由",
        "description": "消息发件箱路由配置",
        "domain": "message-task",
        "icon": "Route",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "event_type", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "cdc_enabled", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "true", "comment": "" },
            { "name": "polling_interval_ms", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "polling_batch_size", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "requires_processing", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "false", "comment": "" },
            { "name": "processor_class", "type": "VARCHAR", "length": "200", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "is_active", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "true", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "event_type", "type": "VARCHAR" },
            { "name": "cdc_enabled", "type": "TINYINT" },
            { "name": "polling_interval_ms", "type": "INT" },
            { "name": "polling_batch_size", "type": "INT" },
            { "name": "requires_processing", "type": "TINYINT" },
            { "name": "processor_class", "type": "VARCHAR" },
            { "name": "description", "type": "TEXT" },
            { "name": "is_active", "type": "TINYINT" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
    {
        "tableName": "rollback_triggers",
        "tableComment": "回滚触发器",
        "displayName": "回滚触发器",
        "description": "数据回滚触发条件配置",
        "domain": "message-task",
        "icon": "RotateCcw",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "BIGINT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "trigger_code", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "target_table", "type": "VARCHAR", "length": "128", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "condition_type", "type": "VARCHAR", "length": "32", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "condition_params", "type": "JSON", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "rollback_action", "type": "VARCHAR", "length": "32", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "action_params", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "is_active", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "1", "comment": "" },
            { "name": "last_triggered_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "trigger_count", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "version", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "1", "comment": "" },
            { "name": "created_by", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "is_deleted", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "BIGINT", "pk": true },
            { "name": "trigger_code", "type": "VARCHAR" },
            { "name": "name", "type": "VARCHAR" },
            { "name": "target_table", "type": "VARCHAR" },
            { "name": "condition_type", "type": "VARCHAR" },
            { "name": "condition_params", "type": "JSON" },
            { "name": "rollback_action", "type": "VARCHAR" },
            { "name": "action_params", "type": "JSON" },
            { "name": "is_active", "type": "TINYINT" },
            { "name": "last_triggered_at", "type": "TIMESTAMP" },
            { "name": "trigger_count", "type": "INT" },
            { "name": "version", "type": "INT" },
            { "name": "created_by", "type": "VARCHAR" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" },
            { "name": "is_deleted", "type": "TINYINT" }
        ]
    },
    {
        "tableName": "scheduled_tasks",
        "tableComment": "定时任务",
        "displayName": "定时任务",
        "description": "系统定时任务调度管理",
        "domain": "message-task",
        "icon": "Clock",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "BIGINT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "task_code", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "task_type", "type": "VARCHAR", "length": "32", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "cron_expression", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "interval_seconds", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "handler", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "params", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "status", "type": "VARCHAR", "length": "32", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "active", "comment": "" },
            { "name": "last_run_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "last_run_result", "type": "VARCHAR", "length": "20", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "next_run_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "retry_count", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "max_retries", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "3", "comment": "" },
            { "name": "timeout_seconds", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "300", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "version", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "1", "comment": "" },
            { "name": "created_by", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "is_deleted", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "BIGINT", "pk": true },
            { "name": "task_code", "type": "VARCHAR" },
            { "name": "name", "type": "VARCHAR" },
            { "name": "task_type", "type": "VARCHAR" },
            { "name": "cron_expression", "type": "VARCHAR" },
            { "name": "interval_seconds", "type": "INT" },
            { "name": "handler", "type": "VARCHAR" },
            { "name": "params", "type": "JSON" },
            { "name": "status", "type": "VARCHAR" },
            { "name": "last_run_at", "type": "TIMESTAMP" },
            { "name": "last_run_result", "type": "VARCHAR" },
            { "name": "next_run_at", "type": "TIMESTAMP" },
            { "name": "retry_count", "type": "INT" },
            { "name": "max_retries", "type": "INT" },
            { "name": "timeout_seconds", "type": "INT" },
            { "name": "description", "type": "TEXT" },
            { "name": "version", "type": "INT" },
            { "name": "created_by", "type": "VARCHAR" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" },
            { "name": "is_deleted", "type": "TINYINT" }
        ]
    }
];
