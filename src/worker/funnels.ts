import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import type { ConversationStatus, MessageType } from "./db/schema";
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

/** Funis e etapas em que o contato esta (um card por funil), na ordem de criacao dos funis. */
export async function funnelsOfContact(db: Db, contactId: string) {
  return db
    .select({
      funnelId: schema.funnel.id,
      funnelName: schema.funnel.name,
      stageId: schema.funnelStage.id,
      stageName: schema.funnelStage.name,
    })
    .from(schema.funnelCard)
    .innerJoin(schema.funnel, eq(schema.funnel.id, schema.funnelCard.funnelId))
    .innerJoin(schema.funnelStage, eq(schema.funnelStage.id, schema.funnelCard.stageId))
    .where(eq(schema.funnelCard.contactId, contactId))
    .orderBy(asc(schema.funnel.createdAt), asc(schema.funnel.id));
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

// Etapas e cards saem pela FK em cascata.
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

/** Ids dos contatos da etapa, na ordem dos cards. */
async function stageContacts(db: Db, stageId: string): Promise<string[]> {
  const rows = await db
    .select({ contactId: schema.funnelCard.contactId })
    .from(schema.funnelCard)
    .where(eq(schema.funnelCard.stageId, stageId))
    .orderBy(asc(schema.funnelCard.position), asc(schema.funnelCard.contactId));
  return rows.map((r) => r.contactId);
}

/** Grava a ordem dos cards da etapa (posicao = indice na lista). */
async function setOrder(db: Db, funnelId: string, stageId: string, contactIds: string[]) {
  for (const [position, contactId] of contactIds.entries()) {
    await db
      .update(schema.funnelCard)
      .set({ stageId, position })
      .where(and(eq(schema.funnelCard.funnelId, funnelId), eq(schema.funnelCard.contactId, contactId)));
  }
}

const stageOf = (db: Db, funnelId: string, stageId: string) =>
  db.query.funnelStage.findFirst({ where: and(eq(schema.funnelStage.id, stageId), eq(schema.funnelStage.funnelId, funnelId)) });

// Apagar etapa com cards exige `moveTo` (outra etapa do mesmo funil); os cards vao para o fim dela, na mesma ordem.
funnels.delete("/:id/stages/:stageId", requireAuth, requireRole("admin"), async (c) => {
  const db = createDb(c.env.DB);
  const { id, stageId } = c.req.param();
  if (!(await stageOf(db, id, stageId))) return c.json({ error: "nao_encontrado" }, 404);
  const moving = await stageContacts(db, stageId);
  if (moving.length > 0) {
    const body = (await c.req.json().catch(() => null)) as { moveTo?: unknown } | null;
    if (body?.moveTo === undefined) return c.json({ error: "etapa_com_cards" }, 409);
    if (typeof body.moveTo !== "string" || body.moveTo === stageId || !(await stageOf(db, id, body.moveTo))) {
      return c.json({ error: "destino_invalido" }, 400);
    }
    await setOrder(db, id, body.moveTo, [...(await stageContacts(db, body.moveTo)), ...moving]);
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

// Quadro: ?label=<id da etiqueta>&assignee=me|none|<id> (responsavel da conversa atual do contato).
funnels.get("/:id/board", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const [funnel] = await loadFunnels(db, id);
  if (!funnel) return c.json({ error: "nao_encontrado" }, 404);
  const label = c.req.query("label");
  const assignee = c.req.query("assignee");
  const rows = await db
    .select({
      stageId: schema.funnelCard.stageId,
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
    .from(schema.funnelCard)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.funnelCard.contactId))
    .leftJoin(schema.conversation, eq(schema.conversation.contactId, schema.contact.id))
    .leftJoin(schema.message, eq(schema.message.id, schema.conversation.lastMessageId))
    .leftJoin(schema.user, eq(schema.user.id, schema.conversation.assigneeId))
    .where(
      and(
        eq(schema.funnelCard.funnelId, id),
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
    .orderBy(asc(schema.funnelCard.position), asc(schema.contact.id));
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

funnels.post("/:id/cards", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { contactId?: unknown; stageId?: unknown } | null;
  if (typeof body?.contactId !== "string" || typeof body.stageId !== "string") return c.json({ error: "card_invalido" }, 400);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const [stage, contact] = await Promise.all([
    stageOf(db, id, body.stageId),
    db.query.contact.findFirst({ where: eq(schema.contact.id, body.contactId), columns: { id: true } }),
  ]);
  if (!stage || !contact) return c.json({ error: "nao_encontrado" }, 404);
  const taken = await db.query.funnelCard.findFirst({
    where: and(eq(schema.funnelCard.funnelId, id), eq(schema.funnelCard.contactId, contact.id)),
    columns: { contactId: true },
  });
  if (taken) return c.json({ error: "ja_esta_no_funil" }, 409);
  const position = (await stageContacts(db, stage.id)).length;
  await db.insert(schema.funnelCard).values({ funnelId: id, contactId: contact.id, stageId: stage.id, position }).onConflictDoNothing();
  await changed(c.env, id);
  return c.json({ ok: true }, 201);
});

// Arrastar: `stageId` de destino e `index` (posicao dentro da etapa; sem ele, vai para o fim).
funnels.put("/:id/cards/:contactId", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { stageId?: unknown; index?: unknown } | null;
  if (typeof body?.stageId !== "string" || (body.index !== undefined && !Number.isInteger(body.index))) {
    return c.json({ error: "card_invalido" }, 400);
  }
  const db = createDb(c.env.DB);
  const { id, contactId } = c.req.param();
  const [stage, card] = await Promise.all([
    stageOf(db, id, body.stageId),
    db.query.funnelCard.findFirst({ where: and(eq(schema.funnelCard.funnelId, id), eq(schema.funnelCard.contactId, contactId)) }),
  ]);
  if (!stage || !card) return c.json({ error: "nao_encontrado" }, 404);
  const others = (await stageContacts(db, stage.id)).filter((cid) => cid !== contactId);
  const at = Math.min(Math.max(typeof body.index === "number" ? body.index : others.length, 0), others.length);
  others.splice(at, 0, contactId);
  await setOrder(db, id, stage.id, others);
  await changed(c.env, id);
  return c.json({ ok: true });
});

funnels.delete("/:id/cards/:contactId", requireAuth, async (c) => {
  const { id, contactId } = c.req.param();
  const gone = await createDb(c.env.DB)
    .delete(schema.funnelCard)
    .where(and(eq(schema.funnelCard.funnelId, id), eq(schema.funnelCard.contactId, contactId)))
    .returning();
  if (gone.length === 0) return c.json({ error: "nao_encontrado" }, 404);
  await changed(c.env, id);
  return c.json({ ok: true });
});
