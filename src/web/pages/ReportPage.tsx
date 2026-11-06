import { useCallback, useEffect, useState } from "react";
import { api, type CampaignReport, type Product } from "../api";
import { authClient } from "../auth-client";
import { formatMoney } from "../format";
import { onRealtime } from "../realtime";

type Preset = "este" | "passado" | "custom";

const startOfMonth = (y: number, m: number) => new Date(y, m, 1, 0, 0, 0, 0).getTime();
const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 1, 0, 0, 0, 0).getTime() - 1;
/** `<input type="date">` ("2026-11-06") → início ou fim desse dia no fuso do navegador. */
const dayStart = (v: string) => new Date(`${v}T00:00:00`).getTime();
const dayEnd = (v: string) => new Date(`${v}T23:59:59.999`).getTime();
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Período em milissegundos (fuso do navegador) ou null se o personalizado estiver incompleto ou invertido. */
function period(preset: Preset, from: string, to: string, now = new Date()): { from: number; to: number } | null {
  const [y, m] = [now.getFullYear(), now.getMonth()];
  if (preset === "este") return { from: startOfMonth(y, m), to: endOfMonth(y, m) };
  if (preset === "passado") return { from: startOfMonth(y, m - 1), to: endOfMonth(y, m - 1) };
  if (!from || !to || dayStart(from) > dayEnd(to)) return null;
  return { from: dayStart(from), to: dayEnd(to) };
}

const percent = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

const PRESETS: { value: Preset; label: string }[] = [
  { value: "este", label: "Este mês" },
  { value: "passado", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

/** Relatório de campanhas (só admin; o servidor também barra): negócios criados, ganhos, perdidos, faturado e conversão por origem. */
export function ReportPage() {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const [preset, setPreset] = useState<Preset>("este");
  const [from, setFrom] = useState(() => isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [product, setProduct] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [error, setError] = useState(false);

  const range = period(preset, from, to);
  const start = range?.from;
  const end = range?.to;

  const load = useCallback(() => {
    if (start === undefined || end === undefined) return;
    api
      .campaignReport(start, end, product)
      .then((r) => (setReport(r), setError(false)))
      .catch(() => setError(true));
  }, [start, end, product]);

  useEffect(() => {
    api.products(true).then((r) => setProducts(r.products)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    return onRealtime((e) => {
      if (e.type === "funnel.changed" || e.type === "reconnected") load();
    });
  }, [load]);

  if (!isAdmin) return <p role="alert">Só o admin vê o relatório.</p>;

  return (
    <main className="profile report-page">
      <div className="report-filters">
        <div className="report-presets" role="group" aria-label="Período">
          {PRESETS.map((p) => (
            <button key={p.value} type="button" className="chip" aria-pressed={preset === p.value} onClick={() => setPreset(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="report-dates">
            <label>
              De
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
        <label>
          Produto
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Todos os produtos</option>
            <option value="none">Sem produto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archivedAt ? " (arquivado)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!range ? (
        <p className="muted" role="status">
          Escolha as duas datas, da mais antiga para a mais recente.
        </p>
      ) : error ? (
        <p className="error" role="alert">
          Não foi possível carregar o relatório.
        </p>
      ) : report === null ? (
        <p className="muted">Carregando…</p>
      ) : report.rows.length === 0 ? (
        <p className="muted" role="status">
          Nenhum negócio neste período
        </p>
      ) : (
        <div className="report-scroll" tabIndex={0} role="region" aria-label="Tabela do relatório">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Origem</th>
                <th scope="col">Criados</th>
                <th scope="col">Ganhos</th>
                <th scope="col">Perdidos</th>
                <th scope="col">Faturado</th>
                <th scope="col">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td data-label="Criados">{r.created}</td>
                  <td data-label="Ganhos">{r.won}</td>
                  <td data-label="Perdidos">{r.lost}</td>
                  <td data-label="Faturado">{formatMoney(r.revenueCents)}</td>
                  <td data-label="Conversão">{percent(r.conversion)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td data-label="Criados">{report.total.created}</td>
                <td data-label="Ganhos">{report.total.won}</td>
                <td data-label="Perdidos">{report.total.lost}</td>
                <td data-label="Faturado">{formatMoney(report.total.revenueCents)}</td>
                <td data-label="Conversão">{percent(report.total.conversion)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="muted report-note">Criados contam pela data de criação; ganhos, perdidos e faturado, pela data de fechamento.</p>
    </main>
  );
}
