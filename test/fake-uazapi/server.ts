/**
 * Uazapi FALSA: servidor HTTP (node:http) que GRAVA as chamadas recebidas e devolve respostas PROGRAMADAS.
 * Compartilhada pelos testes de borda (vitest, subida no globalSetup) e pelo E2E (Playwright).
 *
 * API de controle (prefixo /__fake, nunca colide com rotas da Uazapi):
 *   POST   /__fake/program   corpo: ProgramRule  -> programa respostas para method+path
 *   GET    /__fake/calls     -> RecordedCall[] (na ordem de chegada)
 *   POST   /__fake/reset     -> limpa chamadas e regras (volta aos defaults)
 *
 * Uma regra tem uma fila de respostas, consumidas em ordem; a ultima "gruda" (vale para as chamadas seguintes).
 * Cada resposta pode ter status, headers (ex.: Retry-After), body (objeto -> JSON) e delayMs (simula lentidao/timeout).
 * Chamada sem regra: 501 com JSON explicando (falha ruidosa, nunca silenciosa).
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface ProgrammedResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
}

export interface ProgramRule {
  method: string;
  /** Caminho exato (sem query), ex.: "/instance/status". */
  path: string;
  responses: ProgrammedResponse[];
}

export interface RecordedCall {
  method: string;
  path: string;
  query: string;
  /** Headers em minusculas (inclui `token`). */
  headers: Record<string, string>;
  body: unknown;
}

export interface FakeUazapi {
  url: string;
  port: number;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseBody(raw: string, contentType: string | undefined): unknown {
  if (!raw) return null;
  if (contentType?.includes("json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface StartOptions {
  port?: number;
  /** Regras iniciais, reaplicadas a cada /__fake/reset (E2E precisa de um status "connected" padrao). */
  defaults?: ProgramRule[];
}

export async function startFakeUazapi(options: StartOptions = {}): Promise<FakeUazapi> {
  let calls: RecordedCall[] = [];
  let rules = new Map<string, ProgrammedResponse[]>();
  const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`;
  const applyDefaults = () => {
    rules = new Map();
    for (const r of options.defaults ?? []) rules.set(key(r.method, r.path), [...r.responses]);
  };
  applyDefaults();

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const raw = await readBody(req);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/__fake/program" && req.method === "POST") {
      const rule = JSON.parse(raw) as ProgramRule;
      rules.set(key(rule.method, rule.path), [...rule.responses]);
      return json(200, { ok: true });
    }
    if (url.pathname === "/__fake/calls" && req.method === "GET") return json(200, calls);
    if (url.pathname === "/__fake/reset" && req.method === "POST") {
      calls = [];
      applyDefaults();
      return json(200, { ok: true });
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
    calls.push({
      method: req.method ?? "GET",
      path: url.pathname,
      query: url.search,
      headers,
      body: parseBody(raw, headers["content-type"]),
    });

    const queue = rules.get(key(req.method ?? "GET", url.pathname));
    if (!queue || queue.length === 0) {
      return json(501, { error: "fake-uazapi: nenhuma resposta programada", method: req.method, path: url.pathname });
    }
    const next = queue.length > 1 ? queue.shift()! : queue[0]!; // a ultima gruda
    if (next.delayMs) await sleep(next.delayMs);
    const body = next.body === undefined ? {} : next.body;
    res.writeHead(next.status ?? 200, { "content-type": "application/json", ...next.headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
