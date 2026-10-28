import { asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "./db";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { publish } from "./realtime";

/** Etiqueta no formato da API. */
export type LabelView = { id: string; name: string; color: string };

const MAX_NAME = 40;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Etiquetas de cada contato dado (ordem alfabetica); contato sem etiqueta fica com lista vazia. */
export async function labelsByContact(db: Db, contactIds: string[]): Promise<Map<string, LabelView[]>> {
  const out = new Map<string, LabelView[]>(contactIds.map((id) => [id, []]));
  if (contactIds.length === 0) return out;
  // Lotes: o D1 limita os parametros de uma consulta.
  for (let i = 0; i < contactIds.length; i += 50) {
    const rows = await db
      .select({ contactId: schema.contactLabel.contactId, id: schema.label.id, name: schema.label.name, color: schema.label.color })
      .from(schema.contactLabel)
      .innerJoin(schema.label, eq(schema.label.id, schema.contactLabel.labelId))
      .where(inArray(schema.contactLabel.contactId, contactIds.slice(i, i + 50)))
      .orderBy(asc(schema.label.name));
    for (const { contactId, ...label } of rows) out.get(contactId)?.push(label);
  }
  return out;
}

type Fields = { name?: string; color?: string };

function parse(body: unknown, requireAll: boolean): Fields | null {
  if (!body || typeof body !== "object") return null;
  const { name, color } = body as Record<string, unknown>;
  const out: Fields = {};
  if (name !== undefined || requireAll) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME) return null;
    out.name = name.trim();
  }
  if (color !== undefined || requireAll) {
    if (typeof color !== "string" || !COLOR.test(color)) return null;
    out.color = color.toLowerCase();
  }
  return out;
}

const isUnique = (e: unknown) => String((e as Error)?.cause ?? e).includes("UNIQUE");
const view = ({ id, name, color }: LabelView): LabelView => ({ id, name, color });

/** Etiquetas da equipe: todo membro lê; só admin cria, edita e apaga. */
export const labels = new Hono<AppEnv>();

labels.get("/", requireAuth, async (c) => {
  const rows = await createDb(c.env.DB).select().from(schema.label).orderBy(asc(schema.label.name));
  return c.json({ labels: rows.map(view) });
});

labels.post("/", requireAuth, requireRole("admin"), async (c) => {
  const fields = parse(await c.req.json().catch(() => null), true);
  if (!fields) return c.json({ error: "etiqueta_invalida" }, 400);
  const row = { id: crypto.randomUUID(), name: fields.name!, color: fields.color!, createdAt: Date.now() };
  try {
    await createDb(c.env.DB).insert(schema.label).values(row);
  } catch (e) {
    if (isUnique(e)) return c.json({ error: "nome_repetido" }, 409);
    throw e;
  }
  await publish(c.env, { type: "labels.changed" });
  return c.json({ label: view(row) }, 201);
});

labels.patch("/:id", requireAuth, requireRole("admin"), async (c) => {
  const fields = parse(await c.req.json().catch(() => null), false);
  if (!fields || Object.keys(fields).length === 0) return c.json({ error: "etiqueta_invalida" }, 400);
  try {
    const [row] = await createDb(c.env.DB).update(schema.label).set(fields).where(eq(schema.label.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "nao_encontrado" }, 404);
    await publish(c.env, { type: "labels.changed" });
    return c.json({ label: view(row) });
  } catch (e) {
    if (isUnique(e)) return c.json({ error: "nome_repetido" }, 409);
    throw e;
  }
});

// As ligacoes com os contatos saem pela FK em cascata.
labels.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  const gone = await createDb(c.env.DB).delete(schema.label).where(eq(schema.label.id, c.req.param("id"))).returning();
  if (gone.length === 0) return c.json({ error: "nao_encontrado" }, 404);
  await publish(c.env, { type: "labels.changed" });
  return c.json({ ok: true });
});
