import type { ConversationStatus } from "../api";
import { STATUS_LABEL } from "../format";

/** Pílula colorida do status da conversa (cores dos tokens `--st-*`). */
export function StatusPill({ status, testId }: { status: ConversationStatus; testId?: string }) {
  return (
    <span className={`status-pill status-pill--${status}`} data-testid={testId}>
      {STATUS_LABEL[status]}
    </span>
  );
}
