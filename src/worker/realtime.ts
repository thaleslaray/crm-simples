import { Hono } from "hono";
import type { Conversation, Message } from "./conversations";
import { type AppEnv, requireAuth } from "./middleware";

/** Eventos publicados no hub. A conversa traz o `assigneeId`, que decide quem recebe som e aviso. */
export type RealtimeEvent = { type: "message.created"; conversation: Conversation; message: Message };

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
