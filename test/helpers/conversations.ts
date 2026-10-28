import { api, postJson } from "./api";
import { postWebhook, textMessageEvent } from "./webhook";

// Leitura da caixa de entrada e do histórico pela API, como o front faz.

export interface InboxConversation {
  id: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  contact: { id: string; name: string | null; phone: string | null };
  lastMessage: { type: string; text: string | null; timestamp: number } | null;
  unreadCount: number;
}

export interface HistoryMessage {
  id: string;
  text: string | null;
  type: string;
  direction: string;
  status?: string | null;
  authorName?: string | null;
  sentById?: string | null;
  timestamp: number;
  media: { status: "pending" | "available" | "failed" | "expired"; mime: string | null; size: number | null; name: string | null } | null;
  location: { lat: number; lng: number; name: string | null; address: string | null } | null;
  contact: { name: string | null; phone: string | null } | null;
  quote?: { id: string; type: string; text: string | null; direction: string; authorName: string | null } | null;
}

export async function inbox(cookie: string): Promise<InboxConversation[]> {
  const res = await api("/api/conversations", { cookie });
  return ((await res.json()) as { conversations: InboxConversation[] }).conversations;
}

export async function history(cookie: string, conversationId: string, query = "") {
  const res = await api(`/api/conversations/${conversationId}/messages${query}`, { cookie });
  return (await res.json()) as { messages: HistoryMessage[]; nextBefore: string | null };
}

/** Janela do historico ao redor de uma mensagem (resultado de busca). */
export async function historyAround(cookie: string, conversationId: string, messageId: string, limit = 10) {
  const res = await api(`/api/conversations/${conversationId}/messages?around=${encodeURIComponent(messageId)}&limit=${limit}`, { cookie });
  return {
    status: res.status,
    body: (await res.json()) as { messages: HistoryMessage[]; nextBefore: string | null; nextAfter: string | null },
  };
}

export interface SearchResult {
  contacts: InboxConversation[];
  messages: {
    messageId: string;
    conversationId: string;
    contact: { id: string; name: string | null; phone: string | null };
    snippet: string;
    timestamp: number;
  }[];
}

export async function search(cookie: string, q: string): Promise<{ status: number; body: SearchResult }> {
  const res = await api(`/api/search?q=${encodeURIComponent(q)}`, { cookie });
  return { status: res.status, body: (await res.json()) as SearchResult };
}

/** Cliente manda uma mensagem pelo webhook e devolve o id da conversa criada. */
export async function conversationWithClient(cookie: string, phone = "5511900000010"): Promise<string> {
  await postWebhook(textMessageEvent({ sender: `${phone}@s.whatsapp.net`, text: "oi", senderName: "Cliente" }));
  const conversa = (await inbox(cookie)).find((c) => c.contact.phone === phone);
  return conversa!.id;
}

/** O atendente envia texto pela API, como o front faz. */
export function sendText(cookie: string, conversationId: string, text: string, replyTo?: string) {
  return postJson(`/api/conversations/${conversationId}/messages`, { text, ...(replyTo ? { replyTo } : {}) }, { cookie });
}

/** O atendente abre a conversa: o front chama isto para zerar não lidas e marcar como lidas no WhatsApp. */
export function openConversation(cookie: string, conversationId: string) {
  return postJson(`/api/conversations/${conversationId}/read`, {}, { cookie });
}

export function resend(cookie: string, conversationId: string, messageId: string) {
  return postJson(`/api/conversations/${conversationId}/messages/${messageId}/resend`, {}, { cookie });
}

/** O atendente anexa um arquivo (ou grava uma nota de voz) pelo formulário multipart, como o front faz. */
export function sendMedia(
  cookie: string,
  conversationId: string,
  input: { name: string; mime: string; content: string; caption?: string; voice?: boolean; replyTo?: string },
) {
  const form = new FormData();
  form.set("file", new File([input.content], input.name, { type: input.mime }));
  if (input.caption !== undefined) form.set("text", input.caption);
  if (input.voice) form.set("voice", "1");
  if (input.replyTo) form.set("replyTo", input.replyTo);
  return api(`/api/conversations/${conversationId}/messages`, { method: "POST", cookie, body: form });
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

// ---- Status e responsavel ----

export interface TimelineEvent {
  id: string;
  type: "assumida" | "atribuida" | "transferida" | "resolvida" | "reaberta" | "devolvida";
  timestamp: number;
  actorName: string | null;
  toName: string | null;
  fromName: string | null;
}

/** O cliente escreve de novo (webhook), como a Uazapi entregaria. */
export async function clientWritesAgain(phone = "5511900000010", text = "voltei") {
  await postWebhook(textMessageEvent({ sender: `${phone}@s.whatsapp.net`, text, senderName: "Cliente" }));
}

export function assume(cookie: string, conversationId: string) {
  return postJson(`/api/conversations/${conversationId}/assume`, {}, { cookie });
}

/** Atribui (conversa sem responsavel) ou transfere (com responsavel) para um membro. */
export function assign(cookie: string, conversationId: string, userId: string) {
  return postJson(`/api/conversations/${conversationId}/assign`, { userId }, { cookie });
}

export function resolve(cookie: string, conversationId: string) {
  return postJson(`/api/conversations/${conversationId}/resolve`, {}, { cookie });
}

export async function events(cookie: string, conversationId: string): Promise<TimelineEvent[]> {
  const res = await api(`/api/conversations/${conversationId}/events`, { cookie });
  return ((await res.json()) as { events: TimelineEvent[] }).events;
}

export async function conversationOf(cookie: string, conversationId: string): Promise<InboxConversation> {
  const res = await api(`/api/conversations/${conversationId}`, { cookie });
  return ((await res.json()) as { conversation: InboxConversation }).conversation;
}

export async function inboxFiltered(cookie: string, query: string): Promise<InboxConversation[]> {
  const res = await api(`/api/conversations?${query}`, { cookie });
  return ((await res.json()) as { conversations: InboxConversation[] }).conversations;
}

/** O atendente inicia uma conversa pela API (contato existente por `contactId` ou numero digitado em `phone`). */
export function startConversation(cookie: string, body: { contactId?: string; phone?: string; text: string }) {
  return postJson("/api/conversations/start", body, { cookie });
}
