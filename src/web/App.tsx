import { Navigate, Outlet, Route, Routes } from "react-router";
import { authClient } from "./auth-client";
import { ConversationPage } from "./pages/ConversationPage";
import { InboxPage, NoConversationSelected } from "./pages/InboxPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";

/** Rota protegida: sem sessao, redireciona para /login. */
function RequireSession() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <p className="center muted">Carregando…</p>;
  if (!data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route element={<InboxPage />}>
          <Route path="/" element={<NoConversationSelected />} />
          <Route path="/conversas/:id" element={<ConversationPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
