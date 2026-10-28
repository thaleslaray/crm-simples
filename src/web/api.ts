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

async function postJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

export const api = {
  connection: () => getJson<{ connection: ConnectionState }>("/api/connection"),
  /** Só admin: consulta a Uazapi e devolve o QR code atual. */
  connectionStatus: () => getJson<ConnectionWithQr>("/api/connection/status"),
  /** Só admin: inicia o pareamento. */
  connect: () => postJson<ConnectionWithQr>("/api/connection/connect"),
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
