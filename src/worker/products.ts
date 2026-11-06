import { asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { publish } from "./realtime";

/** Produto no formato da API. */
export type ProductView = { id: string; name: string; priceCents: number; archivedAt: number | null };

const MAX_NAME = 80;

type Fields = { name?: string; priceCents?: number; archivedAt?: number | null };

function parse(body: unknown, requireAll: boolean): Fields | null {
  if (!body || typeof body !== "object") return null;
  const { name, priceCents, archived } = body as Record<string, unknown>;
  const out: Fields = {};
  if (name !== undefined || requireAll) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME) return null;
    out.name = name.trim();
  }
  if (priceCents !== undefined || requireAll) {
    if (typeof priceCents !== "number" || !Number.isSafeInteger(priceCents) || priceCents < 0) return null;
    out.priceCents = priceCents;
  }
  if (archived !== undefined) {
    if (typeof archived !== "boolean") return null;
    out.archivedAt = archived ? Date.now() : null;
  }
  return out;
}

const isUnique = (e: unknown) => String((e as Error)?.cause ?? e).includes("UNIQUE");
const view = ({ id, name, priceCents, archivedAt }: ProductView): ProductView => ({ id, name, priceCents, archivedAt });

/** Produtos: todo membro lê; só admin cria, edita e arquiva. */
export const products = new Hono<AppEnv>();

// Por padrao so os ativos (lista de escolha); `?todos=1` inclui os arquivados (tela de admin, negocios antigos).
products.get("/", requireAuth, async (c) => {
  const q = createDb(c.env.DB).select().from(schema.product);
  const rows = await (c.req.query("todos") === "1" ? q : q.where(isNull(schema.product.archivedAt))).orderBy(asc(schema.product.name));
  return c.json({ products: rows.map(view) });
});

products.post("/", requireAuth, requireRole("admin"), async (c) => {
  const fields = parse(await c.req.json().catch(() => null), true);
  if (!fields) return c.json({ error: "produto_invalido" }, 400);
  const row = { id: crypto.randomUUID(), name: fields.name!, priceCents: fields.priceCents!, archivedAt: null, createdAt: Date.now() };
  try {
    await createDb(c.env.DB).insert(schema.product).values(row);
  } catch (e) {
    if (isUnique(e)) return c.json({ error: "nome_repetido" }, 409);
    throw e;
  }
  await publish(c.env, { type: "products.changed" });
  return c.json({ product: view(row) }, 201);
});

products.patch("/:id", requireAuth, requireRole("admin"), async (c) => {
  const fields = parse(await c.req.json().catch(() => null), false);
  if (!fields || Object.keys(fields).length === 0) return c.json({ error: "produto_invalido" }, 400);
  try {
    const [row] = await createDb(c.env.DB).update(schema.product).set(fields).where(eq(schema.product.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "nao_encontrado" }, 404);
    await publish(c.env, { type: "products.changed" });
    return c.json({ product: view(row) });
  } catch (e) {
    if (isUnique(e)) return c.json({ error: "nome_repetido" }, 409);
    throw e;
  }
});
