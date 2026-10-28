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
