/** Consumer da fila de midia (pipeline de midia vem em ticket futuro). Por ora so confirma as mensagens. */
export async function handleQueue(batch: MessageBatch<MediaJob>, _env: Cloudflare.Env, _ctx: ExecutionContext): Promise<void> {
  for (const message of batch.messages) message.ack();
}
