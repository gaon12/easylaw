CREATE TABLE `content_report` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`judgment_id` text NOT NULL,
	`source_revision_id` text NOT NULL,
	`content_release_id` text NOT NULL,
	`rendition_id` text NOT NULL,
	`sentence_id` text NOT NULL,
	`reason` text NOT NULL,
	`detail` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`handled_by` text,
	`handled_at` integer,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`handled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `content_report_status_idx` ON `content_report` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_report_sentence_idx` ON `content_report` (`sentence_id`,`status`);