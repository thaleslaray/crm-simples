import { refreshConnection } from "./connection";
import { createDb } from "./db";

/** Handler do Cron Trigger (a cada 5 minutos). Hoje: confere a conexao do numero; reconciliacao vem no ticket 19. */
export async function handleScheduled(_controller: ScheduledController, env: Cloudflare.Env, _ctx: ExecutionContext): Promise<void> {
  await refreshConnection(env, createDb(env.DB));
}
