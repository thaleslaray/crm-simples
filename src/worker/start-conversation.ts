import { and, eq } from "drizzle-orm";
import { normalizePhone } from "../shared/phone";
import { type Conversation, loadConversation, type Message } from "./conversations";
import { createDb, schema } from "./db";
import { sendOutgoingText } from "./send";
import { publishUpdate, recordEvent } from "./status";

type Input = { userId: string; origin: string; text: string } & ({ contactId: string } | { phone: string });
export type StartOutcome =
  | { ok: true; conversation: Conversation; message: Message; created: boolean }
  | { ok: false; error: "numero_invalido" | "contato_nao_encontrado" };

/**
 * Inicia (ou retoma) a conversa com um contato e envia a primeira mensagem pelo envio de sempre (send.ts).
 * Numero novo cria o contato. Conversa nova nasce em andamento com quem iniciou; conversa resolvida volta a
 * andamento com ele; as demais ficam como estao (o envio cuida de "aberta" sem dono e de "aguardando cliente").
 */
export async function startConversation(env: Cloudflare.Env, input: Input): Promise<StartOutcome> {
  const db = createDb(env.DB);
  let contactId: string;
  if ("contactId" in input) {
    const found = await db.query.contact.findFirst({ where: eq(schema.contact.id, input.contactId), columns: { id: true } });
    if (!found) return { ok: false, error: "contato_nao_encontrado" };
    contactId = found.id;
  } else {
    const phone = normalizePhone(input.phone);
    if (!phone) return { ok: false, error: "numero_invalido" };
    await db
      .insert(schema.contact)
      .values({ id: crypto.randomUUID(), phone, jidPn: `${phone}@s.whatsapp.net`, createdAt: Date.now() })
      .onConflictDoNothing();
    const contact = await db.query.contact.findFirst({ where: eq(schema.contact.phone, phone), columns: { id: true } });
    contactId = contact!.id;
  }

  let conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.contactId, contactId) });
  let created = false;
  if (!conv) {
    const id = crypto.randomUUID();
    const inserted = await db
      .insert(schema.conversation)
      .values({ id, contactId, status: "em_andamento", assigneeId: input.userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .returning({ id: schema.conversation.id });
    created = inserted.length > 0;
    conv = (await db.query.conversation.findFirst({ where: eq(schema.conversation.contactId, contactId) }))!;
    if (created) {
      const eventId = await recordEvent(db, { conversationId: id, type: "assumida", actorId: input.userId, toUserId: input.userId });
      await publishUpdate(env, db, id, eventId);
    }
  } else if (conv.status === "resolvida") {
    // Condicional ao status lido: se o cliente escreveu (e reabriu) no meio, este UPDATE nao atropela.
    const reopened = await db
      .update(schema.conversation)
      .set({ status: "em_andamento", assigneeId: input.userId })
      .where(and(eq(schema.conversation.id, conv.id), eq(schema.conversation.status, "resolvida")))
      .returning({ id: schema.conversation.id });
    if (reopened.length > 0) {
      const reopenedId = await recordEvent(db, { conversationId: conv.id, type: "reaberta", actorId: input.userId, toUserId: input.userId });
      await publishUpdate(env, db, conv.id, reopenedId);
      if (conv.assigneeId && conv.assigneeId !== input.userId) {
        // +1 ms: a linha do tempo ordena por horario, e a troca vem depois da reabertura.
        const transferredId = await recordEvent(db, {
          conversationId: conv.id,
          type: "transferida",
          actorId: input.userId,
          toUserId: input.userId,
          fromUserId: conv.assigneeId,
          timestamp: Date.now() + 1,
        });
        await publishUpdate(env, db, conv.id, transferredId);
      }
    }
  }

  const message = await sendOutgoingText(env, { conversationId: conv.id, userId: input.userId, origin: input.origin, text: input.text });
  if (!message || typeof message === "string") return { ok: false, error: "contato_nao_encontrado" };
  const conversation = (await loadConversation(db, conv.id))!;
  return { ok: true, conversation, message, created };
}
