import { Link } from "react-router";
import { EllipsisVertical, LogOut, UserRound } from "lucide-react";
import { usePopover } from "../use-popover";

/** ⋮ do cabeçalho da lista: nome de quem está logado, perfil e sair. */
export function UserMenu({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  const { open, setOpen, close, ref } = usePopover();
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Mais opções" aria-expanded={open} onClick={() => setOpen(!open)}>
        <EllipsisVertical size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu">
          <p className="menu-title" data-testid="user-name">
            {name}
          </p>
          <Link to="/perfil" onClick={close}>
            <UserRound size={18} aria-hidden="true" />
            Perfil
          </Link>
          <hr />
          <button type="button" className="menu-danger" onClick={onSignOut}>
            <LogOut size={18} aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
