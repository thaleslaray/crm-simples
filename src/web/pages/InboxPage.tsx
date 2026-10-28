import { useNavigate } from "react-router";
import { authClient } from "../auth-client";

export function InboxPage() {
  const navigate = useNavigate();
  const { data } = authClient.useSession();

  async function signOut() {
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Caixa de entrada</h1>
        <div className="user">
          <span data-testid="user-name">{data?.user.name}</span>
          <button type="button" className="secondary" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>
      <main className="empty">
        <p>Nenhuma conversa ainda</p>
      </main>
    </div>
  );
}
