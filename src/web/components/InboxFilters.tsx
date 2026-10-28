import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Conversation, InboxFilter, Label, Member } from "../api";
import { STATUS_LABEL } from "../format";
import { usePopover } from "../use-popover";
import { LabelTag } from "./LabelTag";

export type Chip = "tudo" | "minhas" | "semdono" | "naolidas";
/** Filtros do menu ▾ (status, responsável e etiqueta; vão para a API). */
export type Extra = { status: InboxFilter["status"]; assignee: string; label: string };
export const NO_EXTRA: Extra = { status: "", assignee: "", label: "" };

const MENU_STATUSES = [
  ["em_andamento", "Em andamento"],
  ["aguardando_cliente", "Aguardando cliente"],
  ["resolvida", "Resolvidas"],
] as const;

/** Chip "Sem dono": sem responsável e ainda não resolvida. */
export const isUnowned = (c: Conversation) => c.assigneeId === null && c.status !== "resolvida";

/** Faixa de chips da lista: Tudo · Minhas · Sem dono · Não lidas · ▾. As contagens saem de `all` (sem filtro nenhum). */
export function FilterChips({
  chip,
  onChip,
  extra,
  onExtra,
  all,
  members,
  labels,
}: {
  chip: Chip;
  onChip: (next: Chip) => void;
  extra: Extra;
  onExtra: (fn: (e: Extra) => Extra) => void;
  all: Conversation[];
  members: Member[];
  labels: Label[];
}) {
  return (
    <div className="filter-chips">
      <ChipButton on={chip === "tudo"} onClick={() => onChip("tudo")}>
        Tudo
      </ChipButton>
      <ChipButton on={chip === "minhas"} onClick={() => onChip("minhas")}>
        Minhas
      </ChipButton>
      <ChipButton on={chip === "semdono"} onClick={() => onChip("semdono")} count={all.filter(isUnowned).length}>
        Sem dono
      </ChipButton>
      <ChipButton on={chip === "naolidas"} onClick={() => onChip("naolidas")} count={all.filter((c) => c.unreadCount > 0).length}>
        Não lidas
      </ChipButton>
      <MoreFilters extra={extra} onExtra={onExtra} members={members} labels={labels} />
    </div>
  );
}

function ChipButton({ on, onClick, count, children }: { on: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button type="button" className={`inbox-chip${on ? " inbox-chip--on" : ""}`} aria-pressed={on} onClick={onClick}>
      {children}
      {count !== undefined && count > 0 && (
        <span className="chip-count" data-testid="chip-count">
          {count}
        </span>
      )}
    </button>
  );
}

/** Chip ▾: status, responsável e etiqueta. Mostra o filtro ativo no próprio chip. */
function MoreFilters({
  extra,
  onExtra,
  members,
  labels,
}: {
  extra: Extra;
  onExtra: (fn: (e: Extra) => Extra) => void;
  members: Member[];
  labels: Label[];
}) {
  const { open, setOpen, close, ref } = usePopover();
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const active: string[] = [
    extra.status ? STATUS_LABEL[extra.status] : "",
    extra.assignee ? (members.find((m) => m.id === extra.assignee)?.name ?? "Responsável") : "",
    extra.label ? (labels.find((l) => l.id === extra.label)?.name ?? "Etiqueta") : "",
  ].filter(Boolean);
  // Escolher de novo o que já está ativo desliga o filtro.
  const toggle = (key: keyof Extra, value: string) => {
    onExtra((e) => ({ ...e, [key]: e[key] === value ? "" : value }));
    close();
  };
  const item = (key: keyof Extra, value: string, text: ReactNode) => (
    <button type="button" aria-pressed={extra[key] === value} className={extra[key] === value ? "is-on" : undefined} onClick={() => toggle(key, value)}>
      {text}
    </button>
  );
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={`inbox-chip${active.length > 0 ? " inbox-chip--filter" : ""}`}
        aria-label={active.length > 0 ? `Mais filtros: ${active.join(", ")}` : "Mais filtros"}
        aria-expanded={open}
        onClick={(e) => {
          // O menu é "fixed": a faixa de chips rola e cortaria um menu absoluto.
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
          setOpen(!open);
        }}
      >
        {active.length > 0 && <span>{active.length > 1 ? `${active[0]} +${active.length - 1}` : active[0]}</span>}
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu menu--filters" style={pos}>
          <p className="menu-label">Status</p>
          {MENU_STATUSES.map(([value, text]) => (
            <Fragment key={value}>{item("status", value, text)}</Fragment>
          ))}
          {members.length > 0 && (
            <>
              <hr />
              <p className="menu-label">Responsável</p>
              {members.map((m) => (
                <Fragment key={m.id}>{item("assignee", m.id, m.name)}</Fragment>
              ))}
            </>
          )}
          {labels.length > 0 && (
            <>
              <hr />
              <p className="menu-label">Etiqueta</p>
              {labels.map((l) => (
                <Fragment key={l.id}>{item("label", l.id, <LabelTag label={l} />)}</Fragment>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
