import { Plus, Smile } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageReaction } from "../api";

/** As seis reações rápidas, na ordem do WhatsApp. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Mais emojis, no "+" da barra: os de uso mais comum em atendimento. */
const MORE_REACTIONS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😊",
  "🙂", "😉", "😍", "🥰", "😘", "😋", "😎", "🤩",
  "🥳", "🤗", "🤔", "😐", "🙄", "😬", "😴", "🤯",
  "😳", "🥺", "😭", "😡", "😱", "🤝", "👏", "🙌",
  "👌", "✌️", "🤞", "💪", "👀", "🔥", "✨", "🎉",
  "💯", "✅", "❌", "⭐", "💚", "💙", "💔", "🌹",
];

const GAP = 8;

/** Fecha com clique fora (de qualquer um dos elementos), Esc, rolagem ou mudança de tamanho da janela. */
function useDismiss(open: boolean, refs: RefObject<HTMLElement | null>[], close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    const onMove = () => closeRef.current();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // A barra é fixa na tela: se a conversa rolar, ela descolaria do balão.
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * Painel flutuante preso a um elemento: centralizado nele, por cima (ou por baixo, sem espaço em cima),
 * sem sair da janela. Fixo na tela e no `body`, para a lista de mensagens (com rolagem) não cortar.
 */
function Floating({ anchor, below, panelRef, className, label, children }: {
  anchor: RefObject<HTMLElement | null>;
  below?: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const p = panelRef.current;
    if (!a || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    // Não passa por cima da lista de conversas: fica dentro da área das mensagens (ou da janela, fora dela).
    const area = anchor.current?.closest(".messages")?.getBoundingClientRect();
    const minLeft = (area?.left ?? 0) + GAP;
    const maxLeft = (area?.right ?? window.innerWidth) - w - GAP;
    const left = Math.max(Math.min(a.left + a.width / 2 - w / 2, maxLeft), Math.min(minLeft, maxLeft));
    const above = a.top - h;
    const top = !below && above >= GAP ? above : Math.min(a.bottom + 4, window.innerHeight - h - GAP);
    setPos({ left, top });
  }, [anchor, panelRef, below]);
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={className}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}

interface ReactButtonProps {
  /** Reação atual da equipe nesta mensagem (fica marcada na barra). */
  current: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Escolheu um emoji: o mesmo da reação atual tira a reação. */
  onPick: (emoji: string) => void;
}

/** Carinha ao lado do balão do cliente (aparece ao passar o mouse) e a barra de reações. */
export function ReactButton({ current, open, setOpen, onPick }: ReactButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const close = () => {
    setOpen(false);
    setMore(false);
  };
  useDismiss(open, [button, panel], close);
  useEffect(() => {
    // Ao abrir, o foco vai para a primeira reação (teclado e leitor de tela).
    if (open) panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [open, more]);

  // Pelo teclado (sem clique de mouse, `detail` 0) o foco volta para a carinha; com o mouse, não, para ela sumir ao sair do balão.
  const pick = (emoji: string, keyboard: boolean) => {
    close();
    onPick(emoji);
    if (keyboard) button.current?.focus({ preventScroll: true });
  };
  const item = (emoji: string) => (
    <button
      key={emoji}
      type="button"
      className={`react-item${emoji === current ? " is-current" : ""}`}
      aria-label={emoji === current ? `Tirar reação ${emoji}` : `Reagir com ${emoji}`}
      aria-pressed={emoji === current}
      onClick={(e) => pick(emoji, e.detail === 0)}
    >
      {emoji}
    </button>
  );

  return (
    <span className={`react-slot${open ? " is-open" : ""}`}>
      <button
        ref={button}
        type="button"
        className="react-trigger"
        aria-label="Reagir"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Smile size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <Floating key={more ? "more" : "quick"} anchor={button} panelRef={panel} className={more ? "react-picker react-picker--more" : "react-picker"} label="Reações">
          {more ? (
            MORE_REACTIONS.map(item)
          ) : (
            <>
              {QUICK_REACTIONS.map(item)}
              <button type="button" className="react-item react-item--more" aria-label="Mais emojis" onClick={() => setMore(true)}>
                <Plus size={20} aria-hidden="true" />
              </button>
            </>
          )}
        </Floating>
      )}
    </span>
  );
}

interface ChipProps {
  reactions: MessageReaction[];
  myId: string | undefined;
  /** Nome do cliente, como aparece na conversa. */
  clientLabel: string;
  /** A reação da equipe ainda pode ser tirada (mensagem do cliente com até 7 dias). */
  canRemove: boolean;
  onRemove: () => void;
}

const whoOf = (r: MessageReaction, myId: string | undefined, clientLabel: string) =>
  r.side === "contact" ? clientLabel : r.userId && r.userId === myId ? "Você" : (r.userName ?? "Equipe (pelo celular)");

/** Selo embaixo do balão com as reações; clicar mostra quem reagiu. */
export function ReactionChip({ reactions, myId, clientLabel, canRemove, onRemove }: ChipProps) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, [chip, panel], () => setOpen(false));
  const emojis = [...new Set(reactions.map((r) => r.emoji))];
  const label = `Reações: ${reactions.map((r) => `${r.emoji} de ${whoOf(r, myId, clientLabel)}`).join(", ")}`;
  return (
    <>
      <button ref={chip} type="button" className="reaction-chip" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {emojis.map((e) => (
          <span key={e} className="reaction-chip-emoji" aria-hidden="true">
            {e}
          </span>
        ))}
        {reactions.length > 1 && (
          <span className="reaction-chip-count" aria-hidden="true">
            {reactions.length}
          </span>
        )}
      </button>
      {open && (
        <Floating anchor={chip} below panelRef={panel} className="reaction-details" label="Quem reagiu">
          <ul>
            {reactions.map((r) => {
              const removable = r.side === "team" && canRemove;
              const body = (
                <>
                  <span className="reaction-details-who">
                    <span>{whoOf(r, myId, clientLabel)}</span>
                    {removable && <small>Clique para remover</small>}
                  </span>
                  <span className="reaction-details-emoji" aria-hidden="true">
                    {r.emoji}
                  </span>
                </>
              );
              return (
                <li key={r.side}>
                  {removable ? (
                    <button
                      type="button"
                      aria-label={`Tirar a reação ${r.emoji} da equipe`}
                      onClick={() => {
                        setOpen(false);
                        onRemove();
                      }}
                    >
                      {body}
                    </button>
                  ) : (
                    <div>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Floating>
      )}
    </>
  );
}
