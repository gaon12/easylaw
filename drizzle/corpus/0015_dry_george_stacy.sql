CREATE TABLE `structure_generation_job` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`source_revision_id` text,
	`prompt_version` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`claimed_by` text,
	`heartbeat_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `judgment_revision`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `structure_generation_job_status_idx` ON `structure_generation_job` (`status`,`heartbeat_at`);--> statement-breakpoint
CREATE INDEX `structure_generation_job_revision_idx` ON `structure_generation_job` (`source_revision_id`,`prompt_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `structure_generation_job_variant_unique` ON `structure_generation_job` (`judgment_id`,`prompt_version`);