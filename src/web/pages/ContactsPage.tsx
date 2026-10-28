import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type ContactRow } from "../api";
import { contactLabel, initials } from "../format";
import { LabelChip, useLabels } from "../labels";
import { onRealtime } from "../realtime";

/** Lista de contatos: busca por nome ou telefone e filtro por etiqueta (inclui quem não está na caixa de entrada). */
export function ContactsPage() {
  const labels = useLabels();
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

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Contatos</h1>
        <Link to="/">Voltar</Link>
      </header>
      <main className="contacts-page">
        <div className="contacts-filters">
          <input
            type="search"
            aria-label="Buscar contato"
            placeholder="Buscar por nome ou telefone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select aria-label="Filtrar por etiqueta" value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">Todas as etiquetas</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        {failed && rows === null ? (
          <p className="error" role="alert">
            Não foi possível carregar os contatos.
          </p>
        ) : rows === null ? (
          <p className="muted">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Nenhum contato encontrado.</p>
        ) : (
          <ul className="contact-list" aria-label="Contatos">
            {rows.map((c) => {
              const name = contactLabel(c);
              const body = (
                <>
                  <span className="avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="conv-main">
                    <span className="conv-name">{name}</span>
                    {c.phone && c.name?.trim() && <span className="muted">{c.phone}</span>}
                    {c.labels.length > 0 && (
                      <span className="chips" aria-label="Etiquetas">
                        {c.labels.map((l) => (
                          <LabelChip key={l.id} label={l} />
                        ))}
                      </span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={c.id}>
                  {c.conversationId ? (
                    <Link to={`/conversas/${c.conversationId}`} className="conv-item">
                      {body}
                    </Link>
                  ) : (
                    <div className="conv-item">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
