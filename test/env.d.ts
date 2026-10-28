import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
    // Tipa `exports.default.fetch()` (o Worker principal) em cloudflare:workers.
    interface GlobalProps {
      mainModule: typeof import("../src/worker/index");
    }
  }
}
