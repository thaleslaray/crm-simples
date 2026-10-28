import { env } from "cloudflare:workers";
import { buildUserStatements, type NewUser } from "../../src/worker/db/seed-user";

/** Cria usuario no D1 do teste com a MESMA funcao que o script de bootstrap usa (hash + user + account). */
export async function createUser(input: Partial<NewUser> & Pick<NewUser, "email" | "password">): Promise<string> {
  const { userId, statements } = await buildUserStatements({ name: "Pessoa de Teste", role: "atendente", ...input });
  await env.DB.batch(statements.map((s) => env.DB.prepare(s.sql).bind(...s.params)));
  return userId;
}
