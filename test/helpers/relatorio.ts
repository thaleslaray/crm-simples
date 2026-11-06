import { env } from "cloudflare:workers";
import { api } from "./api";

// Relatorio de campanhas pela API e arrange de datas (o relatorio olha createdAt e closedAt, que a API grava com "agora").

export interface ReportRow {
  key: string;
  label: string;
  created: number;
  won: number;
  lost: number;
  revenueCents: number;
  conversion: number | null;
}
export interface ReportView {
  rows: ReportRow[];
  total: Omit<ReportRow, "key" | "label">;
}

export const report = (cookie: string, query: string) => api(`/api/reports/campaigns${query}`, { cookie });

export async function reportRows(cookie: string, from: number, to: number, product?: string): Promise<ReportView> {
  const res = await report(cookie, `?from=${from}&to=${to}${product ? `&product=${product}` : ""}`);
  return (await res.json()) as ReportView;
}

/** Ajusta as datas (e a situacao/valor) de um negocio ja criado pela API. */
export async function setDealDates(dealId: string, f: { createdAt?: number; closedAt?: number | null; status?: "aberto" | "ganho" | "perdido"; valueCents?: number }) {
  const sets: string[] = [];
  const args: unknown[] = [];
  const put = (col: string, v: unknown) => (sets.push(`${col} = ?`), args.push(v));
  if (f.createdAt !== undefined) put("created_at", f.createdAt);
  if (f.closedAt !== undefined) put("closed_at", f.closedAt);
  if (f.status !== undefined) put("status", f.status);
  if (f.valueCents !== undefined) put("value_cents", f.valueCents);
  await env.DB.prepare(`UPDATE deal SET ${sets.join(", ")} WHERE id = ?`).bind(...args, dealId).run();
}
