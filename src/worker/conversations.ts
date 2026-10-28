import { and, asc, desc, eq, gt, lt, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";
import { sendOutgoingText } from "./send";

export const conversations = new Hono<AppEnv>();
conversations.use("*", requireAuth);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const INBOX_LIMIT = 200;

export interface Message {
  id: string;
  direction: "in";
  type: "text" | "unsupported";
  text: string | null;
  timestamp: number;
}

export type Conversation = Awaited<ReturnType<typeof selectConversations>>[number];

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
  const conversation = await loadConversation(createDb(c.env.DB), c.req.param("id"));
  if (!conversation) return c.json({ error: "nao_encontrado" }, 404);
  return c.json({ conversation });
});

// Cursor opaco para o cliente: "<timestamp>:<id da mensagem>" (desempate por id quando o horario empata).
/** Uma conversa no formato da API (a mesma da lista e do detalhe), ou null se nao existe. */
export async function loadConversation(db: Db, id: string): Promise<Conversation | null> {
  const [conversation] = await selectConversations(db, eq(schema.conversation.id, id));
  return conversation ?? null;
}

const encodeCursor = (m: { timestamp: number; id: string }) => `${m.timestamp}:${m.id}`;
function decodeCursor(raw: string): { timestamp: number; id: string } | null {
  const i = raw.indexOf(":");
  const timestamp = Number(raw.slice(0, i));
  if (i < 1 || !Number.isFinite(timestamp)) return null;
  return { timestamp, id: raw.slice(i + 1) };
}

const messageColumns = {
  id: schema.message.id,
  direction: schema.message.direction,
  type: schema.message.type,
  text: schema.message.text,
  timestamp: schema.message.timestamp,
};

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

  // Ressincronizacao ao reconectar: so o que veio depois da ultima mensagem vista, em ordem cronologica.
  const rawAfter = c.req.query("after");
  const after = rawAfter ? decodeCursor(rawAfter) : null;
  if (rawAfter && !after) return c.json({ error: "cursor_invalido" }, 400);
  if (after) {
    const newer = await db
      .select(messageColumns)
      .from(schema.message)
      .where(
        and(
          eq(schema.message.conversationId, id),
          or(
            gt(schema.message.timestamp, after.timestamp),
            and(eq(schema.message.timestamp, after.timestamp), gt(schema.message.id, after.id)),
          ),
        ),
      )
      .orderBy(asc(schema.message.timestamp), asc(schema.message.id))
      .limit(limit);
    return c.json({ messages: newer, nextBefore: null });
  }

  const rows = await db
    .select({
      id: schema.message.id,
      direction: schema.message.direction,
      type: schema.message.type,
      text: schema.message.text,
      status: schema.message.status,
      authorName: schema.user.name,
      timestamp: schema.message.timestamp,
    })
    .from(schema.message)
    .leftJoin(schema.user, eq(schema.user.id, schema.message.sentById))
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

const MAX_TEXT_LENGTH = 4096;

conversations.post("/:id/messages", async (c) => {
  const body = await c.req.json<{ text?: unknown }>().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim() || text.length > MAX_TEXT_LENGTH) return c.json({ error: "texto_invalido" }, 400);
  const result = await sendOutgoingText(c.env, { conversationId: c.req.param("id"), userId: c.get("user").id, text });
  if (result === null || result === "not_failed") return c.json({ error: "nao_encontrado" }, 404);
  return c.json({ message: result }, 201);
});

conversations.post("/:id/messages/:messageId/resend", async (c) => {
  const result = await sendOutgoingText(c.env, {
    conversationId: c.req.param("id"),
    messageId: c.req.param("messageId"),
    userId: c.get("user").id,
  });
  if (result === null) return c.json({ error: "nao_encontrado" }, 404);
  if (result === "not_failed") return c.json({ error: "reenvio_indisponivel" }, 409);
  return c.json({ message: result });
});
