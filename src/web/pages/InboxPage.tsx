import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate } from "react-router";
import { api, type Conversation, type InboxFilter, type Member, type SearchResults } from "../api";
import { authClient } from "../auth-client";
import { clearDrafts } from "../drafts";
import { contactLabel, initials, listTime, messagePreview, STATUS_LABEL } from "../format";
import { LabelChip, useLabels } from "../labels";
import { onRealtime } from "../realtime";

/** Caixa de entrada: lista à esquerda e conversa aberta à direita (no celular, uma tela de cada vez). */
export function InboxPage() {
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const detailOpen = useMatch("/conversas/:id") !== null;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const results = useSearch(query);
  const [filter, setFilter] = useState<InboxFilter>({ status: "", assignee: "", label: "" });
  const labels = useLabels();
  const [members, setMembers] = useState<Member[]>([]);
  const me = data?.user.id;

  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    api.members().then((r) => setMembers(r.members)).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    api
      .conversations(filter)
      .then((r) => (setConversations(r.conversations), setFailed(false)))
      .catch(() => setFailed(true));
  }, [filter]);

  useEffect(() => {
    load();
    const matches = (c: Conversation) =>
      (!filter.status || c.status === filter.status) &&
      (!filter.label || c.contact.labels.some((l) => l.id === filter.label)) &&
      (!filter.assignee ||
        (filter.assignee === "none" ? c.assigneeId === null : c.assigneeId === (filter.assignee === "me" ? me : filter.assignee)));
    return onRealtime((event) => {
      // Pode ter perdido eventos (ou uma etiqueta mudou/foi apagada): busca a lista de novo.
      if (event.type === "reconnected" || event.type === "labels.changed") return load();
      if (event.type !== "message.created" && event.type !== "conversation.updated") return;
      const next = event.conversation;
      if (event.type === "message.created") {
        // Mensagem nova: a conversa (nova ou existente) vai para o topo com a prévia atualizada, se passa no filtro.
        setConversations((list) => {
          const rest = (list ?? []).filter((c) => c.id !== next.id);
          return matches(next) ? [next, ...rest] : rest;
        });
        return;
      }
      // Status ou responsável mudou: troca no lugar; se passou a casar com o filtro e não estava na lista, busca de novo.
      setConversations((list) => {
        const has = (list ?? []).some((c) => c.id === next.id);
        if (!has) {
          if (matches(next)) load();
          return list;
        }
        return (list ?? []).flatMap((c) => (c.id !== next.id ? [c] : matches(next) ? [next] : []));
      });
    });
  }, [load, filter, me]);

  async function signOut() {
    clearDrafts();
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`shell inbox${detailOpen ? " inbox--detail" : ""}`}>
      <header className="topbar">
        <h1>Caixa de entrada</h1>
        <div className="user">
          <Link to="/contatos">Contatos</Link>
          {isAdmin && <Link to="/etiquetas">Etiquetas</Link>}
          {isAdmin && <Link to="/respostas-rapidas">Respostas rápidas</Link>}
          {isAdmin && <Link to="/equipe">Equipe</Link>}
          {isAdmin && (
            <Link to="/conexao" className="link">
              Conexão
            </Link>
          )}
          <Link to="/perfil" data-testid="user-name">
            {data?.user.name}
          </Link>
          <button type="button" className="secondary" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>
      <div className="inbox-body">
        <nav className="conv-list" aria-label="Conversas">
          <div className="search-box">
            <input
              type="search"
              aria-label="Buscar"
              placeholder="Buscar por nome, telefone ou mensagem"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filters">
            <select
              aria-label="Filtrar por status"
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as InboxFilter["status"] }))}
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por responsável"
              value={filter.assignee}
              onChange={(e) => setFilter((f) => ({ ...f, assignee: e.target.value }))}
            >
              <option value="">Todos os responsáveis</option>
              <option value="me">Minhas</option>
              <option value="none">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select aria-label="Filtrar por etiqueta" value={filter.label} onChange={(e) => setFilter((f) => ({ ...f, label: e.target.value }))}>
              <option value="">Todas as etiquetas</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          {query.trim() ? (
            <SearchPanel results={results} />
          ) : failed && conversations === null ? (
            <p className="empty" role="alert">
              Não foi possível carregar as conversas.
            </p>
          ) : conversations === null ? (
            <p className="empty">Carregando…</p>
          ) : conversations.length === 0 ? (
            <p className="empty">{filter.status || filter.assignee || filter.label ? "Nenhuma conversa neste filtro" : "Nenhuma conversa ainda"}</p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id}>
                  <ConversationItem conversation={c} />
                </li>
              ))}
            </ul>
          )}
        </nav>
        <section className="conv-pane">
          <Outlet />
        </section>
      </div>
    </div>
  );
}

function ConversationItem({ conversation: c }: { conversation: Conversation }) {
  const label = contactLabel(c.contact);
  return (
    <NavLink to={`/conversas/${c.id}`} className="conv-item">
      <span className="avatar" aria-hidden="true">
        {initials(label)}
      </span>
      <span className="conv-main">
        <span className="conv-row">
          <span className="conv-name">{label}</span>
          {c.lastMessage && (
            <time className="conv-time" dateTime={new Date(c.lastMessage.timestamp).toISOString()}>
              {listTime(c.lastMessage.timestamp)}
            </time>
          )}
        </span>
        <span className={`conv-preview${c.lastMessage?.type === "unsupported" ? " is-unsupported" : ""}`}>
          {c.lastMessage ? messagePreview(c.lastMessage.type, c.lastMessage.text) : ""}
        </span>
        <span className="conv-meta">
          <span className={`badge badge--${c.status}`}>{STATUS_LABEL[c.status]}</span>
          <span className="conv-assignee">{c.assigneeName ?? "Sem responsável"}</span>
        </span>
        {c.contact.labels.length > 0 && (
          <span className="chips" aria-label="Etiquetas">
            {c.contact.labels.map((l) => (
              <LabelChip key={l.id} label={l} />
            ))}
          </span>
        )}
        {c.unreadCount > 0 && (
          <span className="unread-badge" aria-label={`${c.unreadCount} não lida${c.unreadCount > 1 ? "s" : ""}`}>
            {c.unreadCount > 99 ? "99+" : c.unreadCount}
          </span>
        )}
      </span>
    </NavLink>
  );
}

/** Busca com espera de 250 ms depois da última tecla; ignora respostas de buscas já superadas. */
function useSearch(query: string): SearchResults | "error" | null {
  const [results, setResults] = useState<SearchResults | "error" | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults("error"));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);
  return results;
}

/** Trecho do FTS com o termo entre \u0001 e \u0002, sem HTML: vira <mark>. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split("\u0001").map((part, i) => {
        if (i === 0) return part;
        const [hit, rest = ""] = part.split("\u0002");
        return (
          <Fragment key={i}>
            <mark>{hit}</mark>
            {rest}
          </Fragment>
        );
      })}
    </>
  );
}

function SearchPanel({ results }: { results: SearchResults | "error" | null }) {
  if (results === null) return <p className="empty">Buscando…</p>;
  if (results === "error")
    return (
      <p className="empty" role="alert">
        Não foi possível buscar.
      </p>
    );
  if (results.contacts.length === 0 && results.messages.length === 0) return <p className="empty">Nada encontrado</p>;
  return (
    <div className="search-results">
      {results.contacts.length > 0 && (
        <section aria-label="Contatos">
          <h2 className="search-heading">Contatos</h2>
          <ul>
            {results.contacts.map((c) => (
              <li key={c.id}>
                <ConversationItem conversation={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {results.messages.length > 0 && (
        <section aria-label="Mensagens">
          <h2 className="search-heading">Mensagens</h2>
          <ul>
            {results.messages.map((m) => (
              <li key={m.messageId}>
                <Link to={`/conversas/${m.conversationId}?m=${encodeURIComponent(m.messageId)}`} className="conv-item">
                  <span className="avatar" aria-hidden="true">
                    {initials(contactLabel(m.contact))}
                  </span>
                  <span className="conv-main">
                    <span className="conv-row">
                      <span className="conv-name">{contactLabel(m.contact)}</span>
                      <time className="conv-time" dateTime={new Date(m.timestamp).toISOString()}>
                        {listTime(m.timestamp)}
                      </time>
                    </span>
                    <span className="conv-preview">
                      <Snippet text={m.snippet} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Painel da direita no desktop quando nenhuma conversa está aberta. */
export function NoConversationSelected() {
  return (
    <div className="empty">
      <p>Selecione uma conversa</p>
    </div>
  );
}
