import { and, asc, desc, eq, gt, lt, lte, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";

export const conversations = new Hono<AppEnv>();
conversations.use("*", requireAuth);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const INBOX_LIMIT = 200;

/** Conversa com contato e ultima mensagem, no formato da API. */
export async function selectConversations(db: Db, where?: SQL) {
  const rows = await db
    .select({
      id: schema.conversation.id,
      status: schema.conversation.status,
      assigneeId: schema.conversation.assigneeId,
      contactId: schema.contact.id,
      contactName: schema.contact.name,
      contactPhone: schema.contact.phone,
      msgType: schema.message.type,
      msgText: schema.message.text,
      msgTimestamp: schema.message.timestamp,
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .leftJoin(schema.message, eq(schema.message.id, schema.conversation.lastMessageId))
    .where(where)
    .orderBy(desc(schema.conversation.lastMessageAt), desc(schema.conversation.id))
    .limit(INBOX_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    assigneeId: r.assigneeId,
    contact: { id: r.contactId, name: r.contactName, phone: r.contactPhone },
    lastMessage:
      r.msgType && r.msgTimestamp != null ? { type: r.msgType, text: r.msgText, timestamp: r.msgTimestamp } : null,
  }));
}

conversations.get("/", async (c) => c.json({ conversations: await selectConversations(createDb(c.env.DB)) }));

conversations.get("/:id", async (c) => {
  const [conversation] = await selectConversations(createDb(c.env.DB), eq(schema.conversation.id, c.req.param("id")));
  if (!conversation) return c.json({ error: "nao_encontrado" }, 404);
  return c.json({ conversation });
});

// Cursor opaco para o cliente: "<timestamp>:<id da mensagem>" (desempate por id quando o horario empata).
type Cursor = { timestamp: number; id: string };
const encodeCursor = (m: Cursor) => `${m.timestamp}:${m.id}`;
function decodeCursor(raw: string): Cursor | null {
  const i = raw.indexOf(":");
  const timestamp = Number(raw.slice(0, i));
  if (i < 1 || !Number.isFinite(timestamp)) return null;
  return { timestamp, id: raw.slice(i + 1) };
}

const olderThan = (cur: Cursor, inclusive = false) =>
  or(
    lt(schema.message.timestamp, cur.timestamp),
    and(eq(schema.message.timestamp, cur.timestamp), (inclusive ? lte : lt)(schema.message.id, cur.id)),
  );
const newerThan = (cur: Cursor) =>
  or(
    gt(schema.message.timestamp, cur.timestamp),
    and(eq(schema.message.timestamp, cur.timestamp), gt(schema.message.id, cur.id)),
  );

const messageColumns = {
  id: schema.message.id,
  direction: schema.message.direction,
  type: schema.message.type,
  text: schema.message.text,
  timestamp: schema.message.timestamp,
};

/** Ate `limit` mensagens mais antigas que o cursor, em ordem cronologica; `more` diz se ainda ha antes delas. */
async function loadOlder(db: Db, conversationId: string, limit: number, cur?: Cursor, inclusive = false) {
  const rows = await db
    .select(messageColumns)
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conversationId), cur ? olderThan(cur, inclusive) : undefined))
    .orderBy(desc(schema.message.timestamp), desc(schema.message.id))
    .limit(limit + 1); // uma a mais so para saber se ha pagina mais antiga
  return { page: rows.slice(0, limit).reverse(), more: rows.length > limit };
}

/** Ate `limit` mensagens mais novas que o cursor, em ordem cronologica. */
async function loadNewer(db: Db, conversationId: string, limit: number, cur: Cursor) {
  const rows = await db
    .select(messageColumns)
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conversationId), newerThan(cur)))
    .orderBy(asc(schema.message.timestamp), asc(schema.message.id))
    .limit(limit + 1);
  return { page: rows.slice(0, limit), more: rows.length > limit };
}

conversations.get("/:id/messages", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const exists = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, id), columns: { id: true } });
  if (!exists) return c.json({ error: "nao_encontrado" }, 404);

  const requested = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

  // around=<id da mensagem>: janela de historico centrada nela (resultado de busca).
  const aroundId = c.req.query("around");
  if (aroundId) {
    const target = await db.query.message.findFirst({
      where: and(eq(schema.message.id, aroundId), eq(schema.message.conversationId, id)),
      columns: { id: true, timestamp: true },
    });
    if (!target) return c.json({ error: "nao_encontrado" }, 404);
    const cur = { timestamp: target.timestamp, id: target.id };
    const olderCount = Math.floor(limit / 2); // antes da mensagem; o resto vai depois dela
    const older = await loadOlder(db, id, olderCount + 1, cur, true); // inclui a propria mensagem
    const newer = await loadNewer(db, id, limit - olderCount - 1, cur);
    const messages = [...older.page, ...newer.page];
    return c.json({
      messages,
      nextBefore: older.more ? encodeCursor(messages[0]!) : null,
      nextAfter: newer.more ? encodeCursor(messages.at(-1)!) : null,
    });
  }

  const rawAfter = c.req.query("after");
  if (rawAfter) {
    const after = decodeCursor(rawAfter);
    if (!after) return c.json({ error: "cursor_invalido" }, 400);
    const newer = await loadNewer(db, id, limit, after);
    return c.json({ messages: newer.page, nextAfter: newer.more ? encodeCursor(newer.page.at(-1)!) : null });
  }

  const rawBefore = c.req.query("before");
  const before = rawBefore ? decodeCursor(rawBefore) : null;
  if (rawBefore && !before) return c.json({ error: "cursor_invalido" }, 400);

  const older = await loadOlder(db, id, limit, before ?? undefined);
  return c.json({ messages: older.page, nextBefore: older.more ? encodeCursor(older.page[0]!) : null });
});
