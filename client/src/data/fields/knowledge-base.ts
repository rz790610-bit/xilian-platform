import type { TableRegistryEntry } from "../types";

export const KNOWLEDGE_BASE_TABLES: TableRegistryEntry[] = [
    {
        "tableName": "kb_points",
        "tableComment": "知识点",
        "displayName": "知识点",
        "description": "知识库知识点管理",
        "domain": "ai-knowledge",
        "icon": "MapPin",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "collection_id", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "title", "type": "VARCHAR", "length": "255", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "content", "type": "TEXT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "category", "type": "VARCHAR", "length": "50", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "general", "comment": "" },
            { "name": "tags", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "source", "type": "VARCHAR", "length": "255", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "entities", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "relations", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "embedding", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "collection_id", "type": "INT" },
            { "name": "title", "type": "VARCHAR" },
            { "name": "content", "type": "TEXT" },
            { "name": "category", "type": "VARCHAR" },
            { "name": "tags", "type": "JSON" },
            { "name": "source", "type": "VARCHAR" },
            { "name": "entities", "type": "JSON" },
            { "name": "relations", "type": "JSON" },
            { "name": "embedding", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
    {
        "tableName": "kg_edges",
        "tableComment": "知识图谱边",
        "displayName": "知识图谱边",
        "description": "知识图谱关系边定义",
        "domain": "ai-knowledge",
        "icon": "GitBranch",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "collection_id", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "edge_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "source_node_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "target_node_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "label", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "type", "type": "VARCHAR", "length": "50", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "related_to", "comment": "" },
            { "name": "weight", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "1", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "collection_id", "type": "INT" },
            { "name": "edge_id", "type": "VARCHAR" },
            { "name": "source_node_id", "type": "VARCHAR" },
            { "name": "target_node_id", "type": "VARCHAR" },
            { "name": "label", "type": "VARCHAR" },
            { "name": "type", "type": "VARCHAR" },
            { "name": "weight", "type": "INT" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
    {
        "tableName": "kg_nodes",
        "tableComment": "知识图谱节点",
        "displayName": "知识图谱节点",
        "description": "知识图谱实体节点定义",
        "domain": "ai-knowledge",
        "icon": "Circle",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "collection_id", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "node_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "label", "type": "VARCHAR", "length": "255", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "type", "type": "VARCHAR", "length": "50", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "entity", "comment": "" },
            { "name": "properties", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "x", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "y", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "collection_id", "type": "INT" },
            { "name": "node_id", "type": "VARCHAR" },
            { "name": "label", "type": "VARCHAR" },
            { "name": "type", "type": "VARCHAR" },
            { "name": "properties", "type": "JSON" },
            { "name": "x", "type": "INT" },
            { "name": "y", "type": "INT" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    }
];
