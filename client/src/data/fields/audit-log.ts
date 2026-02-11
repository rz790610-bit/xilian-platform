/**
 * V4.0 audit-log 域表定义
 * 表数量: 2
 */
import type { TableRegistryEntry } from "../types";

export const AUDIT_LOG_TABLES: TableRegistryEntry[] = [
{
    "tableName": "audit_logs",
    "tableComment": "审计日志",
    "displayName": "审计日志",
    "description": "系统操作审计日志，记录所有关键操作（V4.0新增）",
    "domain": "audit-log",
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
    "domain": "audit-log",
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
];
