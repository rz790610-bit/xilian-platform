import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ 知识库表 (kb_ 前缀) ============

/**
 * 知识库集合表 - 管理不同的知识库
 */
export const kbCollections = mysqlTable("kb_collections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  userId: int("userId"),
  isPublic: boolean("isPublic").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KbCollection = typeof kbCollections.$inferSelect;
export type InsertKbCollection = typeof kbCollections.$inferInsert;

/**
 * 知识点表 - 存储知识库中的文档片段
 */
export const kbPoints = mysqlTable("kb_points", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  tags: json("tags").$type<string[]>(),
  source: varchar("source", { length: 255 }),
  entities: json("entities").$type<string[]>(),
  relations: json("relations").$type<Array<{ source: string; target: string; type: string }>>(),
  embedding: json("embedding").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KbPoint = typeof kbPoints.$inferSelect;
export type InsertKbPoint = typeof kbPoints.$inferInsert;

/**
 * 文档表 - 存储上传的原始文档信息
 */
export const kbDocuments = mysqlTable("kb_documents", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  storageUrl: varchar("storageUrl", { length: 500 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  processedAt: timestamp("processedAt"),
  chunksCount: int("chunksCount").default(0),
  entitiesCount: int("entitiesCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KbDocument = typeof kbDocuments.$inferSelect;
export type InsertKbDocument = typeof kbDocuments.$inferInsert;

// ============ 知识图谱表 (kg_ 前缀) ============

/**
 * 图谱节点表 - 存储实体节点
 */
export const kgNodes = mysqlTable("kg_nodes", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  nodeId: varchar("nodeId", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).default("entity").notNull(),
  properties: json("properties").$type<Record<string, unknown>>(),
  x: int("x"),
  y: int("y"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KgNode = typeof kgNodes.$inferSelect;
export type InsertKgNode = typeof kgNodes.$inferInsert;

/**
 * 图谱边表 - 存储实体关系
 */
export const kgEdges = mysqlTable("kg_edges", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  edgeId: varchar("edgeId", { length: 100 }).notNull(),
  sourceNodeId: varchar("sourceNodeId", { length: 100 }).notNull(),
  targetNodeId: varchar("targetNodeId", { length: 100 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).default("related_to").notNull(),
  weight: int("weight").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KgEdge = typeof kgEdges.$inferSelect;
export type InsertKgEdge = typeof kgEdges.$inferInsert;

// ============ 系统拓扑表 (topo_ 前缀) ============

/**
 * 拓扑节点表 - 存储系统拓扑中的节点
 */
export const topoNodes = mysqlTable("topo_nodes", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("nodeId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["source", "plugin", "engine", "agent", "output", "database", "service"]).notNull(),
  icon: varchar("icon", { length: 20 }).default("📦"),
  description: text("description"),
  status: mysqlEnum("status", ["online", "offline", "error", "maintenance"]).default("offline").notNull(),
  x: int("x").default(0).notNull(),
  y: int("y").default(0).notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  metrics: json("metrics").$type<{ cpu?: number; memory?: number; latency?: number; throughput?: number }>(),
  lastHeartbeat: timestamp("lastHeartbeat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TopoNode = typeof topoNodes.$inferSelect;
export type InsertTopoNode = typeof topoNodes.$inferInsert;

/**
 * 拓扑连接表 - 存储节点之间的连接关系
 */
export const topoEdges = mysqlTable("topo_edges", {
  id: int("id").autoincrement().primaryKey(),
  edgeId: varchar("edgeId", { length: 64 }).notNull().unique(),
  sourceNodeId: varchar("sourceNodeId", { length: 64 }).notNull(),
  targetNodeId: varchar("targetNodeId", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["data", "dependency", "control"]).default("data").notNull(),
  label: varchar("label", { length: 100 }),
  config: json("config").$type<{ bandwidth?: number; latency?: number; protocol?: string }>(),
  status: mysqlEnum("status", ["active", "inactive", "error"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TopoEdge = typeof topoEdges.$inferSelect;
export type InsertTopoEdge = typeof topoEdges.$inferInsert;

/**
 * 拓扑布局表 - 保存用户的拓扑布局配置
 */
export const topoLayouts = mysqlTable("topo_layouts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  userId: int("userId"),
  isDefault: boolean("isDefault").default(false).notNull(),
  layoutData: json("layoutData").$type<{ nodes: Array<{ nodeId: string; x: number; y: number }>; zoom: number; panX: number; panY: number }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TopoLayout = typeof topoLayouts.$inferSelect;
export type InsertTopoLayout = typeof topoLayouts.$inferInsert;

// ============ 大模型管理表 (model_ 前缀) ============

/**
 * 模型表 - 存储模型基本信息
 */
export const models = mysqlTable("models", {
  id: int("id").autoincrement().primaryKey(),
  modelId: varchar("modelId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("displayName", { length: 200 }),
  type: mysqlEnum("type", ["llm", "embedding", "label", "diagnostic", "vision", "audio"]).notNull(),
  provider: mysqlEnum("provider", ["ollama", "openai", "anthropic", "local", "custom"]).default("ollama").notNull(),
  size: varchar("size", { length: 50 }),
  parameters: varchar("parameters", { length: 50 }),
  quantization: varchar("quantization", { length: 20 }),
  description: text("description"),
  status: mysqlEnum("status", ["available", "loaded", "downloading", "error"]).default("available").notNull(),
  downloadProgress: int("downloadProgress").default(0),
  isDefault: boolean("isDefault").default(false).notNull(),
  config: json("config").$type<{
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
    contextLength?: number;
    systemPrompt?: string;
  }>(),
  capabilities: json("capabilities").$type<{
    chat?: boolean;
    completion?: boolean;
    embedding?: boolean;
    vision?: boolean;
    functionCalling?: boolean;
  }>(),
  metrics: json("metrics").$type<{
    avgLatency?: number;
    totalRequests?: number;
    successRate?: number;
    tokensGenerated?: number;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Model = typeof models.$inferSelect;
export type InsertModel = typeof models.$inferInsert;

/**
 * 模型对话记录表 - 存储对话历史
 */
export const modelConversations = mysqlTable("model_conversations", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull().unique(),
  userId: int("userId"),
  modelId: varchar("modelId", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }),
  messageCount: int("messageCount").default(0).notNull(),
  totalTokens: int("totalTokens").default(0),
  status: mysqlEnum("status", ["active", "archived", "deleted"]).default("active").notNull(),
  metadata: json("metadata").$type<{
    knowledgeBaseId?: number;
    systemPrompt?: string;
    temperature?: number;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelConversation = typeof modelConversations.$inferSelect;
export type InsertModelConversation = typeof modelConversations.$inferInsert;

/**
 * 模型消息表 - 存储对话消息
 */
export const modelMessages = mysqlTable("model_messages", {
  id: int("id").autoincrement().primaryKey(),
  messageId: varchar("messageId", { length: 64 }).notNull().unique(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["system", "user", "assistant", "tool"]).notNull(),
  content: text("content").notNull(),
  tokens: int("tokens"),
  latency: int("latency"),
  attachments: json("attachments").$type<Array<{
    type: string;
    url: string;
    name?: string;
  }>>(),
  toolCalls: json("toolCalls").$type<Array<{
    id: string;
    name: string;
    arguments: string;
    result?: string;
  }>>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelMessage = typeof modelMessages.$inferSelect;
export type InsertModelMessage = typeof modelMessages.$inferInsert;

/**
 * 模型微调任务表 - 存储微调任务
 */
export const modelFineTuneTasks = mysqlTable("model_fine_tune_tasks", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("taskId", { length: 64 }).notNull().unique(),
  userId: int("userId"),
  baseModelId: varchar("baseModelId", { length: 100 }).notNull(),
  outputModelId: varchar("outputModelId", { length: 100 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "preparing", "training", "completed", "failed", "cancelled"]).default("pending").notNull(),
  progress: int("progress").default(0),
  datasetPath: varchar("datasetPath", { length: 500 }),
  datasetSize: int("datasetSize"),
  config: json("config").$type<{
    epochs?: number;
    batchSize?: number;
    learningRate?: number;
    warmupSteps?: number;
    loraRank?: number;
    loraAlpha?: number;
  }>(),
  metrics: json("metrics").$type<{
    trainLoss?: number[];
    evalLoss?: number[];
    currentEpoch?: number;
    totalSteps?: number;
    currentStep?: number;
  }>(),
  error: text("error"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelFineTuneTask = typeof modelFineTuneTasks.$inferSelect;
export type InsertModelFineTuneTask = typeof modelFineTuneTasks.$inferInsert;

/**
 * 模型评估任务表 - 存储评估任务
 */
export const modelEvaluations = mysqlTable("model_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  evaluationId: varchar("evaluationId", { length: 64 }).notNull().unique(),
  userId: int("userId"),
  modelId: varchar("modelId", { length: 100 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  progress: int("progress").default(0),
  datasetPath: varchar("datasetPath", { length: 500 }),
  datasetSize: int("datasetSize"),
  evaluationType: mysqlEnum("evaluationType", ["accuracy", "perplexity", "bleu", "rouge", "custom"]).default("accuracy").notNull(),
  results: json("results").$type<{
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    perplexity?: number;
    bleuScore?: number;
    rougeScore?: { rouge1?: number; rouge2?: number; rougeL?: number };
    customMetrics?: Record<string, number>;
    confusionMatrix?: number[][];
    sampleResults?: Array<{ input: string; expected: string; actual: string; correct: boolean }>;
  }>(),
  error: text("error"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelEvaluation = typeof modelEvaluations.$inferSelect;
export type InsertModelEvaluation = typeof modelEvaluations.$inferInsert;

/**
 * 模型调用日志表 - 记录模型调用
 */
export const modelUsageLogs = mysqlTable("model_usage_logs", {
  id: int("id").autoincrement().primaryKey(),
  logId: varchar("logId", { length: 64 }).notNull().unique(),
  userId: int("userId"),
  modelId: varchar("modelId", { length: 100 }).notNull(),
  conversationId: varchar("conversationId", { length: 64 }),
  requestType: mysqlEnum("requestType", ["chat", "completion", "embedding", "inference"]).notNull(),
  inputTokens: int("inputTokens"),
  outputTokens: int("outputTokens"),
  latency: int("latency"),
  status: mysqlEnum("status", ["success", "error", "timeout"]).notNull(),
  error: text("error"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelUsageLog = typeof modelUsageLogs.$inferSelect;
export type InsertModelUsageLog = typeof modelUsageLogs.$inferInsert;
