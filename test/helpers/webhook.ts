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
  /** Resposta com citacao: `messageid` (ou `owner:messageid`) da mensagem citada. ATENCAO: campo `quoted` da doc da Uazapi, ainda nao validado com webhook real. */
  quoted?: string;
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
      ...(input.quoted ? { quoted: input.quoted } : {}),
      messageTimestamp: input.timestamp ?? 1_700_000_000_000 + seq * 1000,
    },
  };
}

export type MediaKind = "image" | "video" | "audio" | "ptt" | "document" | "sticker";

const MEDIA_TYPE_NAME: Record<MediaKind, string> = {
  image: "ImageMessage",
  video: "VideoMessage",
  audio: "AudioMessage",
  ptt: "AudioMessage",
  document: "DocumentMessage",
  sticker: "StickerMessage",
};

export interface MediaMessageInput extends TextMessageInput {
  kind: MediaKind;
  caption?: string;
  mimetype?: string;
  fileName?: string;
  fileLength?: number;
}

/**
 * Evento `messages` de midia. ATENCAO: o formato (`mediaType`, `content.*`) e o da doc/memoria da Uazapi,
 * ainda NAO validado com um webhook real (ticket 08, primeiro item).
 */
export function mediaMessageEvent(input: MediaMessageInput) {
  const base = textMessageEvent({ ...input, text: input.caption ?? "", messageType: MEDIA_TYPE_NAME[input.kind] });
  return {
    ...base,
    message: {
      ...base.message,
      mediaType: input.kind,
      // Padrao "agora": a midia so some do R2 depois de um ano.
      messageTimestamp: input.timestamp ?? Date.now(),
      content: {
        URL: "https://mmg.whatsapp.net/criptografado",
        mimetype: input.mimetype ?? "image/jpeg",
        fileLength: input.fileLength ?? 1234,
        ...(input.fileName ? { fileName: input.fileName } : {}),
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.kind === "ptt" ? { PTT: true } : {}),
      },
    },
  };
}

/** Eventos de localizacao e de contato (nao tem arquivo para baixar). */
export function locationMessageEvent(input: TextMessageInput & { lat: number; lng: number; name?: string; address?: string }) {
  const base = textMessageEvent({ ...input, text: "", messageType: "LocationMessage" });
  return {
    ...base,
    message: {
      ...base.message,
      messageTimestamp: input.timestamp ?? Date.now(),
      content: { degreesLatitude: input.lat, degreesLongitude: input.lng, name: input.name, address: input.address },
    },
  };
}

export function contactMessageEvent(input: TextMessageInput & { displayName: string; vcard: string }) {
  const base = textMessageEvent({ ...input, text: "", messageType: "ContactMessage" });
  return {
    ...base,
    message: {
      ...base.message,
      messageTimestamp: input.timestamp ?? Date.now(),
      content: { displayName: input.displayName, vcard: input.vcard },
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
