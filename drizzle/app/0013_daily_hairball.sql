PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`password_hash` text,
	`nickname` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`settings` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "email", "password_hash", "nickname", "role", "settings", "created_at", "last_seen_at") SELECT "id", "email", "password_hash", "nickname", CASE WHEN "role" = 'member' THEN 'viewer' ELSE "role" END, "settings", "created_at", "last_seen_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
