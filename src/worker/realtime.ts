import { Hono } from "hono";
import type { ConnectionState } from "./connection";
import type { Conversation, Message } from "./conversations";
import type { TimelineEvent } from "./status";
import { type AppEnv, requireAuth } from "./middleware";

/** Eventos publicados no hub. A conversa traz o `assigneeId`, que decide quem recebe som e aviso. */
export type RealtimeEvent =
  | { type: "message.created"; conversation: Conversation; message: Message }
  | { type: "message.status"; conversationId: string; messageId: string; status: NonNullable<Message["status"]> }
  // Status, responsavel ou nao lidas mudou; `event` e o evento de sistema da linha do tempo (ausente/nulo no vaivem automatico).
  | { type: "conversation.updated"; conversation: Conversation; event?: TimelineEvent | null }
  | { type: "connection.changed"; connection: ConnectionState };

const hub = (env: Cloudflare.Env) => env.INBOX_HUB.getByName("inbox");

/** Publica no hub. Falha aqui nunca derruba a escrita que ja foi gravada: o cliente se ressincroniza pela API. */
export async function publish(env: Cloudflare.Env, event: RealtimeEvent): Promise<void> {
  try {
    await hub(env).publish(event);
  } catch (err) {
    console.error("realtime: falha ao publicar", { tipo: event.type, erro: err instanceof Error ? err.name : "desconhecido" });
  }
}

export const realtime = new Hono<AppEnv>();

// Sessao validada ANTES do upgrade; sem ela, 401 e o hub nem e acordado.
realtime.get("/", requireAuth, (c) => hub(c.env).fetch(c.req.raw));
