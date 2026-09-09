CREATE TABLE `legal_resource_file` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`format` text NOT NULL,
	`source_path` text NOT NULL,
	`local_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`bytes` integer NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_resource_file_key_unique` ON `legal_resource_file` (`source`,`external_id`,`format`);