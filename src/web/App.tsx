import { Navigate, Outlet, Route, Routes } from "react-router";
import { authClient } from "./auth-client";
import { ConnectionProvider } from "./connection";
import { AppShell } from "./shell";
import { CompanyPage } from "./pages/CompanyPage";
import { ConnectionPage } from "./pages/ConnectionPage";
import { ContactsPage } from "./pages/ContactsPage";
import { ConversationPage } from "./pages/ConversationPage";
import { FunnelsAdminPage } from "./pages/FunnelsAdminPage";
import { FunnelsPage } from "./pages/FunnelsPage";
import { InboxPage, NoConversationSelected } from "./pages/InboxPage";
import { LabelsPage } from "./pages/LabelsPage";
import { InvitePage, ResetPasswordPage } from "./pages/LinkPages";
import { LoginPage } from "./pages/LoginPage";
import { TeamPage } from "./pages/TeamPage";
import { ProfilePage } from "./pages/ProfilePage";
import { QuickRepliesPage } from "./pages/QuickRepliesPage";
import { useAlerts } from "./alerts";
import { useRealtimeConnection } from "./realtime";

/** Rota protegida: sem sessão, redireciona para /login. Com sessão, tempo real e faixa de conexão valem para todas as telas. */
function RequireSession() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <p className="center muted">Carregando…</p>;
  if (!data) return <Navigate to="/login" replace />;
  return <SignedInLayout />;
}

function SignedInLayout() {
  useRealtimeConnection();
  useAlerts();
  return (
    <ConnectionProvider>
      <AppShell />
    </ConnectionProvider>
  );
}

/** Só admin vê a tela de conexão (o servidor também recusa os demais). */
function RequireAdmin() {
  const { data } = authClient.useSession();
  if ((data?.user as { role?: string } | undefined)?.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/convite/:token" element={<InvitePage />} />
      <Route path="/redefinir-senha/:token" element={<ResetPasswordPage />} />
      <Route element={<RequireSession />}>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/contatos" element={<ContactsPage />} />
        <Route path="/respostas-rapidas" element={<QuickRepliesPage />} />
        <Route path="/funis" element={<FunnelsPage />} />
        <Route path="/funis/:id" element={<FunnelsPage />} />
        <Route element={<InboxPage />}>
          <Route path="/" element={<NoConversationSelected />} />
          <Route path="/conversas/:id" element={<ConversationPage />} />
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/conexao" element={<ConnectionPage />} />
          <Route path="/equipe" element={<TeamPage />} />
          <Route path="/etiquetas" element={<LabelsPage />} />
          <Route path="/empresa" element={<CompanyPage />} />
          <Route path="/funis/gerenciar" element={<FunnelsAdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
