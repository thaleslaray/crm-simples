import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";

/** Preferências do próprio atendente. Lê do D1 (o cookie de sessão pode estar até 60 s defasado). */
export const preferences = new Hono<AppEnv>();
preferences.use("*", requireAuth);

async function read(db: ReturnType<typeof createDb>, userId: string) {
  const row = await db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { signatureEnabled: true } });
  return { signatureEnabled: row?.signatureEnabled ?? true };
}

preferences.get("/", async (c) => c.json(await read(createDb(c.env.DB), c.get("user").id)));

preferences.patch("/", async (c) => {
  const body = await c.req.json<{ signatureEnabled?: unknown }>().catch(() => null);
  if (typeof body?.signatureEnabled !== "boolean") return c.json({ error: "preferencia_invalida" }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.user)
    .set({ signatureEnabled: body.signatureEnabled, updatedAt: new Date() })
    .where(eq(schema.user.id, c.get("user").id));
  return c.json(await read(db, c.get("user").id));
});
