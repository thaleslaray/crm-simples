import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth } from "./middleware";

/** So esses tipos abrem no navegador; o resto (html, svg...) sempre baixa, para nao executar nada na nossa origem. */
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|heic)|video\/|audio\/|application\/pdf$)/;

export const media = new Hono<AppEnv>();
media.use("*", requireAuth);

// Midia so para quem tem sessao: o objeto do R2 nunca e publico.
media.get("/:messageId", async (c) => {
  const db = createDb(c.env.DB);
  const msg = await db.query.message.findFirst({ where: eq(schema.message.id, c.req.param("messageId")) });
  return serveMedia(c.env, c.req.raw, msg);
});

/** Serve o arquivo da mensagem do R2 (com Range). Quem chama decide quem pode ver; aqui so se monta a resposta. */
export async function serveMedia(
  env: Cloudflare.Env,
  req: Request,
  msg: Pick<typeof schema.message.$inferSelect, "id" | "mediaStatus" | "mediaKey" | "mediaMime" | "mediaName"> | undefined,
): Promise<Response> {
  const notFound = (error: string, status: 404 | 410) =>
    new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
  if (!msg || msg.mediaStatus !== "available" || !msg.mediaKey) return notFound("nao_encontrado", 404);

  // `range` com Headers: R2 entende `Range: bytes=...` (audio e video precisam para tocar e buscar no Safari).
  const object = await env.MEDIA.get(msg.mediaKey, { range: req.headers });
  if (!object) return notFound("midia_expirada", 410);

  const mime = msg.mediaMime ?? object.httpMetadata?.contentType ?? "application/octet-stream";
  const headers = new Headers({
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
  });
  const filename = (msg.mediaName ?? `arquivo-${msg.id}`).replace(/["\\\r\n]/g, "_");
  headers.set("content-disposition", `${INLINE.test(mime) ? "inline" : "attachment"}; filename="${filename}"`);

  const body = "body" in object ? object.body : null;
  if (!body) return new Response(null, { status: 304 }); // so acontece com pre-condicoes, que nao enviamos
  const r = object.range && "offset" in object.range ? object.range : null;
  if (r && r.offset !== undefined && r.length !== undefined && req.headers.get("range")) {
    headers.set("content-range", `bytes ${r.offset}-${r.offset + r.length - 1}/${object.size}`);
    headers.set("content-length", String(r.length));
    return new Response(body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(body, { headers });
}
