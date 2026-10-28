import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { issueLink } from "./access-links";
import { createDb, schema } from "./db";
import { ROLES } from "./db/schema";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { closeSocketsOf } from "./realtime";
import { releaseConversationsOf } from "./status";

export const members = new Hono<AppEnv>();

/** Equipe para o filtro por responsavel e para escolher a quem transferir (qualquer membro logado). */
members.get("/", requireAuth, async (c) => {
  const list = await createDb(c.env.DB)
    .select({ id: schema.user.id, name: schema.user.name, role: schema.user.role })
    .from(schema.user)
    .orderBy(asc(schema.user.name), asc(schema.user.id));
  return c.json({ members: list });
});

/** Rotas de admin da equipe: convites, lista, papel, remocao e redefinicao de senha. */
export const teamAdmin = new Hono<AppEnv>();
teamAdmin.use("*", requireAuth, requireRole("admin"));

teamAdmin.post("/invites", async (c) => {
  const body = await c.req.json<{ role?: unknown }>().catch(() => ({}) as { role?: unknown });
  const role = ROLES.find((r) => r === body.role);
  if (!role) return c.json({ error: "papel_invalido" }, 400);
  const { token, expiresAt } = await issueLink(createDb(c.env.DB), { kind: "convite", createdById: c.get("user").id, role });
  return c.json({ token, path: `/convite/${token}`, expiresAt });
});

teamAdmin.get("/members", async (c) => {
  const list = await createDb(c.env.DB)
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.user.role })
    .from(schema.user)
    .orderBy(asc(schema.user.name), asc(schema.user.id));
  return c.json({ members: list });
});

teamAdmin.patch("/members/:id", async (c) => {
  const body = await c.req.json<{ role?: unknown }>().catch(() => ({}) as { role?: unknown });
  const role = ROLES.find((r) => r === body.role);
  if (!role) return c.json({ error: "papel_invalido" }, 400);
  const id = c.req.param("id");
  // Sem rebaixar a si mesmo: evita a equipe ficar sem admin.
  if (id === c.get("user").id) return c.json({ error: "proprio_membro" }, 409);
  const done = await createDb(c.env.DB)
    .update(schema.user)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.user.id, id))
    .returning({ id: schema.user.id });
  if (done.length === 0) return c.json({ error: "nao_encontrado" }, 404);
  return c.json({ ok: true });
});

teamAdmin.post("/members/:id/reset-link", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  if (!(await db.query.user.findFirst({ where: eq(schema.user.id, id), columns: { id: true } }))) {
    return c.json({ error: "nao_encontrado" }, 404);
  }
  const { token, expiresAt } = await issueLink(db, { kind: "redefinicao", createdById: c.get("user").id, userId: id });
  return c.json({ token, path: `/redefinir-senha/${token}`, expiresAt });
});

teamAdmin.delete("/members/:id", async (c) => {
  const id = c.req.param("id");
  if (id === c.get("user").id) return c.json({ error: "proprio_membro" }, 409);
  const db = createDb(c.env.DB);
  if (!(await db.query.user.findFirst({ where: eq(schema.user.id, id), columns: { id: true } }))) {
    return c.json({ error: "nao_encontrado" }, 404);
  }
  // Sessoes primeiro: o acesso some mesmo se a devolucao das conversas falhar no meio.
  await db.delete(schema.session).where(eq(schema.session.userId, id));
  await closeSocketsOf(c.env, id);
  await releaseConversationsOf(c.env, id, c.get("user").id);
  // As FKs soltam o resto: conta e links somem, conversas/mensagens/eventos ficam sem autor.
  await db.delete(schema.user).where(eq(schema.user.id, id));
  return c.json({ ok: true });
});
