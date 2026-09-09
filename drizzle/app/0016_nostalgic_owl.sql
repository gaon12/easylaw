CREATE TABLE `error_event` (
	`id` text PRIMARY KEY NOT NULL,
	`public_code` text NOT NULL,
	`digest` text,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`request_path` text,
	`method` text,
	`route_path` text,
	`route_type` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `error_event_code_idx` ON `error_event` (`public_code`,`created_at`);--> statement-breakpoint
CREATE INDEX `error_event_digest_idx` ON `error_event` (`digest`,`created_at`);--> statement-breakpoint
CREATE INDEX `error_event_created_idx` ON `error_event` (`created_at`);