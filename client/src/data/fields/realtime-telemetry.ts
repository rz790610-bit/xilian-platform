/**
 * realtime-telemetry 域表定义
 * ClickHouse 时序数据库 — 实时遥测与特征存储
 * 表数量: 5
 *
 * 包含：
 *   1. realtime_telemetry       — V5 统一遥测宽表（核心入口）
 *   2. vibration_features       — V4 振动特征存储
 *   3. device_status_log        — V4 设备状态变更日志
 *   4. alert_event_log          — V4 告警事件日志
 *   5. data_quality_metrics     — V4 数据质量指标
 */
import type { TableRegistryEntry } from "../types";

export const REALTIME_TELEMETRY_TABLES: TableRegistryEntry[] = [
  // ─────────────────────────────────────────────
  // 1. realtime_telemetry — V5 统一遥测宽表
  // ─────────────────────────────────────────────
  {
    tableName: "realtime_telemetry",
    tableComment: "统一实时遥测宽表",
    displayName: "实时遥测数据",
    description: "V5 统一遥测入口表，接收所有设备测点的实时数据流。支持工况标识、融合置信度、状态向量等认知层字段。按天分区，保留 180 天。",
    domain: "realtime-telemetry",
    icon: "Activity",
    engine: "MergeTree",
    charset: "",
    collate: "",
    fields: [
      {
        name: "timestamp",
        type: "DateTime64",
        length: "3",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "采集时间戳（毫秒精度）"
      },
      {
        name: "device_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "设备编码"
      },
      {
        name: "mp_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "测点编码"
      },
      {
        name: "metric_name",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "指标名称"
      },
      {
        name: "value",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "指标值"
      },
      {
        name: "quality_score",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "1.0",
        comment: "数据质量分 (0~1)"
      },
      {
        name: "sampling_rate_hz",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "0",
        comment: "采样频率 (Hz)"
      },
      {
        name: "condition_id",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "''",
        comment: "工况 ID（感知层输出）"
      },
      {
        name: "condition_phase",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "''",
        comment: "工况阶段"
      },
      {
        name: "state_vector",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "'[]'",
        comment: "状态向量 JSON 数组"
      },
      {
        name: "fusion_confidence",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "0",
        comment: "融合置信度 (0~1)"
      },
      {
        name: "source_protocol",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "'unknown'",
        comment: "来源协议 (mqtt/http/modbus/opcua)"
      },
      {
        name: "gateway_id",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "''",
        comment: "网关 ID"
      },
      {
        name: "batch_id",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "''",
        comment: "批次 ID"
      }
    ],
    columns: [
      { name: "timestamp", type: "DateTime64(3)" },
      { name: "device_code", type: "String" },
      { name: "mp_code", type: "String" },
      { name: "metric_name", type: "String" },
      { name: "value", type: "Float64" },
      { name: "quality_score", type: "Float32" },
      { name: "sampling_rate_hz", type: "Float32" },
      { name: "condition_id", type: "String" },
      { name: "condition_phase", type: "String" },
      { name: "state_vector", type: "String" },
      { name: "fusion_confidence", type: "Float32" },
      { name: "source_protocol", type: "String" },
      { name: "gateway_id", type: "String" },
      { name: "batch_id", type: "String" }
    ]
  },

  // ─────────────────────────────────────────────
  // 2. vibration_features — V4 振动特征存储
  // ─────────────────────────────────────────────
  {
    tableName: "vibration_features",
    tableComment: "振动特征存储",
    displayName: "振动特征",
    description: "V4 核心时序表，存储经特征提取服务计算后的振动统计特征（RMS、峰值、峰峰值、峭度、波峰因子等）。按月分区，保留 2 年。",
    domain: "realtime-telemetry",
    icon: "Waves",
    engine: "MergeTree",
    charset: "",
    collate: "",
    fields: [
      {
        name: "timestamp",
        type: "DateTime64",
        length: "3",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "采集时间戳"
      },
      {
        name: "device_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "设备编码"
      },
      {
        name: "mp_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "测点编码"
      },
      {
        name: "rms",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "均方根值 (mm/s)"
      },
      {
        name: "peak",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "峰值 (mm/s)"
      },
      {
        name: "peak_to_peak",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "峰峰值 (mm/s)"
      },
      {
        name: "kurtosis",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "峭度"
      },
      {
        name: "crest_factor",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "波峰因子"
      },
      {
        name: "skewness",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "偏度"
      },
      {
        name: "dominant_freq",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "主频 (Hz)"
      },
      {
        name: "dominant_amp",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "主频幅值"
      },
      {
        name: "temperature",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "温度 (°C)"
      },
      {
        name: "rpm",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "转速 (RPM)"
      },
      {
        name: "load_pct",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "负载百分比 (%)"
      },
      {
        name: "quality_score",
        type: "Float32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "数据质量分"
      },
      {
        name: "gateway_id",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "网关 ID"
      },
      {
        name: "batch_id",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "批次 ID"
      }
    ],
    columns: [
      { name: "timestamp", type: "DateTime64(3)" },
      { name: "device_code", type: "String" },
      { name: "mp_code", type: "String" },
      { name: "rms", type: "Float64" },
      { name: "peak", type: "Float64" },
      { name: "peak_to_peak", type: "Float64" },
      { name: "kurtosis", type: "Float64" },
      { name: "crest_factor", type: "Float64" },
      { name: "skewness", type: "Float64" },
      { name: "dominant_freq", type: "Float32" },
      { name: "dominant_amp", type: "Float32" },
      { name: "temperature", type: "Float32" },
      { name: "rpm", type: "Float32" },
      { name: "load_pct", type: "Float32" },
      { name: "quality_score", type: "Float32" },
      { name: "gateway_id", type: "String" },
      { name: "batch_id", type: "String" }
    ]
  },

  // ─────────────────────────────────────────────
  // 3. device_status_log — V4 设备状态变更日志
  // ─────────────────────────────────────────────
  {
    tableName: "device_status_log",
    tableComment: "设备状态变更日志",
    displayName: "设备状态日志",
    description: "V4 设备状态变更记录，替代 V1 device_status_history。记录设备在线/离线/告警等状态切换事件。按月分区，保留 1 年。",
    domain: "realtime-telemetry",
    icon: "ToggleLeft",
    engine: "MergeTree",
    charset: "",
    collate: "",
    fields: [
      {
        name: "timestamp",
        type: "DateTime64",
        length: "3",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "状态变更时间"
      },
      {
        name: "device_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "设备编码"
      },
      {
        name: "status",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "当前状态 (online/offline/warning/maintenance)"
      },
      {
        name: "previous_status",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "前一状态"
      },
      {
        name: "reason",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "变更原因"
      },
      {
        name: "operator",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "操作人"
      },
      {
        name: "metadata",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "'{}'",
        comment: "扩展元数据 JSON"
      }
    ],
    columns: [
      { name: "timestamp", type: "DateTime64(3)" },
      { name: "device_code", type: "String" },
      { name: "status", type: "String" },
      { name: "previous_status", type: "String" },
      { name: "reason", type: "String" },
      { name: "operator", type: "String" },
      { name: "metadata", type: "String" }
    ]
  },

  // ─────────────────────────────────────────────
  // 4. alert_event_log — V4 告警事件日志
  // ─────────────────────────────────────────────
  {
    tableName: "alert_event_log",
    tableComment: "告警事件日志",
    displayName: "告警事件",
    description: "V4 告警事件记录，包含告警类型、严重等级、触发值与阈值对比、上下文信息。按月分区，保留 2 年。",
    domain: "realtime-telemetry",
    icon: "AlertTriangle",
    engine: "MergeTree",
    charset: "",
    collate: "",
    fields: [
      {
        name: "timestamp",
        type: "DateTime64",
        length: "3",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "告警时间"
      },
      {
        name: "device_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "设备编码"
      },
      {
        name: "alert_type",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "告警类型"
      },
      {
        name: "severity",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "严重等级 (info/warning/error/critical)"
      },
      {
        name: "value",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "触发值"
      },
      {
        name: "threshold",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "阈值"
      },
      {
        name: "message",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "告警消息"
      },
      {
        name: "context",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "'{}'",
        comment: "上下文 JSON"
      },
      {
        name: "acknowledged",
        type: "UInt8",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "0",
        comment: "是否已确认 (0/1)"
      }
    ],
    columns: [
      { name: "timestamp", type: "DateTime64(3)" },
      { name: "device_code", type: "String" },
      { name: "alert_type", type: "String" },
      { name: "severity", type: "String" },
      { name: "value", type: "Float64" },
      { name: "threshold", type: "Float64" },
      { name: "message", type: "String" },
      { name: "context", type: "String" },
      { name: "acknowledged", type: "UInt8" }
    ]
  },

  // ─────────────────────────────────────────────
  // 5. data_quality_metrics — V4 数据质量指标
  // ─────────────────────────────────────────────
  {
    tableName: "data_quality_metrics",
    tableComment: "数据质量指标",
    displayName: "数据质量",
    description: "V4 数据质量监控表，按设备×测点维度记录完整性、准确性、时效性、一致性等质量指标。按月分区，保留 1 年。",
    domain: "realtime-telemetry",
    icon: "ShieldCheck",
    engine: "MergeTree",
    charset: "",
    collate: "",
    fields: [
      {
        name: "timestamp",
        type: "DateTime64",
        length: "3",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "评估时间"
      },
      {
        name: "device_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "设备编码"
      },
      {
        name: "mp_code",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "测点编码"
      },
      {
        name: "completeness",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "完整性 (0~1)"
      },
      {
        name: "accuracy",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "准确性 (0~1)"
      },
      {
        name: "timeliness",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "时效性 (0~1)"
      },
      {
        name: "consistency",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "一致性 (0~1)"
      },
      {
        name: "overall_score",
        type: "Float64",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "",
        comment: "综合质量分 (0~1)"
      },
      {
        name: "issues_count",
        type: "UInt32",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "0",
        comment: "问题数量"
      },
      {
        name: "details",
        type: "String",
        length: "",
        nullable: false,
        primaryKey: false,
        autoIncrement: false,
        unique: false,
        defaultVal: "'{}'",
        comment: "详情 JSON"
      }
    ],
    columns: [
      { name: "timestamp", type: "DateTime64(3)" },
      { name: "device_code", type: "String" },
      { name: "mp_code", type: "String" },
      { name: "completeness", type: "Float64" },
      { name: "accuracy", type: "Float64" },
      { name: "timeliness", type: "Float64" },
      { name: "consistency", type: "Float64" },
      { name: "overall_score", type: "Float64" },
      { name: "issues_count", type: "UInt32" },
      { name: "details", type: "String" }
    ]
  }
];
