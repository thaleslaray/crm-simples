PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text,
	`whatsapp_message_id` text,
	`conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`status` text,
	`sent_by_id` text,
	`type` text NOT NULL,
	`text` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_message`("id", "external_id", "whatsapp_message_id", "conversation_id", "direction", "type", "text", "timestamp") SELECT "id", "external_id", "whatsapp_message_id", "conversation_id", "direction", "type", "text", "timestamp" FROM `message`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
ALTER TABLE `__new_message` RENAME TO `message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `message_external_id_unique` ON `message` (`external_id`);--> statement-breakpoint
CREATE INDEX `message_conversation_ts_idx` ON `message` (`conversation_id`,`timestamp`,`id`);