PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text,
	`whatsapp_message_id` text,
	`conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`status` text,
	`sent_by_id` text,
	`type` text NOT NULL,
	`text` text,
	`timestamp` integer NOT NULL,
	`media_status` text,
	`media_key` text,
	`media_mime` text,
	`media_size` integer,
	`media_name` text,
	`extra` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_message`("id", "external_id", "whatsapp_message_id", "conversation_id", "direction", "type", "text", "timestamp", "media_status", "media_key", "media_mime", "media_size", "media_name", "extra") SELECT "id", "external_id", "whatsapp_message_id", "conversation_id", "direction", "type", "text", "timestamp", "media_status", "media_key", "media_mime", "media_size", "media_name", "extra" FROM `message`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
ALTER TABLE `__new_message` RENAME TO `message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `message_external_id_unique` ON `message` (`external_id`);--> statement-breakpoint
CREATE INDEX `message_conversation_ts_idx` ON `message` (`conversation_id`,`timestamp`,`id`);--> statement-breakpoint
-- Recriar a tabela derrubou os gatilhos FTS5 (0002) e trocou os rowids: recria os gatilhos e reindexa.
CREATE TRIGGER `message_fts_ai` AFTER INSERT ON `message` BEGIN
  INSERT INTO `message_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `message_fts_ad` AFTER DELETE ON `message` BEGIN
  INSERT INTO `message_fts`(`message_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `message_fts_au` AFTER UPDATE OF `text` ON `message` BEGIN
  INSERT INTO `message_fts`(`message_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
  INSERT INTO `message_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
INSERT INTO `message_fts`(`message_fts`) VALUES ('rebuild');
