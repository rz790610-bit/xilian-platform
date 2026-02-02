ALTER TABLE `graph_nodes` MODIFY COLUMN `properties` json;--> statement-breakpoint
ALTER TABLE `knowledge_points` MODIFY COLUMN `tags` json;--> statement-breakpoint
ALTER TABLE `knowledge_points` MODIFY COLUMN `entities` json;--> statement-breakpoint
ALTER TABLE `knowledge_points` MODIFY COLUMN `relations` json;