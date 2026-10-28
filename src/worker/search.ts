import { like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { selectConversations } from "./conversations";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";

export const search = new Hono<AppEnv>();
search.use("*", requireAuth);

const CONTACT_LIMIT = 20;
const MESSAGE_LIMIT = 30;
const MIN_PHONE_DIGITS = 3;

// Marcadores do trecho destacado (caracteres de controle: nao aparecem em texto de WhatsApp).
export const SNIPPET_START = "\u0001";
export const SNIPPET_END = "\u0002";

/** Palavras da busca viram termos de prefixo AND ("bole" acha "boleto"). So letras e digitos: nada de sintaxe FTS. */
function ftsExpression(q: string): string | null {
  const terms = q.match(/[\p{L}\p{N}]+/gu);
  return terms ? terms.map((t) => `"${t}"*`).join(" ") : null;
}

search.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const expr = ftsExpression(q);
  if (!expr) return c.json({ contacts: [], messages: [] });

  const db = createDb(c.env.DB);
  const digits = q.replace(/\D/g, "");
  const nameMatch = sql`${schema.contact}.rowid IN (SELECT rowid FROM contact_fts WHERE contact_fts MATCH ${expr})`;
  const where = digits.length >= MIN_PHONE_DIGITS ? or(nameMatch, like(schema.contact.phone, `%${digits}%`)) : nameMatch;
  const contacts = (await selectConversations(db, where)).slice(0, CONTACT_LIMIT);

  const { results } = await c.env.DB.prepare(
    `SELECT m.id AS messageId, m.conversation_id AS conversationId, m.timestamp AS timestamp,
            snippet(message_fts, 0, ?2, ?3, '…', 12) AS snippet,
            ct.id AS contactId, ct.name AS contactName, ct.phone AS contactPhone
       FROM message_fts
       JOIN message m ON m.rowid = message_fts.rowid
       JOIN conversation cv ON cv.id = m.conversation_id
       JOIN contact ct ON ct.id = cv.contact_id
      WHERE message_fts MATCH ?1
      ORDER BY m.timestamp DESC, m.id DESC
      LIMIT ?4`,
  )
    .bind(expr, SNIPPET_START, SNIPPET_END, MESSAGE_LIMIT)
    .all<{
      messageId: string;
      conversationId: string;
      timestamp: number;
      snippet: string;
      contactId: string;
      contactName: string | null;
      contactPhone: string | null;
    }>();

  return c.json({
    contacts,
    messages: results.map((r) => ({
      messageId: r.messageId,
      conversationId: r.conversationId,
      contact: { id: r.contactId, name: r.contactName, phone: r.contactPhone },
      snippet: r.snippet,
      timestamp: r.timestamp,
    })),
  });
});
