import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";

export const conversations = new Hono<AppEnv>();
conversations.use("*", requireAuth);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const INBOX_LIMIT = 200;

/** Conversa com contato e ultima mensagem, no formato da API. */
async function selectConversations(db: Db, where?: SQL) {
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
const encodeCursor = (m: { timestamp: number; id: string }) => `${m.timestamp}:${m.id}`;
function decodeCursor(raw: string): { timestamp: number; id: string } | null {
  const i = raw.indexOf(":");
  const timestamp = Number(raw.slice(0, i));
  if (i < 1 || !Number.isFinite(timestamp)) return null;
  return { timestamp, id: raw.slice(i + 1) };
}

conversations.get("/:id/messages", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const exists = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, id), columns: { id: true } });
  if (!exists) return c.json({ error: "nao_encontrado" }, 404);

  const requested = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

  const rawBefore = c.req.query("before");
  const before = rawBefore ? decodeCursor(rawBefore) : null;
  if (rawBefore && !before) return c.json({ error: "cursor_invalido" }, 400);

  const rows = await db
    .select({
      id: schema.message.id,
      direction: schema.message.direction,
      type: schema.message.type,
      text: schema.message.text,
      timestamp: schema.message.timestamp,
    })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.conversationId, id),
        before
          ? or(
              lt(schema.message.timestamp, before.timestamp),
              and(eq(schema.message.timestamp, before.timestamp), lt(schema.message.id, before.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.message.timestamp), desc(schema.message.id))
    .limit(limit + 1); // uma a mais so para saber se ha pagina mais antiga

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // mais recentes, em ordem cronologica
  return c.json({ messages: page, nextBefore: hasMore ? encodeCursor(page[0]!) : null });
});
