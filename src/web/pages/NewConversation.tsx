import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { normalizePhone } from "../../shared/phone";
import { api, type Conversation } from "../api";
import { contactLabel, formatPhone } from "../format";

type Target = { id: string; label: string };

/**
 * Nova conversa: escolhe um contato existente (busca) ou digita um número, escreve e envia.
 * Com `contact` (aberto pela ficha) o destinatário já vem fixo. Ao enviar, abre a conversa.
 */
export function NewConversationDialog({ contact, onClose }: { contact?: Target; onClose: () => void }) {
  const navigate = useNavigate();
  const id = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Target | null>(contact ?? null);
  const [found, setFound] = useState<Conversation[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => firstField.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Busca de contatos com espera de 250 ms depois da última tecla.
  useEffect(() => {
    const q = query.trim();
    if (chosen || !q) {
      setFound([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((r) => alive && setFound(r.contacts.slice(0, 5)))
        .catch(() => alive && setFound([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, chosen]);

  const typedPhone = normalizePhone(query);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!chosen && !typedPhone) {
      setError("Número inválido. Digite com DDD, por exemplo (11) 98888-7777.");
      return;
    }
    if (!text.trim()) {
      setError("Escreva a mensagem antes de enviar.");
      return;
    }
    setSending(true);
    try {
      const result = await api.startConversation(chosen ? { contactId: chosen.id, text } : { phone: query, text });
      onClose();
      navigate(`/conversas/${result.conversation.id}`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === "numero_invalido"
          ? "Número inválido. Digite com DDD, por exemplo (11) 98888-7777."
          : "Não foi possível iniciar a conversa. Tente de novo.",
      );
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onSubmit={(e) => void submit(e)}>
        <h2 id={`${id}-title`}>Nova conversa</h2>
        {chosen ? (
          <div className="chosen">
            <span>
              Para: <strong>{chosen.label}</strong>
            </span>
            {!contact && (
              <button type="button" className="secondary" onClick={() => setChosen(null)}>
                Trocar
              </button>
            )}
          </div>
        ) : (
          <>
            <label>
              Contato ou número
              <input
                ref={firstField as React.RefObject<HTMLInputElement>}
                type="search"
                inputMode="search"
                autoComplete="off"
                placeholder="Nome ou (11) 98888-7777"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {(found.length > 0 || typedPhone) && (
              <ul className="picker" aria-label="Sugestões">
                {found.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setChosen({ id: c.contact.id, label: contactLabel(c.contact) })}
                    >
                      {contactLabel(c.contact)}
                      {c.contact.name && c.contact.phone ? <span className="muted"> {formatPhone(c.contact.phone)}</span> : null}
                    </button>
                  </li>
                ))}
                {typedPhone && (
                  <li>
                    <span className="muted picker-note">Enviar para o número {formatPhone(typedPhone)}</span>
                  </li>
                )}
              </ul>
            )}
          </>
        )}
        <label>
          Mensagem
          <textarea
            ref={chosen ? (firstField as React.RefObject<HTMLTextAreaElement>) : undefined}
            rows={4}
            maxLength={4096}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={sending}>
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
