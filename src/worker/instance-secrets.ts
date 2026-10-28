import { eq } from "drizzle-orm";
import { createDb, schema } from "./db";

/**
 * Os dois segredos da instalacao: o do login (`BETTER_AUTH_SECRET`) e o do endereco do webhook (`WEBHOOK_URL_SECRET`).
 * TODO uso deles passa por aqui. Prioridade: variavel de ambiente (segredo da Cloudflare; o banco nem e tocado)
 * -> valor guardado no banco -> gerar, gravar e usar o que ficou gravado.
 */
const ROW_ID = "instance";

type Stored = { authSecret: string; webhookSecret: string };

/** So o valor LIDO do banco (nunca muda depois de criado): poupa uma ida ao D1 por requisicao. */
let cached: Stored | null = null;

/** Para os testes: o D1 e esvaziado entre eles, entao o cache nao pode sobreviver. */
export function resetInstanceSecretsCache(): void {
  cached = null;
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function readStored(env: Cloudflare.Env): Promise<Stored | undefined> {
  return createDb(env.DB).query.instanceSecret.findFirst({
    where: eq(schema.instanceSecret.id, ROW_ID),
    columns: { authSecret: true, webhookSecret: true },
  });
}

async function loadStored(env: Cloudflare.Env): Promise<Stored> {
  if (cached) return cached;
  let row = await readStored(env);
  if (!row) {
    // Sem corrida: se duas requisicoes chegarem juntas, so uma linha entra e as duas releem a que ficou.
    await createDb(env.DB)
      .insert(schema.instanceSecret)
      .values({ id: ROW_ID, authSecret: randomSecret(), webhookSecret: randomSecret(), createdAt: Date.now() })
      .onConflictDoNothing();
    row = await readStored(env);
    if (!row) throw new Error("segredos da instalacao nao puderam ser gravados");
  }
  cached = row;
  return row;
}

export async function getAuthSecret(env: Cloudflare.Env): Promise<string> {
  return env.BETTER_AUTH_SECRET || (await loadStored(env)).authSecret;
}

export async function getWebhookSecret(env: Cloudflare.Env): Promise<string> {
  return env.WEBHOOK_URL_SECRET || (await loadStored(env)).webhookSecret;
}
