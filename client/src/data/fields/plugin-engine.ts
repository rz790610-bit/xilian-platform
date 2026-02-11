/**
 * V4.0 plugin-engine 域表定义
 * 表数量: 3
 */
import type { TableRegistryEntry } from "../types";

export const PLUGIN_ENGINE_TABLES: TableRegistryEntry[] = [
{
    "tableName": "plugin_registry",
    "tableComment": "插件注册表",
    "displayName": "插件注册",
    "description": "插件注册（V4.0新增）",
    "domain": "plugin-engine",
    "icon": "Plug",
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
        "name": "plugin_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "插件编码"
      },
      {
        "name": "plugin_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "插件名称"
      },
      {
        "name": "plugin_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "插件类型(data_source/transform/alert/export)"
      },
      {
        "name": "version",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1.0.0",
        "comment": "版本号"
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
        "name": "entry_point",
        "type": "VARCHAR",
        "length": "255",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "入口点"
      },
      {
        "name": "config_schema",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "配置Schema"
      },
      {
        "name": "dependencies",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "依赖列表"
      },
      {
        "name": "is_builtin",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否内置"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "active",
        "comment": "状态"
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
        "name": "plugin_code",
        "type": "VARCHAR"
      },
      {
        "name": "plugin_name",
        "type": "VARCHAR"
      },
      {
        "name": "plugin_type",
        "type": "VARCHAR"
      },
      {
        "name": "version",
        "type": "VARCHAR"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "entry_point",
        "type": "VARCHAR"
      },
      {
        "name": "config_schema",
        "type": "JSON"
      },
      {
        "name": "dependencies",
        "type": "JSON"
      },
      {
        "name": "is_builtin",
        "type": "TINYINT"
      },
      {
        "name": "status",
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
    "tableName": "plugin_instances",
    "tableComment": "插件实例",
    "displayName": "插件实例",
    "description": "插件实例（V4.0新增）",
    "domain": "plugin-engine",
    "icon": "Plug",
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
        "name": "plugin_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "插件ID"
      },
      {
        "name": "instance_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "实例名称"
      },
      {
        "name": "config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "实例配置"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "stopped",
        "comment": "状态(running/stopped/error)"
      },
      {
        "name": "last_heartbeat",
        "type": "DATETIME",
        "length": "3",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "最后心跳"
      },
      {
        "name": "error_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "错误计数"
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
        "comment": "启动时间"
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
        "name": "plugin_id",
        "type": "BIGINT"
      },
      {
        "name": "instance_name",
        "type": "VARCHAR"
      },
      {
        "name": "config",
        "type": "JSON"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "last_heartbeat",
        "type": "DATETIME"
      },
      {
        "name": "error_count",
        "type": "INT"
      },
      {
        "name": "started_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
{
    "tableName": "plugin_events",
    "tableComment": "插件事件日志",
    "displayName": "插件事件",
    "description": "插件事件（V4.0新增）",
    "domain": "plugin-engine",
    "icon": "Plug",
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
        "name": "instance_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "实例ID"
      },
      {
        "name": "event_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "事件类型(start/stop/error/config_change)"
      },
      {
        "name": "event_data",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "事件数据"
      },
      {
        "name": "severity",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "info",
        "comment": "严重级别"
      },
      {
        "name": "message",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "事件消息"
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
        "name": "instance_id",
        "type": "BIGINT"
      },
      {
        "name": "event_type",
        "type": "VARCHAR"
      },
      {
        "name": "event_data",
        "type": "JSON"
      },
      {
        "name": "severity",
        "type": "VARCHAR"
      },
      {
        "name": "message",
        "type": "TEXT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  }
];
