import { api, postJson } from "./api";
import { postWebhook, textMessageEvent } from "./webhook";

// Leitura da caixa de entrada e do histórico pela API, como o front faz.

export interface InboxConversation {
  id: string;
  status: string;
  assigneeId: string | null;
  contact: { id: string; name: string | null; phone: string | null };
  lastMessage: { type: string; text: string | null; timestamp: number } | null;
}

export interface HistoryMessage {
  id: string;
  text: string | null;
  type: string;
  direction: string;
  status?: string | null;
  authorName?: string | null;
  timestamp: number;
}

export async function inbox(cookie: string): Promise<InboxConversation[]> {
  const res = await api("/api/conversations", { cookie });
  return ((await res.json()) as { conversations: InboxConversation[] }).conversations;
}

export async function history(cookie: string, conversationId: string, query = "") {
  const res = await api(`/api/conversations/${conversationId}/messages${query}`, { cookie });
  return (await res.json()) as { messages: HistoryMessage[]; nextBefore: string | null };
}

/** Cliente manda uma mensagem pelo webhook e devolve o id da conversa criada. */
export async function conversationWithClient(cookie: string, phone = "5511900000010"): Promise<string> {
  await postWebhook(textMessageEvent({ sender: `${phone}@s.whatsapp.net`, text: "oi", senderName: "Cliente" }));
  const conversa = (await inbox(cookie)).find((c) => c.contact.phone === phone);
  return conversa!.id;
}

/** O atendente envia texto pela API, como o front faz. */
export function sendText(cookie: string, conversationId: string, text: string) {
  return postJson(`/api/conversations/${conversationId}/messages`, { text }, { cookie });
}

export function resend(cookie: string, conversationId: string, messageId: string) {
  return postJson(`/api/conversations/${conversationId}/messages/${messageId}/resend`, {}, { cookie });
}

/** Preferência de assinatura do atendente logado, como a tela de perfil faz. */
export function setSignature(cookie: string, enabled: boolean) {
  return api("/api/me/preferences", {
    method: "PATCH",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signatureEnabled: enabled }),
  });
}
