import { and, eq } from "drizzle-orm";
import { loadConversation, loadMessage, type Message } from "./conversations";
import { createDb, schema } from "./db";
import { publish } from "./realtime";
import { markReplied } from "./status";
import type { SendStatus } from "./db/schema";
import { createUazapiClient, UazapiHttpError } from "./uazapi/client";

type Input = { conversationId: string; userId: string } & ({ text: string } | { messageId: string });

/**
 * Envia texto do atendente. Grava como "sending", chama a Uazapi e atualiza:
 * sucesso -> sent (com o id da Uazapi); recusa HTTP -> failed (reenvio manual); timeout ou erro de rede -> uncertain
 * (a Uazapi pode ter entregue: nunca reenviado automaticamente, e o reenvio manual só vale para "failed").
 * Com `messageId` reenvia uma mensagem "failed". Devolve null se conversa/mensagem não existe e "not_failed"
 * se a mensagem não está em "failed".
 */
export async function sendOutgoingText(env: Cloudflare.Env, input: Input): Promise<Message | "not_failed" | null> {
  const db = createDb(env.DB);
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, input.conversationId) });
  if (!conv) return null;
  const contact = await db.query.contact.findFirst({ where: eq(schema.contact.id, conv.contactId) });
  const author = await db.query.user.findFirst({ where: eq(schema.user.id, input.userId) });
  if (!contact || !author) return null;

  let messageId: string;
  let text: string;
  let timestamp: number;
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
  } else {
    messageId = crypto.randomUUID();
    text = input.text;
    timestamp = Date.now();
    await db.insert(schema.message).values({
      id: messageId,
      conversationId: conv.id,
      direction: "out",
      status: "sending",
      sentById: author.id,
      type: "text",
      text,
      timestamp,
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
      const sent = await createUazapiClient(env).sendText({
        number,
        text: author.signatureEnabled ? `*${author.name}:*\n${text}` : text,
      });
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
