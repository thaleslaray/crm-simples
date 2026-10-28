import { DurableObject } from "cloudflare:workers";

/**
 * Hub da caixa de entrada: so tempo real (WebSockets dos membros, com Hibernation).
 * Esqueleto: aceita a conexao e ignora mensagens. Sem estado de negocio; broadcast vem em ticket futuro.
 * A sessao deve ser validada no Worker ANTES do upgrade (a rota que chama este DO faz isso).
 */
export class InboxHub extends DurableObject<Cloudflare.Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Esperado upgrade para WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server); // Hibernation API
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
    // Sem logica de negocio por enquanto.
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    ws.close(code, "fechado");
  }
}
