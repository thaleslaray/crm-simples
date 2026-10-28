import type { ConversationStatus, Label } from "./api";
import { STATUS_LABEL } from "./format";

/** Pílula do status da conversa, com as cores por urgência (aberta laranja, em andamento azul...). */
export function StatusPill({ status }: { status: ConversationStatus }) {
  return <span className={`status-pill status-pill--${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Etiqueta do contato: bolinha na cor da etiqueta e o nome em cinza. */
export function LabelTag({ label }: { label: Pick<Label, "name" | "color"> }) {
  return (
    <span className="label-tag">
      <i style={{ background: label.color }} aria-hidden="true" />
      {label.name}
    </span>
  );
}
