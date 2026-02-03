-- 设备台账扩展表迁移脚本
-- 仅创建新增的表，不影响现有表

-- 设备维护记录表
CREATE TABLE IF NOT EXISTS `device_maintenance_records` (
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

-- 设备备件库存表
CREATE TABLE IF NOT EXISTS `device_spare_parts` (
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

-- 设备运行日志表
CREATE TABLE IF NOT EXISTS `device_operation_logs` (
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

-- 设备告警表
CREATE TABLE IF NOT EXISTS `device_alerts` (
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

-- 设备 KPI 指标表
CREATE TABLE IF NOT EXISTS `device_kpis` (
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

-- 异常检测结果表
CREATE TABLE IF NOT EXISTS `anomaly_detections` (
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

-- 诊断规则表
CREATE TABLE IF NOT EXISTS `diagnosis_rules` (
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

-- 诊断任务表
CREATE TABLE IF NOT EXISTS `diagnosis_tasks` (
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
