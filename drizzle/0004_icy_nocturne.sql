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
