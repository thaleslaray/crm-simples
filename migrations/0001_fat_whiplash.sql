CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`phone` text,
	`jid_pn` text,
	`jid_lid` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_phone_unique` ON `contact` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_jid_pn_unique` ON `contact` (`jid_pn`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_jid_lid_unique` ON `contact` (`jid_lid`);--> statement-breakpoint
CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`status` text DEFAULT 'aberta' NOT NULL,
	`assignee_id` text,
	`last_message_at` integer,
	`last_message_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_contact_id_unique` ON `conversation` (`contact_id`);--> statement-breakpoint
CREATE INDEX `conversation_last_message_at_idx` ON `conversation` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`whatsapp_message_id` text,
	`conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`type` text NOT NULL,
	`text` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_external_id_unique` ON `message` (`external_id`);--> statement-breakpoint
CREATE INDEX `message_conversation_ts_idx` ON `message` (`conversation_id`,`timestamp`,`id`);--> statement-breakpoint
CREATE TABLE `webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text,
	`payload` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `webhook_event_pending_idx` ON `webhook_event` (`processed_at`);