CREATE TABLE `legal_detail_revision_check` (
	`revision_id` text PRIMARY KEY NOT NULL,
	`baseline_revision_id` text,
	`state` text NOT NULL,
	`unchanged` integer NOT NULL,
	`changed` integer NOT NULL,
	`added` integer NOT NULL,
	`removed` integer NOT NULL,
	`issues` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `legal_resource_detail_revision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `legal_detail_check_state_idx` ON `legal_detail_revision_check` (`state`,`checked_at`);