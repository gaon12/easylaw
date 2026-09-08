CREATE TABLE `content_release` (
	`id` text PRIMARY KEY NOT NULL,
	`judgment_id` text NOT NULL,
	`source_revision_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`judgment_id`) REFERENCES `judgment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_revision_id`) REFERENCES `judgment_revision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_release_judgment_idx` ON `content_release` (`judgment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_release_rendition` (
	`release_id` text NOT NULL,
	`level` text NOT NULL,
	`rendition_id` text NOT NULL,
	PRIMARY KEY(`release_id`, `level`),
	FOREIGN KEY (`release_id`) REFERENCES `content_release`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rendition_id`) REFERENCES `rendition`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `content_release_rendition_idx` ON `content_release_rendition` (`rendition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_release_rendition_unique` ON `content_release_rendition` (`release_id`,`rendition_id`);--> statement-breakpoint
ALTER TABLE `judgment` ADD `current_content_release_id` text;--> statement-breakpoint
CREATE TEMP TABLE `_content_release_backfill` AS
SELECT
	`judgment`.`id` AS `judgment_id`,
	`judgment`.`current_revision_id` AS `source_revision_id`,
	lower(
		hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
		substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', abs(random()) % 4 + 1, 1) ||
		substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
	) AS `release_id`
FROM `judgment`
WHERE `judgment`.`current_revision_id` IS NOT NULL
	AND EXISTS (
		SELECT 1 FROM `rendition`
		WHERE `rendition`.`judgment_id` = `judgment`.`id`
			AND `rendition`.`source_revision_id` = `judgment`.`current_revision_id`
			AND `rendition`.`review_state` = 'approved'
	);--> statement-breakpoint
INSERT INTO `content_release` (`id`, `judgment_id`, `source_revision_id`, `action`)
SELECT `release_id`, `judgment_id`, `source_revision_id`, 'publish'
FROM `_content_release_backfill`;--> statement-breakpoint
INSERT INTO `content_release_rendition` (`release_id`, `level`, `rendition_id`)
SELECT `ranked`.`release_id`, `ranked`.`level`, `ranked`.`rendition_id`
FROM (
	SELECT
		`backfill`.`release_id`,
		`rendition`.`level`,
		`rendition`.`id` AS `rendition_id`,
		row_number() OVER (
			PARTITION BY `rendition`.`judgment_id`, `rendition`.`level`
			ORDER BY `rendition`.`created_at` DESC, `rendition`.`id` DESC
		) AS `position`
	FROM `rendition`
	INNER JOIN `_content_release_backfill` AS `backfill`
		ON `backfill`.`judgment_id` = `rendition`.`judgment_id`
		AND `backfill`.`source_revision_id` = `rendition`.`source_revision_id`
	WHERE `rendition`.`review_state` = 'approved'
) AS `ranked`
WHERE `ranked`.`position` = 1;--> statement-breakpoint
UPDATE `judgment`
SET `current_content_release_id` = (
	SELECT `release_id` FROM `_content_release_backfill`
	WHERE `_content_release_backfill`.`judgment_id` = `judgment`.`id`
)
WHERE `id` IN (SELECT `judgment_id` FROM `_content_release_backfill`);--> statement-breakpoint
DROP TABLE `_content_release_backfill`;
