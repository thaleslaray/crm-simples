import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import type { ConversationStatus, DealStatus, MessageType, OriginKind } from "./db/schema";
import { type LabelView, labelsByContact } from "./labels";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { publish } from "./realtime";

export type StageView = { id: string; name: string };
export type FunnelView = { id: string; name: string; stages: StageView[] };

const MAX_NAME = 80;

function parseName(body: unknown): string | null {
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME) return null;
  return name.trim();
}

/** Funis com as etapas em ordem; `only` limita a um funil. */
export async function loadFunnels(db: Db, only?: string): Promise<FunnelView[]> {
  const funnels = await db.select().from(schema.funnel).where(only ? eq(schema.funnel.id, only) : undefined).orderBy(asc(schema.funnel.createdAt), asc(schema.funnel.id));
  const stages = await db.select().from(schema.funnelStage).orderBy(asc(schema.funnelStage.position));
  return funnels.map((f) => ({
    id: f.id,
    name: f.name,
    stages: stages.filter((s) => s.funnelId === f.id).map(({ id, name }) => ({ id, name })),
  }));
}

/** Origens que o atendente escolhe na mao (a campanha vem da criacao automatica). */
export const MANUAL_ORIGINS = ["indicacao", "organico", "cliente_antigo", "outro"] as const satisfies readonly OriginKind[];

export type ContactDealView = {
  id: string;
  funnelId: string;
  funnelName: string;
  stageId: string;
  stageName: string;
  productId: string | null;
  productName: string | null;
  valueCents: number | null;
  status: DealStatus;
  originKind: OriginKind | null;
};

/** Todos os negocios do contato (abertos e fechados), do mais antigo ao mais novo. */
export async function dealsOfContact(db: Db, contactId: string): Promise<ContactDealView[]> {
  return db
    .select({
      id: schema.deal.id,
      funnelId: schema.funnel.id,
      funnelName: schema.funnel.name,
      stageId: schema.funnelStage.id,
      stageName: schema.funnelStage.name,
      productId: schema.deal.productId,
      productName: schema.product.name,
      valueCents: schema.deal.valueCents,
      status: schema.deal.status,
      originKind: schema.deal.originKind,
    })
    .from(schema.deal)
    .innerJoin(schema.funnel, eq(schema.funnel.id, schema.deal.funnelId))
    .innerJoin(schema.funnelStage, eq(schema.funnelStage.id, schema.deal.stageId))
    .leftJoin(schema.product, eq(schema.product.id, schema.deal.productId))
    .where(eq(schema.deal.contactId, contactId))
    .orderBy(asc(schema.deal.createdAt), sql`"deal"."rowid"`);
}

const changed =(env: Cloudflare.Env, funnelId: string) => publish(env, { type: "funnel.changed", funnelId });

/** Funis: todo membro le; so admin cria, renomeia, apaga funis e mexe nas etapas. */
export const funnels = new Hono<AppEnv>();

funnels.get("/", requireAuth, async (c) => c.json({ funnels: await loadFunnels(createDb(c.env.DB)) }));

funnels.post("/", requireAuth, requireRole("admin"), async (c) => {
  const name = parseName(await c.req.json().catch(() => null));
  if (!name) return c.json({ error: "funil_invalido" }, 400);
  const row = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  await createDb(c.env.DB).insert(schema.funnel).values(row);
  await changed(c.env, row.id);
  return c.json({ funnel: { id: row.id, name, stages: [] } }, 201);
});

funnels.patch("/:id", requireAuth, requireRole("admin"), async (c) => {
  const name = parseName(await c.req.json().catch(() => null));
  if (!name) return c.json({ error: "funil_invalido" }, 400);
  const [row] = await createDb(c.env.DB).update(schema.funnel).set({ name }).where(eq(schema.funnel.id, c.req.param("id"))).returning();
  if (!row) return c.json({ error: "nao_encontrado" }, 404);
  await changed(c.env, row.id);
  return c.json({ ok: true });
});

// Etapas e negocios saem pela FK em cascata.
funnels.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  const gone = await createDb(c.env.DB).delete(schema.funnel).where(eq(schema.funnel.id, c.req.param("id"))).returning();
  if (gone.length === 0) return c.json({ error: "nao_encontrado" }, 404);
  await changed(c.env, gone[0]!.id);
  return c.json({ ok: true });
});

funnels.post("/:id/stages", requireAuth, requireRole("admin"), async (c) => {
  const name = parseName(await c.req.json().catch(() => null));
  if (!name) return c.json({ error: "etapa_invalida" }, 400);
  const db = createDb(c.env.DB);
  const funnelId = c.req.param("id");
  if (!(await db.query.funnel.findFirst({ where: eq(schema.funnel.id, funnelId), columns: { id: true } }))) {
    return c.json({ error: "nao_encontrado" }, 404);
  }
  const existing = await db.select({ id: schema.funnelStage.id }).from(schema.funnelStage).where(eq(schema.funnelStage.funnelId, funnelId));
  const row = { id: crypto.randomUUID(), funnelId, name, position: existing.length };
  await db.insert(schema.funnelStage).values(row);
  await changed(c.env, funnelId);
  return c.json({ stage: { id: row.id, name } }, 201);
});

// Antes de `/:stageId` para nao tratar "order" como id de etapa.
funnels.put("/:id/stages/order", requireAuth, requireRole("admin"), async (c) => {
  const body = (await c.req.json().catch(() => null)) as { stageIds?: unknown } | null;
  const db = createDb(c.env.DB);
  const funnelId = c.req.param("id");
  const [funnel] = await loadFunnels(db, funnelId);
  if (!funnel) return c.json({ error: "nao_encontrado" }, 404);
  const ids = body?.stageIds;
  const known = new Set(funnel.stages.map((s) => s.id));
  if (!Array.isArray(ids) || ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => typeof id === "string" && known.has(id))) {
    return c.json({ error: "ordem_invalida" }, 400);
  }
  for (const [position, id] of (ids as string[]).entries()) {
    await db.update(schema.funnelStage).set({ position }).where(eq(schema.funnelStage.id, id));
  }
  await changed(c.env, funnelId);
  return c.json({ ok: true });
});

funnels.patch("/:id/stages/:stageId", requireAuth, requireRole("admin"), async (c) => {
  const name = parseName(await c.req.json().catch(() => null));
  if (!name) return c.json({ error: "etapa_invalida" }, 400);
  const { id, stageId } = c.req.param();
  const [row] = await createDb(c.env.DB)
    .update(schema.funnelStage)
    .set({ name })
    .where(and(eq(schema.funnelStage.id, stageId), eq(schema.funnelStage.funnelId, id)))
    .returning();
  if (!row) return c.json({ error: "nao_encontrado" }, 404);
  await changed(c.env, id);
  return c.json({ ok: true });
});

/** Ids dos negocios da etapa, na ordem do quadro. */
async function stageDeals(db: Db, stageId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.deal.id })
    .from(schema.deal)
    .where(eq(schema.deal.stageId, stageId))
    .orderBy(asc(schema.deal.position), sql`"deal"."rowid"`);
  return rows.map((r) => r.id);
}

/** Grava a ordem dos negocios da etapa (posicao = indice na lista). */
async function setOrder(db: Db, stageId: string, dealIds: string[]) {
  for (const [position, id] of dealIds.entries()) {
    await db.update(schema.deal).set({ stageId, position }).where(eq(schema.deal.id, id));
  }
}

const stageOf = (db: Db, funnelId: string, stageId: string) =>
  db.query.funnelStage.findFirst({ where: and(eq(schema.funnelStage.id, stageId), eq(schema.funnelStage.funnelId, funnelId)) });

// Apagar etapa com negocios exige `moveTo` (outra etapa do mesmo funil); os negocios vao para o fim dela, na mesma ordem.
funnels.delete("/:id/stages/:stageId", requireAuth, requireRole("admin"), async (c) => {
  const db = createDb(c.env.DB);
  const { id, stageId } = c.req.param();
  if (!(await stageOf(db, id, stageId))) return c.json({ error: "nao_encontrado" }, 404);
  const moving = await stageDeals(db, stageId);
  if (moving.length > 0) {
    const body = (await c.req.json().catch(() => null)) as { moveTo?: unknown } | null;
    if (body?.moveTo === undefined) return c.json({ error: "etapa_com_cards" }, 409);
    if (typeof body.moveTo !== "string" || body.moveTo === stageId || !(await stageOf(db, id, body.moveTo))) {
      return c.json({ error: "destino_invalido" }, 400);
    }
    await setOrder(db, body.moveTo, [...(await stageDeals(db, body.moveTo)), ...moving]);
  }
  await db.delete(schema.funnelStage).where(eq(schema.funnelStage.id, stageId));
  const [funnel] = await loadFunnels(db, id);
  for (const [position, s] of funnel!.stages.entries()) {
    await db.update(schema.funnelStage).set({ position }).where(eq(schema.funnelStage.id, s.id));
  }
  await changed(c.env, id);
  return c.json({ ok: true });
});

export type CardView = {
  dealId: string;
  productId: string | null;
  productName: string | null;
  valueCents: number | null;
  originKind: OriginKind | null;
  contactId: string;
  name: string | null;
  phone: string | null;
  conversationId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: ConversationStatus | null;
  avatarUrl: string | null;
  lastMessage: { type: MessageType; text: string | null; timestamp: number } | null;
  labels: LabelView[];
};

// Quadro (so negocios abertos): ?label=<id> &assignee=me|none|<id> (responsavel da conversa do contato) &product=none|<id>.
funnels.get("/:id/board", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const [funnel] = await loadFunnels(db, id);
  if (!funnel) return c.json({ error: "nao_encontrado" }, 404);
  const label = c.req.query("label");
  const assignee = c.req.query("assignee");
  const product = c.req.query("product");
  const rows = await db
    .select({
      stageId: schema.deal.stageId,
      dealId: schema.deal.id,
      productId: schema.deal.productId,
      productName: schema.product.name,
      valueCents: schema.deal.valueCents,
      originKind: schema.deal.originKind,
      contactId: schema.contact.id,
      name: schema.contact.name,
      phone: schema.contact.phone,
      conversationId: schema.conversation.id,
      assigneeId: schema.conversation.assigneeId,
      assigneeName: schema.user.name,
      status: schema.conversation.status,
      avatarUrl: schema.contact.avatarUrl,
      msgType: schema.message.type,
      msgText: schema.message.text,
      msgTimestamp: schema.message.timestamp,
    })
    .from(schema.deal)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.deal.contactId))
    .leftJoin(schema.product, eq(schema.product.id, schema.deal.productId))
    .leftJoin(schema.conversation, eq(schema.conversation.contactId, schema.contact.id))
    .leftJoin(schema.message, eq(schema.message.id, schema.conversation.lastMessageId))
    .leftJoin(schema.user, eq(schema.user.id, schema.conversation.assigneeId))
    .where(
      and(
        eq(schema.deal.funnelId, id),
        eq(schema.deal.status, "aberto"),
        product === "none" ? isNull(schema.deal.productId) : product ? eq(schema.deal.productId, product) : undefined,
        assignee === "none"
          ? isNull(schema.conversation.assigneeId)
          : assignee
            ? eq(schema.conversation.assigneeId, assignee === "me" ? c.get("user").id : assignee)
            : undefined,
        label
          ? exists(
              db
                .select({ one: sql`1` })
                .from(schema.contactLabel)
                .where(and(eq(schema.contactLabel.contactId, schema.contact.id), eq(schema.contactLabel.labelId, label))),
            )
          : undefined,
      ),
    )
    .orderBy(asc(schema.deal.position), sql`"deal"."rowid"`);
  const labels = await labelsByContact(db, rows.map((r) => r.contactId));
  return c.json({
    funnel,
    stages: funnel.stages.map((s) => ({
      ...s,
      cards: rows
        .filter((r) => r.stageId === s.id)
        .map(
          ({ stageId: _stage, msgType, msgText, msgTimestamp, ...r }): CardView => ({
            ...r,
            lastMessage: msgType && msgTimestamp != null ? { type: msgType, text: msgText, timestamp: msgTimestamp } : null,
            labels: labels.get(r.contactId) ?? [],
          }),
        ),
    })),
  });
});

type DealFields = { productId?: string | null; valueCents?: number | null; originKind?: OriginKind | null };

/** Campos editaveis do negocio; `null` se algum for invalido. So vem o que o corpo trouxe. */
function parseDealFields(body: Record<string, unknown>): DealFields | null {
  const out: DealFields = {};
  if ("productId" in body) {
    if (body.productId !== null && typeof body.productId !== "string") return null;
    out.productId = body.productId;
  }
  if ("valueCents" in body) {
    const v = body.valueCents;
    if (v !== null && (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)) return null;
    out.valueCents = v;
  }
  if ("originKind" in body) {
    const o = body.originKind;
    if (o !== null && !(MANUAL_ORIGINS as readonly unknown[]).includes(o)) return null;
    out.originKind = o as OriginKind | null;
  }
  return out;
}

/** Produto ativo (ou o que o negocio ja tem, mesmo arquivado). */
const findProduct = (db: Db, productId: string) => db.query.product.findFirst({ where: eq(schema.product.id, productId) });

funnels.post("/:id/deals", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.contactId !== "string" || typeof body.stageId !== "string") return c.json({ error: "negocio_invalido" }, 400);
  const fields = parseDealFields(body);
  if (!fields) return c.json({ error: "negocio_invalido" }, 400);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const [stage, contact] = await Promise.all([
    stageOf(db, id, body.stageId),
    db.query.contact.findFirst({ where: eq(schema.contact.id, body.contactId), columns: { id: true } }),
  ]);
  if (!stage || !contact) return c.json({ error: "nao_encontrado" }, 404);
  let valueCents = fields.valueCents;
  if (fields.productId) {
    const product = await findProduct(db, fields.productId);
    if (!product || product.archivedAt !== null) return c.json({ error: "nao_encontrado" }, 404);
    if (valueCents === undefined) valueCents = product.priceCents;
  }
  const row = {
    id: crypto.randomUUID(),
    contactId: contact.id,
    funnelId: id,
    stageId: stage.id,
    position: (await stageDeals(db, stage.id)).length,
    productId: fields.productId ?? null,
    valueCents: valueCents ?? null,
    originKind: fields.originKind ?? null,
    createdAt: Date.now(),
  };
  await db.insert(schema.deal).values(row);
  await changed(c.env, id);
  return c.json({ deal: { id: row.id } }, 201);
});

// Editar produto, valor e origem. Trocar o produto nao mexe no valor (o front sugere o preco, o atendente decide).
funnels.patch("/:id/deals/:dealId", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const fields = body && typeof body === "object" ? parseDealFields(body) : null;
  if (!fields || Object.keys(fields).length === 0) return c.json({ error: "negocio_invalido" }, 400);
  const db = createDb(c.env.DB);
  const { id, dealId } = c.req.param();
  const deal = await db.query.deal.findFirst({ where: and(eq(schema.deal.id, dealId), eq(schema.deal.funnelId, id)) });
  if (!deal) return c.json({ error: "nao_encontrado" }, 404);
  if (fields.productId && fields.productId !== deal.productId) {
    const product = await findProduct(db, fields.productId);
    if (!product || product.archivedAt !== null) return c.json({ error: "nao_encontrado" }, 404);
  }
  await db.update(schema.deal).set(fields).where(eq(schema.deal.id, dealId));
  await changed(c.env, id);
  return c.json({ ok: true });
});

// Arrastar: `stageId` de destino e `index` (posicao dentro da etapa; sem ele, vai para o fim).
funnels.put("/:id/deals/:dealId", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { stageId?: unknown; index?: unknown } | null;
  if (typeof body?.stageId !== "string" || (body.index !== undefined && !Number.isInteger(body.index))) {
    return c.json({ error: "negocio_invalido" }, 400);
  }
  const db = createDb(c.env.DB);
  const { id, dealId } = c.req.param();
  const [stage, deal] = await Promise.all([
    stageOf(db, id, body.stageId),
    db.query.deal.findFirst({ where: and(eq(schema.deal.id, dealId), eq(schema.deal.funnelId, id)), columns: { id: true } }),
  ]);
  if (!stage || !deal) return c.json({ error: "nao_encontrado" }, 404);
  const others = (await stageDeals(db, stage.id)).filter((d) => d !== dealId);
  const at = Math.min(Math.max(typeof body.index === "number" ? body.index : others.length, 0), others.length);
  others.splice(at, 0, dealId);
  await setOrder(db, stage.id, others);
  await changed(c.env, id);
  return c.json({ ok: true });
});

funnels.delete("/:id/deals/:dealId", requireAuth, async (c) => {
  const { id, dealId } = c.req.param();
  const gone = await createDb(c.env.DB)
    .delete(schema.deal)
    .where(and(eq(schema.deal.id, dealId), eq(schema.deal.funnelId, id)))
    .returning();
  if (gone.length === 0) return c.json({ error: "nao_encontrado" }, 404);
  await changed(c.env, id);
  return c.json({ ok: true });
});
