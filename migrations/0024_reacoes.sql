CREATE TABLE `message_reaction` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`side` text NOT NULL,
	`emoji` text NOT NULL,
	`user_id` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_reaction_side_idx` ON `message_reaction` (`message_id`,`side`);--> statement-breakpoint
CREATE INDEX `message_whatsapp_id_idx` ON `message` (`whatsapp_message_id`);