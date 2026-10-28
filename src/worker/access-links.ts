import { and, eq, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { Hono } from "hono";
import { createAuth, MIN_PASSWORD } from "./auth";
import { createDb, type Db, schema } from "./db";
import { buildUserStatements } from "./db/seed-user";
import { ROLES, type AccessLinkKind, type Role } from "./db/schema";
import type { AppEnv } from "./middleware";

/** Validade dos links de convite e de redefinicao. */
export const LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cria o link e devolve o token em claro (so existe aqui e na resposta ao admin; no banco fica o hash). */
export async function issueLink(
  db: Db,
  input: { kind: AccessLinkKind; createdById: string; role?: Role; userId?: string },
) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const now = Date.now();
  const expiresAt = now + LINK_TTL_MS;
  await db.insert(schema.accessLink).values({
    id: crypto.randomUUID(),
    kind: input.kind,
    tokenHash: await sha256(token),
    role: input.role ?? null,
    userId: input.userId ?? null,
    createdById: input.createdById,
    createdAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

export type LinkState =
  | { state: "ok"; link: typeof schema.accessLink.$inferSelect }
  | { state: "expirado" | "usado" | "invalido" };

export async function readLink(db: Db, kind: AccessLinkKind, token: string): Promise<LinkState> {
  const link = await db.query.accessLink.findFirst({
    where: and(eq(schema.accessLink.tokenHash, await sha256(token)), eq(schema.accessLink.kind, kind)),
  });
  if (!link) return { state: "invalido" };
  if (link.usedAt !== null) return { state: "usado" };
  if (link.expiresAt <= Date.now()) return { state: "expirado" };
  return { state: "ok", link };
}

/** Marca como usado de forma atomica: com dois usos ao mesmo tempo, so um vence. */
export async function consumeLink(db: Db, id: string): Promise<boolean> {
  const done = await db
    .update(schema.accessLink)
    .set({ usedAt: Date.now() })
    .where(and(eq(schema.accessLink.id, id), isNull(schema.accessLink.usedAt)))
    .returning({ id: schema.accessLink.id });
  return done.length > 0;
}

const GONE_MESSAGE = {
  expirado: "Este link venceu. Peça um novo ao administrador.",
  usado: "Este link já foi usado. Peça um novo ao administrador.",
  invalido: "Link inválido. Peça um novo ao administrador.",
} as const;

const goneBody = (state: "expirado" | "usado" | "invalido") => ({ error: state, message: GONE_MESSAGE[state] });

/** Rotas publicas: o proprio token e a credencial. */
export const accessLinks = new Hono<AppEnv>();

accessLinks.get("/invites/:token", async (c) => {
  const found = await readLink(createDb(c.env.DB), "convite", c.req.param("token"));
  if (found.state !== "ok") return c.json(goneBody(found.state), 410);
  return c.json({ role: found.link.role });
});

accessLinks.post("/invites/:token", async (c) => {
  const db = createDb(c.env.DB);
  const found = await readLink(db, "convite", c.req.param("token"));
  if (found.state !== "ok") return c.json(goneBody(found.state), 410);

  const body = await c.req.json<{ name?: unknown; email?: unknown; password?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || !email.includes("@") || password.length < MIN_PASSWORD) return c.json({ error: "dados_invalidos" }, 400);
  const role = ROLES.find((r) => r === found.link.role);
  if (!role) return c.json(goneBody("invalido"), 410);

  if (await db.query.user.findFirst({ where: eq(schema.user.email, email), columns: { id: true } })) {
    return c.json({ error: "email_em_uso" }, 409);
  }
  if (!(await consumeLink(db, found.link.id))) return c.json(goneBody("usado"), 410);

  const { statements } = await buildUserStatements({ name, email, password, role });
  await c.env.DB.batch(statements.map((s) => c.env.DB.prepare(s.sql).bind(...s.params)));

  // Entra na hora: reaproveita o login do Better Auth e repassa o cookie de sessao.
  const signedIn = await (await createAuth(c.env, c.req.url)).api.signInEmail({ body: { email, password }, asResponse: true });
  const res = c.json({ ok: true });
  for (const cookie of signedIn.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
  return res;
});

accessLinks.get("/password-resets/:token", async (c) => {
  const db = createDb(c.env.DB);
  const found = await readLink(db, "redefinicao", c.req.param("token"));
  if (found.state !== "ok" || !found.link.userId) return c.json(goneBody(found.state === "ok" ? "invalido" : found.state), 410);
  const member = await db.query.user.findFirst({ where: eq(schema.user.id, found.link.userId), columns: { name: true } });
  if (!member) return c.json(goneBody("invalido"), 410);
  return c.json({ name: member.name });
});

accessLinks.post("/password-resets/:token", async (c) => {
  const db = createDb(c.env.DB);
  const found = await readLink(db, "redefinicao", c.req.param("token"));
  if (found.state !== "ok" || !found.link.userId) return c.json(goneBody(found.state === "ok" ? "invalido" : found.state), 410);

  const body = await c.req.json<{ password?: unknown }>().catch(() => ({}) as { password?: unknown });
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) return c.json({ error: "dados_invalidos" }, 400);
  if (!(await consumeLink(db, found.link.id))) return c.json(goneBody("usado"), 410);

  const userId = found.link.userId;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'").bind(
      await hashPassword(password),
      Date.now(),
      userId,
    ),
    // Quem tinha a senha antiga (ou um acesso roubado) perde a sessao.
    c.env.DB.prepare("DELETE FROM session WHERE user_id = ?").bind(userId),
  ]);
  return c.json({ ok: true });
});
