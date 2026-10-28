import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth, requireRole } from "./middleware";

/** Respostas rápidas da equipe: todo atendente lê; só admin cria, edita e apaga. */
export const quickReplies = new Hono<AppEnv>();

const MAX_SHORTCUT = 40;
const MAX_TEXT = 4000;

type Fields = { shortcut?: string; text?: string };

/** Valida o corpo; atalho vira minúsculo e sem a `/` inicial (o atendente digita `/atalho`). */
function parse(body: unknown, requireAll: boolean): Fields | null {
  if (!body || typeof body !== "object") return null;
  const { shortcut, text } = body as Record<string, unknown>;
  const out: Fields = {};
  if (shortcut !== undefined || requireAll) {
    if (typeof shortcut !== "string") return null;
    const s = shortcut.trim().replace(/^\/+/, "").toLowerCase();
    if (!s || s.length > MAX_SHORTCUT || /\s/.test(s)) return null;
    out.shortcut = s;
  }
  if (text !== undefined || requireAll) {
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT) return null;
    out.text = text;
  }
  return out;
}

const isUnique = (e: unknown) => String((e as Error)?.cause ?? e).includes("UNIQUE");

quickReplies.get("/", requireAuth, async (c) => {
  const rows = await createDb(c.env.DB).select().from(schema.quickReply).orderBy(asc(schema.quickReply.shortcut));
  return c.json({ quickReplies: rows.map(({ id, shortcut, text }) => ({ id, shortcut, text })) });
});

quickReplies.post("/", requireAuth, requireRole("admin"), async (c) => {
  const fields = parse(await c.req.json().catch(() => null), true);
  if (!fields) return c.json({ error: "resposta_rapida_invalida" }, 400);
  const row = { id: crypto.randomUUID(), shortcut: fields.shortcut!, text: fields.text!, createdAt: Date.now() };
  try {
    await createDb(c.env.DB).insert(schema.quickReply).values(row);
  } catch (e) {
    if (isUnique(e)) return c.json({ error: "atalho_repetido" }, 409);
    throw e;
  }
  return c.json({ quickReply: { id: row.id, shortcut: row.shortcut, text: row.text } }, 201);
});

quickReplies.patch("/:id", requireAuth, requireRole("admin"), async (c) => {
  const fields = parse(await c.req.json().catch(() => null), false);
  if (!fields || Object.keys(fields).length === 0) return c.json({ error: "resposta_rapida_invalida" }, 400);
  const db = createDb(c.env.DB);
  try {
    const [row] = await db.update(schema.quickReply).set(fields).where(eq(schema.quickReply.id, c.req.param("id"))).returning();
    if (!row) return c.json({ error: "nao_encontrado" }, 404);
    return c.json({ quickReply: { id: row.id, shortcut: row.shortcut, text: row.text } });
  } catch (e) {
    if (isUnique(e)) return c.json({ error: "atalho_repetido" }, 409);
    throw e;
  }
});

quickReplies.delete("/:id", requireAuth, requireRole("admin"), async (c) => {
  const gone = await createDb(c.env.DB).delete(schema.quickReply).where(eq(schema.quickReply.id, c.req.param("id"))).returning();
  if (gone.length === 0) return c.json({ error: "nao_encontrado" }, 404);
  return c.json({ ok: true });
});
