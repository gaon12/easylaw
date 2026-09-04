CREATE TABLE `api_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`params_hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_cache_key_unique` ON `api_cache` (`endpoint`,`params_hash`);--> statement-breakpoint
CREATE TABLE `generation_job` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`level` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`claimed_by` text,
	`heartbeat_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_job_status_idx` ON `generation_job` (`status`,`heartbeat_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `generation_job_variant_unique` ON `generation_job` (`judgment_id`,`level`,`prompt_version`);--> statement-breakpoint
CREATE TABLE `judgment` (
	`id` text PRIMARY KEY NOT NULL,
	`case_no_canonical` text NOT NULL,
	`case_no_display` text NOT NULL,
	`case_name` text,
	`court` text,
	`decided_at` integer,
	`case_type` text,
	`outcome` text DEFAULT 'unknown' NOT NULL,
	`source` text NOT NULL,
	`source_url` text,
	`fetched_at` integer,
	`text_cached_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `judgment_decided_at_idx` ON `judgment` (`decided_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `judgment_case_no_unique` ON `judgment` (`case_no_canonical`);--> statement-breakpoint
CREATE TABLE `judgment_span` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`para_idx` integer NOT NULL,
	`sent_idx` integer NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `judgment_span_judgment_idx` ON `judgment_span` (`judgment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `judgment_span_position_unique` ON `judgment_span` (`judgment_id`,`para_idx`,`sent_idx`);--> statement-breakpoint
CREATE TABLE `lookup_miss` (
	`case_no_canonical` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_tried_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lookup_miss_last_tried_idx` ON `lookup_miss` (`last_tried_at`);--> statement-breakpoint
CREATE TABLE `node_span` (
	`structure_node_id` text NOT NULL,
	`span_id` text NOT NULL,
	PRIMARY KEY(`structure_node_id`, `span_id`),
	FOREIGN KEY (`structure_node_id`) REFERENCES `structure_node`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`span_id`) REFERENCES `judgment_span`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `node_span_span_idx` ON `node_span` (`span_id`);--> statement-breakpoint
CREATE TABLE `party` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `party_judgment_idx` ON `party` (`judgment_id`);--> statement-breakpoint
CREATE TABLE `rendition` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`level` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`review_state` text DEFAULT 'none' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rendition_lookup_idx` ON `rendition` (`judgment_id`,`level`);--> statement-breakpoint
CREATE UNIQUE INDEX `rendition_variant_unique` ON `rendition` (`judgment_id`,`level`,`prompt_version`);--> statement-breakpoint
CREATE TABLE `rendition_sentence` (
	`id` text PRIMARY KEY NOT NULL,
	`rendition_id` text NOT NULL,
	`order_idx` integer NOT NULL,
	`role` text DEFAULT 'body' NOT NULL,
	`text` text NOT NULL,
	`structure_node_id` text,
	`confidence` text NOT NULL,
	`check_reason` text,
	FOREIGN KEY (`rendition_id`) REFERENCES `rendition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`structure_node_id`) REFERENCES `structure_node`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rendition_sentence_rendition_idx` ON `rendition_sentence` (`rendition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rendition_sentence_order_unique` ON `rendition_sentence` (`rendition_id`,`order_idx`);--> statement-breakpoint
CREATE TABLE `structure_node` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_on` integer,
	`order_idx` integer NOT NULL,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `structure_node_judgment_idx` ON `structure_node` (`judgment_id`,`order_idx`);--> statement-breakpoint
CREATE TABLE `term_gloss` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`term` text NOT NULL,
	`generic_def` text,
	`generic_source` text,
	`contextual_def` text,
	`span_id` text,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`span_id`) REFERENCES `judgment_span`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `term_gloss_unique` ON `term_gloss` (`judgment_id`,`term`);