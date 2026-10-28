import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate } from "react-router";
import { api, type Conversation, type SearchResults } from "../api";
import { authClient } from "../auth-client";
import { clearDrafts } from "../drafts";
import { contactLabel, initials, listTime, messagePreview } from "../format";
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

  const load = useCallback(() => {
    api
      .conversations()
      .then((r) => (setConversations(r.conversations), setFailed(false)))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    return onRealtime((event) => {
      if (event.type === "reconnected") return load(); // pode ter perdido eventos: busca a lista de novo
      if (event.type !== "message.created") return;
      // Mensagem nova: a conversa (nova ou existente) vai para o topo com a prévia atualizada.
      setConversations((list) => [event.conversation, ...(list ?? []).filter((c) => c.id !== event.conversation.id)]);
    });
  }, [load]);

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
          {(data?.user as { role?: string } | undefined)?.role === "admin" && (
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
          {query.trim() ? (
            <SearchPanel results={results} />
          ) : failed && conversations === null ? (
            <p className="empty" role="alert">
              Não foi possível carregar as conversas.
            </p>
          ) : conversations === null ? (
            <p className="empty">Carregando…</p>
          ) : conversations.length === 0 ? (
            <p className="empty">Nenhuma conversa ainda</p>
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
