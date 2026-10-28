// Prepara um D1 local LIMPO (migra + cria o admin pelo script de bootstrap) e sobe o app com `vite dev`.
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { E2E_ADMIN, E2E_APP_PORT, E2E_STATE_DIR, E2E_UAZAPI_PORT } from "./e2e-env";

const run = (args: string[]) => execFileSync("pnpm", args, { stdio: "inherit" });

rmSync(E2E_STATE_DIR, { recursive: true, force: true });
run(["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", E2E_STATE_DIR]);
run([
  "bootstrap:admin", "--local", "--persist-to", E2E_STATE_DIR,
  "--email", E2E_ADMIN.email, "--name", E2E_ADMIN.name, "--password", E2E_ADMIN.password,
]);

const server = spawn("pnpm", ["exec", "vite", "--port", String(E2E_APP_PORT), "--strictPort", "--host", "127.0.0.1"], {
  stdio: "inherit",
  env: {
    ...process.env,
    CRM_E2E: "1",
    // Segredos de teste entram como vars do Worker (nao toca no .dev.vars de desenvolvimento).
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    BETTER_AUTH_SECRET: "segredo-e2e-com-mais-de-32-caracteres-aleatorios",
    UAZAPI_BASE_URL: `http://127.0.0.1:${E2E_UAZAPI_PORT}`,
    UAZAPI_INSTANCE_TOKEN: "token-instancia-e2e",
    UAZAPI_ADMIN_TOKEN: "token-admin-e2e",
    WEBHOOK_URL_SECRET: "segredo-webhook-e2e",
  },
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
