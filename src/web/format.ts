// Formatação de exibição (pt-BR).
import type { Conversation, MessageType } from "./api";

/** "+55 11 98765-4321" para números brasileiros; outros ficam só com o "+". */
export function formatPhone(phone: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${phone}`;
}

export function contactLabel(contact: Conversation["contact"]): string {
  return contact.name?.trim() || (contact.phone ? formatPhone(contact.phone) : "Contato sem nome");
}

export function initials(label: string): string {
  const words = label.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "#";
  return (words[0]![0]! + (words.length > 1 ? words.at(-1)![0]! : "")).toUpperCase();
}

const TYPE_LABEL: Record<Exclude<MessageType, "text">, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  voice: "Nota de voz",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato",
  unsupported: "Tipo de mensagem não suportado ainda",
};

/** Prévia de uma linha: o texto/legenda quando houver, senão o nome do tipo. */
export function messagePreview(type: MessageType, text: string | null): string {
  if (type === "text") return text ?? "";
  return text ? `${TYPE_LABEL[type]}: ${text}` : TYPE_LABEL[type];
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DAY = 86_400_000;

/** Horário curto da caixa de entrada: hora se for hoje, "Ontem", senão a data. */
export function listTime(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const diff = startOfDay(now) - startOfDay(d);
  if (diff <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === DAY) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function messageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Rótulo do separador de dia na conversa. */
export function dayLabel(ts: number, now = new Date()): string {
  const diff = startOfDay(now) - startOfDay(new Date(ts));
  if (diff <= 0) return "Hoje";
  if (diff === DAY) return "Ontem";
  return new Date(ts).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}
