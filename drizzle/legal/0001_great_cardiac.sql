CREATE TABLE `legal_resource_detail` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`detail_key` text NOT NULL,
	`payload` blob NOT NULL,
	`payload_hash` text NOT NULL,
	`list_payload_hash` text NOT NULL,
	`encoding` text DEFAULT 'gzip-json' NOT NULL,
	`original_bytes` integer NOT NULL,
	`stored_bytes` integer NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `legal_resource_detail_source_fetched_idx` ON `legal_resource_detail` (`source`,`fetched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_resource_detail_source_key_unique` ON `legal_resource_detail` (`source`,`detail_key`);--> statement-breakpoint
ALTER TABLE `legal_resource` ADD `detail_key` text;--> statement-breakpoint
ALTER TABLE `legal_sync_run` ADD `detail_received` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_sync_run` ADD `detail_added` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_sync_run` ADD `detail_changed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_sync_run` ADD `detail_failed` integer DEFAULT 0 NOT NULL;