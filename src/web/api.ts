// Cliente da API do CRM (mesma origem; o cookie de sessão vai sozinho).

export interface Conversation {
  id: string;
  status: ConversationStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  unreadCount: number;
  contact: { id: string; name: string | null; phone: string | null };
  lastMessage: { type: MessageType; text: string | null; timestamp: number } | null;
}

export type ConversationStatus = "aberta" | "em_andamento" | "aguardando_cliente" | "resolvida";

/** Evento de sistema da linha do tempo (assumir, atribuir, transferir, resolver, reabrir). */
export interface TimelineEvent {
  id: string;
  type: "assumida" | "atribuida" | "transferida" | "resolvida" | "reaberta";
  timestamp: number;
  actorName: string | null;
  toName: string | null;
  fromName: string | null;
}

export interface Member {
  id: string;
  name: string;
  role: "admin" | "atendente";
}

/** Filtros da caixa: status e responsável ("me", "none" ou o id do membro). */
export interface InboxFilter {
  status: ConversationStatus | "";
  assignee: string;
}

export type MessageType =
  | "text" | "image" | "video" | "audio" | "voice" | "document" | "sticker" | "location" | "contact" | "unsupported";

export interface MessageMedia {
  status: "pending" | "available" | "failed" | "expired";
  mime: string | null;
  size: number | null;
  name: string | null;
}

export interface Message {
  id: string;
  direction: "in" | "out";
  type: MessageType;
  text: string | null;
  /** Só mensagens de saída: enviando, enviada, entregue, lida, reproduzida, falhou (recusa) ou incerto (timeout). */
  status?: SendStatus | null;
  authorName?: string | null;
  timestamp: number;
  media: MessageMedia | null;
  location: { lat: number; lng: number; name: string | null; address: string | null } | null;
  contact: { name: string | null; phone: string | null } | null;
  /** Mensagem citada (some se a original é anterior à conexão do número). */
  quote?: MessageQuote | null;
}

export interface MessageQuote {
  id: string;
  type: MessageType;
  text: string | null;
  direction: "in" | "out";
  authorName: string | null;
}

export type SendStatus = "sending" | "sent" | "delivered" | "read" | "played" | "failed" | "uncertain";

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

/** Conexão do número do WhatsApp. `unknown` = ainda sem informação (nenhum aviso é mostrado). */
export interface ConnectionState {
  status: "connected" | "connecting" | "disconnected" | "unknown";
  temporaryBan: boolean;
  lastDisconnectReason: string | null;
  updatedAt: number | null;
}

export interface ConnectionWithQr {
  connection: ConnectionState;
  qrcode?: string;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Falha na API (${status})`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

async function sendJson<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

export const api = {
  sendText: (id: string, text: string, replyTo?: string) =>
    sendJson<{ message: Message }>("POST", `/api/conversations/${encodeURIComponent(id)}/messages`, { text, replyTo }),
  /** Anexo (legenda opcional) ou nota de voz (`voice`, sem legenda). */
  sendMedia: async (id: string, file: File, opts: { text?: string; voice?: boolean; replyTo?: string } = {}) => {
    const form = new FormData();
    form.set("file", file);
    if (opts.text) form.set("text", opts.text);
    if (opts.voice) form.set("voice", "1");
    if (opts.replyTo) form.set("replyTo", opts.replyTo);
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status);
    return (await res.json()) as { message: Message };
  },
  resend: (id: string, messageId: string) =>
    sendJson<{ message: Message }>(
      "POST",
      `/api/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/resend`,
      {},
    ),
  me: () => getJson<{ user: { role: "admin" | "atendente" } }>("/api/me"),
  quickReplies: () => getJson<{ quickReplies: QuickReply[] }>("/api/quick-replies"),
  createQuickReply: (r: { shortcut: string; text: string }) =>
    sendJson<{ quickReply: QuickReply }>("POST", "/api/quick-replies", r),
  updateQuickReply: (id: string, r: { shortcut: string; text: string }) =>
    sendJson<{ quickReply: QuickReply }>("PATCH", `/api/quick-replies/${encodeURIComponent(id)}`, r),
  deleteQuickReply: (id: string) => sendJson<{ ok: true }>("DELETE", `/api/quick-replies/${encodeURIComponent(id)}`, {}),
  /** Abrir a conversa: zera as não lidas e marca como lidas no WhatsApp. */
  markRead: (id: string) => sendJson<{ ok: true }>("POST", `/api/conversations/${encodeURIComponent(id)}/read`, {}),
  preferences: () => getJson<{ signatureEnabled: boolean }>("/api/me/preferences"),
  setSignature: (signatureEnabled: boolean) =>
    sendJson<{ signatureEnabled: boolean }>("PATCH", "/api/me/preferences", { signatureEnabled }),
  conversations: (filter?: InboxFilter) => {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set("status", filter.status);
    if (filter?.assignee) qs.set("assignee", filter.assignee);
    return getJson<{ conversations: Conversation[] }>(`/api/conversations${qs.size ? `?${qs}` : ""}`);
  },
  members: () => getJson<{ members: Member[] }>("/api/members"),
  events: (id: string) => getJson<{ events: TimelineEvent[] }>(`/api/conversations/${encodeURIComponent(id)}/events`),
  assume: (id: string) =>
    sendJson<{ conversation: Conversation }>("POST", `/api/conversations/${encodeURIComponent(id)}/assume`, {}),
  assign: (id: string, userId: string) =>
    sendJson<{ conversation: Conversation }>("POST", `/api/conversations/${encodeURIComponent(id)}/assign`, { userId }),
  resolve: (id: string) =>
    sendJson<{ conversation: Conversation }>("POST", `/api/conversations/${encodeURIComponent(id)}/resolve`, {}),
  connection: () => getJson<{ connection: ConnectionState }>("/api/connection"),
  /** Só admin: consulta a Uazapi e devolve o QR code atual. */
  connectionStatus: () => getJson<ConnectionWithQr>("/api/connection/status"),
  /** Só admin: inicia o pareamento. */
  connect: () => sendJson<ConnectionWithQr>("POST", "/api/connection/connect", {}),
  conversation: (id: string) => getJson<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}`),
  messages: (id: string, before?: string) => {
    const qs = before ? `?before=${encodeURIComponent(before)}` : "";
    return getJson<{ messages: Message[]; nextBefore: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages${qs}`,
    );
  },
  /** Janela do histórico centrada numa mensagem (resultado de busca). */
  messagesAround: (id: string, messageId: string) =>
    getJson<{ messages: Message[]; nextBefore: string | null; nextAfter: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages?around=${encodeURIComponent(messageId)}`,
    ),
  messagesNewer: (id: string, after: string) =>
    getJson<{ messages: Message[]; nextAfter: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages?after=${encodeURIComponent(after)}`,
    ),
  search: (q: string) => getJson<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
  /** Mensagens depois da última vista (ressincronização ao reconectar). */
  messagesAfter: (id: string, last: Message) => {
    const qs = `?after=${encodeURIComponent(`${last.timestamp}:${last.id}`)}`;
    return getJson<{ messages: Message[]; nextBefore: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages${qs}`,
    );
  },
};

export interface SearchResults {
  contacts: Conversation[];
  messages: {
    messageId: string;
    conversationId: string;
    contact: Conversation["contact"];
    /** Trecho com o termo entre \u0001 e \u0002. */
    snippet: string;
    timestamp: number;
  }[];
}
