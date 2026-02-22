import type { TableRegistryEntry } from "../types";

export const AI_KNOWLEDGE_TABLES: TableRegistryEntry[] = [
  {
    "tableName": "kb_chunks",
    "tableComment": "知识切片",
    "displayName": "文档分块",
    "description": "文档分块（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "document_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "所属文档ID"
      },
      {
        "name": "chunk_index",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "切片序号"
      },
      {
        "name": "content",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "切片内容"
      },
      {
        "name": "token_count",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "Token数"
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
        "comment": "元数据"
      },
      {
        "name": "embedding_id",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联向量ID"
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
        "name": "document_id",
        "type": "BIGINT"
      },
      {
        "name": "chunk_index",
        "type": "INT"
      },
      {
        "name": "content",
        "type": "TEXT"
      },
      {
        "name": "token_count",
        "type": "INT"
      },
      {
        "name": "metadata",
        "type": "JSON"
      },
      {
        "name": "embedding_id",
        "type": "BIGINT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
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
    "tableName": "kb_conversation_messages",
    "tableComment": "知识库对话消息",
    "displayName": "对话消息",
    "description": "对话消息（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "conversation_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "对话ID"
      },
      {
        "name": "role",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "角色(user/assistant/system)"
      },
      {
        "name": "content",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "消息内容"
      },
      {
        "name": "token_count",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "Token数"
      },
      {
        "name": "sources",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "引用来源"
      },
      {
        "name": "feedback",
        "type": "TINYINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "用户反馈(1好/-1差)"
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
        "name": "conversation_id",
        "type": "BIGINT"
      },
      {
        "name": "role",
        "type": "VARCHAR"
      },
      {
        "name": "content",
        "type": "TEXT"
      },
      {
        "name": "token_count",
        "type": "INT"
      },
      {
        "name": "sources",
        "type": "JSON"
      },
      {
        "name": "feedback",
        "type": "TINYINT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "kb_conversations",
    "tableComment": "知识库对话",
    "displayName": "对话会话",
    "description": "对话会话（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "collection_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "知识库集合ID"
      },
      {
        "name": "title",
        "type": "VARCHAR",
        "length": "255",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "对话标题"
      },
      {
        "name": "user_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "用户ID"
      },
      {
        "name": "message_count",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "消息数"
      },
      {
        "name": "model_name",
        "type": "VARCHAR",
        "length": "64",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "使用模型"
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
        "name": "collection_id",
        "type": "BIGINT"
      },
      {
        "name": "title",
        "type": "VARCHAR"
      },
      {
        "name": "user_id",
        "type": "VARCHAR"
      },
      {
        "name": "message_count",
        "type": "INT"
      },
      {
        "name": "model_name",
        "type": "VARCHAR"
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
    "tableName": "kb_embeddings",
    "tableComment": "知识向量嵌入",
    "displayName": "向量嵌入",
    "description": "向量嵌入（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "chunk_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "关联切片ID"
      },
      {
        "name": "model_name",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "嵌入模型"
      },
      {
        "name": "dimensions",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "向量维度"
      },
      {
        "name": "vector_data",
        "type": "BLOB",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "向量数据"
      },
      {
        "name": "norm",
        "type": "FLOAT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "向量范数"
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
        "name": "chunk_id",
        "type": "BIGINT"
      },
      {
        "name": "model_name",
        "type": "VARCHAR"
      },
      {
        "name": "dimensions",
        "type": "INT"
      },
      {
        "name": "vector_data",
        "type": "BLOB"
      },
      {
        "name": "norm",
        "type": "FLOAT"
      },
      {
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "kb_qa_pairs",
    "tableComment": "知识库问答对",
    "displayName": "问答对",
    "description": "问答对（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "collection_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "知识库集合ID"
      },
      {
        "name": "question",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "问题"
      },
      {
        "name": "answer",
        "type": "TEXT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "答案"
      },
      {
        "name": "source_document_id",
        "type": "BIGINT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "来源文档ID"
      },
      {
        "name": "confidence",
        "type": "DECIMAL",
        "length": "3,2",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "置信度"
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
        "name": "is_verified",
        "type": "TINYINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "是否已验证"
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
        "name": "collection_id",
        "type": "BIGINT"
      },
      {
        "name": "question",
        "type": "TEXT"
      },
      {
        "name": "answer",
        "type": "TEXT"
      },
      {
        "name": "source_document_id",
        "type": "BIGINT"
      },
      {
        "name": "confidence",
        "type": "DECIMAL"
      },
      {
        "name": "tags",
        "type": "JSON"
      },
      {
        "name": "is_verified",
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
    "tableName": "model_deployments",
    "tableComment": "模型部署记录",
    "displayName": "模型部署",
    "description": "模型部署（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "model_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模型ID"
      },
      {
        "name": "deployment_name",
        "type": "VARCHAR",
        "length": "128",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "部署名称"
      },
      {
        "name": "environment",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "环境(dev/staging/production)"
      },
      {
        "name": "endpoint_url",
        "type": "VARCHAR",
        "length": "512",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "端点URL"
      },
      {
        "name": "replicas",
        "type": "INT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1",
        "comment": "副本数"
      },
      {
        "name": "gpu_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "GPU类型"
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
      }
    ],
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "pk": true
      },
      {
        "name": "model_id",
        "type": "BIGINT"
      },
      {
        "name": "deployment_name",
        "type": "VARCHAR"
      },
      {
        "name": "environment",
        "type": "VARCHAR"
      },
      {
        "name": "endpoint_url",
        "type": "VARCHAR"
      },
      {
        "name": "replicas",
        "type": "INT"
      },
      {
        "name": "gpu_type",
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
      }
    ]
  },
  {
    "tableName": "model_inference_logs",
    "tableComment": "模型推理日志",
    "displayName": "推理日志",
    "description": "推理日志（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "deployment_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "部署ID"
      },
      {
        "name": "request_id",
        "type": "VARCHAR",
        "length": "64",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": true,
        "defaultVal": "",
        "comment": "请求ID"
      },
      {
        "name": "input_tokens",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "输入Token数"
      },
      {
        "name": "output_tokens",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "输出Token数"
      },
      {
        "name": "latency_ms",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "延迟(ms)"
      },
      {
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
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
        "name": "deployment_id",
        "type": "BIGINT"
      },
      {
        "name": "request_id",
        "type": "VARCHAR"
      },
      {
        "name": "input_tokens",
        "type": "INT"
      },
      {
        "name": "output_tokens",
        "type": "INT"
      },
      {
        "name": "latency_ms",
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
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  },
  {
    "tableName": "model_registry",
    "tableComment": "模型注册表",
    "displayName": "模型注册",
    "description": "模型注册（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "comment": "模型类型(llm/embedding/classification/regression)"
      },
      {
        "name": "framework",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "框架(pytorch/tensorflow/onnx)"
      },
      {
        "name": "version",
        "type": "VARCHAR",
        "length": "32",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "1.0.0",
        "comment": "版本号"
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
        "comment": "描述"
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
        "name": "metrics",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "评估指标JSON"
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
        "name": "status",
        "type": "VARCHAR",
        "length": "16",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "draft",
        "comment": "状态"
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
        "name": "framework",
        "type": "VARCHAR"
      },
      {
        "name": "version",
        "type": "VARCHAR"
      },
      {
        "name": "description",
        "type": "TEXT"
      },
      {
        "name": "model_file_url",
        "type": "VARCHAR"
      },
      {
        "name": "metrics",
        "type": "JSON"
      },
      {
        "name": "tags",
        "type": "JSON"
      },
      {
        "name": "status",
        "type": "VARCHAR"
      },
      {
        "name": "created_by",
        "type": "VARCHAR"
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
    "tableName": "model_training_jobs",
    "tableComment": "模型训练任务",
    "displayName": "训练任务",
    "description": "训练任务（V4.0新增）",
    "domain": "ai-knowledge",
    "icon": "Brain",
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
        "name": "model_id",
        "type": "BIGINT",
        "length": "",
        "nullable": false,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "模型ID"
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
        "comment": "任务名称"
      },
      {
        "name": "training_data",
        "type": "JSON",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "训练数据配置"
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
        "comment": "超参数"
      },
      {
        "name": "gpu_type",
        "type": "VARCHAR",
        "length": "32",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "GPU类型"
      },
      {
        "name": "epochs",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "训练轮次"
      },
      {
        "name": "current_epoch",
        "type": "INT",
        "length": "",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "0",
        "comment": "当前轮次"
      },
      {
        "name": "loss",
        "type": "DECIMAL",
        "length": "10,6",
        "nullable": true,
        "primaryKey": false,
        "autoIncrement": false,
        "unique": false,
        "defaultVal": "",
        "comment": "损失值"
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
        "name": "model_id",
        "type": "BIGINT"
      },
      {
        "name": "job_name",
        "type": "VARCHAR"
      },
      {
        "name": "training_data",
        "type": "JSON"
      },
      {
        "name": "hyperparams",
        "type": "JSON"
      },
      {
        "name": "gpu_type",
        "type": "VARCHAR"
      },
      {
        "name": "epochs",
        "type": "INT"
      },
      {
        "name": "current_epoch",
        "type": "INT"
      },
      {
        "name": "loss",
        "type": "DECIMAL"
      },
      {
        "name": "status",
        "type": "VARCHAR"
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
        "name": "created_at",
        "type": "DATETIME"
      }
    ]
  }
];
