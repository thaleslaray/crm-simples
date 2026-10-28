import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";
import {
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  MessagesSquare,
  Plus,
  Search,
} from "lucide-react";
import {
  api,
  type Conversation,
  type Member,
  type SearchResults,
} from "../api";
import { authClient } from "../auth-client";
import { clearDrafts } from "../drafts";
import { contactLabel, initials, listTime, messagePreview } from "../format";
import { useLabels } from "../labels";
import { ContactAvatar } from "../components/ContactAvatar";
import {
  FilterChips,
  isUnowned,
  NO_EXTRA,
  type Chip,
  type Extra,
} from "../components/InboxFilters";
import { LabelTag } from "../components/LabelTag";
import { StatusPill } from "../components/StatusPill";
import { UserMenu } from "../components/UserMenu";
import { onRealtime } from "../realtime";
import { useCompanyName } from "../workspace";
import { NewConversationDialog } from "./NewConversation";

/** Conversas sem filtro nenhum: de onde saem as contagens dos chips. */
function useAllConversations(): Conversation[] {
  const [all, setAll] = useState<Conversation[]>([]);
  const { pathname } = useLocation();
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api
        .conversations()
        .then((r) => alive && setAll(r.conversations))
        .catch(() => undefined);
    const soon = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(load, ms);
    };
    soon(0);
    const off = onRealtime((e) => {
      if (
        [
          "message.created",
          "conversation.updated",
          "reconnected",
          "labels.changed",
        ].includes(e.type)
      )
        soon(200);
    });
    // Abrir ou sair de uma conversa marca como lida.
    const settle = setTimeout(load, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(settle);
      off();
    };
  }, [pathname]);
  return all;
}

/** Caixa de entrada: lista à esquerda e conversa aberta à direita (no celular, uma tela de cada vez). */
export function InboxPage() {
  const companyName = useCompanyName();
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const detailOpen = useMatch("/conversas/:id") !== null;
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const results = useSearch(query);
  const [chip, setChip] = useState<Chip>("tudo");
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const labels = useLabels();
  const [members, setMembers] = useState<Member[]>([]);
  const all = useAllConversations();
  const me = data?.user.id;

  useEffect(() => {
    api
      .members()
      .then((r) => setMembers(r.members))
      .catch(() => undefined);
  }, []);

  // O que vai para a API: o chip escolhe o responsável, a menos que o ▾ tenha escolhido um.
  const fStatus = extra.status;
  const fAssignee =
    chip === "minhas" ? "me" : chip === "semdono" ? "none" : extra.assignee;
  const fLabel = extra.label;

  const load = useCallback(() => {
    api
      .conversations({ status: fStatus, assignee: fAssignee, label: fLabel })
      .then((r) => (setConversations(r.conversations), setFailed(false)))
      .catch(() => setFailed(true));
  }, [fStatus, fAssignee, fLabel]);

  useEffect(() => {
    load();
    const matches = (c: Conversation) =>
      (!fStatus || c.status === fStatus) &&
      (!fLabel || c.contact.labels.some((l) => l.id === fLabel)) &&
      (!fAssignee ||
        (fAssignee === "none"
          ? c.assigneeId === null
          : c.assigneeId === (fAssignee === "me" ? me : fAssignee)));
    return onRealtime((event) => {
      // Pode ter perdido eventos (ou uma etiqueta mudou/foi apagada): busca a lista de novo.
      if (
        event.type === "reconnected" ||
        event.type === "labels.changed" ||
        event.type === "message.status"
      )
        return load();
      if (
        event.type !== "message.created" &&
        event.type !== "conversation.updated"
      )
        return;
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
        return (list ?? []).flatMap((c) =>
          c.id !== next.id ? [c] : matches(next) ? [next] : [],
        );
      });
    });
  }, [load, fStatus, fAssignee, fLabel, me]);

  async function signOut() {
    clearDrafts();
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  // "Sem dono" e "Não lidas" refinam, no cliente, o que a API devolveu.
  const visible = (conversations ?? []).filter((c) =>
    chip === "semdono"
      ? isUnowned(c)
      : chip === "naolidas"
        ? c.unreadCount > 0
        : true,
  );
  const filtered =
    chip !== "tudo" ||
    extra.status !== "" ||
    extra.assignee !== "" ||
    extra.label !== "";

  const pick = (next: Chip) => {
    setChip(next);
    // Minhas e Sem dono escolhem o responsável: soltam o responsável do ▾.
    // Sem dono exclui as resolvidas: solta também o status Resolvidas.
    if (next === "minhas" || next === "semdono")
      setExtra((e) => ({
        ...e,
        assignee: "",
        status: next === "semdono" && e.status === "resolvida" ? "" : e.status,
      }));
  };

  // Escolhas do ▾ que contradizem o chip (responsável diferente do chip, Resolvidas com Sem dono) devolvem o chip para Tudo.
  const changeExtra = (fn: (e: Extra) => Extra) => {
    const next = fn(extra);
    setExtra(next);
    const clashes =
      (next.assignee !== "" && (chip === "minhas" || chip === "semdono")) ||
      (next.status === "resolvida" && chip === "semdono");
    if (clashes) setChip("tudo");
  };

  return (
    <div className={`shell inbox${detailOpen ? " inbox--detail" : ""}`}>
      <div className="inbox-body">
        <nav className="conv-list" aria-label="Conversas">
          <div className="side-head">
            <h1>{companyName}</h1>
            <UserMenu name={data?.user.name ?? ""} onSignOut={signOut} />
            <button
              type="button"
              className="fab"
              aria-label="Nova conversa"
              onClick={() => setNewOpen(true)}
            >
              <Plus size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <label className="search-pill">
            <Search size={18} strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar"
              placeholder="Pesquisar nome, telefone ou mensagem"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <FilterChips
            chip={chip}
            onChip={pick}
            extra={extra}
            onExtra={changeExtra}
            all={all}
            members={members}
            labels={labels}
          />
          <div className="conv-scroll">
            {query.trim() ? (
              <SearchPanel results={results} me={me} />
            ) : failed && conversations === null ? (
              <p className="empty" role="alert">
                Não foi possível carregar as conversas.
              </p>
            ) : conversations === null ? (
              <p className="empty">Carregando…</p>
            ) : visible.length === 0 ? (
              <p className="empty">
                {filtered
                  ? "Nenhuma conversa neste filtro"
                  : "Nenhuma conversa ainda"}
              </p>
            ) : (
              <ul>
                {visible.map((c) => (
                  <li key={c.id}>
                    <ConversationItem conversation={c} me={me} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>
        <section className="conv-pane">
          <Outlet />
        </section>
      </div>
      {newOpen && <NewConversationDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

/** Tique de entrega da última mensagem enviada (como no WhatsApp). */
function DeliveryTick({
  status,
}: {
  status: NonNullable<Conversation["lastMessage"]>["status"];
}) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (status === "read" || status === "played")
    return <CheckCheck {...props} className="tick tick--read" />;
  if (status === "delivered") return <CheckCheck {...props} className="tick" />;
  if (status === "failed")
    return <CircleAlert {...props} className="tick tick--failed" />;
  if (status === "sending" || status === "uncertain")
    return <Clock {...props} className="tick" />;
  return <Check {...props} className="tick" />;
}

function ConversationItem({
  conversation: c,
  me,
}: {
  conversation: Conversation;
  me?: string | undefined;
}) {
  const label = contactLabel(c.contact);
  const last = c.lastMessage;
  const fromColleague =
    last?.direction === "out" && last.authorId !== null && last.authorId !== me
      ? last.authorName
      : null;
  const shownLabels = c.contact.labels.slice(0, 2);
  const more = c.contact.labels.length - shownLabels.length;
  return (
    <NavLink
      to={`/conversas/${c.id}`}
      className={`conv-item conv-item--row${c.unreadCount > 0 ? " is-unread" : ""}`}
    >
      <ContactAvatar contact={c.contact} className="avatar--row" />
      <span className="conv-main">
        <span className="conv-row">
          <span className="conv-name">{label}</span>
          {last && (
            <time
              className="conv-time"
              dateTime={new Date(last.timestamp).toISOString()}
            >
              {listTime(last.timestamp)}
            </time>
          )}
        </span>
        <span className="conv-row">
          <span
            className={`conv-preview${last?.type === "unsupported" ? " is-unsupported" : ""}`}
          >
            {last?.direction === "out" && <DeliveryTick status={last.status} />}
            {fromColleague && (
              <span className="conv-preview-author">{fromColleague}: </span>
            )}
            <span className="conv-preview-text">
              {last ? messagePreview(last.type, last.text) : ""}
            </span>
          </span>
          {c.unreadCount > 0 && (
            <span
              className="unread-badge"
              aria-label={`${c.unreadCount} não lida${c.unreadCount > 1 ? "s" : ""}`}
            >
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </span>
        <span className="conv-meta">
          <StatusPill status={c.status} />
          <span className="conv-dot" aria-hidden="true">
            ·
          </span>
          <span className={`conv-assignee${c.assigneeName ? "" : " is-none"}`}>
            {c.assigneeName ?? "sem dono"}
          </span>
          {shownLabels.length > 0 && (
            <>
              <span className="conv-dot" aria-hidden="true">
                ·
              </span>
              {shownLabels.map((l) => (
                <LabelTag key={l.id} label={l} />
              ))}
              {more > 0 && (
                <span className="label-tag label-tag--more">+{more}</span>
              )}
            </>
          )}
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

function SearchPanel({
  results,
  me,
}: {
  results: SearchResults | "error" | null;
  me?: string | undefined;
}) {
  if (results === null) return <p className="empty">Buscando…</p>;
  if (results === "error")
    return (
      <p className="empty" role="alert">
        Não foi possível buscar.
      </p>
    );
  if (results.contacts.length === 0 && results.messages.length === 0)
    return <p className="empty">Nada encontrado</p>;
  return (
    <div className="search-results">
      {results.contacts.length > 0 && (
        <section aria-label="Contatos">
          <h2 className="search-heading">Contatos</h2>
          <ul>
            {results.contacts.map((c) => (
              <li key={c.id}>
                <ConversationItem conversation={c} me={me} />
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
                <Link
                  to={`/conversas/${m.conversationId}?m=${encodeURIComponent(m.messageId)}`}
                  className="conv-item"
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(contactLabel(m.contact))}
                  </span>
                  <span className="conv-main">
                    <span className="conv-row">
                      <span className="conv-name">
                        {contactLabel(m.contact)}
                      </span>
                      <time
                        className="conv-time"
                        dateTime={new Date(m.timestamp).toISOString()}
                      >
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
  const companyName = useCompanyName();
  return (
    <div className="no-conversation">
      <span className="no-conversation-logo" aria-hidden="true">
        <MessagesSquare size={44} strokeWidth={1.75} />
      </span>
      <p className="no-conversation-title" data-testid="company-name-empty">
        {companyName}
      </p>
      <p>
        Escolha uma conversa à esquerda. As que estão <strong>sem dono</strong>{" "}
        esperam alguém assumir.
      </p>
    </div>
  );
}
