/**
 * V4.0 edge-collection 域表定义
 * 表数量: 2
 */
import type { TableRegistryEntry } from "../types";

export const EDGE_COLLECTION_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "edge_gateways",
    "tableComment": "边缘网关设备",
    "displayName": "边缘网关",
    "description": "边缘网关设备注册与管理",
    "domain": "edge-collection",
    "icon": "Router",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
            "name": "id",
            "type": "int unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": true,
            "autoIncrement": true,
            "unique": false,
            "defaultVal": "",
            "comment": "auto_increment"
      },
      {
            "name": "gateway_id",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": true,
            "defaultVal": "",
            "comment": "网关ID"
      },
      {
            "name": "name",
            "type": "varchar",
            "length": "100",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "网关名称"
      },
      {
            "name": "gateway_type",
            "type": "varchar",
            "length": "30",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "网关类型"
      },
      {
            "name": "protocol",
            "type": "varchar",
            "length": "30",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "通信协议: mqtt/opcua/modbus"
      },
      {
            "name": "ip_address",
            "type": "varchar",
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
            "type": "int unsigned",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "端口号"
      },
      {
            "name": "firmware_version",
            "type": "varchar",
            "length": "30",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "固件版本"
      },
      {
            "name": "status",
            "type": "varchar",
            "length": "20",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "offline",
            "comment": "状态: online/offline/error"
      },
      {
            "name": "last_heartbeat",
            "type": "datetime(3)",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "最后心跳时间"
      },
      {
            "name": "config",
            "type": "json",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "网关配置"
      },
      {
            "name": "buffer_size_sec",
            "type": "int unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "60",
            "comment": "环形缓冲区大小(秒)"
      },
      {
            "name": "is_active",
            "type": "tinyint(1)",
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
            "type": "datetime(3)",
            "length": "",
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
            "type": "int unsigned",
            "pk": true
      },
      {
            "name": "gateway_id",
            "type": "varchar"
      },
      {
            "name": "name",
            "type": "varchar"
      },
      {
            "name": "gateway_type",
            "type": "varchar"
      },
      {
            "name": "protocol",
            "type": "varchar"
      },
      {
            "name": "ip_address",
            "type": "varchar"
      },
      {
            "name": "port",
            "type": "int unsigned"
      },
      {
            "name": "firmware_version",
            "type": "varchar"
      },
      {
            "name": "status",
            "type": "varchar"
      },
      {
            "name": "last_heartbeat",
            "type": "datetime(3)"
      },
      {
            "name": "config",
            "type": "json"
      },
      {
            "name": "buffer_size_sec",
            "type": "int unsigned"
      },
      {
            "name": "is_active",
            "type": "tinyint(1)"
      },
      {
            "name": "created_at",
            "type": "datetime(3)"
      }
]
  },
  {
    "tableName": "realtime_telemetry",
    "tableComment": "实时遥测数据缓存",
    "displayName": "实时遥测",
    "description": "边缘网关上报的实时遥测数据（写入后同步到ClickHouse）",
    "domain": "edge-collection",
    "icon": "Activity",
    "engine": "InnoDB",
    "charset": "utf8mb4",
    "collate": "utf8mb4_unicode_ci",
    "fields": [
      {
            "name": "id",
            "type": "bigint unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": true,
            "autoIncrement": true,
            "unique": false,
            "defaultVal": "",
            "comment": "auto_increment"
      },
      {
            "name": "gateway_id",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "网关ID"
      },
      {
            "name": "device_code",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "设备编码"
      },
      {
            "name": "mp_code",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "测点编码"
      },
      {
            "name": "timestamp",
            "type": "datetime(3)",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "采集时间戳"
      },
      {
            "name": "value",
            "type": "double",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "测量值"
      },
      {
            "name": "unit",
            "type": "varchar",
            "length": "20",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "单位"
      },
      {
            "name": "quality",
            "type": "int unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "192",
            "comment": "数据质量码"
      },
      {
            "name": "features",
            "type": "json",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "特征值(RMS/峰值等)"
      },
      {
            "name": "is_anomaly",
            "type": "tinyint(1)",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "0",
            "comment": "是否异常"
      },
      {
            "name": "synced_to_ch",
            "type": "tinyint(1)",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "0",
            "comment": "是否已同步到ClickHouse"
      },
      {
            "name": "created_at",
            "type": "datetime(3)",
            "length": "",
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
            "type": "bigint unsigned",
            "pk": true
      },
      {
            "name": "gateway_id",
            "type": "varchar"
      },
      {
            "name": "device_code",
            "type": "varchar"
      },
      {
            "name": "mp_code",
            "type": "varchar"
      },
      {
            "name": "timestamp",
            "type": "datetime(3)"
      },
      {
            "name": "value",
            "type": "double"
      },
      {
            "name": "unit",
            "type": "varchar"
      },
      {
            "name": "quality",
            "type": "int unsigned"
      },
      {
            "name": "features",
            "type": "json"
      },
      {
            "name": "is_anomaly",
            "type": "tinyint(1)"
      },
      {
            "name": "synced_to_ch",
            "type": "tinyint(1)"
      },
      {
            "name": "created_at",
            "type": "datetime(3)"
      }
]
  }
];
