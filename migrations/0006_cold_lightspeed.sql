CREATE TABLE `quick_reply` (
	`id` text PRIMARY KEY NOT NULL,
	`shortcut` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quick_reply_shortcut_unique` ON `quick_reply` (`shortcut`);