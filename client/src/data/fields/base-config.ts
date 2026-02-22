import type { TableRegistryEntry } from "../types";

export const BASE_CONFIG_TABLES: TableRegistryEntry[] = [
    {
        "tableName": "base_clean_rules",
        "tableComment": "清洗规则",
        "displayName": "清洗规则",
        "description": "清洗规则管理",
        "domain": "base-config",
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
                "name": "rule_id",
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
                "name": "rule_version",
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
                "name": "measurement_type",
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
                "name": "rule_type",
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
                "name": "detect_config",
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
                "name": "action_type",
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
                "name": "priority",
                "type": "INT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "5",
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
                "name": "is_current",
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
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "rule_id",
                "type": "VARCHAR(64)"
            },
            {
                "name": "rule_version",
                "type": "INT UNSIGNED"
            },
            {
                "name": "name",
                "type": "VARCHAR(100)"
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
                "name": "measurement_type",
                "type": "VARCHAR(50)"
            },
            {
                "name": "rule_type",
                "type": "VARCHAR(30)"
            }
        ]
    },
    {
        "tableName": "base_dict_categories",
        "tableComment": "字典分类",
        "displayName": "字典分类",
        "description": "字典分类管理",
        "domain": "base-config",
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
                "name": "code",
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
                "name": "is_system",
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
                "name": "parent_code",
                "type": "VARCHAR",
                "length": "64",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "父分类编码"
            },
            {
                "name": "level",
                "type": "INT",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "1",
                "comment": "层级深度(1-4)"
            },
            {
                "name": "path",
                "type": "VARCHAR",
                "length": "500",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "完整路径(点号分隔)"
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
                "comment": "扩展属性"
            }
        ],
        "columns": [
            {
                "name": "id",
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "name",
                "type": "VARCHAR(100)"
            },
            {
                "name": "description",
                "type": "TEXT"
            },
            {
                "name": "is_system",
                "type": "TINYINT(1)"
            },
            {
                "name": "is_active",
                "type": "TINYINT(1)"
            },
            {
                "name": "sort_order",
                "type": "INT"
            },
            {
                "name": "version",
                "type": "INT UNSIGNED"
            }
        ]
    },
    {
        "tableName": "base_dict_items",
        "tableComment": "字典项",
        "displayName": "字典项",
        "description": "字典项管理",
        "domain": "base-config",
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
                "name": "category_code",
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
                "name": "code",
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
                "name": "label",
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
                "name": "value",
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
                "name": "parent_code",
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
                "name": "icon",
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
                "name": "color",
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
                "name": "level",
                "type": "INT",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "1",
                "comment": "层级深度"
            },
            {
                "name": "path",
                "type": "VARCHAR",
                "length": "500",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "完整路径(点号分隔)"
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
                "comment": "该项的属性定义"
            }
        ],
        "columns": [
            {
                "name": "id",
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "category_code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "label",
                "type": "VARCHAR(100)"
            },
            {
                "name": "value",
                "type": "VARCHAR(255)"
            },
            {
                "name": "parent_code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "icon",
                "type": "VARCHAR(50)"
            },
            {
                "name": "color",
                "type": "VARCHAR(20)"
            }
        ]
    },
    {
        "tableName": "base_label_dimensions",
        "tableComment": "标注维度定义",
        "displayName": "标注维度",
        "description": "标注维度管理",
        "domain": "base-config",
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
                "name": "code",
                "type": "VARCHAR",
                "length": "64",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": true,
                "defaultVal": "",
                "comment": "维度编码"
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
                "comment": "维度名称"
            },
            {
                "name": "dim_type",
                "type": "VARCHAR",
                "length": "20",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "类型: enum/numeric/boolean/text"
            },
            {
                "name": "is_required",
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
                "name": "allow_sources",
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
                "name": "apply_to",
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
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "name",
                "type": "VARCHAR(100)"
            },
            {
                "name": "dim_type",
                "type": "VARCHAR(20)"
            },
            {
                "name": "is_required",
                "type": "TINYINT(1)"
            },
            {
                "name": "sort_order",
                "type": "INT"
            },
            {
                "name": "allow_sources",
                "type": "JSON"
            },
            {
                "name": "apply_to",
                "type": "JSON"
            }
        ]
    },
    {
        "tableName": "base_label_options",
        "tableComment": "标注值选项",
        "displayName": "标注选项",
        "description": "标注选项管理",
        "domain": "base-config",
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
                "name": "code",
                "type": "VARCHAR",
                "length": "64",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "选项编码"
            },
            {
                "name": "label",
                "type": "VARCHAR",
                "length": "100",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "显示名称"
            },
            {
                "name": "parent_code",
                "type": "VARCHAR",
                "length": "64",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "父选项"
            },
            {
                "name": "color",
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
                "name": "icon",
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
                "name": "is_normal",
                "type": "TINYINT",
                "length": "1",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "1",
                "comment": "是否正常状态"
            },
            {
                "name": "sample_priority",
                "type": "TINYINT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "5",
                "comment": "样本优先级 1-10"
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
                "name": "auto_rule",
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
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "dimension_code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "label",
                "type": "VARCHAR(100)"
            },
            {
                "name": "parent_code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "color",
                "type": "VARCHAR(20)"
            },
            {
                "name": "icon",
                "type": "VARCHAR(50)"
            },
            {
                "name": "is_normal",
                "type": "TINYINT(1)"
            }
        ]
    },
    {
        "tableName": "base_mp_templates",
        "tableComment": "测点类型模板",
        "displayName": "测点模板",
        "description": "测点模板管理",
        "domain": "base-config",
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
                "name": "code",
                "type": "VARCHAR",
                "length": "64",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": true,
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
                "comment": "模板名称"
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
                "comment": "测量类型"
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
                "comment": "物理量"
            },
            {
                "name": "default_unit",
                "type": "VARCHAR",
                "length": "20",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "默认单位"
            },
            {
                "name": "default_sample_rate",
                "type": "INT",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "默认采样率 Hz"
            },
            {
                "name": "default_warning",
                "type": "DOUBLE",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "默认预警阈值"
            },
            {
                "name": "default_critical",
                "type": "DOUBLE",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "默认报警阈值"
            },
            {
                "name": "sensor_config",
                "type": "JSON",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "传感器配置模板"
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
                "comment": "阈值配置模板"
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
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "name",
                "type": "VARCHAR(100)"
            },
            {
                "name": "measurement_type",
                "type": "VARCHAR(30)"
            },
            {
                "name": "physical_quantity",
                "type": "VARCHAR(50)"
            },
            {
                "name": "default_unit",
                "type": "VARCHAR(20)"
            },
            {
                "name": "default_sample_rate",
                "type": "INT UNSIGNED"
            },
            {
                "name": "default_warning",
                "type": "DOUBLE"
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
    },
    {
        "tableName": "base_node_templates",
        "tableComment": "节点类型模板",
        "displayName": "节点模板",
        "description": "节点模板管理",
        "domain": "base-config",
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
                "name": "code",
                "type": "VARCHAR",
                "length": "64",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": true,
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
                "comment": "模板名称"
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
                "comment": "节点类型: device/mechanism/component/assembly/part"
            },
            {
                "name": "derived_from",
                "type": "VARCHAR",
                "length": "64",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "派生自"
            },
            {
                "name": "code_rule",
                "type": "VARCHAR",
                "length": "64",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "编码规则"
            },
            {
                "name": "code_prefix",
                "type": "VARCHAR",
                "length": "30",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "编码前缀"
            },
            {
                "name": "icon",
                "type": "VARCHAR",
                "length": "50",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "图标"
            },
            {
                "name": "is_system",
                "type": "TINYINT",
                "length": "1",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "0",
                "comment": "是否系统内置"
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
                "name": "children",
                "type": "JSON",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "子节点定义"
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
                "comment": "属性定义"
            },
            {
                "name": "measurement_points",
                "type": "JSON",
                "length": "",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "测点定义"
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
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "code",
                "type": "VARCHAR(64)"
            },
            {
                "name": "name",
                "type": "VARCHAR(100)"
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
                "name": "derived_from",
                "type": "VARCHAR(64)"
            },
            {
                "name": "code_rule",
                "type": "VARCHAR(64)"
            },
            {
                "name": "code_prefix",
                "type": "VARCHAR(30)"
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
    },
    {
        "tableName": "base_slice_rules",
        "tableComment": "切片触发规则",
        "displayName": "切片规则",
        "description": "切片规则管理",
        "domain": "base-config",
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
                "name": "rule_id",
                "type": "VARCHAR",
                "length": "64",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "规则 ID"
            },
            {
                "name": "rule_version",
                "type": "INT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "1",
                "comment": "规则版本"
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
                "name": "mechanism_type",
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
                "name": "trigger_type",
                "type": "VARCHAR",
                "length": "30",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "condition_change/time_interval/event/threshold"
            },
            {
                "name": "trigger_config",
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
                "name": "min_duration_sec",
                "type": "INT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "5",
                "comment": ""
            },
            {
                "name": "max_duration_sec",
                "type": "INT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "3600",
                "comment": ""
            },
            {
                "name": "merge_gap_sec",
                "type": "INT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "10",
                "comment": ""
            },
            {
                "name": "auto_labels",
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
                "name": "priority",
                "type": "INT",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "5",
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
                "name": "is_current",
                "type": "TINYINT",
                "length": "1",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "1",
                "comment": "是否当前生效版本"
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
                "type": "INT UNSIGNED",
                "pk": true
            },
            {
                "name": "rule_id",
                "type": "VARCHAR(64)"
            },
            {
                "name": "rule_version",
                "type": "INT UNSIGNED"
            },
            {
                "name": "name",
                "type": "VARCHAR(100)"
            },
            {
                "name": "device_type",
                "type": "VARCHAR(50)"
            },
            {
                "name": "mechanism_type",
                "type": "VARCHAR(50)"
            },
            {
                "name": "trigger_type",
                "type": "VARCHAR(30)"
            },
            {
                "name": "trigger_config",
                "type": "JSON"
            }
        ]
    },
    {
        "tableName": "users",
        "tableComment": "",
        "displayName": "系统用户",
        "description": "系统用户管理",
        "domain": "base-config",
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
    },
    {
        "tableName": "system_configs",
        "tableComment": "系统配置表",
        "displayName": "系统配置",
        "description": "系统全局配置项，支持分组和加密存储（V4.0新增，M4配置中心）",
        "domain": "base-config",
        "icon": "Settings2",
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
                "comment": "主键"
            },
            {
                "name": "config_key",
                "type": "VARCHAR",
                "length": "128",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": true,
                "defaultVal": "",
                "comment": "配置键"
            },
            {
                "name": "config_value",
                "type": "JSON",
                "length": "",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "配置值"
            },
            {
                "name": "config_group",
                "type": "VARCHAR",
                "length": "64",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "general",
                "comment": "配置分组"
            },
            {
                "name": "description",
                "type": "VARCHAR",
                "length": "500",
                "nullable": true,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "",
                "comment": "配置说明"
            },
            {
                "name": "is_encrypted",
                "type": "TINYINT",
                "length": "1",
                "nullable": false,
                "primaryKey": false,
                "autoIncrement": false,
                "unique": false,
                "defaultVal": "0",
                "comment": "是否加密存储"
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
                "type": "INT",
                "pk": true
            },
            {
                "name": "config_key",
                "type": "VARCHAR(128)"
            },
            {
                "name": "config_value",
                "type": "JSON"
            },
            {
                "name": "config_group",
                "type": "VARCHAR(64)"
            },
            {
                "name": "description",
                "type": "VARCHAR(500)"
            },
            {
                "name": "is_encrypted",
                "type": "TINYINT(1)"
            },
            {
                "name": "created_at",
                "type": "DATETIME(3)"
            },
            {
                "name": "updated_at",
                "type": "DATETIME(3)"
            }
        ]
    }
];
