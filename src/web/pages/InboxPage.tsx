import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useNavigate } from "react-router";
import { api, type Conversation } from "../api";
import { authClient } from "../auth-client";
import { contactLabel, initials, listTime, messagePreview } from "../format";
import { onRealtime } from "../realtime";

/** Caixa de entrada: lista à esquerda e conversa aberta à direita (no celular, uma tela de cada vez). */
export function InboxPage() {
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const detailOpen = useMatch("/conversas/:id") !== null;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);

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
          <span data-testid="user-name">{data?.user.name}</span>
          <button type="button" className="secondary" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>
      <div className="inbox-body">
        <nav className="conv-list" aria-label="Conversas">
          {failed && conversations === null ? (
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

/** Painel da direita no desktop quando nenhuma conversa está aberta. */
export function NoConversationSelected() {
  return (
    <div className="empty">
      <p>Selecione uma conversa</p>
    </div>
  );
}
