import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { history, inbox } from "./helpers/conversations";
import { loginAsAtendente } from "./helpers/session";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

describe("webhook: validacao de origem", () => {
  it("recusa quando o segredo da URL esta errado", async () => {
    const res = await postWebhook(textMessageEvent(), "segredo-errado");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "nao_autorizado" });
  });

  it("recusa quando o token do corpo esta errado", async () => {
    const res = await postWebhook(textMessageEvent({ token: "token-errado" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "nao_autorizado" });
  });

  it("aceita origem valida e responde 200 ok", async () => {
    const res = await postWebhook(textMessageEvent());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("webhook: mensagem de texto vira conversa na caixa de entrada", () => {
  it("mostra a conversa com nome, telefone, previa e horario", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(
      textMessageEvent({ sender: "5511988887777@s.whatsapp.net", senderName: "Maria", text: "Quero um orcamento", timestamp: 1_700_000_123_000 }),
    );

    const res = await api("/api/conversations", { cookie });
    expect(res.status).toBe(200);
    const { conversations } = (await res.json()) as { conversations: unknown[] };
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      status: "aberta",
      assigneeId: null,
      contact: { name: "Maria", phone: "5511988887777" },
      lastMessage: { type: "text", text: "Quero um orcamento", timestamp: 1_700_000_123_000 },
    });
  });
});

describe("webhook: idempotencia e descartes", () => {
  it("o mesmo evento duas vezes gera uma mensagem so", async () => {
    const cookie = await loginAsAtendente();
    const evento = textMessageEvent({ id: "owner:DUP1", text: "uma vez" });
    expect((await postWebhook(evento)).status).toBe(200);
    expect((await postWebhook(evento)).status).toBe(200);

    const [conversa] = await inbox(cookie);
    expect((await history(cookie, conversa!.id)).messages).toHaveLength(1);
  });

  it("descarta mensagem de grupo", async () => {
    const cookie = await loginAsAtendente();
    const res = await postWebhook(textMessageEvent({ isGroup: true, chatid: "1203@g.us" }));
    expect(res.status).toBe(200);
    expect(await inbox(cookie)).toHaveLength(0);
  });

  it("descarta mensagem enviada por nos (fromMe)", async () => {
    const cookie = await loginAsAtendente();
    const res = await postWebhook(textMessageEvent({ fromMe: true }));
    expect(res.status).toBe(200);
    expect(await inbox(cookie)).toHaveLength(0);
  });
});

describe("webhook: contatos e LID", () => {
  const PN = "5511977776666@s.whatsapp.net";
  const LID = "98765432100@lid";

  it("mensagem por LID de contato ja conhecido pelo numero nao duplica a pessoa", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent({ sender: PN, sender_lid: LID, senderName: "Joana", text: "primeira" }));
    await postWebhook(textMessageEvent({ sender: LID, chatid: LID, senderName: "Joana", text: "segunda" }));

    const conversas = await inbox(cookie);
    expect(conversas).toHaveLength(1);
    expect(conversas[0]).toMatchObject({ contact: { name: "Joana", phone: "5511977776666" }, lastMessage: { text: "segunda" } });
  });

  it("mensagem por numero de contato ja conhecido so pelo LID nao duplica a pessoa", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent({ sender: LID, chatid: LID, senderName: "Joana", text: "primeira" }));
    await postWebhook(textMessageEvent({ sender: PN, sender_lid: LID, senderName: "Joana", text: "segunda" }));

    const conversas = await inbox(cookie);
    expect(conversas).toHaveLength(1);
    expect(conversas[0]!.contact.phone).toBe("5511977776666");
  });

  it("so com LID cria contato sem telefone, com o nome do WhatsApp", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent({ sender: LID, chatid: LID, senderName: "Sem Numero" }));

    const [conversa] = await inbox(cookie);
    expect(conversa!.contact).toMatchObject({ name: "Sem Numero", phone: null });
  });
});

describe("webhook: tipos de mensagem", () => {
  it("tipo desconhecido vira nao suportado sem quebrar a ingestao", async () => {
    const cookie = await loginAsAtendente();
    const res = await postWebhook(textMessageEvent({ messageType: "pollCreationMessage", text: "enquete" }));
    expect(res.status).toBe(200);

    const [conversa] = await inbox(cookie);
    expect(conversa!.lastMessage).toMatchObject({ type: "unsupported", text: null });
  });

  it("extendedTextMessage conta como texto", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent({ messageType: "extendedTextMessage", text: "com link https://x.com" }));
    const [conversa] = await inbox(cookie);
    expect(conversa!.lastMessage).toMatchObject({ type: "text", text: "com link https://x.com" });
  });

  it("outros tipos de evento sao aceitos com 200 sem criar conversa", async () => {
    const cookie = await loginAsAtendente();
    const res = await postWebhook({ EventType: "connection", token: env.UAZAPI_INSTANCE_TOKEN, instance: { status: "connected" } });
    expect(res.status).toBe(200);
    expect(await inbox(cookie)).toHaveLength(0);
  });
});

describe("webhook: falha no processamento", () => {
  it("evento com payload quebrado ainda responde 200 e nao cria conversa", async () => {
    const cookie = await loginAsAtendente();
    const quebrado = { EventType: "messages", token: env.UAZAPI_INSTANCE_TOKEN, message: { sender: "5511900000009@s.whatsapp.net" } };
    const res = await postWebhook(quebrado);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await inbox(cookie)).toHaveLength(0);
  });
});
