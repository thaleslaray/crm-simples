import { errorName } from "./errors";

export const hub = (env: Cloudflare.Env) => env.INBOX_HUB.getByName("inbox");

/** Fecha os WebSockets de um membro (removido ou com a senha redefinida). Falha aqui nao desfaz a revogacao: a sessao ja foi apagada. */
export async function closeSocketsOf(env: Cloudflare.Env, userId: string): Promise<void> {
  try {
    await hub(env).closeUser(userId);
  } catch (err) {
    console.error("realtime: falha ao fechar sockets", { erro: errorName(err) });
  }
}

/** Fecha os WebSockets de uma sessao encerrada (logout); os de outras sessoes do mesmo membro seguem abertos. */
export async function closeSocketsOfSession(env: Cloudflare.Env, sessionId: string): Promise<void> {
  try {
    await hub(env).closeSession(sessionId);
  } catch (err) {
    console.error("realtime: falha ao fechar sockets da sessao", { erro: errorName(err) });
  }
}
