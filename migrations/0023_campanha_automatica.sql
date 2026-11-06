ALTER TABLE `conversation_event` ADD `campaign_name` text;--> statement-breakpoint
ALTER TABLE `conversation_event` ADD `campaign_action` text;--> statement-breakpoint
ALTER TABLE `conversation_event` ADD `source_message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_event_source_idx` ON `conversation_event` (`type`,`source_message_id`);