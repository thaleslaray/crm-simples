import { describe, expect, it } from "vitest";
import { conversationWithClient, history, inbox, openConversation, sendText } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAtendente } from "./helpers/session";
import { postWebhook, statusUpdateEvent, textMessageEvent } from "./helpers/webhook";

const SEND = "/send/text";
const MARK_READ = "/message/markread";

describe("Status de entrega", () => {
  const uazapi = fakeUazapi();

  /** Cliente escreve, o atendente responde; o WhatsApp conhece a resposta como `n` (id da Uazapi `owner:n`). */
  async function setup(n: string) {
    const cookie = await loginAsAtendente(`${n.toLowerCase()}@exemplo.com`);
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: `owner:${n}`, messageid: n } }]);
    await sendText(cookie, conversa, "Olá");
    const last = async () => (await history(cookie, conversa)).messages.findLast((m) => m.direction === "out")!;
    return { cookie, conversa, last };
  }

  it("entregue, lida e reproduzida: o status da mensagem enviada acompanha", async () => {
    const { last } = await setup("S1");
    expect((await last()).status).toBe("sent");

    await postWebhook(statusUpdateEvent(["S1"], "Delivered"));
    expect((await last()).status).toBe("delivered");

    await postWebhook(statusUpdateEvent(["S1"], "Read"));
    expect((await last()).status).toBe("read");

    await postWebhook(statusUpdateEvent(["S1"], "Played"));
    expect((await last()).status).toBe("played");
  });

  it("aceita o id da Uazapi (owner:...) além do id do WhatsApp", async () => {
    const { last } = await setup("S2");
    await postWebhook(statusUpdateEvent(["owner:S2"], "Delivered"));
    expect((await last()).status).toBe("delivered");
  });

  it("o status nunca regride", async () => {
    const { last } = await setup("S3");
    await postWebhook(statusUpdateEvent(["S3"], "Read"));
    await postWebhook(statusUpdateEvent(["S3"], "Delivered"));
    await postWebhook(statusUpdateEvent(["S3"], "Sent"));
    expect((await last()).status).toBe("read");
  });

  it("falhou só vale para mensagem ainda não entregue", async () => {
    const a = await setup("S4");
    await postWebhook(statusUpdateEvent(["S4"], "Failed"));
    expect((await a.last()).status).toBe("failed");

    const b = await setup("S5");
    await postWebhook(statusUpdateEvent(["S5"], "Delivered"));
    await postWebhook(statusUpdateEvent(["S5"], "Failed"));
    expect((await b.last()).status).toBe("delivered");
  });

  it("uma atualização com vários ids atualiza os conhecidos e ignora os desconhecidos", async () => {
    const { last } = await setup("S6");
    const res = await postWebhook(statusUpdateEvent(["DESCONHECIDO", "S6"], "Read"));
    expect(res.status).toBe(200);
    expect((await last()).status).toBe("read");
  });

  it("publica a mudança no hub, e só quando o status de fato muda", async () => {
    const { conversa, last } = await setup("S7");
    const outra = await connectRealtime(await loginAsAtendente("outra@exemplo.com"));
    const id = (await last()).id;

    await postWebhook(statusUpdateEvent(["S7"], "Delivered"));
    expect(await outra.next()).toMatchObject({ type: "message.status", conversationId: conversa, messageId: id, status: "delivered" });

    await postWebhook(statusUpdateEvent(["S7"], "Sent")); // regressão: nada muda, nada publicado
    await expect(outra.next(300)).rejects.toThrow();
    outra.close();
  });
});

describe("Não lidas", () => {
  const uazapi = fakeUazapi();

  it("cada mensagem do cliente soma um à conversa, e a mensagem do atendente não", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie); // 1 mensagem
    await postWebhook(textMessageEvent({ sender: "5511900000010@s.whatsapp.net", text: "segunda" }));
    await uazapi.program("POST", SEND, [{ body: { id: "owner:U1" } }]);
    await sendText(cookie, conversa, "resposta");

    expect((await inbox(cookie)).find((c) => c.id === conversa)?.unreadCount).toBe(2);
  });

  it("abrir a conversa zera o contador e marca as mensagens do cliente como lidas na Uazapi", async () => {
    const cookie = await loginAsAtendente();
    const phone = "5511900000010";
    const sender = `${phone}@s.whatsapp.net`;
    await postWebhook(textMessageEvent({ sender, id: "owner:IN1" }));
    await postWebhook(textMessageEvent({ sender, id: "owner:IN2" }));
    const conversa = (await inbox(cookie)).find((c) => c.contact.phone === phone)!.id;
    await uazapi.program("POST", MARK_READ, [{ body: { ok: true } }]);

    const res = await openConversation(cookie, conversa);

    expect(res.status).toBe(200);
    expect((await inbox(cookie)).find((c) => c.id === conversa)?.unreadCount).toBe(0);
    const calls = await uazapi.calls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: MARK_READ });
    expect((calls[0]!.body as { id: string[] }).id.sort()).toEqual(["owner:IN1", "owner:IN2"]);

    // Abrir de novo, sem nada novo: não chama a Uazapi.
    await openConversation(cookie, conversa);
    expect(await uazapi.calls()).toHaveLength(1);
  });

  it("falha da Uazapi ao marcar como lida não impede de zerar o contador", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", MARK_READ, [{ status: 500 }]);

    expect((await openConversation(cookie, conversa)).status).toBe(200);
    expect((await inbox(cookie)).find((c) => c.id === conversa)?.unreadCount).toBe(0);
  });

  it("abrir publica a conversa zerada no hub; exige login e conversa existente", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", MARK_READ, [{ body: { ok: true } }]);
    const outra = await connectRealtime(await loginAsAtendente("outra@exemplo.com"));

    await openConversation(cookie, conversa);

    expect(await outra.next()).toMatchObject({ type: "conversation.updated", conversation: { id: conversa, unreadCount: 0 } });
    outra.close();
    expect((await openConversation("", conversa)).status).toBe(401);
    expect((await openConversation(cookie, "nao-existe")).status).toBe(404);
  });
});
