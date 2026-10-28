import { and, eq, lt } from "drizzle-orm";
import { loadConversation, loadMessage } from "./conversations";
import { createDb, type Db, schema } from "./db";
import { ingestMessage } from "./ingest";
import { publish } from "./realtime";
import { getUazapiClient } from "./uazapi/config";
import { errorName } from "./errors";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
/** Margem sobre a ultima conferencia: cobre atraso de entrega e diferenca de relogio. */
const MARGIN_MS = 10 * 60_000;
/** Sem conferencia anterior (primeira vez), olha so a ultima hora; nunca mais que um dia. */
const FIRST_WINDOW_MS = 60 * 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60_000;
/** Midia pendente mais velha que isso perdeu o job (o consumer faz retries por poucos minutos). */
const STALE_MEDIA_MS = 10 * 60_000;
const REQUEUE_LIMIT = 50;
const ROW_ID = "inbox";

/** Busca na Uazapi o que chegou desde a ultima conferencia e ingere pelo caminho idempotente do webhook. */
async function recoverMessages(env: Cloudflare.Env, db: Db, now: number): Promise<void> {
  const state = await db.query.reconciliationState.findFirst({ where: eq(schema.reconciliationState.id, ROW_ID) });
  const since = Math.max(now - MAX_WINDOW_MS, state ? state.lastRunAt - MARGIN_MS : now - FIRST_WINDOW_MS);
  const uazapi = await getUazapiClient(env);
  let failed = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { messages, hasMore } = await uazapi.findMessages({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    for (const msg of messages) {
      if ((msg.messageTimestamp ?? now) < since) continue;
      try {
        const ingested = await ingestMessage(db, msg, env.MEDIA_QUEUE);
        if (!ingested) continue;
        const [conversation, message] = await Promise.all([
          loadConversation(db, ingested.conversationId),
          loadMessage(db, env.MEDIA, ingested.messageId),
        ]);
        if (conversation && message) await publish(env, { type: "message.created", conversation, message });
      } catch (err) {
        failed = true;
        console.error("reconciliacao: falha ao ingerir mensagem", { erro: errorName(err) });
      }
    }
    // Mais recentes primeiro: pagina inteira fora da janela significa que o resto tambem esta.
    if (!hasMore || messages.every((m) => (m.messageTimestamp ?? now) < since)) break;
  }

  // Falha de ingestao nao avanca a marca: a proxima conferencia repete (e idempotente).
  if (!failed) {
    await db
      .insert(schema.reconciliationState)
      .values({ id: ROW_ID, lastRunAt: now })
      .onConflictDoUpdate({ target: schema.reconciliationState.id, set: { lastRunAt: now } });
  }
}

/** Reenfileira midias presas em "pendente" (indice parcial; no maximo REQUEUE_LIMIT por conferencia). */
async function requeuePendingMedia(env: Cloudflare.Env, db: Db, now: number): Promise<void> {
  const stale = await db
    .select({ id: schema.message.id })
    .from(schema.message)
    .where(and(eq(schema.message.mediaStatus, "pending"), lt(schema.message.timestamp, now - STALE_MEDIA_MS)))
    .orderBy(schema.message.timestamp)
    .limit(REQUEUE_LIMIT);
  if (stale.length > 0) await env.MEDIA_QUEUE.sendBatch(stale.map((m) => ({ body: { messageId: m.id } })));
}

/** Reconciliacao do cron: cada parte falha sozinha, sem derrubar a outra nem a checagem de conexao. */
export async function reconcile(env: Cloudflare.Env): Promise<void> {
  const db = createDb(env.DB);
  const now = Date.now();
  try {
    await recoverMessages(env, db, now);
  } catch (err) {
    console.error("reconciliacao: falha ao buscar mensagens", { erro: errorName(err) });
  }
  try {
    await requeuePendingMedia(env, db, now);
  } catch (err) {
    console.error("reconciliacao: falha ao reenfileirar midias", { erro: errorName(err) });
  }
}
