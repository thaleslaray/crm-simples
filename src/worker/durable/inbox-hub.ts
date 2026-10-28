import { DurableObject } from "cloudflare:workers";

/**
 * Hub da caixa de entrada: so tempo real (WebSockets dos membros, com Hibernation).
 * Sem estado de negocio: se hibernar ou reiniciar nada se perde, o cliente se ressincroniza pela API.
 * A sessao e validada no Worker ANTES do upgrade (a rota /api/realtime faz isso).
 */
export class InboxHub extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // O "ping" do cliente e respondido sem acordar o objeto.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Esperado upgrade para WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]); // Hibernation API
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Chamado pelo Worker (RPC): envia o evento a todos os WebSockets conectados. */
  publish(event: unknown): void {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Socket meio fechado: o cliente reconecta e se ressincroniza.
      }
    }
  }

  override webSocketMessage(): void {
    // O cliente so escuta; nada a fazer.
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    // 1005/1006 nao podem ser enviados num close frame.
    ws.close(code === 1005 || code === 1006 ? 1000 : code, "fechado");
  }
}
