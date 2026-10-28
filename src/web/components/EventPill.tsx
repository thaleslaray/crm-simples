import type { ReactNode } from "react";
import { UserCheck } from "lucide-react";

/** Pílula centralizada no meio do chat: evento de sistema (com ícone) ou separador de data. */
export function EventPill({ children, variant = "event", testId }: { children: ReactNode; variant?: "event" | "date"; testId?: string }) {
  return (
    <li className={`event-pill event-pill--${variant}`} data-testid={testId}>
      <span>
        {variant === "event" && <UserCheck size={14} aria-hidden="true" />}
        {children}
      </span>
    </li>
  );
}
