CREATE TABLE IF NOT EXISTS `kb_collections` (
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

CREATE TABLE IF NOT EXISTS `kb_points` (
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

CREATE TABLE IF NOT EXISTS `kb_documents` (
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

CREATE TABLE IF NOT EXISTS `kg_nodes` (
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

CREATE TABLE IF NOT EXISTS `kg_edges` (
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
