import { asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { CAMPAIGN_CHANNELS, type CampaignChannel, codePrefix, nextCode } from "./campaign-code";
import { loadConnectedPhone, refreshConnection } from "./connection";
import { createDb, type Db, schema } from "./db";
import { mainFunnelEntry } from "./funnels";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { publish } from "./realtime";

/** Campanha no formato da API. `link` e null enquanto nao ha numero conectado. */
export type CampaignView = {
  id: string;
  name: string;
  productId: string;
  productName: string;
  channel: CampaignChannel;
  code: string;
  message: string;
  archivedAt: number | null;
  link: string | null;
};

const MAX_NAME = 80;
const MAX_MESSAGE = 300;

export const defaultMessage = (productName: string, code: string) => `Oi! Quero saber do ${productName} #${code}`;

/** A mensagem precisa carregar `#<codigo>` (sem diferenciar maiusculas): e ele que o ingest procura. */
const hasCode = (message: string, code: string) => message.toUpperCase().includes(`#${code.toUpperCase()}`);

export const whatsappLink = (phone: string | null, message: string) => (phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null);

type Row = typeof schema.campaign.$inferSelect;
const view = (row: Row, productName: string, phone: string | null): CampaignView => ({
  id: row.id,
  name: row.name,
  productId: row.productId,
  productName,
  channel: row.channel,
  code: row.code,
  message: row.message,
  archivedAt: row.archivedAt,
  link: whatsappLink(phone, row.message),
});

const isUnique = (e: unknown) => String((e as Error)?.cause ?? e).includes("UNIQUE");
const validName = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= MAX_NAME;
const validMessage = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_MESSAGE;

/** Numero do WhatsApp conectado (so digitos) ou null. Sem numero guardado, so o admin (`askInstance`) faz a instancia ser consultada. */
async function connectedPhone(env: Cloudflare.Env, db: Db, askInstance = true): Promise<string | null> {
  return (await loadConnectedPhone(db)) ?? (askInstance && (await refreshConnection(env, db)) ? await loadConnectedPhone(db) : null);
}

/** Campanhas: todo membro le (o seletor de origem precisa); so admin cria, edita e arquiva. */
export const campaigns = new Hono<AppEnv>();

// Por padrao so as ativas; `?todos=1` inclui as arquivadas (tela de admin).
campaigns.get("/", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const phone = await connectedPhone(c.env, db, c.get("user").role === "admin");
  const q = db
    .select({ campaign: schema.campaign, productName: schema.product.name })
    .from(schema.campaign)
    .innerJoin(schema.product, eq(schema.product.id, schema.campaign.productId));
  const rows = await (c.req.query("todos") === "1" ? q : q.where(isNull(schema.campaign.archivedAt))).orderBy(asc(schema.campaign.createdAt), asc(schema.campaign.code));
  return c.json({
    campaigns: rows.map((r) => view(r.campaign, r.productName, phone)),
    whatsappNumber: phone,
    hasFunnel: (await mainFunnelEntry(db)) !== null,
  });
});

campaigns.post("/", requireAuth, requireRole("admin"), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !validName(body.name) || typeof body.productId !== "string" || !(CAMPAIGN_CHANNELS as readonly unknown[]).includes(body.channel)) {
    return c.json({ error: "campanha_invalida" }, 400);
  }
  if (body.message !== undefined && !validMessage(body.message)) return c.json({ error: "campanha_invalida" }, 400);
  const db = createDb(c.env.DB);
  const product = await db.query.product.findFirst({ where: eq(schema.product.id, body.productId) });
  if (!product || product.archivedAt !== null) return c.json({ error: "nao_encontrado" }, 404);
  const channel = body.channel as CampaignChannel;
  const prefix = codePrefix(product.name, channel);

  // Dois admins criando ao mesmo tempo podem escolher o mesmo numero: o indice unico recusa um e ele tenta o proximo.
  for (let attempt = 0; attempt < 5; attempt++) {
    const used = await db.select({ code: schema.campaign.code }).from(schema.campaign);
    const code = nextCode(prefix, used.map((u) => u.code));
    if (!code) return c.json({ error: "codigos_esgotados" }, 409);
    const message = body.message === undefined ? defaultMessage(product.name, code) : (body.message as string);
    if (!hasCode(message, code)) return c.json({ error: "mensagem_sem_codigo", code }, 400);
    const row = { id: crypto.randomUUID(), name: (body.name as string).trim(), productId: product.id, channel, code, message, archivedAt: null, createdAt: Date.now() };
    try {
      await db.insert(schema.campaign).values(row);
    } catch (e) {
      if (isUnique(e)) continue;
      throw e;
    }
    await publish(c.env, { type: "campaigns.changed" });
    return c.json({ campaign: view(row, product.name, await connectedPhone(c.env, db)) }, 201);
  }
  return c.json({ error: "tente_de_novo" }, 409);
});

campaigns.patch("/:id", requireAuth, requireRole("admin"), async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return c.json({ error: "campanha_invalida" }, 400);
  const fields: { name?: string; message?: string; archivedAt?: number | null } = {};
  if (body.name !== undefined) {
    if (!validName(body.name)) return c.json({ error: "campanha_invalida" }, 400);
    fields.name = body.name.trim();
  }
  if (body.message !== undefined) {
    if (!validMessage(body.message)) return c.json({ error: "campanha_invalida" }, 400);
    fields.message = body.message;
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") return c.json({ error: "campanha_invalida" }, 400);
    fields.archivedAt = body.archived ? Date.now() : null;
  }
  if (Object.keys(fields).length === 0) return c.json({ error: "campanha_invalida" }, 400);
  const db = createDb(c.env.DB);
  const current = await db.query.campaign.findFirst({ where: eq(schema.campaign.id, c.req.param("id")) });
  if (!current) return c.json({ error: "nao_encontrado" }, 404);
  if (fields.message !== undefined && !hasCode(fields.message, current.code)) return c.json({ error: "mensagem_sem_codigo", code: current.code }, 400);
  const [row] = await db.update(schema.campaign).set(fields).where(eq(schema.campaign.id, current.id)).returning();
  const product = await db.query.product.findFirst({ where: eq(schema.product.id, current.productId), columns: { name: true } });
  await publish(c.env, { type: "campaigns.changed" });
  return c.json({ campaign: view(row!, product?.name ?? "", await connectedPhone(c.env, db)) });
});
