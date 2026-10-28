import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Search } from "lucide-react";
import { api, type ContactRow } from "../api";
import { LabelTag } from "../components/LabelTag";
import { TwoColumnPage } from "../components/TwoColumnPage";
import { contactLabel, formatPhone, initials } from "../format";
import { useLabels } from "../labels";
import { onRealtime } from "../realtime";
import { ContactPanel, StartConversationButton } from "./ContactPanel";

const MAX_TAGS = 2;

/** Contatos em duas colunas: lista com busca e chips de etiqueta; a ficha do contato escolhido fica à direita. */
export function ContactsPage() {
  const labels = useLabels();
  const navigate = useNavigate();
  const { contactId } = useParams();
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = () =>
      api
        .contacts(query, label)
        .then((r) => alive && (setRows(r.contacts), setFailed(false)))
        .catch(() => alive && setFailed(true));
    const timer = setTimeout(run, 250);
    const off = onRealtime((e) => {
      if (e.type === "contact.updated" || e.type === "labels.changed" || e.type === "reconnected") void run();
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      off();
    };
  }, [query, label]);

  const list = (
    <section className="contacts-side" aria-label="Lista de contatos">
      <h1 className="two-col-title">Contatos</h1>
      <label className="search-pill">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="Buscar contato"
          placeholder="Buscar por nome ou telefone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chip-row" role="group" aria-label="Filtrar por etiqueta">
        <button type="button" className="chip" aria-pressed={label === ""} onClick={() => setLabel("")}>
          Todos
        </button>
        {labels.map((l) => (
          <button key={l.id} type="button" className="chip" aria-pressed={label === l.id} onClick={() => setLabel(l.id)}>
            <i className="chip-dot" style={{ background: l.color }} aria-hidden="true" />
            {l.name}
          </button>
        ))}
      </div>
      {failed && rows === null ? (
        <p className="error two-col-pad" role="alert">
          Não foi possível carregar os contatos.
        </p>
      ) : rows === null ? (
        <p className="muted two-col-pad">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="muted two-col-pad">Nenhum contato encontrado.</p>
      ) : (
        <ul className="contact-list" aria-label="Contatos">
          {rows.map((c) => {
            const name = contactLabel(c);
            return (
              <li key={c.id}>
                <Link to={`/contatos/${c.id}`} className={`contact-row${c.id === contactId ? " active" : ""}`} aria-current={c.id === contactId ? "page" : undefined}>
                  <span className="avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="conv-main">
                    <span className="conv-name">{name}</span>
                    {c.phone && c.name?.trim() && <span className="muted">{formatPhone(c.phone)}</span>}
                    {c.labels.length > 0 && (
                      <span className="contact-tags" aria-label="Etiquetas">
                        {c.labels.slice(0, MAX_TAGS).map((l) => (
                          <LabelTag key={l.id} label={l} />
                        ))}
                        {c.labels.length > MAX_TAGS && <span className="label-tag label-tag--more">+{c.labels.length - MAX_TAGS}</span>}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const detail = contactId ? (
    <ContactPanel
      key={contactId}
      contactId={contactId}
      className="ficha--page"
      onClose={() => navigate("/contatos")}
      heroAction={(contact) => {
        const conversationId = rows?.find((r) => r.id === contact.id)?.conversationId;
        return conversationId ? (
          <Link to={`/conversas/${conversationId}`} className="btn-link ficha-start">
            Abrir conversa
          </Link>
        ) : (
          <StartConversationButton contact={contact} />
        );
      }}
    />
  ) : (
    <p className="two-col-empty">Escolha um contato para ver a ficha.</p>
  );

  return <TwoColumnPage list={list} detail={detail} hasDetail={Boolean(contactId)} />;
}
