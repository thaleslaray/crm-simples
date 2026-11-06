import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { type AppEnv, requireAuth, requireRole } from "./middleware";

export type ReportRow = {
  key: string;
  label: string;
  created: number;
  won: number;
  lost: number;
  revenueCents: number;
  conversion: number | null;
};
export type CampaignReport = { rows: ReportRow[]; total: Omit<ReportRow, "key" | "label"> };

const FIXED_LABEL: Record<string, string> = { indicacao: "Indicação", organico: "Orgânico", cliente_antigo: "Cliente antigo", outro: "Outro" };
const FIXED_ORDER = Object.keys(FIXED_LABEL);
/** Campanhas primeiro (por nome), depois as origens fixas na ordem da tela, "Sem origem" por último. */
const rank = (r: ReportRow) => (r.key.startsWith("campanha:") ? 0 : r.key === "sem_origem" ? 99 : 1 + FIXED_ORDER.indexOf(r.key));

const isMs = (v: string | undefined): v is string => v !== undefined && /^\d{1,15}$/.test(v);

/** Relatórios: só admin (o papel é relido no D1 pelo `requireRole`). */
export const reports = new Hono<AppEnv>();

reports.get("/campaigns", requireAuth, requireRole("admin"), async (c) => {
  const { from, to, product } = c.req.query();
  if (!isMs(from) || !isMs(to) || Number(from) > Number(to)) return c.json({ error: "periodo_invalido" }, 400);
  // `none` = negócios sem produto; outro valor = id do produto (arquivado também); ausente = todos.
  const byProduct = product === undefined || product === "" ? sql`1 = 1` : product === "none" ? sql`${schema.deal.productId} is null` : sql`${schema.deal.productId} = ${product}`;
  const [start, end] = [Number(from), Number(to)];
  const d = schema.deal;
  const created = sql<number>`coalesce(sum(${d.createdAt} between ${start} and ${end}), 0)`;
  const won = sql<number>`coalesce(sum(${d.status} = 'ganho' and ${d.closedAt} between ${start} and ${end}), 0)`;
  const lost = sql<number>`coalesce(sum(${d.status} = 'perdido' and ${d.closedAt} between ${start} and ${end}), 0)`;
  const revenue = sql<number>`coalesce(sum(case when ${d.status} = 'ganho' and ${d.closedAt} between ${start} and ${end} then ${d.valueCents} else 0 end), 0)`;
  const found = await createDb(c.env.DB)
    .select({ kind: d.originKind, campaignId: d.originCampaignId, name: schema.campaign.name, created, won, lost, revenueCents: revenue })
    .from(d)
    .leftJoin(schema.campaign, sql`${schema.campaign.id} = ${d.originCampaignId}`)
    .where(sql`(${d.createdAt} between ${start} and ${end} or ${d.closedAt} between ${start} and ${end}) and ${byProduct}`)
    .groupBy(d.originKind, d.originCampaignId);
  const rows: ReportRow[] = found
    .map((r): ReportRow => {
      // Campanha sem nome achado (id solto) cai em "Sem origem", como negocio sem origem.
      const camp = r.kind === "campanha" && r.campaignId && r.name !== null;
      const fixed = !camp && r.kind && r.kind !== "campanha" ? r.kind : null;
      const key = camp ? `campanha:${r.campaignId}` : (fixed ?? "sem_origem");
      const label = camp ? r.name! : fixed ? (FIXED_LABEL[fixed] ?? fixed) : "Sem origem";
      return { key, label, created: r.created, won: r.won, lost: r.lost, revenueCents: r.revenueCents, conversion: null };
    })
    .reduce<ReportRow[]>((acc, r) => {
      const same = acc.find((x) => x.key === r.key);
      if (!same) return [...acc, r];
      same.created += r.created;
      same.won += r.won;
      same.lost += r.lost;
      same.revenueCents += r.revenueCents;
      return acc;
    }, [])
    .filter((r) => r.created + r.won + r.lost + r.revenueCents > 0)
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "pt-BR"));
  for (const r of rows) r.conversion = r.created === 0 ? null : r.won / r.created;
  const sum = (f: (r: ReportRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const [tc, tw] = [sum((r) => r.created), sum((r) => r.won)];
  const report: CampaignReport = {
    rows,
    total: { created: tc, won: tw, lost: sum((r) => r.lost), revenueCents: sum((r) => r.revenueCents), conversion: tc === 0 ? null : tw / tc },
  };
  return c.json(report);
});
