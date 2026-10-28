import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError, api, type Conversation, type Message, type Note, type QuickReply, type TimelineEvent } from "../api";
import { fillName, filterQuickReplies, slashQuery } from "../quick-replies";
import { getDraft, setDraft } from "../drafts";
import { contactLabel, dayLabel, eventText, formatSize, messagePreview, messageTime, sameDay } from "../format";
import { onRealtime } from "../realtime";
import { readFichaAberta, saveFichaAberta } from "../ficha-aberta";
import { ContactPanel } from "./ContactPanel";
import { ChatHeader } from "../components/ChatHeader";
import { EventPill } from "../components/EventPill";
import { MessageBubble } from "../components/MessageBubble";
import { NoteBubble } from "../components/NoteBubble";
import { VoiceRecorder } from "./VoiceRecorder";
import { AttachMenu } from "../components/AttachMenu";
import { Lock, LockOpen, Mic, SendHorizontal } from "lucide-react";

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
        // O evento da minha própria mensagem pode chegar antes da resposta do envio: ocupa o lugar da bolha "enviando" em vez de duplicar.
        const messages = [...s.messages];
        const added: Message[] = [];
        for (const m of fresh) {
          const at = m.direction === "out" ? messages.findIndex((t) => t.id.startsWith(TEMP) && t.type === m.type && t.text === m.text) : -1;
          if (at >= 0) messages[at] = m;
          else added.push(m);
        }
        return { ...s, messages: [...messages, ...added] };
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
  // Celular: placeholders curtos.
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
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
  const [fichaOpen, setFichaState] = useState(() => searchParams.get("ficha") === "1" || readFichaAberta());
  // O link "Ficha" do funil navega dentro do app: com a conversa já montada o useState acima não roda de novo.
  const wantsFicha = searchParams.get("ficha") === "1";
  useEffect(() => {
    if (wantsFicha) setFichaState(true);
  }, [wantsFicha, id]);
  const setFichaOpen = useCallback((open: boolean) => {
    setFichaState(open);
    saveFichaAberta(open);
  }, []);

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
    <article className={`conversation${fichaOpen ? " conversation--ficha" : ""}`} aria-label={`Conversa com ${label}`}>
      <ChatHeader
        conversation={conversation}
        fichaOpen={fichaOpen}
        onToggleFicha={() => setFichaOpen(!fichaOpen)}
        onChanged={(c) => setState((s) => (s.kind === "ready" ? { ...s, conversation: c } : s))}
        onReload={refreshConversation}
      />
      <div className={`conv-body${fichaOpen ? " conv-body--ficha" : ""}`}>
      <div className="conv-col">
      <div className="chat-surface doodle-bg">
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
            const prev = items[i - 1];
            const newDay = !prev || !sameDay(prev.ts, item.ts);
            const key = item.kind === "message" ? item.message.id : item.kind === "note" ? `note-${item.note.id}` : `ev-${item.event.id}`;
            let body: ReactNode = null;
            if (item.kind === "event") {
              body = (
                <EventPill testId="system-event">
                  {eventText(item.event)} · <time dateTime={new Date(item.ts).toISOString()}>{messageTime(item.ts)}</time>
                </EventPill>
              );
            } else if (item.kind === "note") {
              body = <NoteBubble note={item.note} />;
            } else {
              const m = item.message;
              // Sequência = mensagens seguidas do mesmo lado no mesmo dia; o autor se repete quando muda a pessoa.
              const before = !newDay && prev?.kind === "message" ? prev.message : null;
              const first = !before || before.direction !== m.direction;
              const sameAuthor = !!before && before.direction === "out" && (before.sentById ?? before.authorName) === (m.sentById ?? m.authorName);
              body = (
                <MessageBubble
                  message={m}
                  clientLabel={label}
                  first={first}
                  showAuthor={m.direction === "out" && !!m.authorName && !sameAuthor}
                  found={m.id === target}
                  isTemp={m.id.startsWith(TEMP)}
                  onOpenQuote={goToQuoted}
                  onReply={setReplyingTo}
                  onResend={(x) => void resend(x)}
                />
              );
            }
            return (
              <Fragment key={key}>
                {newDay && <EventPill variant="date">{dayLabel(item.ts)}</EventPill>}
                {body}
              </Fragment>
            );
          })}
        </ol>
        {nextAfter && <p className="messages-edge muted">{loadingNewer ? "Carregando mensagens recentes…" : " "}</p>}
      </div>
      <form
        className={`composer${noteMode ? " note-mode" : ""}`}
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
            <li className="qr-label" role="presentation">
              Respostas rápidas
            </li>
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
        {noteMode && (
          <p className="note-hint">
            <Lock aria-hidden="true" />
            Nota interna: só a equipe vê. O cliente não recebe.
          </p>
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
        <div className="composer-pill">
          {!noteMode && <AttachMenu onPick={setAttachment} />}
          <button
            type="button"
            className={`composer-btn composer-lock${noteMode ? " on" : ""}`}
            aria-label="Nota interna"
            aria-pressed={noteMode}
            title="Nota interna"
            onClick={() => setNoteMode((v) => !v)}
          >
            {noteMode ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
          </button>
          <textarea
            ref={inputRef}
            aria-label={noteMode ? "Texto da nota" : "Mensagem"}
            placeholder={
              noteMode
                ? narrow ? "Nota para a equipe" : "Escreva uma nota para a equipe"
                : narrow ? "Mensagem ou /" : "Digite uma mensagem ou / para respostas rápidas"
            }
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
              // Como no WhatsApp Web: no computador Enter envia e Shift+Enter quebra a linha; no celular
              // Enter quebra a linha (envia pelo botão). Ctrl/Cmd+Enter envia em qualquer tela.
              // Nunca envia durante composição de IME nem com o campo vazio (a não ser com anexo).
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                const withModifier = e.ctrlKey || e.metaKey;
                if (withModifier || (!narrow && !e.shiftKey)) {
                  e.preventDefault();
                  if (!draft.trim() && !(attachment && !noteMode)) return;
                  void (noteMode ? sendNote() : attachment ? sendAttachment() : sendDraft());
                }
              }
            }}
          />
          {!draft.trim() && !attachment && !noteMode ? (
            <button type="button" className="composer-btn" aria-label="Gravar nota de voz" onClick={() => setRecording(true)}>
              <Mic aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" className="composer-send" aria-label={noteMode ? "Salvar nota" : "Enviar"} disabled={(!draft.trim() && !(attachment && !noteMode)) || sendingFile}>
              <SendHorizontal aria-hidden="true" />
            </button>
          )}
        </div>
          </>
        )}
      </form>
      </div>
      </div>
      {fichaOpen && (
        <ContactPanel
          contactId={conversation.contact.id}
          onClose={() => setFichaOpen(false)}
        />
      )}
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
