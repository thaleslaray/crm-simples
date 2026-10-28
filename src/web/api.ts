// Cliente da API do CRM (mesma origem; o cookie de sessão vai sozinho).

export interface Conversation {
  id: string;
  status: "aberta";
  assigneeId: string | null;
  contact: { id: string; name: string | null; phone: string | null };
  lastMessage: { type: MessageType; text: string | null; timestamp: number } | null;
}

export type MessageType = "text" | "unsupported";

export interface Message {
  id: string;
  direction: "in";
  type: MessageType;
  text: string | null;
  timestamp: number;
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

export const api = {
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
