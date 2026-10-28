import { Check, CheckCheck } from "lucide-react";
import type { Message, SendStatus } from "../api";
import { authorColorVar } from "../author-color";
import { messagePreview, messageTime } from "../format";
import { MessageBody } from "../pages/MessageBody";

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
}

export function MessageBubble({ message: m, clientLabel, first, showAuthor, found, isTemp, onOpenQuote, onReply, onResend }: Props) {
  const delivery = m.status ? DELIVERY[m.status] : undefined;
  return (
    <li
      data-message-id={m.id}
      className={`bubble bubble--${m.direction}${first ? " bubble--first" : ""}${m.type === "unsupported" ? " is-unsupported" : ""}${m.status ? ` is-${m.status}` : ""}${found ? " is-found" : ""}`}
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
      <MessageBody message={m} />
      <span className="bubble-meta">
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
          <button type="button" className="link" onClick={() => onReply(m)}>
            Responder
          </button>
        )}
        <time dateTime={new Date(m.timestamp).toISOString()}>{messageTime(m.timestamp)}</time>
        {delivery && (
          <span className={`bubble-delivery${delivery.read ? " is-read" : ""}`} data-delivery={m.status} role="img" aria-label={delivery.label}>
            {delivery.double ? <CheckCheck size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          </span>
        )}
      </span>
    </li>
  );
}
