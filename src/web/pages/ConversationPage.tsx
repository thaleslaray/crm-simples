import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, type Conversation, type Message } from "../api";
import { onRealtime } from "../realtime";
import { contactLabel, dayLabel, formatPhone, initials, messagePreview, messageTime, sameDay } from "../format";

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
  // Quando chega mensagem nova com o atendente perto do fim, a lista acompanha; se ele lê o histórico, não pula.
  const stickToBottom = useRef(false);
  // Última mensagem vista, para a ressincronização ao reconectar.
  const lastSeen = useRef<Message | null>(null);
  lastSeen.current = state.kind === "ready" ? (state.messages.at(-1) ?? null) : null;

  const load = useCallback(
    (alive: () => boolean) => {
      if (!id) return;
      Promise.all([api.conversation(id), api.messages(id)])
        .then(([c, m]) => {
          if (alive()) setState({ kind: "ready", conversation: c.conversation, messages: m.messages, nextBefore: m.nextBefore });
        })
        .catch((e) => alive() && setState({ kind: e instanceof ApiError && e.status === 404 ? "not-found" : "error" }));
    },
    [id],
  );

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ kind: "loading" });
    firstPaint.current = true;
    load(() => alive);
    return () => {
      alive = false;
    };
  }, [id, load]);

  // Tempo real: mensagem nova entra na conversa aberta; ao reconectar busca o que veio depois da última vista.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const append = (incoming: Message[]) =>
      setState((s) => {
        if (s.kind !== "ready" || s.conversation.id !== id) return s;
        const known = new Set(s.messages.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return s;
        const el = scroller.current;
        stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        return { ...s, messages: [...s.messages, ...fresh] };
      });
    const off = onRealtime((event) => {
      if (event.type === "message.created") {
        if (event.conversation.id === id) append([event.message]);
        return;
      }
      const last = lastSeen.current;
      if (!last) return load(() => alive); // conversa vazia ou ainda carregando: busca tudo de novo
      api
        .messagesAfter(id, last)
        // Página cheia = pode ter mais atrás: recarrega a conversa em vez de remendar.
        .then((r) => alive && (r.messages.length >= 100 ? load(() => alive) : append(r.messages)))
        .catch(() => undefined);
    });
    return () => {
      alive = false;
      off();
    };
  }, [id, load]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || state.kind !== "ready") return;
    if (firstPaint.current) {
      el.scrollTop = el.scrollHeight;
      firstPaint.current = false;
    } else if (anchor.current !== null) {
      el.scrollTop += el.scrollHeight - anchor.current;
      anchor.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = false;
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
                <p>{messagePreview(m.type, m.text)}</p>
                <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
              </li>
            </Fragment>
          ))}
        </ol>
      </div>
    </article>
  );
}
