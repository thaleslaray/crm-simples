import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "./db";
import { publish } from "./realtime";
import { publishUpdate } from "./status";

/** `#` + codigo da campanha (`CUR-M01`), em qualquer ponto do texto, sem diferenciar maiusculas. */
const CODE_PATTERN = /#([A-Z]{3}-[A-Z]\d{2,})(?![A-Z0-9])/gi;

export function campaignCodes(text: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(CODE_PATTERN)].map((m) => m[1]!.toUpperCase());
}

/** Campanha ativa do primeiro codigo que existir no texto. */
async function findCampaign(db: Db, text: string | null) {
  for (const code of campaignCodes(text)) {
    const found = await db.query.campaign.findFirst({
      where: and(eq(schema.campaign.code, code), isNull(schema.campaign.archivedAt)),
    });
    if (found) return found;
  }
  return null;
}

/** Funil principal: o primeiro por ordem de criacao; a entrada e a 1a etapa dele. Sem etapa, nao ha onde criar. */
async function mainFunnelEntry(db: Db) {
  const funnels = await db.select().from(schema.funnel).orderBy(asc(schema.funnel.createdAt), sql`"funnel"."rowid"`);
  const first = funnels[0];
  if (!first) return null;
  const stage = await db.query.funnelStage.findFirst({
    where: eq(schema.funnelStage.funnelId, first.id),
    orderBy: asc(schema.funnelStage.position),
  });
  return stage ? { funnelId: first.id, stageId: stage.id } : null;
}

export interface CampaignHit {
  /** Funil onde nasceu um negocio (null quando so voltou). */
  funnelId: string | null;
  eventId: string | null;
}

/**
 * Chamada pelo ingest depois da mensagem gravada. Achou codigo de campanha ativa:
 * negocio aberto do mesmo produto -> so registra "voltou pela campanha"; senao cria o negocio no funil principal.
 * Idempotente pela mensagem de origem (`deal.sourceMessageId` e o evento sao unicos por mensagem).
 */
export async function applyCampaignCode(
  db: Db,
  input: { contactId: string; conversationId: string; messageId: string; text: string | null; timestamp: number },
): Promise<CampaignHit | null> {
  const campaign = await findCampaign(db, input.text);
  if (!campaign) return null;

  const open = await db.query.deal.findFirst({
    where: and(
      eq(schema.deal.contactId, input.contactId),
      eq(schema.deal.productId, campaign.productId),
      eq(schema.deal.status, "aberto"),
    ),
  });
  if (open) {
    const eventId = await recordCampaignEvent(db, input, campaign.name, "voltou");
    return { funnelId: null, eventId };
  }

  const entry = await mainFunnelEntry(db);
  if (!entry) return null;
  const product = await db.query.product.findFirst({ where: eq(schema.product.id, campaign.productId) });
  const stageCount = await db.$count(schema.deal, eq(schema.deal.stageId, entry.stageId));
  const created = await db
    .insert(schema.deal)
    .values({
      id: crypto.randomUUID(),
      contactId: input.contactId,
      funnelId: entry.funnelId,
      stageId: entry.stageId,
      position: stageCount,
      productId: campaign.productId,
      valueCents: product?.priceCents ?? null,
      originKind: "campanha",
      originCampaignId: campaign.id,
      sourceMessageId: input.messageId,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: schema.deal.sourceMessageId })
    .returning({ id: schema.deal.id });
  if (created.length === 0) return null;
  const eventId = await recordCampaignEvent(db, input, campaign.name, "criou");
  return { funnelId: entry.funnelId, eventId };
}

async function recordCampaignEvent(
  db: Db,
  input: { conversationId: string; messageId: string; timestamp: number },
  campaignName: string,
  action: "criou" | "voltou",
): Promise<string | null> {
  const id = crypto.randomUUID();
  const rows = await db
    .insert(schema.conversationEvent)
    .values({
      id,
      conversationId: input.conversationId,
      type: "campanha",
      actorId: null,
      campaignName,
      campaignAction: action,
      sourceMessageId: input.messageId,
      // Logo depois da mensagem que trouxe o codigo.
      timestamp: input.timestamp + 1,
    })
    .onConflictDoNothing()
    .returning({ id: schema.conversationEvent.id });
  return rows[0]?.id ?? null;
}

/** Avisa o hub: o quadro do funil (negocio novo) e a conversa com o evento da campanha. */
export async function publishCampaignHit(env: Cloudflare.Env, db: Db, conversationId: string, hit: CampaignHit | null): Promise<void> {
  if (!hit) return;
  if (hit.funnelId) await publish(env, { type: "funnel.changed", funnelId: hit.funnelId });
  if (hit.eventId) await publishUpdate(env, db, conversationId, hit.eventId);
}
