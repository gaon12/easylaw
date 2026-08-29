CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text,
	`action` text NOT NULL,
	`target` text,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `upload` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`filename` text,
	`doc_hash` text NOT NULL,
	`char_count` integer NOT NULL,
	`case_no_canonical` text,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`masked_at` integer,
	`retention_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_user_idx` ON `upload` (`user_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `upload_retention_idx` ON `upload` (`retention_until`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_user_hash_unique` ON `upload` (`user_id`,`doc_hash`);--> statement-breakpoint
CREATE TABLE `upload_mask` (
	`upload_id` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_mask_unique` ON `upload_mask` (`upload_id`,`kind`);--> statement-breakpoint
CREATE TABLE `upload_span` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`para_idx` integer NOT NULL,
	`sent_idx` integer NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_span_order_idx` ON `upload_span` (`upload_id`,`para_idx`,`sent_idx`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`owner_key_hash` text NOT NULL,
	`settings` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_owner_key_unique` ON `user` (`owner_key_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);