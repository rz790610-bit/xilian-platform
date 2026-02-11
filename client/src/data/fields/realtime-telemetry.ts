import type { TableRegistryEntry } from "../types";

export const REALTIME_TELEMETRY_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "alert_event_log",
    "tableComment": "告警事件日志",
    "displayName": "告警事件日志",
    "description": "告警事件日志（V4.0新增）",
    "domain": "realtime-telemetry",
    "icon": "Activity",
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
        "name": "alert_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "告警ID"
      },
      {
        "name": "rule_id",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联规则ID"
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
        "name": "metric_value",
        "type": "DECIMAL",
        "length": "12,4",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "指标值"
      },
      {
        "name": "threshold_value",
        "type": "DECIMAL",
        "length": "12,4",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "阈值"
      },
      {
        "name": "acknowledged",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否已确认"
      },
      {
        "name": "acknowledged_by",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "确认人"
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
        "name": "alert_id",
        "type": "VARCHAR"
      },
      {
        "name": "rule_id",
        "type": "BIGINT"
      },
      {
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "severity",
        "type": "VARCHAR"
      },
      {
        "name": "alert_type",
        "type": "VARCHAR"
      },
      {
        "name": "message",
        "type": "TEXT"
      },
      {
        "name": "metric_value",
        "type": "DECIMAL"
      },
      {
        "name": "threshold_value",
        "type": "DECIMAL"
      },
      {
        "name": "acknowledged",
        "type": "TINYINT"
      },
      {
        "name": "acknowledged_by",
        "type": "VARCHAR"
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
    "tableName": "device_daily_summary",
    "tableComment": "设备日汇总统计",
    "displayName": "设备日汇总",
    "description": "设备日汇总（V4.0新增）",
    "domain": "realtime-telemetry",
    "icon": "Activity",
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
        "name": "summary_date",
        "type": "DATE",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "统计日期"
      },
      {
        "name": "online_hours",
        "type": "DECIMAL",
        "length": "5,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "在线时长(小时)"
      },
      {
        "name": "alert_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "告警次数"
      },
      {
        "name": "data_points",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "数据点数"
      },
      {
        "name": "avg_cpu_usage",
        "type": "DECIMAL",
        "length": "5,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "平均CPU使用率"
      },
      {
        "name": "avg_memory_usage",
        "type": "DECIMAL",
        "length": "5,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "平均内存使用率"
      },
      {
        "name": "max_temperature",
        "type": "DECIMAL",
        "length": "6,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "最高温度"
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
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "summary_date",
        "type": "DATE"
      },
      {
        "name": "online_hours",
        "type": "DECIMAL"
      },
      {
        "name": "alert_count",
        "type": "INT"
      },
      {
        "name": "data_points",
        "type": "BIGINT"
      },
      {
        "name": "avg_cpu_usage",
        "type": "DECIMAL"
      },
      {
        "name": "avg_memory_usage",
        "type": "DECIMAL"
      },
      {
        "name": "max_temperature",
        "type": "DECIMAL"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "device_status_log",
    "tableComment": "设备状态变更日志",
    "displayName": "设备状态日志",
    "description": "设备状态日志（V4.0新增）",
    "domain": "realtime-telemetry",
    "icon": "Activity",
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
        "name": "previous_status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "原状态"
      },
      {
        "name": "current_status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "新状态"
      },
      {
        "name": "reason",
        "type": "VARCHAR",
        "length": "255",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "变更原因"
      },
      {
        "name": "triggered_by",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "触发方式(auto/manual/alert)"
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
        "comment": "附加元数据"
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
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "previous_status",
        "type": "VARCHAR"
      },
      {
        "name": "current_status",
        "type": "VARCHAR"
      },
      {
        "name": "reason",
        "type": "VARCHAR"
      },
      {
        "name": "triggered_by",
        "type": "VARCHAR"
      },
      {
        "name": "metadata",
        "type": "JSON"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "realtime_data_latest",
    "tableComment": "实时数据最新值",
    "displayName": "实时最新数据",
    "description": "实时最新数据（V4.0新增）",
    "domain": "realtime-telemetry",
    "icon": "Activity",
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
        "name": "mp_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "测点编码"
      },
      {
        "name": "value",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "数值"
      },
      {
        "name": "string_value",
        "type": "VARCHAR",
        "length": "512",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "字符串值"
      },
      {
        "name": "quality",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "192",
        "comment": "质量码"
      },
      {
        "name": "source_timestamp",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "源时间戳"
      },
      {
        "name": "server_timestamp",
        "type": "DATETIME",
        "length": "3",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CURRENT_TIMESTAMP(3)",
        "comment": "服务器时间戳"
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
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "mp_code",
        "type": "VARCHAR"
      },
      {
        "name": "value",
        "type": "DOUBLE"
      },
      {
        "name": "string_value",
        "type": "VARCHAR"
      },
      {
        "name": "quality",
        "type": "INT"
      },
      {
        "name": "source_timestamp",
        "type": "DATETIME"
      },
      {
        "name": "server_timestamp",
        "type": "DATETIME"
      },
      {
        "name": "updated_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "vibration_1hour_agg",
    "tableComment": "振动数据1小时聚合",
    "displayName": "振动小时聚合",
    "description": "振动小时聚合（V4.0新增）",
    "domain": "realtime-telemetry",
    "icon": "Activity",
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
        "name": "mp_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "测点编码"
      },
      {
        "name": "hour_start",
        "type": "DATETIME",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "小时开始时间"
      },
      {
        "name": "rms_avg",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "RMS均值"
      },
      {
        "name": "rms_max",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "RMS最大值"
      },
      {
        "name": "peak_avg",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "峰值均值"
      },
      {
        "name": "peak_max",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "峰值最大值"
      },
      {
        "name": "kurtosis_avg",
        "type": "DOUBLE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "峭度均值"
      },
      {
        "name": "sample_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "样本数"
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
        "name": "device_code",
        "type": "VARCHAR"
      },
      {
        "name": "mp_code",
        "type": "VARCHAR"
      },
      {
        "name": "hour_start",
        "type": "DATETIME"
      },
      {
        "name": "rms_avg",
        "type": "DOUBLE"
      },
      {
        "name": "rms_max",
        "type": "DOUBLE"
      },
      {
        "name": "peak_avg",
        "type": "DOUBLE"
      },
      {
        "name": "peak_max",
        "type": "DOUBLE"
      },
      {
        "name": "kurtosis_avg",
        "type": "DOUBLE"
      },
      {
        "name": "sample_count",
        "type": "INT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  }
];
