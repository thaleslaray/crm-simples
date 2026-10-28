CREATE TABLE `conversation_event` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`to_user_id` text,
	`from_user_id` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversation_event_conv_ts_idx` ON `conversation_event` (`conversation_id`,`timestamp`);