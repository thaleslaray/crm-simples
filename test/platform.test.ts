// Fumaca do harness: prova que D1, R2, Queue, Durable Object e Cron do Miniflare estao ao alcance dos testes
// e que o Worker exporta os handlers `fetch`, `queue` e `scheduled`. Os comportamentos de negocio vem nos proximos tickets.
import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, createScheduledController, getQueueResult, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/worker/index";

describe("plataforma (Miniflare)", () => {
  it("R2 guarda e devolve objetos", async () => {
    await env.MEDIA.put("teste/a.txt", "oi");
    expect(await (await env.MEDIA.get("teste/a.txt"))!.text()).toBe("oi");
  });

  it("Durable Object (hub) aceita upgrade de WebSocket", async () => {
    const stub = env.INBOX_HUB.get(env.INBOX_HUB.idFromName("hub"));
    const res = await stub.fetch("http://hub/ws", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();
    res.webSocket!.accept();
    res.webSocket!.close(1000, "fim");
  });

  it("Durable Object recusa requisicao sem upgrade", async () => {
    const stub = env.INBOX_HUB.get(env.INBOX_HUB.idFromName("hub"));
    expect((await stub.fetch("http://hub/ws")).status).toBe(426);
  });

  it("fila: producer aceita mensagem e o consumer do Worker confirma o lote", async () => {
    await env.MEDIA_QUEUE.send({ messageId: "m1" });
    const batch = createMessageBatch<MediaJob>("crm-media", [
      { id: "1", timestamp: new Date(), attempts: 1, body: { messageId: "m1" } },
    ]);
    const ctx = createExecutionContext();
    await worker.queue!(batch, env, ctx);
    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual(["1"]);
    expect(result.retryMessages).toEqual([]);
  });

  it("cron: handler scheduled roda sem erro", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ scheduledTime: Date.now(), cron: "*/5 * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
  });

  it("rota desconhecida da API responde 404 em JSON", async () => {
    const res = await exports.default.fetch("http://crm.test/api/nao-existe");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nao_encontrado" });
  });
});
