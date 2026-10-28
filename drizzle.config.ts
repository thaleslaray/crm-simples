import { defineConfig } from "drizzle-kit";

// Gera SQL versionado em ./migrations (aplicado por `wrangler d1 migrations apply`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
});
