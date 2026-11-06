import { useEffect, useId, useRef, useState } from "react";
import { api, type DealCloseInput, type LostReason } from "../api";
import { centsFromInput, formatMoney } from "../format";

export const LOST_REASON_OPTIONS: { value: LostReason; label: string }[] = [
  { value: "preco", label: "Preço" },
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "comprou_de_outro", label: "Comprou de outro" },
  { value: "sem_interesse", label: "Sem interesse agora" },
  { value: "sem_perfil", label: "Sem perfil" },
  { value: "outro", label: "Outro" },
];

export const lostReasonLabel = (r: LostReason | null): string => LOST_REASON_OPTIONS.find((o) => o.value === r)?.label ?? "";

export const MAX_LOST_NOTE = 500;

/**
 * Diálogo de fechar o negócio. Ganhou: confirma o valor (pré-preenchido, editável, maior que zero).
 * Perdeu: escolhe o motivo e, se quiser, escreve uma observação. Esc, o fundo e Cancelar fecham; o foco volta para quem abriu.
 */
export function CloseDealDialog(props: {
  funnelId: string;
  dealId: string;
  kind: "ganho" | "perdido";
  /** Nome do cliente ou do produto, para o título. */
  subject: string;
  initialValueCents: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { kind } = props;
  const id = useId();
  const [value, setValue] = useState<number | null>(props.initialValueCents && props.initialValueCents > 0 ? props.initialValueCents : null);
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const firstField = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const box = useRef<HTMLFormElement>(null);
  const { onClose } = props;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstField.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>("input, select, textarea, button:not([disabled])")];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = kind === "ganho" ? value !== null && value > 0 : reason !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(false);
    const input: DealCloseInput =
      kind === "ganho" ? { status: "ganho", valueCents: value! } : { status: "perdido", lostReason: reason as LostReason, ...(note.trim() ? { lostNote: note.trim() } : {}) };
    try {
      await api.closeDeal(props.funnelId, props.dealId, input);
      props.onDone();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={box} className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onSubmit={(e) => void submit(e)}>
        <h2 id={`${id}-title`}>{kind === "ganho" ? "Negócio ganho" : "Negócio perdido"}</h2>
        <p className="muted">{props.subject}</p>
        {kind === "ganho" ? (
          <label>
            Valor fechado
            <input
              ref={firstField}
              inputMode="numeric"
              required
              value={value === null ? "" : formatMoney(value)}
              placeholder="R$ 0,00"
              onChange={(e) => setValue(e.target.value.replace(/\D/g, "") ? centsFromInput(e.target.value) : null)}
            />
          </label>
        ) : (
          <>
            <label>
              Motivo
              <select ref={firstField} required value={reason} onChange={(e) => setReason(e.target.value as LostReason | "")}>
                <option value="">Escolha o motivo</option>
                {LOST_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observação (opcional)
              <textarea rows={3} maxLength={MAX_LOST_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            Não foi possível fechar o negócio.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={!valid || busy}>
            {kind === "ganho" ? "Confirmar ganho" : "Confirmar perda"}
          </button>
        </div>
      </form>
    </div>
  );
}
