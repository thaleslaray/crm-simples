import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";

export const members = new Hono<AppEnv>();

/** Equipe para o filtro por responsavel e para escolher a quem transferir (qualquer membro logado). */
members.get("/", requireAuth, async (c) => {
  const list = await createDb(c.env.DB)
    .select({ id: schema.user.id, name: schema.user.name, role: schema.user.role })
    .from(schema.user)
    .orderBy(asc(schema.user.name), asc(schema.user.id));
  return c.json({ members: list });
});
