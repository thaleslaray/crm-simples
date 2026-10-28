import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError, api, type Conversation, type Message } from "../api";
import { getDraft, setDraft } from "../drafts";
import { contactLabel, dayLabel, formatPhone, formatSize, initials, messageTime, sameDay } from "../format";
import { onRealtime } from "../realtime";
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
      Promise.all([api.conversation(id), history])
        .then(([c, m]) => {
          if (alive())
            setState({
              kind: "ready",
              conversation: c.conversation,
              messages: m.messages,
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
    const off = onRealtime((event) => {
      if (event.type === "message.created") {
        if (event.conversation.id === id) append([event.message]);
        return;
      }
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
    const temp: Message = { id: tempId, direction: "out", type: "text", text, status: "sending", timestamp: Date.now(), media: null, location: null, contact: null };
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

  const [attachment, setAttachment] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);

  // Envia anexo ou nota de voz com a mesma bolha "enviando" do texto; devolve se chegou ao servidor.
  const sendFile = useCallback(
    async (file: File, opts: { caption: string; voice: boolean }) => {
      if (!id) return false;
      const tempId = `${TEMP}${crypto.randomUUID()}`;
      const type: Message["type"] = opts.voice ? "voice" : file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
      const temp: Message = { id: tempId, direction: "out", type, text: opts.caption || null, status: "sending", timestamp: Date.now(), media: null, location: null, contact: null };
      stickToBottom.current = true;
      setState((s) => (s.kind === "ready" && s.conversation.id === id ? { ...s, messages: [...s.messages, temp] } : s));
      setSendError(false);
      setSendingFile(true);
      try {
        replaceMessage(tempId, (await api.sendMedia(id, file, { text: opts.caption, voice: opts.voice })).message);
        return true;
      } catch {
        replaceMessage(tempId, null);
        setSendError(true);
        return false;
      } finally {
        setSendingFile(false);
      }
    },
    [id, replaceMessage],
  );

  const sendAttachment = useCallback(async () => {
    if (!attachment) return;
    const file = attachment;
    const caption = draft.trim();
    setAttachment(null);
    setDraftState("");
    if (id) setDraft(id, "");
    if (!(await sendFile(file, { caption, voice: false }))) {
      // Nem chegou ao servidor: devolve o anexo e a legenda ao campo.
      setAttachment(file);
      setDraftState(caption);
      if (id) setDraft(id, caption);
    }
  }, [attachment, draft, id, sendFile]);

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
                className={`bubble bubble--${m.direction}${m.type === "unsupported" ? " is-unsupported" : ""}${m.status ? ` is-${m.status}` : ""}${m.id === target ? " is-found" : ""}`}
              >
                {m.direction === "out" && m.authorName && <span className="bubble-author">{m.authorName}</span>}
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
                  <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
                </span>
              </li>
            </Fragment>
          ))}
        </ol>
        {nextAfter && <p className="messages-edge muted">{loadingNewer ? "Carregando mensagens recentes…" : " "}</p>}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void (attachment ? sendAttachment() : sendDraft());
        }}
      >
        {sendError && (
          <p className="error" role="alert">
            Não foi possível enviar. Tente de novo.
          </p>
        )}
        {recording ? (
          <VoiceRecorder
            busy={sendingFile}
            onCancel={() => setRecording(false)}
            onSend={(file) => {
              void sendFile(file, { caption: "", voice: true }).then((ok) => ok && setRecording(false));
            }}
          />
        ) : (
          <>
        {attachment && (
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
          <label className="icon-button" title="Anexar arquivo">
            <span aria-hidden="true">📎</span>
            <span className="sr-only">Anexar arquivo</span>
            <input type="file" hidden onChange={(e) => { setAttachment(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <label className="icon-button icon-button--camera" title="Tirar foto">
            <span aria-hidden="true">📷</span>
            <span className="sr-only">Tirar foto</span>
            <input type="file" hidden accept="image/*" capture="environment" onChange={(e) => { setAttachment(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
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
          {!draft.trim() && !attachment && (
            <button type="button" className="icon-button" aria-label="Gravar nota de voz" onClick={() => setRecording(true)}>
              <span aria-hidden="true">🎤</span>
            </button>
          )}
          <button type="submit" disabled={(!draft.trim() && !attachment) || sendingFile}>
            Enviar
          </button>
        </div>
          </>
        )}
      </form>
    </article>
  );
}
