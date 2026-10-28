import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { history, inbox } from "./helpers/conversations";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAtendente } from "./helpers/session";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

describe("tempo real: conexao", () => {
  it("recusa o upgrade sem sessao valida", async () => {
    const res = await api("/api/realtime", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(401);
    expect(res.webSocket).toBeNull();
  });

  it("aceita o upgrade com sessao valida", async () => {
    const conn = await connectRealtime(await loginAsAtendente());
    conn.close();
  });

  it("pedido sem upgrade responde 426", async () => {
    const cookie = await loginAsAtendente();
    expect((await api("/api/realtime", { cookie })).status).toBe(426);
  });
});

describe("tempo real: mensagem recebida", () => {
  it("duas sessoes conectadas recebem o mesmo evento quando chega uma mensagem", async () => {
    const a = await connectRealtime(await loginAsAtendente("a@exemplo.com"));
    const b = await connectRealtime(await loginAsAtendente("b@exemplo.com"));

    await postWebhook(textMessageEvent({ text: "ola, tudo bem?", senderName: "Maria", timestamp: 1_700_000_000_000 }));

    const esperado = {
      type: "message.created",
      conversation: {
        status: "aberta",
        assigneeId: null,
        contact: { name: "Maria", phone: "5511999990001" },
        lastMessage: { type: "text", text: "ola, tudo bem?", timestamp: 1_700_000_000_000 },
      },
      message: { direction: "in", type: "text", text: "ola, tudo bem?", timestamp: 1_700_000_000_000 },
    };
    expect(await a.next()).toMatchObject(esperado);
    expect(await b.next()).toMatchObject(esperado);
  });

  it("o mesmo evento do webhook entregue duas vezes avisa uma vez so", async () => {
    const a = await connectRealtime(await loginAsAtendente());
    const evento = textMessageEvent({ id: "owner:DUP" });
    await postWebhook(evento);
    await postWebhook(evento);
    await a.next();
    await expect(a.next(300)).rejects.toThrow();
  });
});

describe("tempo real: ressincronizacao ao reconectar", () => {
  it("o historico devolve so as mensagens depois do cursor da ultima vista", async () => {
    const cookie = await loginAsAtendente();
    const sender = "5511900000009@s.whatsapp.net";
    for (const [i, text] of ["m1", "m2", "m3"].entries()) {
      await postWebhook(textMessageEvent({ sender, text, timestamp: 1_700_000_000_000 + i * 1000 }));
    }
    const [conversa] = await inbox(cookie);
    const todas = await history(cookie, conversa!.id);
    const vista = todas.messages[0]!; // m1 foi a ultima que o cliente viu

    const res = await history(cookie, conversa!.id, `?after=${vista.timestamp}:${vista.id}`);
    expect(res.messages.map((m) => m.text)).toEqual(["m2", "m3"]);
  });

  it("cursor invalido em after responde 400", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(textMessageEvent());
    const [conversa] = await inbox(cookie);
    expect((await api(`/api/conversations/${conversa!.id}/messages?after=lixo`, { cookie })).status).toBe(400);
  });
});
