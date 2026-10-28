import { env } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import worker from "../../src/worker/index";
import { api } from "./api";
import type { fakeUazapi } from "./fake-uazapi";

/** Entrega um job de midia ao consumer do Worker, como a fila faria na tentativa `attempts`. */
export async function deliverMediaJob(messageId: string, attempts = 1) {
  const batch = createMessageBatch<MediaJob>("crm-media", [{ id: "job1", timestamp: new Date(), attempts, body: { messageId } }]);
  const ctx = createExecutionContext();
  await worker.queue!(batch, env, ctx);
  return getQueueResult(batch, ctx);
}

/** Programa a Uazapi falsa para entregar o arquivo: `/message/download` aponta para `/files/<nome>`. */
export async function programDownload(uazapi: ReturnType<typeof fakeUazapi>, file: { name: string; body: string; mime: string }) {
  await uazapi.program("POST", "/message/download", [{ body: { fileURL: `${env.UAZAPI_BASE_URL}/files/${file.name}`, mimetype: file.mime } }]);
  await uazapi.program("GET", `/files/${file.name}`, [{ headers: { "content-type": file.mime }, body: file.body }]);
}

export const fetchMedia = (cookie: string | undefined, messageId: string, headers?: HeadersInit) =>
  api(`/api/media/${messageId}`, { cookie, headers });
