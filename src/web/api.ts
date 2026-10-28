// Cliente da API do CRM (mesma origem; o cookie de sessão vai sozinho).

export interface Conversation {
  id: string;
  status: "aberta";
  assigneeId: string | null;
  contact: { id: string; name: string | null; phone: string | null };
  lastMessage: { type: MessageType; text: string | null; timestamp: number } | null;
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
  /** Só mensagens de saída: enviando, enviada, falhou (recusa) ou incerto (timeout). */
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

export type SendStatus = "sending" | "sent" | "failed" | "uncertain";

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
  resend: (id: string, messageId: string) =>
    sendJson<{ message: Message }>(
      "POST",
      `/api/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/resend`,
      {},
    ),
  preferences: () => getJson<{ signatureEnabled: boolean }>("/api/me/preferences"),
  setSignature: (signatureEnabled: boolean) =>
    sendJson<{ signatureEnabled: boolean }>("PATCH", "/api/me/preferences", { signatureEnabled }),
  conversations: () => getJson<{ conversations: Conversation[] }>("/api/conversations"),
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
