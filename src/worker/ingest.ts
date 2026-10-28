import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "./db";
import { schema } from "./db";

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
  /** "image", "video", "audio", "ptt", "document", "sticker" (nao validado com webhook real). */
  mediaType?: string;
  /** Detalhes da midia/localizacao/contato; texto simples traz string. */
  content?: unknown;
}

type MessageType = (typeof schema.message.$inferInsert)["type"];

interface Parsed {
  type: MessageType;
  text: string | null;
  media: { mime: string | null; size: number | null; name: string | null } | null;
  extra: unknown;
}

const MEDIA_KINDS: Record<string, MessageType> = {
  image: "image",
  video: "video",
  audio: "audio",
  ptt: "voice",
  document: "document",
  sticker: "sticker",
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Decide tipo, texto e detalhes. O formato da midia ainda nao foi confirmado com webhook real:
 * le `mediaType` e, sem ele, o `messageType` ("ImageMessage" etc.), sem diferenciar caixa, e tolera campos ausentes.
 */
function parse(msg: UazapiMessage, text: string | null): Parsed {
  const content = msg.content && typeof msg.content === "object" ? (msg.content as Record<string, unknown>) : {};
  const mt = msg.messageType?.toLowerCase() ?? "";
  if (!msg.messageType ? !!msg.text : TEXT_TYPES.includes(mt)) return { type: "text", text: msg.text ?? null, media: null, extra: null };

  const kind = msg.mediaType?.toLowerCase() ?? (/^(image|video|audio|document|sticker)message$/.exec(mt)?.[1] ?? null);
  const type = kind ? MEDIA_KINDS[kind] : undefined;
  if (type) {
    // Nota de voz as vezes vem como audio com PTT=true.
    const voice = type === "audio" && content.PTT === true;
    return {
      type: voice ? "voice" : type,
      text: text ?? str(content.caption),
      media: { mime: str(content.mimetype), size: num(content.fileLength), name: str(content.fileName) ?? str(content.title) },
      extra: null,
    };
  }
  if (mt === "locationmessage" || mt === "livelocationmessage") {
    const lat = num(content.degreesLatitude);
    const lng = num(content.degreesLongitude);
    if (lat !== null && lng !== null)
      return { type: "location", text: null, media: null, extra: { lat, lng, name: str(content.name), address: str(content.address) } };
  }
  if (mt === "contactmessage") {
    return { type: "contact", text: null, media: null, extra: { name: str(content.displayName), vcard: str(content.vcard) } };
  }
  return { type: "unsupported", text: null, media: null, extra: null };
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
export async function ingestMessage(db: Db, msg: UazapiMessage, queue: Queue<MediaJob>): Promise<void> {
  if (msg.isGroup || msg.fromMe) return;
  if (!msg.id) throw new Error("mensagem sem id");

  const already = await db.query.message.findFirst({ where: eq(schema.message.externalId, msg.id) });
  if (already) return;

  const now = Date.now();
  const contactId = await resolveContact(db, msg, now);
  const conversationId = await resolveConversation(db, contactId, now);

  const parsed = parse(msg, msg.text || null);
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
      type: parsed.type,
      text: parsed.text,
      timestamp,
      mediaStatus: parsed.media ? "pending" : null,
      mediaMime: parsed.media?.mime ?? null,
      mediaSize: parsed.media?.size ?? null,
      mediaName: parsed.media?.name ?? null,
      extra: parsed.extra ? JSON.stringify(parsed.extra) : null,
    })
    .onConflictDoNothing({ target: schema.message.externalId })
    .returning({ id: schema.message.id });
  if (inserted.length === 0) return; // corrida com outro request: ja ingerida

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

  // Fora da requisicao do webhook: o consumer baixa o arquivo. Se o envio falhar, a midia fica "pendente" (reenfileirada na reconciliacao).
  if (parsed.media) await queue.send({ messageId });
}
