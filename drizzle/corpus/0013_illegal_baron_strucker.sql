CREATE TABLE `judgment_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`content_hash` text,
	`fetched_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `judgment_revision_judgment_idx` ON `judgment_revision` (`judgment_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `judgment_revision_content_unique` ON `judgment_revision` (`judgment_id`,`content_hash`);--> statement-breakpoint
DROP INDEX `judgment_span_position_unique`;--> statement-breakpoint
ALTER TABLE `judgment_span` ADD `revision_id` text REFERENCES judgment_revision(id);--> statement-breakpoint
CREATE INDEX `judgment_span_revision_idx` ON `judgment_span` (`revision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `judgment_span_position_unique` ON `judgment_span` (`revision_id`,`para_idx`,`sent_idx`);--> statement-breakpoint
ALTER TABLE `generation_job` ADD `source_revision_id` text REFERENCES judgment_revision(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `generation_job_revision_idx` ON `generation_job` (`source_revision_id`,`level`);--> statement-breakpoint
ALTER TABLE `judgment` ADD `current_revision_id` text;--> statement-breakpoint
ALTER TABLE `rendition` ADD `source_revision_id` text REFERENCES judgment_revision(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `rendition_revision_idx` ON `rendition` (`source_revision_id`,`level`);--> statement-breakpoint
ALTER TABLE `structure_node` ADD `source_revision_id` text REFERENCES judgment_revision(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `structure_node_revision_idx` ON `structure_node` (`source_revision_id`,`prompt_version`);--> statement-breakpoint

-- 기존 원문은 내용을 다시 계산해 소급 승인하지 않고, UUID를 가진 legacy 원문판에 고정한다.
INSERT INTO `judgment_revision` (`id`, `judgment_id`, `content_hash`, `fetched_at`)
SELECT
	lower(
		hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
		substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
		hex(randomblob(6))
	),
	`id`,
	NULL,
	coalesce(`text_cached_at`, `fetched_at`, `created_at`)
FROM `judgment`
WHERE `text_cached_at` IS NOT NULL;--> statement-breakpoint

UPDATE `judgment`
SET `current_revision_id` = (
	SELECT `judgment_revision`.`id`
	FROM `judgment_revision`
	WHERE `judgment_revision`.`judgment_id` = `judgment`.`id`
	ORDER BY `judgment_revision`.`created_at` DESC
	LIMIT 1
)
WHERE `text_cached_at` IS NOT NULL;--> statement-breakpoint

UPDATE `judgment_span`
SET `revision_id` = (
	SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `judgment_span`.`judgment_id`
);--> statement-breakpoint

-- 기존 파생물도 그 시점의 legacy 원문판에 묶는다. 캐시 키에 UUID를 넣어 다음 판과 충돌하지 않는다.
UPDATE `structure_node`
SET
	`source_revision_id` = (
		SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `structure_node`.`judgment_id`
	),
	`prompt_version` = `prompt_version` || '::source:' || (
		SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `structure_node`.`judgment_id`
	)
WHERE EXISTS (
	SELECT 1 FROM `judgment`
	WHERE `judgment`.`id` = `structure_node`.`judgment_id`
	AND `judgment`.`current_revision_id` IS NOT NULL
);--> statement-breakpoint

UPDATE `rendition`
SET
	`source_revision_id` = (
		SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `rendition`.`judgment_id`
	),
	`prompt_version` = `prompt_version` || '::source:' || (
		SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `rendition`.`judgment_id`
	)
WHERE EXISTS (
	SELECT 1 FROM `judgment`
	WHERE `judgment`.`id` = `rendition`.`judgment_id`
	AND `judgment`.`current_revision_id` IS NOT NULL
);--> statement-breakpoint

UPDATE `generation_job`
SET
	`source_revision_id` = (
		SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `generation_job`.`judgment_id`
	),
	`prompt_version` = `prompt_version` || '::source:' || (
		SELECT `current_revision_id` FROM `judgment` WHERE `judgment`.`id` = `generation_job`.`judgment_id`
	)
WHERE EXISTS (
	SELECT 1 FROM `judgment`
	WHERE `judgment`.`id` = `generation_job`.`judgment_id`
	AND `judgment`.`current_revision_id` IS NOT NULL
);
