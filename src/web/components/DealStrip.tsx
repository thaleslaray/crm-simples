import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api, type Conversation, type ContactDeal } from "../api";
import { contactLabel, formatMoney } from "../format";
import { useFunnels } from "../funnels";
import { onRealtime } from "../realtime";
import { CloseDealDialog } from "./CloseDealDialog";
import { DealFields, draftToInput, emptyDraft } from "./DealFields";

type StripContact = Conversation["contact"];

/** Negócios abertos do contato, do mais antigo ao mais novo; busca de novo quando o funil muda. */
function useOpenDeals(contactId: string): ContactDeal[] | null {
  const [deals, setDeals] = useState<ContactDeal[] | null>(null);
  const load = useCallback(() => {
    api
      .ficha(contactId)
      .then((f) => setDeals(f.deals.filter((d) => d.status === "aberto")))
      .catch(() => undefined);
  }, [contactId]);
  useEffect(() => {
    setDeals(null);
    load();
    return onRealtime((e) => {
      if (e.type === "funnel.changed" || e.type === "reconnected") load();
    });
  }, [load]);
  return deals;
}

/**
 * Faixa discreta abaixo do cabeçalho da conversa: o negócio aberto mais recente do contato com Ganhou/Perdeu.
 * Com mais de um aberto mostra "+N" (abre a ficha); sem nenhum, só "+ Negócio".
 */
export function DealStrip({ contact, onOpenDeals }: { contact: StripContact; onOpenDeals: () => void }) {
  const deals = useOpenDeals(contact.id);
  const [closing, setClosing] = useState<"ganho" | "perdido" | null>(null);
  const [creating, setCreating] = useState(false);
  if (deals === null) return null;
  const current = deals.at(-1);
  const extra = deals.length - 1;

  return (
    <section className="deal-strip" aria-label="Negócio do contato">
      {current ? (
        <>
          <p className="deal-strip-text">
            {/* O nome do produto é o que encolhe: valor e etapa continuam à vista. */}
            <strong>{current.productName ?? "Sem produto"}</strong>
            {current.valueCents !== null && <span className="deal-strip-value">{` · ${formatMoney(current.valueCents)}`}</span>}
            <span className="deal-strip-stage">{` · ${current.stageName}`}</span>
          </p>
          {extra > 0 && (
            <button type="button" className="deal-strip-more" aria-label={`+${extra} negócios abertos: ver na ficha`} onClick={onOpenDeals}>
              +{extra}
            </button>
          )}
          <button type="button" className="deal-strip-btn" onClick={() => setClosing("ganho")}>
            Ganhou
          </button>
          <button type="button" className="deal-strip-btn" onClick={() => setClosing("perdido")}>
            Perdeu
          </button>
        </>
      ) : (
        <button type="button" className="deal-strip-btn" onClick={() => setCreating(true)}>
          + Negócio
        </button>
      )}
      {closing && current && (
        <CloseDealDialog
          funnelId={current.funnelId}
          dealId={current.id}
          kind={closing}
          subject={[current.productName, contactLabel(contact)].filter(Boolean).join(" · ")}
          initialValueCents={current.valueCents}
          onClose={() => setClosing(null)}
          onDone={() => setClosing(null)}
        />
      )}
      {creating && <NewDealDialog contact={contact} onClose={() => setCreating(false)} />}
    </section>
  );
}

/** Formulário de novo negócio com o contato da conversa já escolhido; só falta funil, etapa e, se quiser, produto, valor e origem. */
function NewDealDialog({ contact, onClose }: { contact: StripContact; onClose: () => void }) {
  const id = useId();
  const funnels = (useFunnels() ?? []).filter((f) => f.stages.length > 0);
  const [funnelId, setFunnelId] = useState("");
  const [stageId, setStageId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const box = useRef<HTMLFormElement>(null);

  const funnel = funnels.find((f) => f.id === funnelId) ?? funnels[0];
  const stage = funnel?.stages.find((s) => s.id === stageId)?.id ?? funnel?.stages[0]?.id;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!funnel || !stage || busy) return;
    setBusy(true);
    setError(false);
    try {
      await api.addDeal(funnel.id, contact.id, stage, draftToInput(draft));
      onClose();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={box} className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onSubmit={(e) => void submit(e)}>
        <h2 id={`${id}-title`}>Novo negócio</h2>
        <p className="muted">{contactLabel(contact)}</p>
        {funnels.length === 0 ? (
          <p className="muted">Crie um funil com etapas em Configurações para abrir negócios.</p>
        ) : (
          <>
            <label>
              Funil
              <select value={funnel?.id} onChange={(e) => (setFunnelId(e.target.value), setStageId(""))}>
                {funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etapa inicial
              <select value={stage} onChange={(e) => setStageId(e.target.value)}>
                {funnel?.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <DealFields draft={draft} onChange={setDraft} />
          </>
        )}
        {error && (
          <p className="error" role="alert">
            Não foi possível criar o negócio.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={!funnel || busy}>
            <Plus size={16} aria-hidden="true" /> Criar negócio
          </button>
        </div>
      </form>
    </div>
  );
}
