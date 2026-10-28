import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { publish } from "./realtime";

export const DEFAULT_COMPANY_NAME = "Atendimento";
const MAX_NAME = 60;
const ROW_ID = "workspace";

/** Nome da empresa: leitura publica (a tela de login precisa dele); so o admin troca. */
export const workspace = new Hono<AppEnv>();

workspace.get("/", async (c) => {
  const [row] = await createDb(c.env.DB).select().from(schema.workspaceSetting).where(eq(schema.workspaceSetting.id, ROW_ID));
  return c.json({ companyName: row?.companyName ?? DEFAULT_COMPANY_NAME });
});

workspace.patch("/", requireAuth, requireRole("admin"), async (c) => {
  const body = (await c.req.json().catch(() => null)) as { companyName?: unknown } | null;
  const name = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  if (!name || name.length > MAX_NAME) return c.json({ error: "nome_invalido" }, 400);
  const row = { id: ROW_ID, companyName: name, updatedAt: Date.now() };
  await createDb(c.env.DB).insert(schema.workspaceSetting).values(row).onConflictDoUpdate({ target: schema.workspaceSetting.id, set: row });
  await publish(c.env, { type: "workspace.changed", companyName: name });
  return c.json({ companyName: name });
});
