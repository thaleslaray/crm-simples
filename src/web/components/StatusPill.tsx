import type { ConversationStatus } from "../api";
import { STATUS_LABEL } from "../format";

/** Status da conversa como pílula colorida (cores dos tokens `--st-*`). */
export function StatusPill({ status }: { status: ConversationStatus }) {
  return <span className={`status-pill status-pill--${status}`}>{STATUS_LABEL[status]}</span>;
}
