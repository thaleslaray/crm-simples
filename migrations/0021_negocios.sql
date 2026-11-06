CREATE TABLE `deal` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`funnel_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`position` integer NOT NULL,
	`product_id` text,
	`value_cents` integer,
	`status` text DEFAULT 'aberto' NOT NULL,
	`lost_reason` text,
	`lost_note` text,
	`origin_campaign_id` text,
	`origin_kind` text,
	`source_message_id` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	`closed_by_id` text,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`funnel_id`) REFERENCES `funnel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `funnel_stage`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closed_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deal_stage_idx` ON `deal` (`stage_id`,`position`);--> statement-breakpoint
CREATE INDEX `deal_contact_idx` ON `deal` (`contact_id`);--> statement-breakpoint
CREATE INDEX `deal_funnel_status_idx` ON `deal` (`funnel_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `deal_source_message_idx` ON `deal` (`source_message_id`);--> statement-breakpoint
DROP TABLE `funnel_card`;