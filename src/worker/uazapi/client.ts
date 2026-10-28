import type { UazapiMessage } from "../ingest";

/**
 * Cliente Uazapi: interface unica e injetavel para tudo que fala com a Uazapi.
 * Hoje: `getInstanceStatus()`, `sendText()` e midia (`downloadMedia`, `openFile`).
 * `429` e tratado com backoff + jitter respeitando Retry-After (ver `request`). Timeout NUNCA e repetido.
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

export interface SentText {
  /** `id` da mensagem na Uazapi (mesma chave do webhook `message.id`). */
  id: string | null;
  /** `messageid` do WhatsApp. */
  messageId: string | null;
}

export interface FindMessagesPage {
  /** Mensagens no mesmo formato do evento `messages` (mais recentes primeiro). */
  messages: UazapiMessage[];
  hasMore: boolean;
}

/** Instancia como a Uazapi lista. O `token` e so do servidor: nunca sai nas respostas da API do CRM. */
export interface UazapiInstance {
  id: string;
  name: string;
  token: string;
  status: string;
  profileName: string;
  profilePicUrl: string;
}

export interface UazapiClient {
  /** Admin (header `admintoken`): `GET /instance/all`, todas as instancias do servidor. */
  listInstances(): Promise<UazapiInstance[]>;
  /** Admin: `POST /instance/create`. A instancia nasce desconectada. */
  createInstance(name: string): Promise<UazapiInstance>;
  /** `/message/find`: uma pagina de mensagens da instancia, para a reconciliacao (formato nao validado com a Uazapi real). */
  findMessages(input: { limit: number; offset: number }): Promise<FindMessagesPage>;
  getInstanceStatus(): Promise<InstanceStatus>;
  /** `/chat/details`: URL (temporaria) da foto de perfil do numero, ou null se ele nao tem foto (formato nao validado com a Uazapi real). */
  getAvatar(number: string): Promise<string | null>;
  /** Inicia o pareamento (QR code). `history_days: 0`: nao importa historico anterior a conexao. */
  connect(): Promise<InstanceStatus>;
  /** Cadastra o webhook da instancia: so os eventos que o CRM usa, sem grupos nem mensagens `fromMe`. */
  configureWebhook(url: string): Promise<void>;
  /** `/message/download`: pede o link do arquivo da mensagem (`id` = `message.id` do webhook). */
  downloadMedia(messageId: string): Promise<MediaDownload>;
  /** Abre o link do arquivo para leitura em stream. Nao envia o token da instancia: o host vem do corpo da resposta. */
  openFile(url: string): Promise<Response>;
  /** Envia texto. Lanca UazapiHttpError (recusa) ou UazapiTimeoutError (resultado incerto). */
  sendText(input: { number: string; text: string; replyId?: string }): Promise<SentText>;
  /** `/message/markread`: marca mensagens recebidas (`id` = `message.id` da Uazapi) como lidas no WhatsApp. */
  markRead(messageIds: string[]): Promise<void>;
  /** Envia midia por link (`/send/media`). `ptt` e nota de voz; `text` e a legenda; `replyId` cita uma mensagem. Mesmos erros de `sendText`. */
  sendMedia(input: {
    number: string;
    type: "image" | "video" | "document" | "ptt";
    file: string;
    text?: string;
    docName?: string;
    replyId?: string;
  }): Promise<SentText>;
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
  /** Tentativas extras apos `429` (padrao 3). */
  maxRetries?: number;
  /** Injetaveis para teste. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** `UAZAPI_ADMIN_TOKEN` so e preciso para `listInstances`/`createInstance`; o resto usa o token da instancia. */
type UazapiEnv = Pick<Cloudflare.Env, "UAZAPI_BASE_URL" | "UAZAPI_INSTANCE_TOKEN"> & { UAZAPI_TIMEOUT_MS?: string; UAZAPI_ADMIN_TOKEN?: string };

type Auth = "instance" | "admin" | "none";

const text = (v: unknown) => (typeof v === "string" ? v : "");

function toInstance(raw: unknown, fallbackToken = ""): UazapiInstance {
  const i = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: text(i.id),
    name: text(i.name),
    token: text(i.token) || fallbackToken,
    status: text(i.status),
    profileName: text(i.profileName),
    profilePicUrl: text(i.profilePicUrl),
  };
}

const BACKOFF_BASE_MS = 500;
/** Teto de espera por tentativa, para o envio nao estourar o tempo do request. */
const BACKOFF_MAX_MS = 10_000;

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function createUazapiClient(env: UazapiEnv, options: UazapiClientOptions = {}): UazapiClient {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? (Number(env.UAZAPI_TIMEOUT_MS) || 15_000);
  const maxRetries = options.maxRetries ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const baseUrl = env.UAZAPI_BASE_URL.replace(/\/+$/, "");

  /** Uma chamada HTTP; `429` repete com backoff. Timeout e demais erros propagam sem repetir. */
  async function request(path: string, init: RequestInit = {}, auth: Auth = "instance"): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestOnce(path, init, auth);
      } catch (err) {
        if (!(err instanceof UazapiHttpError) || err.status !== 429 || attempt >= maxRetries) throw err;
        // Retry-After e piso; jitter soma ate 25% (ou backoff exponencial com jitter total sem o header).
        const wait =
          err.retryAfterMs != null
            ? err.retryAfterMs * (1 + random() * 0.25)
            : BACKOFF_BASE_MS * 2 ** attempt * (0.5 + random() * 0.5);
        await sleep(Math.min(wait, BACKOFF_MAX_MS));
      }
    }
  }

  async function requestOnce(path: string, init: RequestInit, auth: Auth): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const credentials: Record<string, string> =
        auth === "instance"
          ? { token: env.UAZAPI_INSTANCE_TOKEN, accept: "application/json" }
          : auth === "admin"
            ? { admintoken: env.UAZAPI_ADMIN_TOKEN ?? "", accept: "application/json" }
            : {};
      const res = await doFetch(auth === "none" ? path : `${baseUrl}${path}`, {
        ...init,
        headers: { ...credentials, ...init.headers },
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

  /** POST de envio (texto ou midia): a resposta traz o id da mensagem. */
  async function postSend(path: string, payload: object): Promise<SentText> {
    const res = await postJson(path, payload);
    const body = (await res.json().catch(() => ({}))) as { id?: unknown; messageid?: unknown };
    return {
      id: typeof body.id === "string" ? body.id : null,
      messageId: typeof body.messageid === "string" ? body.messageid : null,
    };
  }

  return {
    async listInstances() {
      const body = await (await request("/instance/all", {}, "admin")).json();
      return (Array.isArray(body) ? body : []).map((raw) => toInstance(raw)).filter((i) => i.id);
    },
    async createInstance(name) {
      const res = await request(
        "/instance/create",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) },
        "admin",
      );
      const body = (await res.json()) as { instance?: unknown; token?: unknown };
      const instance = toInstance(body.instance, text(body.token));
      if (!instance.id || !instance.token) throw new Error("Uazapi nao devolveu a instancia criada");
      return instance;
    },
    async findMessages({ limit, offset }) {
      const res = await postJson("/message/find", { limit, offset });
      const body = (await res.json()) as { messages?: UazapiMessage[]; hasMore?: boolean };
      return { messages: Array.isArray(body.messages) ? body.messages : [], hasMore: body.hasMore === true };
    },
    async getInstanceStatus() {
      return readInstance(await request("/instance/status"));
    },
    async getAvatar(number) {
      const res = await postJson("/chat/details", { number, preview: false });
      const body = (await res.json().catch(() => ({}))) as { image?: unknown };
      return typeof body.image === "string" && body.image ? body.image : null;
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
    openFile: (url) => request(url, {}, "none"),
    async markRead(messageIds) {
      const res = await request("/message/markread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: messageIds }),
      });
      await res.body?.cancel();
    },
    sendText: ({ number, text, replyId }) => postSend("/send/text", { number, text, ...(replyId ? { replyid: replyId } : {}) }),
    sendMedia: ({ replyId, ...input }) => postSend("/send/media", { ...input, ...(replyId ? { replyid: replyId } : {}) }),
  };
}
