import { Hono } from "hono";
import { createDb } from "../db";
import { errorName } from "../errors";
import { type AppEnv, requireAuth, requireRole } from "../middleware";
import { createUazapiClient } from "./client";
import { normalizeBaseUrl, resolveUazapiConfig, saveUazapiConfig, summarize } from "./config";

/** Dados da Uazapi pela tela (so admin; requireRole relê o papel no D1). Nunca devolve o token. */
export const uazapiAdmin = new Hono<AppEnv>();
uazapiAdmin.use("*", requireAuth, requireRole("admin"));

uazapiAdmin.get("/", async (c) => c.json(summarize(await resolveUazapiConfig(c.env))));

uazapiAdmin.put("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { baseUrl?: unknown; token?: unknown } | null;
  const baseUrl = normalizeBaseUrl(body?.baseUrl);
  if (!baseUrl) return c.json({ error: "endereco_invalido" }, 400);

  const db = createDb(c.env.DB);
  // Campo vazio mantem o token atual (o navegador nunca o recebe de volta).
  const typed = typeof body?.token === "string" ? body.token.trim() : "";
  const token = typed || (await resolveUazapiConfig(c.env, db))?.token;
  if (!token) return c.json({ error: "token_obrigatorio" }, 400);

  // So grava o que a Uazapi aceitou.
  try {
    await createUazapiClient({ UAZAPI_BASE_URL: baseUrl, UAZAPI_INSTANCE_TOKEN: token, UAZAPI_TIMEOUT_MS: c.env.UAZAPI_TIMEOUT_MS }).getInstanceStatus();
  } catch (err) {
    console.error("uazapi: dados recusados ao salvar", { erro: errorName(err) });
    return c.json({ error: "uazapi_recusou" }, 400);
  }
  await saveUazapiConfig(c.env, db, { baseUrl, token });
  return c.json(summarize(await resolveUazapiConfig(c.env, db)));
});
