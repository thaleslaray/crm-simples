import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { loadConversation } from "./conversations";
import { createDb, type Db, schema } from "./db";
import type { EventType } from "./db/schema";
import { publish } from "./realtime";

/** Evento de sistema no formato da API (linha do tempo). */
export type TimelineEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

const actor = alias(schema.user, "actor");
const to = alias(schema.user, "to_user");
const from = alias(schema.user, "from_user");

const eventQuery = (db: Db) =>
  db
    .select({
      id: schema.conversationEvent.id,
      type: schema.conversationEvent.type,
      timestamp: schema.conversationEvent.timestamp,
      actorName: actor.name,
      toName: to.name,
      fromName: from.name,
    })
    .from(schema.conversationEvent)
    .leftJoin(actor, eq(actor.id, schema.conversationEvent.actorId))
    .leftJoin(to, eq(to.id, schema.conversationEvent.toUserId))
    .leftJoin(from, eq(from.id, schema.conversationEvent.fromUserId));

async function loadEvent(db: Db, id: string) {
  const [row] = await eventQuery(db).where(eq(schema.conversationEvent.id, id));
  return row ?? null;
}

export async function listEvents(db: Db, conversationId: string) {
  return eventQuery(db)
    .where(eq(schema.conversationEvent.conversationId, conversationId))
    .orderBy(asc(schema.conversationEvent.timestamp), asc(schema.conversationEvent.id));
}

type NewEvent = {
  conversationId: string;
  type: EventType;
  actorId: string | null;
  toUserId?: string | null;
  fromUserId?: string | null;
};

export async function recordEvent(db: Db, e: NewEvent): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.conversationEvent).values({ id, timestamp: Date.now(), ...e });
  return id;
}

/** Avisa o hub: a conversa ja com o novo status/responsavel e, se houve, o evento de sistema. */
export async function publishUpdate(env: Cloudflare.Env, db: Db, conversationId: string, eventId: string | null) {
  const [conversation, event] = await Promise.all([
    loadConversation(db, conversationId),
    eventId ? loadEvent(db, eventId) : null,
  ]);
  if (conversation) await publish(env, { type: "conversation.updated", conversation, event });
}

/**
 * Chamada pelo envio (send.ts) depois de uma mensagem ao cliente que NAO falhou; nota interna nunca chega aqui.
 * Aberta sem dono: o autor vira responsavel e a conversa vai a aguardando cliente (grava "assumida").
 * Em andamento: vai a aguardando cliente, sem evento (o vaivem automatico ja aparece nas mensagens).
 */
export async function markReplied(env: Cloudflare.Env, db: Db, conversationId: string, authorId: string): Promise<void> {
  const first = await db
    .update(schema.conversation)
    .set({ status: "aguardando_cliente", assigneeId: authorId })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.status, "aberta"),
        isNull(schema.conversation.assigneeId),
      ),
    )
    .returning({ id: schema.conversation.id });
  if (first.length > 0) {
    const eventId = await recordEvent(db, { conversationId, type: "assumida", actorId: authorId, toUserId: authorId });
    return publishUpdate(env, db, conversationId, eventId);
  }
  const back = await db
    .update(schema.conversation)
    .set({ status: "aguardando_cliente" })
    .where(and(eq(schema.conversation.id, conversationId), eq(schema.conversation.status, "em_andamento")))
    .returning({ id: schema.conversation.id });
  if (back.length > 0) await publishUpdate(env, db, conversationId, null);
}

/**
 * O cliente escreveu: resolvida ou aguardando cliente voltam a em andamento com o mesmo responsavel
 * (sem responsavel existente, a aberta sem dono). So a reabertura de resolvida (ou sem dono) grava evento.
 * Devolve o evento gravado (ou null), ou undefined se nada mudou.
 */
export async function reopenOnClientMessage(db: Db, conversationId: string): Promise<{ eventId: string | null } | undefined> {
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, conversationId) });
  if (!conv || (conv.status !== "resolvida" && conv.status !== "aguardando_cliente")) return undefined;
  const next = conv.assigneeId ? "em_andamento" : "aberta";
  const done = await db
    .update(schema.conversation)
    .set({ status: next })
    .where(and(eq(schema.conversation.id, conversationId), eq(schema.conversation.status, conv.status)))
    .returning({ id: schema.conversation.id });
  if (done.length === 0) return undefined;
  if (conv.status === "aguardando_cliente" && conv.assigneeId) return { eventId: null };
  const eventId = await recordEvent(db, { conversationId, type: "reaberta", actorId: null, toUserId: conv.assigneeId });
  return { eventId };
}

export type Outcome = "ok" | "not_found" | "taken" | "not_open";
export type ChangeOutcome = "ok" | "not_found" | "forbidden" | "bad_target" | "same" | "invalid_state" | "conflict";

type Actor = { id: string; role: "admin" | "atendente" };

/**
 * Atribui (sem responsavel, so admin) ou transfere (so o responsavel ou o admin) para um membro.
 * Aberta sem dono vira em andamento; nos demais casos o status se mantem. O UPDATE confere o responsavel lido,
 * entao uma troca concorrente de dono derruba esta com "conflict".
 */
export async function assignConversation(
  env: Cloudflare.Env,
  conversationId: string,
  by: Actor,
  targetId: string,
): Promise<ChangeOutcome> {
  const db = createDb(env.DB);
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, conversationId) });
  if (!conv) return "not_found";
  const unowned = conv.assigneeId === null;
  if (by.role !== "admin" && (unowned || conv.assigneeId !== by.id)) return "forbidden";
  const target = await db.query.user.findFirst({ where: eq(schema.user.id, targetId), columns: { id: true } });
  if (!target) return "bad_target";
  if (conv.assigneeId === targetId) return "same";

  const status = unowned && conv.status === "aberta" ? "em_andamento" : conv.status;
  const done = await db
    .update(schema.conversation)
    .set({ assigneeId: targetId, status })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        unowned ? isNull(schema.conversation.assigneeId) : eq(schema.conversation.assigneeId, conv.assigneeId!),
      ),
    )
    .returning({ id: schema.conversation.id });
  if (done.length === 0) return "conflict";
  const eventId = await recordEvent(db, {
    conversationId,
    type: unowned ? "atribuida" : "transferida",
    actorId: by.id,
    toUserId: targetId,
    fromUserId: conv.assigneeId,
  });
  await publishUpdate(env, db, conversationId, eventId);
  return "ok";
}

/** Resolve uma conversa em andamento ou aguardando cliente; so o responsavel ou o admin. */
export async function resolveConversation(env: Cloudflare.Env, conversationId: string, by: Actor): Promise<ChangeOutcome> {
  const db = createDb(env.DB);
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, conversationId) });
  if (!conv) return "not_found";
  if (by.role !== "admin" && conv.assigneeId !== by.id) return "forbidden";
  const done = await db
    .update(schema.conversation)
    .set({ status: "resolvida" })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        inArray(schema.conversation.status, ["em_andamento", "aguardando_cliente"]),
      ),
    )
    .returning({ id: schema.conversation.id });
  if (done.length === 0) return "invalid_state";
  const eventId = await recordEvent(db, { conversationId, type: "resolvida", actorId: by.id });
  await publishUpdate(env, db, conversationId, eventId);
  return "ok";
}

/**
 * Assumir e condicional: so tem efeito se a conversa ainda esta aberta e sem dono. Com dois atendentes ao mesmo tempo,
 * o UPDATE atomico deixa so um vencer; o outro recebe "taken".
 */
export async function assumeConversation(env: Cloudflare.Env, conversationId: string, userId: string): Promise<Outcome> {
  const db = createDb(env.DB);
  const won = await db
    .update(schema.conversation)
    .set({ status: "em_andamento", assigneeId: userId })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.status, "aberta"),
        isNull(schema.conversation.assigneeId),
      ),
    )
    .returning({ id: schema.conversation.id });
  if (won.length === 0) {
    const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.id, conversationId) });
    if (!conv) return "not_found";
    return conv.assigneeId ? "taken" : "not_open";
  }
  const eventId = await recordEvent(db, { conversationId, type: "assumida", actorId: userId, toUserId: userId });
  await publishUpdate(env, db, conversationId, eventId);
  return "ok";
}
