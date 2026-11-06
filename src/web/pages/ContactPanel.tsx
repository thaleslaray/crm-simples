import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ArrowLeft, SquareKanban, X } from "lucide-react";
import { api, type Contact, type DealStatus, type Ficha } from "../api";
import { DealFields, draftToInput, emptyDraft } from "../components/DealFields";
import { contactLabel, formatMoney, formatPhone, initials, messageTime } from "../format";
import { useFunnels } from "../funnels";
import { StatusPill } from "../components/StatusPill";
import { LabelChip, useLabels } from "../labels";
import { onRealtime } from "../realtime";
import { NewConversationDialog } from "./NewConversation";

const DEAL_STATUS_LABEL: Record<DealStatus, string> = { aberto: "Aberto", ganho: "Ganho", perdido: "Perdido" };

function dateTime(ts: number): string {
  return `${new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${messageTime(ts)}`;
}

/** Foto do contato; se a URL temporária já expirou, pede outra uma vez e cai nas iniciais se ainda assim falhar. */
function Photo({ contact, onRenewed }: { contact: Contact; onRenewed: (c: Contact) => void }) {
  const [broken, setBroken] = useState(false);
  const [retried, setRetried] = useState(false);
  useEffect(() => setBroken(false), [contact.avatarUrl]);
  const label = contactLabel(contact);
  if (!contact.avatarUrl || broken) return <span className="avatar avatar--big" aria-hidden="true">{initials(label)}</span>;
  return (
    <img
      className="avatar avatar--big"
      src={contact.avatarUrl}
      alt={`Foto de ${label}`}
      referrerPolicy="no-referrer"
      onError={() => {
        setBroken(true);
        if (retried) return;
        setRetried(true);
        api.refreshAvatar(contact.id).then((r) => onRenewed(r.contact)).catch(() => undefined);
      }}
    />
  );
}

/** Botão "Iniciar conversa" da ficha: abre o diálogo de nova conversa já com este contato. */
export function StartConversationButton({ contact }: { contact: Contact }) {
  const [starting, setStarting] = useState(false);
  return (
    <>
      <button type="button" className="ficha-start" onClick={() => setStarting(true)}>
        Iniciar conversa
      </button>
      {starting && <NewConversationDialog contact={{ id: contact.id, label: contactLabel(contact) }} onClose={() => setStarting(false)} />}
    </>
  );
}

interface ContactPanelProps {
  contactId: string;
  /** Mostra o botão de fechar (X no computador, seta de voltar no celular). Sem ele, a ficha é fixa na tela. */
  onClose?: () => void;
  /** Ação própria do lugar onde a ficha aparece (ex.: "Iniciar conversa", "Abrir conversa"), logo abaixo do telefone. */
  heroAction?: (contact: Contact) => ReactNode;
  className?: string;
}

/**
 * Ficha do contato ("Dados do contato"): foto, nome e telefone; Etiquetas; Negócios; Dados editáveis; Notas do contato.
 * Só depende do contato; o que é da conversa entra por props.
 */
export function ContactPanel({ contactId, onClose, heroAction, className }: ContactPanelProps) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", notes: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editingLabels, setEditingLabels] = useState(false);
  const allLabels = useLabels();
  const [labelError, setLabelError] = useState(false);
  const allFunnels = useFunnels();
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [pendingFunnel, setPendingFunnel] = useState("");
  const [pendingStage, setPendingStage] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [dealError, setDealError] = useState(false);

  const fill = (c: Contact) => setForm({ name: c.name ?? "", email: c.email ?? "", company: c.company ?? "", notes: c.notes ?? "" });

  const load = useCallback(() => {
    api
      .ficha(contactId)
      .then((f) => {
        setFicha(f);
        setFailed(false);
        // Não atropela o que o atendente está digitando.
        setDirty((d) => (d ? d : (fill(f.contact), false)));
      })
      .catch(() => setFailed(true));
  }, [contactId]);

  useEffect(() => {
    setFicha(null);
    setDirty(false);
    setSaved(false);
    setError(null);
    load();
    return onRealtime((event) => {
      if (event.type === "reconnected") return load();
      if (event.type === "note.created" || event.type === "funnel.changed") return load();
      if (event.type === "contact.updated" && event.contact.id === contactId) {
        setFicha((f) => (f ? { ...f, contact: { ...f.contact, ...event.contact } } : f));
        setDirty((d) => (d ? d : (fill(event.contact), false)));
      }
    });
  }, [contactId, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { contact } = await api.editContact(contactId, form);
      setFicha((f) => (f ? { ...f, contact } : f));
      fill(contact);
      setDirty(false);
      setSaved(true);
    } catch {
      setError("Não foi possível salvar. Confira o e-mail e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function changeLabel(action: () => Promise<{ contact: Contact }>) {
    setLabelError(false);
    try {
      const { contact } = await action();
      setFicha((f) => (f ? { ...f, contact: { ...f.contact, labels: contact.labels } } : f));
    } catch {
      setLabelError(true);
    }
  }

  async function changeDeal(action: () => Promise<unknown>) {
    setDealError(false);
    try {
      await action();
      load();
    } catch {
      setDealError(true);
    }
  }

  const funnelsWithStages = (allFunnels ?? []).filter((f) => f.stages.length > 0);
  const chosenFunnel = funnelsWithStages.find((f) => f.id === pendingFunnel) ?? funnelsWithStages[0];
  const chosenStage = chosenFunnel?.stages.find((st) => st.id === pendingStage)?.id ?? chosenFunnel?.stages[0]?.id;

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setDirty(true);
    setSaved(false);
  };

  return (
    <aside className={`ficha${className ? ` ${className}` : ""}`} aria-label="Ficha do contato">
      <header className="ficha-head">
        {onClose && (
          <button type="button" className="icon-btn ficha-close" aria-label="Fechar ficha" onClick={onClose}>
            <X size={22} aria-hidden="true" className="ficha-close-x" />
            <ArrowLeft size={22} aria-hidden="true" className="ficha-close-back" />
          </button>
        )}
        <h2>Dados do contato</h2>
      </header>
      {failed && !ficha && (
        <p className="error ficha-pad" role="alert">
          Não foi possível carregar a ficha.
        </p>
      )}
      {!ficha && !failed && <p className="muted ficha-pad">Carregando…</p>}
      {ficha && (
        <div className="ficha-body">
          <div className="ficha-hero">
            <Photo contact={ficha.contact} onRenewed={(c) => setFicha((f) => (f ? { ...f, contact: c } : f))} />
            <h3 className="ficha-name">{contactLabel(ficha.contact)}</h3>
            <p data-testid="ficha-phone">{ficha.contact.phone ? formatPhone(ficha.contact.phone) : "Sem telefone"}</p>
            {heroAction?.(ficha.contact)}
          </div>
          <section className="ficha-sec" aria-label="Etiquetas do contato">
            <h4>
              Etiquetas
              {ficha.contact.labels.length > 0 && (
                <button type="button" className="link-btn" aria-pressed={editingLabels} onClick={() => setEditingLabels((e) => !e)}>
                  {editingLabels ? "Pronto" : "Editar"}
                </button>
              )}
            </h4>
            <ul className="chips chips--edit">
              {ficha.contact.labels.map((l) => (
                <li key={l.id}>
                  <LabelChip label={l} />
                  {editingLabels && (
                    <button
                      type="button"
                      className="chip-remove"
                      aria-label={`Remover etiqueta ${l.name}`}
                      onClick={() => void changeLabel(() => api.removeLabel(contactId, l.id))}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {ficha.contact.labels.length === 0 && <p className="muted">Nenhuma etiqueta.</p>}
            {(() => {
              const free = allLabels.filter((l) => !ficha.contact.labels.some((x) => x.id === l.id));
              return free.length > 0 ? (
                <select
                  aria-label="Adicionar etiqueta"
                  value=""
                  onChange={(e) => e.target.value && void changeLabel(() => api.applyLabel(contactId, e.target.value))}
                >
                  <option value="">+ Adicionar etiqueta…</option>
                  {free.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              ) : allLabels.length === 0 ? (
                <p className="muted">O admin ainda não criou etiquetas.</p>
              ) : null;
            })()}
            {labelError && (
              <p className="error" role="alert">
                Não foi possível alterar a etiqueta.
              </p>
            )}
          </section>
          <section className="ficha-sec" aria-label="Negócios do contato">
            <h4>Negócios</h4>
            <ul className="ficha-list">
              {ficha.deals.map((d) => {
                const title = d.productName ?? "Sem produto";
                return (
                  <li key={d.id} className="ficha-funnel">
                    <span className="ficha-funnel-name">
                      <span className="ficha-funnel-ic" aria-hidden="true">
                        <SquareKanban size={18} />
                      </span>
                      <span className="ficha-deal-text">
                        <strong>
                          {title}
                          {d.valueCents !== null && ` · ${formatMoney(d.valueCents)}`}
                        </strong>
                        <span className="muted">
                          {d.funnelName} · {d.stageName} · {DEAL_STATUS_LABEL[d.status]}
                        </span>
                      </span>
                    </span>
                    {d.status === "aberto" && (
                      <div className="ficha-funnel-row">
                        <select
                          aria-label={`Etapa do negócio ${title} em ${d.funnelName}`}
                          value={d.stageId}
                          onChange={(e) => void changeDeal(() => api.moveDeal(d.funnelId, d.id, e.target.value))}
                        >
                          {(allFunnels?.find((x) => x.id === d.funnelId)?.stages ?? [{ id: d.stageId, name: d.stageName }]).map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {ficha.deals.length === 0 && <p className="muted">Nenhum negócio.</p>}
            {funnelsWithStages.length > 0 &&
              (newDealOpen ? (
                <form
                  className="ficha-deal-new"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chosenFunnel || !chosenStage) return;
                    void changeDeal(() => api.addDeal(chosenFunnel.id, contactId, chosenStage, draftToInput(draft))).then(() => (setNewDealOpen(false), setDraft(emptyDraft)));
                  }}
                >
                  <label>
                    Funil
                    <select value={chosenFunnel?.id} onChange={(e) => (setPendingFunnel(e.target.value), setPendingStage(""))}>
                      {funnelsWithStages.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Etapa inicial
                    <select value={chosenStage} onChange={(e) => setPendingStage(e.target.value)}>
                      {chosenFunnel?.stages.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <DealFields draft={draft} onChange={setDraft} />
                  <div className="qr-actions">
                    <button type="submit">Criar negócio</button>
                    <button type="button" className="secondary" onClick={() => setNewDealOpen(false)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="secondary" onClick={() => setNewDealOpen(true)}>
                  + Negócio
                </button>
              ))}
            {dealError && (
              <p className="error" role="alert">
                Não foi possível alterar o negócio.
              </p>
            )}
          </section>
          <section className="ficha-sec" aria-label="Dados">
          <h4>Dados</h4>
          <form className="ficha-form" onSubmit={(e) => void save(e)}>
            <label>
              Telefone
              <input value={ficha.contact.phone ? formatPhone(ficha.contact.phone) : ""} readOnly aria-readonly="true" />
            </label>
            <label>
              Nome
              <input value={form.name} onChange={set("name")} maxLength={200} autoComplete="off" />
            </label>
            <label>
              E-mail
              <input type="email" value={form.email} onChange={set("email")} maxLength={200} autoComplete="off" />
            </label>
            <label>
              Empresa
              <input value={form.company} onChange={set("company")} maxLength={200} autoComplete="off" />
            </label>
            <label>
              Observação
              <textarea value={form.notes} onChange={set("notes")} rows={3} maxLength={5000} />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="muted" role="status">
                Salvo.
              </p>
            )}
            <button type="submit" disabled={saving || !dirty}>
              Salvar
            </button>
          </form>
          </section>

          <section className="ficha-sec" aria-label="Histórico de conversas">
            <h4>Conversas</h4>
            <ul className="ficha-list">
              {ficha.conversations.map((c) => (
                <li key={c.id}>
                  <StatusPill status={c.status} />
                  <span className="muted">
                    Desde {new Date(c.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                    {c.assignees.length > 0 ? `Responsáveis: ${c.assignees.join(", ")}` : "Nunca teve responsável"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ficha-sec" aria-label="Notas do contato">
            <h4>Notas do contato</h4>
            {ficha.notes.length === 0 ? (
              <p className="muted">Nenhuma nota ainda.</p>
            ) : (
              <ul className="ficha-list">
                {[...ficha.notes].reverse().map((n) => (
                  <li key={n.id} className="ficha-note" data-testid="ficha-note">
                    <span>{n.text}</span>
                    <span className="muted">
                      {n.authorName ?? "Membro removido"} · {dateTime(n.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
