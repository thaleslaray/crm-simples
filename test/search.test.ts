import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { history, historyAround, inbox, search } from "./helpers/conversations";
import { loginAsAtendente } from "./helpers/session";
import { seedMessages } from "./helpers/volume";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

async function receber(sender: string, text: string, senderName = "Cliente", timestamp?: number) {
  await postWebhook(textMessageEvent({ sender, text, senderName, timestamp }));
}

describe("busca: contato", () => {
  it("exige login", async () => {
    expect((await api("/api/search?q=ana")).status).toBe(401);
  });

  it("acha a conversa pelo nome do contato, sem distinguir caixa nem acento", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511900000001@s.whatsapp.net", "oi", "João da Silva");
    await receber("5511900000002@s.whatsapp.net", "oi", "Maria");
    const { body } = await search(cookie, "joao");
    expect(body.contacts.map((c) => c.contact.name)).toEqual(["João da Silva"]);
  });

  it("acha a conversa por um pedaco do telefone, mesmo digitado com mascara", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511987654321@s.whatsapp.net", "oi", "Ana");
    await receber("5521911112222@s.whatsapp.net", "oi", "Bia");
    expect((await search(cookie, "98765")).body.contacts.map((c) => c.contact.name)).toEqual(["Ana"]);
    expect((await search(cookie, "+55 11 98765-4321")).body.contacts.map((c) => c.contact.name)).toEqual(["Ana"]);
  });

  it("busca vazia devolve listas vazias", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511900000001@s.whatsapp.net", "oi");
    const { status, body } = await search(cookie, "   ");
    expect(status).toBe(200);
    expect(body).toEqual({ contacts: [], messages: [] });
  });
});

describe("busca: abrir a conversa na mensagem encontrada", () => {
  const CLIENTE = "5511900000009@s.whatsapp.net";

  async function conversaComHistorico(total: number) {
    const cookie = await loginAsAtendente();
    for (let i = 1; i <= total; i++) {
      const text = i === 60 ? "m60 o boleto vencido" : `m${i}`;
      await receber(CLIENTE, text, "Cliente", 1_700_000_000_000 + i * 1000);
    }
    const { body } = await search(cookie, "vencido");
    return { cookie, hit: body.messages[0]! };
  }

  it("devolve a janela ao redor da mensagem, com a mensagem no meio", async () => {
    const { cookie, hit } = await conversaComHistorico(120);
    const { status, body } = await historyAround(cookie, hit.conversationId, hit.messageId, 10);
    expect(status).toBe(200);
    expect(body.messages.map((m) => m.text)).toEqual(
      ["m55", "m56", "m57", "m58", "m59", "m60 o boleto vencido", "m61", "m62", "m63", "m64"],
    );
    expect(body.nextBefore).not.toBeNull();
    expect(body.nextAfter).not.toBeNull();
  });

  it("os cursores da janela continuam o historico nos dois sentidos, sem repetir nem pular", async () => {
    const { cookie, hit } = await conversaComHistorico(120);
    const { body } = await historyAround(cookie, hit.conversationId, hit.messageId, 10);
    const antes = await history(cookie, hit.conversationId, `?limit=3&before=${encodeURIComponent(body.nextBefore!)}`);
    expect(antes.messages.map((m) => m.text)).toEqual(["m52", "m53", "m54"]);
    const depois = await history(cookie, hit.conversationId, `?limit=3&after=${encodeURIComponent(body.nextAfter!)}`);
    expect(depois.messages.map((m) => m.text)).toEqual(["m65", "m66", "m67"]);
  });

  it("no fim do historico nextAfter fica nulo", async () => {
    const { cookie, hit } = await conversaComHistorico(62);
    const { body } = await historyAround(cookie, hit.conversationId, hit.messageId, 10);
    expect(body.messages.at(-1)!.text).toBe("m62");
    expect(body.nextAfter).toBeNull();
  });

  it("mensagem de outra conversa ou inexistente responde 404", async () => {
    const { cookie, hit } = await conversaComHistorico(62);
    await receber("5511900000010@s.whatsapp.net", "outra", "Outro");
    const outra = (await inbox(cookie)).find((c) => c.contact.name === "Outro")!;
    expect((await historyAround(cookie, outra.id, hit.messageId)).status).toBe(404);
    expect((await historyAround(cookie, hit.conversationId, "nao-existe")).status).toBe(404);
  });
});

describe("busca: volume", () => {
  it("com 20 mil mensagens a busca por texto responde rapido e acha so a certa", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511900000001@s.whatsapp.net", "oi", "Ana");
    const [conversa] = await inbox(cookie);
    await seedMessages(conversa!.id, 20_000);
    await receber("5511900000001@s.whatsapp.net", "preciso do reembolso do pedido");

    const t0 = performance.now();
    const raro = await search(cookie, "reembolso");
    const comum = await search(cookie, "sobre pedido");
    const tempo = performance.now() - t0;

    expect(raro.body.messages).toHaveLength(1);
    expect(comum.body.messages).toHaveLength(30); // limitado
    expect(tempo).toBeLessThan(1000);
  });
});

describe("busca: texto das mensagens", () => {
  it("acha a mensagem por um trecho e devolve o trecho com o termo marcado", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511900000001@s.whatsapp.net", "Oi, tudo bem? Preciso da segunda via do boleto de março", "Ana");
    await receber("5511900000002@s.whatsapp.net", "Bom dia", "Bia");
    const { body } = await search(cookie, "bolet");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ contact: { name: "Ana" } });
    expect(body.messages[0]!.snippet).toContain("\u0001boleto\u0002");
  });

  it("acha sem distinguir acento e exige todas as palavras", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511900000001@s.whatsapp.net", "Preciso do boleto de março");
    await receber("5511900000002@s.whatsapp.net", "O boleto venceu");
    expect((await search(cookie, "MARCO boleto")).body.messages).toHaveLength(1);
    expect((await search(cookie, "boleto")).body.messages).toHaveLength(2);
  });

  it("lista a mais recente primeiro", async () => {
    const cookie = await loginAsAtendente();
    await receber("5511900000001@s.whatsapp.net", "boleto antigo", "Ana", 1_700_000_000_000);
    await receber("5511900000002@s.whatsapp.net", "boleto novo", "Bia", 1_700_000_900_000);
    const { body } = await search(cookie, "boleto");
    expect(body.messages.map((m) => m.contact.name)).toEqual(["Bia", "Ana"]);
  });

  it("mensagem nova entra na busca na hora; texto com sintaxe estranha nao quebra", async () => {
    const cookie = await loginAsAtendente();
    expect((await search(cookie, "garantia")).body.messages).toHaveLength(0);
    await receber("5511900000001@s.whatsapp.net", "qual a garantia?");
    expect((await search(cookie, "garantia")).body.messages).toHaveLength(1);
    expect((await search(cookie, 'garan" OR * NEAR(')).status).toBe(200);
  });

  it("mensagem sem texto (tipo nao suportado) nao aparece", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent({ messageType: "pollCreationMessage", text: "legenda da enquete" }));
    expect((await search(cookie, "legenda")).body.messages).toHaveLength(0);
  });

  it("legenda de midia (ticket 08) entra na busca", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent({ messageType: "imageMessage", text: "legenda da foto" }));
    expect((await search(cookie, "legenda")).body.messages).toHaveLength(1);
  });
});
