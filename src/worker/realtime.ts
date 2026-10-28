import { Hono } from "hono";
import type { ConnectionState } from "./connection";
import type { ContactView } from "./contacts";
import type { Conversation, Message } from "./conversations";
import type { Note } from "./notes";
import type { TimelineEvent } from "./status";
import { errorName } from "./errors";
import { type AppEnv, requireFreshAuth } from "./middleware";

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

const hub = (env: Cloudflare.Env) => env.INBOX_HUB.getByName("inbox");

/** Publica no hub. Falha aqui nunca derruba a escrita que ja foi gravada: o cliente se ressincroniza pela API. */
export async function publish(env: Cloudflare.Env, event: RealtimeEvent): Promise<void> {
  try {
    await hub(env).publish(event);
  } catch (err) {
    console.error("realtime: falha ao publicar", { tipo: event.type, erro: errorName(err) });
  }
}

/** Fecha os WebSockets de um membro (removido da equipe). Falha aqui nao desfaz a remocao: a sessao ja foi revogada. */
export async function closeSocketsOf(env: Cloudflare.Env, userId: string): Promise<void> {
  try {
    await hub(env).closeUser(userId);
  } catch (err) {
    console.error("realtime: falha ao fechar sockets", { erro: errorName(err) });
  }
}

export const realtime = new Hono<AppEnv>();

// Sessao validada ANTES do upgrade; sem ela, 401 e o hub nem e acordado.
// O hub guarda o id do membro no socket para poder fecha-lo se ele for removido.
realtime.get("/", requireFreshAuth, (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-user-id", c.get("user").id);
  return hub(c.env).fetch(new Request(c.req.raw, { headers }));
});
