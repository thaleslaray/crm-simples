import { DurableObject } from "cloudflare:workers";

/**
 * Hub da caixa de entrada: so tempo real (WebSockets dos membros, com Hibernation).
 * Sem estado de negocio: se hibernar ou reiniciar nada se perde, o cliente se ressincroniza pela API.
 * A sessao e validada no Worker ANTES do upgrade (a rota /api/realtime faz isso).
 */
/** Anexo do socket: de quem e, de qual sessao e ate quando ela vale. */
interface SocketOwner {
  userId: string | null;
  sessionId: string | null;
  expiresAt: number;
}

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
    // Dono e sessao do socket (o Worker poe os headers depois de validar a sessao), para fecha-lo se o acesso for revogado.
    const attachment: SocketOwner = {
      userId: request.headers.get("x-user-id"),
      sessionId: request.headers.get("x-session-id"),
      expiresAt: Number(request.headers.get("x-session-expires-at")) || 0,
    };
    pair[1].serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Chamado pelo Worker (RPC): envia o evento aos WebSockets com sessao ainda valida; fecha os de sessao vencida. */
  publish(event: unknown): void {
    const data = JSON.stringify(event);
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const owner = ws.deserializeAttachment() as SocketOwner | null;
        if (!owner || owner.expiresAt <= now) {
          ws.close(1008, "sessao vencida");
          continue;
        }
        ws.send(data);
      } catch {
        // Socket meio fechado: o cliente reconecta e se ressincroniza.
      }
    }
  }

  /** Chamado pelo Worker (RPC) quando o acesso de um membro acaba (removido, senha redefinida): fecha os sockets dele. */
  closeUser(userId: string): void {
    this.closeWhere((owner) => owner.userId === userId, "acesso revogado");
  }

  /** Chamado pelo Worker (RPC) quando uma sessao e encerrada: fecha so os sockets dela. */
  closeSession(sessionId: string): void {
    this.closeWhere((owner) => owner.sessionId === sessionId, "sessao encerrada");
  }

  private closeWhere(match: (owner: SocketOwner) => boolean, reason: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const owner = ws.deserializeAttachment() as SocketOwner | null;
      if (!owner || !match(owner)) continue;
      try {
        ws.close(1008, reason);
      } catch {
        // Ja fechado.
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
