// Prepara um D1 local LIMPO (migra + cria o admin pelo script de bootstrap) e sobe o app com `vite dev`.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  E2E_ADMIN,
  E2E_APP_PORT,
  E2E_CONFIG_DIR,
  E2E_STATE_DIR,
  E2E_UAZAPI_PORT,
  E2E_WEBHOOK,
} from "./e2e-env";

const run = (args: string[]) =>
  execFileSync("pnpm", args, { stdio: "inherit" });

rmSync(E2E_STATE_DIR, { recursive: true, force: true });
run([
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--persist-to",
  E2E_STATE_DIR,
]);
run([
  "bootstrap:admin",
  "--local",
  "--persist-to",
  E2E_STATE_DIR,
  "--email",
  E2E_ADMIN.email,
  "--name",
  E2E_ADMIN.name,
  "--password",
  E2E_ADMIN.password,
]);

// O `.dev.vars` e lido ao lado da config do wrangler e vence as variaveis do processo. Para o E2E nunca
// herdar os segredos (nem a Uazapi real) do `.dev.vars` de desenvolvimento, usa uma config propria em outra pasta.
const config = JSON.parse(
  readFileSync("wrangler.jsonc", "utf8")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n"),
);
delete config.$schema;
config.main = resolve(config.main);
for (const db of config.d1_databases)
  db.migrations_dir = resolve(db.migrations_dir);
mkdirSync(E2E_CONFIG_DIR, { recursive: true });
writeFileSync(
  `${E2E_CONFIG_DIR}/wrangler.json`,
  JSON.stringify(config, null, 2),
);
const vars = {
  BETTER_AUTH_SECRET: "segredo-e2e-com-mais-de-32-caracteres-aleatorios",
  UAZAPI_BASE_URL: `http://127.0.0.1:${E2E_UAZAPI_PORT}`,
  UAZAPI_INSTANCE_TOKEN: E2E_WEBHOOK.instanceToken,
  WEBHOOK_URL_SECRET: E2E_WEBHOOK.urlSecret,
};
writeFileSync(
  `${E2E_CONFIG_DIR}/.dev.vars`,
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
);

const server = spawn(
  "pnpm",
  [
    "exec",
    "vite",
    "--port",
    String(E2E_APP_PORT),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, CRM_E2E: "1" },
  },
);
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
