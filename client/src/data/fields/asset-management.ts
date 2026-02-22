import type { TableRegistryEntry } from "../types";

export const ASSET_MANAGEMENT_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "asset_measurement_points",
    "tableComment": "测点实例",
    "displayName": "测量点",
    "description": "测量点管理",
    "domain": "asset-management",
    "icon": "Building2",
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
        "name": "mp_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "测点 ID"
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
        "comment": "挂载节点"
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
        "comment": "设备编码(冗余加速)"
      },
      {
        "name": "template_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模板编码"
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
        "name": "position",
        "type": "VARCHAR",
        "length": "100",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "位置描述"
      },
      {
        "name": "measurement_type",
        "type": "VARCHAR",
        "length": "30",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "warning_threshold",
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
        "name": "critical_threshold",
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
        "name": "threshold_config",
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
        "name": "mp_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "device_code",
        "type": "VARCHAR(100)"
      },
      {
        "name": "template_code",
        "type": "VARCHAR(64)"
      },
      {
        "name": "name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "position",
        "type": "VARCHAR(100)"
      },
      {
        "name": "measurement_type",
        "type": "VARCHAR(30)"
      }
    ]
  },
  {
    "tableName": "asset_nodes",
    "tableComment": "资产节点",
    "displayName": "资产节点",
    "description": "资产节点管理",
    "domain": "asset-management",
    "icon": "Building2",
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
        "name": "node_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "节点 ID (UUID v7)"
      },
      {
        "name": "code",
        "type": "VARCHAR",
        "length": "100",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "设备编码 (自动生成)"
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
        "comment": "节点名称"
      },
      {
        "name": "level",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "层级 1-5"
      },
      {
        "name": "node_type",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "节点类型"
      },
      {
        "name": "parent_node_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "父节点 ID"
      },
      {
        "name": "root_node_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "根节点 ID(设备 ID)"
      },
      {
        "name": "template_code",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模板编码"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "unknown",
        "comment": "状态"
      },
      {
        "name": "path",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "物化路径: /node_001/node_002/"
      },
      {
        "name": "level_codes",
        "type": "VARCHAR",
        "length": "200",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "层级编码: L1.L2.L3 格式备份"
      },
      {
        "name": "depth",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": "深度(冗余加速)"
      },
      {
        "name": "serial_number",
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
        "name": "location",
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
        "name": "department",
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
        "name": "last_heartbeat",
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
        "name": "install_date",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "warranty_expiry",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "attributes",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "动态扩展属性"
      },
      {
        "name": "sort_order",
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
        "name": "is_deleted",
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
        "name": "deleted_at",
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
        "name": "deleted_by",
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
        "name": "category_path",
        "type": "VARCHAR",
        "length": "500",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "设备分类路径(如rotating.pump.centrifugal)"
      },
      {
        "name": "maintenance_strategy",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "CBM",
        "comment": "维护策略(CBM/TBM/RTF/PdM/RCM)"
      },
      {
        "name": "commissioned_date",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "投运日期"
      },
      {
        "name": "lifecycle_status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "active",
        "comment": "生命周期状态(active/standby/decommissioned)"
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT UNSIGNED",
        "pk": true
      },
      {
        "name": "node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "code",
        "type": "VARCHAR(100)"
      },
      {
        "name": "name",
        "type": "VARCHAR(200)"
      },
      {
        "name": "level",
        "type": "TINYINT UNSIGNED"
      },
      {
        "name": "node_type",
        "type": "VARCHAR(20)"
      },
      {
        "name": "parent_node_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "root_node_id",
        "type": "VARCHAR(64)"
      }
    ]
  },
  {
    "tableName": "asset_sensors",
    "tableComment": "传感器实例",
    "displayName": "传感器",
    "description": "传感器管理",
    "domain": "asset-management",
    "icon": "Building2",
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
        "name": "device_code",
        "type": "VARCHAR",
        "length": "100",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "设备编码"
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
        "comment": "传感器硬件编号"
      },
      {
        "name": "mp_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "测点 ID"
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
        "name": "channel",
        "type": "VARCHAR",
        "length": "10",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "通道号"
      },
      {
        "name": "sample_rate",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "采样率 Hz"
      },
      {
        "name": "physical_quantity",
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
        "name": "unit",
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
        "name": "warning_threshold",
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
        "name": "critical_threshold",
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
        "name": "status",
        "type": "VARCHAR",
        "length": "20",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "active",
        "comment": ""
      },
      {
        "name": "last_value",
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
        "name": "last_reading_at",
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
        "name": "manufacturer",
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
        "name": "model",
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
        "name": "serial_number",
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
        "name": "install_date",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "calibration_date",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "file_name_pattern",
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
        "name": "metadata",
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
        "name": "is_deleted",
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
        "name": "mount_direction",
        "type": "VARCHAR",
        "length": "20",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "安装方向(horizontal/vertical/axial)"
      },
      {
        "name": "protocol",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "通信协议(Modbus-RTU/OPC-UA/MQTT)"
      },
      {
        "name": "sampling_rate",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "采样频率(Hz)"
      },
      {
        "name": "data_format",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "数据格式(float32/int16/waveform)"
      },
      {
        "name": "threshold_config",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "阈值配置(warning/alarm)"
      },
      {
        "name": "next_calibration_date",
        "type": "DATE",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "下次校准日期"
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT UNSIGNED",
        "pk": true
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
        "name": "mp_id",
        "type": "VARCHAR(64)"
      },
      {
        "name": "name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "channel",
        "type": "VARCHAR(10)"
      },
      {
        "name": "sample_rate",
        "type": "INT UNSIGNED"
      },
      {
        "name": "physical_quantity",
        "type": "VARCHAR(50)"
      }
    ]
  },
  {
    "tableName": "sensor_mp_mapping",
    "tableComment": "传感器-测点映射关系",
    "displayName": "传感器测点映射",
    "description": "传感器测点映射（V4.0新增）",
    "domain": "asset-management",
    "icon": "Building2",
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
        "name": "sensor_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "传感器ID"
      },
      {
        "name": "mp_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "测点ID"
      },
      {
        "name": "channel_index",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "通道索引"
      },
      {
        "name": "signal_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "信号类型"
      },
      {
        "name": "mapping_rule",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "映射规则"
      },
      {
        "name": "priority",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "优先级"
      },
      {
        "name": "status",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
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
        "name": "sensor_id",
        "type": "BIGINT"
      },
      {
        "name": "mp_id",
        "type": "BIGINT"
      },
      {
        "name": "channel_index",
        "type": "INT"
      },
      {
        "name": "signal_type",
        "type": "VARCHAR"
      },
      {
        "name": "mapping_rule",
        "type": "JSON"
      },
      {
        "name": "priority",
        "type": "INT"
      },
      {
        "name": "status",
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
