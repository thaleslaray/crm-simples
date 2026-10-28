import { describe, expect, it, vi } from "vitest";
import { history, inbox } from "./helpers/conversations";
import { runCron } from "./helpers/cron";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { fetchMedia, programDownload } from "./helpers/media";
import { programRecentMessages, recentTextMessage } from "./helpers/reconcile";
import { loginAsAtendente } from "./helpers/session";
import { mediaMessageEvent, postWebhook, textMessageEvent } from "./helpers/webhook";

const uazapi = fakeUazapi();
const MIN = 60_000;
const connected = () => uazapi.program("GET", "/instance/status", [{ body: { instance: { status: "connected" } } }]);

describe("reconciliacao: mensagens perdidas pelo webhook", () => {
  it("mensagem que nunca chegou pelo webhook aparece na caixa de entrada depois do cron", async () => {
    const cookie = await loginAsAtendente();
    await connected();
    await programRecentMessages(uazapi, [recentTextMessage({ id: "owner:PERDIDA", text: "alguem ai?", sender: "5511977770001@s.whatsapp.net" })]);

    await runCron();

    const [conversa] = await inbox(cookie);
    expect(conversa).toMatchObject({ contact: { phone: "5511977770001" }, lastMessage: { text: "alguem ai?" } });
    expect((await history(cookie, conversa!.id)).messages.map((m) => m.text)).toEqual(["alguem ai?"]);
  });

  it("mensagem que ja chegou pelo webhook nao duplica quando a busca a devolve de novo", async () => {
    const cookie = await loginAsAtendente();
    await connected();
    const event = textMessageEvent({ id: "owner:JA-CHEGOU", text: "bom dia", timestamp: Date.now() - MIN });
    await postWebhook(event);
    await programRecentMessages(uazapi, [event.message]);

    await runCron();
    await runCron();

    const [conversa] = await inbox(cookie);
    expect((await history(cookie, conversa!.id)).messages.map((m) => m.text)).toEqual(["bom dia"]);
  });

  it("ignora o que o webhook tambem ignora: mensagem de grupo e enviada pelo proprio numero", async () => {
    const cookie = await loginAsAtendente();
    await connected();
    await programRecentMessages(uazapi, [recentTextMessage({ id: "owner:GRUPO", isGroup: true }), recentTextMessage({ id: "owner:EU", fromMe: true })]);

    await runCron();

    expect(await inbox(cookie)).toEqual([]);
  });

  it("nao importa historico antigo: so busca desde a ultima conferencia, com margem", async () => {
    const cookie = await loginAsAtendente();
    await connected();
    await programRecentMessages(uazapi, [
      recentTextMessage({ id: "owner:ONTEM", text: "de ontem", timestamp: Date.now() - 26 * 60 * MIN }),
      recentTextMessage({ id: "owner:RECENTE", text: "de agora", timestamp: Date.now() - 2 * MIN, sender: "5511977770002@s.whatsapp.net" }),
    ]);

    await runCron();

    expect((await inbox(cookie)).map((c) => c.lastMessage?.text)).toEqual(["de agora"]);
  });

  it("limita a consulta a Uazapi: paginas de tamanho fixo e numero maximo de paginas", async () => {
    await connected();
    await uazapi.program("POST", "/message/find", [{ body: { messages: [recentTextMessage()], hasMore: true } }]);

    await runCron();

    const calls = (await uazapi.calls()).filter((c) => c.path === "/message/find");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(calls[0]!.body).toMatchObject({ limit: 100, offset: 0 });
  });

  it("se a Uazapi falhar, o cron nao quebra e a mensagem perdida entra na proxima conferencia", async () => {
    const cookie = await loginAsAtendente();
    await connected();
    await uazapi.program("POST", "/message/find", [{ status: 500 }]);
    await runCron();
    expect(await inbox(cookie)).toEqual([]);

    await programRecentMessages(uazapi, [recentTextMessage({ id: "owner:DEPOIS", text: "agora sim" })]);
    await runCron();

    expect((await inbox(cookie)).map((c) => c.lastMessage?.text)).toEqual(["agora sim"]);
  });
});

describe("reconciliacao: midia pendente", () => {
  async function midiaPendente(minutosAtras: number) {
    const cookie = await loginAsAtendente();
    await postWebhook(mediaMessageEvent({ kind: "image", timestamp: Date.now() - minutosAtras * MIN }));
    const [conversa] = await inbox(cookie);
    const ler = async () => (await history(cookie, conversa!.id)).messages[0]!;
    return { cookie, ler, id: (await ler()).id };
  }

  it("midia pendente antiga e reenfileirada e passa a ser baixada", async () => {
    const { cookie, id, ler } = await midiaPendente(30);
    expect(await ler()).toMatchObject({ media: { status: "pending" } });
    await connected();
    await programRecentMessages(uazapi, []);
    await programDownload(uazapi, { name: "foto.jpg", body: "bytes-da-foto", mime: "image/jpeg" });

    await runCron();

    await vi.waitFor(async () => expect(await ler()).toMatchObject({ media: { status: "available" } }), { timeout: 15_000 });
    expect(await (await fetchMedia(cookie, id)).text()).toBe("bytes-da-foto");
  });

});
