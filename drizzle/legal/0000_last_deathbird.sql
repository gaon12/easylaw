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
	`sections` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `law_version_point_in_time_idx` ON `law_version` (`law_id`,`effective_at`);--> statement-breakpoint
CREATE INDEX `law_version_name_idx` ON `law_version` (`name`,`effective_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `law_version_mst_effective_unique` ON `law_version` (`mst`,`effective_at`);--> statement-breakpoint
CREATE TABLE `legal_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`missing_at` integer
);
--> statement-breakpoint
CREATE INDEX `legal_resource_source_missing_idx` ON `legal_resource` (`source`,`missing_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_resource_source_external_unique` ON `legal_resource` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `legal_sync_run` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`received` integer DEFAULT 0 NOT NULL,
	`added` integer DEFAULT 0 NOT NULL,
	`changed` integer DEFAULT 0 NOT NULL,
	`restored` integer DEFAULT 0 NOT NULL,
	`missing` integer DEFAULT 0 NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `legal_sync_run_source_started_idx` ON `legal_sync_run` (`source`,`started_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `law_fts` USING fts5(
  law_id UNINDEXED,
  name,
  tokenize = 'trigram'
);
--> statement-breakpoint
CREATE TRIGGER `law_fts_insert` AFTER INSERT ON `law_version`
BEGIN
  DELETE FROM `law_fts` WHERE law_id = new.law_id;
  INSERT INTO `law_fts` (law_id, name)
  SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '')
  FROM `law_version` WHERE law_id = new.law_id GROUP BY law_id;
END;
--> statement-breakpoint
CREATE TRIGGER `law_fts_update` AFTER UPDATE OF name, short_name ON `law_version`
BEGIN
  DELETE FROM `law_fts` WHERE law_id = new.law_id;
  INSERT INTO `law_fts` (law_id, name)
  SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '')
  FROM `law_version` WHERE law_id = new.law_id GROUP BY law_id;
END;
--> statement-breakpoint
CREATE TRIGGER `law_fts_delete` AFTER DELETE ON `law_version`
WHEN NOT EXISTS (SELECT 1 FROM `law_version` WHERE law_id = old.law_id)
BEGIN
  DELETE FROM `law_fts` WHERE law_id = old.law_id;
END;
