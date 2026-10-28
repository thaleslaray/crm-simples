import { Hono } from "hono";
import { createAuth } from "./auth";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { handleQueue } from "./queue";
import { handleScheduled } from "./scheduled";

export { InboxHub } from "./durable/inbox-hub";

const app = new Hono<AppEnv>();

// Todas as rotas do Better Auth (login, logout, sessao...). Cadastro publico esta desligado na config.
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env, c.req.url).handler(c.req.raw));

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/me", requireAuth, (c) => c.json({ user: c.get("user") }));

// Rota de exemplo so-admin (padrao para as proximas rotas de admin).
app.get("/api/admin/ping", requireAuth, requireRole("admin"), (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "nao_encontrado" }, 404));

export default {
  fetch: app.fetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Cloudflare.Env, MediaJob>;
