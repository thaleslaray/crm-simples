/**
 * Cliente Uazapi: interface unica e injetavel para tudo que fala com a Uazapi.
 * Neste ticket so existe `getInstanceStatus()` (para o harness de testes ter o que exercitar);
 * envio, midia, webhook etc. vem nos proximos tickets. Backoff de 429 tambem fica para la.
 */
export interface InstanceStatus {
  /** Ex.: "connected", "connecting", "disconnected". */
  status: string;
}

export interface MediaDownload {
  /** Link temporario (~2 dias) do arquivo ja decifrado. */
  url: string;
  mimetype: string | null;
}

export interface UazapiClient {
  getInstanceStatus(): Promise<InstanceStatus>;
  /** `/message/download`: pede o link do arquivo da mensagem (`id` = `message.id` do webhook). */
  downloadMedia(messageId: string): Promise<MediaDownload>;
  /** Abre o link do arquivo para leitura em stream. Nao envia o token da instancia: o host vem do corpo da resposta. */
  openFile(url: string): Promise<Response>;
}

export class UazapiHttpError extends Error {
  constructor(
    readonly status: number,
    /** Valor de Retry-After convertido para ms (quando enviado). */
    readonly retryAfterMs: number | null,
  ) {
    super(`Uazapi respondeu HTTP ${status}`);
    this.name = "UazapiHttpError";
  }
}

export class UazapiTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Uazapi nao respondeu em ${timeoutMs}ms`);
    this.name = "UazapiTimeoutError";
  }
}

export interface UazapiClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type UazapiEnv = Pick<Cloudflare.Env, "UAZAPI_BASE_URL" | "UAZAPI_INSTANCE_TOKEN">;

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function createUazapiClient(env: UazapiEnv, options: UazapiClientOptions = {}): UazapiClient {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const baseUrl = env.UAZAPI_BASE_URL.replace(/\/+$/, "");

  async function request(path: string, init: RequestInit = {}, authenticated = true): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(authenticated ? `${baseUrl}${path}` : path, {
        ...init,
        headers: { ...(authenticated ? { token: env.UAZAPI_INSTANCE_TOKEN, accept: "application/json" } : {}), ...init.headers },
        signal: controller.signal,
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new UazapiHttpError(res.status, parseRetryAfter(res.headers.get("retry-after")));
      }
      return res;
    } catch (err) {
      if (controller.signal.aborted) throw new UazapiTimeoutError(timeoutMs);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getInstanceStatus() {
      const res = await request("/instance/status");
      const body = (await res.json()) as { instance?: { status?: string }; status?: unknown };
      return { status: body.instance?.status ?? "unknown" };
    },
    async downloadMedia(messageId) {
      const res = await request("/message/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: messageId, return_link: true, return_base64: false }),
      });
      const body = (await res.json()) as { fileURL?: string; mimetype?: string };
      if (!body.fileURL) throw new Error("Uazapi nao devolveu o link do arquivo");
      return { url: body.fileURL, mimetype: body.mimetype ?? null };
    },
    // O timeout vale ate os headers chegarem; o corpo segue em stream sem limite de tempo proprio.
    openFile: (url) => request(url, {}, false),
  };
}
