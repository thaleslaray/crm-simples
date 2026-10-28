import { describe, expect, it } from "vitest";
import { api, signIn } from "./helpers/api";
import {
  assign,
  assume,
  clientWritesAgain,
  conversationOf,
  conversationWithClient,
  events,
  inboxFiltered,
  resend,
  resolve,
  sendMedia,
  sendText,
} from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { connectRealtime } from "./helpers/realtime";
import { createUser, deleteUser } from "./helpers/users";

async function login(email: string, name: string, role: "admin" | "atendente" = "atendente") {
  const id = await createUser({ email, password: "senha-segura-123", name, role });
  return { id, cookie: (await signIn(email, "senha-segura-123")).cookie };
}

describe("Assumir conversa", () => {
  it("o atendente assume uma conversa aberta e ela passa a em andamento com ele como responsavel", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);

    const res = await assume(ana.cookie, conversa);

    expect(res.status).toBe(200);
    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({
      status: "em_andamento",
      assigneeId: ana.id,
      assigneeName: "Ana",
    });
  });

  it("grava na linha do tempo quem assumiu e quando", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    const antes = Date.now();

    await assume(ana.cookie, conversa);

    const lista = await events(ana.cookie, conversa);
    expect(lista).toMatchObject([{ type: "assumida", actorName: "Ana", toName: "Ana" }]);
    expect(lista[0]!.timestamp).toBeGreaterThanOrEqual(antes);
  });

  it("com dois atendentes assumindo ao mesmo tempo, so um vence e o outro recebe erro claro", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);

    const [a, b] = await Promise.all([assume(ana.cookie, conversa), assume(beto.cookie, conversa)]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const perdedor = a.status === 409 ? a : b;
    expect(await perdedor.json()).toEqual({ error: "ja_assumida" });
    expect(await events(ana.cookie, conversa)).toHaveLength(1);
  });

  it("assumir uma conversa que nao existe responde 404", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    expect((await assume(ana.cookie, "nao-existe")).status).toBe(404);
  });

  it("publica a mudanca no tempo real para as outras sessoes", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);
    const conn = await connectRealtime(beto.cookie);

    await assume(ana.cookie, conversa);

    expect(await conn.next()).toMatchObject({
      type: "conversation.updated",
      conversation: { id: conversa, status: "em_andamento", assigneeId: ana.id, assigneeName: "Ana" },
      event: { type: "assumida", actorName: "Ana" },
    });
    conn.close();
  });
});

describe("Resposta ao cliente muda o status", () => {
  const uazapi = fakeUazapi();

  it("a primeira resposta numa conversa aberta torna o autor responsavel e a deixa aguardando cliente", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:R1" } }]);

    await sendText(ana.cookie, conversa, "Oi!");

    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "aguardando_cliente", assigneeId: ana.id });
    expect(await events(ana.cookie, conversa)).toMatchObject([{ type: "assumida", actorName: "Ana", toName: "Ana" }]);
  });

  it("responder numa conversa em andamento a deixa aguardando cliente sem gerar evento", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:R2" } }]);

    await sendText(ana.cookie, conversa, "Oi!");

    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "aguardando_cliente", assigneeId: ana.id });
    expect(await events(ana.cookie, conversa)).toHaveLength(1); // so o "assumida"
  });

  it("envio recusado pela Uazapi nao muda o status; o reenvio que da certo muda", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    await uazapi.program("POST", "/send/text", [{ status: 400, body: { error: "recusado" } }]);

    const failed = (await (await sendText(ana.cookie, conversa, "Oi")).json()) as { message: { id: string } };
    expect((await conversationOf(ana.cookie, conversa)).status).toBe("em_andamento");

    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:R3" } }]);
    await resend(ana.cookie, conversa, failed.message.id);
    expect((await conversationOf(ana.cookie, conversa)).status).toBe("aguardando_cliente");
  });

  it("responder uma conversa resolvida nao a reabre", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    await resolve(ana.cookie, conversa);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:R4" } }]);

    await sendText(ana.cookie, conversa, "So mais uma coisa");

    expect((await conversationOf(ana.cookie, conversa)).status).toBe("resolvida");
  });

  it("a mensagem enviada ja chega no tempo real com o novo status da conversa", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:R5" } }]);
    const conn = await connectRealtime(beto.cookie);

    await sendText(ana.cookie, conversa, "Oi!");

    expect(await conn.next()).toMatchObject({ type: "conversation.updated", conversation: { status: "aguardando_cliente" }, event: null });
    expect(await conn.next()).toMatchObject({ type: "message.created", conversation: { status: "aguardando_cliente" } });
    conn.close();
  });
});

describe("Cliente escreve de novo", () => {
  const uazapi = fakeUazapi();

  async function aguardando(ana: { cookie: string }) {
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:C1" } }]);
    await sendText(ana.cookie, conversa, "Oi!");
    return conversa;
  }

  it("aguardando cliente volta a em andamento com o mesmo responsavel, sem evento na linha do tempo", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await aguardando(ana);
    const antes = await events(ana.cookie, conversa);

    await clientWritesAgain();

    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "em_andamento", assigneeId: ana.id });
    expect(await events(ana.cookie, conversa)).toEqual(antes);
  });

  it("resolvida volta a em andamento com o mesmo responsavel e registra a reabertura", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await aguardando(ana);
    await resolve(ana.cookie, conversa);

    await clientWritesAgain();

    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "em_andamento", assigneeId: ana.id });
    expect((await events(ana.cookie, conversa)).at(-1)).toMatchObject({ type: "reaberta", actorName: null, toName: "Ana" });
  });

  it("se o responsavel foi removido, a conversa reaberta volta a aberta sem dono", async () => {
    const admin = await login("admin@exemplo.com", "Chefe", "admin");
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await aguardando(ana);
    await deleteUser(ana.id);

    await clientWritesAgain();

    expect(await conversationOf(admin.cookie, conversa)).toMatchObject({ status: "aberta", assigneeId: null });
  });

  it("em andamento continua em andamento quando o cliente escreve", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);

    await clientWritesAgain();

    expect((await conversationOf(ana.cookie, conversa)).status).toBe("em_andamento");
  });

  it("publica a reabertura no tempo real", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await aguardando(ana);
    await resolve(ana.cookie, conversa);
    const conn = await connectRealtime(ana.cookie);

    await clientWritesAgain();

    expect(await conn.next()).toMatchObject({ type: "conversation.updated", conversation: { status: "em_andamento" }, event: { type: "reaberta" } });
    expect(await conn.next()).toMatchObject({ type: "message.created", conversation: { status: "em_andamento" } });
    conn.close();
  });
});

describe("Filtros da caixa e membros", () => {
  const uazapi = fakeUazapi();

  /** Tres conversas: aberta sem dono, em andamento da Ana, aguardando cliente do Beto. */
  async function cenario() {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const aberta = await conversationWithClient(ana.cookie, "5511900000001");
    const daAna = await conversationWithClient(ana.cookie, "5511900000002");
    const doBeto = await conversationWithClient(ana.cookie, "5511900000003");
    await assume(ana.cookie, daAna);
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:F1" } }]);
    await sendText(beto.cookie, doBeto, "Oi!");
    return { ana, beto, aberta, daAna, doBeto };
  }
  const ids = (list: { id: string }[]) => list.map((c) => c.id).sort();

  it("filtra por status, inclusive aguardando cliente", async () => {
    const { ana, aberta, daAna, doBeto } = await cenario();

    expect(ids(await inboxFiltered(ana.cookie, "status=aguardando_cliente"))).toEqual([doBeto]);
    expect(ids(await inboxFiltered(ana.cookie, "status=em_andamento"))).toEqual([daAna]);
    expect(ids(await inboxFiltered(ana.cookie, "status=aberta"))).toEqual([aberta]);
    expect(await inboxFiltered(ana.cookie, "status=resolvida")).toEqual([]);
  });

  it("\"minhas\" traz so as conversas do usuario logado", async () => {
    const { ana, beto, daAna, doBeto } = await cenario();

    expect(ids(await inboxFiltered(ana.cookie, "assignee=me"))).toEqual([daAna]);
    expect(ids(await inboxFiltered(beto.cookie, "assignee=me"))).toEqual([doBeto]);
  });

  it("filtra pelo responsavel de um colega e pelas sem responsavel", async () => {
    const { ana, beto, aberta, doBeto } = await cenario();

    expect(ids(await inboxFiltered(ana.cookie, `assignee=${beto.id}`))).toEqual([doBeto]);
    expect(ids(await inboxFiltered(ana.cookie, "assignee=none"))).toEqual([aberta]);
  });

  it("os filtros se combinam", async () => {
    const { ana, beto, daAna } = await cenario();

    expect(ids(await inboxFiltered(ana.cookie, `assignee=${ana.id}&status=em_andamento`))).toEqual([daAna]);
    expect(await inboxFiltered(ana.cookie, `assignee=${beto.id}&status=em_andamento`)).toEqual([]);
  });

  it("status desconhecido responde 400", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    expect((await api("/api/conversations?status=qualquer", { cookie: ana.cookie })).status).toBe(400);
  });

  it("qualquer membro logado lista a equipe para filtrar e transferir", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    await login("chefe@exemplo.com", "Chefe", "admin");

    const res = await api("/api/members", { cookie: ana.cookie });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { members: unknown[] }).members).toMatchObject([
      { name: "Ana", role: "atendente" },
      { name: "Chefe", role: "admin" },
    ]);
    expect((await api("/api/members")).status).toBe(401);
  });
});

describe("Atribuir, transferir e resolver", () => {
  it("o admin atribui uma conversa aberta e ela passa a em andamento com o escolhido", async () => {
    const admin = await login("admin@exemplo.com", "Chefe", "admin");
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(admin.cookie);

    const res = await assign(admin.cookie, conversa, ana.id);

    expect(res.status).toBe(200);
    expect(await conversationOf(admin.cookie, conversa)).toMatchObject({ status: "em_andamento", assigneeId: ana.id });
    expect(await events(admin.cookie, conversa)).toMatchObject([{ type: "atribuida", actorName: "Chefe", toName: "Ana" }]);
  });

  it("o atendente nao atribui uma conversa sem responsavel (ele assume)", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);

    expect((await assign(ana.cookie, conversa, beto.id)).status).toBe(403);
    expect((await conversationOf(ana.cookie, conversa)).status).toBe("aberta");
  });

  it("o responsavel transfere a conversa a um colega e o status se mantem", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);

    const res = await assign(ana.cookie, conversa, beto.id);

    expect(res.status).toBe(200);
    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "em_andamento", assigneeId: beto.id });
    expect((await events(ana.cookie, conversa)).at(-1)).toMatchObject({ type: "transferida", actorName: "Ana", fromName: "Ana", toName: "Beto" });
  });

  it("atendente que nao e o responsavel nao transfere a conversa", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const caio = await login("caio@exemplo.com", "Caio");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);

    expect((await assign(beto.cookie, conversa, caio.id)).status).toBe(403);
    expect((await conversationOf(ana.cookie, conversa)).assigneeId).toBe(ana.id);
  });

  it("o admin transfere a conversa de qualquer atendente", async () => {
    const admin = await login("admin@exemplo.com", "Chefe", "admin");
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(admin.cookie);
    await assume(ana.cookie, conversa);

    expect((await assign(admin.cookie, conversa, beto.id)).status).toBe(200);
    expect((await conversationOf(admin.cookie, conversa)).assigneeId).toBe(beto.id);
  });

  it("transferir para um membro que nao existe responde 400", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);

    expect((await assign(ana.cookie, conversa, "fantasma")).status).toBe(400);
  });

  it("o responsavel resolve a conversa e a linha do tempo registra", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);

    expect((await resolve(ana.cookie, conversa)).status).toBe(200);

    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "resolvida", assigneeId: ana.id });
    expect((await events(ana.cookie, conversa)).at(-1)).toMatchObject({ type: "resolvida", actorName: "Ana" });
  });

  it("uma conversa aberta nao pode ser resolvida", async () => {
    const admin = await login("admin@exemplo.com", "Chefe", "admin");
    const conversa = await conversationWithClient(admin.cookie);

    expect((await resolve(admin.cookie, conversa)).status).toBe(409);
  });

  it("atendente que nao e o responsavel nao resolve, mas o admin resolve", async () => {
    const admin = await login("admin@exemplo.com", "Chefe", "admin");
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);

    expect((await resolve(beto.cookie, conversa)).status).toBe(403);
    expect((await resolve(admin.cookie, conversa)).status).toBe(200);
  });
});

describe("Responder com mídia e nota de voz", () => {
  const uazapi = fakeUazapi();

  it("enviar imagem ou nota de voz move para aguardando_cliente e a primeira resposta vira responsavel", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const porImagem = await conversationWithClient(ana.cookie);
    await uazapi.program("POST", "/send/media", [{ body: { id: "owner:MM1" } }]);

    await sendMedia(ana.cookie, porImagem, { name: "foto.png", mime: "image/png", content: "x" });

    expect(await conversationOf(ana.cookie, porImagem)).toMatchObject({ status: "aguardando_cliente", assigneeId: ana.id });

    const porVoz = await conversationWithClient(beto.cookie, "5511900000077");
    await uazapi.program("POST", "/send/media", [{ body: { id: "owner:MM2" } }]);

    await sendMedia(beto.cookie, porVoz, { name: "voz.webm", mime: "audio/webm", content: "a", voice: true });

    expect(await conversationOf(beto.cookie, porVoz)).toMatchObject({ status: "aguardando_cliente", assigneeId: beto.id });
  });

  it("envio de midia recusado (failed) nao muda status nem responsavel", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await uazapi.program("POST", "/send/media", [{ status: 400, body: { error: "recusado" } }]);

    await sendMedia(ana.cookie, conversa, { name: "foto.png", mime: "image/png", content: "x" });

    expect(await conversationOf(ana.cookie, conversa)).toMatchObject({ status: "aberta", assigneeId: null });
  });
});
