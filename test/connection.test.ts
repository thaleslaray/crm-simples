import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, postJson } from "./helpers/api";
import { runCron } from "./helpers/cron";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";
import { connectionEvent, postWebhook } from "./helpers/webhook";

async function connectionOf(cookie: string) {
  const res = await api("/api/connection", { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { connection: { status: string; temporaryBan: boolean } }).connection;
}

describe("conexao do numero: tela do admin", () => {
  const uazapi = fakeUazapi();
  const programPairing = (qrcode = "data:image/png;base64,QR1") =>
    Promise.all([
      uazapi.program("POST", "/webhook", [{ body: [] }]),
      uazapi.program("POST", "/instance/connect", [{ body: { instance: { status: "connecting", qrcode } } }]),
    ]);

  it("conectar configura o webhook na Uazapi e pareia sem importar historico", async () => {
    const cookie = await loginAsAdmin();
    await programPairing();

    const res = await postJson("/api/connection/connect", {}, { cookie });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      connection: { status: "connecting" },
      qrcode: "data:image/png;base64,QR1",
    });
    const calls = await uazapi.calls();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /webhook", "POST /instance/connect"]);
    expect(calls[0]!.body).toMatchObject({
      enabled: true,
      url: `http://crm.test/api/webhook/${env.WEBHOOK_URL_SECRET}`,
      events: ["messages", "messages_update", "connection"],
      excludeMessages: ["isGroupYes", "fromMeYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    });
    expect(calls[1]!.body).toMatchObject({ history_days: 0 });
  });

  it("enquanto conectando, consultar o status devolve o QR code atual", async () => {
    const cookie = await loginAsAdmin();
    await postWebhook(connectionEvent({ status: "disconnected" }));
    await uazapi.program("GET", "/instance/status", [
      { body: { instance: { status: "connecting", qrcode: "data:image/png;base64,QR2" } } },
    ]);

    const res = await api("/api/connection/status", { cookie });

    expect(await res.json()).toMatchObject({ connection: { status: "connecting" }, qrcode: "data:image/png;base64,QR2" });
    expect(await connectionOf(cookie)).toMatchObject({ status: "connecting" });
  });

  it("quando o numero ja esta conectado nao devolve QR code", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [{ body: { instance: { status: "connected", qrcode: "velho" } } }]);

    const body = (await (await api("/api/connection/status", { cookie })).json()) as { connection: { status: string }; qrcode?: string };

    expect(body.connection.status).toBe("connected");
    expect(body.qrcode).toBeUndefined();
  });

  it("atendente nao conecta nem consulta o QR (403) e a Uazapi nao e chamada", async () => {
    const cookie = await loginAsAtendente();
    expect((await postJson("/api/connection/connect", {}, { cookie })).status).toBe(403);
    expect((await api("/api/connection/status", { cookie })).status).toBe(403);
    expect(await uazapi.calls()).toEqual([]);
  });

  it("se a Uazapi recusar o pareamento, a tela recebe erro e o estado nao muda", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("POST", "/webhook", [{ body: [] }]);
    await uazapi.program("POST", "/instance/connect", [{ status: 500 }]);

    expect((await postJson("/api/connection/connect", {}, { cookie })).status).toBe(502);
    expect(await connectionOf(cookie)).toMatchObject({ status: "unknown" });
  });
});

describe("conexao do numero: cron de 5 minutos", () => {
  const uazapi = fakeUazapi();

  it("detecta a queda que a Uazapi nao avisou e publica no hub", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(connectionEvent({ status: "connected" }));
    const live = await connectRealtime(cookie);
    await uazapi.program("GET", "/instance/status", [{ body: { instance: { status: "disconnected" } } }]);

    await runCron();

    expect(await connectionOf(cookie)).toMatchObject({ status: "disconnected" });
    expect(await live.next()).toMatchObject({ type: "connection.changed", connection: { status: "disconnected" } });
  });

  it("confirma a volta quando o numero reconecta", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(connectionEvent({ status: "disconnected", type: "Disconnected" }));
    await uazapi.program("GET", "/instance/status", [{ body: { instance: { status: "connected" } } }]);

    await runCron();

    expect(await connectionOf(cookie)).toMatchObject({ status: "connected" });
  });

  it("nao perde o aviso de TemporaryBan quando o cron confirma que continua desconectado", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(connectionEvent({ status: "disconnected", type: "TemporaryBan" }));
    await uazapi.program("GET", "/instance/status", [{ body: { instance: { status: "disconnected" } } }]);

    await runCron();

    expect(await connectionOf(cookie)).toMatchObject({ status: "disconnected", temporaryBan: true });
  });

  it("se a Uazapi nao responder, o estado anterior fica como estava", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(connectionEvent({ status: "connected" }));
    await uazapi.program("GET", "/instance/status", [{ status: 500 }]);

    await runCron();

    expect(await connectionOf(cookie)).toMatchObject({ status: "connected" });
  });
});

describe("conexao do numero: evento connection do webhook", () => {
  it("atualiza o estado visto por qualquer membro e avisa o hub", async () => {
    const cookie = await loginAsAtendente();
    const live = await connectRealtime(cookie);

    await postWebhook(connectionEvent({ status: "disconnected", type: "Disconnected" }));

    expect(await connectionOf(cookie)).toMatchObject({ status: "disconnected", temporaryBan: false });
    expect(await live.next()).toMatchObject({ type: "connection.changed", connection: { status: "disconnected" } });
  });

  it("TemporaryBan aparece como tal", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(connectionEvent({ status: "disconnected", type: "TemporaryBan" }));
    expect(await connectionOf(cookie)).toMatchObject({ status: "disconnected", temporaryBan: true });
  });

  it("volta a connected e o estado acompanha", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(connectionEvent({ status: "disconnected", type: "TemporaryBan" }));
    await postWebhook(connectionEvent({ status: "connected" }));
    expect(await connectionOf(cookie)).toMatchObject({ status: "connected", temporaryBan: false });
  });

  it("antes de qualquer informacao o estado e desconhecido", async () => {
    expect(await connectionOf(await loginAsAtendente())).toMatchObject({ status: "unknown" });
  });

  it("sem sessao a rota responde 401", async () => {
    expect((await api("/api/connection")).status).toBe(401);
  });
});
