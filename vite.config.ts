import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// E2E usa um diretorio de estado proprio para nao misturar com o D1 local de desenvolvimento.
const persistState = process.env.CRM_E2E ? { path: ".wrangler/e2e-state" } : true;

export default defineConfig({
  plugins: [react(), cloudflare({ persistState })],
});
