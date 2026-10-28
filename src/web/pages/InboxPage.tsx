import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router";
import { Check, CheckCheck, ChevronDown, CircleAlert, Clock, EllipsisVertical, LogOut, MessagesSquare, Plus, Search, UserRound } from "lucide-react";
import { api, type Conversation, type InboxFilter, type Label, type Member, type SearchResults } from "../api";
import { authClient } from "../auth-client";
import { clearDrafts } from "../drafts";
import { contactLabel, initials, listTime, messagePreview, STATUS_LABEL } from "../format";
import { useLabels } from "../labels";
import { LabelTag } from "../components/LabelTag";
import { StatusPill } from "../components/StatusPill";
import { onRealtime } from "../realtime";
import { NewConversationDialog } from "./NewConversation";

type Chip = "tudo" | "minhas" | "semdono" | "naolidas";
/** Filtros do menu ▾ (status, responsável e etiqueta; vão para a API). */
type Extra = { status: InboxFilter["status"]; assignee: string; label: string };
const NO_EXTRA: Extra = { status: "", assignee: "", label: "" };

const MENU_STATUSES = [
  ["em_andamento", "Em andamento"],
  ["aguardando_cliente", "Aguardando cliente"],
  ["resolvida", "Resolvidas"],
] as const;

/** Chip "Sem dono": sem responsável e ainda não resolvida. */
const isUnowned = (c: Conversation) => c.assigneeId === null && c.status !== "resolvida";

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
      if (["message.created", "conversation.updated", "reconnected", "labels.changed"].includes(e.type)) soon(200);
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

/** Menu suspenso que fecha com clique fora ou Esc. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Caixa de entrada: lista à esquerda e conversa aberta à direita (no celular, uma tela de cada vez). */
export function InboxPage() {
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const detailOpen = useMatch("/conversas/:id") !== null;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
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

  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    api.members().then((r) => setMembers(r.members)).catch(() => undefined);
  }, []);

  // O que vai para a API: o chip escolhe o responsável, a menos que o ▾ tenha escolhido um.
  const fStatus = extra.status;
  const fAssignee = chip === "minhas" ? "me" : chip === "semdono" ? "none" : extra.assignee;
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
      (!fAssignee || (fAssignee === "none" ? c.assigneeId === null : c.assigneeId === (fAssignee === "me" ? me : fAssignee)));
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
  }, [load, fStatus, fAssignee, fLabel, me]);

  async function signOut() {
    clearDrafts();
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  // "Sem dono" e "Não lidas" refinam, no cliente, o que a API devolveu.
  const visible = (conversations ?? []).filter((c) => (chip === "semdono" ? isUnowned(c) : chip === "naolidas" ? c.unreadCount > 0 : true));
  const filtered = chip !== "tudo" || extra.status !== "" || extra.assignee !== "" || extra.label !== "";

  const pick = (next: Chip) => {
    setChip(next);
    // Minhas e Sem dono escolhem o responsável: soltam o responsável do ▾.
    if (next === "minhas" || next === "semdono") setExtra((e) => ({ ...e, assignee: "" }));
  };

  return (
    <div className={`shell inbox${detailOpen ? " inbox--detail" : ""}`}>
      <div className="inbox-body">
        <nav className="conv-list" aria-label="Conversas">
          <div className="side-head">
            <h1>Caixa de entrada</h1>
            <UserMenu name={data?.user.name ?? ""} isAdmin={isAdmin} onSignOut={signOut} />
            <button type="button" className="fab" aria-label="Nova conversa" onClick={() => setNewOpen(true)}>
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
          <div className="filter-chips">
            <ChipButton on={chip === "tudo"} onClick={() => pick("tudo")}>
              Tudo
            </ChipButton>
            <ChipButton on={chip === "minhas"} onClick={() => pick("minhas")}>
              Minhas
            </ChipButton>
            <ChipButton on={chip === "semdono"} onClick={() => pick("semdono")} count={all.filter(isUnowned).length}>
              Sem dono
            </ChipButton>
            <ChipButton on={chip === "naolidas"} onClick={() => pick("naolidas")} count={all.filter((c) => c.unreadCount > 0).length}>
              Não lidas
            </ChipButton>
            <MoreFilters extra={extra} setExtra={setExtra} members={members} labels={labels} />
          </div>
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
              <p className="empty">{filtered ? "Nenhuma conversa neste filtro" : "Nenhuma conversa ainda"}</p>
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

function ChipButton({ on, onClick, count, children }: { on: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button type="button" className={`chip${on ? " chip--on" : ""}`} aria-pressed={on} onClick={onClick}>
      {children}
      {count !== undefined && count > 0 && (
        <span className="chip-count" data-testid="chip-count">
          {count}
        </span>
      )}
    </button>
  );
}

/** ⋮ do cabeçalho: perfil, sair e (provisoriamente, até o ticket 07) os atalhos de admin. */
function UserMenu({ name, isAdmin, onSignOut }: { name: string; isAdmin: boolean; onSignOut: () => void }) {
  const { open, setOpen, ref } = usePopover();
  const close = () => setOpen(false);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Mais opções" aria-expanded={open} onClick={() => setOpen(!open)}>
        <EllipsisVertical size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu">
          <p className="menu-title" data-testid="user-name">
            {name}
          </p>
          <Link to="/perfil" onClick={close}>
            <UserRound size={18} aria-hidden="true" />
            Perfil
          </Link>
          {isAdmin && (
            <>
              <hr />
              <Link to="/etiquetas" onClick={close}>
                Etiquetas
              </Link>
              <Link to="/respostas-rapidas" onClick={close}>
                Respostas rápidas
              </Link>
              <Link to="/equipe" onClick={close}>
                Equipe
              </Link>
              <Link to="/conexao" onClick={close}>
                Conexão
              </Link>
            </>
          )}
          <hr />
          <button type="button" className="menu-danger" onClick={onSignOut}>
            <LogOut size={18} aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

/** Chip ▾: status, responsável e etiqueta. Mostra o filtro ativo no próprio chip. */
function MoreFilters({ extra, setExtra, members, labels }: { extra: Extra; setExtra: (fn: (e: Extra) => Extra) => void; members: Member[]; labels: Label[] }) {
  const { open, setOpen, ref } = usePopover();
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const active: string[] = [
    extra.status ? STATUS_LABEL[extra.status] : "",
    extra.assignee ? (members.find((m) => m.id === extra.assignee)?.name ?? "Responsável") : "",
    extra.label ? (labels.find((l) => l.id === extra.label)?.name ?? "Etiqueta") : "",
  ].filter(Boolean);
  // Escolher de novo o que já está ativo desliga o filtro.
  const toggle = (key: keyof Extra, value: string) => {
    setExtra((e) => ({ ...e, [key]: e[key] === value ? "" : value }));
    setOpen(false);
  };
  const item = (key: keyof Extra, value: string, text: ReactNode) => (
    <button type="button" aria-pressed={extra[key] === value} className={extra[key] === value ? "is-on" : undefined} onClick={() => toggle(key, value)}>
      {text}
    </button>
  );
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={`chip${active.length > 0 ? " chip--filter" : ""}`}
        aria-label={active.length > 0 ? `Mais filtros: ${active.join(", ")}` : "Mais filtros"}
        aria-expanded={open}
        onClick={(e) => {
          // O menu é "fixed": a faixa de chips rola e cortaria um menu absoluto.
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
          setOpen(!open);
        }}
      >
        {active.length > 0 && <span>{active.length > 1 ? `${active[0]} +${active.length - 1}` : active[0]}</span>}
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu menu--filters" style={pos}>
          <p className="menu-label">Status</p>
          {MENU_STATUSES.map(([value, text]) => (
            <Fragment key={value}>{item("status", value, text)}</Fragment>
          ))}
          {members.length > 0 && (
            <>
              <hr />
              <p className="menu-label">Responsável</p>
              {members.map((m) => (
                <Fragment key={m.id}>{item("assignee", m.id, m.name)}</Fragment>
              ))}
            </>
          )}
          {labels.length > 0 && (
            <>
              <hr />
              <p className="menu-label">Etiqueta</p>
              {labels.map((l) => (
                <Fragment key={l.id}>{item("label", l.id, <LabelTag label={l} />)}</Fragment>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const AVATAR_COLORS = ["#00a884", "#ff7043", "#5c6bc0", "#26a69a", "#ab47bc", "#ef6c00", "#8d6e63", "#42a5f5"];
const avatarColor = (id: string) => AVATAR_COLORS[[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length]!;

/** Tique de entrega da última mensagem enviada (como no WhatsApp). */
function DeliveryTick({ status }: { status: NonNullable<Conversation["lastMessage"]>["status"] }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (status === "read" || status === "played") return <CheckCheck {...props} className="tick tick--read" />;
  if (status === "delivered") return <CheckCheck {...props} className="tick" />;
  if (status === "failed") return <CircleAlert {...props} className="tick tick--failed" />;
  if (status === "sending" || status === "uncertain") return <Clock {...props} className="tick" />;
  return <Check {...props} className="tick" />;
}

function ConversationItem({ conversation: c, me }: { conversation: Conversation; me?: string | undefined }) {
  const label = contactLabel(c.contact);
  const last = c.lastMessage;
  const fromColleague = last?.direction === "out" && last.authorId !== null && last.authorId !== me ? last.authorName : null;
  const shownLabels = c.contact.labels.slice(0, 2);
  const more = c.contact.labels.length - shownLabels.length;
  return (
    <NavLink to={`/conversas/${c.id}`} className={`conv-item conv-item--row${c.unreadCount > 0 ? " is-unread" : ""}`}>
      <span className="avatar avatar--row" style={{ background: avatarColor(c.contact.id) }} aria-hidden="true">
        {c.contact.name?.trim() ? initials(label) : <UserRound size={24} strokeWidth={1.75} />}
      </span>
      <span className="conv-main">
        <span className="conv-row">
          <span className="conv-name">{label}</span>
          {last && (
            <time className="conv-time" dateTime={new Date(last.timestamp).toISOString()}>
              {listTime(last.timestamp)}
            </time>
          )}
        </span>
        <span className="conv-row">
          <span className={`conv-preview${last?.type === "unsupported" ? " is-unsupported" : ""}`}>
            {last?.direction === "out" && <DeliveryTick status={last.status} />}
            {fromColleague && <span className="conv-preview-author">{fromColleague}: </span>}
            <span className="conv-preview-text">{last ? messagePreview(last.type, last.text) : ""}</span>
          </span>
          {c.unreadCount > 0 && (
            <span className="unread-badge" aria-label={`${c.unreadCount} não lida${c.unreadCount > 1 ? "s" : ""}`}>
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </span>
        <span className="conv-meta">
          <StatusPill status={c.status} />
          <span className="conv-dot" aria-hidden="true">
            ·
          </span>
          <span className={`conv-assignee${c.assigneeName ? "" : " is-none"}`}>{c.assigneeName ?? "sem dono"}</span>
          {shownLabels.length > 0 && (
            <>
              <span className="conv-dot" aria-hidden="true">
                ·
              </span>
              {shownLabels.map((l) => (
                <LabelTag key={l.id} label={l} />
              ))}
              {more > 0 && <span className="label-tag label-tag--more">+{more}</span>}
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

function SearchPanel({ results, me }: { results: SearchResults | "error" | null; me?: string | undefined }) {
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
    <div className="no-conversation">
      <span className="no-conversation-logo" aria-hidden="true">
        <MessagesSquare size={44} strokeWidth={1.75} />
      </span>
      <h2>CRM WhatsApp</h2>
      <p>
        Escolha uma conversa à esquerda. As que estão <strong>sem dono</strong> esperam alguém assumir.
      </p>
    </div>
  );
}
