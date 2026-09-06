CREATE TABLE `upload_rendition_audio` (
	`sentence_id` text PRIMARY KEY NOT NULL,
	`voice` text NOT NULL,
	`model` text NOT NULL,
	`format` text NOT NULL,
	`bytes` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`sentence_id`) REFERENCES `upload_rendition_sentence`(`id`) ON UPDATE no action ON DELETE cascade
);
