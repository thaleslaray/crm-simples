import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { loadConversation } from "./conversations";
import { createDb, type Db, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";
import { listNotes } from "./notes";
import { publish } from "./realtime";
import { createUazapiClient } from "./uazapi/client";

export const contacts = new Hono<AppEnv>();
contacts.use("*", requireAuth);

/** A URL de avatar da Uazapi e temporaria: depois disso a ficha busca outra ao abrir. */
const AVATAR_TTL_MS = 12 * 60 * 60 * 1000;

const FIELD_LIMITS = { name: 200, email: 200, company: 200, notes: 5000 } as const;
type Field = keyof typeof FIELD_LIMITS;

/** Contato no formato da API (telefone so leitura). */
export type ContactView = Awaited<ReturnType<typeof loadContact>> & {};

async function loadContact(db: Db, id: string) {
  const row = await db.query.contact.findFirst({ where: eq(schema.contact.id, id) });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    notes: row.notes,
    avatarUrl: row.avatarUrl,
  };
}

/** Busca a foto na Uazapi e grava; falha (ou sem foto) mantem a que ja existia. */
async function refreshAvatar(env: Cloudflare.Env, db: Db, contactId: string): Promise<void> {
  const row = await db.query.contact.findFirst({ where: eq(schema.contact.id, contactId), columns: { phone: true } });
  if (!row?.phone) return;
  try {
    const url = await createUazapiClient(env).getAvatar(row.phone);
    await db
      .update(schema.contact)
      .set({ ...(url ? { avatarUrl: url } : {}), avatarFetchedAt: Date.now() })
      .where(eq(schema.contact.id, contactId));
  } catch (err) {
    console.error("ficha: falha ao buscar avatar na Uazapi", { erro: err instanceof Error ? err.name : "desconhecido" });
  }
}

contacts.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const found = await db.query.contact.findFirst({ where: eq(schema.contact.id, id), columns: { avatarFetchedAt: true } });
  if (!found) return c.json({ error: "nao_encontrado" }, 404);
  if (found.avatarFetchedAt === null || Date.now() - found.avatarFetchedAt > AVATAR_TTL_MS) await refreshAvatar(c.env, db, id);

  const convs = await db.query.conversation.findMany({ where: eq(schema.conversation.contactId, id) });
  const history = await Promise.all(
    convs.map(async (conv) => {
      const full = await loadConversation(db, conv.id);
      // Quem ja foi responsavel: os destinos dos eventos de atribuicao, mais o atual.
      const events = await db
        .select({ name: schema.user.name })
        .from(schema.conversationEvent)
        .innerJoin(schema.user, eq(schema.user.id, schema.conversationEvent.toUserId))
        .where(eq(schema.conversationEvent.conversationId, conv.id))
        .orderBy(asc(schema.conversationEvent.timestamp));
      const assignees = [...new Set([...events.map((e) => e.name), ...(full?.assigneeName ? [full.assigneeName] : [])])];
      return {
        id: conv.id,
        status: conv.status,
        assigneeName: full?.assigneeName ?? null,
        assignees,
        createdAt: conv.createdAt,
      };
    }),
  );
  return c.json({
    contact: await loadContact(db, id),
    conversations: history,
    notes: await listNotes(db, convs.map((conv) => conv.id)),
  });
});

contacts.patch("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "dados_invalidos" }, 400);
  if ("phone" in body) return c.json({ error: "telefone_nao_editavel" }, 400);
  const patch: Partial<Record<Field, string | null>> = {};
  for (const field of Object.keys(FIELD_LIMITS) as Field[]) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value !== null && typeof value !== "string") return c.json({ error: "dados_invalidos" }, 400);
    const trimmed = value?.trim() || null;
    if (trimmed && trimmed.length > FIELD_LIMITS[field]) return c.json({ error: "dados_invalidos" }, 400);
    if (field === "email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return c.json({ error: "email_invalido" }, 400);
    patch[field] = trimmed;
  }
  const exists = await db.query.contact.findFirst({ where: eq(schema.contact.id, id), columns: { id: true } });
  if (!exists) return c.json({ error: "nao_encontrado" }, 404);
  if (Object.keys(patch).length > 0) await db.update(schema.contact).set(patch).where(eq(schema.contact.id, id));

  const contact = await loadContact(db, id);
  await publish(c.env, { type: "contact.updated", contact: contact! });
  // O nome aparece na lista de conversas: o hub tambem manda a conversa atualizada.
  const conv = await db.query.conversation.findFirst({ where: eq(schema.conversation.contactId, id), columns: { id: true } });
  const conversation = conv ? await loadConversation(db, conv.id) : null;
  if (conversation) await publish(c.env, { type: "conversation.updated", conversation });
  return c.json({ contact });
});

// A foto quebrou no navegador (URL expirada antes do prazo): busca outra agora.
contacts.post("/:id/avatar/refresh", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  if (!(await db.query.contact.findFirst({ where: eq(schema.contact.id, id), columns: { id: true } }))) {
    return c.json({ error: "nao_encontrado" }, 404);
  }
  await refreshAvatar(c.env, db, id);
  return c.json({ contact: await loadContact(db, id) });
});
