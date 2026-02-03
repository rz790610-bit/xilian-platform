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
