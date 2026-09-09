CREATE TABLE `upload_rendition_gloss_evidence` (
	`sentence_id` text PRIMARY KEY NOT NULL,
	`definition_source` text NOT NULL,
	`definition_id` text NOT NULL,
	`term` text NOT NULL,
	`definition` text NOT NULL,
	`definition_hash` text NOT NULL,
	`source_label` text NOT NULL,
	FOREIGN KEY (`sentence_id`) REFERENCES `upload_rendition_sentence`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_rendition_gloss_definition_idx` ON `upload_rendition_gloss_evidence` (`definition_source`,`definition_id`);