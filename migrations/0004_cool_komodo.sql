CREATE TABLE `connection_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`disconnect_type` text,
	`last_disconnect_reason` text,
	`updated_at` integer NOT NULL
);
