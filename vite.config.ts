import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// E2E usa estado e config proprios (gerados por e2e/app-server.ts) para nao misturar com o desenvolvimento.
const e2e = !!process.env.CRM_E2E;
const persistState = e2e ? { path: ".wrangler/e2e-state" } : true;
const configPath = e2e ? ".wrangler/e2e-config/wrangler.json" : undefined;

export default defineConfig({
  plugins: [react(), cloudflare({ persistState, configPath })],
});
