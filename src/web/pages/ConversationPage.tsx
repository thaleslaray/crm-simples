import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError, api, type Conversation, type Member, type Message, type Note, type QuickReply, type SendStatus, type TimelineEvent } from "../api";
import { authClient } from "../auth-client";
import { fillName, filterQuickReplies, slashQuery } from "../quick-replies";
import { getDraft, setDraft } from "../drafts";
import { contactLabel, dayLabel, eventText, formatPhone, formatSize, initials, messagePreview, messageTime, sameDay, STATUS_LABEL } from "../format";
import { onRealtime } from "../realtime";
import { ContactPanel } from "./ContactPanel";
import { MessageBody } from "./MessageBody";
import { VoiceRecorder } from "./VoiceRecorder";

/** Miniatura do anexo: a própria imagem, ou um ícone para os demais tipos. */
function AttachmentThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img className="attachment-thumb" src={url} alt="" /> : <span className="attachment-thumb attachment-thumb--file" aria-hidden="true">📄</span>;
}

// Distância do topo (px) que dispara o carregamento das mensagens mais antigas.
const LOAD_OLDER_THRESHOLD = 120;

// Prefixo do id da bolha "enviando" que só existe no navegador até a API responder.
const TEMP = "tmp-";

/** A citação como a bolha mostra, a partir da mensagem citada. */
const quoteOf = (m: Message | null): Message["quote"] =>
  m ? { id: m.id, type: m.type, text: m.text, direction: m.direction, authorName: m.authorName ?? null } : null;

/** Entrega das mensagens enviadas: ✓ enviada, ✓✓ entregue, ✓✓ lida. */
const DELIVERY_LABEL: Partial<Record<SendStatus, string>> = {
  sent: "✓ Enviada",
  delivered: "✓✓ Entregue",
  read: "✓✓ Lida",
  played: "✓✓ Reproduzida",
};

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ready"; conversation: Conversation; messages: Message[]; events: TimelineEvent[]; notes: Note[]; nextBefore: string | null; nextAfter: string | null };

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  // ?m=<id da mensagem>: aberta a partir de um resultado de busca, posicionada nela.
  const [searchParams, setSearchParams] = useSearchParams();
  const target = searchParams.get("m");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Altura antes de inserir mensagens antigas no topo, para manter o que o atendente estava lendo no lugar.
  const anchor = useRef<number | null>(null);
  const firstPaint = useRef(true);
  const [loadingNewer, setLoadingNewer] = useState(false);
  // Quando chega mensagem nova com o atendente perto do fim, a lista acompanha; se ele lê o histórico, não pula.
  const stickToBottom = useRef(false);
  // Última mensagem vista, para a ressincronização ao reconectar.
  const lastSeen = useRef<Message | null>(null);
  // Janela aberta no meio do histórico (busca): há mensagens mais novas não carregadas, então nada de anexar ao vivo.
  const hasNewerGap = useRef(false);
  hasNewerGap.current = state.kind === "ready" && state.nextAfter !== null;
  lastSeen.current = state.kind === "ready" ? (state.messages.findLast((m) => !m.id.startsWith(TEMP)) ?? null) : null;

  const load = useCallback(
    (alive: () => boolean, opts: { around?: string | null } = {}) => {
      if (!id) return;
      const history = opts.around
        ? api.messagesAround(id, opts.around)
        : api.messages(id).then((m) => ({ ...m, nextAfter: null }));
      Promise.all([api.conversation(id), history, api.events(id), api.notes(id)])
        .then(([c, m, e, n]) => {
          if (alive())
            setState({
              kind: "ready",
              conversation: c.conversation,
              messages: m.messages,
              events: e.events,
              notes: n.notes,
              nextBefore: m.nextBefore,
              nextAfter: m.nextAfter,
            });
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
    load(() => alive, { around: target });
    return () => {
      alive = false;
    };
  }, [id, target, load]);

  // Tempo real: mensagem nova entra na conversa aberta; ao reconectar busca o que veio depois da última vista.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const append = (incoming: Message[]) =>
      setState((s) => {
        if (s.kind !== "ready" || s.conversation.id !== id || s.nextAfter !== null) return s;
        const known = new Set(s.messages.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return s;
        const el = scroller.current;
        stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        return { ...s, messages: [...s.messages, ...fresh] };
      });
    const refreshStatus = () =>
      Promise.all([api.conversation(id), api.events(id), api.notes(id)])
        .then(([c, e, n]) => alive && setState((s) => (s.kind === "ready" && s.conversation.id === id ? { ...s, conversation: c.conversation, events: e.events, notes: n.notes } : s)))
        .catch(() => undefined);
    const off = onRealtime((event) => {
      if (event.type === "message.created") {
        if (event.conversation.id === id) {
          append([event.message]);
          setState((s) => (s.kind === "ready" && s.conversation.id === id ? { ...s, conversation: event.conversation } : s));
          if (event.message.direction === "in") api.markRead(id).catch(() => undefined); // está olhando: já conta como lida
        }
        return;
      }
      if (event.type === "conversation.updated") {
        if (event.conversation.id !== id) return;
        setState((s) => {
          if (s.kind !== "ready" || s.conversation.id !== id) return s;
          const novo = event.event;
          const events = novo && !s.events.some((e) => e.id === novo.id) ? [...s.events, novo] : s.events;
          return { ...s, conversation: event.conversation, events };
        });
        return;
      }
      if (event.type === "note.created") {
        if (event.conversationId === id)
          setState((s) => {
            if (s.kind !== "ready" || s.notes.some((n) => n.id === event.note.id)) return s;
            const el = scroller.current;
            stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            return { ...s, notes: [...s.notes, event.note] };
          });
        return;
      }
      if (event.type === "contact.updated") {
        setState((s) =>
          s.kind === "ready" && s.conversation.contact.id === event.contact.id
            ? { ...s, conversation: { ...s.conversation, contact: { ...s.conversation.contact, name: event.contact.name } } }
            : s,
        );
        return;
      }
      if (event.type === "message.status") {
        if (event.conversationId === id)
          setState((s) =>
            s.kind === "ready"
              ? { ...s, messages: s.messages.map((m) => (m.id === event.messageId ? { ...m, status: event.status } : m)) }
              : s,
          );
        return;
      }
      if (event.type !== "reconnected") return;
      void refreshStatus();
      const last = lastSeen.current;
      if (hasNewerGap.current) return; // janela de busca: o que falta vem ao rolar
      if (!last) return load(() => alive, { around: target }); // conversa vazia ou ainda carregando: busca tudo de novo
      api
        .messagesAfter(id, last)
        // Página cheia = pode ter mais atrás: recarrega a conversa em vez de remendar.
        .then((r) => alive && (r.messages.length >= 100 ? load(() => alive, { around: target }) : append(r.messages)))
        .catch(() => undefined);
    });
    return () => {
      alive = false;
      off();
    };
  }, [id, target, load]);

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
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = false;
    }
  }, [state]);

  // Abrir a conversa com mensagens não lidas: zera o contador e marca como lidas no WhatsApp.
  const unreadOnOpen = state.kind === "ready" ? state.conversation.unreadCount : 0;
  useEffect(() => {
    if (id && unreadOnOpen > 0) api.markRead(id).catch(() => undefined);
  }, [id, unreadOnOpen]);

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

  const loadNewer = useCallback(async () => {
    if (state.kind !== "ready" || !state.nextAfter || loadingNewer || !id) return;
    setLoadingNewer(true);
    try {
      const page = await api.messagesNewer(id, state.nextAfter);
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

  const [draft, setDraftState] = useState("");
  // Modo "nota interna": o campo grava uma nota só da equipe, que nunca vai ao cliente.
  const [noteMode, setNoteMode] = useState(false);
  useEffect(() => setNoteMode(false), [id]);
  const [sendError, setSendError] = useState(false);
  // Mensagem que o atendente escolheu "Responder": a próxima mensagem sai citando-a.
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  // Rascunho é por conversa: ao trocar de conversa, carrega o dela.
  useEffect(() => {
    setDraftState(id ? getDraft(id) : "");
    setSendError(false);
    setReplyingTo(null);
  }, [id]);

  // Respostas rápidas: `/` no começo do campo abre a lista; escolher uma troca o campo pelo texto (com {nome}).
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  useEffect(() => {
    api.quickReplies().then((r) => setQuickReplies(r.quickReplies)).catch(() => undefined);
  }, [id]);
  const query = slashDismissed || noteMode ? null : slashQuery(draft);
  const matches = query === null ? [] : filterQuickReplies(quickReplies, query);
  const slashOpen = query !== null && quickReplies.length > 0;
  const pickQuickReply = (r: QuickReply) => {
    if (state.kind !== "ready" || !id) return;
    const filled = fillName(r.text, state.conversation.contact.name);
    setDraftState(filled);
    setDraft(id, filled);
    setSlashDismissed(true);
    inputRef.current?.focus();
  };
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const replaceMessage =useCallback((from: string, to: Message | null) => {
    setState((s) => {
      if (s.kind !== "ready") return s;
      const known = to ? s.messages.some((m) => m.id === to.id) : false;
      const messages = s.messages.flatMap((m) => (m.id !== from ? [m] : to && !known ? [to] : []));
      return { ...s, messages };
    });
  }, []);

  // O envio pode mudar status e responsável: relê a conversa (o tempo real também avisa, mas pode estar fora do ar).
  const refreshConversation = useCallback(async () => {
    if (!id) return;
    try {
      const [c, e] = await Promise.all([api.conversation(id), api.events(id)]);
      setState((s) => (s.kind === "ready" && s.conversation.id === id ? { ...s, conversation: c.conversation, events: e.events } : s));
    } catch {
      // Fica como está; o próximo evento de tempo real corrige.
    }
  }, [id]);

  // Bolha "enviando" otimista: entra na hora e troca pela mensagem do servidor; se nem chegou ao servidor, sai de novo.
  // Devolve se chegou (quem chamou desfaz o resto: texto no campo, citação, aviso de erro).
  const sendOptimistic = useCallback(
    async (temp: Message, send: () => Promise<Message>): Promise<boolean> => {
      stickToBottom.current = true;
      setState((s) => (s.kind === "ready" && s.conversation.id === id ? { ...s, messages: [...s.messages, temp] } : s));
      try {
        replaceMessage(temp.id, await send());
        return true;
      } catch {
        replaceMessage(temp.id, null);
        return false;
      }
    },
    [id, replaceMessage],
  );

  const sendDraft = useCallback(async () => {
    const text = draft.trim();
    if (!id || !text) return;
    const quoting = replyingTo;
    const temp: Message = { id: `${TEMP}${crypto.randomUUID()}`, direction: "out", type: "text", text, status: "sending", timestamp: Date.now(), media: null, location: null, contact: null, quote: quoteOf(quoting) };
    setDraftState("");
    setDraft(id, "");
    setSendError(false);
    setReplyingTo(null);
    if (await sendOptimistic(temp, async () => (await api.sendText(id, text, quoting?.id)).message)) {
      void refreshConversation();
    } else {
      // Nem chegou ao servidor: devolve o texto ao campo.
      setDraftState(text);
      setDraft(id, text);
      setReplyingTo(quoting);
      setSendError(true);
    }
  }, [draft, id, sendOptimistic, replyingTo, refreshConversation]);

  // Vai até a mensagem original: se já está na tela, rola até ela; senão reabre a conversa posicionada nela (como a busca).
  const goToQuoted = useCallback(
    (quotedId: string) => {
      const el = scroller.current?.querySelector(`[data-message-id="${CSS.escape(quotedId)}"]`);
      if (!el) return setSearchParams({ m: quotedId });
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("is-found");
      setTimeout(() => el.classList.remove("is-found"), 1800);
    },
    [setSearchParams],
  );

  // ?ficha=1: aberta a partir do card do funil, já na ficha.
  const [fichaOpen, setFichaOpen] = useState(() => searchParams.get("ficha") === "1" || window.matchMedia("(min-width: 1100px)").matches);

  const sendNote = useCallback(async () => {
    const text = draft.trim();
    if (!id || !text) return;
    setDraftState("");
    setDraft(id, "");
    setSendError(false);
    try {
      const { note } = await api.addNote(id, text);
      stickToBottom.current = true;
      setState((s) => (s.kind === "ready" && s.conversation.id === id && !s.notes.some((n) => n.id === note.id) ? { ...s, notes: [...s.notes, note] } : s));
    } catch {
      setDraftState(text);
      setDraft(id, text);
      setSendError(true);
    }
  }, [draft, id]);

  const [attachment, setAttachment] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);

  // Envia anexo ou nota de voz com a mesma bolha "enviando" do texto; devolve se chegou ao servidor.
  const sendFile = useCallback(
    async (file: File, opts: { caption: string; voice: boolean; quoting?: Message | null }) => {
      if (!id) return false;
      const quoting = opts.quoting ?? null;
      const type: Message["type"] = opts.voice ? "voice" : file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
      const temp: Message = { id: `${TEMP}${crypto.randomUUID()}`, direction: "out", type, text: opts.caption || null, status: "sending", timestamp: Date.now(), media: null, location: null, contact: null, quote: quoteOf(quoting) };
      setSendError(false);
      setSendingFile(true);
      setReplyingTo(null);
      const sent = await sendOptimistic(temp, async () => (await api.sendMedia(id, file, { text: opts.caption, voice: opts.voice, replyTo: quoting?.id })).message);
      if (!sent) {
        setReplyingTo(quoting);
        setSendError(true);
      }
      setSendingFile(false);
      return sent;
    },
    [id, sendOptimistic],
  );

  const sendAttachment = useCallback(async () => {
    if (!attachment) return;
    const file = attachment;
    const caption = draft.trim();
    setAttachment(null);
    setDraftState("");
    if (id) setDraft(id, "");
    if (!(await sendFile(file, { caption, voice: false, quoting: replyingTo }))) {
      // Nem chegou ao servidor: devolve o anexo e a legenda ao campo.
      setAttachment(file);
      setDraftState(caption);
      if (id) setDraft(id, caption);
    }
  }, [attachment, draft, id, sendFile, replyingTo]);

  // Anexo e gravação são por conversa: trocar de conversa os descarta.
  useEffect(() => {
    setAttachment(null);
    setRecording(false);
  }, [id]);

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
      void refreshConversation();
    },
    [id, replaceMessage, refreshConversation],
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

  const { conversation, messages, nextBefore, nextAfter, events, notes } = state;
  const items = timeline(messages, events, notes, nextBefore !== null, nextAfter !== null);
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
        <button type="button" className="secondary ficha-toggle" aria-pressed={fichaOpen} onClick={() => setFichaOpen((o) => !o)}>
          Ficha
        </button>
      </header>
      <div className={`conv-body${fichaOpen ? " conv-body--ficha" : ""}`}>
      <div className="conv-col">
      <ConversationActions
        conversation={conversation}
        onChanged={(c) => setState((s) => (s.kind === "ready" ? { ...s, conversation: c } : s))}
        onReload={refreshConversation}
      />
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
          {items.map((item, i) => {
            const m = item.kind === "message" ? item.message : null;
            return (
            <Fragment key={item.kind === "message" ? item.message.id : item.kind === "note" ? `note-${item.note.id}` : `ev-${item.event.id}`}>
              {(i === 0 || !sameDay(items[i - 1]!.ts, item.ts)) && (
                <li className="day-sep">
                  <span>{dayLabel(item.ts)}</span>
                </li>
              )}
              {item.kind === "event" && (
                <li className="system-event" data-testid="system-event">
                  <span>
                    {eventText(item.event)} · <time dateTime={new Date(item.ts).toISOString()}>{messageTime(item.ts)}</time>
                  </span>
                </li>
              )}
              {item.kind === "note" && (
                <li className="note" data-testid="internal-note">
                  <span className="note-tag">Nota interna · só a equipe vê</span>
                  <p>{item.note.text}</p>
                  <span className="note-meta">
                    {item.note.authorName ?? "Membro removido"} · <time dateTime={new Date(item.ts).toISOString()}>{messageTime(item.ts)}</time>
                  </span>
                </li>
              )}
              {m && (<li
                data-message-id={m.id}
                className={`bubble bubble--${m.direction}${m.type === "unsupported" ? " is-unsupported" : ""}${m.status ? ` is-${m.status}` : ""}${m.id === target ? " is-found" : ""}`}
              >
                {m.direction === "out" && m.authorName && <span className="bubble-author">{m.authorName}</span>}
                {m.quote && (
                  <button type="button" className="quote" onClick={() => goToQuoted(m.quote!.id)} aria-label="Ver mensagem citada">
                    <span className="quote-author">{m.quote.direction === "out" ? (m.quote.authorName ?? "Equipe") : label}</span>
                    <span className="quote-text">{messagePreview(m.quote.type, m.quote.text)}</span>
                  </button>
                )}
                <MessageBody message={m} />
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
                  {!m.id.startsWith(TEMP) && m.status !== "failed" && m.status !== "sending" && (
                    <button type="button" className="link" onClick={() => setReplyingTo(m)}>
                      Responder
                    </button>
                  )}
                  {m.status && DELIVERY_LABEL[m.status] && (
                    <span className={`bubble-delivery${m.status === "read" || m.status === "played" ? " is-read" : ""}`} data-delivery={m.status}>
                      {DELIVERY_LABEL[m.status]}
                    </span>
                  )}
                  <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
                </span>
              </li>)}
            </Fragment>
            );
          })}
        </ol>
        {nextAfter && <p className="messages-edge muted">{loadingNewer ? "Carregando mensagens recentes…" : " "}</p>}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void (noteMode ? sendNote() : attachment ? sendAttachment() : sendDraft());
        }}
      >
        {sendError && (
          <p className="error" role="alert">
            Não foi possível enviar. Tente de novo.
          </p>
        )}
        <div className="composer-mode" role="group" aria-label="Tipo de envio">
          <button type="button" className={noteMode ? "secondary" : "mode-on"} aria-pressed={!noteMode} onClick={() => setNoteMode(false)}>
            Mensagem
          </button>
          <button type="button" className={noteMode ? "mode-note-on" : "secondary"} aria-pressed={noteMode} onClick={() => setNoteMode(true)}>
            Nota interna
          </button>
        </div>
        {replyingTo && !noteMode && (
          <div className="reply-bar">
            <div className="reply-bar-text">
              <span className="quote-author">
                Respondendo a {replyingTo.direction === "out" ? (replyingTo.authorName ?? "equipe") : label}
              </span>
              <span className="quote-text">{messagePreview(replyingTo.type, replyingTo.text)}</span>
            </div>
            <button type="button" className="link" aria-label="Cancelar resposta" onClick={() => setReplyingTo(null)}>
              ✕
            </button>
          </div>
        )}
        {slashOpen && (
          <ul className="qr-menu" role="listbox" aria-label="Respostas rápidas">
            {matches.length === 0 ? (
              <li className="muted qr-empty">Nenhuma resposta encontrada</li>
            ) : (
              matches.map((r, i) => (
                <li
                  key={r.id}
                  role="option"
                  aria-selected={i === Math.min(slashIndex, matches.length - 1)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // mantém o foco no campo
                    pickQuickReply(r);
                  }}
                >
                  <strong>/{r.shortcut}</strong>
                  <span>{r.text}</span>
                </li>
              ))
            )}
          </ul>
        )}
        {recording && !noteMode ? (
          <VoiceRecorder
            busy={sendingFile}
            onCancel={() => setRecording(false)}
            onSend={(file) => {
              void sendFile(file, { caption: "", voice: true, quoting: replyingTo }).then((ok) => ok && setRecording(false));
            }}
          />
        ) : (
          <>
        {attachment && !noteMode && (
          <div className="attachment" aria-label="Anexo">
            <AttachmentThumb file={attachment} />
            <span className="attachment-name">{attachment.name}</span>
            <span className="muted">{formatSize(attachment.size)}</span>
            <button type="button" className="link" onClick={() => setAttachment(null)}>
              Remover
            </button>
          </div>
        )}
        <div className="composer-row">
          {!noteMode && (<>
          <label className="icon-button" title="Anexar arquivo">
            <span aria-hidden="true">📎</span>
            <span className="sr-only">Anexar arquivo</span>
            <input type="file" hidden onChange={(e) => { setAttachment(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <label className="icon-button icon-button--camera" title="Tirar foto">
            <span aria-hidden="true">📷</span>
            <span className="sr-only">Tirar foto</span>
            <input type="file" hidden accept="image/*" capture="environment" onChange={(e) => { setAttachment(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label></>)}
          <textarea
            ref={inputRef}
            aria-label={noteMode ? "Nota interna" : "Mensagem"}
            placeholder={noteMode ? "Escreva uma nota interna (o cliente não vê)" : "Escreva uma mensagem"}
            className={noteMode ? "is-note" : undefined}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraftState(e.target.value);
              setSlashDismissed(false);
              setSlashIndex(0);
              if (id) setDraft(id, e.target.value);
            }}
            onKeyDown={(e) => {
              if (slashOpen && !noteMode && matches.length > 0) {
                const cur = Math.min(slashIndex, matches.length - 1);
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashIndex((cur + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                  return;
                }
                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  pickQuickReply(matches[cur]!);
                  return;
                }
              }
              if (slashOpen && e.key === "Escape") setSlashDismissed(true);
              // Ctrl/Cmd+Enter envia; Enter sozinho quebra a linha (no celular não há outra forma de quebrar).
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void (noteMode ? sendNote() : attachment ? sendAttachment() : sendDraft());
              }
            }}
          />
          {!draft.trim() && !attachment && !noteMode && (
            <button type="button" className="icon-button" aria-label="Gravar nota de voz" onClick={() => setRecording(true)}>
              <span aria-hidden="true">🎤</span>
            </button>
          )}
          <button type="submit" disabled={(!draft.trim() && !(attachment && !noteMode)) || sendingFile}>
            {noteMode ? "Salvar nota" : "Enviar"}
          </button>
        </div>
          </>
        )}
      </form>
      </div>
      {fichaOpen && <ContactPanel contactId={conversation.contact.id} onClose={() => setFichaOpen(false)} />}
      </div>
    </article>
  );
}

type TimelineItem = ({ kind: "message"; message: Message } | { kind: "event"; event: TimelineEvent } | { kind: "note"; note: Note }) & { ts: number };

/**
 * Mensagens e eventos de sistema por horário. Com histórico parcial (há páginas antigas ou novas por carregar),
 * só entram os eventos dentro da janela de mensagens já carregada.
 */
function timeline(messages: Message[], events: TimelineEvent[], notes: Note[], moreBefore: boolean, moreAfter: boolean): TimelineItem[] {
  const first = messages[0]?.timestamp ?? -Infinity;
  const last = messages.at(-1)?.timestamp ?? Infinity;
  const inWindow = (ts: number) => (!moreBefore || ts >= first) && (!moreAfter || ts <= last);
  const visible = events.filter((e) => inWindow(e.timestamp));
  const all: TimelineItem[] = [
    ...messages.map((message): TimelineItem => ({ kind: "message", message, ts: message.timestamp })),
    ...visible.map((event): TimelineItem => ({ kind: "event", event, ts: event.timestamp })),
    ...notes.filter((n) => inWindow(n.createdAt)).map((note): TimelineItem => ({ kind: "note", note, ts: note.createdAt })),
  ];
  const rank = { message: 0, event: 1, note: 2 };
  return all.sort((a, b) => a.ts - b.ts || rank[a.kind] - rank[b.kind]);
}

/** Status, responsável e ações (assumir, atribuir/transferir, resolver) no topo da conversa. */
function ConversationActions({
  conversation,
  onChanged,
  onReload,
}: {
  conversation: Conversation;
  onChanged: (c: Conversation) => void;
  onReload: () => Promise<void>;
}) {
  const { data } = authClient.useSession();
  const me = data?.user as { id: string; role?: string } | undefined;
  const isAdmin = me?.role === "admin";
  const isOwner = !!me && conversation.assigneeId === me.id;
  const [members, setMembers] = useState<Member[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMove = isAdmin || isOwner;
  useEffect(() => {
    if (canMove) api.members().then((r) => setMembers(r.members)).catch(() => undefined);
  }, [canMove]);
  useEffect(() => {
    setTarget("");
    setError(null);
  }, [conversation.id]);

  async function run(action: () => Promise<{ conversation: Conversation }>) {
    setBusy(true);
    setError(null);
    try {
      onChanged((await action()).conversation);
      await onReload();
    } catch (e) {
      // 409 = outra pessoa mexeu antes: relê para mostrar o estado real.
      setError(e instanceof ApiError && e.status === 409 ? "Outra pessoa acabou de alterar esta conversa." : "Não foi possível concluir. Tente de novo.");
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  const open = conversation.status === "aberta" && conversation.assigneeId === null;
  // Qualquer membro resolve (não só o responsável); transferir continua com o responsável ou o admin.
  const resolvable = conversation.status === "em_andamento" || conversation.status === "aguardando_cliente";
  const others = members.filter((m) => m.id !== conversation.assigneeId);

  return (
    <div className="conv-actions" role="group" aria-label="Status e responsável">
      <div className="conv-status">
        <span className={`badge badge--${conversation.status}`} data-testid="conversation-status">
          {STATUS_LABEL[conversation.status]}
        </span>
        <span className="muted" data-testid="conversation-assignee">
          {conversation.assigneeName ? `Responsável: ${conversation.assigneeName}` : "Sem responsável"}
        </span>
      </div>
      <div className="conv-buttons">
        {open && (
          <button type="button" disabled={busy} onClick={() => void run(() => api.assume(conversation.id))}>
            Assumir
          </button>
        )}
        {canMove && others.length > 0 && (
          <>
            <select aria-label="Transferir para" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{conversation.assigneeId ? "Transferir para…" : "Atribuir a…"}</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary"
              disabled={busy || !target}
              onClick={() => void run(() => api.assign(conversation.id, target)).then(() => setTarget(""))}
            >
              {conversation.assigneeId ? "Transferir" : "Atribuir"}
            </button>
          </>
        )}
        {resolvable && (
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => api.resolve(conversation.id))}>
            Resolver
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
