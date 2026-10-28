CREATE TABLE `instance_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_secret` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`created_at` integer NOT NULL
);
