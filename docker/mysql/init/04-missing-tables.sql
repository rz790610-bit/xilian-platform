-- ============================================================
-- 补全缺失的 13 张设备管理相关表
-- 生成时间: 2026-02-07
-- 说明: 这些表因 01-schema.sql 执行中断而未创建
-- ============================================================

USE portai_nexus;

-- sensors
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

-- sensor_readings
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

-- sensor_aggregates
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

-- event_logs
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

-- anomaly_detections
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

-- diagnosis_rules
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

-- diagnosis_tasks
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

-- telemetry_data
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

-- data_aggregations
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

-- device_maintenance_records
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

-- device_spare_parts
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

-- device_operation_logs
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

-- device_alerts
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

SELECT 'All 13 missing tables created successfully!' AS result;

-- device_kpis (设备 KPI 指标表)
CREATE TABLE IF NOT EXISTS device_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deviceId VARCHAR(64) NOT NULL,
  periodType ENUM('hourly', 'daily', 'weekly', 'monthly') NOT NULL,
  periodStart TIMESTAMP NOT NULL,
  periodEnd TIMESTAMP NOT NULL,
  availability DOUBLE,
  performance DOUBLE,
  quality DOUBLE,
  oee DOUBLE,
  runningTime INT,
  downtime INT,
  idleTime INT,
  plannedDowntime INT,
  unplannedDowntime INT,
  mtbf DOUBLE,
  mttr DOUBLE,
  failureCount INT DEFAULT 0,
  productionCount INT,
  defectCount INT,
  energyConsumption DOUBLE,
  energyEfficiency DOUBLE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_kpis_deviceId (deviceId),
  INDEX idx_device_kpis_periodType (periodType),
  INDEX idx_device_kpis_periodStart (periodStart)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

