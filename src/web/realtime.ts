// Tempo real: um WebSocket com o hub da caixa de entrada, que se reconecta sozinho.
// Quem usa assina com `onRealtime`; ao reconectar, `reconnected` avisa para buscar pela API o que se perdeu.
import { useEffect } from "react";
import type { ConnectionState, Contact, Conversation, Message, Note, SendStatus, TimelineEvent } from "./api";

export type RealtimeEvent =
  | { type: "message.created"; conversation: Conversation; message: Message }
  | { type: "message.status"; conversationId: string; messageId: string; status: SendStatus }
  | { type: "conversation.updated"; conversation: Conversation; event?: TimelineEvent | null }
  | { type: "note.created"; conversationId: string; note: Note }
  | { type: "contact.updated"; contact: Contact }
  | { type: "labels.changed" }
  | { type: "funnel.changed"; funnelId: string }
  | { type: "connection.changed"; connection: ConnectionState }
  | { type: "workspace.changed"; companyName: string }
  | { type: "reconnected" };

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();
const emit = (event: RealtimeEvent) => listeners.forEach((l) => l(event));

/** Assina os eventos; devolve a função que cancela. */
export function onRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const PING_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 15_000;

// Fora do hook: se a área logada remonta, o novo socket ainda conta como reconexão e as telas buscam o que perderam no intervalo.
let everConnected = false;

/** Mantém a conexão aberta enquanto o componente estiver montado (use uma vez, na caixa de entrada). */
export function useRealtimeConnection() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let pongTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      clearInterval(ping);
      clearTimeout(pongTimer);
    };

    function scheduleReconnect() {
      if (stopped) return;
      clearTimeout(retry);
      retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS));
      attempt++;
    }

    function connect() {
      if (stopped || (ws && ws.readyState <= WebSocket.OPEN)) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${proto}://${location.host}/api/realtime`);
      ws = socket;
      socket.onopen = () => {
        attempt = 0;
        // Na primeira conexão a tela acabou de carregar; nas seguintes pode ter perdido eventos.
        if (everConnected) emit({ type: "reconnected" });
        everConnected = true;
        ping = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send("ping");
          pongTimer = setTimeout(() => socket.close(), PONG_TIMEOUT_MS); // sem resposta: conexão morta
        }, PING_MS);
      };
      socket.onmessage = (e) => {
        if (e.data === "pong") return clearTimeout(pongTimer);
        try {
          const event = JSON.parse(String(e.data)) as RealtimeEvent;
          if (["message.created", "message.status", "conversation.updated", "note.created", "contact.updated", "labels.changed", "funnel.changed", "connection.changed", "workspace.changed"].includes(event.type)) emit(event);
        } catch {
          // Mensagem desconhecida: ignora.
        }
      };
      socket.onclose = () => {
        clearTimers();
        if (ws === socket) ws = null;
        scheduleReconnect();
      };
    }

    // Internet voltou ou aba voltou ao primeiro plano: não espera o próximo retry.
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      if (ws && ws.readyState === WebSocket.OPEN) return;
      attempt = 0;
      clearTimeout(retry);
      connect();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimers();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      ws?.close();
    };
  }, []);
}
