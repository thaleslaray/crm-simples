import { Hono } from "hono";
import { createDb, schema } from "./db";
import { eq } from "drizzle-orm";
import { ingestMessage, type UazapiMessage } from "./ingest";
import { normalizeStatus, recordConnection } from "./connection";
import { loadConversation, loadMessage } from "./conversations";
import type { AppEnv } from "./middleware";
import { publish } from "./realtime";

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
  const [okSecret, okToken] = await Promise.all([
    safeEqual(c.req.param("secret"), c.env.WEBHOOK_URL_SECRET),
    safeEqual(token, c.env.UAZAPI_INSTANCE_TOKEN),
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
  if (payload.EventType === "connection") {
    try {
      const instance = (payload.instance ?? {}) as { status?: unknown; lastDisconnectReason?: unknown };
      const type = typeof payload.type === "string" ? payload.type : null;
      const reason = payload.lastDisconnectReason ?? instance.lastDisconnectReason;
      // Disconnected/TemporaryBan sao quedas, qualquer que seja o `instance.status` que acompanhe.
      await recordConnection(c.env, db, {
        status: type ? "disconnected" : normalizeStatus(instance.status),
        disconnectType: type,
        lastDisconnectReason: typeof reason === "string" ? reason : null,
      });
      await db.update(schema.webhookEvent).set({ processedAt: Date.now() }).where(eq(schema.webhookEvent.id, eventId));
    } catch (err) {
      console.error("webhook: falha ao processar evento", { eventId, erro: err instanceof Error ? err.name : "desconhecido" });
    }
  }
  // Outros tipos de evento (messages_update...) ficam gravados sem processar: sao de tickets futuros.
  if (payload.EventType === "messages") {
    try {
      const ingested = await ingestMessage(db, (payload.message ?? {}) as UazapiMessage, c.env.MEDIA_QUEUE);
      await db.update(schema.webhookEvent).set({ processedAt: Date.now() }).where(eq(schema.webhookEvent.id, eventId));
      // Mensagem nova (nao duplicada): avisa o hub. Depois de gravar tudo; falha de publicacao nao some com a mensagem.
      if (ingested) {
        const [conversation, message] = await Promise.all([
          loadConversation(db, ingested.conversationId),
          loadMessage(db, c.env.MEDIA, ingested.messageId),
        ]);
        if (conversation && message) await publish(c.env, { type: "message.created", conversation, message });
      }
    } catch (err) {
      // Nunca logar payload/token: so o tipo do erro e o id do evento. O evento fica sem processedAt.
      console.error("webhook: falha ao processar evento", { eventId, erro: err instanceof Error ? err.name : "desconhecido" });
    }
  }
  return c.json({ ok: true });
});
