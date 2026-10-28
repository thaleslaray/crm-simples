/**
 * Cria o primeiro admin (nao existe rota nem tela de cadastro).
 *
 *   pnpm bootstrap:admin --local  --email voce@exemplo.com --name "Seu Nome" --password '...'
 *   pnpm bootstrap:admin --remote --email voce@exemplo.com --name "Seu Nome" --password '...'
 *
 * A senha tambem pode vir de BOOTSTRAP_ADMIN_PASSWORD (evita deixa-la no historico do shell).
 * O hash e gerado com o hasher do proprio Better Auth (mesma funcao usada pelos testes) e gravado
 * em user + account via `wrangler d1 execute --file` (arquivo temporario 0600, apagado no fim: o SQL
 * tem o hash e nao pode aparecer na lista de processos). Em --local o D1 e o do `wrangler dev`/`vite dev`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildUserStatements, toLiteralSql } from "../src/worker/db/seed-user";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    "persist-to": { type: "string" }, // opcional: diretorio de estado local (usado pelo E2E)
    database: { type: "string", default: "DB" }, // binding ou nome do banco no wrangler.jsonc
  },
});

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  console.error('Uso: pnpm bootstrap:admin (--local | --remote) --email <e-mail> --name <nome> --password <senha>');
  process.exit(1);
}

const password = values.password ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (values.local === values.remote) fail("informe exatamente um entre --local e --remote.");
if (!values.email) fail("falta --email.");
if (!values.name) fail("falta --name.");
if (!password) fail("falta --password (ou BOOTSTRAP_ADMIN_PASSWORD).");
if (password.length < 8) fail("a senha precisa ter pelo menos 8 caracteres.");

const { statements } = await buildUserStatements({
  email: values.email,
  name: values.name,
  password,
  role: "admin",
});

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-admin-"));
const sqlFile = path.join(tmpDir, "admin.sql");
fs.writeFileSync(sqlFile, toLiteralSql(statements), { mode: 0o600 });
const args = [
  "exec", "wrangler", "d1", "execute", values.database,
  values.remote ? "--remote" : "--local",
  ...(values["persist-to"] ? ["--persist-to", values["persist-to"]] : []),
  "--file", sqlFile,
];
try {
  execFileSync("pnpm", args, { stdio: "inherit" });
} catch {
  fail("o wrangler falhou (e-mail ja cadastrado? migracoes aplicadas? veja a saida acima).");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
console.log(`Admin ${values.email.toLowerCase()} criado (${values.remote ? "remoto" : "local"}).`);
