import type { TableRegistryEntry } from "../types";

export const EDGE_COLLECTION_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "data_collection_tasks",
    "tableComment": "数据采集任务",
    "displayName": "采集任务",
    "description": "采集任务管理",
    "domain": "edge-collection",
    "icon": "Radio",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
        "name": "task_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": true,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "任务ID"
      },
      {
        "name": "task_name",
        "type": "VARCHAR",
        "length": "100",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "任务名称"
      },
      {
        "name": "gateway_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "执行网关 → edge_gateways"
      },
      {
        "name": "task_type",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "continuous",
        "comment": "任务类型(continuous/scheduled/on_demand)"
      },
      {
        "name": "sensor_ids",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联传感器ID列表"
      },
      {
        "name": "schedule_config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "调度配置(cron/interval)"
      },
      {
        "name": "sampling_config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "采集参数(rate/duration/format)"
      },
      {
        "name": "preprocessing_config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "预处理配置"
      },
      {
        "name": "trigger_config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "FSD触发配置"
      },
      {
        "name": "upload_config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "上传配置"
      },
      {
        "name": "total_collected",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "累计采集数据点"
      },
      {
        "name": "total_uploaded",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "累计上传数据点"
      },
      {
        "name": "total_triggered",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "累计触发次数"
      },
      {
        "name": "error_count",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "累计错误次数"
      },
      {
        "name": "last_error",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "最近错误信息"
      },
      {
        "name": "last_run_at",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "最近执行时间"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "stopped",
        "comment": "状态(running/stopped/error/paused)"
      },
      {
        "name": "created_at",
        "type": "TIMESTAMP",
        "length": "",
        "nullable": true,
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
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP",
        "comment": ""
      }
    ],
    "columns": [
      {
        "name": "task_id",
        "type": "VARCHAR(64)",
        "pk": true
      },
      {
        "name": "task_name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "gateway_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "task_type",
        "type": "VARCHAR(20)"
      },
      {
        "name": "sensor_ids",
        "type": "JSON"
      },
      {
        "name": "schedule_config",
        "type": "JSON"
      },
      {
        "name": "sampling_config",
        "type": "JSON"
      },
      {
        "name": "preprocessing_config",
        "type": "JSON"
      }
    ]
  },
  {
    "tableName": "edge_gateway_config",
    "tableComment": "边缘网关配置",
    "displayName": "边缘网关配置",
    "description": "边缘网关配置（V4.0新增）",
    "domain": "edge-collection",
    "icon": "Radio",
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
        "name": "gateway_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "网关编码"
      },
      {
        "name": "gateway_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "网关名称"
      },
      {
        "name": "gateway_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "网关类型"
      },
      {
        "name": "ip_address",
        "type": "VARCHAR",
        "length": "45",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "IP地址"
      },
      {
        "name": "port",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "端口"
      },
      {
        "name": "firmware_version",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "固件版本"
      },
      {
        "name": "protocols",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "支持协议列表"
      },
      {
        "name": "max_devices",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "100",
        "comment": "最大设备数"
      },
      {
        "name": "heartbeat_interval",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "30",
        "comment": "心跳间隔(秒)"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "offline",
        "comment": "状态(online/offline/error)"
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
        "comment": "最后心跳时间"
      },
      {
        "name": "location",
        "type": "VARCHAR",
        "length": "255",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "安装位置"
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
        "name": "gateway_code",
        "type": "VARCHAR"
      },
      {
        "name": "gateway_name",
        "type": "VARCHAR"
      },
      {
        "name": "gateway_type",
        "type": "VARCHAR"
      },
      {
        "name": "ip_address",
        "type": "VARCHAR"
      },
      {
        "name": "port",
        "type": "INT"
      },
      {
        "name": "firmware_version",
        "type": "VARCHAR"
      },
      {
        "name": "protocols",
        "type": "JSON"
      },
      {
        "name": "max_devices",
        "type": "INT"
      },
      {
        "name": "heartbeat_interval",
        "type": "INT"
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
        "name": "location",
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
  }
];
