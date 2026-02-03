CREATE TABLE `anomaly_detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`detectionId` varchar(64) NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`algorithmType` enum('zscore','iqr','mad','isolation_forest','custom') NOT NULL DEFAULT 'zscore',
	`windowSize` int DEFAULT 60,
	`threshold` int,
	`currentValue` int,
	`expectedValue` int,
	`deviation` int,
	`score` int,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`status` enum('open','acknowledged','resolved','false_positive') NOT NULL DEFAULT 'open',
	`acknowledgedBy` varchar(100),
	`acknowledgedAt` timestamp,
	`resolvedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anomaly_detections_id` PRIMARY KEY(`id`),
	CONSTRAINT `anomaly_detections_detectionId_unique` UNIQUE(`detectionId`)
);
--> statement-breakpoint
CREATE TABLE `data_aggregations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`metricName` varchar(100) NOT NULL,
	`windowStart` timestamp NOT NULL,
	`windowEnd` timestamp NOT NULL,
	`count` int NOT NULL,
	`sum` double NOT NULL,
	`min` double NOT NULL,
	`max` double NOT NULL,
	`avg` double NOT NULL,
	`stdDev` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_aggregations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`sensorId` varchar(64),
	`alertType` enum('threshold','anomaly','offline','error','maintenance_due','warranty_expiry','custom') NOT NULL,
	`title` varchar(200) NOT NULL,
	`message` text,
	`severity` enum('info','warning','error','critical') NOT NULL DEFAULT 'warning',
	`status` enum('active','acknowledged','resolved','suppressed') NOT NULL DEFAULT 'active',
	`triggerValue` double,
	`thresholdValue` double,
	`acknowledgedBy` varchar(100),
	`acknowledgedAt` timestamp,
	`resolvedBy` varchar(100),
	`resolvedAt` timestamp,
	`resolution` text,
	`escalationLevel` int DEFAULT 0,
	`notificationsSent` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_alerts_alertId_unique` UNIQUE(`alertId`)
);
--> statement-breakpoint
CREATE TABLE `device_kpis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`periodType` enum('hourly','daily','weekly','monthly') NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`availability` double,
	`performance` double,
	`quality` double,
	`oee` double,
	`runningTime` int,
	`downtime` int,
	`idleTime` int,
	`plannedDowntime` int,
	`unplannedDowntime` int,
	`mtbf` double,
	`mttr` double,
	`failureCount` int DEFAULT 0,
	`productionCount` int,
	`defectCount` int,
	`energyConsumption` double,
	`energyEfficiency` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_kpis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_maintenance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recordId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`maintenanceType` enum('preventive','corrective','predictive','emergency','calibration','inspection') NOT NULL DEFAULT 'preventive',
	`title` varchar(200) NOT NULL,
	`description` text,
	`scheduledDate` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`status` enum('scheduled','in_progress','completed','cancelled','overdue') NOT NULL DEFAULT 'scheduled',
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`assignedTo` varchar(100),
	`performedBy` varchar(100),
	`cost` double,
	`currency` varchar(10) DEFAULT 'CNY',
	`parts` json,
	`findings` text,
	`recommendations` text,
	`attachments` json,
	`nextMaintenanceDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_maintenance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_maintenance_records_recordId_unique` UNIQUE(`recordId`)
);
--> statement-breakpoint
CREATE TABLE `device_operation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`logId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`operationType` enum('start','stop','restart','config_change','firmware_update','calibration','mode_change','error','recovery') NOT NULL,
	`previousState` varchar(50),
	`newState` varchar(50),
	`operatedBy` varchar(100),
	`reason` text,
	`details` json,
	`success` boolean NOT NULL DEFAULT true,
	`errorMessage` text,
	`duration` int,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_operation_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_operation_logs_logId_unique` UNIQUE(`logId`)
);
--> statement-breakpoint
CREATE TABLE `device_spare_parts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partId` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`partNumber` varchar(100),
	`category` varchar(50),
	`compatibleDeviceTypes` json,
	`manufacturer` varchar(100),
	`supplier` varchar(100),
	`quantity` int NOT NULL DEFAULT 0,
	`minQuantity` int DEFAULT 1,
	`maxQuantity` int,
	`unitPrice` double,
	`currency` varchar(10) DEFAULT 'CNY',
	`location` varchar(100),
	`status` enum('in_stock','low_stock','out_of_stock','ordered','discontinued') NOT NULL DEFAULT 'in_stock',
	`lastRestockedAt` timestamp,
	`expiryDate` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `device_spare_parts_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_spare_parts_partId_unique` UNIQUE(`partId`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('agv','rtg','qc','asc','conveyor','pump','motor','sensor_hub','gateway','other') NOT NULL DEFAULT 'other',
	`model` varchar(100),
	`manufacturer` varchar(100),
	`serialNumber` varchar(100),
	`location` varchar(255),
	`department` varchar(100),
	`status` enum('online','offline','maintenance','error','unknown') NOT NULL DEFAULT 'unknown',
	`lastHeartbeat` timestamp,
	`installDate` timestamp,
	`warrantyExpiry` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_deviceId_unique` UNIQUE(`deviceId`)
);
--> statement-breakpoint
CREATE TABLE `diagnosis_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`category` varchar(50),
	`deviceType` varchar(50),
	`sensorType` varchar(50),
	`conditionExpr` text NOT NULL,
	`actionType` enum('alert','notification','workflow','auto_fix') NOT NULL DEFAULT 'alert',
	`actionConfig` json,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`isActive` boolean NOT NULL DEFAULT true,
	`priority` int DEFAULT 5,
	`triggerCount` int DEFAULT 0,
	`lastTriggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diagnosis_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `diagnosis_rules_ruleId_unique` UNIQUE(`ruleId`)
);
--> statement-breakpoint
CREATE TABLE `diagnosis_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`deviceId` varchar(64),
	`sensorId` varchar(64),
	`ruleId` varchar(64),
	`anomalyId` varchar(64),
	`taskType` enum('routine','anomaly','manual','scheduled') NOT NULL DEFAULT 'routine',
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` int DEFAULT 5,
	`inputData` json,
	`result` json,
	`error` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diagnosis_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `diagnosis_tasks_taskId_unique` UNIQUE(`taskId`)
);
--> statement-breakpoint
CREATE TABLE `event_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`topic` varchar(100) NOT NULL,
	`eventType` varchar(50) NOT NULL,
	`source` varchar(100),
	`deviceId` varchar(64),
	`sensorId` varchar(64),
	`severity` enum('info','warning','error','critical') NOT NULL DEFAULT 'info',
	`payload` json,
	`processed` boolean NOT NULL DEFAULT false,
	`processedAt` timestamp,
	`processedBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_logs_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `kb_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`userId` int,
	`isPublic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kb_collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `kb_collections_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `kb_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`storageUrl` varchar(500),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`processedAt` timestamp,
	`chunksCount` int DEFAULT 0,
	`entitiesCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kb_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`tags` json,
	`source` varchar(255),
	`entities` json,
	`relations` json,
	`embedding` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kb_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_edges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`edgeId` varchar(100) NOT NULL,
	`sourceNodeId` varchar(100) NOT NULL,
	`targetNodeId` varchar(100) NOT NULL,
	`label` varchar(100) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'related_to',
	`weight` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_edges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kg_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`nodeId` varchar(100) NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'entity',
	`properties` json,
	`x` int,
	`y` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kg_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`userId` int,
	`modelId` varchar(100) NOT NULL,
	`title` varchar(255),
	`messageCount` int NOT NULL DEFAULT 0,
	`totalTokens` int DEFAULT 0,
	`status` enum('active','archived','deleted') NOT NULL DEFAULT 'active',
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_conversations_conversationId_unique` UNIQUE(`conversationId`)
);
--> statement-breakpoint
CREATE TABLE `model_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`evaluationId` varchar(64) NOT NULL,
	`userId` int,
	`modelId` varchar(100) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`datasetPath` varchar(500),
	`datasetSize` int,
	`evaluationType` enum('accuracy','perplexity','bleu','rouge','custom') NOT NULL DEFAULT 'accuracy',
	`results` json,
	`error` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_evaluations_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_evaluations_evaluationId_unique` UNIQUE(`evaluationId`)
);
--> statement-breakpoint
CREATE TABLE `model_fine_tune_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`userId` int,
	`baseModelId` varchar(100) NOT NULL,
	`outputModelId` varchar(100),
	`name` varchar(200) NOT NULL,
	`description` text,
	`status` enum('pending','preparing','training','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`datasetPath` varchar(500),
	`datasetSize` int,
	`config` json,
	`metrics` json,
	`error` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_fine_tune_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_fine_tune_tasks_taskId_unique` UNIQUE(`taskId`)
);
--> statement-breakpoint
CREATE TABLE `model_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`role` enum('system','user','assistant','tool') NOT NULL,
	`content` text NOT NULL,
	`tokens` int,
	`latency` int,
	`attachments` json,
	`toolCalls` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_messages_messageId_unique` UNIQUE(`messageId`)
);
--> statement-breakpoint
CREATE TABLE `model_usage_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`logId` varchar(64) NOT NULL,
	`userId` int,
	`modelId` varchar(100) NOT NULL,
	`conversationId` varchar(64),
	`requestType` enum('chat','completion','embedding','inference') NOT NULL,
	`inputTokens` int,
	`outputTokens` int,
	`latency` int,
	`status` enum('success','error','timeout') NOT NULL,
	`error` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_usage_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_usage_logs_logId_unique` UNIQUE(`logId`)
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` varchar(100) NOT NULL,
	`name` varchar(100) NOT NULL,
	`displayName` varchar(200),
	`type` enum('llm','embedding','label','diagnostic','vision','audio') NOT NULL,
	`provider` enum('ollama','openai','anthropic','local','custom') NOT NULL DEFAULT 'ollama',
	`size` varchar(50),
	`parameters` varchar(50),
	`quantization` varchar(20),
	`description` text,
	`status` enum('available','loaded','downloading','error') NOT NULL DEFAULT 'available',
	`downloadProgress` int DEFAULT 0,
	`isDefault` boolean NOT NULL DEFAULT false,
	`config` json,
	`capabilities` json,
	`metrics` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `models_id` PRIMARY KEY(`id`),
	CONSTRAINT `models_modelId_unique` UNIQUE(`modelId`)
);
--> statement-breakpoint
CREATE TABLE `sensor_aggregates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`period` enum('1m','5m','1h','1d') NOT NULL,
	`periodStart` timestamp NOT NULL,
	`avgValue` int,
	`minValue` int,
	`maxValue` int,
	`sumValue` int,
	`count` int NOT NULL DEFAULT 0,
	`stdDev` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sensor_aggregates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sensor_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`value` varchar(50) NOT NULL,
	`numericValue` int,
	`quality` enum('good','uncertain','bad') NOT NULL DEFAULT 'good',
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`metadata` json,
	CONSTRAINT `sensor_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sensors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('vibration','temperature','pressure','current','voltage','speed','position','humidity','flow','level','other') NOT NULL DEFAULT 'other',
	`unit` varchar(20),
	`minValue` int,
	`maxValue` int,
	`warningThreshold` int,
	`criticalThreshold` int,
	`samplingRate` int DEFAULT 1000,
	`status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
	`lastValue` varchar(50),
	`lastReadingAt` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sensors_id` PRIMARY KEY(`id`),
	CONSTRAINT `sensors_sensorId_unique` UNIQUE(`sensorId`)
);
--> statement-breakpoint
CREATE TABLE `telemetry_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`sensorId` varchar(64) NOT NULL,
	`metricName` varchar(100) NOT NULL,
	`value` double NOT NULL,
	`unit` varchar(20),
	`quality` enum('good','uncertain','bad') DEFAULT 'good',
	`timestamp` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telemetry_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topo_edges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`edgeId` varchar(64) NOT NULL,
	`sourceNodeId` varchar(64) NOT NULL,
	`targetNodeId` varchar(64) NOT NULL,
	`type` enum('data','dependency','control') NOT NULL DEFAULT 'data',
	`label` varchar(100),
	`config` json,
	`status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topo_edges_id` PRIMARY KEY(`id`),
	CONSTRAINT `topo_edges_edgeId_unique` UNIQUE(`edgeId`)
);
--> statement-breakpoint
CREATE TABLE `topo_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`userId` int,
	`isDefault` boolean NOT NULL DEFAULT false,
	`layoutData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topo_layouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topo_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nodeId` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('source','plugin','engine','agent','output','database','service') NOT NULL,
	`icon` varchar(20) DEFAULT '📦',
	`description` text,
	`status` enum('online','offline','error','maintenance') NOT NULL DEFAULT 'offline',
	`x` int NOT NULL DEFAULT 0,
	`y` int NOT NULL DEFAULT 0,
	`config` json,
	`metrics` json,
	`lastHeartbeat` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topo_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `topo_nodes_nodeId_unique` UNIQUE(`nodeId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
