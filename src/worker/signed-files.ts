import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { serveMedia } from "./media";

/** Validade do link entregue a Uazapi: ela busca o arquivo logo apos o envio; o reenvio gera outro link. */
const LINK_TTL_MS = 60 * 60 * 1000;

const encoder = new TextEncoder();

async function sign(env: Cloudflare.Env, messageId: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.BETTER_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Prefixo de contexto: a mesma chave nao assina outra coisa por acaso.
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`outgoing-file:${messageId}:${exp}`));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Link temporario e assinado para a Uazapi baixar o arquivo enviado pelo atendente (a Uazapi nao tem sessao). */
export async function signedFileUrl(env: Cloudflare.Env, origin: string, messageId: string): Promise<string> {
  const exp = Date.now() + LINK_TTL_MS;
  const sig = await sign(env, messageId, exp);
  return `${origin}/api/files/${encodeURIComponent(messageId)}?exp=${exp}&sig=${sig}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** Fora do `requireAuth` de proposito: a assinatura e a credencial. So serve arquivos de mensagens de saida. */
export const signedFiles = new Hono<{ Bindings: Cloudflare.Env }>();

signedFiles.get("/:messageId", async (c) => {
  const messageId = c.req.param("messageId");
  const exp = Number(c.req.query("exp"));
  const sig = c.req.query("sig") ?? "";
  if (!Number.isFinite(exp) || exp < Date.now() || !timingSafeEqual(sig, await sign(c.env, messageId, exp)))
    return c.json({ error: "link_invalido" }, 403);
  const msg = await createDb(c.env.DB).query.message.findFirst({
    where: and(eq(schema.message.id, messageId), eq(schema.message.direction, "out")),
  });
  return serveMedia(c.env, c.req.raw, msg);
});
