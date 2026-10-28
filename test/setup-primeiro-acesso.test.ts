import { describe, expect, it } from "vitest";
import { api, cookieFrom, signIn } from "./helpers/api";
import { comSetupCode, DADOS, precisaDeSetup, primeiroAcesso } from "./helpers/setup";
import { createUser } from "./helpers/users";

describe("GET /api/setup", () => {
  it("diz que precisa quando nao ha usuario e o SETUP_CODE esta configurado", async () => {
    expect(await precisaDeSetup()).toBe(true);
  });

  it("diz que nao precisa sem SETUP_CODE configurado", async () => {
    expect(await comSetupCode(undefined, precisaDeSetup)).toBe(false);
    expect(await comSetupCode("", precisaDeSetup)).toBe(false);
  });

  it("diz que nao precisa quando ja existe usuario", async () => {
    await createUser({ email: "alguem@exemplo.com", password: "senha-segura-123" });
    expect(await precisaDeSetup()).toBe(false);
  });
});

describe("POST /api/setup", () => {
  it("cria o admin, abre a sessao e fecha a tela", async () => {
    const res = await primeiroAcesso({});
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    const me = await api("/api/me", { cookie });
    expect(await me.json()).toMatchObject({ user: { email: DADOS.email, name: DADOS.name, role: "admin" } });
    expect(await precisaDeSetup()).toBe(false);
    expect((await signIn(DADOS.email, DADOS.password)).res.status).toBe(200);
  });

  it("recusa com 403 o codigo errado e nao cria ninguem", async () => {
    expect((await primeiroAcesso({ code: "outra-frase" })).status).toBe(403);
    expect(await precisaDeSetup()).toBe(true);
  });

  it("recusa com 403 sem SETUP_CODE configurado, mesmo mandando codigo vazio", async () => {
    await comSetupCode(undefined, async () => {
      expect((await primeiroAcesso({ code: "" })).status).toBe(403);
      expect((await primeiroAcesso({ code: undefined })).status).toBe(403);
    });
    expect((await signIn(DADOS.email, DADOS.password)).res.status).toBe(401);
  });

  it("recusa com 403 quando ja existe usuario, mesmo com o codigo certo", async () => {
    await createUser({ email: "alguem@exemplo.com", password: "senha-segura-123" });
    expect((await primeiroAcesso({})).status).toBe(403);
    expect((await signIn(DADOS.email, DADOS.password)).res.status).toBe(401);
  });

  it("recusa com 400 senha de 11 caracteres e aceita 12", async () => {
    expect((await primeiroAcesso({ password: "onze-chars-" })).status).toBe(400);
    expect(await precisaDeSetup()).toBe(true);
    expect((await primeiroAcesso({ password: "doze-chars-1" })).status).toBe(200);
  });

  it("recusa com 400 e-mail invalido e nome vazio", async () => {
    expect((await primeiroAcesso({ email: "sem-arroba" })).status).toBe(400);
    expect((await primeiroAcesso({ name: "  " })).status).toBe(400);
    expect(await precisaDeSetup()).toBe(true);
  });

  it("duas chamadas ao mesmo tempo criam um so admin", async () => {
    const [a, b] = await Promise.all([
      primeiroAcesso({ email: "a@exemplo.com" }, "203.0.113.61"),
      primeiroAcesso({ email: "b@exemplo.com" }, "203.0.113.62"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 403]);
    const entradas = [
      (await signIn("a@exemplo.com", DADOS.password)).res.status,
      (await signIn("b@exemplo.com", DADOS.password)).res.status,
    ].sort();
    expect(entradas).toEqual([200, 401]);
  });

  it("a sexta tentativa errada seguida do mesmo IP recebe 429, mesmo com o codigo certo", async () => {
    for (let i = 0; i < 5; i++) expect((await primeiroAcesso({ code: "errado" }, "203.0.113.70")).status).toBe(403);
    expect((await primeiroAcesso({ code: "errado" }, "203.0.113.70")).status).toBe(429);
    expect((await primeiroAcesso({}, "203.0.113.70")).status).toBe(429);
    expect((await primeiroAcesso({}, "203.0.113.71")).status).toBe(200);
  });
});
