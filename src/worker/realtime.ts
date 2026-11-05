import { Hono } from "hono";
import type { ConnectionState } from "./connection";
import type { ContactView } from "./contacts";
import type { Conversation, Message } from "./conversations";
import type { Note } from "./notes";
import type { TimelineEvent } from "./status";
import { errorName } from "./errors";
import { createAuth } from "./auth";
import { type AppEnv, requireFreshAuth } from "./middleware";
import { hub } from "./realtime-hub";

/** Eventos publicados no hub. A conversa traz o `assigneeId`, que decide quem recebe som e aviso. */
export type RealtimeEvent =
  | { type: "message.created"; conversation: Conversation; message: Message }
  | { type: "message.status"; conversationId: string; messageId: string; status: NonNullable<Message["status"]> }
  // Status, responsavel ou nao lidas mudou; `event` e o evento de sistema da linha do tempo (ausente/nulo no vaivem automatico).
  | { type: "conversation.updated"; conversation: Conversation; event?: TimelineEvent | null }
  | { type: "note.created"; conversationId: string; note: Note }
  | { type: "contact.updated"; contact: ContactView }
  // Etiqueta criada, renomeada, recolorida ou apagada: o cliente busca as etiquetas e a lista de novo.
  | { type: "labels.changed" }
  // Funil, etapa ou card mudou (inclusive apagar): o cliente busca o quadro e a ficha de novo.
  | { type: "funnel.changed"; funnelId: string }
  | { type: "connection.changed"; connection: ConnectionState }
  // O admin trocou o nome da empresa: os clientes trocam o titulo sem recarregar.
  | { type: "workspace.changed"; companyName: string };


/** Publica no hub. Falha aqui nunca derruba a escrita que ja foi gravada: o cliente se ressincroniza pela API. */
export async function publish(env: Cloudflare.Env, event: RealtimeEvent): Promise<void> {
  try {
    await hub(env).publish(event);
  } catch (err) {
    console.error("realtime: falha ao publicar", { tipo: event.type, erro: errorName(err) });
  }
}

export const realtime = new Hono<AppEnv>();

// Sessao validada ANTES do upgrade; sem ela, 401 e o hub nem e acordado.
// O hub guarda no socket o membro, a sessao e o vencimento, para fecha-lo se o acesso for revogado.
realtime.get("/", requireFreshAuth, async (c) => {
  // Cross-site WebSocket hijacking: o cookie vai junto de qualquer site, entao o Origin tem que ser o nosso host.
  const origin = c.req.header("origin");
  if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: "origem_invalida" }, 403);
  const headers = new Headers(c.req.raw.headers);
  // O requireFreshAuth ja validou; aqui so se le o id e o vencimento da sessao, que o hub guarda no socket.
  const current = await (await createAuth(c.env, c.req.url)).api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } });
  if (!current) return c.json({ error: "nao_autenticado" }, 401);
  headers.set("x-user-id", c.get("user").id);
  headers.set("x-session-id", current.session.id);
  headers.set("x-session-expires-at", String(new Date(current.session.expiresAt).getTime()));
  return await hub(c.env).fetch(new Request(c.req.raw, { headers }));
});
