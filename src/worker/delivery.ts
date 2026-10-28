import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "./db";
import { schema } from "./db";
import type { SendStatus } from "./db/schema";

/** Estado da Uazapi (`messages_update.state`, sem diferenciar caixa) -> nosso status. */
const STATE_TO_STATUS: Record<string, SendStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  played: "played",
  failed: "failed",
};

/**
 * De quais status cada um pode ser alcancado: so avanca (enviada -> entregue -> lida -> reproduzida), nunca regride.
 * "Falhou" so vale para o que ainda nao foi entregue.
 */
const CAN_COME_FROM: Record<SendStatus, SendStatus[]> = {
  sending: [],
  uncertain: [],
  sent: ["sending", "uncertain"],
  delivered: ["sending", "uncertain", "sent"],
  read: ["sending", "uncertain", "sent", "delivered"],
  played: ["sending", "uncertain", "sent", "delivered", "read"],
  failed: ["sending", "uncertain", "sent"],
};

export interface StatusChange {
  conversationId: string;
  messageId: string;
  status: SendStatus;
}

/**
 * Aplica um `messages_update`. `ids` sao `event.MessageIDs[]` (id do WhatsApp ou id da Uazapi); desconhecidos sao ignorados.
 * Devolve so as mensagens que de fato mudaram. (`event.Timestamp` vem em segundos e nao e usado: o horario da mensagem nao muda.)
 */
export async function applyStatusUpdate(db: Db, state: unknown, ids: unknown): Promise<StatusChange[]> {
  const status = typeof state === "string" ? STATE_TO_STATUS[state.toLowerCase()] : undefined;
  if (!status || !Array.isArray(ids)) return [];
  const known = ids.filter((id): id is string => typeof id === "string" && id !== "");
  if (known.length === 0) return [];
  const rows = await db
    .update(schema.message)
    .set({ status })
    .where(
      and(
        eq(schema.message.direction, "out"),
        or(inArray(schema.message.externalId, known), inArray(schema.message.whatsappMessageId, known)),
        inArray(schema.message.status, CAN_COME_FROM[status]),
      ),
    )
    .returning({ messageId: schema.message.id, conversationId: schema.message.conversationId });
  return rows.map((r) => ({ ...r, status }));
}
