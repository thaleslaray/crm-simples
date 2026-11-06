import { Check, CheckCheck } from "lucide-react";
import { useRef, useState } from "react";
import type { Message, SendStatus } from "../api";
import { authorColorVar } from "../author-color";
import { messagePreview, messageTime } from "../format";
import { MessageBody } from "../pages/MessageBody";
import { ReactButton, ReactionChip } from "./Reactions";

/** O WhatsApp só aceita reação a mensagem de até 7 dias. */
const REACTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Toque longo no celular abre a barra de reações. */
const LONG_PRESS_MS = 450;

/** Entrega das mensagens enviadas: ✓ enviada, ✓✓ entregue, ✓✓ azul lida. */
const DELIVERY: Partial<Record<SendStatus, { label: string; double: boolean; read: boolean }>> = {
  sent: { label: "Enviada", double: false, read: false },
  delivered: { label: "Entregue", double: true, read: false },
  read: { label: "Lida", double: true, read: true },
  played: { label: "Reproduzida", double: true, read: true },
};

interface Props {
  message: Message;
  /** Nome de quem fala na citação do cliente. */
  clientLabel: string;
  /** Primeiro da sequência do mesmo lado: ganha o canto reto do rabicho. */
  first: boolean;
  /** Primeiro da sequência do mesmo autor: mostra o nome no topo do balão verde. */
  showAuthor: boolean;
  found: boolean;
  isTemp: boolean;
  onOpenQuote: (id: string) => void;
  onReply: (m: Message) => void;
  onResend: (m: Message) => void;
  /** Usuário logado: a reação da equipe feita por ele aparece como "Você". */
  myId: string | undefined;
  /** Reagir ou, com "", tirar a reação da equipe. */
  onReact: (m: Message, emoji: string) => void;
}

export function MessageBubble({ message: m, clientLabel, first, showAuthor, found, isTemp, onOpenQuote, onReply, onResend, myId, onReact }: Props) {
  const [picking, setPicking] = useState(false);
  const press = useRef<number | undefined>(undefined);
  // Só mensagens do cliente (limite da Uazapi), já gravadas e dentro da janela de 7 dias.
  const canReact = m.direction === "in" && !isTemp && Date.now() - m.timestamp < REACTION_WINDOW_MS;
  const reactions = m.reactions ?? [];
  const teamEmoji = reactions.find((r) => r.side === "team")?.emoji ?? null;
  const cancelPress = () => window.clearTimeout(press.current);
  const delivery = m.status ? DELIVERY[m.status] : undefined;
  // Hora na última linha do texto quando não há aviso de envio (falhou, incerto, enviando) ocupando o rodapé.
  const endsWithText = m.media ? !!m.text : !m.location && !m.contact;
  const inlineMeta = endsWithText && m.status !== "failed" && m.status !== "uncertain" && m.status !== "sending";
  const metaItems = () => (
    <>
      {m.status === "failed" && (
        <>
          <span className="bubble-status" role="status">
            Falhou
          </span>
          <button type="button" className="link" onClick={() => onResend(m)}>
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
      {!isTemp && m.status !== "failed" && m.status !== "sending" && (
        <button type="button" className="link bubble-reply" onClick={() => onReply(m)}>
          Responder
        </button>
      )}
      <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
      {delivery && (
        <span className={`bubble-delivery${delivery.read ? " is-read" : ""}`} data-delivery={m.status} role="img" aria-label={delivery.label}>
          {delivery.double ? <CheckCheck size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        </span>
      )}
    </>
  );
  return (
    <li
      data-message-id={m.id}
      className={`bubble bubble--${m.direction}${first ? " bubble--first" : ""}${inlineMeta ? " bubble--inline-meta" : ""}${reactions.length > 0 ? " has-reactions" : ""}${m.type === "unsupported" ? " is-unsupported" : ""}${m.status ? ` is-${m.status}` : ""}${found ? " is-found" : ""}`}
      onPointerDown={(e) => {
        if (!canReact || e.pointerType !== "touch") return;
        cancelPress();
        press.current = window.setTimeout(() => setPicking(true), LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerMove={(e) => e.pointerType === "touch" && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4) && cancelPress()}
      onContextMenu={(e) => picking && e.preventDefault()}
    >
      {showAuthor && (
        <span className="bubble-author" style={{ color: authorColorVar(m.sentById ?? m.authorName) }}>
          {m.authorName}
        </span>
      )}
      {m.quote && (
        <button type="button" className="quote" onClick={() => onOpenQuote(m.quote!.id)} aria-label="Ver mensagem citada">
          <span className="quote-author">{m.quote.direction === "out" ? (m.quote.authorName ?? "Equipe") : clientLabel}</span>
          <span className="quote-text">{messagePreview(m.quote.type, m.quote.text)}</span>
        </button>
      )}
      <MessageBody
        message={m}
        trailing={
          inlineMeta ? (
            // Só reserva a largura do rodapé no fim do texto; o conteúdo vem do CSS (não entra no texto da mensagem).
            <span
              className={`bubble-meta-space${delivery ? " has-ticks" : ""}${!isTemp ? " has-reply" : ""}`}
              data-time={messageTime(m.timestamp)}
              aria-hidden="true"
            />
          ) : undefined
        }
      />
      <span className="bubble-meta">{metaItems()}</span>
      {canReact && <ReactButton current={teamEmoji} open={picking} setOpen={setPicking} onPick={(e) => onReact(m, e === teamEmoji ? "" : e)} />}
      {reactions.length > 0 && (
        <ReactionChip reactions={reactions} myId={myId} clientLabel={clientLabel} canRemove={canReact} onRemove={() => onReact(m, "")} />
      )}
    </li>
  );
}
