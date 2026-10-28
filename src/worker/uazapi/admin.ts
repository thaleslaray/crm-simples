import { Hono } from "hono";
import { createDb, type Db } from "../db";
import { errorName } from "../errors";
import { getWebhookSecret } from "../instance-secrets";
import { type AppEnv, requireAuth, requireRole } from "../middleware";
import type { UazapiInstance } from "./client";
import {
  clearUazapiConfig,
  createAdminClient,
  createInstanceClient,
  loadAdminAccess,
  normalizeBaseUrl,
  saveAdminAccess,
  saveChosenInstance,
  summarize,
} from "./config";

/** Dados da Uazapi pela tela (so admin; requireRole relê o papel no D1). Nenhum token volta ao navegador. */
export const uazapiAdmin = new Hono<AppEnv>();
uazapiAdmin.use("*", requireAuth, requireRole("admin"));

const readBody = (req: Request) => req.json().catch(() => null) as Promise<Record<string, unknown> | null>;
const textOf = (v: unknown) => (typeof v === "string" ? v.trim() : "");

uazapiAdmin.get("/", async (c) => c.json(await summarize(c.env, createDb(c.env.DB))));

// Endereco + admin token. So grava o que a Uazapi aceitou (GET /instance/all).
uazapiAdmin.put("/", async (c) => {
  const body = await readBody(c.req.raw);
  const baseUrl = normalizeBaseUrl(body?.baseUrl);
  if (!baseUrl) return c.json({ error: "endereco_invalido" }, 400);

  const db = createDb(c.env.DB);
  // Campo vazio mantem o admin token atual (o navegador nunca o recebe de volta).
  const adminToken = textOf(body?.adminToken) || (await loadAdminAccess(c.env, db))?.adminToken;
  if (!adminToken) return c.json({ error: "token_obrigatorio" }, 400);

  try {
    await createAdminClient(c.env, { baseUrl, adminToken }).listInstances();
  } catch (err) {
    console.error("uazapi: admin token recusado ao salvar", { erro: errorName(err) });
    return c.json({ error: "uazapi_recusou" }, 400);
  }
  await saveAdminAccess(c.env, db, { baseUrl, adminToken });
  return c.json(await summarize(c.env, db));
});

// Volta ao estado "nao configurado" (valem as variaveis de ambiente, se houver).
uazapiAdmin.delete("/", async (c) => {
  const db = createDb(c.env.DB);
  await clearUazapiConfig(db);
  return c.json(await summarize(c.env, db));
});

/** Cliente admin com os dados guardados, ou null quando nao ha admin token. */
async function adminClient(env: Cloudflare.Env, db: Db) {
  const access = await loadAdminAccess(env, db);
  return access ? { access, client: createAdminClient(env, access) } : null;
}

uazapiAdmin.get("/instances", async (c) => {
  const admin = await adminClient(c.env, createDb(c.env.DB));
  if (!admin) return c.json({ error: "admin_token_obrigatorio" }, 400);
  try {
    const instances = await admin.client.listInstances();
    // So o que a tela precisa: nunca `token`, `owner` e afins.
    return c.json({
      instances: instances.map(({ id, name, status, profileName, profilePicUrl }) => ({ id, name, status, profileName, profilePicUrl })),
    });
  } catch (err) {
    console.error("uazapi: falha ao listar instancias", { erro: errorName(err) });
    return c.json({ error: "uazapi_indisponivel" }, 502);
  }
});

/** Cadastra o webhook da instancia e so entao grava a escolha: instancia sem webhook nao recebe mensagem. */
async function adopt(env: Cloudflare.Env, requestUrl: string, db: Db, baseUrl: string, instance: UazapiInstance) {
  await createInstanceClient(env, { baseUrl, token: instance.token }).configureWebhook(
    `${new URL(requestUrl).origin}/api/webhook/${await getWebhookSecret(env)}`,
  );
  await saveChosenInstance(env, db, { id: instance.id, name: instance.name, token: instance.token });
}

// Escolher: o servidor busca de novo a lista e pega o token pelo id. O navegador so manda o id.
uazapiAdmin.put("/instance", async (c) => {
  const id = textOf((await readBody(c.req.raw))?.id);
  const db = createDb(c.env.DB);
  const admin = await adminClient(c.env, db);
  if (!admin) return c.json({ error: "admin_token_obrigatorio" }, 400);
  try {
    const instance = (await admin.client.listInstances()).find((i) => i.id === id);
    if (!instance) return c.json({ error: "instancia_nao_encontrada" }, 404);
    await adopt(c.env, c.req.url, db, admin.access.baseUrl, instance);
  } catch (err) {
    console.error("uazapi: falha ao escolher instancia", { erro: errorName(err) });
    return c.json({ error: "uazapi_indisponivel" }, 502);
  }
  return c.json(await summarize(c.env, db));
});

// Criar pelo nome e ja selecionar.
uazapiAdmin.post("/instances", async (c) => {
  const name = textOf((await readBody(c.req.raw))?.name);
  if (!name) return c.json({ error: "nome_obrigatorio" }, 400);
  const db = createDb(c.env.DB);
  const admin = await adminClient(c.env, db);
  if (!admin) return c.json({ error: "admin_token_obrigatorio" }, 400);
  try {
    await adopt(c.env, c.req.url, db, admin.access.baseUrl, await admin.client.createInstance(name));
  } catch (err) {
    console.error("uazapi: falha ao criar instancia", { erro: errorName(err) });
    return c.json({ error: "uazapi_indisponivel" }, 502);
  }
  return c.json(await summarize(c.env, db));
});
