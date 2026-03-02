import { int, bigint, tinyint, smallint, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, double, date, datetime, index, uniqueIndex } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 *
 * FIX-130: TiDB 分片键标注
 * 以下高写入量表需要在 TiDB 环境中配置分片键（SHARD_ROW_ID_BITS 或 AUTO_RANDOM）：
 *
 * | 表名                           | 推荐分片键            | 原因                         |
 * |--------------------------------|-----------------------|------------------------------|
 * | device_alerts                  | device_code           | 按设备分散写入热点           |
 * | anomaly_detections             | device_code           | 高频异常检测结果             |
 * | device_operation_logs          | device_code           | 操作日志按设备均匀分布       |
 * | device_kpis                    | device_code           | KPI 指标按设备分片           |
 * | diagnosis_tasks                | device_code           | 诊断任务按设备绑定           |
 * | event_logs                     | aggregate_id          | 事件溯源按聚合ID分片         |
 * | event_store                    | aggregate_id          | 同上                         |
 * | data_slices                    | device_code           | 数据切片按设备分片           |
 * | realtime_telemetry             | device_code           | 实时遥测（MySQL 缓存表）     |
 * | asset_measurement_points       | node_code             | 测点按设备节点分片           |
 * | model_usage_logs               | (id AUTO_RANDOM)      | 模型调用日志，无自然分片键   |
 *
 * TiDB 配置示例：
 *   ALTER TABLE device_alerts SET TIFLASH REPLICA 1;
 *   ALTER TABLE device_alerts SHARD_ROW_ID_BITS = 4;
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
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
  userId: int("user_id"),
  isPublic: boolean("is_public").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KbCollection = typeof kbCollections.$inferSelect;
export type InsertKbCollection = typeof kbCollections.$inferInsert;

/**
 * 知识点表 - 存储知识库中的文档片段
 */
export const kbPoints = mysqlTable("kb_points", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collection_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  tags: json("tags").$type<string[]>(),
  source: varchar("source", { length: 255 }),
  entities: json("entities").$type<string[]>(),
  relations: json("relations").$type<Array<{ source: string; target: string; type: string }>>(),
  embedding: json("embedding").$type<number[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KbPoint = typeof kbPoints.$inferSelect;
export type InsertKbPoint = typeof kbPoints.$inferInsert;

/**
 * 文档表 - 存储上传的原始文档信息
 */
export const kbDocuments = mysqlTable("kb_documents", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collection_id").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  fileSize: int("file_size"),
  storageUrl: varchar("storage_url", { length: 500 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  processedAt: timestamp("processed_at"),
  chunksCount: int("chunks_count").default(0),
  entitiesCount: int("entities_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KbDocument = typeof kbDocuments.$inferSelect;
export type InsertKbDocument = typeof kbDocuments.$inferInsert;

// ============ 知识图谱表 (kg_ 前缀) ============

/**
 * 图谱节点表 - 存储实体节点
 */
export const kgNodes = mysqlTable("kg_nodes", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collection_id").notNull(),
  nodeId: varchar("node_id", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).default("entity").notNull(),
  properties: json("properties").$type<Record<string, unknown>>(),
  x: int("x"),
  y: int("y"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KgNode = typeof kgNodes.$inferSelect;
export type InsertKgNode = typeof kgNodes.$inferInsert;

/**
 * 图谱边表 - 存储实体关系
 */
export const kgEdges = mysqlTable("kg_edges", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collection_id").notNull(),
  edgeId: varchar("edge_id", { length: 100 }).notNull(),
  sourceNodeId: varchar("source_node_id", { length: 100 }).notNull(),
  targetNodeId: varchar("target_node_id", { length: 100 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).default("related_to").notNull(),
  weight: int("weight").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KgEdge = typeof kgEdges.$inferSelect;
export type InsertKgEdge = typeof kgEdges.$inferInsert;

// ============ 系统拓扑表 (topo_ 前缀) ============

/**
 * 拓扑节点表 - 存储系统拓扑中的节点
 */
export const topoNodes = mysqlTable("topo_nodes", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("node_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["source", "plugin", "engine", "agent", "output", "database", "service"]).notNull(),
  icon: varchar("icon", { length: 20 }).default("📦"),
  description: text("description"),
  status: mysqlEnum("status", ["online", "offline", "error", "maintenance"]).default("offline").notNull(),
  x: int("x").default(0).notNull(),
  y: int("y").default(0).notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  metrics: json("metrics").$type<{ cpu?: number; memory?: number; latency?: number; throughput?: number }>(),
  lastHeartbeat: timestamp("last_heartbeat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TopoNode = typeof topoNodes.$inferSelect;
export type InsertTopoNode = typeof topoNodes.$inferInsert;

/**
 * 拓扑连接表 - 存储节点之间的连接关系
 */
export const topoEdges = mysqlTable("topo_edges", {
  id: int("id").autoincrement().primaryKey(),
  edgeId: varchar("edge_id", { length: 64 }).notNull().unique(),
  sourceNodeId: varchar("source_node_id", { length: 64 }).notNull(),
  targetNodeId: varchar("target_node_id", { length: 64 }).notNull(),
  type: mysqlEnum("type", ["data", "dependency", "control"]).default("data").notNull(),
  label: varchar("label", { length: 100 }),
  config: json("config").$type<{ bandwidth?: number; latency?: number; protocol?: string }>(),
  status: mysqlEnum("status", ["active", "inactive", "error"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
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
  userId: int("user_id"),
  isDefault: boolean("is_default").default(false).notNull(),
  layoutData: json("layout_data").$type<{ nodes: Array<{ nodeId: string; x: number; y: number }>; zoom: number; panX: number; panY: number }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TopoLayout = typeof topoLayouts.$inferSelect;
export type InsertTopoLayout = typeof topoLayouts.$inferInsert;

// ============ 大模型管理表 (model_ 前缀) ============

/**
 * 模型表 - 存储模型基本信息
 */
export const models = mysqlTable("models", {
  id: int("id").autoincrement().primaryKey(),
  modelId: varchar("model_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 200 }),
  type: mysqlEnum("type", ["llm", "embedding", "label", "diagnostic", "vision", "audio"]).notNull(),
  provider: mysqlEnum("provider", ["ollama", "openai", "anthropic", "local", "custom"]).default("ollama").notNull(),
  size: varchar("size", { length: 50 }),
  parameters: varchar("parameters", { length: 50 }),
  quantization: varchar("quantization", { length: 20 }),
  description: text("description"),
  status: mysqlEnum("status", ["available", "loaded", "downloading", "error"]).default("available").notNull(),
  downloadProgress: int("download_progress").default(0),
  isDefault: boolean("is_default").default(false).notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  datasetVersion: varchar("dataset_version", { length: 64 }),
  datasetClipCount: int("dataset_clip_count"),
  datasetTotalDurationS: int("dataset_total_duration_s"),
  deploymentTarget: varchar("deployment_target", { length: 64 }),
  inputFormat: varchar("input_format", { length: 64 }),
  outputFormat: varchar("output_format", { length: 64 }),
});

export type Model = typeof models.$inferSelect;
export type InsertModel = typeof models.$inferInsert;

/**
 * 模型对话记录表 - 存储对话历史
 */
export const modelConversations = mysqlTable("model_conversations", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: varchar("conversation_id", { length: 64 }).notNull().unique(),
  userId: int("user_id"),
  modelId: varchar("model_id", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }),
  messageCount: int("message_count").default(0).notNull(),
  totalTokens: int("total_tokens").default(0),
  status: mysqlEnum("status", ["active", "archived", "deleted"]).default("active").notNull(),
  metadata: json("metadata").$type<{
    knowledgeBaseId?: number;
    systemPrompt?: string;
    temperature?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ModelConversation = typeof modelConversations.$inferSelect;
export type InsertModelConversation = typeof modelConversations.$inferInsert;

/**
 * 模型消息表 - 存储对话消息
 */
export const modelMessages = mysqlTable("model_messages", {
  id: int("id").autoincrement().primaryKey(),
  messageId: varchar("message_id", { length: 64 }).notNull().unique(),
  conversationId: varchar("conversation_id", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["system", "user", "assistant", "tool"]).notNull(),
  content: text("content").notNull(),
  tokens: int("tokens"),
  latency: int("latency"),
  attachments: json("attachments").$type<Array<{
    type: string;
    url: string;
    name?: string;
  }>>(),
  toolCalls: json("tool_calls").$type<Array<{
    id: string;
    name: string;
    arguments: string;
    result?: string;
  }>>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ModelMessage = typeof modelMessages.$inferSelect;
export type InsertModelMessage = typeof modelMessages.$inferInsert;

/**
 * 模型微调任务表 - 存储微调任务
 */
export const modelFineTuneTasks = mysqlTable("model_fine_tune_tasks", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("task_id", { length: 64 }).notNull().unique(),
  userId: int("user_id"),
  baseModelId: varchar("base_model_id", { length: 100 }).notNull(),
  outputModelId: varchar("output_model_id", { length: 100 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "preparing", "training", "completed", "failed", "cancelled"]).default("pending").notNull(),
  progress: int("progress").default(0),
  datasetPath: varchar("dataset_path", { length: 500 }),
  datasetSize: int("dataset_size"),
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
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ModelFineTuneTask = typeof modelFineTuneTasks.$inferSelect;
export type InsertModelFineTuneTask = typeof modelFineTuneTasks.$inferInsert;

/**
 * 模型评估任务表 - 存储评估任务
 */
export const modelEvaluations = mysqlTable("model_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  evaluationId: varchar("evaluation_id", { length: 64 }).notNull().unique(),
  userId: int("user_id"),
  modelId: varchar("model_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  progress: int("progress").default(0),
  datasetPath: varchar("dataset_path", { length: 500 }),
  datasetSize: int("dataset_size"),
  evaluationType: mysqlEnum("evaluation_type", ["accuracy", "perplexity", "bleu", "rouge", "custom"]).default("accuracy").notNull(),
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
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ModelEvaluation = typeof modelEvaluations.$inferSelect;
export type InsertModelEvaluation = typeof modelEvaluations.$inferInsert;

/**
 * 模型调用日志表 - 记录模型调用
 */
export const modelUsageLogs = mysqlTable("model_usage_logs", {
  id: int("id").autoincrement().primaryKey(),
  logId: varchar("log_id", { length: 64 }).notNull().unique(),
  userId: int("user_id"),
  modelId: varchar("model_id", { length: 100 }).notNull(),
  conversationId: varchar("conversation_id", { length: 64 }),
  requestType: mysqlEnum("request_type", ["chat", "completion", "embedding", "inference"]).notNull(),
  inputTokens: int("input_tokens"),
  outputTokens: int("output_tokens"),
  latency: int("latency"),
  status: mysqlEnum("status", ["success", "error", "timeout"]).notNull(),
  error: text("error"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deviceCode: varchar("device_code", { length: 64 }),
  sensorCode: varchar("sensor_code", { length: 64 }),
  inferenceResult: json("inference_result"),
  triggeredAlert: tinyint("triggered_alert").notNull().default(0),
  feedbackStatus: varchar("feedback_status", { length: 32 }),
});

export type ModelUsageLog = typeof modelUsageLogs.$inferSelect;
export type InsertModelUsageLog = typeof modelUsageLogs.$inferInsert;


// ============ [DEPRECATED] 旧设备管理表已移除 ============
// devices, sensors, sensorReadings, sensorAggregates 已废弃
// 设备数据统一使用 asset_nodes 表 (见 v1.5 数据库模块)
// 传感器数据统一使用 asset_sensors 表 (见 v1.5 数据库模块)
// 遥测/聚合数据由 event_store + data_slices 替代

// [DEPRECATED] telemetryData, dataAggregations 已废弃，由 event_store + data_slices 替代

// ============ 事件总线表 (event_ 前缀) ============

/**
 * 事件日志表 - 存储系统事件
 * @shardKey topic — TiDB 分片键：按事件主题分散
 */
export const eventLogs = mysqlTable("event_logs", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("event_id", { length: 64 }).notNull().unique(),
  topic: varchar("topic", { length: 100 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  source: varchar("source", { length: 100 }),
  nodeId: varchar("node_id", { length: 64 }), // 资产节点ID
  sensorId: varchar("sensor_id", { length: 64 }),
  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).default("info").notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  processed: boolean("processed").default(false).notNull(),
  processedAt: timestamp("processed_at"),
  processedBy: varchar("processed_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EventLog = typeof eventLogs.$inferSelect;
export type InsertEventLog = typeof eventLogs.$inferInsert;

/**
 * 异常检测结果表 - 存储异常检测结果
 * @shardKey deviceCode — TiDB 分片键：按设备分散写入
 */
export const anomalyDetections = mysqlTable("anomaly_detections", {
  id: int("id").autoincrement().primaryKey(),
  detectionId: varchar("detection_id", { length: 64 }).notNull().unique(),
  sensorId: varchar("sensor_id", { length: 64 }).notNull(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  deviceCode: varchar("device_code", { length: 128 }), // 设备编码，关联 asset_nodes.code，用于数据流层查询
  algorithmType: mysqlEnum("algorithm_type", ["zscore", "iqr", "mad", "isolation_forest", "custom"]).default("zscore").notNull(),
  windowSize: int("window_size").default(60), // 窗口大小（秒）
  threshold: int("threshold"), // 阈值 * 100
  currentValue: int("current_value"),
  expectedValue: int("expected_value"),
  deviation: int("deviation"), // 偏差 * 100
  score: int("score"), // 异常分数 * 100
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("low").notNull(),
  status: mysqlEnum("status", ["open", "acknowledged", "resolved", "false_positive"]).default("open").notNull(),
  acknowledgedBy: varchar("acknowledged_by", { length: 100 }),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AnomalyDetection = typeof anomalyDetections.$inferSelect;
export type InsertAnomalyDetection = typeof anomalyDetections.$inferInsert;

/**
 * 诊断规则表 - 存储诊断规则
 */
export const diagnosisRules = mysqlTable("diagnosis_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("rule_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  deviceType: varchar("device_type", { length: 50 }),
  sensorType: varchar("sensor_type", { length: 50 }),
  conditionExpr: text("condition_expr").notNull(), // 条件表达式
  actionType: mysqlEnum("action_type", ["alert", "notification", "workflow", "auto_fix"]).default("alert").notNull(),
  actionConfig: json("action_config").$type<{
    notifyChannels?: string[];
    workflowId?: string;
    autoFixScript?: string;
    escalationTime?: number;
  }>(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  priority: int("priority").default(5),
  triggerCount: int("trigger_count").default(0),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  isCurrent: tinyint("is_current").notNull().default(1),
  ruleVersion: int("rule_version").notNull().default(1),
  ruleCreatedBy: varchar("rule_created_by", { length: 64 }),
  ruleUpdatedBy: varchar("rule_updated_by", { length: 64 }),
});

export type DiagnosisRule = typeof diagnosisRules.$inferSelect;
export type InsertDiagnosisRule = typeof diagnosisRules.$inferInsert;

/**
 * 诊断任务表 - 存储诊断任务
 * @shardKey deviceCode — TiDB 分片键：按设备分散写入
 */
export const diagnosisTasks = mysqlTable("diagnosis_tasks", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("task_id", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }), // 资产节点ID
  sensorId: varchar("sensor_id", { length: 64 }),
  ruleId: varchar("rule_id", { length: 64 }),
  anomalyId: varchar("anomaly_id", { length: 64 }),
  taskType: mysqlEnum("task_type", ["routine", "anomaly", "manual", "scheduled"]).default("routine").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
  priority: int("priority").default(5),
  inputData: json("input_data").$type<{
    sensorData?: Array<{ timestamp: string; value: number }>;
    contextData?: Record<string, unknown>;
    userQuery?: string;
  }>(),
  result: json("result").$type<{
    diagnosis?: string;
    confidence?: number;
    recommendations?: string[];
    rootCause?: string;
    affectedComponents?: string[];
  }>(),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DiagnosisTask = typeof diagnosisTasks.$inferSelect;
export type InsertDiagnosisTask = typeof diagnosisTasks.$inferInsert;


// ============ 设备台账扩展表 (device_ 前缀) ============

/**
 * 设备维护记录表 - 存储设备维护历史
 */
export const deviceMaintenanceRecords = mysqlTable("device_maintenance_records", {
  id: int("id").autoincrement().primaryKey(),
  recordId: varchar("record_id", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  maintenanceType: mysqlEnum("maintenance_type", ["preventive", "corrective", "predictive", "emergency", "calibration", "inspection"]).default("preventive").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  scheduledDate: timestamp("scheduled_date"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled", "overdue"]).default("scheduled").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  assignedTo: varchar("assigned_to", { length: 100 }),
  performedBy: varchar("performed_by", { length: 100 }),
  cost: double("cost"),
  currency: varchar("currency", { length: 10 }).default("CNY"),
  parts: json("parts").$type<Array<{ partId: string; name: string; quantity: number; cost: number }>>(),
  findings: text("findings"),
  recommendations: text("recommendations"),
  attachments: json("attachments").$type<Array<{ name: string; url: string; type: string }>>(),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DeviceMaintenanceRecord = typeof deviceMaintenanceRecords.$inferSelect;
export type InsertDeviceMaintenanceRecord = typeof deviceMaintenanceRecords.$inferInsert;

/**
 * 设备备件库存表 - 管理设备备件
 */
export const deviceSpareParts = mysqlTable("device_spare_parts", {
  id: int("id").autoincrement().primaryKey(),
  partId: varchar("part_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  partNumber: varchar("part_number", { length: 100 }),
  category: varchar("category", { length: 50 }),
  compatibleDeviceTypes: json("compatible_device_types").$type<string[]>(),
  manufacturer: varchar("manufacturer", { length: 100 }),
  supplier: varchar("supplier", { length: 100 }),
  quantity: int("quantity").default(0).notNull(),
  minQuantity: int("min_quantity").default(1),
  maxQuantity: int("max_quantity"),
  unitPrice: double("unit_price"),
  currency: varchar("currency", { length: 10 }).default("CNY"),
  location: varchar("location", { length: 100 }),
  status: mysqlEnum("status", ["in_stock", "low_stock", "out_of_stock", "ordered", "discontinued"]).default("in_stock").notNull(),
  lastRestockedAt: timestamp("last_restocked_at"),
  expiryDate: timestamp("expiry_date"),
  metadata: json("metadata").$type<{
    specifications?: Record<string, string>;
    warranty?: string;
    notes?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DeviceSparePart = typeof deviceSpareParts.$inferSelect;
export type InsertDeviceSparePart = typeof deviceSpareParts.$inferInsert;

/**
 * 设备运行日志表 - 记录设备运行状态变化
 */
export const deviceOperationLogs = mysqlTable("device_operation_logs", {
  id: int("id").autoincrement().primaryKey(),
  logId: varchar("log_id", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  operationType: mysqlEnum("operation_type", ["start", "stop", "restart", "config_change", "firmware_update", "calibration", "mode_change", "error", "recovery"]).notNull(),
  previousState: varchar("previous_state", { length: 50 }),
  newState: varchar("new_state", { length: 50 }),
  operatedBy: varchar("operated_by", { length: 100 }),
  reason: text("reason"),
  details: json("details").$type<Record<string, unknown>>(),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("error_message"),
  duration: int("duration"), // 操作耗时（毫秒）
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DeviceOperationLog = typeof deviceOperationLogs.$inferSelect;
export type InsertDeviceOperationLog = typeof deviceOperationLogs.$inferInsert;

/**
 * 设备告警表 - 存储设备告警信息
 * @shardKey nodeId — TiDB 分片键：按设备节点分散写入
 */
export const deviceAlerts = mysqlTable("device_alerts", {
  id: int("id").autoincrement().primaryKey(),
  alertId: varchar("alert_id", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  sensorId: varchar("sensor_id", { length: 64 }),
  alertType: mysqlEnum("alert_type", ["threshold", "anomaly", "offline", "error", "maintenance_due", "warranty_expiry", "custom"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).default("warning").notNull(),
  status: mysqlEnum("status", ["active", "acknowledged", "resolved", "suppressed"]).default("active").notNull(),
  triggerValue: double("trigger_value"),
  thresholdValue: double("threshold_value"),
  acknowledgedBy: varchar("acknowledged_by", { length: 100 }),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by", { length: 100 }),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  escalationLevel: int("escalation_level").default(0),
  notificationsSent: json("notifications_sent").$type<Array<{ channel: string; sentAt: string; recipient: string }>>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DeviceAlert = typeof deviceAlerts.$inferSelect;
export type InsertDeviceAlert = typeof deviceAlerts.$inferInsert;

/**
 * 设备性能指标表 - 存储设备 KPI 指标
 * @shardKey deviceCode — TiDB 分片键：按设备分散写入
 */
export const deviceKpis = mysqlTable("device_kpis", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  periodType: mysqlEnum("period_type", ["hourly", "daily", "weekly", "monthly"]).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  // OEE 指标
  availability: double("availability"), // 可用率 (%)
  performance: double("performance"), // 性能率 (%)
  quality: double("quality"), // 质量率 (%)
  oee: double("oee"), // 设备综合效率 (%)
  // 运行指标
  runningTime: int("running_time"), // 运行时间（秒）
  downtime: int("downtime"), // 停机时间（秒）
  idleTime: int("idle_time"), // 空闲时间（秒）
  plannedDowntime: int("planned_downtime"), // 计划停机时间（秒）
  unplannedDowntime: int("unplanned_downtime"), // 非计划停机时间（秒）
  // 故障指标
  mtbf: double("mtbf"), // 平均故障间隔时间（小时）
  mttr: double("mttr"), // 平均修复时间（小时）
  failureCount: int("failure_count").default(0), // 故障次数
  // 产出指标
  productionCount: int("production_count"), // 生产数量
  defectCount: int("defect_count"), // 缺陷数量
  // 能耗指标
  energyConsumption: double("energy_consumption"), // 能耗 (kWh)
  energyEfficiency: double("energy_efficiency"), // 能效 (单位产出/kWh)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DeviceKpi = typeof deviceKpis.$inferSelect;
export type InsertDeviceKpi = typeof deviceKpis.$inferInsert;


// ============ v1.9 性能优化模块表 ============

/**
 * Outbox 事件表 - 事务性事件发布（Outbox 模式）
 */

/**
 * Outbox 路由配置表 - 事件路由策略配置
 */

/**
 * Saga 实例表 - Saga 编排实例
 */

/**
 * Saga 步骤表 - Saga 执行步骤记录
 */

/**
 * Saga 死信队列表 - 失败的 Saga 记录
 */

/**
 * 已处理事件表 - 幂等性去重记录
 */

/**
 * 设备采样配置表 - 自适应采样率配置
 */
export const deviceSamplingConfig = mysqlTable("device_sampling_config", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  sensorType: varchar("sensor_type", { length: 50 }).notNull(),
  baseSamplingRateMs: int("base_sampling_rate_ms").default(1000).notNull(),
  currentSamplingRateMs: int("current_sampling_rate_ms").default(1000).notNull(),
  minSamplingRateMs: int("min_sampling_rate_ms").default(100).notNull(),
  maxSamplingRateMs: int("max_sampling_rate_ms").default(60000).notNull(),
  adaptiveEnabled: boolean("adaptive_enabled").default(true).notNull(),
  lastAdjustedAt: timestamp("last_adjusted_at"),
  adjustmentReason: varchar("adjustment_reason", { length: 200 }),
  priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  gatewayId: varchar("gateway_id", { length: 64 }),
  endpoint: varchar("endpoint", { length: 256 }),
  registerMap: json("register_map"),
  preprocessingRules: json("preprocessing_rules"),
  triggerRules: json("trigger_rules"),
  compression: varchar("compression", { length: 32 }),
  storageStrategy: varchar("storage_strategy", { length: 32 }),
});

export type DeviceSamplingConfig = typeof deviceSamplingConfig.$inferSelect;
export type InsertDeviceSamplingConfig = typeof deviceSamplingConfig.$inferInsert;

/**
 * 幂等记录表 - 通用幂等性控制
 */
export const idempotentRecords = mysqlTable("idempotent_records", {
  id: int("id").autoincrement().primaryKey(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
  operationType: varchar("operation_type", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).default("processing").notNull(),
  requestHash: varchar("request_hash", { length: 64 }),
  response: json("response").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type IdempotentRecord = typeof idempotentRecords.$inferSelect;
export type InsertIdempotentRecord = typeof idempotentRecords.$inferInsert;

/**
 * 回滚执行表扩展 - 支持 Saga 模式
 */

/**
 * 系统容量指标表 - 用于自适应配置
 */
export const systemCapacityMetrics = mysqlTable("system_capacity_metrics", {
  id: int("id").autoincrement().primaryKey(),
  metricId: varchar("metric_id", { length: 64 }).notNull().unique(),
  metricType: mysqlEnum("metric_type", ["kafka_lag", "db_connections", "memory_usage", "cpu_usage", "queue_depth"]).notNull(),
  componentName: varchar("component_name", { length: 100 }).notNull(),
  currentValue: double("current_value").notNull(),
  threshold: double("threshold").notNull(),
  status: mysqlEnum("status", ["normal", "warning", "critical"]).default("normal").notNull(),
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SystemCapacityMetric = typeof systemCapacityMetrics.$inferSelect;
export type InsertSystemCapacityMetric = typeof systemCapacityMetrics.$inferInsert;


// ============ v1.5 数据库模块 ============

// ============ 编码管理 ============

/**
 * 编码生成规则表
 */
export const baseCodeRules = mysqlTable("base_code_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleCode: varchar("rule_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  segments: json("segments").notNull(),
  currentSequences: json("current_sequences").notNull(),
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseCodeRule = typeof baseCodeRules.$inferSelect;
export type InsertBaseCodeRule = typeof baseCodeRules.$inferInsert;

// ============ 基础库（模板） ============

/**
 * 节点类型模板表
 */
export const baseNodeTemplates = mysqlTable("base_node_templates", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  level: tinyint("level").notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull(),
  derivedFrom: varchar("derived_from", { length: 64 }),
  codeRule: varchar("code_rule", { length: 64 }),
  codePrefix: varchar("code_prefix", { length: 30 }),
  icon: varchar("icon", { length: 50 }),
  isSystem: tinyint("is_system").default(0).notNull(),
  isActive: tinyint("is_active").default(1).notNull(),
  children: json("children"),
  attributes: json("attributes"),
  measurementPoints: json("measurement_points"),
  description: text("description"),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
  isCurrent: tinyint("is_current").notNull().default(1),
  templateVersion: int("template_version").notNull().default(1),
  templateCreatedBy: varchar("template_created_by", { length: 64 }),
  templateUpdatedBy: varchar("template_updated_by", { length: 64 }),
});

export type BaseNodeTemplate = typeof baseNodeTemplates.$inferSelect;
export type InsertBaseNodeTemplate = typeof baseNodeTemplates.$inferInsert;

/**
 * 测点类型模板表
 */
export const baseMpTemplates = mysqlTable("base_mp_templates", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  measurementType: varchar("measurement_type", { length: 30 }).notNull(),
  physicalQuantity: varchar("physical_quantity", { length: 50 }),
  defaultUnit: varchar("default_unit", { length: 20 }),
  defaultSampleRate: int("default_sample_rate"),
  defaultWarning: double("default_warning"),
  defaultCritical: double("default_critical"),
  sensorConfig: json("sensor_config"),
  thresholdConfig: json("threshold_config"),
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
  isCurrent: tinyint("is_current").notNull().default(1),
  templateVersion: int("template_version").notNull().default(1),
  templateCreatedBy: varchar("template_created_by", { length: 64 }),
  templateUpdatedBy: varchar("template_updated_by", { length: 64 }),
});

export type BaseMpTemplate = typeof baseMpTemplates.$inferSelect;
export type InsertBaseMpTemplate = typeof baseMpTemplates.$inferInsert;

// ============ 档案库（实例） ============

/**
 * 资产节点表（设备树）
 */
export const assetNodes = mysqlTable("asset_nodes", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  nodeId: varchar("node_id", { length: 64 }).notNull().unique(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  level: tinyint("level").notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull(),
  parentNodeId: varchar("parent_node_id", { length: 64 }),
  rootNodeId: varchar("root_node_id", { length: 64 }).notNull(),
  templateCode: varchar("template_code", { length: 64 }),
  status: varchar("status", { length: 20 }).default("unknown").notNull(),
  path: text("path").notNull(),
  levelCodes: varchar("level_codes", { length: 200 }),
  depth: tinyint("depth").default(1).notNull(),
  serialNumber: varchar("serial_number", { length: 100 }),
  location: varchar("location", { length: 255 }),
  department: varchar("department", { length: 100 }),
  lastHeartbeat: datetime("last_heartbeat", { fsp: 3 }),
  installDate: date("install_date"),
  warrantyExpiry: date("warranty_expiry"),
  attributes: json("attributes"),
  sortOrder: int("sort_order").default(0).notNull(),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
  deletedAt: datetime("deleted_at", { fsp: 3 }),
  deletedBy: varchar("deleted_by", { length: 64 }),
  categoryPath: varchar("category_path", { length: 500 }),
  maintenanceStrategy: varchar("maintenance_strategy", { length: 32 }),
  commissionedDate: date("commissioned_date"),
  lifecycleStatus: varchar("lifecycle_status", { length: 32 }).notNull().default("active"),
});

export type AssetNode = typeof assetNodes.$inferSelect;
export type InsertAssetNode = typeof assetNodes.$inferInsert;

/**
 * 测点实例表
 */
export const assetMeasurementPoints = mysqlTable("asset_measurement_points", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  mpId: varchar("mp_id", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(),
  deviceCode: varchar("device_code", { length: 100 }).notNull(),
  templateCode: varchar("template_code", { length: 64 }),
  name: varchar("name", { length: 100 }).notNull(),
  position: varchar("position", { length: 100 }),
  measurementType: varchar("measurement_type", { length: 30 }).notNull(),
  warningThreshold: double("warning_threshold"),
  criticalThreshold: double("critical_threshold"),
  thresholdConfig: json("threshold_config"),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type AssetMeasurementPoint = typeof assetMeasurementPoints.$inferSelect;
export type InsertAssetMeasurementPoint = typeof assetMeasurementPoints.$inferInsert;

/**
 * 传感器实例表
 */
export const assetSensors = mysqlTable("asset_sensors", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  deviceCode: varchar("device_code", { length: 100 }).notNull(),
  sensorId: varchar("sensor_id", { length: 64 }).notNull(),
  mpId: varchar("mp_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 100 }),
  channel: varchar("channel", { length: 10 }),
  sampleRate: int("sample_rate"),
  physicalQuantity: varchar("physical_quantity", { length: 50 }),
  unit: varchar("unit", { length: 20 }),
  warningThreshold: double("warning_threshold"),
  criticalThreshold: double("critical_threshold"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  lastValue: double("last_value"),
  lastReadingAt: datetime("last_reading_at", { fsp: 3 }),
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  serialNumber: varchar("serial_number", { length: 100 }),
  installDate: date("install_date"),
  calibrationDate: date("calibration_date"),
  fileNamePattern: varchar("file_name_pattern", { length: 255 }),
  metadata: json("metadata"),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
  mountDirection: varchar("mount_direction", { length: 16 }),
  sensorProtocol: varchar("sensor_protocol", { length: 32 }),
  samplingRate: int("sampling_rate"),
  dataFormat: varchar("data_format", { length: 32 }),
  thresholdConfig: json("threshold_config"),
  nextCalibrationDate: date("next_calibration_date"),
});

export type AssetSensor = typeof assetSensors.$inferSelect;
export type InsertAssetSensor = typeof assetSensors.$inferInsert;

// ============ 标注维度 ============

/**
 * 标注维度定义表
 */
export const baseLabelDimensions = mysqlTable("base_label_dimensions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  dimType: varchar("dim_type", { length: 20 }).notNull(),
  isRequired: tinyint("is_required").default(0).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  allowSources: json("allow_sources"),
  applyTo: json("apply_to"),
  description: text("description"),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseLabelDimension = typeof baseLabelDimensions.$inferSelect;
export type InsertBaseLabelDimension = typeof baseLabelDimensions.$inferInsert;

/**
 * 标注值选项表
 */
export const baseLabelOptions = mysqlTable("base_label_options", {
  id: int("id").autoincrement().primaryKey(),
  dimensionCode: varchar("dimension_code", { length: 64 }).notNull(),
  code: varchar("code", { length: 64 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  parentCode: varchar("parent_code", { length: 64 }),
  color: varchar("color", { length: 20 }),
  icon: varchar("icon", { length: 50 }),
  isNormal: tinyint("is_normal").default(1).notNull(),
  samplePriority: tinyint("sample_priority").default(5).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  autoRule: json("auto_rule"),
  isActive: tinyint("is_active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseLabelOption = typeof baseLabelOptions.$inferSelect;
export type InsertBaseLabelOption = typeof baseLabelOptions.$inferInsert;

// ============ 数据切片 ============

/**
 * 切片触发规则表（带版本）
 */
export const baseSliceRules = mysqlTable("base_slice_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("rule_id", { length: 64 }).notNull(),
  ruleVersion: int("rule_version").default(1).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  deviceType: varchar("device_type", { length: 50 }),
  mechanismType: varchar("mechanism_type", { length: 50 }),
  triggerType: varchar("trigger_type", { length: 30 }).notNull(),
  triggerConfig: json("trigger_config").notNull(),
  minDurationSec: int("min_duration_sec").default(5).notNull(),
  maxDurationSec: int("max_duration_sec").default(3600).notNull(),
  mergeGapSec: int("merge_gap_sec").default(10).notNull(),
  autoLabels: json("auto_labels"),
  priority: int("priority").default(5).notNull(),
  isActive: tinyint("is_active").default(1).notNull(),
  isCurrent: tinyint("is_current").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseSliceRule = typeof baseSliceRules.$inferSelect;
export type InsertBaseSliceRule = typeof baseSliceRules.$inferInsert;

/**
 * 数据切片表
 */
export const dataSlices = mysqlTable("data_slices", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  sliceId: varchar("slice_id", { length: 64 }).notNull().unique(),
  deviceCode: varchar("device_code", { length: 100 }).notNull(),
  nodeId: varchar("node_id", { length: 64 }),
  nodePath: text("node_path"),
  workConditionCode: varchar("work_condition_code", { length: 64 }),
  qualityCode: varchar("quality_code", { length: 64 }),
  faultTypeCode: varchar("fault_type_code", { length: 64 }),
  loadRate: double("load_rate"),
  startTime: datetime("start_time", { fsp: 3 }).notNull(),
  endTime: datetime("end_time", { fsp: 3 }),
  durationMs: int("duration_ms"),
  status: varchar("status", { length: 20 }).default("recording").notNull(),
  labelStatus: varchar("label_status", { length: 20 }).default("auto_only").notNull(),
  labelCountAuto: smallint("label_count_auto").default(0).notNull(),
  labelCountManual: smallint("label_count_manual").default(0).notNull(),
  labels: json("labels").notNull(),
  sensors: json("sensors"),
  dataLocation: json("data_location"),
  summary: json("summary"),
  qualityScore: double("quality_score"),
  dataQuality: json("data_quality"),
  isSample: tinyint("is_sample").default(0).notNull(),
  samplePurpose: varchar("sample_purpose", { length: 20 }),
  sampleDatasetId: varchar("sample_dataset_id", { length: 64 }),
  appliedRuleId: varchar("applied_rule_id", { length: 64 }),
  appliedRuleVersion: int("applied_rule_version"),
  notes: text("notes"),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  verifiedBy: varchar("verified_by", { length: 64 }),
  verifiedAt: datetime("verified_at", { fsp: 3 }),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type DataSlice = typeof dataSlices.$inferSelect;
export type InsertDataSlice = typeof dataSlices.$inferInsert;

/**
 * 标注修改历史表
 */
export const dataSliceLabelHistory = mysqlTable("data_slice_label_history", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  sliceId: varchar("slice_id", { length: 64 }).notNull(),
  dimensionCode: varchar("dimension_code", { length: 64 }).notNull(),
  oldValue: varchar("old_value", { length: 255 }),
  newValue: varchar("new_value", { length: 255 }),
  oldSource: varchar("old_source", { length: 20 }),
  newSource: varchar("new_source", { length: 20 }),
  changedBy: varchar("changed_by", { length: 64 }).notNull(),
  changedAt: datetime("changed_at", { fsp: 3 }).notNull(),
  reason: text("reason"),
  faultClass: varchar("fault_class", { length: 64 }),
  confidence: varchar("confidence", { length: 10 }),
  labelSource: varchar("label_source", { length: 32 }),
  reviewStatus: varchar("review_status", { length: 32 }),
  reviewerId: int("reviewer_id"),
  labelData: json("label_data"),
});

export type DataSliceLabelHistory = typeof dataSliceLabelHistory.$inferSelect;
export type InsertDataSliceLabelHistory = typeof dataSliceLabelHistory.$inferInsert;

// ============ 数据清洗 ============

/**
 * 清洗规则表（带版本）
 */
export const baseCleanRules = mysqlTable("base_clean_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("rule_id", { length: 64 }).notNull(),
  ruleVersion: int("rule_version").default(1).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  deviceType: varchar("device_type", { length: 50 }),
  sensorType: varchar("sensor_type", { length: 50 }),
  measurementType: varchar("measurement_type", { length: 50 }),
  ruleType: varchar("rule_type", { length: 30 }).notNull(),
  detectConfig: json("detect_config").notNull(),
  actionType: varchar("action_type", { length: 30 }).notNull(),
  actionConfig: json("action_config"),
  priority: int("priority").default(5).notNull(),
  isActive: tinyint("is_active").default(1).notNull(),
  isCurrent: tinyint("is_current").default(1).notNull(),
  description: text("description"),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseCleanRule = typeof baseCleanRules.$inferSelect;
export type InsertBaseCleanRule = typeof baseCleanRules.$inferInsert;

/**
 * 清洗任务表
 */
export const dataCleanTasks = mysqlTable("data_clean_tasks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  taskId: varchar("task_id", { length: 64 }).notNull().unique(),
  idempotentKey: varchar("idempotent_key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  deviceCode: varchar("device_code", { length: 100 }),
  sensorIds: json("sensor_ids"),
  timeStart: datetime("time_start", { fsp: 3 }).notNull(),
  timeEnd: datetime("time_end", { fsp: 3 }).notNull(),
  ruleIds: json("rule_ids"),
  ruleSnapshot: json("rule_snapshot"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  progress: tinyint("progress").default(0).notNull(),
  stats: json("stats"),
  startedAt: datetime("started_at", { fsp: 3 }),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
});

export type DataCleanTask = typeof dataCleanTasks.$inferSelect;
export type InsertDataCleanTask = typeof dataCleanTasks.$inferInsert;

/**
 * 清洗记录表
 */
export const dataCleanLogs = mysqlTable("data_clean_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  taskId: varchar("task_id", { length: 64 }),
  sliceId: varchar("slice_id", { length: 64 }),
  deviceCode: varchar("device_code", { length: 100 }).notNull(),
  sensorId: varchar("sensor_id", { length: 64 }).notNull(),
  dataTime: datetime("data_time", { fsp: 3 }).notNull(),
  ruleId: varchar("rule_id", { length: 64 }).notNull(),
  ruleVersion: int("rule_version").notNull(),
  issueType: varchar("issue_type", { length: 50 }).notNull(),
  originalValue: double("original_value"),
  cleanedValue: double("cleaned_value"),
  actionTaken: varchar("action_taken", { length: 50 }).notNull(),
  isFixed: tinyint("is_fixed").default(0).notNull(),
  context: json("context"),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
});

export type DataCleanLog = typeof dataCleanLogs.$inferSelect;
export type InsertDataCleanLog = typeof dataCleanLogs.$inferInsert;

/**
 * 质量报告表
 */
export const dataQualityReports = mysqlTable("data_quality_reports", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  reportType: varchar("report_type", { length: 20 }).notNull(),
  reportDate: date("report_date").notNull(),
  deviceCode: varchar("device_code", { length: 100 }),
  sensorId: varchar("sensor_id", { length: 64 }),
  totalRecords: bigint("total_records", { mode: "number" }).default(0).notNull(),
  validRecords: bigint("valid_records", { mode: "number" }).default(0).notNull(),
  completeness: double("completeness"),
  accuracy: double("accuracy"),
  qualityScore: double("quality_score"),
  metrics: json("metrics").notNull(),
  prevQualityScore: double("prev_quality_score"),
  scoreChange: double("score_change"),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
});

export type DataQualityReport = typeof dataQualityReports.$inferSelect;
export type InsertDataQualityReport = typeof dataQualityReports.$inferInsert;

/**
 * 传感器校准表
 */
export const sensorCalibrations = mysqlTable("sensor_calibrations", {
  id: int("id").autoincrement().primaryKey(),
  deviceCode: varchar("device_code", { length: 100 }).notNull(),
  sensorId: varchar("sensor_id", { length: 64 }).notNull(),
  calibrationDate: date("calibration_date").notNull(),
  calibrationType: varchar("calibration_type", { length: 20 }).notNull(),
  offsetBefore: double("offset_before"),
  offsetAfter: double("offset_after"),
  scaleBefore: double("scale_before"),
  scaleAfter: double("scale_after"),
  calibrationFormula: varchar("calibration_formula", { length: 255 }),
  applyToHistory: tinyint("apply_to_history").default(0).notNull(),
  historyStartTime: datetime("history_start_time", { fsp: 3 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  appliedAt: datetime("applied_at", { fsp: 3 }),
  notes: text("notes"),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
});

export type SensorCalibration = typeof sensorCalibrations.$inferSelect;
export type InsertSensorCalibration = typeof sensorCalibrations.$inferInsert;

// ============ 数据字典 ============

/**
 * 字典分类表
 */
export const baseDictCategories = mysqlTable("base_dict_categories", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isSystem: tinyint("is_system").default(0).notNull(),
  isActive: tinyint("is_active").default(1).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseDictCategory = typeof baseDictCategories.$inferSelect;
export type InsertBaseDictCategory = typeof baseDictCategories.$inferInsert;

/**
 * 字典项表
 */
export const baseDictItems = mysqlTable("base_dict_items", {
  id: int("id").autoincrement().primaryKey(),
  categoryCode: varchar("category_code", { length: 64 }).notNull(),
  code: varchar("code", { length: 64 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  value: varchar("value", { length: 255 }),
  parentCode: varchar("parent_code", { length: 64 }),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  metadata: json("metadata"),
  isActive: tinyint("is_active").default(1).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  version: int("version").default(1).notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
  isDeleted: tinyint("is_deleted").default(0).notNull(),
});

export type BaseDictItem = typeof baseDictItems.$inferSelect;
export type InsertBaseDictItem = typeof baseDictItems.$inferInsert;

// ============ 事件溯源 ============

/**
 * 事件存储表
 */

/**
 * 聚合快照表
 */

// ============ V4.0 新增表 ============

// §12 资产管理域 - 传感器-测点多对多映射
export const sensorMpMapping = mysqlTable("sensor_mp_mapping", {
  id: int("id").autoincrement().primaryKey(),
  sensorId: varchar("sensor_id", { length: 64 }).notNull(),
  mpId: varchar("mp_id", { length: 64 }).notNull(),
  axis: varchar("axis", { length: 8 }),
  weight: varchar("weight", { length: 10 }).notNull().default("1.000"),
  effectiveFrom: timestamp("effective_from", { fsp: 3 }).defaultNow().notNull(),
  effectiveTo: timestamp("effective_to", { fsp: 3 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
}, (table) => [
  index("idx_smp_sensor").on(table.sensorId),
  index("idx_smp_mp").on(table.mpId),
  index("idx_smp_status").on(table.status),
]);
export type SensorMpMapping = typeof sensorMpMapping.$inferSelect;
export type InsertSensorMpMapping = typeof sensorMpMapping.$inferInsert;

// §13 设备运维域 - 设备协议配置
export const deviceProtocolConfig = mysqlTable("device_protocol_config", {
  id: int("id").autoincrement().primaryKey(),
  configId: varchar("config_id", { length: 64 }).notNull().unique(),
  deviceCode: varchar("device_code", { length: 64 }).notNull(),
  protocolType: varchar("protocol_type", { length: 32 }).notNull(),
  connectionParams: json("connection_params").notNull(),
  registerMap: json("register_map"),
  pollingIntervalMs: int("polling_interval_ms").notNull().default(1000),
  timeoutMs: int("timeout_ms").notNull().default(3000),
  retryCount: int("retry_count").notNull().default(3),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  description: text("description"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
}, (table) => [
  index("idx_dpc_device").on(table.deviceCode),
  index("idx_dpc_protocol").on(table.protocolType),
  index("idx_dpc_status").on(table.status),
]);
export type DeviceProtocolConfig = typeof deviceProtocolConfig.$inferSelect;
export type InsertDeviceProtocolConfig = typeof deviceProtocolConfig.$inferInsert;

// §13 设备运维域 - 诊断规则版本
export const deviceRuleVersions = mysqlTable("device_rule_versions", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("rule_id", { length: 64 }).notNull(),
  version: int("version").notNull(),
  ruleConfig: json("rule_config").notNull(),
  changeReason: text("change_reason"),
  rollbackFrom: int("rollback_from"),
  isCurrent: tinyint("is_current").notNull().default(0),
  grayRatio: varchar("gray_ratio", { length: 10 }).notNull().default("0.00"),
  grayDevices: json("gray_devices"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
}, (table) => [
  index("idx_drv_rule").on(table.ruleId),
  index("idx_drv_current").on(table.isCurrent),
  index("idx_drv_status").on(table.status),
]);
export type DeviceRuleVersion = typeof deviceRuleVersions.$inferSelect;
export type InsertDeviceRuleVersion = typeof deviceRuleVersions.$inferInsert;

// §15 数据治理域 - 数据治理任务
export const dataGovernanceJobs = mysqlTable("data_governance_jobs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  jobId: varchar("job_id", { length: 64 }).notNull().unique(),
  policyId: int("policy_id").notNull(),
  jobType: varchar("job_type", { length: 32 }).notNull(),
  targetTable: varchar("target_table", { length: 128 }).notNull(),
  filterCondition: json("filter_condition").notNull(),
  affectedRows: bigint("affected_rows", { mode: "number" }).default(0),
  freedBytes: bigint("freed_bytes", { mode: "number" }).default(0),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_dgj_policy").on(table.policyId),
  index("idx_dgj_type").on(table.jobType),
  index("idx_dgj_status").on(table.status),
]);
export type DataGovernanceJob = typeof dataGovernanceJobs.$inferSelect;
export type InsertDataGovernanceJob = typeof dataGovernanceJobs.$inferInsert;

// §15 数据治理域 - MinIO 清理日志

// §15 数据治理域 - 数据血缘
export const dataLineage = mysqlTable("data_lineage", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  lineageId: varchar("lineage_id", { length: 64 }).notNull().unique(),
  sourceType: varchar("source_type", { length: 64 }).notNull(),
  sourceId: varchar("source_id", { length: 128 }).notNull(),
  sourceDetail: json("source_detail"),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 128 }).notNull(),
  targetDetail: json("target_detail"),
  transformType: varchar("transform_type", { length: 64 }).notNull(),
  transformParams: json("transform_params"),
  operator: varchar("operator", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_dl_source").on(table.sourceType),
  index("idx_dl_target").on(table.targetType),
  index("idx_dl_time").on(table.createdAt),
]);
export type DataLineage = typeof dataLineage.$inferSelect;
export type InsertDataLineage = typeof dataLineage.$inferInsert;

// §18 消息与任务域 - 消息队列日志
export const messageQueueLog = mysqlTable("message_queue_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  messageId: varchar("message_id", { length: 64 }).notNull().unique(),
  topic: varchar("topic", { length: 128 }).notNull(),
  partitionKey: varchar("partition_key", { length: 128 }),
  payload: json("payload").notNull(),
  direction: varchar("direction", { length: 16 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("sent"),
  retryCount: int("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { fsp: 3 }),
}, (table) => [
  index("idx_mql_topic").on(table.topic),
  index("idx_mql_status").on(table.status),
  index("idx_mql_time").on(table.createdAt),
]);
export type MessageQueueLog = typeof messageQueueLog.$inferSelect;
export type InsertMessageQueueLog = typeof messageQueueLog.$inferInsert;

// §18 消息与任务域 - 异步任务日志
export const asyncTaskLog = mysqlTable("async_task_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  taskId: varchar("task_id", { length: 64 }).notNull().unique(),
  taskType: varchar("task_type", { length: 64 }).notNull(),
  inputParams: json("input_params").notNull(),
  outputResult: json("output_result"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  progress: varchar("progress", { length: 10 }).notNull().default("0.00"),
  retryCount: int("retry_count").notNull().default(0),
  maxRetries: int("max_retries").notNull().default(3),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
}, (table) => [
  index("idx_atl_type").on(table.taskType),
  index("idx_atl_status").on(table.status),
  index("idx_atl_time").on(table.createdAt),
]);
export type AsyncTaskLog = typeof asyncTaskLog.$inferSelect;
export type InsertAsyncTaskLog = typeof asyncTaskLog.$inferInsert;

// §21 插件引擎域 - 插件注册表
export const pluginRegistry = mysqlTable("plugin_registry", {
  id: int("id").autoincrement().primaryKey(),
  pluginCode: varchar("plugin_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  pluginType: varchar("plugin_type", { length: 32 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  entryPoint: varchar("entry_point", { length: 256 }).notNull(),
  configSchema: json("config_schema"),
  defaultConfig: json("default_config"),
  capabilities: json("capabilities"),
  dependencies: json("dependencies"),
  author: varchar("author", { length: 128 }),
  license: varchar("license", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  isBuiltin: tinyint("is_builtin").notNull().default(0),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
}, (table) => [
  index("idx_pr_type").on(table.pluginType),
  index("idx_pr_status").on(table.status),
]);
export type PluginRegistry = typeof pluginRegistry.$inferSelect;
export type InsertPluginRegistry = typeof pluginRegistry.$inferInsert;

// §21 插件引擎域 - 插件实例
export const pluginInstances = mysqlTable("plugin_instances", {
  id: int("id").autoincrement().primaryKey(),
  instanceCode: varchar("instance_code", { length: 64 }).notNull().unique(),
  pluginId: int("plugin_id").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  boundEntityType: varchar("bound_entity_type", { length: 64 }),
  boundEntityId: int("bound_entity_id"),
  config: json("config"),
  runtimeState: json("runtime_state"),
  status: varchar("status", { length: 32 }).notNull().default("stopped"),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_pi_plugin").on(table.pluginId),
  index("idx_pi_entity").on(table.boundEntityType),
  index("idx_pi_status").on(table.status),
]);
export type PluginInstance = typeof pluginInstances.$inferSelect;
export type InsertPluginInstance = typeof pluginInstances.$inferInsert;

// §21 插件引擎域 - 插件事件
export const pluginEvents = mysqlTable("plugin_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  eventId: varchar("event_id", { length: 64 }).notNull().unique(),
  instanceId: int("instance_id").notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  payload: json("payload"),
  severity: varchar("severity", { length: 16 }).notNull().default("info"),
  sourcePlugin: varchar("source_plugin", { length: 64 }),
  targetPlugin: varchar("target_plugin", { length: 64 }),
  processed: tinyint("processed").notNull().default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_pe_instance").on(table.instanceId),
  index("idx_pe_type").on(table.eventType),
  index("idx_pe_time").on(table.createdAt),
]);
export type PluginEvent = typeof pluginEvents.$inferSelect;
export type InsertPluginEvent = typeof pluginEvents.$inferInsert;

// §22 配置中心域 - 系统配置

// §22 配置中心域 - 配置变更日志

// §22a 运营管理域 - 告警规则

// §22a 运营管理域 - 审计日志
export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  action: varchar("action", { length: 64 }).notNull(),
  resourceType: varchar("resource_type", { length: 64 }).notNull(),
  resourceId: varchar("resource_id", { length: 128 }).notNull(),
  operator: varchar("operator", { length: 64 }).notNull(),
  operatorIp: varchar("operator_ip", { length: 45 }),
  oldValue: json("old_value"),
  newValue: json("new_value"),
  result: varchar("result", { length: 20 }).notNull().default("success"),
  errorMessage: text("error_message"),
  durationMs: int("duration_ms"),
  traceId: varchar("trace_id", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_al_action").on(table.action),
  index("idx_al_resource").on(table.resourceType),
  index("idx_al_resource_id").on(table.resourceId),
  index("idx_al_operator").on(table.operator),
  index("idx_al_trace").on(table.traceId),
  index("idx_al_time").on(table.createdAt),
]);
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// §22a 运营管理域 - 数据导出任务

// §22b 调度管理域 - 定时任务

// §22b 调度管理域 - 回滚触发器

// ═══════════════════════════════════════════════════════════════
// §23 前端 Schema Registry 对齐补充 — 28张表 (72→100)
// ═══════════════════════════════════════════════════════════════

// ── 设备运维域 ──────────────────────────────

// ── 诊断分析域 ──────────────────────────────

// ── 数据治理域 ──────────────────────────────
export const auditLogsSensitive = mysqlTable("audit_logs_sensitive", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  auditLogId: bigint("audit_log_id", { mode: "number" }).notNull(),  // 关联audit_logs.id
  sensitiveType: varchar("sensitive_type", { length: 64 }).notNull(),  // 敏感类型(password_change/key_rotation/permission_grant等)
  sensitiveData: json("sensitive_data"),  // 敏感数据(加密存储)
  riskLevel: varchar("risk_level", { length: 128 }).notNull(),  // 风险等级
  requiresApproval: tinyint("requires_approval").notNull(),  // 是否需要审批
  approvedBy: varchar("approved_by", { length: 64 }),  // 审批人
  approvedAt: timestamp("approved_at", { fsp: 3 }),  // 审批时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_als_ali").on(table.auditLogId),
  index("idx_als_st").on(table.sensitiveType)
]);
export type AuditLogsSensitive = typeof auditLogsSensitive.$inferSelect;
export type InsertAuditLogsSensitive = typeof auditLogsSensitive.$inferInsert;
export const dataCollectionTasks = mysqlTable("data_collection_tasks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  taskId: varchar("task_id", { length: 128 }).notNull(),  // 任务ID
  taskName: varchar("task_name", { length: 200 }).notNull(),  // 任务名称
  gatewayId: varchar("gateway_id", { length: 128 }).notNull(),  // 执行网关 → edge_gateways
  taskType: varchar("task_type", { length: 64 }),  // 任务类型(continuous/scheduled/on_demand)
  sensorIds: json("sensor_ids").notNull(),  // 关联传感器ID列表
  scheduleConfig: json("schedule_config"),  // 调度配置(cron/interval)
  samplingConfig: json("sampling_config"),  // 采集参数(rate/duration/format)
  preprocessingConfig: json("preprocessing_config"),  // 预处理配置
  triggerConfig: json("trigger_config"),  // FSD触发配置
  uploadConfig: json("upload_config"),  // 上传配置
  totalCollected: bigint("total_collected", { mode: "number" }),  // 累计采集数据点
  totalUploaded: bigint("total_uploaded", { mode: "number" }),  // 累计上传数据点
  totalTriggered: int("total_triggered"),  // 累计触发次数
  errorCount: int("error_count"),  // 累计错误次数
  lastError: text("last_error"),  // 最近错误信息
  lastRunAt: timestamp("last_run_at", { fsp: 3 }),  // 最近执行时间
  status: varchar("status", { length: 64 }).default('active'),  // 状态(running/stopped/error/paused)
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_dct_ti").on(table.taskId),
  index("idx_dct_gi").on(table.gatewayId),
  index("idx_dct_tt").on(table.taskType)
]);
export type DataCollectionTasks = typeof dataCollectionTasks.$inferSelect;
export type InsertDataCollectionTasks = typeof dataCollectionTasks.$inferInsert;

// ── 边缘采集域 ──────────────────────────────

// ── AI知识域 - 知识库 ──────────────────────────────

// ── AI知识域 - 模型中心 ──────────────────────────────

// ── 消息与任务域 ──────────────────────────────
export const messageRoutingConfig = mysqlTable("message_routing_config", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  routeName: varchar("route_name", { length: 200 }).notNull(),  // 路由名称
  sourceTopic: varchar("source_topic", { length: 128 }).notNull(),  // 源主题
  targetTopic: varchar("target_topic", { length: 128 }).notNull(),  // 目标主题
  filterExpr: text("filter_expr"),  // 过滤表达式
  transformScript: text("transform_script"),  // 转换脚本
  priority: int("priority").notNull(),  // 优先级
  isEnabled: tinyint("is_enabled").notNull(),  // 是否启用
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
});
export type MessageRoutingConfig = typeof messageRoutingConfig.$inferSelect;
export type InsertMessageRoutingConfig = typeof messageRoutingConfig.$inferInsert;

// ── 实时遥测域 ──────────────────────────────

// ── 系统拓扑域 ──────────────────────────────

// ===== V4.0 新增表 =====

/** 数据资产登记 */
export const dataAssets = mysqlTable("data_assets", {
  id: int("id").autoincrement().primaryKey(),
  assetCode: varchar("asset_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  assetType: varchar("asset_type", { length: 30 }).notNull(),
  sourceTable: varchar("source_table", { length: 100 }),
  owner: varchar("owner", { length: 64 }),
  department: varchar("department", { length: 100 }),
  sensitivityLevel: varchar("sensitivity_level", { length: 20 }).notNull().default("internal"),
  description: text("description"),
  tags: json("tags"),
  isActive: tinyint("is_active").notNull().default(1),
  version: int("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, (t) => ({
  assetCodeIdx: index("idx_da_asset_code").on(t.assetCode),
  typeIdx: index("idx_da_type").on(t.assetType),
}));

/** 数据生命周期策略 */
export const dataLifecyclePolicies = mysqlTable("data_lifecycle_policies", {
  id: int("id").autoincrement().primaryKey(),
  policyCode: varchar("policy_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  targetTable: varchar("target_table", { length: 100 }).notNull(),
  retentionDays: int("retention_days").notNull().default(365),
  archiveEngine: varchar("archive_engine", { length: 30 }),
  archiveFormat: varchar("archive_format", { length: 20 }),
  cleanStrategy: varchar("clean_strategy", { length: 30 }).notNull().default("soft_delete"),
  cronExpression: varchar("cron_expression", { length: 50 }),
  isActive: tinyint("is_active").notNull().default(1),
  version: int("version").notNull().default(1),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, (t) => ({
  policyCodeIdx: index("idx_dlp_policy_code").on(t.policyCode),
  targetIdx: index("idx_dlp_target").on(t.targetTable),
}));

/** 数据采集指标统计 */
export const dataCollectionMetrics = mysqlTable("data_collection_metrics", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("task_id", { length: 64 }).notNull(),
  deviceCode: varchar("device_code", { length: 64 }).notNull(),
  metricDate: date("metric_date").notNull(),
  totalPoints: bigint("total_points", { mode: "number" }).notNull().default(0),
  successPoints: bigint("success_points", { mode: "number" }).notNull().default(0),
  errorPoints: bigint("error_points", { mode: "number" }).notNull().default(0),
  avgLatencyMs: double("avg_latency_ms"),
  maxLatencyMs: double("max_latency_ms"),
  dataVolumeBytes: bigint("data_volume_bytes", { mode: "number" }).notNull().default(0),
  sampleRateHz: int("sample_rate_hz"),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, (t) => ({
  taskIdx: index("idx_dcm_task").on(t.taskId),
  dateIdx: index("idx_dcm_date").on(t.metricDate),
}));

/** 边缘网关设备 */
export const edgeGateways = mysqlTable("edge_gateways", {
  id: int("id").autoincrement().primaryKey(),
  gatewayId: varchar("gateway_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  gatewayType: varchar("gateway_type", { length: 30 }).notNull(),
  protocol: varchar("protocol", { length: 30 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  port: int("port"),
  firmwareVersion: varchar("firmware_version", { length: 30 }),
  status: varchar("status", { length: 20 }).notNull().default("offline"),
  lastHeartbeat: datetime("last_heartbeat", { fsp: 3 }),
  config: json("config"),
  bufferSizeSec: int("buffer_size_sec").notNull().default(60),
  isActive: tinyint("is_active").notNull().default(1),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, (t) => ({
  gwIdIdx: index("idx_eg_gw_id").on(t.gatewayId),
  statusIdx: index("idx_eg_status").on(t.status),
}));

/** 实时遥测数据缓存 */
export const realtimeTelemetry = mysqlTable("realtime_telemetry", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  gatewayId: varchar("gateway_id", { length: 64 }).notNull(),
  deviceCode: varchar("device_code", { length: 64 }).notNull(),
  mpCode: varchar("mp_code", { length: 64 }).notNull(),
  timestamp: datetime("timestamp", { fsp: 3 }).notNull(),
  value: double("value"),
  unit: varchar("unit", { length: 20 }),
  quality: int("quality").notNull().default(192),
  features: json("features"),
  isAnomaly: tinyint("is_anomaly").notNull().default(0),
  syncedToCh: tinyint("synced_to_ch").notNull().default(0),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, (t) => ({
  gwDevIdx: index("idx_rt_gw_dev").on(t.gatewayId, t.deviceCode),
  tsIdx: index("idx_rt_ts").on(t.timestamp),
  syncIdx: index("idx_rt_sync").on(t.syncedToCh),
}));


// ===== V4.0 恢复的表定义（被 V4 重构脚本误删） =====
export const systemConfigs = mysqlTable("system_configs", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("config_key", { length: 128 }).notNull(),
  configValue: json("config_value").notNull(),
  valueType: varchar("value_type", { length: 32 }).notNull().default("string"),
  category: varchar("category", { length: 64 }).notNull(),
  environment: varchar("environment", { length: 32 }).notNull().default("production"),
  description: text("description"),
  isSensitive: tinyint("is_sensitive").notNull().default(0),
  version: int("version").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
}, (table) => [
  index("idx_sc_category").on(table.category),
  uniqueIndex("uk_sc_key_env").on(table.configKey, table.environment),
]);

export const configChangeLogs = mysqlTable("config_change_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  configId: int("config_id").notNull(),
  configKey: varchar("config_key", { length: 128 }).notNull(),
  oldValue: json("old_value"),
  newValue: json("new_value").notNull(),
  oldVersion: int("old_version"),
  newVersion: int("new_version").notNull(),
  changeReason: text("change_reason"),
  changedBy: varchar("changed_by", { length: 64 }).notNull(),
  changedAt: timestamp("changed_at", { fsp: 3 }).defaultNow().notNull(),
  rollbackTo: bigint("rollback_to", { mode: "number" }),
}, (table) => [
  index("idx_ccl_config").on(table.configId),
  index("idx_ccl_time").on(table.changedAt),
]);

export const alertRules = mysqlTable("alert_rules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  ruleCode: varchar("rule_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  deviceType: varchar("device_type", { length: 64 }).notNull(),
  measurementType: varchar("measurement_type", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default("warning"),
  condition: json("condition").notNull(),
  cooldownSeconds: int("cooldown_seconds").notNull().default(300),
  notificationChannels: json("notification_channels"),
  isActive: tinyint("is_active").notNull().default(1),
  priority: int("priority").notNull().default(0),
  description: text("description"),
  version: int("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
  isDeleted: tinyint("is_deleted").notNull().default(0),
}, (table) => [
  index("idx_ar_device_type").on(table.deviceType),
  index("idx_ar_measurement").on(table.measurementType),
  index("idx_ar_severity").on(table.severity),
  index("idx_ar_time").on(table.createdAt),
]);

export const dataExportTasks = mysqlTable("data_export_tasks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  taskCode: varchar("task_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  exportType: varchar("export_type", { length: 32 }).notNull(),
  format: varchar("format", { length: 20 }).notNull().default("csv"),
  queryParams: json("query_params").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  progress: varchar("progress", { length: 10 }).notNull().default("0"),
  totalRows: bigint("total_rows", { mode: "number" }),
  fileSize: bigint("file_size", { mode: "number" }),
  storagePath: varchar("storage_path", { length: 500 }),
  downloadUrl: varchar("download_url", { length: 1000 }),
  expiresAt: timestamp("expires_at"),
  errorMessage: text("error_message"),
  createdBy: varchar("created_by", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { fsp: 3 }),
}, (table) => [
  index("idx_det_type").on(table.exportType),
  index("idx_det_status").on(table.status),
  index("idx_det_creator").on(table.createdBy),
  index("idx_det_time").on(table.createdAt),
]);

export const scheduledTasks = mysqlTable("scheduled_tasks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  taskCode: varchar("task_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  taskType: varchar("task_type", { length: 32 }).notNull(),
  cronExpression: varchar("cron_expression", { length: 100 }),
  intervalSeconds: int("interval_seconds"),
  handler: varchar("handler", { length: 200 }).notNull(),
  params: json("params"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  lastRunAt: timestamp("last_run_at", { fsp: 3 }),
  lastRunResult: varchar("last_run_result", { length: 20 }),
  nextRunAt: timestamp("next_run_at", { fsp: 3 }),
  retryCount: int("retry_count").notNull().default(0),
  maxRetries: int("max_retries").notNull().default(3),
  timeoutSeconds: int("timeout_seconds").notNull().default(300),
  description: text("description"),
  version: int("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
  isDeleted: tinyint("is_deleted").notNull().default(0),
}, (table) => [
  index("idx_st_type").on(table.taskType),
  index("idx_st_status").on(table.status),
  index("idx_st_next_run").on(table.nextRunAt),
]);

export const rollbackTriggers = mysqlTable("rollback_triggers", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  triggerCode: varchar("trigger_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  targetTable: varchar("target_table", { length: 128 }).notNull(),
  conditionType: varchar("condition_type", { length: 32 }).notNull(),
  conditionParams: json("condition_params").notNull(),
  rollbackAction: varchar("rollback_action", { length: 32 }).notNull(),
  actionParams: json("action_params"),
  isActive: tinyint("is_active").notNull().default(1),
  lastTriggeredAt: timestamp("last_triggered_at", { fsp: 3 }),
  triggerCount: int("trigger_count").notNull().default(0),
  version: int("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
  isDeleted: tinyint("is_deleted").notNull().default(0),
}, (table) => [
  index("idx_rt_table").on(table.targetTable),
]);

export const alertEventLog = mysqlTable("alert_event_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  alertId: varchar("alert_id", { length: 128 }).notNull(),  // 告警ID
  ruleId: bigint("rule_id", { mode: "number" }),  // 关联规则ID
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  severity: varchar("severity", { length: 128 }).notNull(),  // 严重级别
  alertType: varchar("alert_type", { length: 64 }).notNull(),  // 告警类型
  message: text("message").notNull(),  // 告警消息
  metricValue: double("metric_value"),  // 指标值
  thresholdValue: double("threshold_value"),  // 阈值
  acknowledged: tinyint("acknowledged").notNull(),  // 是否已确认
  acknowledgedBy: varchar("acknowledged_by", { length: 64 }),  // 确认人
  resolvedAt: timestamp("resolved_at", { fsp: 3 }),  // 解决时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_ael_ai").on(table.alertId),
  index("idx_ael_ri").on(table.ruleId),
  index("idx_ael_dc").on(table.deviceCode)
]);

export type AlertEventLog = typeof alertEventLog.$inferSelect;
export type InsertAlertEventLog = typeof alertEventLog.$inferInsert;
export const deviceDailySummary = mysqlTable("device_daily_summary", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  summaryDate: date("summary_date").notNull(),  // 统计日期
  onlineHours: double("online_hours"),  // 在线时长(小时)
  alertCount: int("alert_count").notNull(),  // 告警次数
  dataPoints: bigint("data_points", { mode: "number" }).notNull(),  // 数据点数
  avgCpuUsage: double("avg_cpu_usage"),  // 平均CPU使用率
  avgMemoryUsage: double("avg_memory_usage"),  // 平均内存使用率
  maxTemperature: double("max_temperature"),  // 最高温度
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_dds_dc").on(table.deviceCode)
]);

export type DeviceDailySummary = typeof deviceDailySummary.$inferSelect;
export type InsertDeviceDailySummary = typeof deviceDailySummary.$inferInsert;
export const deviceFirmwareVersions = mysqlTable("device_firmware_versions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deviceType: varchar("device_type", { length: 64 }).notNull(),  // 设备类型
  firmwareVersion: varchar("firmware_version", { length: 64 }).notNull(),  // 固件版本号
  releaseNotes: text("release_notes"),  // 发布说明
  fileUrl: varchar("file_url", { length: 500 }).notNull(),  // 固件文件URL
  fileHash: varchar("file_hash", { length: 128 }).notNull(),  // 文件哈希
  fileSize: bigint("file_size", { mode: "number" }).notNull(),  // 文件大小(字节)
  isMandatory: tinyint("is_mandatory").notNull(),  // 是否强制升级
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态(draft/released/deprecated)
  releasedAt: timestamp("released_at", { fsp: 3 }),  // 发布时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_dfv_dt").on(table.deviceType),
  index("idx_dfv_s").on(table.status)
]);

export type DeviceFirmwareVersions = typeof deviceFirmwareVersions.$inferSelect;
export type InsertDeviceFirmwareVersions = typeof deviceFirmwareVersions.$inferInsert;
export const deviceMaintenanceLogs = mysqlTable("device_maintenance_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  maintenanceType: varchar("maintenance_type", { length: 64 }).notNull(),  // 维护类型(preventive/corrective/predictive)
  title: varchar("title", { length: 200 }).notNull(),  // 维护标题
  description: text("description"),  // 维护描述
  operator: varchar("operator", { length: 128 }).notNull(),  // 操作人
  startedAt: timestamp("started_at", { fsp: 3 }).notNull(),  // 开始时间
  completedAt: timestamp("completed_at", { fsp: 3 }),  // 完成时间
  result: varchar("result", { length: 128 }),  // 维护结果(success/partial/failed)
  cost: double("cost"),  // 维护成本
  partsReplaced: json("parts_replaced"),  // 更换部件JSON
  attachments: json("attachments"),  // 附件列表
  nextMaintenanceDate: date("next_maintenance_date"),  // 下次维护日期
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_dml_dc").on(table.deviceCode),
  index("idx_dml_mt").on(table.maintenanceType)
]);

export type DeviceMaintenanceLogs = typeof deviceMaintenanceLogs.$inferSelect;
export type InsertDeviceMaintenanceLogs = typeof deviceMaintenanceLogs.$inferInsert;
export const deviceStatusLog = mysqlTable("device_status_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  previousStatus: varchar("previous_status", { length: 64 }),  // 原状态
  currentStatus: varchar("current_status", { length: 64 }).notNull(),  // 新状态
  reason: varchar("reason", { length: 128 }),  // 变更原因
  triggeredBy: varchar("triggered_by", { length: 64 }),  // 触发方式(auto/manual/alert)
  metadata: json("metadata"),  // 附加元数据
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_dsl_dc").on(table.deviceCode)
]);

export type DeviceStatusLog = typeof deviceStatusLog.$inferSelect;
export type InsertDeviceStatusLog = typeof deviceStatusLog.$inferInsert;
export const anomalyModels = mysqlTable("anomaly_models", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  modelCode: varchar("model_code", { length: 64 }).notNull(),  // 模型编码
  modelName: varchar("model_name", { length: 200 }).notNull(),  // 模型名称
  modelType: varchar("model_type", { length: 64 }).notNull(),  // 模型类型(isolation_forest/lstm/autoencoder)
  targetMetric: varchar("target_metric", { length: 128 }).notNull(),  // 目标指标
  hyperparams: json("hyperparams"),  // 超参数JSON
  trainingDataRange: json("training_data_range"),  // 训练数据范围
  accuracy: double("accuracy"),  // 准确率
  modelFileUrl: varchar("model_file_url", { length: 500 }),  // 模型文件URL
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态(draft/training/deployed/archived)
  deployedAt: timestamp("deployed_at", { fsp: 3 }),  // 部署时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
}, (table) => [
  index("idx_am_mc").on(table.modelCode),
  index("idx_am_mt").on(table.modelType),
  index("idx_am_s").on(table.status)
]);

export type AnomalyModels = typeof anomalyModels.$inferSelect;
export type InsertAnomalyModels = typeof anomalyModels.$inferInsert;
export const diagnosisResults = mysqlTable("diagnosis_results", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  taskId: bigint("task_id", { mode: "number" }).notNull(),  // 诊断任务ID
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  diagnosisType: varchar("diagnosis_type", { length: 64 }).notNull(),  // 诊断类型
  severity: varchar("severity", { length: 128 }).notNull(),  // 严重程度
  faultCode: varchar("fault_code", { length: 64 }),  // 故障代码
  faultDescription: text("fault_description"),  // 故障描述
  confidence: double("confidence"),  // 置信度
  evidence: json("evidence"),  // 证据数据JSON
  recommendation: text("recommendation"),  // 处理建议
  resolved: tinyint("resolved").notNull().default(0),  // 是否已处理
  resolvedAt: timestamp("resolved_at", { fsp: 3 }),  // 处理时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_dr_ti").on(table.taskId),
  index("idx_dr_dc").on(table.deviceCode),
  index("idx_dr_dt").on(table.diagnosisType)
]);

export type DiagnosisResults = typeof diagnosisResults.$inferSelect;
export type InsertDiagnosisResults = typeof diagnosisResults.$inferInsert;
export const dataCleanResults = mysqlTable("data_clean_results", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  taskId: bigint("task_id", { mode: "number" }).notNull(),  // 清洗任务ID
  sourceTable: varchar("source_table", { length: 128 }).notNull(),  // 源表名
  sourceRowId: bigint("source_row_id", { mode: "number" }).notNull(),  // 源行ID
  fieldName: varchar("field_name", { length: 200 }).notNull(),  // 字段名
  originalValue: text("original_value"),  // 原始值
  cleanedValue: text("cleaned_value"),  // 清洗后值
  ruleApplied: varchar("rule_applied", { length: 128 }),  // 应用规则
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_dcr_ti").on(table.taskId),
  index("idx_dcr_sri").on(table.sourceRowId),
  index("idx_dcr_s").on(table.status)
]);

export type DataCleanResults = typeof dataCleanResults.$inferSelect;
export type InsertDataCleanResults = typeof dataCleanResults.$inferInsert;
export const edgeGatewayConfig = mysqlTable("edge_gateway_config", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  gatewayCode: varchar("gateway_code", { length: 64 }).notNull(),  // 网关编码
  gatewayName: varchar("gateway_name", { length: 200 }).notNull(),  // 网关名称
  gatewayType: varchar("gateway_type", { length: 64 }).notNull(),  // 网关类型
  ipAddress: varchar("ip_address", { length: 128 }),  // IP地址
  port: int("port"),  // 端口
  firmwareVersion: varchar("firmware_version", { length: 64 }),  // 固件版本
  protocols: json("protocols"),  // 支持协议列表
  maxDevices: int("max_devices").notNull(),  // 最大设备数
  heartbeatInterval: int("heartbeat_interval").notNull(),  // 心跳间隔(秒)
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态(online/offline/error)
  lastHeartbeat: timestamp("last_heartbeat", { fsp: 3 }),  // 最后心跳时间
  location: varchar("location", { length: 128 }),  // 安装位置
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
}, (table) => [
  index("idx_egc_gc").on(table.gatewayCode),
  index("idx_egc_gt").on(table.gatewayType),
  index("idx_egc_s").on(table.status)
]);

export type EdgeGatewayConfig = typeof edgeGatewayConfig.$inferSelect;
export type InsertEdgeGatewayConfig = typeof edgeGatewayConfig.$inferInsert;
export const kbChunks = mysqlTable("kb_chunks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  documentId: bigint("document_id", { mode: "number" }).notNull(),  // 所属文档ID
  chunkIndex: int("chunk_index").notNull(),  // 切片序号
  content: text("content").notNull(),  // 切片内容
  tokenCount: int("token_count"),  // Token数
  metadata: json("metadata"),  // 元数据
  embeddingId: bigint("embedding_id", { mode: "number" }),  // 关联向量ID
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_kc_di").on(table.documentId),
  index("idx_kc_ei").on(table.embeddingId)
]);

export type KbChunks = typeof kbChunks.$inferSelect;
export type InsertKbChunks = typeof kbChunks.$inferInsert;
export const kbConversationMessages = mysqlTable("kb_conversation_messages", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  conversationId: bigint("conversation_id", { mode: "number" }).notNull(),  // 对话ID
  role: varchar("role", { length: 128 }).notNull(),  // 角色(user/assistant/system)
  content: text("content").notNull(),  // 消息内容
  tokenCount: int("token_count"),  // Token数
  sources: json("sources"),  // 引用来源
  feedback: tinyint("feedback"),  // 用户反馈(1好/-1差)
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_kcm_ci").on(table.conversationId)
]);

export type KbConversationMessages = typeof kbConversationMessages.$inferSelect;
export type InsertKbConversationMessages = typeof kbConversationMessages.$inferInsert;
export const kbConversations = mysqlTable("kb_conversations", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  collectionId: bigint("collection_id", { mode: "number" }).notNull(),  // 知识库集合ID
  title: varchar("title", { length: 200 }),  // 对话标题
  userId: varchar("user_id", { length: 128 }).notNull(),  // 用户ID
  messageCount: int("message_count").notNull(),  // 消息数
  modelName: varchar("model_name", { length: 200 }),  // 使用模型
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
}, (table) => [
  index("idx_kconv_ci").on(table.collectionId),
  index("idx_kconv_ui").on(table.userId)
]);

export type KbConversations = typeof kbConversations.$inferSelect;
export type InsertKbConversations = typeof kbConversations.$inferInsert;
export const kbEmbeddings = mysqlTable("kb_embeddings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  chunkId: bigint("chunk_id", { mode: "number" }).notNull(),  // 关联切片ID
  modelName: varchar("model_name", { length: 200 }).notNull(),  // 嵌入模型
  dimensions: int("dimensions").notNull(),  // 向量维度
  vectorData: varchar("vector_data", { length: 128 }).notNull(),  // 向量数据
  norm: double("norm"),  // 向量范数
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_ke_ci").on(table.chunkId)
]);

export type KbEmbeddings = typeof kbEmbeddings.$inferSelect;
export type InsertKbEmbeddings = typeof kbEmbeddings.$inferInsert;
export const kbQaPairs = mysqlTable("kb_qa_pairs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  collectionId: bigint("collection_id", { mode: "number" }).notNull(),  // 知识库集合ID
  question: text("question").notNull(),  // 问题
  answer: text("answer").notNull(),  // 答案
  sourceDocumentId: bigint("source_document_id", { mode: "number" }),  // 来源文档ID
  confidence: double("confidence"),  // 置信度
  tags: json("tags"),  // 标签
  isVerified: tinyint("is_verified").notNull(),  // 是否已验证
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
}, (table) => [
  index("idx_kqp_ci").on(table.collectionId),
  index("idx_kqp_sdi").on(table.sourceDocumentId)
]);

export type KbQaPairs = typeof kbQaPairs.$inferSelect;
export type InsertKbQaPairs = typeof kbQaPairs.$inferInsert;
export const modelDeployments = mysqlTable("model_deployments", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  modelId: bigint("model_id", { mode: "number" }).notNull(),  // 模型ID
  deploymentName: varchar("deployment_name", { length: 200 }).notNull(),  // 部署名称
  environment: varchar("environment", { length: 128 }).notNull(),  // 环境(dev/staging/production)
  endpointUrl: varchar("endpoint_url", { length: 500 }),  // 端点URL
  replicas: int("replicas").notNull(),  // 副本数
  gpuType: varchar("gpu_type", { length: 64 }),  // GPU类型
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态
  deployedAt: timestamp("deployed_at", { fsp: 3 }),  // 部署时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_md_mi").on(table.modelId),
  index("idx_md_gt").on(table.gpuType),
  index("idx_md_s").on(table.status)
]);

export type ModelDeployments = typeof modelDeployments.$inferSelect;
export type InsertModelDeployments = typeof modelDeployments.$inferInsert;
export const modelInferenceLogs = mysqlTable("model_inference_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deploymentId: bigint("deployment_id", { mode: "number" }).notNull(),  // 部署ID
  requestId: varchar("request_id", { length: 128 }).notNull(),  // 请求ID
  inputTokens: int("input_tokens"),  // 输入Token数
  outputTokens: int("output_tokens"),  // 输出Token数
  latencyMs: int("latency_ms"),  // 延迟(ms)
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态
  errorMessage: text("error_message"),  // 错误信息
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_mil_di").on(table.deploymentId),
  index("idx_mil_ri").on(table.requestId),
  index("idx_mil_s").on(table.status)
]);

export type ModelInferenceLogs = typeof modelInferenceLogs.$inferSelect;
export type InsertModelInferenceLogs = typeof modelInferenceLogs.$inferInsert;
export const modelRegistry = mysqlTable("model_registry", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  modelCode: varchar("model_code", { length: 64 }).notNull(),  // 模型编码
  modelName: varchar("model_name", { length: 200 }).notNull(),  // 模型名称
  modelType: varchar("model_type", { length: 64 }).notNull(),  // 模型类型(llm/embedding/classification/regression)
  framework: varchar("framework", { length: 128 }),  // 框架(pytorch/tensorflow/onnx)
  version: varchar("version", { length: 64 }).notNull(),  // 版本号
  description: text("description"),  // 描述
  modelFileUrl: varchar("model_file_url", { length: 500 }),  // 模型文件URL
  metrics: json("metrics"),  // 评估指标JSON
  tags: json("tags"),  // 标签
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态
  createdBy: varchar("created_by", { length: 64 }),  // 创建人
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
}, (table) => [
  index("idx_mr_mc").on(table.modelCode),
  index("idx_mr_mt").on(table.modelType),
  index("idx_mr_s").on(table.status)
]);

export type ModelRegistry = typeof modelRegistry.$inferSelect;
export type InsertModelRegistry = typeof modelRegistry.$inferInsert;
export const modelTrainingJobs = mysqlTable("model_training_jobs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  modelId: bigint("model_id", { mode: "number" }).notNull(),  // 模型ID
  jobName: varchar("job_name", { length: 200 }).notNull(),  // 任务名称
  trainingData: json("training_data"),  // 训练数据配置
  hyperparams: json("hyperparams"),  // 超参数
  gpuType: varchar("gpu_type", { length: 64 }),  // GPU类型
  epochs: int("epochs"),  // 训练轮次
  currentEpoch: int("current_epoch"),  // 当前轮次
  loss: double("loss"),  // 损失值
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态
  startedAt: timestamp("started_at", { fsp: 3 }),  // 开始时间
  completedAt: timestamp("completed_at", { fsp: 3 }),  // 完成时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_mtj_mi").on(table.modelId),
  index("idx_mtj_gt").on(table.gpuType),
  index("idx_mtj_s").on(table.status)
]);

export type ModelTrainingJobs = typeof modelTrainingJobs.$inferSelect;
export type InsertModelTrainingJobs = typeof modelTrainingJobs.$inferInsert;
export const minioFileMetadata = mysqlTable("minio_file_metadata", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  bucket: varchar("bucket", { length: 128 }).notNull(),  // 存储桶
  objectKey: varchar("object_key", { length: 128 }).notNull(),  // 对象键
  originalName: varchar("original_name", { length: 200 }).notNull(),  // 原始文件名
  contentType: varchar("content_type", { length: 64 }).notNull(),  // 内容类型
  fileSize: bigint("file_size", { mode: "number" }).notNull(),  // 文件大小
  etag: varchar("etag", { length: 128 }),  // ETag
  tags: json("tags"),  // 标签
  uploadedBy: varchar("uploaded_by", { length: 64 }),  // 上传者
  expiresAt: timestamp("expires_at", { fsp: 3 }),  // 过期时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_mfm_ct").on(table.contentType)
]);

export type MinioFileMetadata = typeof minioFileMetadata.$inferSelect;
export type InsertMinioFileMetadata = typeof minioFileMetadata.$inferInsert;
export const minioUploadLogs = mysqlTable("minio_upload_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  bucket: varchar("bucket", { length: 128 }).notNull(),  // 存储桶
  objectKey: varchar("object_key", { length: 128 }).notNull(),  // 对象键
  fileSize: bigint("file_size", { mode: "number" }).notNull(),  // 文件大小
  uploadDurationMs: int("upload_duration_ms"),  // 上传耗时(ms)
  status: varchar("status", { length: 64 }).notNull().default('active'),  // 状态
  errorMessage: text("error_message"),  // 错误信息
  uploadedBy: varchar("uploaded_by", { length: 64 }),  // 上传者
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_mul_s").on(table.status)
]);

export type MinioUploadLogs = typeof minioUploadLogs.$inferSelect;
export type InsertMinioUploadLogs = typeof minioUploadLogs.$inferInsert;
export const realtimeDataLatest = mysqlTable("realtime_data_latest", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  mpCode: varchar("mp_code", { length: 64 }).notNull(),  // 测点编码
  value: double("value"),  // 数值
  stringValue: varchar("string_value", { length: 128 }),  // 字符串值
  quality: int("quality").notNull().default(0),  // 质量码
  sourceTimestamp: timestamp("source_timestamp", { fsp: 3 }).notNull(),  // 源时间戳
  serverTimestamp: timestamp("server_timestamp", { fsp: 3 }).notNull(),  // 服务器时间戳
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),  // 更新时间
}, (table) => [
  index("idx_rdl_dc").on(table.deviceCode),
  index("idx_rdl_mc").on(table.mpCode)
]);

export type RealtimeDataLatest = typeof realtimeDataLatest.$inferSelect;
export type InsertRealtimeDataLatest = typeof realtimeDataLatest.$inferInsert;
export const vibration1hourAgg = mysqlTable("vibration_1hour_agg", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  deviceCode: varchar("device_code", { length: 64 }).notNull(),  // 设备编码
  mpCode: varchar("mp_code", { length: 64 }).notNull(),  // 测点编码
  hourStart: timestamp("hour_start", { fsp: 3 }).notNull(),  // 小时开始时间
  rmsAvg: double("rms_avg"),  // RMS均值
  rmsMax: double("rms_max"),  // RMS最大值
  peakAvg: double("peak_avg"),  // 峰值均值
  peakMax: double("peak_max"),  // 峰值最大值
  kurtosisAvg: double("kurtosis_avg"),  // 峭度均值
  sampleCount: int("sample_count").notNull().default(0),  // 样本数
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_v1a_dc").on(table.deviceCode),
  index("idx_v1a_mc").on(table.mpCode)
]);

export type Vibration1hourAgg = typeof vibration1hourAgg.$inferSelect;
export type InsertVibration1hourAgg = typeof vibration1hourAgg.$inferInsert;
export const topoAlerts = mysqlTable("topo_alerts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  nodeId: varchar("node_id", { length: 128 }).notNull(),  // 节点ID
  alertType: varchar("alert_type", { length: 64 }).notNull(),  // 告警类型
  severity: varchar("severity", { length: 128 }).notNull(),  // 严重级别
  message: text("message").notNull(),  // 告警消息
  resolved: tinyint("resolved").notNull().default(0),  // 是否已解决
  resolvedAt: timestamp("resolved_at", { fsp: 3 }),  // 解决时间
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_ta_ni").on(table.nodeId),
  index("idx_ta_at").on(table.alertType)
]);

export type TopoAlerts = typeof topoAlerts.$inferSelect;
export type InsertTopoAlerts = typeof topoAlerts.$inferInsert;
export const topoLayers = mysqlTable("topo_layers", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  layerCode: varchar("layer_code", { length: 64 }).notNull(),  // 层级编码
  layerName: varchar("layer_name", { length: 200 }).notNull(),  // 层级名称
  layerOrder: int("layer_order").notNull(),  // 排序
  color: varchar("color", { length: 32 }),  // 显示颜色
  description: text("description"),  // 描述
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
}, (table) => [
  index("idx_tl_lc").on(table.layerCode)
]);

export type TopoLayers = typeof topoLayers.$inferSelect;
export type InsertTopoLayers = typeof topoLayers.$inferInsert;
export const topoSnapshots = mysqlTable("topo_snapshots", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),  // 主键
  snapshotName: varchar("snapshot_name", { length: 200 }).notNull(),  // 快照名称
  snapshotData: json("snapshot_data").notNull(),  // 快照数据JSON
  nodeCount: int("node_count").notNull(),  // 节点数
  edgeCount: int("edge_count").notNull(),  // 边数
  createdBy: varchar("created_by", { length: 64 }),  // 创建人
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),  // 创建时间
});

export type TopoSnapshots = typeof topoSnapshots.$inferSelect;
export type InsertTopoSnapshots = typeof topoSnapshots.$inferInsert;

// ===== 事件溯源/Saga 基础设施表（旧服务兼容） =====
export const outboxEvents = mysqlTable("outbox_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("event_id", { length: 64 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 64 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  metadata: json("metadata").$type<{
    correlationId?: string;
    causationId?: string;
    userId?: string;
    source?: string;
  }>(),
  status: mysqlEnum("status", ["pending", "processing", "published", "failed"]).default("pending").notNull(),
  retryCount: int("retry_count").default(0).notNull(),
  maxRetries: int("max_retries").default(3).notNull(),
  lastError: text("last_error"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const outboxRoutingConfig = mysqlTable("outbox_routing_config", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull().unique(),
  publishMode: mysqlEnum("publish_mode", ["cdc", "polling"]).default("cdc").notNull(),
  cdcEnabled: boolean("cdc_enabled").default(true).notNull(),
  pollingIntervalMs: int("polling_interval_ms"),
  pollingBatchSize: int("polling_batch_size"),
  requiresProcessing: boolean("requires_processing").default(false).notNull(),
  processorClass: varchar("processor_class", { length: 200 }),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type OutboxRoutingConfig = typeof outboxRoutingConfig.$inferSelect;
export type InsertOutboxRoutingConfig = typeof outboxRoutingConfig.$inferInsert;
export const sagaInstances = mysqlTable("saga_instances", {
  id: int("id").autoincrement().primaryKey(),
  sagaId: varchar("saga_id", { length: 64 }).notNull().unique(),
  sagaType: varchar("saga_type", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed", "compensating", "compensated", "partial"]).default("running").notNull(),
  currentStep: int("current_step").default(0).notNull(),
  totalSteps: int("total_steps").notNull(),
  input: json("input").$type<Record<string, unknown>>(),
  output: json("output").$type<Record<string, unknown>>(),
  checkpoint: json("checkpoint").$type<{
    processed: string[];
    failed: Array<{ item: string; error: string }>;
    lastCompletedStep: number;
  }>(),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  timeoutAt: timestamp("timeout_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const sagaSteps = mysqlTable("saga_steps", {
  id: int("id").autoincrement().primaryKey(),
  stepId: varchar("step_id", { length: 64 }).notNull().unique(),
  sagaId: varchar("saga_id", { length: 64 }).notNull(),
  stepIndex: int("step_index").notNull(),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  stepType: mysqlEnum("step_type", ["action", "compensation"]).default("action").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped", "compensated"]).default("pending").notNull(),
  input: json("input").$type<Record<string, unknown>>(),
  output: json("output").$type<Record<string, unknown>>(),
  error: text("error"),
  retryCount: int("retry_count").default(0).notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const sagaDeadLetters = mysqlTable("saga_dead_letters", {
  id: int("id").autoincrement().primaryKey(),
  deadLetterId: varchar("dead_letter_id", { length: 64 }).notNull().unique(),
  sagaId: varchar("saga_id", { length: 64 }).notNull(),
  sagaType: varchar("saga_type", { length: 100 }).notNull(),
  failureReason: text("failure_reason").notNull(),
  failureType: mysqlEnum("failure_type", ["timeout", "max_retries", "compensation_failed", "unknown"]).notNull(),
  originalInput: json("original_input").$type<Record<string, unknown>>(),
  lastCheckpoint: json("last_checkpoint").$type<Record<string, unknown>>(),
  retryable: boolean("retryable").default(true).notNull(),
  retryCount: int("retry_count").default(0).notNull(),
  lastRetryAt: timestamp("last_retry_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 100 }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const processedEvents = mysqlTable("processed_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("event_id", { length: 64 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  consumerGroup: varchar("consumer_group", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  metadata: json("metadata").$type<{
    partition?: number;
    offset?: string;
    processingTimeMs?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rollbackExecutions = mysqlTable("rollback_executions", {
  id: int("id").autoincrement().primaryKey(),
  executionId: varchar("execution_id", { length: 64 }).notNull().unique(),
  sagaId: varchar("saga_id", { length: 64 }),
  triggerId: varchar("trigger_id", { length: 64 }).notNull(),
  targetType: mysqlEnum("target_type", ["rule", "model", "config", "firmware"]).notNull(),
  targetId: varchar("target_id", { length: 64 }).notNull(),
  fromVersion: varchar("from_version", { length: 50 }).notNull(),
  toVersion: varchar("to_version", { length: 50 }).notNull(),
  triggerReason: text("trigger_reason"),
  status: mysqlEnum("status", ["pending", "executing", "completed", "failed", "partial", "cancelled"]).default("pending").notNull(),
  totalDevices: int("total_devices"),
  completedDevices: int("completed_devices").default(0),
  failedDevices: int("failed_devices").default(0),
  checkpoint: json("checkpoint").$type<{
    processed: string[];
    failed: Array<{ device: string; error: string }>;
  }>(),
  result: json("result").$type<{
    total: number;
    succeeded: number;
    failed: number;
    details?: Array<{ nodeId: string; status: string; error?: string }>;
  }>(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const eventStore = mysqlTable("event_store", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  eventId: varchar("event_id", { length: 64 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventVersion: smallint("event_version").default(1).notNull(),
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 100 }).notNull(),
  aggregateVersion: bigint("aggregate_version", { mode: "number" }).notNull(),
  payload: json("payload").notNull(),
  metadata: json("metadata"),
  causationId: varchar("causation_id", { length: 64 }),
  correlationId: varchar("correlation_id", { length: 64 }),
  occurredAt: datetime("occurred_at", { fsp: 3 }).notNull(),
  recordedAt: timestamp("recorded_at").notNull(),
  actorId: varchar("actor_id", { length: 64 }),
  actorType: varchar("actor_type", { length: 20 }),
});

export type EventStoreEntry = typeof eventStore.$inferSelect;
export type InsertEventStoreEntry = typeof eventStore.$inferInsert;
export const eventSnapshots = mysqlTable("event_snapshots", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 100 }).notNull(),
  aggregateVersion: bigint("aggregate_version", { mode: "number" }).notNull(),
  state: json("state").notNull(),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
});


// ============================================================
// §20 Pipeline 工作台
// ============================================================

export const pipelines = mysqlTable("pipelines", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  pipelineId: varchar("pipeline_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 32 }).notNull().default("custom"),
  dagConfig: json("dag_config"),
  status: mysqlEnum("status", ["draft", "active", "paused", "error", "running", "archived"]).notNull().default("draft"),
  nodeCount: int("node_count").default(0),
  connectionCount: int("connection_count").default(0),
  totalRuns: int("total_runs").default(0),
  successRuns: int("success_runs").default(0),
  failedRuns: int("failed_runs").default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull(),
});
export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = typeof pipelines.$inferInsert;

export const pipelineRuns = mysqlTable("pipeline_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull().unique(),
  pipelineId: varchar("pipeline_id", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).notNull().default("pending"),
  triggerType: mysqlEnum("trigger_type", ["manual", "schedule", "api", "event"]).notNull().default("manual"),
  startedAt: datetime("started_at", { fsp: 3 }),
  finishedAt: datetime("finished_at", { fsp: 3 }),
  durationMs: int("duration_ms"),
  totalRecordsIn: int("total_records_in").default(0),
  totalRecordsOut: int("total_records_out").default(0),
  errorCount: int("error_count").default(0),
  nodeResults: json("node_results"),
  lineageData: json("lineage_data"),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
});
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRun = typeof pipelineRuns.$inferInsert;

export const pipelineNodeMetrics = mysqlTable("pipeline_node_metrics", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  pipelineId: varchar("pipeline_id", { length: 64 }).notNull(),
  nodeId: varchar("node_id", { length: 64 }).notNull(),
  nodeName: varchar("node_name", { length: 128 }),
  nodeType: varchar("node_type", { length: 32 }),
  nodeSubType: varchar("node_sub_type", { length: 64 }),
  status: varchar("status", { length: 16 }),
  recordsIn: int("records_in").default(0),
  recordsOut: int("records_out").default(0),
  durationMs: int("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
});
export type PipelineNodeMetric = typeof pipelineNodeMetrics.$inferSelect;
export type InsertPipelineNodeMetric = typeof pipelineNodeMetrics.$inferInsert;

// ============================================================
// §21 知识图谱编排器
// ============================================================

/** 图谱定义 — 一个完整的诊断知识图谱 */
export const kgGraphs = mysqlTable("kg_graphs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  graphId: varchar("graph_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  /** 场景类型：vibration_diagnosis | degradation_prediction | fault_propagation | multimodal_fusion | fleet_learning | custom */
  scenario: varchar("scenario", { length: 64 }).notNull().default("custom"),
  /** 来源模板ID（如果从模板创建） */
  templateId: varchar("template_id", { length: 64 }),
  /** 版本号 */
  version: int("version").default(1).notNull(),
  /** 图谱状态 */
  status: mysqlEnum("status", ["draft", "active", "archived", "evolving"]).default("draft").notNull(),
  /** 画布视口配置（缩放、偏移等） */
  viewportConfig: json("viewport_config").$type<{ zoom: number; panX: number; panY: number }>(),
  /** 统计 */
  nodeCount: int("node_count").default(0),
  edgeCount: int("edge_count").default(0),
  /** 自进化统计 */
  totalDiagnosisRuns: int("total_diagnosis_runs").default(0),
  avgAccuracy: double("avg_accuracy"),
  lastEvolvedAt: timestamp("last_evolved_at"),
  /** 元数据标签 */
  tags: json("tags").$type<string[]>(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type KgGraph = typeof kgGraphs.$inferSelect;
export type InsertKgGraph = typeof kgGraphs.$inferInsert;

/** 图谱节点实例 — 画布上的每个实体 */
export const kgGraphNodes = mysqlTable("kg_graph_nodes", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  graphId: varchar("graph_id", { length: 64 }).notNull(),
  nodeId: varchar("node_id", { length: 64 }).notNull(),
  /** 节点大类：equipment | fault | diagnosis | solution | data | mechanism */
  category: varchar("category", { length: 32 }).notNull(),
  /** 节点子类型：device | component | sensor | fault_mode | symptom | diagnosis_rule | repair | ... */
  subType: varchar("sub_type", { length: 64 }).notNull(),
  /** 显示名称 */
  label: varchar("label", { length: 200 }).notNull(),
  /** 画布坐标 */
  x: double("x").default(0).notNull(),
  y: double("y").default(0).notNull(),
  /** 节点配置参数（根据subType不同而不同） */
  config: json("config").$type<Record<string, unknown>>(),
  /** 节点状态：normal | pending_confirm | deprecated */
  nodeStatus: mysqlEnum("node_status", ["normal", "pending_confirm", "deprecated"]).default("normal").notNull(),
  /** 自进化：该节点参与诊断的次数 */
  hitCount: int("hit_count").default(0),
  /** 自进化：该节点的准确率 */
  accuracy: double("accuracy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_kgn_graph").on(table.graphId),
  index("idx_kgn_category").on(table.category),
]);
export type KgGraphNode = typeof kgGraphNodes.$inferSelect;
export type InsertKgGraphNode = typeof kgGraphNodes.$inferInsert;

/** 图谱关系实例 — 画布上的每条语义边 */
export const kgGraphEdges = mysqlTable("kg_graph_edges", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  graphId: varchar("graph_id", { length: 64 }).notNull(),
  edgeId: varchar("edge_id", { length: 64 }).notNull(),
  sourceNodeId: varchar("source_node_id", { length: 64 }).notNull(),
  targetNodeId: varchar("target_node_id", { length: 64 }).notNull(),
  /** 关系类型：HAS_PART | CAUSES | MANIFESTS | DIAGNOSED_BY | RESOLVED_BY | AFFECTS | SIMILAR_TO | DEGRADES_TO | TRIGGERS | FEEDS | REFERENCES | HAS_SENSOR */
  relationType: varchar("relation_type", { length: 32 }).notNull(),
  /** 显示标签 */
  label: varchar("label", { length: 200 }),
  /** 关系权重/置信度 (0~1) */
  weight: double("weight").default(1).notNull(),
  /** 关系配置 */
  config: json("config").$type<Record<string, unknown>>(),
  /** 自进化：该路径的诊断准确率 */
  pathAccuracy: double("path_accuracy"),
  /** 自进化：该路径被使用的次数 */
  hitCount: int("hit_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_kge_graph").on(table.graphId),
  index("idx_kge_source").on(table.sourceNodeId),
  index("idx_kge_target").on(table.targetNodeId),
]);
export type KgGraphEdge = typeof kgGraphEdges.$inferSelect;
export type InsertKgGraphEdge = typeof kgGraphEdges.$inferInsert;

/** 诊断运行记录 */
export const kgDiagnosisRuns = mysqlTable("kg_diagnosis_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull().unique(),
  graphId: varchar("graph_id", { length: 64 }).notNull(),
  /** 触发方式 */
  triggerType: mysqlEnum("trigger_type", ["manual", "auto", "api", "edge"]).default("manual").notNull(),
  /** 输入数据（传感器读数、设备ID等） */
  inputData: json("input_data").$type<Record<string, unknown>>(),
  /** 诊断状态 */
  status: mysqlEnum("status", ["running", "completed", "failed", "timeout"]).default("running").notNull(),
  /** 诊断结果 */
  result: json("result").$type<{
    conclusion: string;
    confidence: number;
    faultCodes: string[];
    severity: string;
    recommendedActions: string[];
  }>(),
  /** 推理路径（经过的节点和边） */
  inferencePathIds: json("inference_path_ids").$type<string[]>(),
  /** 推理深度（跳数） */
  inferenceDepth: int("inference_depth"),
  /** 耗时 */
  durationMs: int("duration_ms"),
  /** 人工反馈：correct | incorrect | partial | pending */
  feedback: mysqlEnum("feedback", ["correct", "incorrect", "partial", "pending"]).default("pending").notNull(),
  /** 反馈备注 */
  feedbackNote: text("feedback_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_kgdr_graph").on(table.graphId),
  index("idx_kgdr_status").on(table.status),
]);
export type KgDiagnosisRun = typeof kgDiagnosisRuns.$inferSelect;
export type InsertKgDiagnosisRun = typeof kgDiagnosisRuns.$inferInsert;

/** 诊断推理路径详情 */
export const kgDiagnosisPaths = mysqlTable("kg_diagnosis_paths", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  graphId: varchar("graph_id", { length: 64 }).notNull(),
  /** 路径序号（同一次诊断可能有多条候选路径） */
  pathIndex: int("path_index").notNull(),
  /** 路径经过的节点ID序列 */
  nodeSequence: json("node_sequence").$type<string[]>().notNull(),
  /** 路径经过的边ID序列 */
  edgeSequence: json("edge_sequence").$type<string[]>().notNull(),
  /** 该路径的置信度 */
  confidence: double("confidence").notNull(),
  /** 该路径的诊断结论 */
  conclusion: varchar("conclusion", { length: 500 }),
  /** 是否为最终选择的路径 */
  isSelected: boolean("is_selected").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_kgdp_run").on(table.runId),
]);
export type KgDiagnosisPath = typeof kgDiagnosisPaths.$inferSelect;
export type InsertKgDiagnosisPath = typeof kgDiagnosisPaths.$inferInsert;

/** 自进化日志 */
export const kgEvolutionLog = mysqlTable("kg_evolution_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  graphId: varchar("graph_id", { length: 64 }).notNull(),
  /** 进化类型：accuracy_update | new_pattern | fleet_merge | weight_adjust | node_deprecate */
  evolutionType: varchar("evolution_type", { length: 32 }).notNull(),
  /** 进化描述 */
  description: text("description"),
  /** 变更详情 */
  changes: json("changes").$type<{
    addedNodes?: Array<{ nodeId: string; label: string; reason: string }>;
    addedEdges?: Array<{ edgeId: string; label: string; reason: string }>;
    updatedWeights?: Array<{ edgeId: string; oldWeight: number; newWeight: number }>;
    deprecatedNodes?: Array<{ nodeId: string; reason: string }>;
    accuracyDelta?: number;
  }>(),
  /** 触发来源 */
  triggeredBy: mysqlEnum("triggered_by", ["system", "diagnosis_feedback", "fleet_sync", "manual"]).default("system").notNull(),
  /** 来源设备数（Fleet学习） */
  sourceDeviceCount: int("source_device_count"),
  /** 进化前后的准确率变化 */
  accuracyBefore: double("accuracy_before"),
  accuracyAfter: double("accuracy_after"),
  /** 状态：applied | pending_review | rejected */
  status: mysqlEnum("status", ["applied", "pending_review", "rejected"]).default("pending_review").notNull(),
  reviewedBy: varchar("reviewed_by", { length: 64 }),
  reviewedAt: datetime("reviewed_at", { fsp: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_kgel_graph").on(table.graphId),
  index("idx_kgel_type").on(table.evolutionType),
]);
export type KgEvolutionLog = typeof kgEvolutionLog.$inferSelect;
export type InsertKgEvolutionLog = typeof kgEvolutionLog.$inferInsert;

// ============ §14 接入层 - 统一数据采集模型 ============

/**
 * 数据连接器（Connector）
 * 一个外部系统的接入配置，如 MQTT Broker、MySQL 实例、Kafka 集群等
 */
export const dataConnectors = mysqlTable("data_connectors", {
  id: int("id").autoincrement().primaryKey(),
  connectorId: varchar("connector_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  protocolType: varchar("protocol_type", { length: 32 }).notNull(),
  connectionParams: json("connection_params").notNull(),
  authConfig: json("auth_config"),
  healthCheckConfig: json("health_check_config"),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  lastHealthCheck: timestamp("last_health_check", { fsp: 3 }),
  lastError: text("last_error"),
  sourceRef: varchar("source_ref", { length: 128 }),
  tags: json("tags"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_dc_protocol").on(table.protocolType),
  index("idx_dc_status").on(table.status),
  index("idx_dc_source_ref").on(table.sourceRef),
]);
export type DataConnector = typeof dataConnectors.$inferSelect;
export type InsertDataConnector = typeof dataConnectors.$inferInsert;

/**
 * 数据端点（Endpoint）
 * 连接器下的具体资源，如 MQTT Topic、数据库表、Kafka Topic、MinIO Bucket 等
 */
export const dataEndpoints = mysqlTable("data_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: varchar("endpoint_id", { length: 64 }).notNull().unique(),
  connectorId: varchar("connector_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  resourcePath: varchar("resource_path", { length: 500 }).notNull(),
  resourceType: varchar("resource_type", { length: 32 }).notNull(),
  dataFormat: varchar("data_format", { length: 32 }).default("json"),
  schemaInfo: json("schema_info"),
  samplingConfig: json("sampling_config"),
  preprocessConfig: json("preprocess_config"),
  protocolConfigId: varchar("protocol_config_id", { length: 64 }),
  sensorId: varchar("sensor_id", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  discoveredAt: timestamp("discovered_at", { fsp: 3 }),
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_de_connector").on(table.connectorId),
  index("idx_de_resource_type").on(table.resourceType),
  index("idx_de_sensor").on(table.sensorId),
  index("idx_de_status").on(table.status),
]);
export type DataEndpoint = typeof dataEndpoints.$inferSelect;
export type InsertDataEndpoint = typeof dataEndpoints.$inferInsert;

/**
 * 数据绑定（Binding）
 * 端点与平台内部消费者的关联
 */
export const dataBindings = mysqlTable("data_bindings", {
  id: int("id").autoincrement().primaryKey(),
  bindingId: varchar("binding_id", { length: 64 }).notNull().unique(),
  endpointId: varchar("endpoint_id", { length: 64 }).notNull(),
  targetType: varchar("target_type", { length: 32 }).notNull(),
  targetId: varchar("target_id", { length: 128 }).notNull(),
  direction: varchar("direction", { length: 16 }).notNull().default("ingest"),
  transformConfig: json("transform_config"),
  bufferConfig: json("buffer_config"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at", { fsp: 3 }),
  syncStats: json("sync_stats"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_db_endpoint").on(table.endpointId),
  index("idx_db_target").on(table.targetType, table.targetId),
  index("idx_db_status").on(table.status),
]);
export type DataBinding = typeof dataBindings.$inferSelect;
export type InsertDataBinding = typeof dataBindings.$inferInsert;

// ============================================================================
// 算法库模块 (Algorithm Library)
// ============================================================================
// 设计原则：
//   1. 算法库是统一编排层，不重建执行引擎
//   2. impl_type + impl_ref 桥接已有模块（Pipeline Engine / 插件引擎 / 内置 / 外部）
//   3. kg_integration 打通算法库↔KG 双向闭环
//   4. fleet_learning_config 支持 A/B 测试 + 跨设备参数优化
//   5. algorithm_routing_rules 实现条件路由 + 级联触发
// ============================================================================

/**
 * 算法定义表 — 算法库的核心表
 * 管理算法的元数据，不存储算法实现（实现在 Pipeline Engine / 插件引擎中）
 */
export const algorithmDefinitions = mysqlTable("algorithm_definitions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  algoCode: varchar("algo_code", { length: 64 }).notNull().unique(),
  algoName: varchar("algo_name", { length: 200 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  subcategory: varchar("subcategory", { length: 64 }),
  description: text("description"),
  implType: mysqlEnum("impl_type", ["pipeline_node", "plugin", "builtin", "external", "kg_operator"]).notNull(),
  implRef: varchar("impl_ref", { length: 200 }),
  inputSchema: json("input_schema").$type<Record<string, unknown>>().notNull(),
  outputSchema: json("output_schema").$type<Record<string, unknown>>().notNull(),
  configSchema: json("config_schema").$type<Record<string, unknown>>().notNull(),
  applicableDeviceTypes: json("applicable_device_types").$type<string[]>(),
  applicableMeasurementTypes: json("applicable_measurement_types").$type<string[]>(),
  applicableScenarios: json("applicable_scenarios").$type<string[]>(),
  kgIntegration: json("kg_integration").$type<{
    writes_to_kg?: boolean;
    node_type?: string;
    edge_type?: string;
    kg_schema_mapping?: Record<string, string>;
    reads_from_kg?: boolean;
    kg_query?: string;
  }>(),
  version: varchar("version", { length: 32 }).notNull().default("v1.0.0"),
  benchmark: json("benchmark").$type<{
    latency_ms?: number;
    throughput_rps?: number;
    memory_mb?: number;
    accuracy?: number;
    f1_score?: number;
    test_dataset?: string;
    test_date?: string;
  }>(),
  compatibleInputVersions: json("compatible_input_versions").$type<string[]>(),
  breakingChange: tinyint("breaking_change").default(0),
  fleetLearningConfig: json("fleet_learning_config").$type<{
    enable_ab_test?: boolean;
    ab_split_ratio?: number;
    quality_metrics?: string[];
    auto_rollback_threshold?: Record<string, number>;
    fleet_aggregation?: { enabled?: boolean; update_freq?: string; min_samples?: number };
    previous_version?: string;
  }>(),
  license: mysqlEnum("license", ["builtin", "community", "enterprise"]).default("builtin"),
  author: varchar("author", { length: 128 }),
  documentationUrl: varchar("documentation_url", { length: 500 }),
  tags: json("tags").$type<string[]>(),
  status: mysqlEnum("status", ["active", "deprecated", "experimental"]).default("active"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_ad_cat").on(table.category),
  index("idx_ad_impl").on(table.implType),
  index("idx_ad_status").on(table.status),
  index("idx_ad_subcategory").on(table.subcategory),
]);
export type AlgorithmDefinition = typeof algorithmDefinitions.$inferSelect;
export type InsertAlgorithmDefinition = typeof algorithmDefinitions.$inferInsert;

/**
 * 算法组合表 — 将多个原子算法编排为场景化方案（DAG 结构）
 */
export const algorithmCompositions = mysqlTable("algorithm_compositions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  compCode: varchar("comp_code", { length: 64 }).notNull().unique(),
  compName: varchar("comp_name", { length: 200 }).notNull(),
  description: text("description"),
  steps: json("steps").$type<{
    nodes: Array<{
      id: string;
      order: number;
      algo_code: string;
      config_overrides?: Record<string, unknown>;
      kg_integration?: { writes_to_kg?: boolean; node_type?: string; properties?: string[]; creates_edge?: { from: string; to: string; type: string; condition?: string } };
      input_from_kg?: boolean;
      impl_type_override?: string;
      impl_ref_override?: string;
    }>;
    edges: Array<{ from: string; to: string; condition?: string; data_mapping?: Record<string, string> }>;
  }>().notNull(),
  applicableDeviceTypes: json("applicable_device_types").$type<string[]>(),
  applicableScenarios: json("applicable_scenarios").$type<string[]>(),
  version: varchar("version", { length: 32 }).notNull().default("v1.0.0"),
  isTemplate: tinyint("is_template").default(0),
  status: mysqlEnum("status", ["active", "deprecated", "draft"]).default("active"),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_ac_status").on(table.status),
  index("idx_ac_template").on(table.isTemplate),
]);
export type AlgorithmComposition = typeof algorithmCompositions.$inferSelect;
export type InsertAlgorithmComposition = typeof algorithmCompositions.$inferInsert;

/**
 * 算法-设备绑定表 — 记录具体设备实例与算法的绑定关系
 */
export const algorithmDeviceBindings = mysqlTable("algorithm_device_bindings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  deviceCode: varchar("device_code", { length: 64 }).notNull(),
  sensorCode: varchar("sensor_code", { length: 64 }),
  algoCode: varchar("algo_code", { length: 64 }).notNull(),
  bindingType: mysqlEnum("binding_type", ["algorithm", "composition"]).notNull(),
  configOverrides: json("config_overrides").$type<Record<string, unknown>>(),
  schedule: json("schedule").$type<{ type: "cron" | "interval" | "event" | "manual"; value?: string; timezone?: string }>(),
  outputRouting: json("output_routing").$type<Array<{ target: string; mapping: Record<string, string>; condition?: string; transform?: string }>>(),
  status: mysqlEnum("status", ["active", "paused", "error"]).default("active"),
  lastRunAt: timestamp("last_run_at", { fsp: 3 }),
  lastRunStatus: varchar("last_run_status", { length: 32 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_adb_device").on(table.deviceCode),
  index("idx_adb_algo").on(table.algoCode),
  index("idx_adb_status").on(table.status),
  uniqueIndex("idx_adb_unique").on(table.deviceCode, table.sensorCode, table.algoCode),
]);
export type AlgorithmDeviceBinding = typeof algorithmDeviceBindings.$inferSelect;
export type InsertAlgorithmDeviceBinding = typeof algorithmDeviceBindings.$inferInsert;

/**
 * 算法执行记录表 — 审计、性能分析、Fleet Learning 数据采集
 */
export const algorithmExecutions = mysqlTable("algorithm_executions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  executionId: varchar("execution_id", { length: 64 }).notNull().unique(),
  bindingId: bigint("binding_id", { mode: "number" }),
  algoCode: varchar("algo_code", { length: 64 }).notNull(),
  deviceCode: varchar("device_code", { length: 64 }),
  inputSummary: json("input_summary").$type<{ record_count?: number; fields?: string[]; sample_rate_hz?: number; data_range?: [number, number] }>(),
  configUsed: json("config_used").$type<Record<string, unknown>>(),
  outputSummary: json("output_summary").$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { fsp: 3 }),
  completedAt: timestamp("completed_at", { fsp: 3 }),
  durationMs: int("duration_ms"),
  recordsProcessed: int("records_processed"),
  memoryUsedMb: double("memory_used_mb"),
  status: mysqlEnum("status", ["running", "success", "failed", "timeout"]).notNull(),
  errorMessage: text("error_message"),
  routingStatus: json("routing_status").$type<Array<{ target: string; records_written: number; success: boolean; error?: string }>>(),
  abGroup: varchar("ab_group", { length: 16 }),
  algoVersion: varchar("algo_version", { length: 32 }),
  qualityMetrics: json("quality_metrics").$type<Record<string, number>>(),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_ae_algo").on(table.algoCode),
  index("idx_ae_device").on(table.deviceCode),
  index("idx_ae_status").on(table.status),
  index("idx_ae_time").on(table.startedAt),
  index("idx_ae_binding").on(table.bindingId),
  index("idx_ae_ab").on(table.abGroup),
]);
export type AlgorithmExecution = typeof algorithmExecutions.$inferSelect;
export type InsertAlgorithmExecution = typeof algorithmExecutions.$inferInsert;

/**
 * 算法路由规则表 — 条件路由 + 级联触发（动态路由引擎）
 */
export const algorithmRoutingRules = mysqlTable("algorithm_routing_rules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  bindingId: bigint("binding_id", { mode: "number" }).notNull(),
  ruleName: varchar("rule_name", { length: 200 }).notNull(),
  description: text("description"),
  priority: int("priority").notNull().default(100),
  condition: text("condition").notNull(),
  targets: json("targets").$type<Array<{ target: string; action: "create" | "update" | "upsert"; mapping?: Record<string, string>; params?: Record<string, unknown>; severity?: string }>>().notNull(),
  cascadeAlgos: json("cascade_algos").$type<Array<{ algo_code: string; delay_ms?: number; config_overrides?: Record<string, unknown>; condition?: string }>>(),
  stopOnMatch: tinyint("stop_on_match").default(1),
  status: mysqlEnum("status", ["active", "disabled"]).default("active"),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_arr_binding").on(table.bindingId),
  index("idx_arr_priority").on(table.priority),
  index("idx_arr_status").on(table.status),
]);
export type AlgorithmRoutingRule = typeof algorithmRoutingRules.$inferSelect;
export type InsertAlgorithmRoutingRule = typeof algorithmRoutingRules.$inferInsert;

// ============================================================================
// §31 知识结晶 (knowledge_crystals)
// ============================================================================
export const knowledgeCrystals = mysqlTable("knowledge_crystals", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  type: varchar("type", { length: 32 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  content: json("content").$type<Record<string, unknown>>().notNull(),
  version: int("version").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  applicationCount: int("application_count").notNull().default(0),
  lastAppliedAt: datetime("last_applied_at", { fsp: 3 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_kc_type").on(table.type),
  index("idx_kc_status").on(table.status),
]);
export type KnowledgeCrystal = typeof knowledgeCrystals.$inferSelect;
export type InsertKnowledgeCrystal = typeof knowledgeCrystals.$inferInsert;

// ============================================================================
// §32 Grok 推理链 (grok_reasoning_chains)
// ============================================================================
export const grokReasoningChains = mysqlTable("grok_reasoning_chains", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  sessionId: varchar("session_id", { length: 128 }).notNull(),
  stepIndex: int("step_index").notNull(),
  toolName: varchar("tool_name", { length: 128 }),
  toolInput: json("tool_input").$type<Record<string, unknown>>(),
  toolOutput: json("tool_output").$type<Record<string, unknown>>(),
  reasoning: text("reasoning"),
  durationMs: int("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_grc_session").on(table.sessionId),
  index("idx_grc_tool").on(table.toolName),
]);
export type GrokReasoningChain = typeof grokReasoningChains.$inferSelect;
export type InsertGrokReasoningChain = typeof grokReasoningChains.$inferInsert;

// ============================================================================
// §33 知识三元组 (knowledge_triples)
// ============================================================================
export const knowledgeTriples = mysqlTable("knowledge_triples", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  subject: varchar("subject", { length: 200 }).notNull(),
  predicate: varchar("predicate", { length: 128 }).notNull(),
  object: varchar("object", { length: 200 }).notNull(),
  confidence: double("confidence").notNull().default(1.0),
  source: varchar("source", { length: 64 }).notNull().default("manual"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_kt_subject").on(table.subject),
  index("idx_kt_predicate").on(table.predicate),
  index("idx_kt_object").on(table.object),
]);
export type KnowledgeTriple = typeof knowledgeTriples.$inferSelect;
export type InsertKnowledgeTriple = typeof knowledgeTriples.$inferInsert;

// ============================================================================
// §34 特征注册表 (feature_registry)
// ============================================================================
export const featureRegistry = mysqlTable("feature_registry", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  description: text("description"),
  dataType: varchar("data_type", { length: 32 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  expression: text("expression"),
  dependencies: json("dependencies").$type<string[]>(),
  statistics: json("statistics").$type<Record<string, unknown>>(),
  qualityScore: double("quality_score").notNull().default(1.0),
  version: int("version").notNull().default(1),
  tags: json("tags").$type<string[]>(),
  conditionProfiles: json("condition_profiles").$type<string[]>(),
  isActive: tinyint("is_active").notNull().default(1),
  createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  index("idx_fr_name").on(table.name),
  index("idx_fr_dt").on(table.dataType),
  index("idx_fr_active").on(table.isActive),
]);
export type FeatureRegistryEntry = typeof featureRegistry.$inferSelect;
export type InsertFeatureRegistryEntry = typeof featureRegistry.$inferInsert;

// ============================================================================
// 业务配置快照表 — 持久化 generateConfig 结果
// ============================================================================

export const businessConfigs = mysqlTable("business_configs", {
  id: int("id").autoincrement().primaryKey(),
  deviceType: varchar("device_type", { length: 64 }).notNull(),
  scenario: varchar("scenario", { length: 64 }).notNull(),
  configPayload: json("config_payload").$type<Record<string, unknown>>().notNull(),
  version: int("version").notNull().default(1),
  isActive: tinyint("is_active").notNull().default(1),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_bc_device_scenario").on(table.deviceType, table.scenario),
  index("idx_bc_active").on(table.isActive),
]);

export type BusinessConfig = typeof businessConfigs.$inferSelect;
export type InsertBusinessConfig = typeof businessConfigs.$inferInsert;

// ============================================================================
// v5.0 深度进化 — 新增 24 张表
// ============================================================================
export * from './evolution-schema';
