import { Hono } from "hono";
import { connection } from "./connection";
import { contacts } from "./contacts";
import { conversations } from "./conversations";
import { createAuth } from "./auth";
import { type AppEnv, requireAuth, requireRole } from "./middleware";
import { media } from "./media";
import { accessLinks } from "./access-links";
import { members, teamAdmin } from "./members";
import { uazapiAdmin } from "./uazapi/admin";
import { preferences } from "./preferences";
import { funnels } from "./funnels";
import { workspace } from "./workspace";
import { labels } from "./labels";
import { handleQueue } from "./queue";
import { quickReplies } from "./quick-replies";
import { realtime } from "./realtime";
import { handleScheduled } from "./scheduled";
import { search } from "./search";
import { setup } from "./setup";
import { signedFiles } from "./signed-files";
import { webhook } from "./webhook";

export { InboxHub } from "./durable/inbox-hub";

const app = new Hono<AppEnv>();

// Cabecalhos de seguranca em toda resposta do Worker (os assets do SPA recebem os mesmos por public/_headers).
// So os cinco pedidos: CSP aqui e SO frame-ancestors, sem politica completa. A midia ja traz a CSP propria e vence.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Strict-Transport-Security", "max-age=31536000");
  if (!c.res.headers.has("Content-Security-Policy")) c.header("Content-Security-Policy", "frame-ancestors 'none'");
});

// Todas as rotas do Better Auth (login, logout, sessao...). Cadastro publico esta desligado na config.
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env, c.req.url).handler(c.req.raw));

app.route("/api/setup", setup);
app.route("/api/webhook", webhook);
app.route("/api/conversations", conversations);
app.route("/api/contacts", contacts);
app.route("/api/search", search);
app.route("/api/members", members);
app.route("/api/admin", teamAdmin);
app.route("/api/admin/uazapi", uazapiAdmin);
app.route("/api", accessLinks);
app.route("/api/media", media);
app.route("/api/files", signedFiles);
app.route("/api/realtime", realtime);
app.route("/api/connection", connection);

app.route("/api/me/preferences", preferences);
app.route("/api/quick-replies", quickReplies);
app.route("/api/labels", labels);
app.route("/api/funnels", funnels);
app.route("/api/workspace", workspace);

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
