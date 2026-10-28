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
      /** Opcionais na pratica (podem estar vazios): a tela de Conexao grava os dados da Uazapi no banco, que vencem estes. */
      UAZAPI_BASE_URL: string;
      UAZAPI_INSTANCE_TOKEN: string;
      /** Opcional: timeout das chamadas a Uazapi em ms (padrao 15000). */
      UAZAPI_TIMEOUT_MS?: string;
      WEBHOOK_URL_SECRET: string;
      /** Segredo da tela de primeiro acesso. Sem ele (vazio ou ausente) a tela nunca abre. */
      SETUP_CODE?: string;
    }
  }
  /** Job do pipeline de midia (ticket futuro). */
  interface MediaJob {
    messageId: string;
  }
  interface Env extends Cloudflare.Env {}
}

export {};
