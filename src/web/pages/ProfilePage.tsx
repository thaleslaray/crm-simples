import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { authClient } from "../auth-client";

/** Perfil: hoje só a preferência de assinar as mensagens com o próprio nome. */
export function ProfilePage() {
  const { data } = authClient.useSession();
  const [signature, setSignature] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .preferences()
      .then((p) => alive && setSignature(p.signatureEnabled))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(next: boolean) {
    setError(false);
    const before = signature;
    setSignature(next);
    try {
      setSignature((await api.setSignature(next)).signatureEnabled);
    } catch {
      setSignature(before);
      setError(true);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Meu perfil</h1>
        <Link to="/">Voltar</Link>
      </header>
      <main className="profile">
        <p>
          <strong>{data?.user.name}</strong>
          <br />
          <span className="muted">{data?.user.email}</span>
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={signature ?? true}
            disabled={signature === null}
            onChange={(e) => void toggle(e.target.checked)}
          />
          <span>Assinar minhas mensagens com meu nome</span>
        </label>
        <p className="muted">O cliente vê o seu nome no começo de cada mensagem, assim: *{data?.user.name}:*</p>
        {error && (
          <p className="error" role="alert">
            Não foi possível salvar. Tente de novo.
          </p>
        )}
      </main>
    </div>
  );
}
