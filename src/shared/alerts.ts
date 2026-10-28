/** Parte do evento de tempo real que decide o aviso (o worker e o front compartilham o formato). */
export type AlertableEvent = {
  type: string;
  conversation?: { assigneeId: string | null };
  message?: { direction: "in" | "out" | string };
};

/**
 * Som e notificacao: so para mensagem do cliente. Conversa sem responsavel avisa todos;
 * com responsavel, so ele.
 */
export function shouldAlert(event: AlertableEvent, userId: string): boolean {
  if (event.type !== "message.created" || event.message?.direction !== "in" || !event.conversation) return false;
  const { assigneeId } = event.conversation;
  return assigneeId === null || assigneeId === userId;
}
