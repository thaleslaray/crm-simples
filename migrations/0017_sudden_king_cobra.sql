CREATE TABLE `uazapi_admin` (
	`id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`admin_token_enc` text NOT NULL,
	`admin_token_last4` text NOT NULL,
	`instance_id` text,
	`instance_name` text,
	`instance_token_enc` text,
	`updated_at` integer NOT NULL
);
