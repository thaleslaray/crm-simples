import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, postJson, signIn } from "./helpers/api";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";
import { getUazapiConfig, putUazapiConfig, storedUazapiRow, withoutUazapiEnv } from "./helpers/uazapi-config";
import { createUser, setUserRole } from "./helpers/users";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

const TOKEN = "token-novo-abcdef123456-wxyz";
const statusOk = { body: { instance: { status: "disconnected" } } };

describe("dados da Uazapi pela tela: rotas do admin", () => {
  const uazapi = fakeUazapi();
  // O servidor falso roda em 127.0.0.1 (http), o unico http aceito.
  const save = (cookie: string | undefined, token: unknown = TOKEN, baseUrl: unknown = env.UAZAPI_BASE_URL) =>
    putUazapiConfig(cookie, { baseUrl, token });

  it("atendente nao le nem grava (403)", async () => {
    const cookie = await loginAsAtendente();
    expect((await getUazapiConfig(cookie)).status).toBe(403);
    expect((await save(cookie)).status).toBe(403);
  });

  it("sem login responde 401", async () => {
    expect((await getUazapiConfig()).status).toBe(401);
    expect((await save(undefined)).status).toBe(401);
  });

  it("admin rebaixado, mesmo com cookie ainda valido, e barrado", async () => {
    const userId = await createUser({ email: "ex-admin@exemplo.com", password: "senha-segura-123", role: "admin" });
    const { cookie } = await signIn("ex-admin@exemplo.com", "senha-segura-123");
    await uazapi.program("GET", "/instance/status", [statusOk]);
    await setUserRole(userId, "atendente");

    expect((await getUazapiConfig(cookie)).status).toBe(403);
    expect((await save(cookie)).status).toBe(403);
    expect(await storedUazapiRow()).toBeNull();
  });

  it("salvar devolve so o endereco e os 4 ultimos caracteres do token, nunca o token inteiro", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [statusOk]);

    const put = await save(cookie);
    const get = await getUazapiConfig(cookie);

    for (const res of [put, get]) {
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(TOKEN);
      expect(JSON.parse(text)).toEqual({ configured: true, baseUrl: env.UAZAPI_BASE_URL, tokenHint: "••••wxyz" });
    }
  });

  it("valida o token na Uazapi com os dados novos antes de gravar", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [statusOk]);

    await save(cookie);

    expect(await uazapi.calls()).toMatchObject([{ method: "GET", path: "/instance/status", headers: { token: TOKEN } }]);
  });

  it("o valor gravado no banco nao contem o token em claro", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [statusOk]);

    await save(cookie);

    const row = await storedUazapiRow();
    expect(row).not.toBeNull();
    expect(row).not.toContain(TOKEN);
    expect(row).not.toContain("abcdef123456");
  });

  it("recusa quando a Uazapi nao aceita o token (400) e nao grava nada", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [{ status: 401, body: { error: "unauthorized" } }]);

    const res = await save(cookie);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "uazapi_recusou" });
    expect(await storedUazapiRow()).toBeNull();
  });

  it("recusa quando a Uazapi nao responde (400)", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [{ delayMs: 2000, body: {} }]);

    const res = await save(cookie);

    expect(res.status).toBe(400);
    expect(await storedUazapiRow()).toBeNull();
  });

  it.each([
    ["http fora de localhost", "http://uazapi.exemplo.com"],
    ["protocolo estranho", "ftp://uazapi.exemplo.com"],
    ["texto solto", "meu servidor"],
    ["vazio", ""],
  ])("recusa endereco invalido: %s", async (_nome, baseUrl) => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [statusOk]);

    const res = await save(cookie, TOKEN, baseUrl);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "endereco_invalido" });
    expect(await uazapi.calls()).toEqual([]);
  });

  it("token vazio mantem o atual e troca so o endereco", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [statusOk]);
    await save(cookie);
    const outroEndereco = env.UAZAPI_BASE_URL.replace("127.0.0.1", "localhost");

    const res = await save(cookie, "", outroEndereco);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, baseUrl: outroEndereco, tokenHint: "••••wxyz" });
    expect((await uazapi.calls()).at(-1)).toMatchObject({ headers: { token: TOKEN } });
  });

  it("token vazio sem nenhum token guardado e recusado", async () => {
    const cookie = await loginAsAdmin();

    const endereco = env.UAZAPI_BASE_URL;

    const res = await withoutUazapiEnv(() => save(cookie, "", endereco));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "token_obrigatorio" });
  });

  it("sem dados no banco usa o ambiente; sem nenhum dos dois, nao esta configurado", async () => {
    const cookie = await loginAsAdmin();

    expect(await (await getUazapiConfig(cookie)).json()).toEqual({
      configured: true,
      baseUrl: env.UAZAPI_BASE_URL,
      tokenHint: "••••este",
    });
    expect(await withoutUazapiEnv(async () => (await getUazapiConfig(cookie)).json())).toEqual({ configured: false });
  });
});

describe("dados da Uazapi pela tela: o resto do sistema usa o que foi salvo", () => {
  const uazapi = fakeUazapi();
  const salvar = async (cookie: string) => {
    await uazapi.program("GET", "/instance/status", [statusOk]);
    expect((await putUazapiConfig(cookie, { baseUrl: env.UAZAPI_BASE_URL, token: TOKEN })).status).toBe(200);
  };

  it("o banco vence o ambiente: as chamadas a Uazapi levam o token salvo", async () => {
    const cookie = await loginAsAdmin();
    await salvar(cookie);

    await api("/api/connection/status", { cookie });

    expect((await uazapi.calls()).at(-1)).toMatchObject({ path: "/instance/status", headers: { token: TOKEN } });
  });

  it("sem dados no banco, as chamadas usam o token do ambiente", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/status", [statusOk]);

    await api("/api/connection/status", { cookie });

    expect((await uazapi.calls()).at(-1)).toMatchObject({ headers: { token: env.UAZAPI_INSTANCE_TOKEN } });
  });

  it("o webhook aceita o token salvo e deixa de aceitar o do ambiente", async () => {
    const cookie = await loginAsAdmin();
    await salvar(cookie);

    expect((await postWebhook(textMessageEvent({ token: TOKEN }))).status).toBe(200);
    expect((await postWebhook(textMessageEvent({ token: env.UAZAPI_INSTANCE_TOKEN }))).status).toBe(401);
  });

  it("sem nenhuma configuracao o webhook recusa ate token vazio", async () => {
    const res = await withoutUazapiEnv(() => postWebhook(textMessageEvent({ token: "" })));
    expect(res.status).toBe(401);
  });

  it("sem configuracao, conectar o numero falha com 502 e nao chama a Uazapi", async () => {
    const cookie = await loginAsAdmin();

    const res = await withoutUazapiEnv(() => postJson("/api/connection/connect", {}, { cookie }));

    expect(res.status).toBe(502);
    expect(await uazapi.calls()).toEqual([]);
  });
});
