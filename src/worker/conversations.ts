import { and, asc, desc, eq, gt, lt, lte, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import type { SendStatus } from "./db/schema";
import { type AppEnv, requireAuth } from "./middleware";
import { publish } from "./realtime";
import { sendOutgoingText } from "./send";
import { createUazapiClient } from "./uazapi/client";

export const conversations = new Hono<AppEnv>();
conversations.use("*", requireAuth);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const INBOX_LIMIT = 200;

export type Message = Awaited<ReturnType<typeof messageView>>;

export type Conversation = Awaited<ReturnType<typeof selectConversations>>[number];

/** Conversa com contato e ultima mensagem, no formato da API. */
export async function selectConversations(db: Db, where?: SQL) {
  const rows = await db
    .select({
      id: schema.conversation.id,
      status: schema.conversation.status,
      assigneeId: schema.conversation.assigneeId,
      unreadCount: schema.conversation.unreadCount,
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
    unreadCount: r.unreadCount,
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

export type MessageRow = {
  id: string;
  direction: "in" | "out";
  type: (typeof schema.message.$inferSelect)["type"];
  text: string | null;
  status: SendStatus | null;
  authorName: string | null;
  timestamp: number;
  mediaStatus: "pending" | "available" | "failed" | null;
  mediaKey: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  mediaName: string | null;
  extra: string | null;
};

/** Mensagem no formato da API. Midia "disponivel" cujo objeto saiu do R2 (regra de 365 dias) aparece como "expired". */
export async function messageView(bucket: R2Bucket, m: MessageRow) {
  const { mediaStatus, mediaKey, mediaMime, mediaSize, mediaName, extra, ...base } = m;
  let status: "pending" | "available" | "failed" | "expired" | null = mediaStatus;
  if (mediaStatus === "available" && (!mediaKey || !(await bucket.head(mediaKey)))) status = "expired";
  const details = extra ? (JSON.parse(extra) as Record<string, unknown>) : null;
  return {
    ...base,
    media: status ? { status, mime: mediaMime, size: mediaSize, name: mediaName } : null,
    location: m.type === "location" ? details : null,
    contact: m.type === "contact" ? contactView(details) : null,
  };
}

/** Nome e primeiro telefone do vCard (linha `TEL`, ex.: `TEL;type=CELL;waid=5511...:+55 11 ...`). */
function contactView(details: Record<string, unknown> | null) {
  const vcard = typeof details?.vcard === "string" ? details.vcard : "";
  const tel = /^TEL[^:\n]*:(.+)$/im.exec(vcard)?.[1]?.trim() ?? null;
  return { name: (details?.name as string | null) ?? null, phone: tel };
}

const messageColumns = {
  id: schema.message.id,
  direction: schema.message.direction,
  type: schema.message.type,
  text: schema.message.text,
  status: schema.message.status,
  authorName: schema.user.name,
  timestamp: schema.message.timestamp,
  mediaStatus: schema.message.mediaStatus,
  mediaKey: schema.message.mediaKey,
  mediaMime: schema.message.mediaMime,
  mediaSize: schema.message.mediaSize,
  mediaName: schema.message.mediaName,
  extra: schema.message.extra,
};

/** Ate `limit` mensagens mais antigas que o cursor, em ordem cronologica; `more` diz se ainda ha antes delas. */
async function loadOlder(db: Db, conversationId: string, limit: number, cur?: Cursor, inclusive = false) {
  const rows = await db
    .select(messageColumns)
    .from(schema.message)
    .leftJoin(schema.user, eq(schema.user.id, schema.message.sentById))
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
    .leftJoin(schema.user, eq(schema.user.id, schema.message.sentById))
    .where(and(eq(schema.message.conversationId, conversationId), newerThan(cur)))
    .orderBy(asc(schema.message.timestamp), asc(schema.message.id))
    .limit(limit + 1);
  return { page: rows.slice(0, limit), more: rows.length > limit };
}

/** Uma mensagem no formato da API (a mesma do historico e do tempo real). */
export async function loadMessage(db: Db, bucket: R2Bucket, id: string): Promise<Message | null> {
  const [row] = await db.select(messageColumns).from(schema.message)
    .leftJoin(schema.user, eq(schema.user.id, schema.message.sentById))
    .where(eq(schema.message.id, id));
  return row ? messageView(bucket, row) : null;
}

const views = (bucket: R2Bucket, rows: MessageRow[]) => Promise.all(rows.map((m) => messageView(bucket, m)));

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
    const raw = [...older.page, ...newer.page];
    const messages = await views(c.env.MEDIA, raw);
    return c.json({
      messages,
      nextBefore: older.more ? encodeCursor(raw[0]!) : null,
      nextAfter: newer.more ? encodeCursor(raw.at(-1)!) : null,
    });
  }

  const rawAfter = c.req.query("after");
  if (rawAfter) {
    const after = decodeCursor(rawAfter);
    if (!after) return c.json({ error: "cursor_invalido" }, 400);
    const newer = await loadNewer(db, id, limit, after);
    return c.json({ messages: await views(c.env.MEDIA, newer.page), nextBefore: null, nextAfter: newer.more ? encodeCursor(newer.page.at(-1)!) : null });
  }

  const rawBefore = c.req.query("before");
  const before = rawBefore ? decodeCursor(rawBefore) : null;
  if (rawBefore && !before) return c.json({ error: "cursor_invalido" }, 400);

  const older = await loadOlder(db, id, limit, before ?? undefined);
  return c.json({ messages: await views(c.env.MEDIA, older.page), nextBefore: older.more ? encodeCursor(older.page[0]!) : null });
});

// Abrir a conversa: zera o contador e marca no WhatsApp as mensagens do cliente que ainda nao tinham sido vistas.
conversations.post("/:id/read", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, id), columns: { unreadCount: true } });
  if (!conv) return c.json({ error: "nao_encontrado" }, 404);
  if (conv.unreadCount > 0) {
    // As `unreadCount` mais recentes do cliente sao as nao vistas.
    const unread = await db
      .select({ externalId: schema.message.externalId })
      .from(schema.message)
      .where(and(eq(schema.message.conversationId, id), eq(schema.message.direction, "in")))
      .orderBy(desc(schema.message.timestamp), desc(schema.message.id))
      .limit(conv.unreadCount);
    // Zera antes de falar com a Uazapi: falha de la nao deixa o contador preso.
    await db.update(schema.conversation).set({ unreadCount: 0 }).where(eq(schema.conversation.id, id));
    const ids = unread.flatMap((m) => (m.externalId ? [m.externalId] : []));
    if (ids.length > 0) {
      try {
        await createUazapiClient(c.env).markRead(ids);
      } catch (err) {
        console.error("conversa: falha ao marcar como lida na Uazapi", { erro: err instanceof Error ? err.name : "desconhecido" });
      }
    }
    const conversation = await loadConversation(db, id);
    if (conversation) await publish(c.env, { type: "conversation.updated", conversation });
  }
  return c.json({ ok: true });
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
