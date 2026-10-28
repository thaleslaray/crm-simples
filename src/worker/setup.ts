import { Hono } from "hono";
import { MIN_PASSWORD, createAuth } from "./auth";
import { createDb } from "./db";
import { buildUserStatements } from "./db/seed-user";
import type { AppEnv } from "./middleware";

/** Tela de primeiro acesso: publica, abre so enquanto nao ha usuario e o SETUP_CODE esta configurado. */
export const setup = new Hono<AppEnv>();

const MAX_TRIES = 5;
const WINDOW_MS = 60_000;

async function noUsers(env: Cloudflare.Env): Promise<boolean> {
  return !(await createDb(env.DB).query.user.findFirst({ columns: { id: true } }));
}

/** Comparacao em tempo constante: tira o hash dos dois lados para ter o mesmo tamanho. */
async function sameCode(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Limite de tentativas por IP na mesma tabela `rate_limit` do login (Better Auth, storage "database") e com a mesma
 * regra: 5 por minuto. O UPSERT e uma instrucao so, entao tentativas simultaneas nao furam a conta.
 */
async function overLimit(env: Cloudflare.Env, ip: string): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ? - last_request > ? THEN 1 ELSE count + 1 END,
       last_request = CASE WHEN ? - last_request > ? THEN excluded.last_request ELSE last_request END
     RETURNING count`,
  )
    .bind(crypto.randomUUID(), `${ip}/setup`, now, now, WINDOW_MS, now, WINDOW_MS)
    .first<{ count: number }>();
  return (row?.count ?? 0) > MAX_TRIES;
}

setup.get("/", async (c) => c.json({ needed: !!c.env.SETUP_CODE && (await noUsers(c.env)) }));

setup.post("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "desconhecido";
  if (await overLimit(c.env, ip)) return c.json({ error: "muitas_tentativas" }, 429);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const code = typeof body.code === "string" ? body.code : "";
  const expected = c.env.SETUP_CODE;
  // A comparacao roda sempre, para nao vazar por tempo se o codigo bate. Sem SETUP_CODE a tela nunca abre.
  const codeOk = await sameCode(code, expected ?? "");
  if (!expected || !codeOk || !(await noUsers(c.env))) return c.json({ error: "proibido" }, 403);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || !email.includes("@") || password.length < MIN_PASSWORD) return c.json({ error: "dados_invalidos" }, 400);

  const { statements } = await buildUserStatements({ name, email, password, role: "admin", onlyIfNoUsers: true });
  const results = await c.env.DB.batch(statements.map((s) => c.env.DB.prepare(s.sql).bind(...s.params)));
  // Perdeu a corrida: outra chamada criou o primeiro usuario no meio do caminho.
  if (results[0]?.meta.changes !== 1) return c.json({ error: "proibido" }, 403);

  // Entra na hora, como o convite: reaproveita o login do Better Auth e repassa o cookie de sessao.
  const signedIn = await (await createAuth(c.env, c.req.url)).api.signInEmail({ body: { email, password }, asResponse: true });
  const res = c.json({ ok: true });
  for (const cookie of signedIn.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
  return res;
});
