import type { TableRegistryEntry } from "../types";

export const DIAGNOSIS_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "anomaly_detections",
    "tableComment": "",
    "displayName": "异常检测",
    "description": "异常检测管理",
    "domain": "diagnosis",
    "icon": "AlertTriangle",
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
        "name": "detection_id",
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
        "name": "algorithm_type",
        "type": "ENUM",
        "length": "'zscore','iqr','mad','isolation_forest','custom'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "zscore",
        "comment": ""
      },
      {
        "name": "window_size",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "60",
        "comment": ""
      },
      {
        "name": "threshold",
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
        "name": "current_value",
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
        "name": "expected_value",
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
        "name": "deviation",
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
        "name": "score",
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
        "name": "severity",
        "type": "ENUM",
        "length": "'low','medium','high','critical'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "low",
        "comment": ""
      },
      {
        "name": "status",
        "type": "ENUM",
        "length": "'open','acknowledged','resolved','false_positive'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "open",
        "comment": ""
      },
      {
        "name": "acknowledged_by",
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
        "name": "acknowledged_at",
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
        "name": "resolved_at",
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
        "name": "detection_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "sensor_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "algorithm_type",
        "type": "ENUM('ZSCORE','IQR','MAD','ISO"
      },
      {
        "name": "window_size",
        "type": "INT"
      },
      {
        "name": "threshold",
        "type": "INT"
      },
      {
        "name": "current_value",
        "type": "INT"
      }
    ]
  },
  {
    "tableName": "anomaly_models",
    "tableComment": "异常检测模型",
    "displayName": "异常模型",
    "description": "异常模型（V4.0新增）",
    "domain": "diagnosis",
    "icon": "AlertTriangle",
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
        "name": "model_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "模型编码"
      },
      {
        "name": "model_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模型名称"
      },
      {
        "name": "model_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模型类型(isolation_forest/lstm/autoencoder)"
      },
      {
        "name": "target_metric",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "目标指标"
      },
      {
        "name": "hyperparams",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "超参数JSON"
      },
      {
        "name": "training_data_range",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "训练数据范围"
      },
      {
        "name": "accuracy",
        "type": "DECIMAL",
        "length": "5,4",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "准确率"
      },
      {
        "name": "model_file_url",
        "type": "VARCHAR",
        "length": "512",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模型文件URL"
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
        "comment": "状态(draft/training/deployed/archived)"
      },
      {
        "name": "deployed_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "部署时间"
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
        "name": "model_code",
        "type": "VARCHAR"
      },
      {
        "name": "model_name",
        "type": "VARCHAR"
      },
      {
        "name": "model_type",
        "type": "VARCHAR"
      },
      {
        "name": "target_metric",
        "type": "VARCHAR"
      },
      {
        "name": "hyperparams",
        "type": "JSON"
      },
      {
        "name": "training_data_range",
        "type": "JSON"
      },
      {
        "name": "accuracy",
        "type": "DECIMAL"
      },
      {
        "name": "model_file_url",
        "type": "VARCHAR"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "deployed_at",
        "type": "DATETIME"
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
    "tableName": "diagnosis_results",
    "tableComment": "诊断结果记录",
    "displayName": "诊断结果",
    "description": "诊断结果（V4.0新增）",
    "domain": "diagnosis",
    "icon": "AlertTriangle",
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
        "comment": "诊断任务ID"
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
        "name": "diagnosis_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "诊断类型"
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
        "comment": "严重程度"
      },
      {
        "name": "fault_code",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "故障代码"
      },
      {
        "name": "fault_description",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "故障描述"
      },
      {
        "name": "confidence",
        "type": "DECIMAL",
        "length": "5,4",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "置信度"
      },
      {
        "name": "evidence",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "证据数据JSON"
      },
      {
        "name": "recommendation",
        "type": "TEXT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "处理建议"
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
        "comment": "是否已处理"
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
        "comment": "处理时间"
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
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "diagnosis_type",
        "type": "VARCHAR"
      },
      {
        "name": "severity",
        "type": "VARCHAR"
      },
      {
        "name": "fault_code",
        "type": "VARCHAR"
      },
      {
        "name": "fault_description",
        "type": "TEXT"
      },
      {
        "name": "confidence",
        "type": "DECIMAL"
      },
      {
        "name": "evidence",
        "type": "JSON"
      },
      {
        "name": "recommendation",
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
    "tableName": "diagnosis_rules",
    "tableComment": "",
    "displayName": "诊断规则",
    "description": "诊断规则管理",
    "domain": "diagnosis",
    "icon": "AlertTriangle",
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
        "name": "rule_id",
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
        "length": "200",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
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
        "name": "category",
        "type": "VARCHAR",
        "length": "50",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "device_type",
        "type": "VARCHAR",
        "length": "50",
        "nullable": true,
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
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "condition_expr",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "action_type",
        "type": "ENUM",
        "length": "'alert','notification','workflow','auto_fix'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "alert",
        "comment": ""
      },
      {
        "name": "action_config",
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
        "name": "severity",
        "type": "ENUM",
        "length": "'low','medium','high','critical'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "medium",
        "comment": ""
      },
      {
        "name": "is_active",
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
        "name": "priority",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "5",
        "comment": ""
      },
      {
        "name": "trigger_count",
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
        "name": "last_triggered_at",
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
        "name": "template_version",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": "模板版本号"
      },
      {
        "name": "is_current",
        "type": "TINYINT",
        "length": "1",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": "是否当前版本"
      },
      {
        "name": "published_at",
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
        "name": "deprecated_at",
        "type": "DATETIME",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "废弃时间"
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
        "name": "rule_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "name",
        "type": "VARCHAR(200)"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "category",
        "type": "VARCHAR(50)"
      },
      {
        "name": "device_type",
        "type": "VARCHAR(50)"
      },
      {
        "name": "sensor_type",
        "type": "VARCHAR(50)"
      },
      {
        "name": "condition_expr",
        "type": "TEXT"
      },
      {
        "name": "template_version",
        "type": "INT"
      },
      {
        "name": "is_current",
        "type": "TINYINT(1)"
      },
      {
        "name": "published_at",
        "type": "DATETIME"
      },
      {
        "name": "deprecated_at",
        "type": "DATETIME"
      }
    ]
  }
];
