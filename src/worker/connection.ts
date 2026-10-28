import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import { type ConnectionStatus } from "./db/schema";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { publish } from "./realtime";
import { getUazapiClient } from "./uazapi/config";
import { errorName } from "./errors";

const ROW_ID = "instance";

/** Estado da conexao no formato da API. `unknown` = nenhum evento nem checagem ainda. */
export interface ConnectionState {
  status: ConnectionStatus | "unknown";
  temporaryBan: boolean;
  lastDisconnectReason: string | null;
  updatedAt: number | null;
}

export async function loadConnection(db: Db): Promise<ConnectionState> {
  const row = await db.query.connectionState.findFirst({ where: eq(schema.connectionState.id, ROW_ID) });
  if (!row) return { status: "unknown", temporaryBan: false, lastDisconnectReason: null, updatedAt: null };
  return {
    status: row.status,
    temporaryBan: row.status !== "connected" && row.disconnectType === "TemporaryBan",
    lastDisconnectReason: row.lastDisconnectReason,
    updatedAt: row.updatedAt,
  };
}

/** Status da Uazapi (texto livre) para os que o CRM conhece; o que nao for connected/connecting conta como caido. */
export function normalizeStatus(raw: unknown): ConnectionStatus {
  return raw === "connected" || raw === "connecting" ? raw : "disconnected";
}

export interface ConnectionObservation {
  status: ConnectionStatus;
  disconnectType?: string | null;
  lastDisconnectReason?: string | null;
}

/** Grava o que foi observado (webhook, cron, tela) e publica no hub quando algo mudou para os membros. */
export async function recordConnection(env: Cloudflare.Env, db: Db, obs: ConnectionObservation): Promise<ConnectionState> {
  const before = await loadConnection(db);
  const row = {
    id: ROW_ID,
    status: obs.status,
    disconnectType: obs.status === "connected" ? null : (obs.disconnectType ?? null),
    lastDisconnectReason: obs.status === "connected" ? null : (obs.lastDisconnectReason ?? null),
    updatedAt: Date.now(),
  };
  await db.insert(schema.connectionState).values(row).onConflictDoUpdate({ target: schema.connectionState.id, set: row });
  const after = await loadConnection(db);
  if (before.status !== after.status || before.temporaryBan !== after.temporaryBan) {
    await publish(env, { type: "connection.changed", connection: after });
  }
  return after;
}

/**
 * Pergunta o status a Uazapi e grava. Serve ao cron e a tela do admin (nem toda queda gera aviso).
 * Se a Uazapi nao responder, o estado anterior fica como esta: sem resposta nao e prova de queda.
 */
export async function refreshConnection(env: Cloudflare.Env, db: Db): Promise<{ state: ConnectionState; qrcode?: string } | null> {
  let remote;
  try {
    remote = await (await getUazapiClient(env)).getInstanceStatus();
  } catch (err) {
    console.error("conexao: falha ao consultar a Uazapi", { erro: errorName(err) });
    return null;
  }
  const status = normalizeStatus(remote.status);
  const before = await loadConnection(db);
  const state = await recordConnection(env, db, {
    status,
    // O ban continua valendo enquanto o numero seguir desconectado; so o evento `connection` o declara.
    disconnectType: before.temporaryBan ? "TemporaryBan" : null,
    lastDisconnectReason: remote.lastDisconnectReason ?? before.lastDisconnectReason,
  });
  return { state, qrcode: status === "connecting" ? remote.qrcode : undefined };
}

export const connection = new Hono<AppEnv>();
connection.use("*", requireAuth);

connection.get("/", async (c) => c.json({ connection: await loadConnection(createDb(c.env.DB)) }));

// Tela do admin: consulta a Uazapi (status + QR atual). Chamada de tempos em tempos enquanto `connecting`.
connection.get("/status", requireRole("admin"), async (c) => {
  const refreshed = await refreshConnection(c.env, createDb(c.env.DB));
  if (!refreshed) return c.json({ error: "uazapi_indisponivel" }, 502);
  return c.json({ connection: refreshed.state, qrcode: refreshed.qrcode });
});

// Inicia o pareamento: garante o webhook certo e pede o QR code.
connection.post("/connect", requireRole("admin"), async (c) => {
  const db = createDb(c.env.DB);
  try {
    const uazapi = await getUazapiClient(c.env);
    await uazapi.configureWebhook(`${new URL(c.req.url).origin}/api/webhook/${c.env.WEBHOOK_URL_SECRET}`);
    const remote = await uazapi.connect();
    const state = await recordConnection(c.env, db, { status: normalizeStatus(remote.status) });
    return c.json({ connection: state, qrcode: remote.qrcode });
  } catch (err) {
    console.error("conexao: falha ao parear", { erro: errorName(err) });
    return c.json({ error: "uazapi_indisponivel" }, 502);
  }
});
