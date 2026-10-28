import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { firstAccess } from "../api";

/** Pergunta ao servidor se o CRM ainda precisa do primeiro admin. `null` = ainda carregando (ou falhou: segue o login). */
export function useSetupNeeded(): boolean | null {
  const [needed, setNeeded] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    firstAccess
      .needed()
      .then((r) => alive && setNeeded(r.ok ? r.data.needed : false))
      .catch(() => alive && setNeeded(false));
    return () => {
      alive = false;
    };
  }, []);
  return needed;
}

/** Primeiro acesso: quem instalou cria o admin com o código de instalação (SETUP_CODE) e já entra. */
export function FirstAccessPage() {
  const needed = useSetupNeeded();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    const r = await firstAccess.create({
      code: String(form.get("code") ?? ""),
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setSubmitting(false);
    // Recarrega por inteiro: a sessão acabou de nascer e o cliente de auth precisa lê-la do zero.
    if (r.ok) return window.location.assign("/");
    if (r.status === 429) setError("Muitas tentativas. Espere um minuto e tente de novo.");
    else if (r.status === 403) setError("O código de instalação não confere, ou este CRM já tem um administrador.");
    else if (r.status === 400) setError("Confira os dados: nome, e-mail e senha com pelo menos 12 caracteres.");
    else setError("Não foi possível criar o acesso agora. Tente de novo em instantes.");
  }

  if (needed === null)
    return (
      <main className="center">
        <p className="muted">Carregando…</p>
      </main>
    );
  if (!needed) return <Navigate to="/login" replace />;

  return (
    <main className="center">
      <form className="card" onSubmit={onSubmit}>
        <h1>Primeiro acesso</h1>
        <p className="muted">Crie o administrador do seu CRM. O código de instalação é o que você definiu como SETUP_CODE na instalação.</p>
        <label>
          Código de instalação
          <input name="code" type="password" autoComplete="off" required />
        </label>
        <label>
          Nome
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha (mínimo 12 caracteres)
          <input name="password" type="password" autoComplete="new-password" minLength={12} required />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? "Criando…" : "Criar administrador e entrar"}
        </button>
      </form>
    </main>
  );
}
