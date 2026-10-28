import { describe, expect, it } from "vitest";
import { api, cookieFrom, postJson, signIn } from "./helpers/api";
import { clientWritesAgain, assume, conversationOf, conversationWithClient, events, resolve, sendText } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAdmin } from "./helpers/session";
import {
  acceptInvite,
  changeRole,
  createInvite,
  createResetLink,
  expireAllLinks,
  inviteInfo,
  removeMember,
  resetInfo,
  resetPassword,
  teamList,
} from "./helpers/team";
import { createUser } from "./helpers/users";

const SENHA = "senha-segura-123";

describe("Convite", () => {
  it("o admin gera um convite e o convidado entra com nome, e-mail e senha no papel escolhido", async () => {
    const admin = await loginAsAdmin();
    const { res, token } = await createInvite(admin, "atendente");
    expect(res.status).toBe(200);

    const aceito = await acceptInvite(token, { name: "Nova Pessoa", email: "nova@exemplo.com", password: SENHA });
    expect(aceito.status).toBe(200);

    const me = await api("/api/me", { cookie: cookieFrom(aceito) });
    expect(await me.json()).toMatchObject({ user: { name: "Nova Pessoa", email: "nova@exemplo.com", role: "atendente" } });
    expect((await signIn("nova@exemplo.com", SENHA)).res.status).toBe(200);
  });

  it("o convite define o papel: convidado como admin entra nas rotas de admin", async () => {
    const admin = await loginAsAdmin();
    const { token } = await createInvite(admin, "admin");
    const aceito = await acceptInvite(token, { name: "Outro Admin", email: "outro@exemplo.com", password: SENHA });

    expect((await api("/api/admin/members", { cookie: cookieFrom(aceito) })).status).toBe(200);
  });

  it("o link de convite e de uso unico: o segundo uso mostra mensagem clara e nao cria conta", async () => {
    const admin = await loginAsAdmin();
    const { token } = await createInvite(admin);
    await acceptInvite(token, { name: "Primeira", email: "primeira@exemplo.com", password: SENHA });

    const info = await inviteInfo(token);
    expect(info.status).toBe(410);
    expect(await info.json()).toMatchObject({ error: "usado", message: expect.stringContaining("já foi usado") });

    const segundo = await acceptInvite(token, { name: "Segunda", email: "segunda@exemplo.com", password: SENHA });
    expect(segundo.status).toBe(410);
    expect((await signIn("segunda@exemplo.com", SENHA)).res.status).toBe(401);
  });

  it("convite vencido mostra mensagem clara e nao cria conta", async () => {
    const admin = await loginAsAdmin();
    const { token } = await createInvite(admin);
    await expireAllLinks();

    const info = await inviteInfo(token);
    expect(info.status).toBe(410);
    expect(await info.json()).toMatchObject({ error: "expirado", message: expect.stringContaining("venceu") });

    const aceito = await acceptInvite(token, { name: "Tarde", email: "tarde@exemplo.com", password: SENHA });
    expect(aceito.status).toBe(410);
    expect((await signIn("tarde@exemplo.com", SENHA)).res.status).toBe(401);
  });

  it("convite aberto informa o papel e o link inventado e recusado", async () => {
    const admin = await loginAsAdmin();
    const { token } = await createInvite(admin, "admin");
    expect(await (await inviteInfo(token)).json()).toEqual({ role: "admin" });
    expect((await inviteInfo("token-que-nao-existe")).status).toBe(410);
  });

  it("e-mail ja cadastrado e senha curta sao recusados sem gastar o convite", async () => {
    const admin = await loginAsAdmin();
    const { token } = await createInvite(admin);

    const repetido = await acceptInvite(token, { name: "Eu", email: "admin@exemplo.com", password: SENHA });
    expect(repetido.status).toBe(409);
    const curta = await acceptInvite(token, { name: "Eu", email: "eu@exemplo.com", password: "curta" });
    expect(curta.status).toBe(400);

    expect((await acceptInvite(token, { name: "Eu", email: "eu@exemplo.com", password: SENHA })).status).toBe(200);
  });

  it("papel invalido no convite e recusado", async () => {
    const admin = await loginAsAdmin();
    const res = await postJson("/api/admin/invites", { role: "dono" }, { cookie: admin });
    expect(res.status).toBe(400);
  });
});

describe("Remover membro", () => {
  const uazapi = fakeUazapi();

  async function atendente(email: string, name: string) {
    const id = await createUser({ email, name, password: SENHA });
    return { id, email, cookie: (await signIn(email, SENHA)).cookie };
  }

  it("o membro removido perde o acesso na hora: sessao encerrada e login recusado", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const chefe = await createUser({ email: "chefe@exemplo.com", password: SENHA, role: "admin" });
    const chefeCookie = (await signIn("chefe@exemplo.com", SENHA)).cookie;
    expect((await teamList(chefeCookie)).status).toBe(200);

    expect((await removeMember(admin, chefe)).status).toBe(200);
    expect((await removeMember(admin, ana.id)).status).toBe(200);

    expect((await teamList(chefeCookie)).status).toBe(401);
    const velha = await api("/api/auth/get-session?disableCookieCache=true", { cookie: ana.cookie });
    expect(await velha.json()).toBeNull();
    expect((await signIn("ana@exemplo.com", SENHA)).res.status).toBe(401);
    expect((await teamList(admin)).members.map((m) => m.email)).toEqual(["admin@exemplo.com"]);
  });

  it("o removido nao envia mais mensagem nem age em conversa, mesmo com o cookie de sessao ainda no cache", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(admin, "5511900000016");
    await assume(ana.cookie, conversa);
    expect((await removeMember(admin, ana.id)).status).toBe(200);

    expect((await sendText(ana.cookie, conversa, "ainda aqui?")).status).toBe(401);
    expect((await assume(ana.cookie, conversa)).status).toBe(401);
    expect((await resolve(ana.cookie, conversa)).status).toBe(401);
  });

  it("o socket aberto do removido para de receber o que acontece na caixa de entrada", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const doRemovido = await connectRealtime(ana.cookie);
    const doAdmin = await connectRealtime(admin);
    await removeMember(admin, ana.id);

    await clientWritesAgain("5511900000017");

    expect(await doAdmin.next()).toMatchObject({ type: "message.created" });
    await expect(doRemovido.next(300)).rejects.toThrow();
  });

  it("devolver pela remocao grava na linha do tempo quem removeu e avisa o tempo real com o evento", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(admin, "5511900000018");
    await assume(ana.cookie, conversa);
    const conn = await connectRealtime(admin);

    await removeMember(admin, ana.id);

    expect(await conn.next()).toMatchObject({
      type: "conversation.updated",
      conversation: { id: conversa, status: "aberta", assigneeId: null },
      event: { type: "devolvida", actorName: "Pessoa de Teste" },
    });
    expect((await events(admin, conversa)).at(-1)).toMatchObject({ type: "devolvida", actorName: "Pessoa de Teste" });
    conn.close();
  });

  it("conversas em andamento e aguardando cliente voltam para aberta sem dono; as dos outros ficam", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const beto = await atendente("beto@exemplo.com", "Beto");
    await uazapi.program("POST", "/send/text", [{ body: { id: "owner:R1" } }]);

    const emAndamento = await conversationWithClient(admin, "5511900000011");
    await assume(ana.cookie, emAndamento);
    const aguardando = await conversationWithClient(admin, "5511900000012");
    await assume(ana.cookie, aguardando);
    await sendText(ana.cookie, aguardando, "Oi!");
    const doBeto = await conversationWithClient(admin, "5511900000013");
    await assume(beto.cookie, doBeto);
    expect((await conversationOf(admin, aguardando)).status).toBe("aguardando_cliente");

    expect((await removeMember(admin, ana.id)).status).toBe(200);

    expect(await conversationOf(admin, emAndamento)).toMatchObject({ status: "aberta", assigneeId: null });
    expect(await conversationOf(admin, aguardando)).toMatchObject({ status: "aberta", assigneeId: null });
    expect(await conversationOf(admin, doBeto)).toMatchObject({ status: "em_andamento", assigneeId: beto.id });
  });

  it("a devolucao chega no tempo real com a conversa ja aberta", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(admin, "5511900000014");
    await assume(ana.cookie, conversa);
    const conn = await connectRealtime(admin);

    await removeMember(admin, ana.id);

    expect(await conn.next()).toMatchObject({
      type: "conversation.updated",
      conversation: { id: conversa, status: "aberta", assigneeId: null },
    });
    conn.close();
  });

  it("conversa resolvida de membro removido reabre como aberta quando o cliente escreve", async () => {
    const admin = await loginAsAdmin();
    const ana = await atendente("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(admin, "5511900000015");
    await assume(ana.cookie, conversa);
    await resolve(ana.cookie, conversa);

    await removeMember(admin, ana.id);
    expect(await conversationOf(admin, conversa)).toMatchObject({ status: "resolvida", assigneeId: null });
    await clientWritesAgain("5511900000015");

    expect(await conversationOf(admin, conversa)).toMatchObject({ status: "aberta", assigneeId: null });
  });

  it("o admin nao remove a si mesmo e membro inexistente da 404", async () => {
    const admin = await loginAsAdmin();
    const eu = (await teamList(admin)).members[0]!;
    expect((await removeMember(admin, eu.id)).status).toBe(409);
    expect((await removeMember(admin, "nao-existe")).status).toBe(404);
  });
});

describe("Redefinicao de senha", () => {
  const NOVA = "outra-senha-456";

  it("o admin gera o link e o membro define a nova senha: a antiga para de valer", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const { res, token } = await createResetLink(admin, anaId);
    expect(res.status).toBe(200);

    expect(await (await resetInfo(token)).json()).toEqual({ name: "Pessoa de Teste" });
    expect((await resetPassword(token, NOVA)).status).toBe(200);

    expect((await signIn("ana@exemplo.com", SENHA)).res.status).toBe(401);
    expect((await signIn("ana@exemplo.com", NOVA)).res.status).toBe(200);
  });

  it("redefinir encerra as sessoes abertas do membro", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const ana = (await signIn("ana@exemplo.com", SENHA)).cookie;
    const { token } = await createResetLink(admin, anaId);

    await resetPassword(token, NOVA);

    const velha = await api("/api/auth/get-session?disableCookieCache=true", { cookie: ana });
    expect(await velha.json()).toBeNull();
  });

  it("o link de redefinicao e de uso unico", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const { token } = await createResetLink(admin, anaId);
    await resetPassword(token, NOVA);

    const info = await resetInfo(token);
    expect(info.status).toBe(410);
    expect(await info.json()).toMatchObject({ error: "usado" });
    expect((await resetPassword(token, "mais-uma-senha-789")).status).toBe(410);
    expect((await signIn("ana@exemplo.com", NOVA)).res.status).toBe(200);
  });

  it("link de redefinicao vencido mostra mensagem clara e nao troca a senha", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const { token } = await createResetLink(admin, anaId);
    await expireAllLinks();

    const info = await resetInfo(token);
    expect(info.status).toBe(410);
    expect(await info.json()).toMatchObject({ error: "expirado", message: expect.stringContaining("venceu") });
    expect((await resetPassword(token, NOVA)).status).toBe(410);
    expect((await signIn("ana@exemplo.com", SENHA)).res.status).toBe(200);
  });

  it("senha curta e recusada sem gastar o link; convite nao serve como link de redefinicao", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const { token } = await createResetLink(admin, anaId);
    const convite = await createInvite(admin);

    expect((await resetPassword(token, "curta")).status).toBe(400);
    expect((await resetPassword(convite.token, NOVA)).status).toBe(410);
    expect((await resetPassword(token, NOVA)).status).toBe(200);
  });

  it("link para membro inexistente nao e gerado", async () => {
    const admin = await loginAsAdmin();
    expect((await createResetLink(admin, "nao-existe")).res.status).toBe(404);
  });
});

describe("Rotas de admin recusam atendentes", () => {
  async function comoAtendente() {
    const admin = await loginAsAdmin();
    const id = await createUser({ email: "ana@exemplo.com", password: SENHA });
    return { admin, id, cookie: (await signIn("ana@exemplo.com", SENHA)).cookie };
  }

  it("GET /api/admin/members", async () => {
    const { cookie } = await comoAtendente();
    expect((await api("/api/admin/members", { cookie })).status).toBe(403);
    expect((await api("/api/admin/members")).status).toBe(401);
  });

  it("POST /api/admin/invites", async () => {
    const { cookie } = await comoAtendente();
    expect((await postJson("/api/admin/invites", { role: "admin" }, { cookie })).status).toBe(403);
    expect((await postJson("/api/admin/invites", { role: "admin" })).status).toBe(401);
  });

  it("PATCH /api/admin/members/:id", async () => {
    const { admin, id, cookie } = await comoAtendente();
    const alvo = (await teamList(admin)).members.find((m) => m.email === "admin@exemplo.com")!;
    expect((await changeRole(cookie, alvo.id, "atendente")).status).toBe(403);
    expect((await changeRole(cookie, id, "admin")).status).toBe(403);
    expect((await teamList(admin)).members.map((m) => m.role).sort()).toEqual(["admin", "atendente"]);
  });

  it("DELETE /api/admin/members/:id", async () => {
    const { admin, cookie } = await comoAtendente();
    const alvo = (await teamList(admin)).members.find((m) => m.email === "admin@exemplo.com")!;
    expect((await removeMember(cookie, alvo.id)).status).toBe(403);
    expect((await teamList(admin)).members).toHaveLength(2);
  });

  it("POST /api/admin/members/:id/reset-link", async () => {
    const { admin, cookie } = await comoAtendente();
    const alvo = (await teamList(admin)).members.find((m) => m.email === "admin@exemplo.com")!;
    expect((await createResetLink(cookie, alvo.id)).res.status).toBe(403);
  });
});

describe("Lista de membros e papel", () => {
  it("o admin ve nome, e-mail e papel de cada membro", async () => {
    const admin = await loginAsAdmin();
    await createUser({ email: "ana@exemplo.com", name: "Ana", password: SENHA });

    const { status, members } = await teamList(admin);

    expect(status).toBe(200);
    expect(members).toMatchObject([
      { name: "Ana", email: "ana@exemplo.com", role: "atendente" },
      { name: "Pessoa de Teste", email: "admin@exemplo.com", role: "admin" },
    ]);
  });

  it("o admin promove e rebaixa; a mudanca vale na hora nas rotas de admin", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const ana = (await signIn("ana@exemplo.com", SENHA)).cookie;
    expect((await teamList(ana)).status).toBe(403);

    expect((await changeRole(admin, anaId, "admin")).status).toBe(200);
    expect((await teamList(ana)).status).toBe(200);

    expect((await changeRole(admin, anaId, "atendente")).status).toBe(200);
    expect((await teamList(ana)).status).toBe(403);
  });

  it("papel invalido, membro inexistente e mudar o proprio papel sao recusados", async () => {
    const admin = await loginAsAdmin();
    const anaId = await createUser({ email: "ana@exemplo.com", password: SENHA });
    const eu = (await teamList(admin)).members.find((m) => m.email === "admin@exemplo.com")!;

    expect((await changeRole(admin, anaId, "dono")).status).toBe(400);
    expect((await changeRole(admin, "nao-existe", "admin")).status).toBe(404);
    expect((await changeRole(admin, eu.id, "atendente")).status).toBe(409);
  });
});
