import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { api, cookieFrom, postJson, signIn } from "./helpers/api";
import { createUser } from "./helpers/users";

const SENHA = "senha-segura-123";

describe("login e sessao", () => {
  it("login com credenciais certas cria sessao", async () => {
    await createUser({ email: "ana@exemplo.com", name: "Ana", password: SENHA, role: "atendente" });

    const { res, cookie } = await signIn("ana@exemplo.com", SENHA);
    expect(res.status).toBe(200);
    expect(cookie).toContain("session_token");

    const me = await api("/api/me", { cookie });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      user: { name: "Ana", email: "ana@exemplo.com", role: "atendente", signatureEnabled: true },
    });
  });

  it("e-mail no login nao diferencia maiusculas de minusculas", async () => {
    await createUser({ email: "Bia@Exemplo.com", password: SENHA });
    const { res } = await signIn("bia@exemplo.com", SENHA);
    expect(res.status).toBe(200);
  });

  it("senha errada e recusada e nao cria sessao", async () => {
    await createUser({ email: "caio@exemplo.com", password: SENHA });

    const { res, cookie } = await signIn("caio@exemplo.com", "senha-errada-999");
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().join(";")).not.toContain("session_token");
    // Sem sessao: nem o cookie que voltou (se houver) abre /api/me.
    expect((await api("/api/me", { cookie })).status).toBe(401);
  });

  it("usuario inexistente e recusado", async () => {
    const { res } = await signIn("ninguem@exemplo.com", SENHA);
    expect(res.status).toBe(401);
  });

  it("cadastro publico e recusado e nao cria usuario", async () => {
    const res = await postJson("/api/auth/sign-up/email", {
      email: "intruso@exemplo.com",
      name: "Intruso",
      password: SENHA,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // Nenhuma conta nasceu: o login com as mesmas credenciais falha.
    expect((await signIn("intruso@exemplo.com", SENHA)).res.status).toBe(401);
  });

  it("cadastro publico nao consegue se declarar admin", async () => {
    const res = await postJson("/api/auth/sign-up/email", {
      email: "intruso2@exemplo.com",
      name: "Intruso",
      password: SENHA,
      role: "admin",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await signIn("intruso2@exemplo.com", SENHA)).res.status).toBe(401);
  });

  it("/api/me sem sessao responde 401", async () => {
    const res = await api("/api/me");
    expect(res.status).toBe(401);
  });

  it("/api/me com cookie invalido responde 401", async () => {
    const res = await api("/api/me", { cookie: "better-auth.session_token=lixo.lixo" });
    expect(res.status).toBe(401);
  });

  it("logout encerra a sessao", async () => {
    await createUser({ email: "dani@exemplo.com", password: SENHA });
    const { cookie } = await signIn("dani@exemplo.com", SENHA);
    expect((await api("/api/me", { cookie })).status).toBe(200);

    const out = await postJson("/api/auth/sign-out", {}, { cookie });
    expect(out.status).toBe(200);

    // O cookie devolvido pelo servidor ja vem limpo, entao o navegador volta a ficar sem sessao.
    const after = await api("/api/me", { cookie: cookieFrom(out) });
    expect(after.status).toBe(401);
    // E a sessao antiga morreu no servidor: /api/me aceita cookie em cache por 60s, entao provamos por
    // uma rota com papel (que relê o D1) e pelo get-session sem cache.
    const velha = await api("/api/auth/get-session?disableCookieCache=true", { cookie });
    expect(await velha.json()).toBeNull();
  });
});

describe("papeis", () => {
  it("rota so-admin: 401 sem sessao, 403 para atendente, 200 para admin", async () => {
    await createUser({ email: "admin@exemplo.com", password: SENHA, role: "admin" });
    await createUser({ email: "atendente@exemplo.com", password: SENHA, role: "atendente" });

    expect((await api("/api/admin/ping")).status).toBe(401);

    const atendente = await signIn("atendente@exemplo.com", SENHA);
    expect((await api("/api/admin/ping", { cookie: atendente.cookie })).status).toBe(403);

    const admin = await signIn("admin@exemplo.com", SENHA);
    const ok = await api("/api/admin/ping", { cookie: admin.cookie });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
  });

  it("rebaixar um admin vale na hora nas rotas de admin (nao fica preso no cache de sessao)", async () => {
    await createUser({ email: "chefe@exemplo.com", password: SENHA, role: "admin" });
    const { cookie } = await signIn("chefe@exemplo.com", SENHA);
    expect((await api("/api/admin/ping", { cookie })).status).toBe(200);

    await env.DB.prepare("UPDATE user SET role = 'atendente' WHERE email = ?").bind("chefe@exemplo.com").run();

    expect((await api("/api/admin/ping", { cookie })).status).toBe(403);
  });

  it("sessao encerrada (logout) nao vale mais em rotas de admin, mesmo reenviando o cookie antigo", async () => {
    await createUser({ email: "fabio@exemplo.com", password: SENHA, role: "admin" });
    const { cookie } = await signIn("fabio@exemplo.com", SENHA);
    await postJson("/api/auth/sign-out", {}, { cookie });

    expect((await api("/api/admin/ping", { cookie })).status).toBe(401);
  });

  it("cliente nao consegue alterar o proprio papel pela API publica", async () => {
    await createUser({ email: "eva@exemplo.com", password: SENHA, role: "atendente" });
    const { cookie } = await signIn("eva@exemplo.com", SENHA);

    await postJson("/api/auth/update-user", { role: "admin", name: "Eva" }, { cookie });

    expect((await api("/api/admin/ping", { cookie })).status).toBe(403);
    const me = await api("/api/me", { cookie });
    expect(await me.json()).toMatchObject({ user: { role: "atendente" } });
  });
});
