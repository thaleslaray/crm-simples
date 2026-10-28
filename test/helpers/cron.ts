import { env } from "cloudflare:workers";
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";

/** Dispara o Cron Trigger de 5 minutos, como a plataforma faria. */
export async function runCron(): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled!(createScheduledController({ scheduledTime: Date.now(), cron: "*/5 * * * *" }), env, ctx);
  await waitOnExecutionContext(ctx);
}
