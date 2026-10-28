import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRightLeft, CircleCheck, EllipsisVertical, Hand, Search, UserPlus, UserRound } from "lucide-react";
import { ApiError, api, type Conversation, type Member } from "../api";
import { authClient } from "../auth-client";
import { contactLabel, initials } from "../format";
import { StatusPill } from "./StatusPill";

interface Props {
  conversation: Conversation;
  fichaOpen: boolean;
  onToggleFicha: () => void;
  onSearch: () => void;
  onChanged: (c: Conversation) => void;
  onReload: () => Promise<void>;
}

/** Cabeçalho do chat: foto, nome (abre a ficha), status, responsável, botão de ação, lupa e menu ⋮. */
export function ChatHeader({ conversation, fichaOpen, onToggleFicha, onSearch, onChanged, onReload }: Props) {
  const { data } = authClient.useSession();
  const me = data?.user as { id: string; role?: string } | undefined;
  const isAdmin = me?.role === "admin";
  const isOwner = !!me && conversation.assigneeId === me.id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = contactLabel(conversation.contact);

  useEffect(() => setError(null), [conversation.id]);

  async function run(action: () => Promise<{ conversation: Conversation }>) {
    setBusy(true);
    setError(null);
    try {
      onChanged((await action()).conversation);
      await onReload();
    } catch (e) {
      // 409 = outra pessoa mexeu antes: relê para mostrar o estado real.
      setError(e instanceof ApiError && e.status === 409 ? "Outra pessoa acabou de alterar esta conversa." : "Não foi possível concluir. Tente de novo.");
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  const assumable = conversation.status === "aberta" && conversation.assigneeId === null;
  // Qualquer membro resolve (não só o responsável); transferir continua com o responsável ou o admin.
  const resolvable = conversation.status === "em_andamento" || conversation.status === "aguardando_cliente";

  return (
    <>
      <header className="conv-header">
        <Link to="/" className="back" aria-label="Voltar à caixa de entrada">
          <ArrowLeft size={22} aria-hidden="true" />
        </Link>
        <button type="button" className="conv-who" aria-label="Ficha do contato" aria-expanded={fichaOpen} onClick={onToggleFicha}>
          <span className="avatar" aria-hidden="true">
            {conversation.contact.name ? initials(label) : <UserRound size={22} />}
          </span>
          <span className="conv-header-text">
            <h2>{label}</h2>
            <span className="conv-sub">
              <StatusPill status={conversation.status} testId="conversation-status" />
              <span data-testid="conversation-assignee">{conversation.assigneeName ? `com ${conversation.assigneeName}` : "sem dono"}</span>
            </span>
          </span>
        </button>
        {assumable && (
          <button type="button" className="action action--assume" disabled={busy} onClick={() => void run(() => api.assume(conversation.id))}>
            <Hand size={20} aria-hidden="true" />
            <span>Assumir</span>
          </button>
        )}
        {resolvable && (
          <button type="button" className="action" disabled={busy} onClick={() => void run(() => api.resolve(conversation.id))}>
            <CircleCheck size={20} aria-hidden="true" />
            <span>Resolver</span>
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Buscar mensagens" onClick={onSearch}>
          <Search size={20} aria-hidden="true" />
        </button>
        <ChatMenu
          conversation={conversation}
          isAdmin={isAdmin}
          canMove={isAdmin || isOwner}
          busy={busy}
          onOpenFicha={() => !fichaOpen && onToggleFicha()}
          onAssign={(memberId) => run(() => api.assign(conversation.id, memberId))}
        />
      </header>
      {error && (
        <p className="error chat-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Menu ⋮: Ver ficha, Transferir (responsável ou admin) e Atribuir a… (só admin, conversa sem dono). */
function ChatMenu({
  conversation,
  isAdmin,
  canMove,
  busy,
  onOpenFicha,
  onAssign,
}: {
  conversation: Conversation;
  isAdmin: boolean;
  canMove: boolean;
  busy: boolean;
  onOpenFicha: () => void;
  onAssign: (memberId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<null | "transfer" | "assign">(null);
  const [members, setMembers] = useState<Member[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && canMove && members.length === 0) api.members().then((r) => setMembers(r.members)).catch(() => undefined);
  }, [open, canMove, members.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !root.current?.contains(e.target as Node)) {
        setOpen(false);
        setPicking(null);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const hasOwner = conversation.assigneeId !== null;
  const others = members.filter((m) => m.id !== conversation.assigneeId);
  const canTransfer = canMove && hasOwner;
  const canAssign = isAdmin && !hasOwner;

  function close() {
    setOpen(false);
    setPicking(null);
  }

  return (
    <div className="menu-wrap" ref={root}>
      <button type="button" className="icon-btn" aria-label="Mais opções" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <EllipsisVertical size={20} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={picking ? (picking === "transfer" ? "Transferir para" : "Atribuir a") : "Opções da conversa"}>
          {!picking ? (
            <>
              <button type="button" role="menuitem" onClick={() => (onOpenFicha(), close())}>
                <UserRound size={18} aria-hidden="true" />
                Ver ficha do contato
              </button>
              {canTransfer && (
                <button type="button" role="menuitem" disabled={busy} onClick={() => setPicking("transfer")}>
                  <ArrowRightLeft size={18} aria-hidden="true" />
                  Transferir
                </button>
              )}
              {canAssign && (
                <button type="button" role="menuitem" disabled={busy} onClick={() => setPicking("assign")}>
                  <UserPlus size={18} aria-hidden="true" />
                  Atribuir a…
                </button>
              )}
            </>
          ) : (
            <>
              <span className="menu-label">{picking === "transfer" ? "Transferir para" : "Atribuir a"}</span>
              {others.length === 0 && <span className="menu-empty">Ninguém mais na equipe.</span>}
              {others.map((m) => (
                <button key={m.id} type="button" role="menuitem" disabled={busy} onClick={() => void onAssign(m.id).then(close)}>
                  {m.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
