import { useEffect, useState } from "react";
import { api, type Campaign, type DealInput, type OriginKind, type Product } from "../api";
import { centsFromInput, formatMoney } from "../format";
import { onRealtime } from "../realtime";

/** Origens que o atendente escolhe na mão. As campanhas ativas entram na lista como `campanha:<id>`. */
export const MANUAL_ORIGINS: { value: Exclude<OriginKind, "campanha">; label: string }[] = [
  { value: "indicacao", label: "Indicação" },
  { value: "organico", label: "Orgânico" },
  { value: "cliente_antigo", label: "Cliente antigo" },
  { value: "outro", label: "Outro" },
];

export const originLabel = (kind: OriginKind | null): string =>
  kind === "campanha" ? "Campanha" : (MANUAL_ORIGINS.find((o) => o.value === kind)?.label ?? "Sem origem");

const CAMPAIGN_PREFIX = "campanha:";

/** Campanhas ativas (lista de escolha da origem); busca de novo quando o admin mexe no cadastro. */
export function useActiveCampaigns(): Campaign[] {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    const load = () => api.campaigns().then((r) => setCampaigns(r.campaigns)).catch(() => undefined);
    void load();
    return onRealtime((e) => {
      if (e.type === "campaigns.changed" || e.type === "reconnected") void load();
    });
  }, []);
  return campaigns;
}

/** Produtos ativos (lista de escolha); busca de novo quando o admin mexe no cadastro. */
export function useActiveProducts(): Product[] {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    const load = () => api.products().then((r) => setProducts(r.products)).catch(() => undefined);
    void load();
    return onRealtime((e) => {
      if (e.type === "products.changed" || e.type === "reconnected") void load();
    });
  }, []);
  return products;
}

export type DealDraft = { productId: string; valueCents: number | null; originKind: string };
export const emptyDraft: DealDraft = { productId: "", valueCents: null, originKind: "" };

/** O que vai para a API: vazio vira `null`; produto sem valor digitado deixa o servidor usar o preço. */
export const draftToInput = (d: DealDraft): DealInput => {
  const campaign = d.originKind.startsWith(CAMPAIGN_PREFIX);
  return {
    productId: d.productId || null,
    ...(d.valueCents === null ? {} : { valueCents: d.valueCents }),
    originKind: campaign ? "campanha" : ((d.originKind || null) as OriginKind | null),
    ...(campaign ? { originCampaignId: d.originKind.slice(CAMPAIGN_PREFIX.length) } : {}),
  };
};

/** Produto, valor e origem do negócio. Escolher o produto pré-preenche o valor com o preço; o valor segue editável. */
export function DealFields(props: { draft: DealDraft; onChange: (d: DealDraft) => void }) {
  const products = useActiveProducts();
  const campaigns = useActiveCampaigns();
  const { draft, onChange } = props;
  return (
    <>
      <label>
        Produto
        <select
          value={draft.productId}
          onChange={(e) => {
            const product = products.find((p) => p.id === e.target.value);
            onChange({ ...draft, productId: e.target.value, valueCents: product ? product.priceCents : draft.valueCents });
          }}
        >
          <option value="">Sem produto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valor
        <input
          inputMode="numeric"
          value={draft.valueCents === null ? "" : formatMoney(draft.valueCents)}
          placeholder="R$ 0,00"
          onChange={(e) => onChange({ ...draft, valueCents: e.target.value.replace(/\D/g, "") ? centsFromInput(e.target.value) : null })}
        />
      </label>
      <label>
        Origem
        <select value={draft.originKind} onChange={(e) => onChange({ ...draft, originKind: e.target.value })}>
          <option value="">Sem origem</option>
          {campaigns.length > 0 && (
            <optgroup label="Campanhas">
              {campaigns.map((c) => (
                <option key={c.id} value={`${CAMPAIGN_PREFIX}${c.id}`}>
                  {c.name} ({c.code})
                </option>
              ))}
            </optgroup>
          )}
          {MANUAL_ORIGINS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
