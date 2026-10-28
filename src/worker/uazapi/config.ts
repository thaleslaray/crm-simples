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
const ADMIN_ROW_ID = "admin";
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

/** Instancia escolhida, para a tela: so id e nome (o token fica no servidor). */
export interface ChosenInstance {
  id: string;
  name: string;
}

/** Acesso admin guardado: endereco, admin token e (se ja escolhida) a instancia. */
export interface UazapiAdminAccess {
  baseUrl: string;
  adminToken: string;
  instance: (ChosenInstance & { token: string }) | null;
}

export async function loadAdminAccess(env: Cloudflare.Env, db: Db = createDb(env.DB)): Promise<UazapiAdminAccess | null> {
  const row = await db.query.uazapiAdmin.findFirst({ where: eq(schema.uazapiAdmin.id, ADMIN_ROW_ID) });
  if (!row) return null;
  const adminToken = await decryptToken(env.BETTER_AUTH_SECRET, row.adminTokenEnc);
  if (!adminToken) return null;
  const token = row.instanceTokenEnc ? await decryptToken(env.BETTER_AUTH_SECRET, row.instanceTokenEnc) : null;
  const instance = token && row.instanceId ? { id: row.instanceId, name: row.instanceName ?? "", token } : null;
  return { baseUrl: row.baseUrl, adminToken, instance };
}

/** Prioridade: instancia escolhida (admin) -> token de instancia do ticket 01 -> variaveis de ambiente. */
export async function resolveUazapiConfig(env: Cloudflare.Env, db: Db = createDb(env.DB)): Promise<UazapiConfig | null> {
  const admin = await loadAdminAccess(env, db);
  if (admin?.instance) return { baseUrl: admin.baseUrl, token: admin.instance.token, source: "database" };
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
  return createInstanceClient(env, config, options);
}

/** Cliente com o admin token (listar e criar instancias). */
export function createAdminClient(env: Cloudflare.Env, access: { baseUrl: string; adminToken: string }, options?: UazapiClientOptions): UazapiClient {
  return createUazapiClient(
    { UAZAPI_BASE_URL: access.baseUrl, UAZAPI_INSTANCE_TOKEN: "", UAZAPI_ADMIN_TOKEN: access.adminToken, UAZAPI_TIMEOUT_MS: env.UAZAPI_TIMEOUT_MS },
    options,
  );
}

/** Cliente de uma instancia especifica (tambem serve para cadastrar o webhook dela antes de gravar a escolha). */
export function createInstanceClient(env: Cloudflare.Env, input: { baseUrl: string; token: string }, options?: UazapiClientOptions): UazapiClient {
  return createUazapiClient(
    { UAZAPI_BASE_URL: input.baseUrl, UAZAPI_INSTANCE_TOKEN: input.token, UAZAPI_TIMEOUT_MS: env.UAZAPI_TIMEOUT_MS },
    options,
  );
}

/** Resumo seguro para a API: nada de token, so o fim do admin token e a instancia escolhida (id e nome). */
export interface UazapiConfigSummary {
  configured: boolean;
  baseUrl?: string;
  adminTokenHint?: string;
  instance?: ChosenInstance | null;
}

export async function summarize(env: Cloudflare.Env, db: Db): Promise<UazapiConfigSummary> {
  const [config, admin] = await Promise.all([resolveUazapiConfig(env, db), loadAdminAccess(env, db)]);
  if (!config && !admin) return { configured: false };
  return {
    configured: config !== null,
    baseUrl: admin?.baseUrl ?? config?.baseUrl,
    ...(admin ? { adminTokenHint: `••••${admin.adminToken.slice(-4)}` } : {}),
    instance: admin?.instance ? { id: admin.instance.id, name: admin.instance.name } : null,
  };
}

/** Grava (upsert) endereco e admin token cifrado. A escolha de instancia so sobrevive se o servidor for o mesmo. */
export async function saveAdminAccess(env: Cloudflare.Env, db: Db, input: { baseUrl: string; adminToken: string }): Promise<void> {
  const before = await loadAdminAccess(env, db);
  const keep = before?.baseUrl === input.baseUrl ? before.instance : null;
  const row = {
    id: ADMIN_ROW_ID,
    baseUrl: input.baseUrl,
    adminTokenEnc: await encryptToken(env.BETTER_AUTH_SECRET, input.adminToken),
    adminTokenLast4: input.adminToken.slice(-4),
    instanceId: keep?.id ?? null,
    instanceName: keep?.name ?? null,
    instanceTokenEnc: keep ? await encryptToken(env.BETTER_AUTH_SECRET, keep.token) : null,
    updatedAt: Date.now(),
  };
  await db.insert(schema.uazapiAdmin).values(row).onConflictDoUpdate({ target: schema.uazapiAdmin.id, set: row });
}

/** Grava a instancia escolhida (token cifrado) no acesso admin ja existente. */
export async function saveChosenInstance(env: Cloudflare.Env, db: Db, input: { id: string; name: string; token: string }): Promise<void> {
  await db
    .update(schema.uazapiAdmin)
    .set({
      instanceId: input.id,
      instanceName: input.name,
      instanceTokenEnc: await encryptToken(env.BETTER_AUTH_SECRET, input.token),
      updatedAt: Date.now(),
    })
    .where(eq(schema.uazapiAdmin.id, ADMIN_ROW_ID));
}

/** Volta ao estado "nao configurado pela tela": apaga tudo; passam a valer as variaveis de ambiente, se houver. */
export async function clearUazapiConfig(db: Db): Promise<void> {
  await db.delete(schema.uazapiAdmin);
  await db.delete(schema.uazapiSetting);
}

/** Legado do ticket 01 (token de instancia digitado na tela). Nao ha mais tela para isso; fica para quem ja tem a linha e para os testes. */
export async function saveLegacyInstanceToken(env: Cloudflare.Env, db: Db, input: { baseUrl: string; token: string }): Promise<void> {
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
