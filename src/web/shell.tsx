// Casca de navegação (estilo WhatsApp Web): faixa de desconexão no topo, barra de ícones no computador,
// abas embaixo no celular. As telas vivem dentro da área de conteúdo.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router";
import { CircleEllipsis, Contact, Kanban, MessageCircle, Settings } from "lucide-react";
import { api } from "./api";
import { authClient } from "./auth-client";
import { ConnectionBanner } from "./connection";
import { initials } from "./format";
import { onRealtime } from "./realtime";

const ICON = { size: 24, strokeWidth: 1.75, "aria-hidden": true } as const;

const fetchTotal = () => api.conversations().then((r) => r.conversations.reduce((sum, c) => sum + c.unreadCount, 0));

const UnreadContext = createContext(0);

/** Total de mensagens não lidas de todas as conversas (independe do filtro da lista). */
export const useUnreadTotal = () => useContext(UnreadContext);

function UnreadProvider({ children }: { children: ReactNode }) {
  const [total, setTotal] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      fetchTotal()
        .then((n) => alive && setTotal(n))
        .catch(() => undefined);
    // Vários eventos seguidos viram uma busca só.
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 200);
    };
    load();
    const off = onRealtime((event) => {
      if (event.type === "message.created" || event.type === "conversation.updated" || event.type === "reconnected") soon();
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      off();
    };
  }, []);

  // Abrir ou sair de uma conversa marca como lida: confere o total ao navegar.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetchTotal()
        .then((n) => alive && setTotal(n))
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pathname]);

  return <UnreadContext.Provider value={total}>{children}</UnreadContext.Provider>;
}

const unreadLabel = (total: number) => (total > 0 ? `Conversas, ${total} não lida${total > 1 ? "s" : ""}` : "Conversas");
const unreadText = (total: number) => (total > 99 ? "99+" : String(total));

/** Conversas fica ativa em "/" e "/conversas/:id". */
const inConversations = (pathname: string) => pathname === "/" || pathname.startsWith("/conversas/");

function Badge({ total }: { total: number }) {
  if (total <= 0) return null;
  return (
    <span className="nav-badge" aria-hidden="true">
      {unreadText(total)}
    </span>
  );
}

function Rail() {
  const { data } = authClient.useSession();
  const total = useUnreadTotal();
  const { pathname } = useLocation();
  const name = data?.user.name ?? "";
  const conversationsActive = inConversations(pathname);
  return (
    <nav className="rail" aria-label="Seções">
      <div className="rail-group">
        <Link to="/" aria-label={unreadLabel(total)} className={conversationsActive ? "rail-item active" : "rail-item"} aria-current={conversationsActive ? "page" : undefined}>
          <MessageCircle {...ICON} />
          <Badge total={total} />
        </Link>
        <NavLink to="/contatos" aria-label="Contatos" title="Contatos" className="rail-item">
          <Contact {...ICON} />
        </NavLink>
        <NavLink to="/funis" aria-label="Funis" title="Funis" className="rail-item">
          <Kanban {...ICON} />
        </NavLink>
      </div>
      <div className="rail-group">
        <NavLink to="/perfil" aria-label="Configurações" title="Configurações" className="rail-item">
          <Settings {...ICON} />
        </NavLink>
        <Link to="/perfil" aria-label={`Meu perfil, ${name}`} title={name} className="rail-avatar">
          {data?.user.image ? <img src={data.user.image} alt="" /> : initials(name)}
        </Link>
      </div>
    </nav>
  );
}

function TabBar() {
  const total = useUnreadTotal();
  const { pathname } = useLocation();
  const conversationsActive = inConversations(pathname);
  return (
    <nav className="tabbar" aria-label="Abas">
      <Link to="/" aria-label={unreadLabel(total)} className={conversationsActive ? "tab active" : "tab"} aria-current={conversationsActive ? "page" : undefined}>
        <MessageCircle {...ICON} />
        <Badge total={total} />
        <span>Conversas</span>
      </Link>
      <NavLink to="/contatos" className="tab">
        <Contact {...ICON} />
        <span>Contatos</span>
      </NavLink>
      <NavLink to="/funis" className="tab">
        <Kanban {...ICON} />
        <span>Funis</span>
      </NavLink>
      <NavLink to="/perfil" className="tab">
        <CircleEllipsis {...ICON} />
        <span>Mais</span>
      </NavLink>
    </nav>
  );
}

export function AppShell() {
  // No celular a conversa (e a ficha, que vive nela) ocupa a tela toda, sem abas.
  const inChat = useMatch("/conversas/:id") !== null;
  return (
    <UnreadProvider>
      <div className={`app${inChat ? " app--chat" : ""}`}>
        <ConnectionBanner />
        <div className="app-body">
          <Rail />
          <div className="app-content">
            <Outlet />
          </div>
        </div>
        {!inChat && <TabBar />}
      </div>
    </UnreadProvider>
  );
}
