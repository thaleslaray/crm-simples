/**
 * Cliente Uazapi: interface unica e injetavel para tudo que fala com a Uazapi.
 * Neste ticket so existe `getInstanceStatus()` (para o harness de testes ter o que exercitar);
 * envio, midia, webhook etc. vem nos proximos tickets. Backoff de 429 tambem fica para la.
 */
export interface InstanceStatus {
  /** Ex.: "connected", "connecting", "disconnected". */
  status: string;
  /** QR code (data URL ou base64) enquanto a instancia estiver `connecting`. */
  qrcode?: string;
  lastDisconnectReason?: string;
}

export interface MediaDownload {
  /** Link temporario (~2 dias) do arquivo ja decifrado. */
  url: string;
  mimetype: string | null;
}

export interface UazapiClient {
  getInstanceStatus(): Promise<InstanceStatus>;
  /** Inicia o pareamento (QR code). `history_days: 0`: nao importa historico anterior a conexao. */
  connect(): Promise<InstanceStatus>;
  /** Cadastra o webhook da instancia: so os eventos que o CRM usa, sem grupos nem mensagens `fromMe`. */
  configureWebhook(url: string): Promise<void>;
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

  async function readInstance(res: Response): Promise<InstanceStatus> {
    const body = (await res.json()) as { instance?: { status?: string; qrcode?: string; lastDisconnectReason?: string } };
    const { status, qrcode, lastDisconnectReason } = body.instance ?? {};
    return { status: status ?? "unknown", ...(qrcode ? { qrcode } : {}), ...(lastDisconnectReason ? { lastDisconnectReason } : {}) };
  }
  const postJson = (path: string, body: unknown) =>
    request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  return {
    async getInstanceStatus() {
      return readInstance(await request("/instance/status"));
    },
    async connect() {
      return readInstance(await postJson("/instance/connect", { history_days: 0 }));
    },
    async configureWebhook(url) {
      const res = await postJson("/webhook", {
        enabled: true,
        url,
        events: ["messages", "messages_update", "connection"],
        excludeMessages: ["isGroupYes", "fromMeYes"],
        addUrlEvents: false,
        addUrlTypesMessages: false,
      });
      await res.body?.cancel();
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
