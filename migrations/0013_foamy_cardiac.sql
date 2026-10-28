CREATE TABLE `contact_label` (
	`contact_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `label_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `label`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_label_label_idx` ON `contact_label` (`label_id`);--> statement-breakpoint
CREATE TABLE `label` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `label_name_nocase_idx` ON `label` (lower("name"));