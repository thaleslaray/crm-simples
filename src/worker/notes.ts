import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db";
import { schema } from "./db";

const MAX_NOTE_LENGTH = 4096;

/** Teto de notas por conversa; a leitura tambem para aqui (as mais recentes). */
export const MAX_NOTES_PER_CONVERSATION = 500;

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

/** Notas das conversas dadas (a ficha junta as de todas), da mais antiga para a mais nova; so as 500 mais recentes. */
export async function listNotes(db: Db, conversationIds: string[]) {
  if (conversationIds.length === 0) return [];
  const recent = await noteQuery(db)
    .where(inArray(schema.conversationNote.conversationId, conversationIds))
    .orderBy(desc(schema.conversationNote.createdAt), desc(schema.conversationNote.id))
    .limit(MAX_NOTES_PER_CONVERSATION);
  return recent.reverse();
}

/** Devolve a nota criada; "invalid" se o texto e invalido (vazio ou grande demais); "limit" se a conversa ja tem o maximo. */
export async function createNote(db: Db, conversationId: string, authorId: string, text: unknown): Promise<Note | "invalid" | "limit"> {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_NOTE_LENGTH) return "invalid";
  const [count] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.conversationNote)
    .where(eq(schema.conversationNote.conversationId, conversationId));
  if ((count?.n ?? 0) >= MAX_NOTES_PER_CONVERSATION) return "limit";
  const id = crypto.randomUUID();
  await db.insert(schema.conversationNote).values({ id, conversationId, authorId, text: text.trim(), createdAt: Date.now() });
  return (await loadNote(db, id))!;
}
