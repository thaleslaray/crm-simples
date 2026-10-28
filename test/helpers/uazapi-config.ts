import { env } from "cloudflare:workers";
import { createDb } from "../../src/worker/db";
import { saveLegacyInstanceToken } from "../../src/worker/uazapi/config";
import { api } from "./api";

/** Linhas cruas das tabelas da Uazapi, como string (para provar que nenhum token esta em claro). Null = sem linha. */
export async function storedUazapiRow(): Promise<string | null> {
  const rows = [
    ...(await env.DB.prepare("SELECT * FROM uazapi_setting").all()).results,
    ...(await env.DB.prepare("SELECT * FROM uazapi_admin").all()).results,
  ];
  return rows.length ? JSON.stringify(rows) : null;
}

/** Arrange: instalacao do ticket 01, com so o token da instancia guardado (sem admin token). */
export const seedLegacyInstanceToken = (baseUrl: string, token: string) =>
  saveLegacyInstanceToken(env, createDb(env.DB), { baseUrl, token });

/** Roda `fn` com as variaveis de ambiente da Uazapi vazias (instalacao sem segredo), restaurando ao fim. */
export async function withoutUazapiEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { base: env.UAZAPI_BASE_URL, token: env.UAZAPI_INSTANCE_TOKEN };
  env.UAZAPI_BASE_URL = "";
  env.UAZAPI_INSTANCE_TOKEN = "";
  try {
    return await fn();
  } finally {
    env.UAZAPI_BASE_URL = saved.base;
    env.UAZAPI_INSTANCE_TOKEN = saved.token;
  }
}

const json = (method: string, cookie: string | undefined, body: unknown) =>
  ({ method, cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as const;

export const getUazapiConfig = (cookie?: string) => api("/api/admin/uazapi", { cookie });
export const putUazapiConfig = (cookie: string | undefined, body: unknown) => api("/api/admin/uazapi", json("PUT", cookie, body));
export const deleteUazapiConfig = (cookie?: string) => api("/api/admin/uazapi", { method: "DELETE", cookie });
export const getUazapiInstances = (cookie?: string) => api("/api/admin/uazapi/instances", { cookie });
export const createUazapiInstance = (cookie: string | undefined, body: unknown) =>
  api("/api/admin/uazapi/instances", json("POST", cookie, body));
export const chooseUazapiInstance = (cookie: string | undefined, body: unknown) =>
  api("/api/admin/uazapi/instance", json("PUT", cookie, body));
