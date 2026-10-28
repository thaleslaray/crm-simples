CREATE TABLE `uazapi_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`token_enc` text NOT NULL,
	`token_last4` text NOT NULL,
	`updated_at` integer NOT NULL
);
