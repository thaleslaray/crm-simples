import { afterEach, describe, expect, it, vi } from "vitest";
import { api, postJson, signIn } from "./helpers/api";
import { history, inbox } from "./helpers/conversations";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";
import { createResetLink, resetPassword } from "./helpers/team";
import { createUser } from "./helpers/users";
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

describe("tempo real: sessao revogada", () => {
  afterEach(() => vi.useRealTimers());

  it("redefinir a senha fecha os sockets do membro", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: "senha-segura-123" });
    const ana = (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
    const conn = await connectRealtime(ana);
    const { token } = await createResetLink(admin, anaId);

    await resetPassword(token, "outra-senha-456");

    expect(await conn.closed()).toBe(1008);
  });

  it("o logout fecha so o socket daquela sessao; o outro aparelho segue recebendo", async () => {
    await createUser({ email: "ana@exemplo.com", password: "senha-segura-123" });
    const celular = (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
    const notebook = (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
    const sockCelular = await connectRealtime(celular);
    const sockNotebook = await connectRealtime(notebook);

    expect((await postJson("/api/auth/sign-out", {}, { cookie: celular })).status).toBe(200);

    expect(await sockCelular.closed()).toBe(1008);
    await postWebhook(textMessageEvent({ text: "oi" }));
    expect(await sockNotebook.next()).toMatchObject({ type: "message.created" });
  });

  it("socket com sessao vencida nao recebe o evento e e fechado", async () => {
    const conn = await connectRealtime(await loginAsAtendente());
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    await postWebhook(textMessageEvent({ text: "oi" }));

    expect(await conn.closed()).toBe(1008);
    await expect(conn.next(200)).rejects.toThrow();
  });
});
