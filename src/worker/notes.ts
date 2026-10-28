import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { schema } from "./db";

const MAX_NOTE_LENGTH = 4096;

/** Nota interna no formato da API. So grava no D1: nada aqui fala com a Uazapi. */
export type Note = Awaited<ReturnType<typeof loadNote>> & {};

const noteQuery = (db: Db) =>
  db
    .select({
      id: schema.conversationNote.id,
      conversationId: schema.conversationNote.conversationId,
      text: schema.conversationNote.text,
      authorName: schema.user.name,
      createdAt: schema.conversationNote.createdAt,
    })
    .from(schema.conversationNote)
    .leftJoin(schema.user, eq(schema.user.id, schema.conversationNote.authorId));

async function loadNote(db: Db, id: string) {
  const [row] = await noteQuery(db).where(eq(schema.conversationNote.id, id));
  return row ?? null;
}

/** Notas das conversas dadas (a ficha junta as de todas), da mais antiga para a mais nova. */
export async function listNotes(db: Db, conversationIds: string[]) {
  if (conversationIds.length === 0) return [];
  return noteQuery(db)
    .where(inArray(schema.conversationNote.conversationId, conversationIds))
    .orderBy(asc(schema.conversationNote.createdAt), asc(schema.conversationNote.id));
}

/** Devolve a nota criada; null se o texto e invalido (vazio ou grande demais). */
export async function createNote(db: Db, conversationId: string, authorId: string, text: unknown): Promise<Note | "invalid"> {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_NOTE_LENGTH) return "invalid";
  const id = crypto.randomUUID();
  await db.insert(schema.conversationNote).values({ id, conversationId, authorId, text: text.trim(), createdAt: Date.now() });
  return (await loadNote(db, id))!;
}
