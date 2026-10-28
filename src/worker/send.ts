import { and, eq } from "drizzle-orm";
import { loadConversation, loadMessage, type Message } from "./conversations";
import { createDb, schema } from "./db";
import { publish } from "./realtime";
import { markReplied } from "./status";
import type { MessageType, SendStatus } from "./db/schema";
import { signedFileUrl } from "./signed-files";
import { UazapiHttpError } from "./uazapi/client";
import { getUazapiClient } from "./uazapi/config";

/** Arquivo anexado pelo atendente; `voice` = nota de voz gravada no navegador (vai como `ptt`, sem legenda). */
export type OutgoingMedia = { file: File; caption: string; voice: boolean };

/** `origin`: endereco publico deste Worker, base do link assinado que a Uazapi usa para buscar a midia. */
type Input = { conversationId: string; userId: string; origin: string } & (
  | { text: string; replyTo?: string }
  | { messageId: string }
  | { media: OutgoingMedia; replyTo?: string }
);

/** Voz vira `voice`; o resto pelo mime. */
function mediaType(file: File, voice: boolean): MessageType {
  if (voice) return "voice";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

/**
 * Envia texto ou midia do atendente (midia: grava no R2 e entrega a Uazapi por link assinado; mesmos estados). Grava como "sending", chama a Uazapi e atualiza:
 * sucesso -> sent (com o id da Uazapi); recusa HTTP -> failed (reenvio manual); timeout ou erro de rede -> uncertain
 * (a Uazapi pode ter entregue: nunca reenviado automaticamente, e o reenvio manual só vale para "failed").
 * Com `messageId` reenvia uma mensagem "failed". Devolve null se conversa/mensagem não existe e "not_failed"
 * se a mensagem não está em "failed". Com `replyTo` (id de uma mensagem da mesma conversa) responde citando; devolve
 * "invalid_reply" se ela não existe ou ainda não tem id no WhatsApp.
 */
export async function sendOutgoingText(env: Cloudflare.Env, input: Input): Promise<Message | "not_failed" | "invalid_reply" | null> {
  const db = createDb(env.DB);
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, input.conversationId) });
  if (!conv) return null;
  const contact = await db.query.contact.findFirst({ where: eq(schema.contact.id, conv.contactId) });
  const author = await db.query.user.findFirst({ where: eq(schema.user.id, input.userId) });
  if (!contact || !author) return null;

  let messageId: string;
  let text: string;
  let timestamp: number;
  let type: MessageType = "text";
  let mediaName: string | null = null;
  let hasMedia = false;
  let quotedId: string | null = null;
  if ("messageId" in input) {
    const msg = await db.query.message.findFirst({
      where: and(
        eq(schema.message.id, input.messageId),
        eq(schema.message.conversationId, conv.id),
        eq(schema.message.direction, "out"),
      ),
    });
    if (!msg) return null;
    if (msg.status !== "failed") return "not_failed";
    // Troca atômica failed -> sending: dois cliques em "reenviar" não enviam duas vezes.
    const claimed = await db
      .update(schema.message)
      .set({ status: "sending" })
      .where(and(eq(schema.message.id, msg.id), eq(schema.message.status, "failed")))
      .returning({ id: schema.message.id });
    if (claimed.length === 0) return "not_failed";
    messageId = msg.id;
    text = msg.text ?? "";
    timestamp = msg.timestamp;
    type = msg.type;
    mediaName = msg.mediaName;
    hasMedia = msg.mediaStatus === "available" && !!msg.mediaKey;
    quotedId = msg.quotedId;
  } else {
    if (input.replyTo) {
      const target = await db.query.message.findFirst({
        where: and(eq(schema.message.id, input.replyTo), eq(schema.message.conversationId, conv.id)),
        columns: { whatsappMessageId: true },
      });
      if (!target?.whatsappMessageId) return "invalid_reply";
      quotedId = target.whatsappMessageId;
    }
    messageId = crypto.randomUUID();
    timestamp = Date.now();
    const media = "media" in input ? input.media : null;
    text = media ? (media.voice ? "" : media.caption) : (input as { text: string }).text;
    if (media) {
      type = mediaType(media.file, media.voice);
      mediaName = media.file.name || null;
      hasMedia = true;
      // Grava antes de a mensagem existir: sem objeto no R2 nao ha mensagem para a Uazapi buscar.
      await env.MEDIA.put(`out/${messageId}`, await media.file.arrayBuffer(), { httpMetadata: { contentType: media.file.type || undefined } });
    }
    await db.insert(schema.message).values({
      id: messageId,
      conversationId: conv.id,
      direction: "out",
      status: "sending",
      sentById: author.id,
      type,
      text: text || null,
      timestamp,
      ...(media && {
        mediaStatus: "available" as const,
        mediaKey: `out/${messageId}`,
        mediaMime: media.file.type || null,
        mediaSize: media.file.size,
        mediaName,
      }),
      quotedId,
    });
    await db
      .update(schema.conversation)
      .set({ lastMessageAt: timestamp, lastMessageId: messageId })
      .where(eq(schema.conversation.id, conv.id));
  }

  const number = contact.phone ?? contact.jidLid;
  let status: SendStatus;
  let patch: Partial<typeof schema.message.$inferInsert> = {};
  if (!number) {
    status = "failed";
  } else {
    try {
      const uazapi = await getUazapiClient(env);
      const signed = author.signatureEnabled ? `*${author.name}:*\n${text}` : text;
      const sent = hasMedia
        ? await uazapi.sendMedia({
            number,
            type: type === "voice" ? "ptt" : (type as "image" | "video" | "document"),
            file: await signedFileUrl(env, input.origin, messageId),
            // Nota de voz nao tem legenda; legenda vazia tambem nao leva a assinatura.
            ...(type !== "voice" && text ? { text: signed } : {}),
            ...(type === "document" && mediaName ? { docName: mediaName } : {}),
            replyId: quotedId ?? undefined,
          })
        : await uazapi.sendText({ number, text: signed, replyId: quotedId ?? undefined });
      status = "sent";
      patch = { externalId: sent.id, whatsappMessageId: sent.messageId };
    } catch (err) {
      status = err instanceof UazapiHttpError ? "failed" : "uncertain";
    }
  }
  try {
    await db.update(schema.message).set({ status, ...patch }).where(eq(schema.message.id, messageId));
  } catch {
    // Id da Uazapi ja usado por outra mensagem (unicidade): o envio aconteceu, entao o estado nao pode ficar "sending".
    await db.update(schema.message).set({ status }).where(eq(schema.message.id, messageId));
  }
  // Ponto unico da transicao para "aguardando cliente": todo envio ao cliente que nao falhou passa por aqui
  // (texto e reenvio; midia, citacao e resposta rapida entram por esta mesma funcao). Antes de carregar a
  // conversa, para o aviso de mensagem nova ja trazer o status novo.
  if (status !== "failed") await markReplied(env, db, conv.id, author.id);
  const message = await loadMessage(db, env.MEDIA, messageId);
  if (!message) return null;
  // Reenvio nao cria mensagem nova: so a primeira tentativa avisa as outras sessoes.
  if (!("messageId" in input)) {
    const conversation = await loadConversation(db, conv.id);
    if (conversation) await publish(env, { type: "message.created", conversation, message });
  }
  return message;
}
