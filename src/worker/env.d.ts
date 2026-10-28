// Tipagem do ambiente do Worker (escrita a mao: bindings do wrangler.jsonc + secrets).
import type { InboxHub } from "./durable/inbox-hub";

declare global {
  namespace Cloudflare {
    interface Env {
      // Bindings
      DB: D1Database;
      MEDIA: R2Bucket;
      MEDIA_QUEUE: Queue<MediaJob>;
      INBOX_HUB: DurableObjectNamespace<InboxHub>;
      // Secrets / vars
      BETTER_AUTH_SECRET: string;
      UAZAPI_BASE_URL: string;
      UAZAPI_INSTANCE_TOKEN: string;
      UAZAPI_ADMIN_TOKEN: string;
      WEBHOOK_URL_SECRET: string;
    }
  }
  /** Job do pipeline de midia (ticket futuro). */
  interface MediaJob {
    messageId: string;
  }
  interface Env extends Cloudflare.Env {}
}

export {};
