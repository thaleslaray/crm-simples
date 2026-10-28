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
  direction: "in" | "out";
  type: MessageType;
  text: string | null;
  /** Só mensagens de saída: enviando, enviada, falhou (recusa) ou incerto (timeout). */
  status?: SendStatus | null;
  authorName?: string | null;
  timestamp: number;
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
  sendText: (id: string, text: string) =>
    sendJson<{ message: Message }>("POST", `/api/conversations/${encodeURIComponent(id)}/messages`, { text }),
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
  /** Mensagens depois da última vista (ressincronização ao reconectar). */
  messagesAfter: (id: string, last: Message) => {
    const qs = `?after=${encodeURIComponent(`${last.timestamp}:${last.id}`)}`;
    return getJson<{ messages: Message[]; nextBefore: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages${qs}`,
    );
  },
};
