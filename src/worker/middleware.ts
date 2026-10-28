import { createMiddleware } from "hono/factory";
import { createAuth } from "./auth";
import { ROLES, type Role } from "./db/schema";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  signatureEnabled: boolean;
}

export type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: { user: SessionUser };
};

async function loadUser(env: Cloudflare.Env, req: Request, opts: { fresh: boolean }) {
  const auth = createAuth(env, req.url);
  const result = await auth.api.getSession({
    headers: req.headers,
    query: opts.fresh ? { disableCookieCache: true } : undefined,
  });
  if (!result) return null;
  const sessionUser = result.user as typeof result.user & { role?: string; signatureEnabled?: boolean };
  // Papel desconhecido (dado corrompido ou papel removido) = sem acesso, nunca um papel "padrao".
  const role = ROLES.find((r) => r === sessionUser.role);
  if (!role) return null;
  return {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    role,
    signatureEnabled: sessionUser.signatureEnabled ?? true,
  } satisfies SessionUser;
}

/** Exige sessao valida (usa o cache de sessao em cookie). Coloca o usuario em `c.get("user")`. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadUser(c.env, c.req.raw, { fresh: false });
  if (!user) return c.json({ error: "nao_autenticado" }, 401);
  c.set("user", user);
  await next();
});

/**
 * Exige um papel. Deve vir DEPOIS de requireAuth. Para nao honrar papel/sessao velhos do cache
 * (membro rebaixado ou removido), rotas com papel releem a sessao direto do D1.
 */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = await loadUser(c.env, c.req.raw, { fresh: true });
    if (!user) return c.json({ error: "nao_autenticado" }, 401);
    c.set("user", user);
    if (!roles.includes(user.role)) return c.json({ error: "proibido" }, 403);
    await next();
  });
