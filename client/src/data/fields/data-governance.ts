/**
 * V4.0 data-governance 域表定义
 * 表数量: 11
 */
import type { TableRegistryEntry } from "../types";

export const DATA_GOVERNANCE_TABLES: TableRegistryEntry[] = [
{
    "tableName": "data_slices",
    "tableComment": "数据切片",
    "displayName": "数据切片",
    "description": "数据切片管理",
    "domain": "data-governance",
    "icon": "Shield",
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
        "comment": ""
      },
      {
        "name": "slice_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "切片 ID"
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
        "name": "node_path",
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
        "name": "work_condition_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "工况(高频查询)"
      },
      {
        "name": "quality_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "质量(高频查询)"
      },
      {
        "name": "fault_type_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "故障类型(高频查询)"
      },
      {
        "name": "load_rate",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "负载率(高频查询)"
      },
      {
        "name": "start_time",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "end_time",
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
        "name": "duration_ms",
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
        "name": "status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "recording",
        "comment": ""
      },
      {
        "name": "label_status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "auto_only",
        "comment": ""
      },
      {
        "name": "label_count_auto",
        "type": "SMALLINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "label_count_manual",
        "type": "SMALLINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "labels",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "_utf8mb4\\\\'{}\\\\'",
        "comment": ""
      },
      {
        "name": "sensors",
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
        "name": "trigger",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "触发信息JSON(合并trigger_type/trigger_confidence/source_type)"
      },
      {
        "name": "data_location",
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
        "name": "summary",
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
        "name": "quality_score",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "质量评分 0-100"
      },
      {
        "name": "data_quality",
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
        "name": "is_sample",
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
        "name": "sample_purpose",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "train/validate/test"
      },
      {
        "name": "sample_dataset_id",
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
        "name": "applied_rule_id",
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
        "name": "applied_rule_version",
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
      },
      {
        "name": "verified_by",
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
        "name": "verified_at",
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
        "name": "is_deleted",
        "type": "TINYINT",
        "length": "1",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT UNSIGNED",
        "pk": true
      },
      {
        "name": "slice_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "device_code",
        "type": "VARCHAR(100)"
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "node_path",
        "type": "TEXT"
      },
      {
        "name": "work_condition_code",
        "type": "VARCHAR(64)"
      },
      {
        "name": "quality_code",
        "type": "VARCHAR(64)"
      },
      {
        "name": "fault_type_code",
        "type": "VARCHAR(64)"
      },
      {
        "name": "trigger",
        "type": "JSON"
      },
      {
        "name": "load_rate",
        "type": "DOUBLE"
      },
      {
        "name": "start_time",
        "type": "DATETIME(3)"
      },
      {
        "name": "end_time",
        "type": "DATETIME(3)"
      },
      {
        "name": "duration_ms",
        "type": "INT"
      },
      {
        "name": "status",
        "type": "VARCHAR(20)"
      },
      {
        "name": "label_status",
        "type": "VARCHAR(20)"
      },
      {
        "name": "label_count_auto",
        "type": "SMALLINT"
      },
      {
        "name": "label_count_manual",
        "type": "SMALLINT"
      },
      {
        "name": "labels",
        "type": "JSON"
      },
      {
        "name": "sensors",
        "type": "JSON"
      },
      {
        "name": "data_location",
        "type": "JSON"
      },
      {
        "name": "summary",
        "type": "JSON"
      },
      {
        "name": "quality_score",
        "type": "DOUBLE"
      },
      {
        "name": "data_quality",
        "type": "JSON"
      },
      {
        "name": "is_sample",
        "type": "TINYINT(1)"
      },
      {
        "name": "sample_purpose",
        "type": "VARCHAR(20)"
      },
      {
        "name": "sample_dataset_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "applied_rule_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "applied_rule_version",
        "type": "INT"
      },
      {
        "name": "notes",
        "type": "TEXT"
      },
      {
        "name": "version",
        "type": "INT"
      },
      {
        "name": "created_by",
        "type": "VARCHAR(64)"
      },
      {
        "name": "created_at",
        "type": "DATETIME(3)"
      },
      {
        "name": "updated_by",
        "type": "VARCHAR(64)"
      },
      {
        "name": "updated_at",
        "type": "DATETIME(3)"
      },
      {
        "name": "verified_by",
        "type": "VARCHAR(64)"
      },
      {
        "name": "verified_at",
        "type": "DATETIME(3)"
      },
      {
        "name": "is_deleted",
        "type": "TINYINT(1)"
      }
    ]
  },
{
    "tableName": "data_clean_tasks",
    "tableComment": "清洗任务",
    "displayName": "清洗任务",
    "description": "清洗任务管理",
    "domain": "data-governance",
    "icon": "Shield",
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
        "comment": ""
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
        "comment": ""
      },
      {
        "name": "idempotent_key",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "幂等键"
      },
      {
        "name": "name",
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
        "name": "device_code",
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
        "name": "sensor_ids",
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
        "name": "time_start",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "time_end",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "rule_ids",
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
        "name": "rule_snapshot",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "执行时的规则配置快照"
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
        "name": "progress",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "stats",
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
        "name": "started_at",
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
        "name": "completed_at",
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
        "name": "error_message",
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
        "type": "BIGINT UNSIGNED",
        "pk": true
      },
      {
        "name": "task_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "idempotent_key",
        "type": "VARCHAR(64)"
      },
      {
        "name": "name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "device_code",
        "type": "VARCHAR(100)"
      },
      {
        "name": "sensor_ids",
        "type": "JSON"
      },
      {
        "name": "time_start",
        "type": "DATETIME(3)"
      },
      {
        "name": "time_end",
        "type": "DATETIME(3)"
      }
    ]
  },
{
        "tableName": "data_clean_logs",
        "tableComment": "清洗日志",
        "displayName": "清洗日志",
        "description": "数据清洗执行日志记录",
        "domain": "data-governance",
        "icon": "FileCheck",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "BIGINT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "task_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "slice_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "device_code", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "sensor_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "data_time", "type": "DATETIME", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "rule_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "rule_version", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "issue_type", "type": "VARCHAR", "length": "50", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "action_taken", "type": "VARCHAR", "length": "50", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "is_fixed", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "context", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "DATETIME", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "BIGINT", "pk": true },
            { "name": "task_id", "type": "VARCHAR" },
            { "name": "slice_id", "type": "VARCHAR" },
            { "name": "device_code", "type": "VARCHAR" },
            { "name": "sensor_id", "type": "VARCHAR" },
            { "name": "data_time", "type": "DATETIME" },
            { "name": "rule_id", "type": "VARCHAR" },
            { "name": "rule_version", "type": "INT" },
            { "name": "issue_type", "type": "VARCHAR" },
            { "name": "action_taken", "type": "VARCHAR" },
            { "name": "is_fixed", "type": "TINYINT" },
            { "name": "context", "type": "JSON" },
            { "name": "created_at", "type": "DATETIME" }
        ]
    },
{
    "tableName": "data_quality_reports",
    "tableComment": "质量报告",
    "displayName": "质量报告",
    "description": "质量报告管理",
    "domain": "data-governance",
    "icon": "Shield",
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
        "comment": ""
      },
      {
        "name": "report_type",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "daily/weekly/monthly"
      },
      {
        "name": "report_date",
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
        "name": "device_code",
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
        "name": "total_records",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "valid_records",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": ""
      },
      {
        "name": "completeness",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "完整率"
      },
      {
        "name": "accuracy",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "准确率"
      },
      {
        "name": "quality_score",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "综合评分 0-100"
      },
      {
        "name": "metrics",
        "type": "JSON",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "prev_quality_score",
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
        "name": "score_change",
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
        "type": "BIGINT UNSIGNED",
        "pk": true
      },
      {
        "name": "report_type",
        "type": "VARCHAR(20)"
      },
      {
        "name": "report_date",
        "type": "DATE"
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
        "name": "total_records",
        "type": "BIGINT UNSIGNED"
      },
      {
        "name": "valid_records",
        "type": "BIGINT UNSIGNED"
      },
      {
        "name": "completeness",
        "type": "DOUBLE"
      }
    ]
  },
{
    "tableName": "data_slice_label_history",
    "tableComment": "标注修改历史",
    "displayName": "切片标注历史",
    "description": "切片标注历史管理",
    "domain": "data-governance",
    "icon": "Shield",
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
        "comment": ""
      },
      {
        "name": "slice_id",
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
        "name": "dimension_code",
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
        "name": "old_value",
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
        "name": "new_value",
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
        "name": "old_source",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "new_source",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "changed_by",
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
        "name": "changed_at",
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
        "name": "reason",
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
        "name": "fault_class",
        "type": "VARCHAR",
        "length": "50",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "故障分类(bearing_inner_race/imbalance等)"
      },
      {
        "name": "confidence",
        "type": "FLOAT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "标注置信度(0.0-1.0)"
      },
      {
        "name": "label_source",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "HUMAN",
        "comment": "标注来源(AUTO/HUMAN/SEMI_AUTO)"
      },
      {
        "name": "review_status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "PENDING",
        "comment": "审核状态(PENDING/APPROVED/REJECTED/REVISED)"
      },
      {
        "name": "reviewer_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "审核人"
      },
      {
        "name": "label_data",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "详细标注数据(bbox/features等)"
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT UNSIGNED",
        "pk": true
      },
      {
        "name": "slice_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "dimension_code",
        "type": "VARCHAR(64)"
      },
      {
        "name": "old_value",
        "type": "VARCHAR(255)"
      },
      {
        "name": "new_value",
        "type": "VARCHAR(255)"
      },
      {
        "name": "old_source",
        "type": "VARCHAR(20)"
      },
      {
        "name": "new_source",
        "type": "VARCHAR(20)"
      },
      {
        "name": "changed_by",
        "type": "VARCHAR(64)"
      }
    ]
  },
  {
    "tableName": "data_assets",
    "tableComment": "数据资产登记",
    "displayName": "数据资产",
    "description": "数据资产统一登记与管理",
    "domain": "data-governance",
    "icon": "Package",
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
            "name": "asset_code",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": true,
            "defaultVal": "",
            "comment": "资产编码"
      },
      {
            "name": "name",
            "type": "varchar",
            "length": "200",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "资产名称"
      },
      {
            "name": "asset_type",
            "type": "varchar",
            "length": "30",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "资产类型: table/view/file/model"
      },
      {
            "name": "source_table",
            "type": "varchar",
            "length": "100",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "来源表名"
      },
      {
            "name": "owner",
            "type": "varchar",
            "length": "64",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "负责人"
      },
      {
            "name": "department",
            "type": "varchar",
            "length": "100",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "所属部门"
      },
      {
            "name": "sensitivity_level",
            "type": "varchar",
            "length": "20",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "internal",
            "comment": "敏感等级"
      },
      {
            "name": "description",
            "type": "text",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "描述"
      },
      {
            "name": "tags",
            "type": "json",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "标签"
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
            "name": "version",
            "type": "int unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "1",
            "comment": "版本号"
      },
      {
            "name": "created_by",
            "type": "varchar",
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
            "name": "asset_code",
            "type": "varchar"
      },
      {
            "name": "name",
            "type": "varchar"
      },
      {
            "name": "asset_type",
            "type": "varchar"
      },
      {
            "name": "source_table",
            "type": "varchar"
      },
      {
            "name": "owner",
            "type": "varchar"
      },
      {
            "name": "department",
            "type": "varchar"
      },
      {
            "name": "sensitivity_level",
            "type": "varchar"
      },
      {
            "name": "description",
            "type": "text"
      },
      {
            "name": "tags",
            "type": "json"
      },
      {
            "name": "is_active",
            "type": "tinyint(1)"
      },
      {
            "name": "version",
            "type": "int unsigned"
      },
      {
            "name": "created_by",
            "type": "varchar"
      },
      {
            "name": "created_at",
            "type": "datetime(3)"
      }
]
  },
  {
    "tableName": "data_lifecycle_policies",
    "tableComment": "数据生命周期策略",
    "displayName": "生命周期策略",
    "description": "数据保留、归档、清理的生命周期策略管理",
    "domain": "data-governance",
    "icon": "Clock",
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
            "name": "policy_code",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": true,
            "defaultVal": "",
            "comment": "策略编码"
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
            "comment": "策略名称"
      },
      {
            "name": "target_table",
            "type": "varchar",
            "length": "100",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "目标表名"
      },
      {
            "name": "retention_days",
            "type": "int unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "365",
            "comment": "保留天数"
      },
      {
            "name": "archive_engine",
            "type": "varchar",
            "length": "30",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "归档引擎: minio/clickhouse"
      },
      {
            "name": "archive_format",
            "type": "varchar",
            "length": "20",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "归档格式: parquet/csv"
      },
      {
            "name": "clean_strategy",
            "type": "varchar",
            "length": "30",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "soft_delete",
            "comment": "清理策略"
      },
      {
            "name": "cron_expression",
            "type": "varchar",
            "length": "50",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "Cron 表达式"
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
            "name": "version",
            "type": "int unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "1",
            "comment": "版本号"
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
            "name": "policy_code",
            "type": "varchar"
      },
      {
            "name": "name",
            "type": "varchar"
      },
      {
            "name": "target_table",
            "type": "varchar"
      },
      {
            "name": "retention_days",
            "type": "int unsigned"
      },
      {
            "name": "archive_engine",
            "type": "varchar"
      },
      {
            "name": "archive_format",
            "type": "varchar"
      },
      {
            "name": "clean_strategy",
            "type": "varchar"
      },
      {
            "name": "cron_expression",
            "type": "varchar"
      },
      {
            "name": "is_active",
            "type": "tinyint(1)"
      },
      {
            "name": "version",
            "type": "int unsigned"
      },
      {
            "name": "created_at",
            "type": "datetime(3)"
      }
]
  },
{
    "tableName": "data_collection_tasks",
    "tableComment": "数据采集任务",
    "displayName": "采集任务",
    "description": "采集任务管理",
    "domain": "data-governance",
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
    "tableName": "data_collection_metrics",
    "tableComment": "数据采集指标统计",
    "displayName": "采集指标",
    "description": "数据采集任务的运行指标和统计信息",
    "domain": "data-governance",
    "icon": "BarChart3",
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
            "name": "task_id",
            "type": "varchar",
            "length": "64",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "关联采集任务ID"
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
            "name": "metric_date",
            "type": "date",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "统计日期"
      },
      {
            "name": "total_points",
            "type": "bigint unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "0",
            "comment": "总采集点数"
      },
      {
            "name": "success_points",
            "type": "bigint unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "0",
            "comment": "成功点数"
      },
      {
            "name": "error_points",
            "type": "bigint unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "0",
            "comment": "失败点数"
      },
      {
            "name": "avg_latency_ms",
            "type": "double",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "平均延迟(ms)"
      },
      {
            "name": "max_latency_ms",
            "type": "double",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "最大延迟(ms)"
      },
      {
            "name": "data_volume_bytes",
            "type": "bigint unsigned",
            "length": "",
            "nullable": false,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "0",
            "comment": "数据量(字节)"
      },
      {
            "name": "sample_rate_hz",
            "type": "int unsigned",
            "length": "",
            "nullable": true,
            "primaryKey": false,
            "autoIncrement": false,
            "unique": false,
            "defaultVal": "",
            "comment": "采样率(Hz)"
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
            "name": "task_id",
            "type": "varchar"
      },
      {
            "name": "device_code",
            "type": "varchar"
      },
      {
            "name": "metric_date",
            "type": "date"
      },
      {
            "name": "total_points",
            "type": "bigint unsigned"
      },
      {
            "name": "success_points",
            "type": "bigint unsigned"
      },
      {
            "name": "error_points",
            "type": "bigint unsigned"
      },
      {
            "name": "avg_latency_ms",
            "type": "double"
      },
      {
            "name": "max_latency_ms",
            "type": "double"
      },
      {
            "name": "data_volume_bytes",
            "type": "bigint unsigned"
      },
      {
            "name": "sample_rate_hz",
            "type": "int unsigned"
      },
      {
            "name": "created_at",
            "type": "datetime(3)"
      }
]
  },
{
    "tableName": "data_lineage",
    "tableComment": "数据血缘关系",
    "displayName": "数据血缘",
    "description": "数据血缘（V4.0新增）",
    "domain": "data-governance",
    "icon": "Shield",
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
        "name": "source_table",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "源表"
      },
      {
        "name": "source_column",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "源字段"
      },
      {
        "name": "target_table",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标表"
      },
      {
        "name": "target_column",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标字段"
      },
      {
        "name": "transform_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "转换类型(direct/aggregation/calculation)"
      },
      {
        "name": "transform_rule",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "转换规则"
      },
      {
        "name": "pipeline_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "所属Pipeline"
      },
      {
        "name": "confidence",
        "type": "DECIMAL",
        "length": "3,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1.00",
        "comment": "置信度"
      },
      {
        "name": "discovered_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP(3)",
        "comment": "发现时间"
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
        "name": "source_table",
        "type": "VARCHAR"
      },
      {
        "name": "source_column",
        "type": "VARCHAR"
      },
      {
        "name": "target_table",
        "type": "VARCHAR"
      },
      {
        "name": "target_column",
        "type": "VARCHAR"
      },
      {
        "name": "transform_type",
        "type": "VARCHAR"
      },
      {
        "name": "transform_rule",
        "type": "TEXT"
      },
      {
        "name": "pipeline_id",
        "type": "VARCHAR"
      },
      {
        "name": "confidence",
        "type": "DECIMAL"
      },
      {
        "name": "discovered_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
{
    "tableName": "data_governance_jobs",
    "tableComment": "数据治理作业",
    "displayName": "治理作业",
    "description": "治理作业（V4.0新增）",
    "domain": "data-governance",
    "icon": "Shield",
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
        "name": "job_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "作业名称"
      },
      {
        "name": "job_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "作业类型(quality_check/lineage_scan/cleanup)"
      },
      {
        "name": "schedule_cron",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "调度表达式"
      },
      {
        "name": "target_tables",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标表列表"
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
        "comment": "作业配置"
      },
      {
        "name": "last_run_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "上次运行时间"
      },
      {
        "name": "last_run_status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "上次运行状态"
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
        "name": "job_name",
        "type": "VARCHAR"
      },
      {
        "name": "job_type",
        "type": "VARCHAR"
      },
      {
        "name": "schedule_cron",
        "type": "VARCHAR"
      },
      {
        "name": "target_tables",
        "type": "JSON"
      },
      {
        "name": "config",
        "type": "JSON"
      },
      {
        "name": "last_run_at",
        "type": "DATETIME"
      },
      {
        "name": "last_run_status",
        "type": "VARCHAR"
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
];
