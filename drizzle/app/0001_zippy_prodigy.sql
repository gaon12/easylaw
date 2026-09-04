CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_expires_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token_hash`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`password_hash` text,
	`owner_key_hash` text,
	`settings` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
-- 손으로 고침: drizzle-kit이 아직 없는 `password_hash`를 옛 테이블에서 읽으려 해서 실패했다.
-- 새로 생기는 컬럼이므로 기존 행에서는 NULL이 맞다. 가입한 사용자가 아직 없다.
INSERT INTO `__new_user`("id", "email", "password_hash", "owner_key_hash", "settings", "created_at", "last_seen_at") SELECT "id", "email", NULL, "owner_key_hash", "settings", "created_at", "last_seen_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);