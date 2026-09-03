CREATE TABLE `law_article` (
	`id` text PRIMARY KEY NOT NULL,
	`law_version_id` text NOT NULL,
	`article_no` text NOT NULL,
	`branch_no` text DEFAULT '' NOT NULL,
	`title` text,
	`body` text,
	`effective_at` integer,
	`clauses` text NOT NULL,
	`order_idx` integer NOT NULL,
	FOREIGN KEY (`law_version_id`) REFERENCES `law_version`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `law_article_version_idx` ON `law_article` (`law_version_id`,`order_idx`);--> statement-breakpoint
CREATE UNIQUE INDEX `law_article_unique` ON `law_article` (`law_version_id`,`article_no`,`branch_no`);--> statement-breakpoint
CREATE TABLE `law_version` (
	`id` text PRIMARY KEY NOT NULL,
	`law_id` text NOT NULL,
	`mst` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`kind` text,
	`ministry` text,
	`promulgated_at` integer,
	`effective_at` integer,
	`history_code` text,
	`body_fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `law_version_point_in_time_idx` ON `law_version` (`law_id`,`effective_at`);--> statement-breakpoint
CREATE INDEX `law_version_name_idx` ON `law_version` (`name`,`effective_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `law_version_mst_effective_unique` ON `law_version` (`mst`,`effective_at`);