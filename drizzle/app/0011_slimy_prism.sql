CREATE TABLE `upload_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`content_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `upload`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_revision_upload_idx` ON `upload_revision` (`upload_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_revision_content_unique` ON `upload_revision` (`upload_id`,`content_hash`);--> statement-breakpoint
DROP INDEX `upload_mask_unique`;--> statement-breakpoint
ALTER TABLE `upload_mask` ADD `revision_id` text REFERENCES upload_revision(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `upload_mask_upload_idx` ON `upload_mask` (`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_mask_unique` ON `upload_mask` (`revision_id`,`kind`);--> statement-breakpoint
ALTER TABLE `upload` ADD `current_revision_id` text;--> statement-breakpoint
ALTER TABLE `upload_generation_job` ADD `source_revision_id` text REFERENCES upload_revision(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `upload_generation_job_revision_idx` ON `upload_generation_job` (`source_revision_id`,`level`);--> statement-breakpoint
ALTER TABLE `upload_rendition` ADD `source_revision_id` text REFERENCES upload_revision(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `upload_rendition_revision_idx` ON `upload_rendition` (`source_revision_id`,`level`);--> statement-breakpoint
ALTER TABLE `upload_span` ADD `revision_id` text REFERENCES upload_revision(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `upload_span_revision_idx` ON `upload_span` (`revision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_span_position_unique` ON `upload_span` (`revision_id`,`para_idx`,`sent_idx`);--> statement-breakpoint
ALTER TABLE `upload_structure_node` ADD `source_revision_id` text REFERENCES upload_revision(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `upload_structure_node_revision_idx` ON `upload_structure_node` (`source_revision_id`,`prompt_version`);--> statement-breakpoint

-- 기존 업로드는 마스킹 원문을 다시 조합해 해시를 지어내지 않고 UUID legacy 판에 고정한다.
INSERT INTO `upload_revision` (`id`, `upload_id`, `content_hash`, `created_at`)
SELECT
	lower(
		hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
		substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
		hex(randomblob(6))
	),
	`id`,
	NULL,
	coalesce(`masked_at`, `uploaded_at`)
FROM `upload`;--> statement-breakpoint

UPDATE `upload`
SET `current_revision_id` = (
	SELECT `upload_revision`.`id`
	FROM `upload_revision`
	WHERE `upload_revision`.`upload_id` = `upload`.`id`
	ORDER BY `upload_revision`.`created_at` DESC
	LIMIT 1
);--> statement-breakpoint

UPDATE `upload_span`
SET `revision_id` = (
	SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_span`.`upload_id`
);--> statement-breakpoint

UPDATE `upload_mask`
SET `revision_id` = (
	SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_mask`.`upload_id`
);--> statement-breakpoint

-- 기존 파생물도 legacy 판에 묶고 캐시 키에 원문판 UUID를 붙인다.
UPDATE `upload_structure_node`
SET
	`source_revision_id` = (
		SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_structure_node`.`upload_id`
	),
	`prompt_version` = `prompt_version` || '::source:' || (
		SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_structure_node`.`upload_id`
	);--> statement-breakpoint

UPDATE `upload_rendition`
SET
	`source_revision_id` = (
		SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_rendition`.`upload_id`
	),
	`prompt_version` = `prompt_version` || '::source:' || (
		SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_rendition`.`upload_id`
	);--> statement-breakpoint

UPDATE `upload_generation_job`
SET
	`source_revision_id` = (
		SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_generation_job`.`upload_id`
	),
	`prompt_version` = `prompt_version` || '::source:' || (
		SELECT `current_revision_id` FROM `upload` WHERE `upload`.`id` = `upload_generation_job`.`upload_id`
	);
