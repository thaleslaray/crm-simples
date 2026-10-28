/**
 * Criacao de usuario FORA do Better Auth (bootstrap do primeiro admin e helper dos testes).
 * Uma unica implementacao: gera o hash no formato que o Better Auth valida (o proprio hasher dele)
 * e devolve os INSERTs de `user` + `account` (credential). O script de bootstrap os executa via
 * `wrangler d1 execute`; os testes os executam via binding D1.
 */
import { hashPassword } from "better-auth/crypto";
import type { Role } from "./schema";

export interface NewUser {
  email: string;
  name: string;
  password: string;
  role: Role;
  signatureEnabled?: boolean;
}

export interface SqlStatement {
  sql: string;
  params: (string | number)[];
}

export async function buildUserStatements(input: NewUser): Promise<{ userId: string; statements: SqlStatement[] }> {
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = Date.now();
  const email = input.email.trim().toLowerCase(); // o Better Auth normaliza e-mail para minusculas
  const passwordHash = await hashPassword(input.password);

  return {
    userId,
    statements: [
      {
        sql: "INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at, role, signature_enabled) VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?)",
        params: [userId, input.name, email, now, now, input.role, input.signatureEnabled === false ? 0 : 1],
      },
      {
        sql: "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
        params: [accountId, userId, userId, passwordHash, now, now],
      },
    ],
  };
}

/** Converte statements parametrizados em SQL literal (para `wrangler d1 execute --command/--file`). */
export function toLiteralSql(statements: SqlStatement[]): string {
  const lit = (v: string | number) => (typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`);
  return statements
    .map((s) => {
      const params = [...s.params];
      return `${s.sql.replace(/\?/g, () => lit(params.shift()!))};`;
    })
    .join("\n");
}
