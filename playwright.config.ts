import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_PORT, E2E_UAZAPI_PORT } from "./e2e/e2e-env";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1, // um D1 local compartilhado entre os testes
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${E2E_APP_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Celular (375px de largura) — Chromium com viewport e toque de celular.
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: "pnpm exec tsx e2e/fake-uazapi-server.ts",
      url: `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake/calls`,
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx e2e/app-server.ts",
      url: `http://127.0.0.1:${E2E_APP_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
