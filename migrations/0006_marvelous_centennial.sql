CREATE TABLE `reconciliation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_run_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `message_media_pending_idx` ON `message` (`timestamp`) WHERE "message"."media_status" = 'pending';