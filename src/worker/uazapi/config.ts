import { eq } from "drizzle-orm";
import { createDb, type Db, schema } from "../db";
import { createUazapiClient, type UazapiClient, type UazapiClientOptions } from "./client";

/**
 * Dados da Uazapi: o que o admin salvou pela tela (banco) vence; sem isso, valem as variaveis de ambiente.
 * TODO uso do cliente da Uazapi passa por aqui. Sem cache entre requisicoes: uma leitura do D1 por chamada.
 */
export interface UazapiConfig {
  baseUrl: string;
  token: string;
  source: "database" | "environment";
}

export class UazapiNotConfiguredError extends Error {
  constructor() {
    super("Uazapi nao configurada");
    this.name = "UazapiNotConfiguredError";
  }
}

const ROW_ID = "instance";
// Rotulo proprio: a mesma BETTER_AUTH_SECRET nao deriva a mesma chave para outro uso.
const HKDF_INFO = "crm-simples/uazapi-token/v1";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(HKDF_INFO) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(secret: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(secret), new TextEncoder().encode(token));
  return `${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}

/** Null quando nao decifra (BETTER_AUTH_SECRET trocada ou dado corrompido): conta como nao configurado. */
async function decryptToken(secret: string, stored: string): Promise<string | null> {
  try {
    const [iv, cipher] = stored.split(".");
    if (!iv || !cipher) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await deriveKey(secret), unb64(cipher));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function resolveUazapiConfig(env: Cloudflare.Env, db: Db = createDb(env.DB)): Promise<UazapiConfig | null> {
  const row = await db.query.uazapiSetting.findFirst({ where: eq(schema.uazapiSetting.id, ROW_ID) });
  if (row) {
    const token = await decryptToken(env.BETTER_AUTH_SECRET, row.tokenEnc);
    if (token) return { baseUrl: row.baseUrl, token, source: "database" };
  }
  if (env.UAZAPI_BASE_URL && env.UAZAPI_INSTANCE_TOKEN) {
    return { baseUrl: env.UAZAPI_BASE_URL, token: env.UAZAPI_INSTANCE_TOKEN, source: "environment" };
  }
  return null;
}

/** Cliente da Uazapi com os dados vigentes. Lanca UazapiNotConfiguredError quando nao ha dado nenhum. */
export async function getUazapiClient(env: Cloudflare.Env, options?: UazapiClientOptions): Promise<UazapiClient> {
  const config = await resolveUazapiConfig(env);
  if (!config) throw new UazapiNotConfiguredError();
  return createUazapiClient(
    { UAZAPI_BASE_URL: config.baseUrl, UAZAPI_INSTANCE_TOKEN: config.token, UAZAPI_TIMEOUT_MS: env.UAZAPI_TIMEOUT_MS },
    options,
  );
}

/** Resumo seguro para a API: endereco e as ultimas letras do token, nunca o token. */
export interface UazapiConfigSummary {
  configured: boolean;
  baseUrl?: string;
  tokenHint?: string;
}

export function summarize(config: UazapiConfig | null): UazapiConfigSummary {
  if (!config) return { configured: false };
  return { configured: true, baseUrl: config.baseUrl, tokenHint: `••••${config.token.slice(-4)}` };
}

/** Grava (upsert) o endereco e o token cifrado. */
export async function saveUazapiConfig(env: Cloudflare.Env, db: Db, input: { baseUrl: string; token: string }): Promise<void> {
  const row = {
    id: ROW_ID,
    baseUrl: input.baseUrl,
    tokenEnc: await encryptToken(env.BETTER_AUTH_SECRET, input.token),
    tokenLast4: input.token.slice(-4),
    updatedAt: Date.now(),
  };
  await db.insert(schema.uazapiSetting).values(row).onConflictDoUpdate({ target: schema.uazapiSetting.id, set: row });
}

/** Aceita https; http so para a maquina local (testes e desenvolvimento). Devolve so a origem, sem barra final. */
export function normalizeBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url.origin;
}
