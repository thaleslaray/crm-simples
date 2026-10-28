import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, type Conversation, type Message } from "../api";
import { getDraft, setDraft } from "../drafts";
import { onRealtime } from "../realtime";
import { contactLabel, dayLabel, formatPhone, initials, messagePreview, messageTime, sameDay } from "../format";

// Distância do topo (px) que dispara o carregamento das mensagens mais antigas.
const LOAD_OLDER_THRESHOLD = 120;

// Prefixo do id da bolha "enviando" que só existe no navegador até a API responder.
const TEMP = "tmp-";

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
  lastSeen.current = state.kind === "ready" ? (state.messages.findLast((m) => !m.id.startsWith(TEMP)) ?? null) : null;

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

  const [draft, setDraftState] = useState("");
  const [sendError, setSendError] = useState(false);
  // Rascunho é por conversa: ao trocar de conversa, carrega o dela.
  useEffect(() => {
    setDraftState(id ? getDraft(id) : "");
    setSendError(false);
  }, [id]);

  const replaceMessage = useCallback((from: string, to: Message | null) => {
    setState((s) => {
      if (s.kind !== "ready") return s;
      const known = to ? s.messages.some((m) => m.id === to.id) : false;
      const messages = s.messages.flatMap((m) => (m.id !== from ? [m] : to && !known ? [to] : []));
      return { ...s, messages };
    });
  }, []);

  const sendDraft = useCallback(async () => {
    const text = draft.trim();
    if (!id || !text) return;
    const tempId = `${TEMP}${crypto.randomUUID()}`;
    const temp: Message = { id: tempId, direction: "out", type: "text", text, status: "sending", timestamp: Date.now() };
    stickToBottom.current = true;
    setState((s) => (s.kind === "ready" && s.conversation.id === id ? { ...s, messages: [...s.messages, temp] } : s));
    setDraftState("");
    setDraft(id, "");
    setSendError(false);
    try {
      replaceMessage(tempId, (await api.sendText(id, text)).message);
    } catch {
      // Nem chegou ao servidor: tira a bolha e devolve o texto ao campo.
      replaceMessage(tempId, null);
      setDraftState(text);
      setDraft(id, text);
      setSendError(true);
    }
  }, [draft, id, replaceMessage]);

  const resend = useCallback(
    async (m: Message) => {
      if (!id) return;
      replaceMessage(m.id, { ...m, status: "sending" });
      try {
        const sent = (await api.resend(id, m.id)).message;
        setState((s) => (s.kind === "ready" ? { ...s, messages: s.messages.map((x) => (x.id === m.id ? sent : x)) } : s));
      } catch {
        replaceMessage(m.id, { ...m, status: "failed" });
      }
    },
    [id, replaceMessage],
  );

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
              <li
                className={`bubble bubble--${m.direction}${m.type === "unsupported" ? " is-unsupported" : ""}${m.status ? ` is-${m.status}` : ""}`}
              >
                {m.direction === "out" && m.authorName && <span className="bubble-author">{m.authorName}</span>}
                <p>{messagePreview(m.type, m.text)}</p>
                <span className="bubble-meta">
                  {m.status === "failed" && (
                    <>
                      <span className="bubble-status" role="status">
                        Falhou
                      </span>
                      <button type="button" className="link" onClick={() => void resend(m)}>
                        Reenviar
                      </button>
                    </>
                  )}
                  {m.status === "uncertain" && (
                    <span className="bubble-status" role="status">
                      Incerto: o WhatsApp não confirmou. Confira antes de enviar de novo.
                    </span>
                  )}
                  {m.status === "sending" && <span className="bubble-status">Enviando…</span>}
                  <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
                </span>
              </li>
            </Fragment>
          ))}
        </ol>
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void sendDraft();
        }}
      >
        {sendError && (
          <p className="error" role="alert">
            Não foi possível enviar. Tente de novo.
          </p>
        )}
        <div className="composer-row">
          <textarea
            aria-label="Mensagem"
            placeholder="Escreva uma mensagem"
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraftState(e.target.value);
              if (id) setDraft(id, e.target.value);
            }}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter envia; Enter sozinho quebra a linha (no celular não há outra forma de quebrar).
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void sendDraft();
              }
            }}
          />
          <button type="submit" disabled={!draft.trim()}>
            Enviar
          </button>
        </div>
      </form>
    </article>
  );
}
