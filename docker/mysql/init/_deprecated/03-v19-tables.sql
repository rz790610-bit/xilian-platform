-- v1.9 Performance Module Tables
USE portai_nexus;

CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` varchar(64) NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `aggregateId` varchar(64) NOT NULL,
  `aggregateType` varchar(100) NOT NULL,
  `payload` json NOT NULL,
  `metadata` json,
  `status` enum('pending','processing','published','failed','dead_letter') NOT NULL DEFAULT 'pending',
  `retryCount` int NOT NULL DEFAULT 0,
  `maxRetries` int NOT NULL DEFAULT 3,
  `lastError` text,
  `publishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outbox_events_eventId_unique` (`eventId`),
  INDEX `idx_outbox_status` (`status`),
  INDEX `idx_outbox_type` (`eventType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `outbox_routing_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `publishMode` enum('cdc','polling') NOT NULL DEFAULT 'cdc',
  `cdcEnabled` boolean NOT NULL DEFAULT true,
  `pollingIntervalMs` int,
  `pollingBatchSize` int,
  `requiresProcessing` boolean NOT NULL DEFAULT false,
  `processorClass` varchar(200),
  `description` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outbox_routing_config_eventType_unique` (`eventType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saga_instances` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sagaId` varchar(64) NOT NULL,
  `sagaType` varchar(100) NOT NULL,
  `status` enum('running','completed','failed','compensating','compensated','partial') NOT NULL DEFAULT 'running',
  `currentStep` int NOT NULL DEFAULT 0,
  `totalSteps` int NOT NULL,
  `input` json,
  `output` json,
  `checkpoint` json,
  `error` text,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `timeoutAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `saga_instances_sagaId_unique` (`sagaId`),
  INDEX `idx_saga_status` (`status`),
  INDEX `idx_saga_type` (`sagaType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saga_steps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `stepId` varchar(64) NOT NULL,
  `sagaId` varchar(64) NOT NULL,
  `stepIndex` int NOT NULL,
  `stepName` varchar(100) NOT NULL,
  `stepType` enum('action','compensation') NOT NULL DEFAULT 'action',
  `status` enum('pending','running','completed','failed','skipped','compensated') NOT NULL DEFAULT 'pending',
  `input` json,
  `output` json,
  `error` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `saga_steps_stepId_unique` (`stepId`),
  INDEX `idx_saga_steps_sagaId` (`sagaId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saga_dead_letters` (
  `id` int AUTO_INCREMENT NOT NULL,
  `deadLetterId` varchar(64) NOT NULL,
  `sagaId` varchar(64) NOT NULL,
  `sagaType` varchar(100) NOT NULL,
  `failureReason` text NOT NULL,
  `failureType` enum('timeout','max_retries','compensation_failed','unknown') NOT NULL,
  `originalInput` json,
  `lastCheckpoint` json,
  `retryable` boolean NOT NULL DEFAULT true,
  `retryCount` int NOT NULL DEFAULT 0,
  `lastRetryAt` timestamp NULL,
  `resolvedAt` timestamp NULL,
  `resolvedBy` varchar(100),
  `resolution` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `saga_dead_letters_deadLetterId_unique` (`deadLetterId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `processed_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventId` varchar(64) NOT NULL,
  `consumerGroup` varchar(100) NOT NULL,
  `processedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_consumer` (`eventId`, `consumerGroup`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_sampling_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `deviceId` varchar(64) NOT NULL,
  `sensorType` varchar(50) NOT NULL,
  `baseSamplingRateMs` int NOT NULL DEFAULT 1000,
  `currentSamplingRateMs` int NOT NULL DEFAULT 1000,
  `minSamplingRateMs` int NOT NULL DEFAULT 100,
  `maxSamplingRateMs` int NOT NULL DEFAULT 60000,
  `adaptiveEnabled` boolean NOT NULL DEFAULT true,
  `lastAdjustedAt` timestamp NULL,
  `adjustmentReason` varchar(200),
  `priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_sensor` (`deviceId`, `sensorType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `idempotent_records` (
  `id` int AUTO_INCREMENT NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `operationType` varchar(100) NOT NULL,
  `status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  `requestHash` varchar(64),
  `response` json,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotent_records_idempotencyKey_unique` (`idempotencyKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rollback_executions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `executionId` varchar(64) NOT NULL,
  `sagaId` varchar(64),
  `triggerId` varchar(64) NOT NULL,
  `targetType` enum('rule','model','config','firmware') NOT NULL,
  `targetId` varchar(64) NOT NULL,
  `fromVersion` varchar(50) NOT NULL,
  `toVersion` varchar(50) NOT NULL,
  `triggerReason` text,
  `status` enum('pending','executing','completed','failed','partial','cancelled') NOT NULL DEFAULT 'pending',
  `totalDevices` int,
  `completedDevices` int DEFAULT 0,
  `failedDevices` int DEFAULT 0,
  `checkpoint` json,
  `result` json,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rollback_executions_executionId_unique` (`executionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_capacity_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `metricId` varchar(64) NOT NULL,
  `metricType` enum('kafka_lag','db_connections','memory_usage','cpu_usage','queue_depth') NOT NULL,
  `componentName` varchar(100) NOT NULL,
  `currentValue` double NOT NULL,
  `threshold` double NOT NULL,
  `status` enum('normal','warning','critical') NOT NULL DEFAULT 'normal',
  `lastCheckedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_capacity_metrics_metricId_unique` (`metricId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'All v1.9 tables created successfully!' AS result;
