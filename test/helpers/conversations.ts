import { api } from "./api";

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
