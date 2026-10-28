import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, signIn } from "./helpers/api";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { loginAsAdmin, loginAsAtendente } from "./helpers/session";
import {
  chooseUazapiInstance,
  createUazapiInstance,
  deleteUazapiConfig,
  getUazapiConfig,
  getUazapiInstances,
  putUazapiConfig,
  seedLegacyInstanceToken,
  storedUazapiRow,
  withoutUazapiEnv,
} from "./helpers/uazapi-config";
import { createUser, setUserRole } from "./helpers/users";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

const ADMIN_TOKEN = "admin-token-secreto-abc123-wxyz";
const LOJA = {
  id: "inst-loja",
  name: "Loja Centro",
  token: "token-loja-secreto-AAAA1111",
  status: "connected",
  profileName: "Loja do Centro",
  profilePicUrl: "https://exemplo.com/loja.jpg",
  owner: "5511999990001",
};
const SUPORTE = {
  id: "inst-suporte",
  name: "Suporte",
  token: "token-suporte-secreto-BBBB2222",
  status: "disconnected",
  profileName: "",
  profilePicUrl: "",
  owner: "",
};
const status = (s: string) => ({ body: { instance: { status: s } } });

describe("dados da Uazapi pela tela: admin token", () => {
  const uazapi = fakeUazapi();
  const programList = (instances: unknown[] = [LOJA, SUPORTE]) => uazapi.program("GET", "/instance/all", [{ body: instances }]);
  // O servidor falso roda em 127.0.0.1 (http), o unico http aceito.
  const save = (cookie: string | undefined, adminToken: unknown = ADMIN_TOKEN, baseUrl: unknown = env.UAZAPI_BASE_URL) =>
    putUazapiConfig(cookie, { baseUrl, adminToken });

  it("atendente nao acessa nenhuma rota (403)", async () => {
    const cookie = await loginAsAtendente();
    const respostas = await Promise.all([
      getUazapiConfig(cookie),
      save(cookie),
      getUazapiInstances(cookie),
      createUazapiInstance(cookie, { name: "Nova" }),
      chooseUazapiInstance(cookie, { id: LOJA.id }),
      deleteUazapiConfig(cookie),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await uazapi.calls()).toEqual([]);
  });

  it("sem login responde 401", async () => {
    expect((await getUazapiConfig()).status).toBe(401);
    expect((await save(undefined)).status).toBe(401);
    expect((await getUazapiInstances()).status).toBe(401);
  });

  it("admin rebaixado, mesmo com cookie ainda valido, e barrado", async () => {
    const userId = await createUser({ email: "ex-admin@exemplo.com", password: "senha-segura-123", role: "admin" });
    const { cookie } = await signIn("ex-admin@exemplo.com", "senha-segura-123");
    await programList();
    await setUserRole(userId, "atendente");

    expect((await getUazapiConfig(cookie)).status).toBe(403);
    expect((await save(cookie)).status).toBe(403);
    expect((await getUazapiInstances(cookie)).status).toBe(403);
    expect(await storedUazapiRow()).toBeNull();
  });

  it("salvar devolve so o endereco e os 4 ultimos caracteres do admin token, nunca o token inteiro", async () => {
    const cookie = await loginAsAdmin();
    await programList();

    const put = await save(cookie);
    const get = await getUazapiConfig(cookie);

    for (const res of [put, get]) {
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(ADMIN_TOKEN);
      expect(JSON.parse(text)).toMatchObject({ baseUrl: env.UAZAPI_BASE_URL, adminTokenHint: "••••wxyz", instance: null });
    }
  });

  it("valida o admin token na Uazapi (GET /instance/all com o header admintoken) antes de gravar", async () => {
    const cookie = await loginAsAdmin();
    await programList();

    await save(cookie);

    expect(await uazapi.calls()).toMatchObject([{ method: "GET", path: "/instance/all", headers: { admintoken: ADMIN_TOKEN } }]);
  });

  it("o admin token gravado no banco nao esta em claro", async () => {
    const cookie = await loginAsAdmin();
    await programList();

    await save(cookie);

    const row = await storedUazapiRow();
    expect(row).not.toBeNull();
    expect(row).not.toContain(ADMIN_TOKEN);
    expect(row).not.toContain("secreto-abc123");
  });

  it("recusa quando a Uazapi nao aceita o admin token (400) e nao grava nada", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/all", [{ status: 401, body: { error: "unauthorized" } }]);

    const res = await save(cookie);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "uazapi_recusou" });
    expect(await storedUazapiRow()).toBeNull();
  });

  it("recusa quando a Uazapi nao responde (400)", async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/all", [{ delayMs: 2000, body: [] }]);

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
    await programList();

    const res = await save(cookie, ADMIN_TOKEN, baseUrl);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "endereco_invalido" });
    expect(await uazapi.calls()).toEqual([]);
  });

  it("admin token vazio mantem o atual e troca so o endereco", async () => {
    const cookie = await loginAsAdmin();
    await programList();
    await save(cookie);
    const outroEndereco = env.UAZAPI_BASE_URL.replace("127.0.0.1", "localhost");

    const res = await save(cookie, "", outroEndereco);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ baseUrl: outroEndereco, adminTokenHint: "••••wxyz" });
    expect((await uazapi.calls()).at(-1)).toMatchObject({ headers: { admintoken: ADMIN_TOKEN } });
  });

  it("admin token vazio sem nenhum guardado e recusado", async () => {
    const cookie = await loginAsAdmin();

    const res = await save(cookie, "");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "token_obrigatorio" });
  });

  it("a lista de instancias traz so id, nome, status, perfil e foto, sem nenhum token", async () => {
    const cookie = await loginAsAdmin();
    await programList();
    await save(cookie);

    const res = await getUazapiInstances(cookie);

    expect(res.status).toBe(200);
    const text = await res.text();
    for (const secreto of [ADMIN_TOKEN, LOJA.token, SUPORTE.token, LOJA.owner]) expect(text).not.toContain(secreto);
    expect(JSON.parse(text)).toEqual({
      instances: [
        { id: LOJA.id, name: LOJA.name, status: "connected", profileName: LOJA.profileName, profilePicUrl: LOJA.profilePicUrl },
        { id: SUPORTE.id, name: SUPORTE.name, status: "disconnected", profileName: "", profilePicUrl: "" },
      ],
    });
  });

  it("listar sem admin token guardado responde 400", async () => {
    const cookie = await loginAsAdmin();

    const res = await getUazapiInstances(cookie);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "admin_token_obrigatorio" });
  });

  it("listar com a Uazapi fora do ar responde 502", async () => {
    const cookie = await loginAsAdmin();
    await programList();
    await save(cookie);
    await uazapi.program("GET", "/instance/all", [{ status: 500, body: {} }]);

    expect((await getUazapiInstances(cookie)).status).toBe(502);
  });
});

describe("dados da Uazapi pela tela: escolher e criar instancia", () => {
  const uazapi = fakeUazapi();
  const prepare = async () => {
    const cookie = await loginAsAdmin();
    await uazapi.program("GET", "/instance/all", [{ body: [LOJA, SUPORTE] }]);
    await uazapi.program("POST", "/webhook", [{ body: [] }]);
    expect((await putUazapiConfig(cookie, { baseUrl: env.UAZAPI_BASE_URL, adminToken: ADMIN_TOKEN })).status).toBe(200);
    return cookie;
  };

  it("escolher grava a instancia, devolve so id e nome e nunca o token dela", async () => {
    const cookie = await prepare();

    const res = await chooseUazapiInstance(cookie, { id: SUPORTE.id });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SUPORTE.token);
    expect(JSON.parse(text)).toMatchObject({ configured: true, instance: { id: SUPORTE.id, name: SUPORTE.name } });
    expect(await (await getUazapiConfig(cookie)).text()).not.toContain(SUPORTE.token);
  });

  it("o token da instancia e obtido no servidor: o que o navegador mandar junto e ignorado", async () => {
    const cookie = await prepare();

    await chooseUazapiInstance(cookie, { id: SUPORTE.id, token: "token-forjado-pelo-navegador" });
    await uazapi.program("GET", "/instance/status", [status("connected")]);
    await api("/api/connection/status", { cookie });

    expect((await uazapi.calls()).at(-1)).toMatchObject({ path: "/instance/status", headers: { token: SUPORTE.token } });
  });

  it("escolher configura o webhook da instancia nova, com o token dela", async () => {
    const cookie = await prepare();

    await chooseUazapiInstance(cookie, { id: LOJA.id });

    const hook = (await uazapi.calls()).filter((c) => c.path === "/webhook").at(-1);
    expect(hook).toMatchObject({
      method: "POST",
      headers: { token: LOJA.token },
      body: {
        enabled: true,
        url: `http://crm.test/api/webhook/${env.WEBHOOK_URL_SECRET}`,
        events: ["messages", "messages_update", "connection"],
      },
    });
  });

  it("os tokens das instancias nao ficam em claro no banco", async () => {
    const cookie = await prepare();
    await chooseUazapiInstance(cookie, { id: LOJA.id });

    const row = await storedUazapiRow();

    expect(row).not.toContain(LOJA.token);
    expect(row).not.toContain(ADMIN_TOKEN);
    expect(row).not.toContain("AAAA1111");
  });

  it("instancia que a Uazapi nao lista responde 404 e nao grava escolha", async () => {
    const cookie = await prepare();

    const res = await chooseUazapiInstance(cookie, { id: "nao-existe" });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "instancia_nao_encontrada" });
    expect(await (await getUazapiConfig(cookie)).json()).toMatchObject({ instance: null });
  });

  it("se o webhook da instancia falha, a escolha nao e gravada (502)", async () => {
    const cookie = await prepare();
    await uazapi.program("POST", "/webhook", [{ status: 500, body: {} }]);

    const res = await chooseUazapiInstance(cookie, { id: LOJA.id });

    expect(res.status).toBe(502);
    expect(await (await getUazapiConfig(cookie)).json()).toMatchObject({ instance: null });
  });

  it("trocar de instancia passa a usar o token da nova em tudo", async () => {
    const cookie = await prepare();
    await chooseUazapiInstance(cookie, { id: LOJA.id });
    await chooseUazapiInstance(cookie, { id: SUPORTE.id });
    await uazapi.program("GET", "/instance/status", [status("connected")]);

    await api("/api/connection/status", { cookie });

    expect((await uazapi.calls()).at(-1)).toMatchObject({ headers: { token: SUPORTE.token } });
  });

  it("o webhook passa a aceitar o token da instancia escolhida e deixa de aceitar o do ambiente", async () => {
    const cookie = await prepare();
    await chooseUazapiInstance(cookie, { id: LOJA.id });

    expect((await postWebhook(textMessageEvent({ token: LOJA.token }))).status).toBe(200);
    expect((await postWebhook(textMessageEvent({ token: env.UAZAPI_INSTANCE_TOKEN }))).status).toBe(401);
    expect((await postWebhook(textMessageEvent({ token: SUPORTE.token }))).status).toBe(401);
  });

  it("criar chama /instance/create com o nome e ja seleciona a instancia criada", async () => {
    const cookie = await prepare();
    const nova = { id: "inst-nova", name: "Vendas", token: "token-vendas-secreto-CCCC3333", status: "disconnected" };
    await uazapi.program("POST", "/instance/create", [
      { body: { response: "Instance created", instance: nova, name: "Vendas", token: nova.token } },
    ]);

    const res = await createUazapiInstance(cookie, { name: " Vendas " });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(nova.token);
    expect(JSON.parse(text)).toMatchObject({ instance: { id: "inst-nova", name: "Vendas" } });
    const calls = await uazapi.calls();
    expect(calls.find((c) => c.path === "/instance/create")).toMatchObject({
      method: "POST",
      headers: { admintoken: ADMIN_TOKEN },
      body: { name: "Vendas" },
    });
    expect(calls.filter((c) => c.path === "/webhook").at(-1)).toMatchObject({ headers: { token: nova.token } });
    await uazapi.program("GET", "/instance/status", [status("disconnected")]);
    await api("/api/connection/status", { cookie });
    expect((await uazapi.calls()).at(-1)).toMatchObject({ path: "/instance/status", headers: { token: nova.token } });
  });

  it("criar sem nome responde 400 e nao chama a Uazapi", async () => {
    const cookie = await prepare();
    const antes = (await uazapi.calls()).length;

    const res = await createUazapiInstance(cookie, { name: "  " });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "nome_obrigatorio" });
    expect(await uazapi.calls()).toHaveLength(antes);
  });

  it("criar quando a Uazapi recusa responde 502", async () => {
    const cookie = await prepare();
    await uazapi.program("POST", "/instance/create", [{ status: 500, body: {} }]);

    expect((await createUazapiInstance(cookie, { name: "Vendas" })).status).toBe(502);
  });

  it("trocar o endereco do servidor descarta a instancia escolhida", async () => {
    const cookie = await prepare();
    await chooseUazapiInstance(cookie, { id: LOJA.id });

    await putUazapiConfig(cookie, { baseUrl: env.UAZAPI_BASE_URL.replace("127.0.0.1", "localhost"), adminToken: "" });

    expect(await (await getUazapiConfig(cookie)).json()).toMatchObject({ instance: null });
  });
});

describe("dados da Uazapi pela tela: qual config vale", () => {
  const uazapi = fakeUazapi();
  const chooseLoja = async (cookie: string) => {
    await uazapi.program("GET", "/instance/all", [{ body: [LOJA] }]);
    await uazapi.program("POST", "/webhook", [{ body: [] }]);
    await putUazapiConfig(cookie, { baseUrl: env.UAZAPI_BASE_URL, adminToken: ADMIN_TOKEN });
    await chooseUazapiInstance(cookie, { id: LOJA.id });
  };
  const tokenUsed = async (cookie: string) => {
    await uazapi.program("GET", "/instance/status", [status("connected")]);
    await api("/api/connection/status", { cookie });
    return (await uazapi.calls()).at(-1)?.headers.token;
  };

  it("sem nada no banco valem as variaveis de ambiente", async () => {
    const cookie = await loginAsAdmin();

    expect(await tokenUsed(cookie)).toBe(env.UAZAPI_INSTANCE_TOKEN);
    expect(await (await getUazapiConfig(cookie)).json()).toMatchObject({ configured: true, instance: null });
  });

  it("o token de instancia do ticket 01 vence o ambiente", async () => {
    const cookie = await loginAsAdmin();
    await seedLegacyInstanceToken(env.UAZAPI_BASE_URL, "token-legado-do-ticket-01");

    expect(await tokenUsed(cookie)).toBe("token-legado-do-ticket-01");
  });

  it("a instancia escolhida vence o token do ticket 01 e o ambiente", async () => {
    const cookie = await loginAsAdmin();
    await seedLegacyInstanceToken(env.UAZAPI_BASE_URL, "token-legado-do-ticket-01");
    await chooseLoja(cookie);

    expect(await tokenUsed(cookie)).toBe(LOJA.token);
  });

  it("sem config nenhuma, conectar o numero falha com 502 e nao chama a Uazapi", async () => {
    const cookie = await loginAsAdmin();

    const res = await withoutUazapiEnv(() => api("/api/connection/connect", { method: "POST", cookie }));

    expect(res.status).toBe(502);
    expect(await uazapi.calls()).toEqual([]);
  });

  it("sem configuracao o webhook recusa ate token vazio", async () => {
    const res = await withoutUazapiEnv(() => postWebhook(textMessageEvent({ token: "" })));
    expect(res.status).toBe(401);
  });

  it("DELETE volta ao estado nao configurado: apaga admin token e instancia e o ambiente volta a valer", async () => {
    const cookie = await loginAsAdmin();
    await seedLegacyInstanceToken(env.UAZAPI_BASE_URL, "token-legado-do-ticket-01");
    await chooseLoja(cookie);

    const res = await deleteUazapiConfig(cookie);

    expect(res.status).toBe(200);
    expect(await storedUazapiRow()).toBeNull();
    expect(await tokenUsed(cookie)).toBe(env.UAZAPI_INSTANCE_TOKEN);
    expect(await withoutUazapiEnv(async () => (await getUazapiConfig(cookie)).json())).toEqual({ configured: false });
  });
});
