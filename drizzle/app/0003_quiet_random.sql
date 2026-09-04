CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'member' NOT NULL;