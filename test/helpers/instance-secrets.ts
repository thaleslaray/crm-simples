import { env } from "cloudflare:workers";

/** Roda `fn` como numa instalacao pelo botao: os dois segredos NAO estao no ambiente (o CRM gera e guarda no banco). */
export async function withGeneratedSecrets<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { auth: env.BETTER_AUTH_SECRET, webhook: env.WEBHOOK_URL_SECRET };
  env.BETTER_AUTH_SECRET = undefined;
  env.WEBHOOK_URL_SECRET = undefined;
  try {
    return await fn();
  } finally {
    env.BETTER_AUTH_SECRET = saved.auth;
    env.WEBHOOK_URL_SECRET = saved.webhook;
  }
}

/** Linha de segredos guardada no banco (null = nada guardado). */
export async function storedSecrets(): Promise<{ authSecret: string; webhookSecret: string } | null> {
  const { results } = await env.DB.prepare("SELECT auth_secret AS authSecret, webhook_secret AS webhookSecret FROM instance_secret").all<{
    authSecret: string;
    webhookSecret: string;
  }>();
  if (results.length > 1) throw new Error("instance_secret deveria ter uma linha so");
  return results[0] ?? null;
}

/** Arrange: um par de segredos ja guardado no banco (como se o CRM tivesse gerado antes). */
export async function seedStoredSecrets(authSecret: string, webhookSecret: string): Promise<void> {
  await env.DB.prepare("INSERT INTO instance_secret (id, auth_secret, webhook_secret, created_at) VALUES ('instance', ?, ?, ?)")
    .bind(authSecret, webhookSecret, Date.now())
    .run();
}
