import type { TableRegistryEntry } from "../types";

export const INTELLIGENT_ANALYSIS_TABLES: TableRegistryEntry[] = [
    {
        "tableName": "diagnosis_tasks",
        "tableComment": "诊断任务",
        "displayName": "诊断任务",
        "description": "智能诊断任务执行记录",
        "domain": "diagnosis",
        "icon": "Activity",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "task_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "node_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "sensor_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "rule_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "anomaly_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "priority", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "5", "comment": "" },
            { "name": "input_data", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "result", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "error", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "started_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "completed_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "task_id", "type": "VARCHAR" },
            { "name": "node_id", "type": "VARCHAR" },
            { "name": "sensor_id", "type": "VARCHAR" },
            { "name": "rule_id", "type": "VARCHAR" },
            { "name": "anomaly_id", "type": "VARCHAR" },
            { "name": "priority", "type": "INT" },
            { "name": "input_data", "type": "JSON" },
            { "name": "result", "type": "JSON" },
            { "name": "error", "type": "TEXT" },
            { "name": "started_at", "type": "TIMESTAMP" },
            { "name": "completed_at", "type": "TIMESTAMP" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    }
];
