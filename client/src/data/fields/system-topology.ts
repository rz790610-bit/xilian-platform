import type { TableRegistryEntry } from "../types";

export const SYSTEM_TOPOLOGY_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "topo_alerts",
    "tableComment": "拓扑告警",
    "displayName": "拓扑告警",
    "description": "拓扑告警（V4.0新增）",
    "domain": "system-topology",
    "icon": "Network",
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
        "name": "node_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "节点ID"
      },
      {
        "name": "alert_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "告警类型"
      },
      {
        "name": "severity",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "严重级别"
      },
      {
        "name": "message",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "告警消息"
      },
      {
        "name": "resolved",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否已解决"
      },
      {
        "name": "resolved_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "解决时间"
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
        "name": "node_id",
        "type": "VARCHAR"
      },
      {
        "name": "alert_type",
        "type": "VARCHAR"
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
        "name": "resolved",
        "type": "TINYINT"
      },
      {
        "name": "resolved_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
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
    "tableName": "topo_layers",
    "tableComment": "拓扑层级定义",
    "displayName": "拓扑层",
    "description": "拓扑层（V4.0新增）",
    "domain": "system-topology",
    "icon": "Network",
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
        "name": "layer_code",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "层级编码"
      },
      {
        "name": "layer_name",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "层级名称"
      },
      {
        "name": "layer_order",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "排序"
      },
      {
        "name": "color",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "显示颜色"
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
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "pk": true
      },
      {
        "name": "layer_code",
        "type": "VARCHAR"
      },
      {
        "name": "layer_name",
        "type": "VARCHAR"
      },
      {
        "name": "layer_order",
        "type": "INT"
      },
      {
        "name": "color",
        "type": "VARCHAR"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
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
    "tableName": "topo_snapshots",
    "tableComment": "拓扑快照",
    "displayName": "拓扑快照",
    "description": "拓扑快照（V4.0新增）",
    "domain": "system-topology",
    "icon": "Network",
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
        "name": "snapshot_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "快照名称"
      },
      {
        "name": "snapshot_data",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "快照数据JSON"
      },
      {
        "name": "node_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "节点数"
      },
      {
        "name": "edge_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "边数"
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
        "name": "snapshot_name",
        "type": "VARCHAR"
      },
      {
        "name": "snapshot_data",
        "type": "JSON"
      },
      {
        "name": "node_count",
        "type": "INT"
      },
      {
        "name": "edge_count",
        "type": "INT"
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
    "tableName": "audit_logs",
    "tableComment": "审计日志",
    "displayName": "审计日志",
    "description": "系统操作审计日志，记录所有关键操作（V4.0新增）",
    "domain": "system-topology",
    "icon": "ScrollText",
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
        "name": "action_type",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "操作类型(CREATE/UPDATE/DELETE/LOGIN/EXPORT等)"
      },
      {
        "name": "resource_type",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "资源类型(device/asset/rule/user等)"
      },
      {
        "name": "resource_id",
        "type": "VARCHAR",
        "length": "128",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "资源ID"
      },
      {
        "name": "resource_name",
        "type": "VARCHAR",
        "length": "200",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "资源名称"
      },
      {
        "name": "operator_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "操作人ID"
      },
      {
        "name": "operator_name",
        "type": "VARCHAR",
        "length": "100",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "操作人名称"
      },
      {
        "name": "operator_ip",
        "type": "VARCHAR",
        "length": "45",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "操作人IP"
      },
      {
        "name": "request_method",
        "type": "VARCHAR",
        "length": "10",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "请求方法"
      },
      {
        "name": "request_path",
        "type": "VARCHAR",
        "length": "500",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "请求路径"
      },
      {
        "name": "request_body",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "请求体(脱敏后)"
      },
      {
        "name": "response_code",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "响应状态码"
      },
      {
        "name": "changes",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "变更详情(before/after diff)"
      },
      {
        "name": "duration_ms",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "操作耗时(毫秒)"
      },
      {
        "name": "status",
        "type": "ENUM",
        "length": "'success','failure','partial'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "success",
        "comment": "操作结果"
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
        "name": "metadata",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "扩展元数据"
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
        "name": "action_type",
        "type": "VARCHAR(64)"
      },
      {
        "name": "resource_type",
        "type": "VARCHAR(64)"
      },
      {
        "name": "resource_id",
        "type": "VARCHAR(128)"
      },
      {
        "name": "resource_name",
        "type": "VARCHAR(200)"
      },
      {
        "name": "operator_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "operator_name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "operator_ip",
        "type": "VARCHAR(45)"
      },
      {
        "name": "request_method",
        "type": "VARCHAR(10)"
      },
      {
        "name": "request_path",
        "type": "VARCHAR(500)"
      },
      {
        "name": "request_body",
        "type": "JSON"
      },
      {
        "name": "response_code",
        "type": "INT"
      },
      {
        "name": "changes",
        "type": "JSON"
      },
      {
        "name": "duration_ms",
        "type": "INT"
      },
      {
        "name": "status",
        "type": "ENUM"
      },
      {
        "name": "error_message",
        "type": "TEXT"
      },
      {
        "name": "metadata",
        "type": "JSON"
      },
      {
        "name": "created_at",
        "type": "DATETIME(3)"
      }
    ]
  },
  {
    "tableName": "audit_logs_sensitive",
    "tableComment": "敏感操作审计",
    "displayName": "敏感操作审计",
    "description": "audit_logs的敏感数据分表，存储涉及权限、密码、密钥等敏感操作的详细记录（V4.0新增）",
    "domain": "system-topology",
    "icon": "ShieldAlert",
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
        "name": "audit_log_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联audit_logs.id"
      },
      {
        "name": "sensitive_type",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "敏感类型(password_change/key_rotation/permission_grant等)"
      },
      {
        "name": "sensitive_data",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "敏感数据(加密存储)"
      },
      {
        "name": "risk_level",
        "type": "ENUM",
        "length": "'low','medium','high','critical'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "medium",
        "comment": "风险等级"
      },
      {
        "name": "requires_approval",
        "type": "TINYINT",
        "length": "1",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否需要审批"
      },
      {
        "name": "approved_by",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "审批人"
      },
      {
        "name": "approved_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "审批时间"
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
        "name": "audit_log_id",
        "type": "BIGINT",
        "fk": true,
        "fkRef": "audit_logs.id"
      },
      {
        "name": "sensitive_type",
        "type": "VARCHAR(64)"
      },
      {
        "name": "sensitive_data",
        "type": "JSON"
      },
      {
        "name": "risk_level",
        "type": "ENUM"
      },
      {
        "name": "requires_approval",
        "type": "TINYINT(1)"
      },
      {
        "name": "approved_by",
        "type": "VARCHAR(64)"
      },
      {
        "name": "approved_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME(3)"
      }
    ]
  }
,
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
    }
];
