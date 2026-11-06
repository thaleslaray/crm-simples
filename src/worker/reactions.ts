import { and, eq, inArray, lte } from "drizzle-orm";
import { type Db, schema } from "./db";
import type { ReactionSide } from "./db/schema";
import { publish } from "./realtime";

/** Reacao de uma mensagem no formato da API. `userId`/`userName`: atendente da reacao da equipe; nulos para o cliente ou o celular. */
export interface Reaction {
  side: ReactionSide;
  emoji: string;
  userId: string | null;
  userName: string | null;
}

// O D1 aceita no maximo 100 parametros por consulta.
const CHUNK = 90;

/** Reacoes de varias mensagens em poucas consultas (uma por lote de ids), sem N+1. Mensagem sem reacao fica fora do mapa. */
export async function loadReactions(db: Db, messageIds: string[]): Promise<Map<string, Reaction[]>> {
  const byMessage = new Map<string, Reaction[]>();
  for (let i = 0; i < messageIds.length; i += CHUNK) {
    const rows = await db
      .select({ messageId: schema.messageReaction.messageId, side: schema.messageReaction.side, emoji: schema.messageReaction.emoji, userId: schema.messageReaction.userId, userName: schema.user.name })
      .from(schema.messageReaction)
      .leftJoin(schema.user, eq(schema.user.id, schema.messageReaction.userId))
      .where(inArray(schema.messageReaction.messageId, messageIds.slice(i, i + CHUNK)));
    for (const { messageId, ...reaction } of rows) byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), reaction]);
  }
  // Ordem estavel: cliente antes da equipe.
  for (const list of byMessage.values()) list.sort((a, b) => a.side.localeCompare(b.side));
  return byMessage;
}

export async function reactionsOf(db: Db, messageId: string): Promise<Reaction[]> {
  return (await loadReactions(db, [messageId])).get(messageId) ?? [];
}

/**
 * Grava a reacao do lado (a nova substitui a anterior) ou, com emoji vazio, remove. Idempotente por (mensagem, lado).
 * Evento mais antigo que o ja gravado e ignorado (webhook atrasado nao desfaz a reacao mais nova).
 */
export async function applyReaction(
  db: Db,
  input: { messageId: string; side: ReactionSide; emoji: string; userId: string | null; timestamp: number },
): Promise<void> {
  const { messageId, side, emoji, userId, timestamp } = input;
  if (!emoji) {
    await db
      .delete(schema.messageReaction)
      .where(and(eq(schema.messageReaction.messageId, messageId), eq(schema.messageReaction.side, side), lte(schema.messageReaction.timestamp, timestamp)));
    return;
  }
  await db
    .insert(schema.messageReaction)
    .values({ id: crypto.randomUUID(), messageId, side, emoji, userId, timestamp })
    .onConflictDoUpdate({
      target: [schema.messageReaction.messageId, schema.messageReaction.side],
      set: { emoji, userId, timestamp },
      setWhere: lte(schema.messageReaction.timestamp, timestamp),
    });
}

/** Avisa o hub com a lista completa e atual de reacoes da mensagem. Depois de gravar. */
export async function publishReactions(env: Cloudflare.Env, db: Db, conversationId: string, messageId: string): Promise<Reaction[]> {
  const reactions = await reactionsOf(db, messageId);
  await publish(env, { type: "message.reactions", conversationId, messageId, reactions });
  return reactions;
}
