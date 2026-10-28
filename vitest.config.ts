import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async ({ inject }) => {
      const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Substitui os segredos por valores de teste; a Uazapi aponta para o servidor falso.
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: "segredo-de-teste-com-mais-de-32-caracteres-ok",
            UAZAPI_BASE_URL: inject<string>("fakeUazapiUrl"),
            UAZAPI_INSTANCE_TOKEN: "token-instancia-teste",
            UAZAPI_ADMIN_TOKEN: "token-admin-teste",
            WEBHOOK_URL_SECRET: "segredo-webhook-teste",
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    // A Uazapi falsa e uma so (estado global: regras e chamadas); arquivos em paralelo se atropelariam no reset.
    fileParallelism: false,
    globalSetup: ["./test/fake-uazapi/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
