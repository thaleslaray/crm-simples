import { describe, expect, it } from "vitest";
import { conversationWithClient, history, inbox, sendText } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { createUser } from "./helpers/users";
import { signIn } from "./helpers/api";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAtendente } from "./helpers/session";
import { ageMessage, clientMessage, react, reactionEvent, reactionsOf } from "./helpers/reacoes";
import { postWebhook } from "./helpers/webhook";

describe("Reação recebida do cliente", () => {
  it("grava a reação na mensagem e avisa o tempo real com a lista completa", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);
    const conn = await connectRealtime(cookie);

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "👍" }));

    expect(await conn.next()).toEqual({
      type: "message.reactions",
      conversationId: conversa,
      messageId: mensagem.id,
      reactions: [{ side: "contact", emoji: "👍", userId: null, userName: null }],
    });
    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "contact", emoji: "👍", userId: null, userName: null }]);
    conn.close();
  });

  it("não vira mensagem: não mexe em não lidas, na última mensagem nem no histórico", async () => {
    const cookie = await loginAsAtendente();
    const { conversa } = await clientMessage(cookie);
    const antes = (await inbox(cookie)).find((c) => c.id === conversa)!;

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "❤️" }));

    const depois = (await inbox(cookie)).find((c) => c.id === conversa)!;
    expect(depois.unreadCount).toBe(antes.unreadCount);
    expect(depois.lastMessage).toEqual(antes.lastMessage);
    expect((await history(cookie, conversa)).messages).toHaveLength(1);
  });

  it("a nova reação do cliente substitui a anterior", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);
    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "👍", timestamp: Date.now() }));

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "😂", timestamp: Date.now() + 1000 }));

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "contact", emoji: "😂", userId: null, userName: null }]);
  });

  it("emoji vazio remove a reação e avisa com a lista vazia", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);
    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "👍", timestamp: Date.now() }));
    const conn = await connectRealtime(cookie);

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "", timestamp: Date.now() + 1000 }));

    expect(await conn.next()).toMatchObject({ type: "message.reactions", messageId: mensagem.id, reactions: [] });
    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([]);
    conn.close();
  });

  it("o mesmo webhook entregue duas vezes não duplica a reação", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);
    const evento = reactionEvent({ target: "ALVO1", emoji: "🙏" });

    await postWebhook(evento);
    await postWebhook(evento);

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "contact", emoji: "🙏", userId: null, userName: null }]);
  });

  it("reação a mensagem que não está no histórico é ignorada, sem avisar nem criar conversa", async () => {
    const cookie = await loginAsAtendente();
    const conn = await connectRealtime(cookie);

    const res = await postWebhook(reactionEvent({ target: "ANTIGA", emoji: "👍" }));

    expect(res.status).toBe(200);
    expect(await inbox(cookie)).toEqual([]);
    await expect(conn.next(300)).rejects.toThrow();
    conn.close();
  });

  it("reconhece a reação também pelo tipo `reaction` e pelo alvo em content.key.ID", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "😮", messageType: "reaction", viaKey: true }));

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "contact", emoji: "😮", userId: null, userName: null }]);
    expect((await history(cookie, conversa)).messages).toHaveLength(1);
  });

  it("reação feita pela empresa no celular (fromMe) vira reação da equipe sem atendente", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "👏", fromMe: true }));

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "team", emoji: "👏", userId: null, userName: null }]);
  });

  it("reação em grupo continua descartada", async () => {
    const cookie = await loginAsAtendente();
    const { conversa, mensagem } = await clientMessage(cookie);

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "👍", isGroup: true }));

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([]);
  });
});

const REACT = "/message/react";
const DIA = 24 * 60 * 60 * 1000;

async function loginAs(name: string) {
  await createUser({ email: `${name.toLowerCase()}@exemplo.com`, password: "senha-segura-123", name, role: "atendente" });
  return (await signIn(`${name.toLowerCase()}@exemplo.com`, "senha-segura-123")).cookie;
}

describe("Reagir a uma mensagem do cliente", () => {
  const uazapi = fakeUazapi();

  it("manda a reação à Uazapi com o id do WhatsApp, grava, avisa o tempo real e devolve a lista", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    const conn = await connectRealtime(cookie);

    const res = await react(cookie, conversa, mensagem.id, "👍");

    const esperado = [{ side: "team", emoji: "👍", userId: expect.any(String), userName: "Ana" }];
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reactions: esperado });
    expect(await uazapi.calls()).toMatchObject([{ method: "POST", path: REACT, body: { id: "ALVO1", text: "👍" } }]);
    expect(await conn.next()).toEqual({ type: "message.reactions", conversationId: conversa, messageId: mensagem.id, reactions: esperado });
    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual(esperado);
    conn.close();
  });

  it("emoji vazio remove a reação da equipe (a Uazapi recebe text vazio)", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    await react(cookie, conversa, mensagem.id, "👍");

    const res = await react(cookie, conversa, mensagem.id, "");

    expect(await res.json()).toEqual({ reactions: [] });
    expect((await uazapi.calls()).at(-1)).toMatchObject({ path: REACT, body: { id: "ALVO1", text: "" } });
    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([]);
  });

  it("a reação de outro atendente substitui a anterior e troca o nome", async () => {
    const ana = await loginAs("Ana");
    const bia = await loginAs("Bia");
    const { conversa, mensagem } = await clientMessage(ana);
    await react(ana, conversa, mensagem.id, "👍");
    const anaId = (await reactionsOf(ana, conversa, mensagem.id))[0]!.userId;

    await react(bia, conversa, mensagem.id, "❤️");

    const [reacao] = await reactionsOf(ana, conversa, mensagem.id);
    expect(reacao).toEqual({ side: "team", emoji: "❤️", userId: expect.any(String), userName: "Bia" });
    expect(reacao!.userId).not.toBe(anaId);
  });

  it("o eco fromMe da mesma reação (mesmo emoji) não troca o atendente por 'celular' e não publica nada", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    await react(cookie, conversa, mensagem.id, "👍");
    const conn = await connectRealtime(cookie);

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "👍", fromMe: true, timestamp: Date.now() + 1000 }));

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "team", emoji: "👍", userId: expect.any(String), userName: "Ana" }]);
    await expect(conn.next(500)).rejects.toThrow("nenhum evento recebido");
    conn.close();
  });

  it("fromMe com emoji diferente do gravado substitui e vira reação do celular (sem atendente)", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    await react(cookie, conversa, mensagem.id, "👍");

    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "❤️", fromMe: true, timestamp: Date.now() + 1000 }));

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([{ side: "team", emoji: "❤️", userId: null, userName: null }]);
  });

  it("a reação do cliente e a da equipe convivem na mesma mensagem", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    await postWebhook(reactionEvent({ target: "ALVO1", emoji: "😂" }));

    await react(cookie, conversa, mensagem.id, "👍");

    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([
      { side: "contact", emoji: "😂", userId: null, userName: null },
      { side: "team", emoji: "👍", userId: expect.any(String), userName: "Ana" },
    ]);
  });

  it("aceita bandeira, emoji com tom de pele e sequência com ZWJ", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    for (const emoji of ["🇧🇷", "👍🏽", "👨‍👩‍👧"]) expect((await react(cookie, conversa, mensagem.id, emoji)).status).toBe(200);
  });

  it("responde 404 para conversa inexistente e para mensagem de outra conversa", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    const outra = await conversationWithClient(cookie, "5511900000011");

    expect((await react(cookie, "nao-existe", mensagem.id, "👍")).status).toBe(404);
    expect((await react(cookie, conversa, "nao-existe", "👍")).status).toBe(404);
    const res = await react(cookie, outra, mensagem.id, "👍");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nao_encontrado" });
    expect(await uazapi.calls()).toHaveLength(0);
  });

  it("não deixa reagir a mensagem enviada pela empresa (409 reacao_indisponivel)", async () => {
    const cookie = await loginAs("Ana");
    const { conversa } = await clientMessage(cookie);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:OUT1", messageid: "OUT1" } }]);
    const enviada = ((await (await sendText(cookie, conversa, "Olá")).json()) as { message: { id: string } }).message;

    const res = await react(cookie, conversa, enviada.id, "👍");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "reacao_indisponivel" });
    expect((await uazapi.calls()).filter((c) => c.path === REACT)).toHaveLength(0);
  });

  it("não deixa reagir a mensagem com mais de 7 dias (409 reacao_expirada)", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    await ageMessage("ALVO1", 8 * DIA);

    const res = await react(cookie, conversa, mensagem.id, "👍");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "reacao_expirada" });
    expect(await uazapi.calls()).toHaveLength(0);
  });

  it("recusa o que não é um único emoji (400 emoji_invalido), sem chamar a Uazapi", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);

    for (const emoji of ["oi", "👍 obrigado pelo retorno de hoje", "👍👍", "a", 5, null]) {
      const res = await react(cookie, conversa, mensagem.id, emoji);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "emoji_invalido" });
    }
    expect(await uazapi.calls()).toHaveLength(0);
  });

  it("quando a Uazapi recusa (500), responde 502 e não grava nem avisa", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    await uazapi.program("POST", REACT, [{ status: 500, body: { error: "falhou" } }]);
    const conn = await connectRealtime(cookie);

    const res = await react(cookie, conversa, mensagem.id, "👍");

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "falha_ao_reagir" });
    expect(await reactionsOf(cookie, conversa, mensagem.id)).toEqual([]);
    await expect(conn.next(300)).rejects.toThrow();
    conn.close();
  });

  it("exige sessão", async () => {
    const cookie = await loginAs("Ana");
    const { conversa, mensagem } = await clientMessage(cookie);
    expect((await react("", conversa, mensagem.id, "👍")).status).toBe(401);
  });
});
