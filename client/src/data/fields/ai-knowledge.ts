/**
 * V4.0 ai-knowledge 域表定义
 * 表数量: 11
 */
import type { TableRegistryEntry } from "../types";

export const AI_KNOWLEDGE_TABLES: TableRegistryEntry[] = [
{
        "tableName": "models",
        "tableComment": "模型注册",
        "displayName": "模型注册",
        "description": "AI模型注册与版本管理",
        "domain": "ai-knowledge",
        "icon": "Brain",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "model_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "display_name", "type": "VARCHAR", "length": "200", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "size", "type": "VARCHAR", "length": "50", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "parameters", "type": "VARCHAR", "length": "50", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "quantization", "type": "VARCHAR", "length": "20", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "download_progress", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "is_default", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "false", "comment": "" },
            { "name": "config", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "capabilities", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metrics", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "dataset_version", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "dataset_clip_count", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "dataset_total_duration_s", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "deployment_target", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "input_format", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "output_format", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "model_id", "type": "VARCHAR" },
            { "name": "name", "type": "VARCHAR" },
            { "name": "display_name", "type": "VARCHAR" },
            { "name": "size", "type": "VARCHAR" },
            { "name": "parameters", "type": "VARCHAR" },
            { "name": "quantization", "type": "VARCHAR" },
            { "name": "description", "type": "TEXT" },
            { "name": "download_progress", "type": "INT" },
            { "name": "is_default", "type": "TINYINT" },
            { "name": "config", "type": "JSON" },
            { "name": "capabilities", "type": "JSON" },
            { "name": "metrics", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" },
            { "name": "dataset_version", "type": "VARCHAR" },
            { "name": "dataset_clip_count", "type": "INT" },
            { "name": "dataset_total_duration_s", "type": "INT" },
            { "name": "deployment_target", "type": "VARCHAR" },
            { "name": "input_format", "type": "VARCHAR" },
            { "name": "output_format", "type": "VARCHAR" }
        ]
    },
{
        "tableName": "model_fine_tune_tasks",
        "tableComment": "微调任务",
        "displayName": "微调任务",
        "description": "模型微调训练任务管理",
        "domain": "ai-knowledge",
        "icon": "Sliders",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "task_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "user_id", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "base_model_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "output_model_id", "type": "VARCHAR", "length": "100", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "progress", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "dataset_path", "type": "VARCHAR", "length": "500", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "dataset_size", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "config", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metrics", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "error", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "started_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "completed_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "task_id", "type": "VARCHAR" },
            { "name": "user_id", "type": "INT" },
            { "name": "base_model_id", "type": "VARCHAR" },
            { "name": "output_model_id", "type": "VARCHAR" },
            { "name": "name", "type": "VARCHAR" },
            { "name": "description", "type": "TEXT" },
            { "name": "progress", "type": "INT" },
            { "name": "dataset_path", "type": "VARCHAR" },
            { "name": "dataset_size", "type": "INT" },
            { "name": "config", "type": "JSON" },
            { "name": "metrics", "type": "JSON" },
            { "name": "error", "type": "TEXT" },
            { "name": "started_at", "type": "TIMESTAMP" },
            { "name": "completed_at", "type": "TIMESTAMP" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "model_evaluations",
        "tableComment": "模型评估",
        "displayName": "模型评估",
        "description": "AI模型评估任务管理",
        "domain": "ai-knowledge",
        "icon": "BarChart",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "evaluation_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "user_id", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "model_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "name", "type": "VARCHAR", "length": "200", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "description", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "progress", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "dataset_path", "type": "VARCHAR", "length": "500", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "dataset_size", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "results", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "error", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "started_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "completed_at", "type": "TIMESTAMP", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "evaluation_id", "type": "VARCHAR" },
            { "name": "user_id", "type": "INT" },
            { "name": "model_id", "type": "VARCHAR" },
            { "name": "name", "type": "VARCHAR" },
            { "name": "description", "type": "TEXT" },
            { "name": "progress", "type": "INT" },
            { "name": "dataset_path", "type": "VARCHAR" },
            { "name": "dataset_size", "type": "INT" },
            { "name": "results", "type": "JSON" },
            { "name": "error", "type": "TEXT" },
            { "name": "started_at", "type": "TIMESTAMP" },
            { "name": "completed_at", "type": "TIMESTAMP" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "model_usage_logs",
        "tableComment": "模型用量",
        "displayName": "模型用量",
        "description": "模型调用用量统计日志",
        "domain": "ai-knowledge",
        "icon": "FileText",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "log_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "user_id", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "model_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "conversation_id", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "input_tokens", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "output_tokens", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "latency", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "error", "type": "TEXT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metadata", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "device_code", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "sensor_code", "type": "VARCHAR", "length": "64", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "inference_result", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "triggered_alert", "type": "TINYINT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "feedback_status", "type": "VARCHAR", "length": "32", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "log_id", "type": "VARCHAR" },
            { "name": "user_id", "type": "INT" },
            { "name": "model_id", "type": "VARCHAR" },
            { "name": "conversation_id", "type": "VARCHAR" },
            { "name": "input_tokens", "type": "INT" },
            { "name": "output_tokens", "type": "INT" },
            { "name": "latency", "type": "INT" },
            { "name": "error", "type": "TEXT" },
            { "name": "metadata", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "device_code", "type": "VARCHAR" },
            { "name": "sensor_code", "type": "VARCHAR" },
            { "name": "inference_result", "type": "JSON" },
            { "name": "triggered_alert", "type": "TINYINT" },
            { "name": "feedback_status", "type": "VARCHAR" }
        ]
    },
{
        "tableName": "model_conversations",
        "tableComment": "模型对话",
        "displayName": "模型对话",
        "description": "AI模型对话会话管理",
        "domain": "ai-knowledge",
        "icon": "MessageSquare",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "conversation_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "user_id", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "model_id", "type": "VARCHAR", "length": "100", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "title", "type": "VARCHAR", "length": "255", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "message_count", "type": "INT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "total_tokens", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "0", "comment": "" },
            { "name": "metadata", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "updated_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "conversation_id", "type": "VARCHAR" },
            { "name": "user_id", "type": "INT" },
            { "name": "model_id", "type": "VARCHAR" },
            { "name": "title", "type": "VARCHAR" },
            { "name": "message_count", "type": "INT" },
            { "name": "total_tokens", "type": "INT" },
            { "name": "metadata", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" },
            { "name": "updated_at", "type": "TIMESTAMP" }
        ]
    },
{
        "tableName": "model_messages",
        "tableComment": "对话消息",
        "displayName": "对话消息",
        "description": "模型对话消息记录",
        "domain": "ai-knowledge",
        "icon": "Mail",
        "engine": "InnoDB",
        "charset": "utf8mb4",
        "collate": "utf8mb4_unicode_ci",
        "fields": [
            { "name": "id", "type": "INT", "length": "", "nullable": true, "primaryKey": true, "autoIncrement": true, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "message_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "conversation_id", "type": "VARCHAR", "length": "64", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "content", "type": "TEXT", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "tokens", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "latency", "type": "INT", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "attachments", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "tool_calls", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "metadata", "type": "JSON", "length": "", "nullable": true, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" },
            { "name": "created_at", "type": "TIMESTAMP", "length": "", "nullable": false, "primaryKey": false, "autoIncrement": false, "unique": false, "defaultVal": "", "comment": "" }
        ],
        "columns": [
            { "name": "id", "type": "INT", "pk": true },
            { "name": "message_id", "type": "VARCHAR" },
            { "name": "conversation_id", "type": "VARCHAR" },
            { "name": "content", "type": "TEXT" },
            { "name": "tokens", "type": "INT" },
            { "name": "latency", "type": "INT" },
            { "name": "attachments", "type": "JSON" },
            { "name": "tool_calls", "type": "JSON" },
            { "name": "metadata", "type": "JSON" },
            { "name": "created_at", "type": "TIMESTAMP" }
        ]
    },
{
    "tableName": "kb_collections",
    "tableComment": "",
    "displayName": "知识库集合",
    "description": "知识库集合管理",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "name",
        "type": "VARCHAR",
        "length": "100",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
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
        "name": "user_id",
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
        "name": "is_public",
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
        "name": "name",
        "type": "VARCHAR(100)"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "user_id",
        "type": "INT"
      },
      {
        "name": "is_public",
        "type": "TINYINT(1)"
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
    "tableName": "kb_documents",
    "tableComment": "",
    "displayName": "知识库文档",
    "description": "知识库文档管理",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "collection_id",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "filename",
        "type": "VARCHAR",
        "length": "255",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "mime_type",
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
        "name": "file_size",
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
        "name": "storage_url",
        "type": "VARCHAR",
        "length": "500",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": ""
      },
      {
        "name": "status",
        "type": "ENUM",
        "length": "'pending','processing','completed','failed'",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "pending",
        "comment": ""
      },
      {
        "name": "processed_at",
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
        "name": "chunks_count",
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
        "name": "entities_count",
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
        "name": "collection_id",
        "type": "INT"
      },
      {
        "name": "filename",
        "type": "VARCHAR(255)"
      },
      {
        "name": "mime_type",
        "type": "VARCHAR(100)"
      },
      {
        "name": "file_size",
        "type": "INT"
      },
      {
        "name": "storage_url",
        "type": "VARCHAR(500)"
      },
      {
        "name": "status",
        "type": "ENUM('PENDING','PROCESSING','C"
      },
      {
        "name": "processed_at",
        "type": "TIMESTAMP"
      }
    ]
  },
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
    }
];
