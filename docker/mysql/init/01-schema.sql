-- ============================================================
-- 西联智能平台 - MySQL 数据库初始化脚本
-- XiLian Intelligent Platform - MySQL Database Initialization
-- ============================================================

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS portai_nexus 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE portai_nexus;

-- ============================================================
-- 用户管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 知识库表 (kb_ 前缀)
-- ============================================================

CREATE TABLE IF NOT EXISTS kb_collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  userId INT,
  isPublic BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kb_collections_userId (userId),
  INDEX idx_kb_collections_isPublic (isPublic)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  tags JSON,
  source VARCHAR(255),
  entities JSON,
  relations JSON,
  embedding JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kb_points_collectionId (collectionId),
  INDEX idx_kb_points_category (category),
  FULLTEXT INDEX idx_kb_points_content (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mimeType VARCHAR(100),
  fileSize INT,
  storageUrl VARCHAR(500),
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  processedAt TIMESTAMP NULL,
  chunksCount INT DEFAULT 0,
  entitiesCount INT DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kb_documents_collectionId (collectionId),
  INDEX idx_kb_documents_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 知识图谱表 (kg_ 前缀)
-- ============================================================

CREATE TABLE IF NOT EXISTS kg_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL,
  nodeId VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'entity',
  properties JSON,
  x INT,
  y INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kg_nodes_collectionId (collectionId),
  INDEX idx_kg_nodes_nodeId (nodeId),
  INDEX idx_kg_nodes_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kg_edges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL,
  edgeId VARCHAR(100) NOT NULL,
  sourceNodeId VARCHAR(100) NOT NULL,
  targetNodeId VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'related_to',
  weight INT DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kg_edges_collectionId (collectionId),
  INDEX idx_kg_edges_sourceNodeId (sourceNodeId),
  INDEX idx_kg_edges_targetNodeId (targetNodeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 系统拓扑表 (topo_ 前缀)
-- ============================================================

CREATE TABLE IF NOT EXISTS topo_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nodeId VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type ENUM('source', 'plugin', 'engine', 'agent', 'output', 'database', 'service') NOT NULL,
  icon VARCHAR(20) DEFAULT '📦',
  description TEXT,
  status ENUM('online', 'offline', 'error', 'maintenance') NOT NULL DEFAULT 'offline',
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  config JSON,
  metrics JSON,
  lastHeartbeat TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_topo_nodes_type (type),
  INDEX idx_topo_nodes_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topo_edges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  edgeId VARCHAR(64) NOT NULL UNIQUE,
  sourceNodeId VARCHAR(64) NOT NULL,
  targetNodeId VARCHAR(64) NOT NULL,
  type ENUM('data', 'dependency', 'control') NOT NULL DEFAULT 'data',
  label VARCHAR(100),
  config JSON,
  status ENUM('active', 'inactive', 'error') NOT NULL DEFAULT 'active',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_topo_edges_sourceNodeId (sourceNodeId),
  INDEX idx_topo_edges_targetNodeId (targetNodeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topo_layouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  userId INT,
  isDefault BOOLEAN NOT NULL DEFAULT FALSE,
  layoutData JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_topo_layouts_userId (userId),
  INDEX idx_topo_layouts_isDefault (isDefault)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 大模型管理表 (model_ 前缀)
-- ============================================================

CREATE TABLE IF NOT EXISTS models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  modelId VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  displayName VARCHAR(200),
  type ENUM('llm', 'embedding', 'label', 'diagnostic', 'vision', 'audio') NOT NULL,
  provider ENUM('ollama', 'openai', 'anthropic', 'local', 'custom') NOT NULL DEFAULT 'ollama',
  size VARCHAR(50),
  parameters VARCHAR(50),
  quantization VARCHAR(20),
  description TEXT,
  status ENUM('available', 'loaded', 'downloading', 'error') NOT NULL DEFAULT 'available',
  downloadProgress INT DEFAULT 0,
  isDefault BOOLEAN NOT NULL DEFAULT FALSE,
  config JSON,
  capabilities JSON,
  metrics JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_models_type (type),
  INDEX idx_models_provider (provider),
  INDEX idx_models_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversationId VARCHAR(64) NOT NULL UNIQUE,
  userId INT,
  modelId VARCHAR(100) NOT NULL,
  title VARCHAR(255),
  messageCount INT NOT NULL DEFAULT 0,
  totalTokens INT DEFAULT 0,
  status ENUM('active', 'archived', 'deleted') NOT NULL DEFAULT 'active',
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_model_conversations_userId (userId),
  INDEX idx_model_conversations_modelId (modelId),
  INDEX idx_model_conversations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  messageId VARCHAR(64) NOT NULL UNIQUE,
  conversationId VARCHAR(64) NOT NULL,
  role ENUM('system', 'user', 'assistant', 'tool') NOT NULL,
  content TEXT NOT NULL,
  tokens INT,
  latency INT,
  attachments JSON,
  toolCalls JSON,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_model_messages_conversationId (conversationId),
  INDEX idx_model_messages_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_fine_tune_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  taskId VARCHAR(64) NOT NULL UNIQUE,
  userId INT,
  baseModelId VARCHAR(100) NOT NULL,
  outputModelId VARCHAR(100),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status ENUM('pending', 'preparing', 'training', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  progress INT DEFAULT 0,
  datasetPath VARCHAR(500),
  datasetSize INT,
  config JSON,
  metrics JSON,
  error TEXT,
  startedAt TIMESTAMP NULL,
  completedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_model_fine_tune_tasks_userId (userId),
  INDEX idx_model_fine_tune_tasks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluationId VARCHAR(64) NOT NULL UNIQUE,
  userId INT,
  modelId VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  progress INT DEFAULT 0,
  datasetPath VARCHAR(500),
  datasetSize INT,
  evaluationType ENUM('accuracy', 'perplexity', 'bleu', 'rouge', 'custom') NOT NULL DEFAULT 'accuracy',
  results JSON,
  error TEXT,
  startedAt TIMESTAMP NULL,
  completedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_model_evaluations_userId (userId),
  INDEX idx_model_evaluations_modelId (modelId),
  INDEX idx_model_evaluations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  logId VARCHAR(64) NOT NULL UNIQUE,
  userId INT,
  modelId VARCHAR(100) NOT NULL,
  conversationId VARCHAR(64),
  requestType ENUM('chat', 'completion', 'embedding', 'inference') NOT NULL,
  inputTokens INT,
  outputTokens INT,
  latency INT,
  status ENUM('success', 'error', 'timeout') NOT NULL,
  error TEXT,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_model_usage_logs_userId (userId),
  INDEX idx_model_usage_logs_modelId (modelId),
  INDEX idx_model_usage_logs_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 设备管理表 (device_ 前缀)
-- ============================================================

CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deviceId VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type ENUM('agv', 'rtg', 'qc', 'asc', 'conveyor', 'pump', 'motor', 'sensor_hub', 'gateway', 'other') NOT NULL DEFAULT 'other',
  model VARCHAR(100),
  manufacturer VARCHAR(100),
  serialNumber VARCHAR(100),
  location VARCHAR(255),
  department VARCHAR(100),
  status ENUM('online', 'offline', 'maintenance', 'error', 'unknown') NOT NULL DEFAULT 'unknown',
  lastHeartbeat TIMESTAMP NULL,
  installDate TIMESTAMP NULL,
  warrantyExpiry TIMESTAMP NULL,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_devices_type (type),
  INDEX idx_devices_status (status),
  INDEX idx_devices_department (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sensors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensorId VARCHAR(64) NOT NULL UNIQUE,
  deviceId VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('vibration', 'temperature', 'pressure', 'current', 'voltage', 'speed', 'position', 'humidity', 'flow', 'level', 'other') NOT NULL DEFAULT 'other',
  unit VARCHAR(20),
  minValue INT,
  maxValue INT,
  warningThreshold INT,
  criticalThreshold INT,
  samplingRate INT DEFAULT 1000,
  status ENUM('active', 'inactive', 'error') NOT NULL DEFAULT 'active',
  lastValue VARCHAR(50),
  lastReadingAt TIMESTAMP NULL,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sensors_deviceId (deviceId),
  INDEX idx_sensors_type (type),
  INDEX idx_sensors_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sensor_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensorId VARCHAR(64) NOT NULL,
  deviceId VARCHAR(64) NOT NULL,
  value VARCHAR(50) NOT NULL,
  numericValue INT,
  quality ENUM('good', 'uncertain', 'bad') NOT NULL DEFAULT 'good',
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  INDEX idx_sensor_readings_sensorId (sensorId),
  INDEX idx_sensor_readings_deviceId (deviceId),
  INDEX idx_sensor_readings_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sensor_aggregates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sensorId VARCHAR(64) NOT NULL,
  deviceId VARCHAR(64) NOT NULL,
  period ENUM('1m', '5m', '1h', '1d') NOT NULL,
  periodStart TIMESTAMP NOT NULL,
  avgValue INT,
  minValue INT,
  maxValue INT,
  sumValue INT,
  count INT NOT NULL DEFAULT 0,
  stdDev INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sensor_aggregates_sensorId (sensorId),
  INDEX idx_sensor_aggregates_period (period),
  INDEX idx_sensor_aggregates_periodStart (periodStart)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 事件总线表 (event_ 前缀)
-- ============================================================

CREATE TABLE IF NOT EXISTS event_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(64) NOT NULL UNIQUE,
  topic VARCHAR(100) NOT NULL,
  eventType VARCHAR(50) NOT NULL,
  source VARCHAR(100),
  deviceId VARCHAR(64),
  sensorId VARCHAR(64),
  severity ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'info',
  payload JSON,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processedAt TIMESTAMP NULL,
  processedBy VARCHAR(100),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_logs_topic (topic),
  INDEX idx_event_logs_eventType (eventType),
  INDEX idx_event_logs_severity (severity),
  INDEX idx_event_logs_processed (processed),
  INDEX idx_event_logs_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anomaly_detections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  detectionId VARCHAR(64) NOT NULL UNIQUE,
  sensorId VARCHAR(64) NOT NULL,
  deviceId VARCHAR(64) NOT NULL,
  algorithmType ENUM('zscore', 'iqr', 'mad', 'isolation_forest', 'custom') NOT NULL DEFAULT 'zscore',
  windowSize INT DEFAULT 60,
  threshold INT,
  currentValue INT,
  expectedValue INT,
  deviation INT,
  score INT,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  status ENUM('open', 'acknowledged', 'resolved', 'false_positive') NOT NULL DEFAULT 'open',
  acknowledgedBy VARCHAR(100),
  acknowledgedAt TIMESTAMP NULL,
  resolvedAt TIMESTAMP NULL,
  notes TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_anomaly_detections_sensorId (sensorId),
  INDEX idx_anomaly_detections_deviceId (deviceId),
  INDEX idx_anomaly_detections_severity (severity),
  INDEX idx_anomaly_detections_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS diagnosis_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ruleId VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  deviceType VARCHAR(50),
  sensorType VARCHAR(50),
  conditionExpr TEXT NOT NULL,
  actionType ENUM('alert', 'notification', 'workflow', 'auto_fix') NOT NULL DEFAULT 'alert',
  actionConfig JSON,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT DEFAULT 5,
  triggerCount INT DEFAULT 0,
  lastTriggeredAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_diagnosis_rules_category (category),
  INDEX idx_diagnosis_rules_deviceType (deviceType),
  INDEX idx_diagnosis_rules_isActive (isActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS diagnosis_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  taskId VARCHAR(64) NOT NULL UNIQUE,
  deviceId VARCHAR(64),
  sensorId VARCHAR(64),
  ruleId VARCHAR(64),
  anomalyId VARCHAR(64),
  taskType ENUM('routine', 'anomaly', 'manual', 'scheduled') NOT NULL DEFAULT 'routine',
  status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  priority INT DEFAULT 5,
  inputData JSON,
  result JSON,
  error TEXT,
  startedAt TIMESTAMP NULL,
  completedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_diagnosis_tasks_deviceId (deviceId),
  INDEX idx_diagnosis_tasks_status (status),
  INDEX idx_diagnosis_tasks_taskType (taskType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 遥测数据表
-- ============================================================

CREATE TABLE IF NOT EXISTS telemetry_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deviceId VARCHAR(64) NOT NULL,
  sensorId VARCHAR(64) NOT NULL,
  metricName VARCHAR(100) NOT NULL,
  value DOUBLE NOT NULL,
  unit VARCHAR(20),
  quality ENUM('good', 'uncertain', 'bad') DEFAULT 'good',
  timestamp TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_telemetry_data_deviceId (deviceId),
  INDEX idx_telemetry_data_sensorId (sensorId),
  INDEX idx_telemetry_data_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_aggregations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deviceId VARCHAR(64) NOT NULL,
  sensorId VARCHAR(64) NOT NULL,
  metricName VARCHAR(100) NOT NULL,
  windowStart TIMESTAMP NOT NULL,
  windowEnd TIMESTAMP NOT NULL,
  count INT NOT NULL,
  sum DOUBLE NOT NULL,
  min DOUBLE NOT NULL,
  max DOUBLE NOT NULL,
  avg DOUBLE NOT NULL,
  stdDev DOUBLE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_data_aggregations_deviceId (deviceId),
  INDEX idx_data_aggregations_sensorId (sensorId),
  INDEX idx_data_aggregations_windowStart (windowStart)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 设备维护表
-- ============================================================

CREATE TABLE IF NOT EXISTS device_maintenance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recordId VARCHAR(64) NOT NULL UNIQUE,
  deviceId VARCHAR(64) NOT NULL,
  maintenanceType ENUM('preventive', 'corrective', 'predictive', 'emergency', 'calibration', 'inspection') NOT NULL DEFAULT 'preventive',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  scheduledDate TIMESTAMP NULL,
  startedAt TIMESTAMP NULL,
  completedAt TIMESTAMP NULL,
  status ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'overdue') NOT NULL DEFAULT 'scheduled',
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  assignedTo VARCHAR(100),
  performedBy VARCHAR(100),
  cost DOUBLE,
  currency VARCHAR(10) DEFAULT 'CNY',
  parts JSON,
  findings TEXT,
  recommendations TEXT,
  attachments JSON,
  nextMaintenanceDate TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device_maintenance_records_deviceId (deviceId),
  INDEX idx_device_maintenance_records_status (status),
  INDEX idx_device_maintenance_records_scheduledDate (scheduledDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_spare_parts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partId VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  partNumber VARCHAR(100),
  category VARCHAR(50),
  compatibleDeviceTypes JSON,
  manufacturer VARCHAR(100),
  supplier VARCHAR(100),
  quantity INT NOT NULL DEFAULT 0,
  minQuantity INT DEFAULT 1,
  maxQuantity INT,
  unitPrice DOUBLE,
  currency VARCHAR(10) DEFAULT 'CNY',
  location VARCHAR(100),
  status ENUM('in_stock', 'low_stock', 'out_of_stock', 'ordered', 'discontinued') NOT NULL DEFAULT 'in_stock',
  lastRestockedAt TIMESTAMP NULL,
  expiryDate TIMESTAMP NULL,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device_spare_parts_category (category),
  INDEX idx_device_spare_parts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  logId VARCHAR(64) NOT NULL UNIQUE,
  deviceId VARCHAR(64) NOT NULL,
  operationType ENUM('start', 'stop', 'restart', 'config_change', 'firmware_update', 'calibration', 'mode_change', 'error', 'recovery') NOT NULL,
  previousState VARCHAR(50),
  newState VARCHAR(50),
  operatedBy VARCHAR(100),
  reason TEXT,
  details JSON,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  errorMessage TEXT,
  duration INT,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_operation_logs_deviceId (deviceId),
  INDEX idx_device_operation_logs_operationType (operationType),
  INDEX idx_device_operation_logs_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alertId VARCHAR(64) NOT NULL UNIQUE,
  deviceId VARCHAR(64) NOT NULL,
  sensorId VARCHAR(64),
  alertType ENUM('threshold', 'anomaly', 'offline', 'error', 'maintenance_due', 'warranty_expiry', 'custom') NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  severity ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'warning',
  status ENUM('active', 'acknowledged', 'resolved', 'suppressed') NOT NULL DEFAULT 'active',
  triggerValue DOUBLE,
  thresholdValue DOUBLE,
  acknowledgedBy VARCHAR(100),
  acknowledgedAt TIMESTAMP NULL,
  resolvedBy VARCHAR(100),
  resolvedAt TIMESTAMP NULL,
  notes TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device_alerts_deviceId (deviceId),
  INDEX idx_device_alerts_alertType (alertType),
  INDEX idx_device_alerts_severity (severity),
  INDEX idx_device_alerts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 完成初始化
-- ============================================================

SELECT 'MySQL schema initialization completed successfully!' AS status;

-- ============================================================
-- v1.9 性能优化模块表
-- ============================================================

-- Outbox 事件表 - 事务性消息发布
CREATE TABLE IF NOT EXISTS outbox_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(64) NOT NULL UNIQUE,
  eventType VARCHAR(100) NOT NULL,
  aggregateId VARCHAR(64) NOT NULL,
  aggregateType VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  metadata JSON,
  status ENUM('pending', 'processing', 'published', 'failed', 'dead_letter') NOT NULL DEFAULT 'pending',
  retryCount INT NOT NULL DEFAULT 0,
  maxRetries INT NOT NULL DEFAULT 3,
  lastError TEXT,
  publishedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_outbox_status (status),
  INDEX idx_outbox_type (eventType),
  INDEX idx_outbox_aggregate (aggregateId, aggregateType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Outbox 路由配置表
CREATE TABLE IF NOT EXISTS outbox_routing_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventType VARCHAR(100) NOT NULL UNIQUE,
  publishMode ENUM('cdc', 'polling') NOT NULL DEFAULT 'cdc',
  cdcEnabled BOOLEAN NOT NULL DEFAULT TRUE,
  pollingIntervalMs INT,
  pollingBatchSize INT,
  requiresProcessing BOOLEAN NOT NULL DEFAULT FALSE,
  processorClass VARCHAR(200),
  description TEXT,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saga 实例表
CREATE TABLE IF NOT EXISTS saga_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sagaId VARCHAR(64) NOT NULL UNIQUE,
  sagaType VARCHAR(100) NOT NULL,
  status ENUM('running', 'completed', 'failed', 'compensating', 'compensated', 'partial') NOT NULL DEFAULT 'running',
  currentStep INT NOT NULL DEFAULT 0,
  totalSteps INT NOT NULL,
  input JSON,
  output JSON,
  checkpoint JSON,
  error TEXT,
  startedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL,
  timeoutAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saga_status (status),
  INDEX idx_saga_type (sagaType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saga 步骤表
CREATE TABLE IF NOT EXISTS saga_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stepId VARCHAR(64) NOT NULL UNIQUE,
  sagaId VARCHAR(64) NOT NULL,
  stepIndex INT NOT NULL,
  stepName VARCHAR(100) NOT NULL,
  stepType ENUM('action', 'compensation') NOT NULL DEFAULT 'action',
  status ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'compensated') NOT NULL DEFAULT 'pending',
  input JSON,
  output JSON,
  error TEXT,
  retryCount INT NOT NULL DEFAULT 0,
  startedAt TIMESTAMP NULL,
  completedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saga_steps_sagaId (sagaId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saga 死信队列表
CREATE TABLE IF NOT EXISTS saga_dead_letters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deadLetterId VARCHAR(64) NOT NULL UNIQUE,
  sagaId VARCHAR(64) NOT NULL,
  sagaType VARCHAR(100) NOT NULL,
  failureReason TEXT NOT NULL,
  failureType ENUM('timeout', 'max_retries', 'compensation_failed', 'unknown') NOT NULL,
  originalInput JSON,
  lastCheckpoint JSON,
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  retryCount INT NOT NULL DEFAULT 0,
  lastRetryAt TIMESTAMP NULL,
  resolvedAt TIMESTAMP NULL,
  resolvedBy VARCHAR(100),
  resolution TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saga_dl_sagaId (sagaId),
  INDEX idx_saga_dl_type (failureType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 已处理事件表
CREATE TABLE IF NOT EXISTS processed_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(64) NOT NULL,
  consumerGroup VARCHAR(100) NOT NULL,
  processedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt TIMESTAMP NOT NULL,
  metadata JSON,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_consumer (eventId, consumerGroup),
  INDEX idx_processed_expires (expiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 设备采样配置表
CREATE TABLE IF NOT EXISTS device_sampling_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deviceId VARCHAR(64) NOT NULL,
  sensorType VARCHAR(50) NOT NULL,
  baseSamplingRateMs INT NOT NULL DEFAULT 1000,
  currentSamplingRateMs INT NOT NULL DEFAULT 1000,
  minSamplingRateMs INT NOT NULL DEFAULT 100,
  maxSamplingRateMs INT NOT NULL DEFAULT 60000,
  adaptiveEnabled BOOLEAN NOT NULL DEFAULT TRUE,
  lastAdjustedAt TIMESTAMP NULL,
  adjustmentReason VARCHAR(200),
  priority ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device_sensor (deviceId, sensorType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 幂等记录表
CREATE TABLE IF NOT EXISTS idempotent_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idempotencyKey VARCHAR(128) NOT NULL UNIQUE,
  operationType VARCHAR(100) NOT NULL,
  status ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
  requestHash VARCHAR(64),
  response JSON,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_idempotent_expires (expiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 回滚执行表
CREATE TABLE IF NOT EXISTS rollback_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executionId VARCHAR(64) NOT NULL UNIQUE,
  sagaId VARCHAR(64),
  triggerId VARCHAR(64) NOT NULL,
  targetType ENUM('rule', 'model', 'config', 'firmware') NOT NULL,
  targetId VARCHAR(64) NOT NULL,
  fromVersion VARCHAR(50) NOT NULL,
  toVersion VARCHAR(50) NOT NULL,
  triggerReason TEXT,
  status ENUM('pending', 'executing', 'completed', 'failed', 'partial', 'cancelled') NOT NULL DEFAULT 'pending',
  totalDevices INT,
  completedDevices INT DEFAULT 0,
  failedDevices INT DEFAULT 0,
  checkpoint JSON,
  result JSON,
  startedAt TIMESTAMP NULL,
  completedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rollback_status (status),
  INDEX idx_rollback_sagaId (sagaId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 系统容量指标表
CREATE TABLE IF NOT EXISTS system_capacity_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  metricId VARCHAR(64) NOT NULL UNIQUE,
  metricType ENUM('kafka_lag', 'db_connections', 'memory_usage', 'cpu_usage', 'queue_depth') NOT NULL,
  componentName VARCHAR(100) NOT NULL,
  currentValue DOUBLE NOT NULL,
  threshold DOUBLE NOT NULL,
  status ENUM('normal', 'warning', 'critical') NOT NULL DEFAULT 'normal',
  lastCheckedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'v1.9 performance module tables created successfully!' AS status;
