import { env } from "cloudflare:workers";
import { api } from "./api";
import { type HistoryMessage, history, inbox } from "./conversations";
import { postWebhook, textMessageEvent } from "./webhook";

// Reações pela borda: o webhook da Uazapi (cliente) e a rota PUT do atendente.

export const CLIENTE = "5511900000010";

/** Evento `messages` de reação. ATENCAO: formato tolerante, ainda nao validado com webhook real. */
export function reactionEvent(input: {
  target: string;
  emoji: string;
  fromMe?: boolean;
  timestamp?: number;
  messageType?: string;
  /** Alvo no formato `content.key.ID` em vez de `reaction`. */
  viaKey?: boolean;
  isGroup?: boolean;
}) {
  const base = textMessageEvent({
    sender: `${CLIENTE}@s.whatsapp.net`,
    fromMe: input.fromMe,
    isGroup: input.isGroup,
    messageType: input.messageType ?? "ReactionMessage",
    text: input.emoji,
    timestamp: input.timestamp ?? Date.now(),
  });
  return {
    ...base,
    message: {
      ...base.message,
      ...(input.viaKey ? { content: { key: { ID: input.target }, text: input.emoji } } : { reaction: `owner:${input.target}` }),
    },
  };
}

/** O cliente manda uma mensagem (recente, para caber na janela de 7 dias) e devolve a conversa e a mensagem. */
export async function clientMessage(cookie: string, whatsappId = "ALVO1", timestamp = Date.now()) {
  await postWebhook(textMessageEvent({ sender: `${CLIENTE}@s.whatsapp.net`, id: `owner:${whatsappId}`, messageid: whatsappId, text: "oi", timestamp }));
  const conversa = (await inbox(cookie)).find((c) => c.contact.phone === CLIENTE)!.id;
  const mensagem = (await history(cookie, conversa)).messages.find((m) => m.direction === "in")!;
  return { conversa, mensagem };
}

export const reactionsOf = async (cookie: string, conversa: string, messageId: string): Promise<NonNullable<HistoryMessage["reactions"]>> =>
  (await history(cookie, conversa)).messages.find((m) => m.id === messageId)!.reactions!;

/** O atendente reage (ou remove, com ""), como o front faz. */
export function react(cookie: string, conversa: string, messageId: string, emoji: unknown) {
  return api(`/api/conversations/${conversa}/messages/${messageId}/reaction`, {
    method: "PUT",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ emoji }),
  });
}

/** Arrange: recua o horário da mensagem (a regra de 7 dias não tem como ser esperada de verdade). */
export async function ageMessage(whatsappId: string, ms: number) {
  await env.DB.prepare("UPDATE message SET timestamp = timestamp - ?1 WHERE whatsapp_message_id = ?2").bind(ms, whatsappId).run();
}
