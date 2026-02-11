import type { TableRegistryEntry } from "../types";

export const DATA_GOVERNANCE_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "data_clean_results",
    "tableComment": "数据清洗结果",
    "displayName": "清洗结果",
    "description": "清洗结果（V4.0新增）",
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
        "name": "task_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "清洗任务ID"
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
        "comment": "源表名"
      },
      {
        "name": "source_row_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "源行ID"
      },
      {
        "name": "field_name",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "字段名"
      },
      {
        "name": "original_value",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "原始值"
      },
      {
        "name": "cleaned_value",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "清洗后值"
      },
      {
        "name": "rule_applied",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "应用规则"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "success",
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
        "type": "BIGINT"
      },
      {
        "name": "source_table",
        "type": "VARCHAR"
      },
      {
        "name": "source_row_id",
        "type": "BIGINT"
      },
      {
        "name": "field_name",
        "type": "VARCHAR"
      },
      {
        "name": "original_value",
        "type": "TEXT"
      },
      {
        "name": "cleaned_value",
        "type": "TEXT"
      },
      {
        "name": "rule_applied",
        "type": "VARCHAR"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
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
    "tableName": "data_export_tasks",
    "tableComment": "数据导出任务",
    "displayName": "数据导出",
    "description": "数据导出（V4.0新增）",
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
        "name": "task_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "任务名称"
      },
      {
        "name": "export_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "导出类型(csv/json/parquet)"
      },
      {
        "name": "source_query",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "源查询SQL"
      },
      {
        "name": "target_path",
        "type": "VARCHAR",
        "length": "512",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标路径"
      },
      {
        "name": "row_count",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "导出行数"
      },
      {
        "name": "file_size",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "文件大小"
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
        "comment": "状态"
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
        "name": "task_name",
        "type": "VARCHAR"
      },
      {
        "name": "export_type",
        "type": "VARCHAR"
      },
      {
        "name": "source_query",
        "type": "TEXT"
      },
      {
        "name": "target_path",
        "type": "VARCHAR"
      },
      {
        "name": "row_count",
        "type": "BIGINT"
      },
      {
        "name": "file_size",
        "type": "BIGINT"
      },
      {
        "name": "status",
        "type": "VARCHAR"
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
    "tableName": "minio_cleanup_log",
    "tableComment": "MinIO清理日志",
    "displayName": "清理日志",
    "description": "清理日志（V4.0新增）",
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
        "name": "bucket",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "存储桶"
      },
      {
        "name": "object_key",
        "type": "VARCHAR",
        "length": "512",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "对象键"
      },
      {
        "name": "file_size",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "文件大小"
      },
      {
        "name": "reason",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "清理原因(expired/orphan/duplicate)"
      },
      {
        "name": "deleted_at",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP(3)",
        "comment": "删除时间"
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
        "name": "bucket",
        "type": "VARCHAR"
      },
      {
        "name": "object_key",
        "type": "VARCHAR"
      },
      {
        "name": "file_size",
        "type": "BIGINT"
      },
      {
        "name": "reason",
        "type": "VARCHAR"
      },
      {
        "name": "deleted_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "minio_file_metadata",
    "tableComment": "MinIO文件元数据",
    "displayName": "文件元数据",
    "description": "文件元数据（V4.0新增）",
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
        "name": "bucket",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "存储桶"
      },
      {
        "name": "object_key",
        "type": "VARCHAR",
        "length": "512",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "对象键"
      },
      {
        "name": "original_name",
        "type": "VARCHAR",
        "length": "255",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "原始文件名"
      },
      {
        "name": "content_type",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "内容类型"
      },
      {
        "name": "file_size",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "文件大小"
      },
      {
        "name": "etag",
        "type": "VARCHAR",
        "length": "128",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "ETag"
      },
      {
        "name": "tags",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "标签"
      },
      {
        "name": "uploaded_by",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "上传者"
      },
      {
        "name": "expires_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "过期时间"
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
        "name": "bucket",
        "type": "VARCHAR"
      },
      {
        "name": "object_key",
        "type": "VARCHAR"
      },
      {
        "name": "original_name",
        "type": "VARCHAR"
      },
      {
        "name": "content_type",
        "type": "VARCHAR"
      },
      {
        "name": "file_size",
        "type": "BIGINT"
      },
      {
        "name": "etag",
        "type": "VARCHAR"
      },
      {
        "name": "tags",
        "type": "JSON"
      },
      {
        "name": "uploaded_by",
        "type": "VARCHAR"
      },
      {
        "name": "expires_at",
        "type": "DATETIME"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "minio_upload_logs",
    "tableComment": "MinIO上传日志",
    "displayName": "上传日志",
    "description": "上传日志（V4.0新增）",
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
        "name": "bucket",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "存储桶"
      },
      {
        "name": "object_key",
        "type": "VARCHAR",
        "length": "512",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "对象键"
      },
      {
        "name": "file_size",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "文件大小"
      },
      {
        "name": "upload_duration_ms",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "上传耗时(ms)"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "success",
        "comment": "状态"
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
        "name": "uploaded_by",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "上传者"
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
        "name": "bucket",
        "type": "VARCHAR"
      },
      {
        "name": "object_key",
        "type": "VARCHAR"
      },
      {
        "name": "file_size",
        "type": "BIGINT"
      },
      {
        "name": "upload_duration_ms",
        "type": "INT"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "error_message",
        "type": "TEXT"
      },
      {
        "name": "uploaded_by",
        "type": "VARCHAR"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  }
,
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
    }
];
