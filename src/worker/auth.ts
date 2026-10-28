import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb, schema } from "./db";

/**
 * Better Auth INSTANCIADO POR REQUISICAO: o binding D1 so existe dentro do handler,
 * entao nao ha singleton de modulo. A instancia e barata de criar.
 */
export function createAuth(env: Cloudflare.Env, requestUrl: string) {
  return betterAuth({
    // Mesma origem do Worker (API e front compartilham o dominio): derivada da requisicao, sem var extra.
    baseURL: new URL(requestUrl).origin,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Sem cadastro publico: usuarios so nascem pelo bootstrap (e, nos proximos tickets, por convite do admin).
      disableSignUp: true,
    },
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

export type Auth = ReturnType<typeof createAuth>;
