CREATE TABLE `documents` (
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
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_edges` (
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
	CONSTRAINT `graph_edges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graph_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`nodeId` varchar(100) NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'entity',
	`properties` json DEFAULT ('{}'),
	`x` int,
	`y` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `graph_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`userId` int,
	`isPublic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_collections_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`tags` json DEFAULT ('[]'),
	`source` varchar(255),
	`entities` json DEFAULT ('[]'),
	`relations` json DEFAULT ('[]'),
	`embedding` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_points_id` PRIMARY KEY(`id`)
);
