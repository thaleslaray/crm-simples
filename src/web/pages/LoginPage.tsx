import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { authClient } from "../auth-client";
import { useCompanyName } from "../workspace";

export function LoginPage() {
  const navigate = useNavigate();
  const companyName = useCompanyName();
  useEffect(() => {
    document.title = companyName;
  }, [companyName]);
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setSubmitting(false);
    if (error) {
      const invalid = error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD";
      setError(invalid ? "E-mail ou senha incorretos." : "Não foi possível entrar agora. Tente de novo em instantes.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <main className="center">
      <form className="card" onSubmit={onSubmit}>
        <p className="muted" data-testid="company-name-login">
          {companyName}
        </p>
        <h1>Entrar</h1>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
