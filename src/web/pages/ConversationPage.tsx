import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError, api, type Conversation, type Message } from "../api";
import { contactLabel, dayLabel, formatPhone, initials, messagePreview, messageTime, sameDay } from "../format";

// Distância do topo (px) que dispara o carregamento das mensagens mais antigas.
const LOAD_OLDER_THRESHOLD = 120;

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ready"; conversation: Conversation; messages: Message[]; nextBefore: string | null; nextAfter: string | null };

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  // ?m=<id da mensagem>: aberta a partir de um resultado de busca, posicionada nela.
  const target = useSearchParams()[0].get("m");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Altura antes de inserir mensagens antigas no topo, para manter o que o atendente estava lendo no lugar.
  const anchor = useRef<number | null>(null);
  const firstPaint = useRef(true);
  const [loadingNewer, setLoadingNewer] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ kind: "loading" });
    firstPaint.current = true;
    const history = target
      ? api.messagesAround(id, target)
      : api.messages(id).then((m) => ({ ...m, nextAfter: null }));
    Promise.all([api.conversation(id), history])
      .then(([c, m]) => {
        if (alive)
          setState({
            kind: "ready",
            conversation: c.conversation,
            messages: m.messages,
            nextBefore: m.nextBefore,
            nextAfter: m.nextAfter,
          });
      })
      .catch((e) => alive && setState({ kind: e instanceof ApiError && e.status === 404 ? "not-found" : "error" }));
    return () => {
      alive = false;
    };
  }, [id, target]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || state.kind !== "ready") return;
    if (firstPaint.current) {
      const found = target ? el.querySelector(`[data-message-id="${CSS.escape(target)}"]`) : null;
      if (found) found.scrollIntoView({ block: "center" });
      else el.scrollTop = el.scrollHeight;
      firstPaint.current = false;
    } else if (anchor.current !== null) {
      el.scrollTop += el.scrollHeight - anchor.current;
      anchor.current = null;
    }
  }, [state]);

  const loadOlder = useCallback(async () => {
    if (state.kind !== "ready" || !state.nextBefore || loadingOlder || !id) return;
    setLoadingOlder(true);
    try {
      const page = await api.messages(id, state.nextBefore);
      anchor.current = scroller.current?.scrollHeight ?? null;
      setState((s) =>
        s.kind === "ready" && s.conversation.id === id
          ? { ...s, messages: [...page.messages, ...s.messages], nextBefore: page.nextBefore }
          : s,
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [state, loadingOlder, id]);

  const loadNewer = useCallback(async () => {
    if (state.kind !== "ready" || !state.nextAfter || loadingNewer || !id) return;
    setLoadingNewer(true);
    try {
      const page = await api.messagesAfter(id, state.nextAfter);
      setState((s) =>
        s.kind === "ready" && s.conversation.id === id
          ? { ...s, messages: [...s.messages, ...page.messages], nextAfter: page.nextAfter }
          : s,
      );
    } finally {
      setLoadingNewer(false);
    }
  }, [state, loadingNewer, id]);

  function onScroll(el: HTMLDivElement) {
    if (el.scrollTop < LOAD_OLDER_THRESHOLD) void loadOlder();
    if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_OLDER_THRESHOLD) void loadNewer();
  }

  // Conversa curta que não enche a tela não rola: busca as antigas até aparecer a barra (ou acabar).
  useEffect(() => {
    const el = scroller.current;
    if (el && state.kind === "ready" && state.nextBefore && el.scrollHeight <= el.clientHeight) void loadOlder();
  }, [state, loadOlder]);

  if (state.kind === "loading") return <p className="empty">Carregando…</p>;
  if (state.kind === "not-found")
    return (
      <div className="empty">
        <p>Conversa não encontrada.</p>
        <Link to="/">Voltar à caixa de entrada</Link>
      </div>
    );
  if (state.kind === "error")
    return (
      <p className="empty" role="alert">
        Não foi possível carregar a conversa.
      </p>
    );

  const { conversation, messages, nextBefore, nextAfter } = state;
  const label = contactLabel(conversation.contact);

  return (
    <article className="conversation" aria-label={`Conversa com ${label}`}>
      <header className="conv-header">
        <Link to="/" className="back" aria-label="Voltar à caixa de entrada">
          ‹
        </Link>
        <span className="avatar" aria-hidden="true">
          {initials(label)}
        </span>
        <div className="conv-header-text">
          <h2>{label}</h2>
          {conversation.contact.name && conversation.contact.phone && (
            <p className="muted">{formatPhone(conversation.contact.phone)}</p>
          )}
        </div>
      </header>
      <div
        className="messages"
        ref={scroller}
        onScroll={(e) => onScroll(e.currentTarget)}
      >
        {nextBefore ? (
          <p className="messages-edge muted">{loadingOlder ? "Carregando mensagens antigas…" : " "}</p>
        ) : (
          messages.length > 0 && <p className="messages-edge muted">Início da conversa</p>
        )}
        <ol>
          {messages.map((m, i) => (
            <Fragment key={m.id}>
              {(i === 0 || !sameDay(messages[i - 1]!.timestamp, m.timestamp)) && (
                <li className="day-sep">
                  <span>{dayLabel(m.timestamp)}</span>
                </li>
              )}
              <li
                data-message-id={m.id}
                className={`bubble bubble--${m.direction}${m.type === "unsupported" ? " is-unsupported" : ""}${m.id === target ? " is-found" : ""}`}
              >
                <p>{messagePreview(m.type, m.text)}</p>
                <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
              </li>
            </Fragment>
          ))}
        </ol>
        {nextAfter && <p className="messages-edge muted">{loadingNewer ? "Carregando mensagens recentes…" : " "}</p>}
      </div>
    </article>
  );
}
