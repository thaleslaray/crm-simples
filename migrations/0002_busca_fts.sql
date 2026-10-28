-- Busca (ticket 16): indices FTS5 em modo "external content" (sem copiar o texto), mantidos por gatilhos.
-- unicode61 com remove_diacritics 2: "joao" acha "João", sem distinguir caixa.
CREATE VIRTUAL TABLE `message_fts` USING fts5(`text`, content='message', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
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
CREATE VIRTUAL TABLE `contact_fts` USING fts5(`name`, content='contact', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER `contact_fts_ai` AFTER INSERT ON `contact` BEGIN
  INSERT INTO `contact_fts`(rowid, `name`) VALUES (new.rowid, new.`name`);
END;
--> statement-breakpoint
CREATE TRIGGER `contact_fts_ad` AFTER DELETE ON `contact` BEGIN
  INSERT INTO `contact_fts`(`contact_fts`, rowid, `name`) VALUES ('delete', old.rowid, old.`name`);
END;
--> statement-breakpoint
CREATE TRIGGER `contact_fts_au` AFTER UPDATE OF `name` ON `contact` BEGIN
  INSERT INTO `contact_fts`(`contact_fts`, rowid, `name`) VALUES ('delete', old.rowid, old.`name`);
  INSERT INTO `contact_fts`(rowid, `name`) VALUES (new.rowid, new.`name`);
END;
--> statement-breakpoint
-- Indexa o que ja existia.
INSERT INTO `message_fts`(`message_fts`) VALUES ('rebuild');
--> statement-breakpoint
INSERT INTO `contact_fts`(`contact_fts`) VALUES ('rebuild');
