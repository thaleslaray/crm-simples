import { env } from "cloudflare:workers";
import { api } from "./api";

/** Linha crua da tabela da Uazapi, como string (para provar que o token nao esta em claro). Null = sem linha. */
export async function storedUazapiRow(): Promise<string | null> {
  const row = await env.DB.prepare("SELECT * FROM uazapi_setting").first();
  return row ? JSON.stringify(row) : null;
}

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

export const getUazapiConfig = (cookie?: string) => api("/api/admin/uazapi", { cookie });

export const putUazapiConfig = (cookie: string | undefined, body: unknown) =>
  api("/api/admin/uazapi", { method: "PUT", cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
