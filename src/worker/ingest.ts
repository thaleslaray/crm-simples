import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "./db";
import { schema } from "./db";
import type { Message } from "./conversations";

/** Campos do evento `messages` da Uazapi que usamos. */
export interface UazapiMessage {
  id?: string;
  messageid?: string;
  chatid?: string;
  sender?: string;
  sender_pn?: string;
  sender_lid?: string;
  senderName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  messageType?: string;
  text?: string;
  messageTimestamp?: number;
}

const TEXT_TYPES = ["conversation", "extendedtextmessage"];
const PN_SUFFIX = "@s.whatsapp.net";
const LID_SUFFIX = "@lid";

/** JIDs conhecidos do remetente: numero (so digitos + JID completo) e/ou LID. */
function identities(msg: UazapiMessage) {
  const jids = [msg.sender_pn, msg.sender_lid, msg.sender, msg.chatid].filter((j): j is string => !!j);
  const jidPn = jids.find((j) => j.endsWith(PN_SUFFIX)) ?? null;
  const jidLid = jids.find((j) => j.endsWith(LID_SUFFIX)) ?? null;
  return { jidPn, jidLid, phone: jidPn ? jidPn.slice(0, -PN_SUFFIX.length) : null };
}

/** Acha o contato pelo numero ou pelo LID (o numero tem prioridade) e completa o que ainda faltava; senao cria. */
async function resolveContact(db: Db, msg: UazapiMessage, now: number): Promise<string> {
  const { jidPn, jidLid, phone } = identities(msg);
  const byPhone = phone ? await db.query.contact.findFirst({ where: eq(schema.contact.phone, phone) }) : undefined;
  const byLid = jidLid ? await db.query.contact.findFirst({ where: eq(schema.contact.jidLid, jidLid) }) : undefined;
  const found = byPhone ?? byLid;
  if (found) {
    const patch: Partial<typeof schema.contact.$inferInsert> = {};
    if (!found.phone && phone) patch.phone = phone;
    if (!found.jidPn && jidPn) patch.jidPn = jidPn;
    // Se o LID ja pertence a outro contato, nao o move (evita violar a unicidade).
    if (!found.jidLid && jidLid && !byLid) patch.jidLid = jidLid;
    if (!found.name && msg.senderName) patch.name = msg.senderName;
    if (Object.keys(patch).length > 0) await db.update(schema.contact).set(patch).where(eq(schema.contact.id, found.id));
    return found.id;
  }
  const id = crypto.randomUUID();
  await db.insert(schema.contact).values({ id, name: msg.senderName || null, phone, jidPn, jidLid, createdAt: now });
  return id;
}

async function resolveConversation(db: Db, contactId: string, now: number): Promise<string> {
  await db
    .insert(schema.conversation)
    .values({ id: crypto.randomUUID(), contactId, createdAt: now })
    .onConflictDoNothing({ target: schema.conversation.contactId });
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.contactId, contactId) });
  return conv!.id;
}

/**
 * Processa o evento `messages`. Descarta grupo e `fromMe`; idempotente por `message.id`.
 * Lanca se o payload nao tem `message.id` (o evento fica sem `processedAt`).
 */
export async function ingestMessage(
  db: Db,
  msg: UazapiMessage,
): Promise<{ conversationId: string; message: Message } | null> {
  if (msg.isGroup || msg.fromMe) return null;
  if (!msg.id) throw new Error("mensagem sem id");

  const already = await db.query.message.findFirst({ where: eq(schema.message.externalId, msg.id) });
  if (already) return null;

  const now = Date.now();
  const contactId = await resolveContact(db, msg, now);
  const conversationId = await resolveConversation(db, contactId, now);

  // O tipo decide: midia com legenda tambem traz `text`. Sem tipo, texto preenchido conta como texto.
  // Comparacao sem caixa porque o formato exato da Uazapi ainda nao foi validado com webhook real.
  const isText = msg.messageType ? TEXT_TYPES.includes(msg.messageType.toLowerCase()) : !!msg.text;
  const timestamp = msg.messageTimestamp ?? now;
  const messageId = crypto.randomUUID();
  const inserted = await db
    .insert(schema.message)
    .values({
      id: messageId,
      externalId: msg.id,
      whatsappMessageId: msg.messageid ?? null,
      conversationId,
      direction: "in",
      type: isText ? "text" : "unsupported",
      text: isText ? (msg.text ?? null) : null,
      timestamp,
    })
    .onConflictDoNothing({ target: schema.message.externalId })
    .returning({ id: schema.message.id });
  if (inserted.length === 0) return null; // corrida com outro request: ja ingerida

  // So avanca o "ultimo" se esta for a mais recente (evento atrasado nao volta a previa).
  await db
    .update(schema.conversation)
    .set({ lastMessageAt: timestamp, lastMessageId: messageId })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        or(isNull(schema.conversation.lastMessageAt), lte(schema.conversation.lastMessageAt, timestamp)),
      ),
    );
  return {
    conversationId,
    message: { id: messageId, direction: "in", type: isText ? "text" : "unsupported", text: isText ? (msg.text ?? null) : null, timestamp },
  };
}
