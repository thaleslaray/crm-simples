import { eq } from "drizzle-orm";
import { createDb, schema } from "./db";
import { streamToR2 } from "./stream-to-r2";
import { createUazapiClient } from "./uazapi/client";

/** Igual a `max_retries` do consumer em wrangler.jsonc: a tentativa seguinte ja iria para a DLQ. */
const MAX_RETRIES = 5;

/** Baixa o arquivo pela Uazapi e o grava no R2 em stream (sem carregar o arquivo inteiro na memoria). */
async function downloadMedia(env: Cloudflare.Env, messageId: string): Promise<void> {
  const db = createDb(env.DB);
  const msg = await db.query.message.findFirst({ where: eq(schema.message.id, messageId) });
  if (!msg || msg.mediaStatus !== "pending") return; // sumiu ou ja foi tratada (entrega repetida)

  const uazapi = createUazapiClient(env);
  const link = await uazapi.downloadMedia(msg.externalId);
  const file = await uazapi.openFile(link.url);
  if (!file.body) throw new Error("arquivo sem corpo");

  const mime = file.headers.get("content-type") ?? link.mimetype ?? msg.mediaMime;
  const key = `media/${msg.id}`;
  const size = await streamToR2(env.MEDIA, key, file, mime);
  await db
    .update(schema.message)
    .set({ mediaStatus: "available", mediaKey: key, mediaMime: mime, mediaSize: size })
    .where(eq(schema.message.id, messageId));
}

/** Consumer da fila de midia: retries com espera crescente; esgotados, marca "falhou" e devolve para a fila ir a DLQ. */
export async function handleQueue(batch: MessageBatch<MediaJob>, env: Cloudflare.Env, _ctx: ExecutionContext): Promise<void> {
  for (const message of batch.messages) {
    try {
      await downloadMedia(env, message.body.messageId);
      message.ack();
    } catch (err) {
      // Sem payload nem URL no log (o link da Uazapi e uma credencial de fato).
      console.error("midia: falha no download", { messageId: message.body.messageId, tentativa: message.attempts, erro: err instanceof Error ? err.name : "desconhecido" });
      if (message.attempts > MAX_RETRIES) {
        await createDb(env.DB).update(schema.message).set({ mediaStatus: "failed" }).where(eq(schema.message.id, message.body.messageId));
        message.retry(); // sem tentativas restantes: a fila move para a DLQ
      } else {
        message.retry({ delaySeconds: Math.min(300, 5 * 2 ** (message.attempts - 1)) });
      }
    }
  }
}
