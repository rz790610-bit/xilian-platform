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
