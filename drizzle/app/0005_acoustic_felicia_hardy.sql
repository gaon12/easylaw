CREATE TABLE `upload_generation_job` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`level` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text,
	`claimed_by` text,
	`heartbeat_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_generation_job_status_idx` ON `upload_generation_job` (`status`,`heartbeat_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_generation_job_variant_unique` ON `upload_generation_job` (`upload_id`,`level`,`prompt_version`);--> statement-breakpoint
CREATE TABLE `upload_node_span` (
	`structure_node_id` text NOT NULL,
	`span_id` text NOT NULL,
	PRIMARY KEY(`structure_node_id`, `span_id`),
	FOREIGN KEY (`structure_node_id`) REFERENCES `upload_structure_node`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`span_id`) REFERENCES `upload_span`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_node_span_span_idx` ON `upload_node_span` (`span_id`);--> statement-breakpoint
CREATE TABLE `upload_rendition` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`level` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`review_state` text DEFAULT 'none' NOT NULL,
	`generated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_rendition_lookup_idx` ON `upload_rendition` (`upload_id`,`level`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_rendition_variant_unique` ON `upload_rendition` (`upload_id`,`level`,`prompt_version`);--> statement-breakpoint
CREATE TABLE `upload_rendition_sentence` (
	`id` text PRIMARY KEY NOT NULL,
	`rendition_id` text NOT NULL,
	`order_idx` integer NOT NULL,
	`role` text DEFAULT 'body' NOT NULL,
	`text` text NOT NULL,
	`structure_node_id` text,
	`confidence` text NOT NULL,
	`check_reason` text,
	FOREIGN KEY (`rendition_id`) REFERENCES `upload_rendition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`structure_node_id`) REFERENCES `upload_structure_node`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `upload_rendition_sentence_rendition_idx` ON `upload_rendition_sentence` (`rendition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_rendition_sentence_order_unique` ON `upload_rendition_sentence` (`rendition_id`,`order_idx`);--> statement-breakpoint
CREATE TABLE `upload_structure_node` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_on` integer,
	`order_idx` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_structure_node_upload_idx` ON `upload_structure_node` (`upload_id`,`order_idx`);