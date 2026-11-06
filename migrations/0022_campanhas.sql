CREATE TABLE `campaign` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`product_id` text NOT NULL,
	`channel` text NOT NULL,
	`code` text NOT NULL,
	`message` text NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_code_idx` ON `campaign` (`code`);--> statement-breakpoint
ALTER TABLE `connection_state` ADD `phone` text;