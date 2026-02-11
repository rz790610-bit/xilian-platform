/**
 * V4.0 system-topology 域表定义
 * 表数量: 5
 */
import type { TableRegistryEntry } from "../types";

export const SYSTEM_TOPOLOGY_TABLES: TableRegistryEntry[] = [
{
    "tableName": "topo_nodes",
    "tableComment": "",
    "displayName": "拓扑节点",
    "description": "拓扑节点管理",
    "domain": "system-topology",
    "icon": "Network",
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
        "unique": true,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "name",
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
        "name": "type",
        "type": "ENUM",
        "length": "'source','plugin','engine','agent','output','database','service'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "icon",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "?",
        "comment": ""
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
        "comment": ""
      },
      {
        "name": "status",
        "type": "ENUM",
        "length": "'online','offline','error','maintenance'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "offline",
        "comment": ""
      },
      {
        "name": "x",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "y",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
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
        "comment": ""
      },
      {
        "name": "metrics",
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
        "name": "last_heartbeat",
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
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "type",
        "type": "ENUM('SOURCE','PLUGIN','ENGINE"
      },
      {
        "name": "icon",
        "type": "VARCHAR(20)"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "status",
        "type": "ENUM('ONLINE','OFFLINE','ERROR"
      },
      {
        "name": "x",
        "type": "INT"
      }
    ]
  },
{
    "tableName": "topo_edges",
    "tableComment": "",
    "displayName": "拓扑边",
    "description": "拓扑边管理",
    "domain": "system-topology",
    "icon": "Network",
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
        "name": "edge_id",
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
        "name": "source_node_id",
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
        "name": "target_node_id",
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
        "name": "type",
        "type": "ENUM",
        "length": "'data','dependency','control'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "data",
        "comment": ""
      },
      {
        "name": "label",
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
        "name": "config",
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
        "name": "status",
        "type": "ENUM",
        "length": "'active','inactive','error'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "active",
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
        "name": "edge_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "source_node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "target_node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "type",
        "type": "ENUM('DATA','DEPENDENCY','CONT"
      },
      {
        "name": "label",
        "type": "VARCHAR(100)"
      },
      {
        "name": "config",
        "type": "JSON"
      },
      {
        "name": "status",
        "type": "ENUM('ACTIVE','INACTIVE','ERRO"
      }
    ]
  },
{
        "tableName": "topo_layouts",
        "tableComment": "拓扑布局",
        "displayName": "拓扑布局",
        "description": "系统拓扑图布局配置",
        "domain": "system-topology",
        "icon": "Layout",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "user_id", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "is_default", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "false", "comment": "" },
            { "name": "layout_data", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "name", "type": "VARCHAR" },
            { "name": "description", "type": "TEXT" },
            { "name": "user_id", "type": "INT" },
            { "name": "is_default", "type": "TINYINT" },
            { "name": "layout_data", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "system_capacity_metrics",
        "tableComment": "容量指标",
        "displayName": "容量指标",
        "description": "系统容量监控指标",
        "domain": "system-topology",
        "icon": "Gauge",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metric_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "component_name", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "last_checked_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "metric_id", "type": "VARCHAR" },
            { "name": "component_name", "type": "VARCHAR" },
            { "name": "last_checked_at", "type": "TIMESTAMP" },
            { "name": "created_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "users",
        "tableComment": "",
        "displayName": "系统用户",
        "description": "系统用户管理",
        "domain": "system-topology",
        "icon": "Settings",
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
                "name": "open_id",
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
                "name": "name",
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
                "name": "email",
                "type": "VARCHAR",
                "length": "320",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": ""
            },
            {
                "name": "login_method",
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
                "name": "role",
                "type": "ENUM",
                "length": "'user','admin'",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "user",
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
                "name": "last_signed_in",
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
                "name": "open_id",
                "type": "VARCHAR(64)"
            },
            {
                "name": "name",
                "type": "TEXT"
            },
            {
                "name": "email",
                "type": "VARCHAR(320)"
            },
            {
                "name": "login_method",
                "type": "VARCHAR(64)"
            },
            {
                "name": "role",
                "type": "ENUM('USER','ADMIN')"
            },
            {
                "name": "created_at",
                "type": "TIMESTAMP"
            },
            {
                "name": "updated_at",
                "type": "TIMESTAMP"
            }
        ]
    }
];
