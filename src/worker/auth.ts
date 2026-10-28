import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb, schema } from "./db";
import { getAuthSecret } from "./instance-secrets";

/** Tamanho minimo da senha: vale no login do Better Auth e nos fluxos de convite e redefinicao. */
export const MIN_PASSWORD = 12;

/**
 * Better Auth INSTANCIADO POR REQUISICAO: o binding D1 so existe dentro do handler,
 * entao nao ha singleton de modulo. A instancia e barata de criar.
 */
export async function createAuth(env: Cloudflare.Env, requestUrl: string) {
  return betterAuth({
    // Mesma origem do Worker (API e front compartilham o dominio): derivada da requisicao, sem var extra.
    baseURL: new URL(requestUrl).origin,
    secret: await getAuthSecret(env),
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Sem cadastro publico: usuarios so nascem pelo bootstrap (e, nos proximos tickets, por convite do admin).
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD,
    },
    // Limite de tentativas guardado no D1: memoria nao vale em Workers (cada requisicao pode cair em outro isolate).
    // `enabled` explicito porque o padrao so liga com NODE_ENV=production, que o Worker nao define.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    // A Cloudflare poe o IP real do cliente em cf-connecting-ip; o padrao (x-forwarded-for) seria falsificavel.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    user: {
      additionalFields: {
        // input:false => o cliente nunca consegue definir/alterar estes campos pela API publica.
        role: { type: "string", required: false, defaultValue: "atendente", input: false },
        signatureEnabled: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    session: {
      // Evita consultar o D1 a cada requisicao. Rotas de admin ignoram o cache (ver requireRole).
      cookieCache: { enabled: true, maxAge: 60 },
    },
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
