CREATE TABLE `conversation_note` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author_id` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversation_note_conv_idx` ON `conversation_note` (`conversation_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `contact` ADD `email` text;--> statement-breakpoint
ALTER TABLE `contact` ADD `company` text;--> statement-breakpoint
ALTER TABLE `contact` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `contact` ADD `avatar_url` text;--> statement-breakpoint
ALTER TABLE `contact` ADD `avatar_fetched_at` integer;