import { int, bigint, tinyint, smallint, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, double, date, datetime, index, uniqueIndex } from "drizzle-orm/mysql-core";

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










// ============ [DEPRECATED] 旧设备管理表已移除 ============
// devices, sensors, sensorReadings, sensorAggregates 已废弃
// 设备数据统一使用 asset_nodes 表 (见 v1.5 数据库模块)
// 传感器数据统一使用 asset_sensors 表 (见 v1.5 数据库模块)
// 遥测/聚合数据由 event_store + data_slices 替代

// [DEPRECATED] telemetryData, dataAggregations 已废弃，由 event_store + data_slices 替代

// ============ 事件总线表 (event_ 前缀) ============

/**
 * 事件日志表 - 存储系统事件
 */
export const eventLogs = mysqlTable("event_logs", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  topic: varchar("topic", { length: 100 }).notNull(),
  eventType: varchar("eventType", { length: 50 }).notNull(),
  source: varchar("source", { length: 100 }),
  nodeId: varchar("node_id", { length: 64 }), // 资产节点ID
  sensorId: varchar("sensorId", { length: 64 }),
  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).default("info").notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  processed: boolean("processed").default(false).notNull(),
  processedAt: timestamp("processedAt"),
  processedBy: varchar("processedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EventLog = typeof eventLogs.$inferSelect;
export type InsertEventLog = typeof eventLogs.$inferInsert;

/**
 * 异常检测结果表 - 存储异常检测结果
 */
export const anomalyDetections = mysqlTable("anomaly_detections", {
  id: int("id").autoincrement().primaryKey(),
  detectionId: varchar("detectionId", { length: 64 }).notNull().unique(),
  sensorId: varchar("sensorId", { length: 64 }).notNull(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  algorithmType: mysqlEnum("algorithmType", ["zscore", "iqr", "mad", "isolation_forest", "custom"]).default("zscore").notNull(),
  windowSize: int("windowSize").default(60), // 窗口大小（秒）
  threshold: int("threshold"), // 阈值 * 100
  currentValue: int("currentValue"),
  expectedValue: int("expectedValue"),
  deviation: int("deviation"), // 偏差 * 100
  score: int("score"), // 异常分数 * 100
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("low").notNull(),
  status: mysqlEnum("status", ["open", "acknowledged", "resolved", "false_positive"]).default("open").notNull(),
  acknowledgedBy: varchar("acknowledgedBy", { length: 100 }),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedAt: timestamp("resolvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnomalyDetection = typeof anomalyDetections.$inferSelect;
export type InsertAnomalyDetection = typeof anomalyDetections.$inferInsert;

/**
 * 诊断规则表 - 存储诊断规则
 */
export const diagnosisRules = mysqlTable("diagnosis_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: varchar("ruleId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  deviceType: varchar("deviceType", { length: 50 }),
  sensorType: varchar("sensorType", { length: 50 }),
  conditionExpr: text("conditionExpr").notNull(), // 条件表达式
  actionType: mysqlEnum("actionType", ["alert", "notification", "workflow", "auto_fix"]).default("alert").notNull(),
  actionConfig: json("actionConfig").$type<{
    notifyChannels?: string[];
    workflowId?: string;
    autoFixScript?: string;
    escalationTime?: number;
  }>(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  priority: int("priority").default(5),
  triggerCount: int("triggerCount").default(0),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiagnosisRule = typeof diagnosisRules.$inferSelect;
export type InsertDiagnosisRule = typeof diagnosisRules.$inferInsert;

/**
 * 诊断任务表 - 存储诊断任务
 */
export const diagnosisTasks = mysqlTable("diagnosis_tasks", {
  id: int("id").autoincrement().primaryKey(),
  taskId: varchar("taskId", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }), // 资产节点ID
  sensorId: varchar("sensorId", { length: 64 }),
  ruleId: varchar("ruleId", { length: 64 }),
  anomalyId: varchar("anomalyId", { length: 64 }),
  taskType: mysqlEnum("taskType", ["routine", "anomaly", "manual", "scheduled"]).default("routine").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
  priority: int("priority").default(5),
  inputData: json("inputData").$type<{
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
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiagnosisTask = typeof diagnosisTasks.$inferSelect;
export type InsertDiagnosisTask = typeof diagnosisTasks.$inferInsert;







// ============ 设备台账扩展表 (device_ 前缀) ============

/**
 * 设备维护记录表 - 存储设备维护历史
 */
export const deviceMaintenanceRecords = mysqlTable("device_maintenance_records", {
  id: int("id").autoincrement().primaryKey(),
  recordId: varchar("recordId", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  maintenanceType: mysqlEnum("maintenanceType", ["preventive", "corrective", "predictive", "emergency", "calibration", "inspection"]).default("preventive").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  scheduledDate: timestamp("scheduledDate"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled", "overdue"]).default("scheduled").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  assignedTo: varchar("assignedTo", { length: 100 }),
  performedBy: varchar("performedBy", { length: 100 }),
  cost: double("cost"),
  currency: varchar("currency", { length: 10 }).default("CNY"),
  parts: json("parts").$type<Array<{ partId: string; name: string; quantity: number; cost: number }>>(),
  findings: text("findings"),
  recommendations: text("recommendations"),
  attachments: json("attachments").$type<Array<{ name: string; url: string; type: string }>>(),
  nextMaintenanceDate: timestamp("nextMaintenanceDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeviceMaintenanceRecord = typeof deviceMaintenanceRecords.$inferSelect;
export type InsertDeviceMaintenanceRecord = typeof deviceMaintenanceRecords.$inferInsert;

/**
 * 设备备件库存表 - 管理设备备件
 */
export const deviceSpareParts = mysqlTable("device_spare_parts", {
  id: int("id").autoincrement().primaryKey(),
  partId: varchar("partId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  partNumber: varchar("partNumber", { length: 100 }),
  category: varchar("category", { length: 50 }),
  compatibleDeviceTypes: json("compatibleDeviceTypes").$type<string[]>(),
  manufacturer: varchar("manufacturer", { length: 100 }),
  supplier: varchar("supplier", { length: 100 }),
  quantity: int("quantity").default(0).notNull(),
  minQuantity: int("minQuantity").default(1),
  maxQuantity: int("maxQuantity"),
  unitPrice: double("unitPrice"),
  currency: varchar("currency", { length: 10 }).default("CNY"),
  location: varchar("location", { length: 100 }),
  status: mysqlEnum("status", ["in_stock", "low_stock", "out_of_stock", "ordered", "discontinued"]).default("in_stock").notNull(),
  lastRestockedAt: timestamp("lastRestockedAt"),
  expiryDate: timestamp("expiryDate"),
  metadata: json("metadata").$type<{
    specifications?: Record<string, string>;
    warranty?: string;
    notes?: string;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeviceSparePart = typeof deviceSpareParts.$inferSelect;
export type InsertDeviceSparePart = typeof deviceSpareParts.$inferInsert;

/**
 * 设备运行日志表 - 记录设备运行状态变化
 */
export const deviceOperationLogs = mysqlTable("device_operation_logs", {
  id: int("id").autoincrement().primaryKey(),
  logId: varchar("logId", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  operationType: mysqlEnum("operationType", ["start", "stop", "restart", "config_change", "firmware_update", "calibration", "mode_change", "error", "recovery"]).notNull(),
  previousState: varchar("previousState", { length: 50 }),
  newState: varchar("newState", { length: 50 }),
  operatedBy: varchar("operatedBy", { length: 100 }),
  reason: text("reason"),
  details: json("details").$type<Record<string, unknown>>(),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("errorMessage"),
  duration: int("duration"), // 操作耗时（毫秒）
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeviceOperationLog = typeof deviceOperationLogs.$inferSelect;
export type InsertDeviceOperationLog = typeof deviceOperationLogs.$inferInsert;

/**
 * 设备告警表 - 存储设备告警信息
 */
export const deviceAlerts = mysqlTable("device_alerts", {
  id: int("id").autoincrement().primaryKey(),
  alertId: varchar("alertId", { length: 64 }).notNull().unique(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  sensorId: varchar("sensorId", { length: 64 }),
  alertType: mysqlEnum("alertType", ["threshold", "anomaly", "offline", "error", "maintenance_due", "warranty_expiry", "custom"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  severity: mysqlEnum("severity", ["info", "warning", "error", "critical"]).default("warning").notNull(),
  status: mysqlEnum("status", ["active", "acknowledged", "resolved", "suppressed"]).default("active").notNull(),
  triggerValue: double("triggerValue"),
  thresholdValue: double("thresholdValue"),
  acknowledgedBy: varchar("acknowledgedBy", { length: 100 }),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedBy: varchar("resolvedBy", { length: 100 }),
  resolvedAt: timestamp("resolvedAt"),
  resolution: text("resolution"),
  escalationLevel: int("escalationLevel").default(0),
  notificationsSent: json("notificationsSent").$type<Array<{ channel: string; sentAt: string; recipient: string }>>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeviceAlert = typeof deviceAlerts.$inferSelect;
export type InsertDeviceAlert = typeof deviceAlerts.$inferInsert;

/**
 * 设备性能指标表 - 存储设备 KPI 指标
 */
export const deviceKpis = mysqlTable("device_kpis", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  periodType: mysqlEnum("periodType", ["hourly", "daily", "weekly", "monthly"]).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  // OEE 指标
  availability: double("availability"), // 可用率 (%)
  performance: double("performance"), // 性能率 (%)
  quality: double("quality"), // 质量率 (%)
  oee: double("oee"), // 设备综合效率 (%)
  // 运行指标
  runningTime: int("runningTime"), // 运行时间（秒）
  downtime: int("downtime"), // 停机时间（秒）
  idleTime: int("idleTime"), // 空闲时间（秒）
  plannedDowntime: int("plannedDowntime"), // 计划停机时间（秒）
  unplannedDowntime: int("unplannedDowntime"), // 非计划停机时间（秒）
  // 故障指标
  mtbf: double("mtbf"), // 平均故障间隔时间（小时）
  mttr: double("mttr"), // 平均修复时间（小时）
  failureCount: int("failureCount").default(0), // 故障次数
  // 产出指标
  productionCount: int("productionCount"), // 生产数量
  defectCount: int("defectCount"), // 缺陷数量
  // 能耗指标
  energyConsumption: double("energyConsumption"), // 能耗 (kWh)
  energyEfficiency: double("energyEfficiency"), // 能效 (单位产出/kWh)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeviceKpi = typeof deviceKpis.$inferSelect;
export type InsertDeviceKpi = typeof deviceKpis.$inferInsert;


// ============ v1.9 性能优化模块表 ============

/**
 * Outbox 事件表 - 事务性事件发布（Outbox 模式）
 */
export const outboxEvents = mysqlTable("outbox_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  aggregateType: varchar("aggregateType", { length: 100 }).notNull(),
  aggregateId: varchar("aggregateId", { length: 64 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  metadata: json("metadata").$type<{
    correlationId?: string;
    causationId?: string;
    userId?: string;
    source?: string;
  }>(),
  status: mysqlEnum("status", ["pending", "processing", "published", "failed"]).default("pending").notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  maxRetries: int("maxRetries").default(3).notNull(),
  lastError: text("lastError"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type InsertOutboxEvent = typeof outboxEvents.$inferInsert;

/**
 * Outbox 路由配置表 - 事件路由策略配置
 */
export const outboxRoutingConfig = mysqlTable("outbox_routing_config", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 100 }).notNull().unique(),
  publishMode: mysqlEnum("publishMode", ["cdc", "polling"]).default("cdc").notNull(),
  cdcEnabled: boolean("cdcEnabled").default(true).notNull(),
  pollingIntervalMs: int("pollingIntervalMs"),
  pollingBatchSize: int("pollingBatchSize"),
  requiresProcessing: boolean("requiresProcessing").default(false).notNull(),
  processorClass: varchar("processorClass", { length: 200 }),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutboxRoutingConfig = typeof outboxRoutingConfig.$inferSelect;
export type InsertOutboxRoutingConfig = typeof outboxRoutingConfig.$inferInsert;

/**
 * Saga 实例表 - Saga 编排实例
 */
export const sagaInstances = mysqlTable("saga_instances", {
  id: int("id").autoincrement().primaryKey(),
  sagaId: varchar("sagaId", { length: 64 }).notNull().unique(),
  sagaType: varchar("sagaType", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed", "compensating", "compensated", "partial"]).default("running").notNull(),
  currentStep: int("currentStep").default(0).notNull(),
  totalSteps: int("totalSteps").notNull(),
  input: json("input").$type<Record<string, unknown>>(),
  output: json("output").$type<Record<string, unknown>>(),
  checkpoint: json("checkpoint").$type<{
    processed: string[];
    failed: Array<{ item: string; error: string }>;
    lastCompletedStep: number;
  }>(),
  error: text("error"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  timeoutAt: timestamp("timeoutAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SagaInstance = typeof sagaInstances.$inferSelect;
export type InsertSagaInstance = typeof sagaInstances.$inferInsert;

/**
 * Saga 步骤表 - Saga 执行步骤记录
 */
export const sagaSteps = mysqlTable("saga_steps", {
  id: int("id").autoincrement().primaryKey(),
  stepId: varchar("stepId", { length: 64 }).notNull().unique(),
  sagaId: varchar("sagaId", { length: 64 }).notNull(),
  stepIndex: int("stepIndex").notNull(),
  stepName: varchar("stepName", { length: 100 }).notNull(),
  stepType: mysqlEnum("stepType", ["action", "compensation"]).default("action").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped", "compensated"]).default("pending").notNull(),
  input: json("input").$type<Record<string, unknown>>(),
  output: json("output").$type<Record<string, unknown>>(),
  error: text("error"),
  retryCount: int("retryCount").default(0).notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SagaStep = typeof sagaSteps.$inferSelect;
export type InsertSagaStep = typeof sagaSteps.$inferInsert;

/**
 * Saga 死信队列表 - 失败的 Saga 记录
 */
export const sagaDeadLetters = mysqlTable("saga_dead_letters", {
  id: int("id").autoincrement().primaryKey(),
  deadLetterId: varchar("deadLetterId", { length: 64 }).notNull().unique(),
  sagaId: varchar("sagaId", { length: 64 }).notNull(),
  sagaType: varchar("sagaType", { length: 100 }).notNull(),
  failureReason: text("failureReason").notNull(),
  failureType: mysqlEnum("failureType", ["timeout", "max_retries", "compensation_failed", "unknown"]).notNull(),
  originalInput: json("originalInput").$type<Record<string, unknown>>(),
  lastCheckpoint: json("lastCheckpoint").$type<Record<string, unknown>>(),
  retryable: boolean("retryable").default(true).notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  lastRetryAt: timestamp("lastRetryAt"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 100 }),
  resolution: text("resolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SagaDeadLetter = typeof sagaDeadLetters.$inferSelect;
export type InsertSagaDeadLetter = typeof sagaDeadLetters.$inferInsert;

/**
 * 已处理事件表 - 幂等性去重记录
 */
export const processedEvents = mysqlTable("processed_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull().unique(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  consumerGroup: varchar("consumerGroup", { length: 100 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  metadata: json("metadata").$type<{
    partition?: number;
    offset?: string;
    processingTimeMs?: number;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type InsertProcessedEvent = typeof processedEvents.$inferInsert;

/**
 * 设备采样配置表 - 自适应采样率配置
 */
export const deviceSamplingConfig = mysqlTable("device_sampling_config", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: varchar("node_id", { length: 64 }).notNull(), // 资产节点ID，引用 asset_nodes
  sensorType: varchar("sensorType", { length: 50 }).notNull(),
  baseSamplingRateMs: int("baseSamplingRateMs").default(1000).notNull(),
  currentSamplingRateMs: int("currentSamplingRateMs").default(1000).notNull(),
  minSamplingRateMs: int("minSamplingRateMs").default(100).notNull(),
  maxSamplingRateMs: int("maxSamplingRateMs").default(60000).notNull(),
  adaptiveEnabled: boolean("adaptiveEnabled").default(true).notNull(),
  lastAdjustedAt: timestamp("lastAdjustedAt"),
  adjustmentReason: varchar("adjustmentReason", { length: 200 }),
  priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeviceSamplingConfig = typeof deviceSamplingConfig.$inferSelect;
export type InsertDeviceSamplingConfig = typeof deviceSamplingConfig.$inferInsert;

/**
 * 幂等记录表 - 通用幂等性控制
 */
export const idempotentRecords = mysqlTable("idempotent_records", {
  id: int("id").autoincrement().primaryKey(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  operationType: varchar("operationType", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).default("processing").notNull(),
  requestHash: varchar("requestHash", { length: 64 }),
  response: json("response").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IdempotentRecord = typeof idempotentRecords.$inferSelect;
export type InsertIdempotentRecord = typeof idempotentRecords.$inferInsert;

/**
 * 回滚执行表扩展 - 支持 Saga 模式
 */
export const rollbackExecutions = mysqlTable("rollback_executions", {
  id: int("id").autoincrement().primaryKey(),
  executionId: varchar("executionId", { length: 64 }).notNull().unique(),
  sagaId: varchar("sagaId", { length: 64 }),
  triggerId: varchar("triggerId", { length: 64 }).notNull(),
  targetType: mysqlEnum("targetType", ["rule", "model", "config", "firmware"]).notNull(),
  targetId: varchar("targetId", { length: 64 }).notNull(),
  fromVersion: varchar("fromVersion", { length: 50 }).notNull(),
  toVersion: varchar("toVersion", { length: 50 }).notNull(),
  triggerReason: text("triggerReason"),
  status: mysqlEnum("status", ["pending", "executing", "completed", "failed", "partial", "cancelled"]).default("pending").notNull(),
  totalDevices: int("totalDevices"),
  completedDevices: int("completedDevices").default(0),
  failedDevices: int("failedDevices").default(0),
  checkpoint: json("checkpoint").$type<{
    processed: string[];
    failed: Array<{ device: string; error: string }>;
  }>(),
  result: json("result").$type<{
    total: number;
    succeeded: number;
    failed: number;
    details?: Array<{ deviceId: string; status: string; error?: string }>;
  }>(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RollbackExecution = typeof rollbackExecutions.$inferSelect;
export type InsertRollbackExecution = typeof rollbackExecutions.$inferInsert;

/**
 * 系统容量指标表 - 用于自适应配置
 */
export const systemCapacityMetrics = mysqlTable("system_capacity_metrics", {
  id: int("id").autoincrement().primaryKey(),
  metricId: varchar("metricId", { length: 64 }).notNull().unique(),
  metricType: mysqlEnum("metricType", ["kafka_lag", "db_connections", "memory_usage", "cpu_usage", "queue_depth"]).notNull(),
  componentName: varchar("componentName", { length: 100 }).notNull(),
  currentValue: double("currentValue").notNull(),
  threshold: double("threshold").notNull(),
  status: mysqlEnum("status", ["normal", "warning", "critical"]).default("normal").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  completedAt: datetime("completed_at", { fsp: 3 }),
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
  recordedAt: datetime("recorded_at", { fsp: 3 }).notNull(),
  actorId: varchar("actor_id", { length: 64 }),
  actorType: varchar("actor_type", { length: 20 }),
});

export type EventStoreEntry = typeof eventStore.$inferSelect;
export type InsertEventStoreEntry = typeof eventStore.$inferInsert;

/**
 * 聚合快照表
 */
export const eventSnapshots = mysqlTable("event_snapshots", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 100 }).notNull(),
  aggregateVersion: bigint("aggregate_version", { mode: "number" }).notNull(),
  state: json("state").notNull(),
  createdAt: datetime("created_at", { fsp: 3 }).notNull(),
});

export type EventSnapshot = typeof eventSnapshots.$inferSelect;
export type InsertEventSnapshot = typeof eventSnapshots.$inferInsert;
