CREATE TABLE `legal_resource_detail_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`detail_id` text NOT NULL,
	`payload` blob,
	`payload_hash` text NOT NULL,
	`list_payload_hash` text NOT NULL,
	`encoding` text DEFAULT 'gzip-json' NOT NULL,
	`original_bytes` integer NOT NULL,
	`stored_bytes` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`detail_id`) REFERENCES `legal_resource_detail`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `legal_detail_revision_fetched_idx` ON `legal_resource_detail_revision` (`detail_id`,`fetched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_detail_revision_hash_unique` ON `legal_resource_detail_revision` (`detail_id`,`payload_hash`);--> statement-breakpoint
ALTER TABLE `legal_resource_detail` ADD `current_revision_id` text;--> statement-breakpoint
INSERT INTO `legal_resource_detail_revision`
  (`id`, `detail_id`, `payload`, `payload_hash`, `list_payload_hash`, `encoding`, `original_bytes`, `stored_bytes`, `fetched_at`)
SELECT
  `id`, `id`, NULL, `payload_hash`, `list_payload_hash`, `encoding`, `original_bytes`, `stored_bytes`, `fetched_at`
FROM `legal_resource_detail`;--> statement-breakpoint
UPDATE `legal_resource_detail` SET `current_revision_id` = `id` WHERE `current_revision_id` IS NULL;--> statement-breakpoint
ALTER TABLE `legal_sync_run` ADD `detail_unavailable` integer DEFAULT 0 NOT NULL;
