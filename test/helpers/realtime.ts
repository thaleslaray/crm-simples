import { api } from "./api";

export interface RealtimeConnection {
  /** Proximo evento (JSON) recebido; falha se nao chegar a tempo. */
  next(timeoutMs?: number): Promise<unknown>;
  /** Resolve com o codigo de fechamento quando o servidor fecha o socket; falha se continuar aberto. */
  closed(timeoutMs?: number): Promise<number>;
  close(): void;
}

/** Abre o WebSocket de tempo real como um cliente logado (upgrade pela borda do Worker). */
export async function connectRealtime(cookie: string): Promise<RealtimeConnection> {
  const res = await api("/api/realtime", { cookie, headers: { Upgrade: "websocket" } });
  if (res.status !== 101 || !res.webSocket) throw new Error(`upgrade recusado (${res.status})`);
  const ws = res.webSocket;
  const queue: unknown[] = [];
  let waiter: ((v: unknown) => void) | null = null;
  let closeCode: number | null = null;
  let onClosed: ((code: number) => void) | null = null;
  ws.accept();
  ws.addEventListener("close", (e) => {
    closeCode = e.code;
    onClosed?.(e.code);
  });
  ws.addEventListener("message", (e) => {
    const data: unknown = JSON.parse(String(e.data));
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(data);
    } else queue.push(data);
  });
  return {
    next(timeoutMs = 2000) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          waiter = null;
          reject(new Error("nenhum evento recebido"));
        }, timeoutMs);
        waiter = (v) => {
          clearTimeout(t);
          resolve(v);
        };
      });
    },
    closed(timeoutMs = 2000) {
      if (closeCode !== null) return Promise.resolve(closeCode);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          onClosed = null;
          reject(new Error("socket continua aberto"));
        }, timeoutMs);
        onClosed = (code) => {
          clearTimeout(t);
          resolve(code);
        };
      });
    },
    close: () => ws.close(1000, "fim do teste"),
  };
}
