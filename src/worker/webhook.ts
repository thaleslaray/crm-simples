import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import { eq } from "drizzle-orm";
import { ingestMessage, type UazapiMessage } from "./ingest";
import { normalizeStatus, recordConnection } from "./connection";
import { loadConversation, loadMessage } from "./conversations";
import type { AppEnv } from "./middleware";
import { applyStatusUpdate } from "./delivery";
import { publish } from "./realtime";
import { publishUpdate } from "./status";
import { errorName } from "./errors";
import { resolveUazapiConfig } from "./uazapi/config";

/** Comparacao em tempo constante: hasheia os dois lados (tamanho fixo) e compara os digests. */
async function safeEqual(a: unknown, b: string): Promise<boolean> {
  if (typeof a !== "string") return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

export const webhook = new Hono<AppEnv>();

webhook.post("/:secret", async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = body && typeof body === "object" ? (body as { token?: unknown }).token : undefined;
  // Avalia os dois para nao revelar qual falhou pelo tempo de resposta.
  const config = await resolveUazapiConfig(c.env);
  const [okSecret, okToken] = await Promise.all([
    safeEqual(c.req.param("secret"), c.env.WEBHOOK_URL_SECRET),
    // Sem token configurado nada passa (nem token vazio).
    config ? safeEqual(token, config.token) : false,
  ]);
  if (!okSecret || !okToken) return c.json({ error: "nao_autorizado" }, 401);
  const { token: _token, ...payload } = body as Record<string, unknown>;
  const db = createDb(c.env.DB);
  const eventId = crypto.randomUUID();
  await db.insert(schema.webhookEvent).values({
    id: eventId,
    eventType: typeof payload.EventType === "string" ? payload.EventType : null,
    payload: JSON.stringify(payload),
    receivedAt: Date.now(),
  });
  // Responde ja: o processamento (varias idas ao D1, ao hub, a fila) corre depois da resposta, para a Uazapi nao esperar
  // nem reenviar por timeout. O evento cru ja esta gravado; falha no processamento deixa o evento sem processedAt.
  c.executionCtx.waitUntil(processEvent(c.env, db, eventId, payload));
  return c.json({ ok: true });
});

/** Processa o evento ja gravado. Nunca rejeita: cada ramo captura o proprio erro. */
async function processEvent(env: Cloudflare.Env, db: Db, eventId: string, payload: Record<string, unknown>): Promise<void> {
  if (payload.EventType === "connection") {
    try {
      const instance = (payload.instance ?? {}) as { status?: unknown; lastDisconnectReason?: unknown };
      const type = typeof payload.type === "string" ? payload.type : null;
      const reason = payload.lastDisconnectReason ?? instance.lastDisconnectReason;
      // Disconnected/TemporaryBan sao quedas, qualquer que seja o `instance.status` que acompanhe.
      await recordConnection(env, db, {
        status: type ? "disconnected" : normalizeStatus(instance.status),
        disconnectType: type,
        lastDisconnectReason: typeof reason === "string" ? reason : null,
      });
      await db.update(schema.webhookEvent).set({ processedAt: Date.now() }).where(eq(schema.webhookEvent.id, eventId));
    } catch (err) {
      console.error("webhook: falha ao processar evento", { eventId, erro: errorName(err) });
    }
  }
  if (payload.EventType === "messages") {
    try {
      const ingested = await ingestMessage(db, (payload.message ?? {}) as UazapiMessage, env.MEDIA_QUEUE);
      await db.update(schema.webhookEvent).set({ processedAt: Date.now() }).where(eq(schema.webhookEvent.id, eventId));
      // Mensagem nova (nao duplicada): avisa o hub. Depois de gravar tudo; falha de publicacao nao some com a mensagem.
      if (ingested) {
        if (ingested.reopened) await publishUpdate(env, db, ingested.conversationId, ingested.reopened.eventId);
        const [conversation, message] = await Promise.all([
          loadConversation(db, ingested.conversationId),
          loadMessage(db, env.MEDIA, ingested.messageId),
        ]);
        if (conversation && message) await publish(env, { type: "message.created", conversation, message });
      }
    } catch (err) {
      // Nunca logar payload/token: so o tipo do erro e o id do evento. O evento fica sem processedAt.
      console.error("webhook: falha ao processar evento", { eventId, erro: errorName(err) });
    }
  }
  if (payload.EventType === "messages_update") {
    try {
      const event = (payload.event ?? {}) as { MessageIDs?: unknown };
      const changes = await applyStatusUpdate(db, payload.state, event.MessageIDs);
      await db.update(schema.webhookEvent).set({ processedAt: Date.now() }).where(eq(schema.webhookEvent.id, eventId));
      for (const change of changes) await publish(env, { type: "message.status", ...change });
    } catch (err) {
      console.error("webhook: falha ao processar evento", { eventId, erro: errorName(err) });
    }
  }
}
