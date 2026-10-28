import { refreshConnection } from "./connection";
import { createDb } from "./db";
import { reconcile } from "./reconcile";

/** Handler do Cron Trigger (a cada 5 minutos): confere a conexao do numero e reconcilia mensagens e midias. */
export async function handleScheduled(_controller: ScheduledController, env: Cloudflare.Env, _ctx: ExecutionContext): Promise<void> {
  await refreshConnection(env, createDb(env.DB));
  await reconcile(env);
}
