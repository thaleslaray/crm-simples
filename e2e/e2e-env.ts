// Valores compartilhados entre playwright.config.ts, o servidor de E2E e os testes.
export const E2E_ADMIN = {
  email: "admin-e2e@exemplo.com",
  name: "Admin E2E",
  password: "senha-e2e-12345",
};
export const E2E_SETUP_CODE = "frase-de-instalacao-e2e";
// As portas aceitam override por env para rodar o E2E em worktrees paralelas sem colisão.
export const E2E_APP_PORT = Number(process.env.E2E_APP_PORT ?? 5188);
export const E2E_UAZAPI_PORT = Number(process.env.E2E_UAZAPI_PORT ?? 4010);
export const E2E_STATE_DIR = ".wrangler/e2e-state";
export const E2E_WEBHOOK = {
  urlSecret: "segredo-webhook-e2e",
  instanceToken: "token-instancia-e2e",
};
export const E2E_CONFIG_DIR = ".wrangler/e2e-config";
