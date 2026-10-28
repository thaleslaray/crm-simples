CREATE TABLE `funnel` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `funnel_card` (
	`funnel_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`funnel_id`, `contact_id`),
	FOREIGN KEY (`funnel_id`) REFERENCES `funnel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `funnel_stage`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `funnel_card_stage_idx` ON `funnel_card` (`stage_id`,`position`);--> statement-breakpoint
CREATE INDEX `funnel_card_contact_idx` ON `funnel_card` (`contact_id`);--> statement-breakpoint
CREATE TABLE `funnel_stage` (
	`id` text PRIMARY KEY NOT NULL,
	`funnel_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`funnel_id`) REFERENCES `funnel`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `funnel_stage_funnel_idx` ON `funnel_stage` (`funnel_id`,`position`);