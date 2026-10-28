import type { ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ArrowLeft, Building2, Kanban, LogOut, Smartphone, Tag, UserRound, UsersRound, Zap, type LucideProps } from "lucide-react";
import { authClient } from "../auth-client";
import { TwoColumnPage } from "../components/TwoColumnPage";
import { clearDrafts } from "../drafts";
import { useConnection } from "../connection";
import { initials } from "../format";

interface SettingsItem {
  to: string;
  title: string;
  hint: string;
  icon: ComponentType<LucideProps>;
  adminOnly?: boolean;
}

/** Itens das Configurações, na ordem da lista. O atendente só vê os que não são de admin. */
export const SETTINGS_ITEMS: SettingsItem[] = [
  { to: "/respostas-rapidas", title: "Respostas rápidas", hint: "Atalhos de texto para a equipe", icon: Zap },
  { to: "/etiquetas", title: "Etiquetas", hint: "Cores e nomes", icon: Tag, adminOnly: true },
  { to: "/funis/gerenciar", title: "Funis e etapas", hint: "Monte o caminho dos seus contatos", icon: Kanban, adminOnly: true },
  { to: "/equipe", title: "Equipe", hint: "Convites e papéis", icon: UsersRound, adminOnly: true },
  { to: "/conexao", title: "Conexão do número", hint: "WhatsApp conectado", icon: Smartphone, adminOnly: true },
  { to: "/empresa", title: "Empresa", hint: "Nome que aparece para a equipe", icon: Building2, adminOnly: true },
  { to: "/perfil", title: "Perfil", hint: "Tema e assinatura", icon: UserRound },
];

const matches = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

/** Caminhos que abrem dentro das Configurações (a barra de ícones marca "Configurações" em todos). */
export const inSettings = (pathname: string) => matches(pathname, "/configuracoes") || SETTINGS_ITEMS.some((i) => matches(pathname, i.to));

const CONNECTION_HINT = {
  connected: "WhatsApp conectado",
  connecting: "WhatsApp conectando",
  disconnected: "WhatsApp desconectado",
  unknown: "Estado do WhatsApp indisponível",
} as const;

const ROLE_LABEL = { admin: "Administrador", atendente: "Atendente" } as const;

function SettingsList() {
  const { data } = authClient.useSession();
  const navigate = useNavigate();
  const user = data?.user as { name: string; email: string; role?: string } | undefined;
  const isAdmin = user?.role === "admin";
  const { state } = useConnection();

  async function signOut() {
    clearDrafts();
    await authClient.signOut();
    navigate("/login");
  }

  return (
    <nav className="settings-list" aria-label="Configurações">
      <h1 className="two-col-title">Configurações</h1>
      <div className="settings-card">
        <span className="avatar avatar--lg" aria-hidden="true">
          {initials(user?.name ?? "")}
        </span>
        <span className="settings-card-who">
          <strong>{user?.name}</strong>
          <small>
            {ROLE_LABEL[isAdmin ? "admin" : "atendente"]} · {user?.email}
          </small>
        </span>
      </div>
      <ul>
        {SETTINGS_ITEMS.filter((i) => isAdmin || !i.adminOnly).map(({ to, title, hint: fixedHint, icon: Icon }) => {
          const hint = to === "/conexao" && state ? CONNECTION_HINT[state.status] : fixedHint;
          return (
          <li key={to}>
            <NavLink to={to} className="settings-item" aria-label={title}>
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>{hint}</small>
              </span>
            </NavLink>
          </li>
          );
        })}
        <li>
          <button type="button" className="settings-item settings-item--danger" onClick={() => void signOut()}>
            <LogOut size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <strong>Sair</strong>
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Configurações em duas colunas: lista à esquerda, a tela do item (rota filha) à direita. */
export function SettingsLayout() {
  const { pathname } = useLocation();
  const item = SETTINGS_ITEMS.find((i) => matches(pathname, i.to));
  return (
    <TwoColumnPage
      hasDetail={Boolean(item)}
      list={<SettingsList />}
      detail={
        item ? (
          <>
            <header className="two-col-head">
              <Link to="/configuracoes" className="two-col-back" aria-label="Voltar">
                <ArrowLeft size={22} aria-hidden="true" />
              </Link>
              <h2>{item.title}</h2>
            </header>
            <div className="settings-body">
              <Outlet />
            </div>
          </>
        ) : (
          <p className="two-col-empty">Escolha um item para configurar.</p>
        )
      }
    />
  );
}
