import { env } from "cloudflare:workers";
import { postJson } from "./api";

let seq = 0;

export interface TextMessageInput {
  id?: string;
  messageid?: string;
  chatid?: string;
  sender?: string;
  sender_pn?: string;
  sender_lid?: string;
  senderName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  messageType?: string;
  text?: string;
  timestamp?: number;
  token?: string;
}

/** Evento `messages` no formato da Uazapi, com padroes de uma mensagem de texto de um cliente. */
export function textMessageEvent(input: TextMessageInput = {}) {
  seq++;
  const sender = input.sender ?? "5511999990001@s.whatsapp.net";
  return {
    EventType: "messages",
    token: input.token ?? env.UAZAPI_INSTANCE_TOKEN,
    message: {
      id: input.id ?? `owner:MSG${seq}`,
      messageid: input.messageid ?? `MSG${seq}`,
      chatid: input.chatid ?? sender,
      sender,
      ...(input.sender_pn ? { sender_pn: input.sender_pn } : {}),
      ...(input.sender_lid ? { sender_lid: input.sender_lid } : {}),
      senderName: input.senderName ?? "Cliente Teste",
      fromMe: input.fromMe ?? false,
      isGroup: input.isGroup ?? false,
      messageType: input.messageType ?? "conversation",
      text: input.text ?? "oi",
      messageTimestamp: input.timestamp ?? 1_700_000_000_000 + seq * 1000,
    },
  };
}

/** Evento `connection` no formato da Uazapi. */
export function connectionEvent(input: { status: string; type?: string; lastDisconnectReason?: string; token?: string }) {
  return {
    EventType: "connection",
    token: input.token ?? env.UAZAPI_INSTANCE_TOKEN,
    instance: { status: input.status },
    ...(input.type ? { type: input.type } : {}),
    ...(input.lastDisconnectReason ? { lastDisconnectReason: input.lastDisconnectReason } : {}),
  };
}

/** Chama o webhook como a Uazapi chamaria (segredo da URL + token no corpo). */
export function postWebhook(body: unknown, secret: string = env.WEBHOOK_URL_SECRET) {
  return postJson(`/api/webhook/${secret}`, body);
}
