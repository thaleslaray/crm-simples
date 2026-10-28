import { env } from "cloudflare:workers";

/**
 * Grava `count` mensagens de texto de uma vez numa conversa existente (arrange de volume, sem passar pelo webhook).
 * O texto de cada uma e "mensagem numero <i> sobre pedido". Os gatilhos do indice de busca disparam como no uso real.
 */
export async function seedMessages(conversationId: string, count: number) {
  await env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?1)
     INSERT INTO message (id, external_id, conversation_id, direction, type, text, timestamp)
     SELECT 'seed-' || i, 'seed-' || i, ?2, 'in', 'text', 'mensagem numero ' || i || ' sobre pedido', 1600000000000 + i * 1000
       FROM n`,
  )
    .bind(count, conversationId)
    .run();
}
