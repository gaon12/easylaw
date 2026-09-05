CREATE TABLE `dict_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`word_raw` text NOT NULL,
	`hanja` text,
	`pos` text,
	`category` text,
	`sense_type` text,
	`definition` text NOT NULL,
	`sense_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dict_entry_word_idx` ON `dict_entry` (`word`);--> statement-breakpoint
CREATE INDEX `dict_entry_category_idx` ON `dict_entry` (`word`,`category`);--> statement-breakpoint
CREATE TABLE `dict_source` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`built_at` text,
	`fetched_at` integer NOT NULL,
	`entries` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legal_term` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`hanja` text,
	`definition` text NOT NULL,
	`source` text,
	`dictionary` text
);
--> statement-breakpoint
CREATE INDEX `legal_term_term_idx` ON `legal_term` (`term`);