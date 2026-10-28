import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, type Conversation, type Message } from "../api";
import { contactLabel, dayLabel, formatPhone, initials, messageTime, sameDay } from "../format";
import { MessageBody } from "./MessageBody";

// Distância do topo (px) que dispara o carregamento das mensagens mais antigas.
const LOAD_OLDER_THRESHOLD = 120;

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ready"; conversation: Conversation; messages: Message[]; nextBefore: string | null };

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Altura antes de inserir mensagens antigas no topo, para manter o que o atendente estava lendo no lugar.
  const anchor = useRef<number | null>(null);
  const firstPaint = useRef(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ kind: "loading" });
    firstPaint.current = true;
    Promise.all([api.conversation(id), api.messages(id)])
      .then(([c, m]) => {
        if (alive) setState({ kind: "ready", conversation: c.conversation, messages: m.messages, nextBefore: m.nextBefore });
      })
      .catch((e) => alive && setState({ kind: e instanceof ApiError && e.status === 404 ? "not-found" : "error" }));
    return () => {
      alive = false;
    };
  }, [id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || state.kind !== "ready") return;
    if (firstPaint.current) {
      el.scrollTop = el.scrollHeight;
      firstPaint.current = false;
    } else if (anchor.current !== null) {
      el.scrollTop += el.scrollHeight - anchor.current;
      anchor.current = null;
    }
  }, [state]);

  // Enquanto houver mídia "carregando", relê as mensagens recentes e atualiza só o estado da mídia.
  const hasPending = state.kind === "ready" && state.messages.some((m) => m.media?.status === "pending");
  useEffect(() => {
    if (!hasPending || !id) return;
    const timer = setInterval(() => {
      api
        .messages(id)
        .then((page) => {
          const fresh = new Map(page.messages.map((m) => [m.id, m.media]));
          setState((s) =>
            s.kind === "ready" && s.conversation.id === id
              ? { ...s, messages: s.messages.map((m) => (m.media?.status === "pending" && fresh.get(m.id) ? { ...m, media: fresh.get(m.id)! } : m)) }
              : s,
          );
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [hasPending, id]);

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

  const { conversation, messages, nextBefore } = state;
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
        onScroll={(e) => e.currentTarget.scrollTop < LOAD_OLDER_THRESHOLD && void loadOlder()}
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
              <li className={`bubble bubble--${m.direction}${m.type === "unsupported" ? " is-unsupported" : ""}`}>
                <MessageBody message={m} />
                <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
              </li>
            </Fragment>
          ))}
        </ol>
      </div>
    </article>
  );
}
