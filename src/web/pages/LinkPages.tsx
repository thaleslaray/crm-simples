import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type LinkResult, links } from "../api";

type Loaded<T> = { state: "loading" } | { state: "gone"; message: string } | { state: "ok"; data: T };

/** Carrega o link ao abrir a página; vencido, usado ou inválido vira uma mensagem clara. */
function useLink<T>(load: (token: string) => Promise<LinkResult<T>>): { token: string; loaded: Loaded<T> } {
  const { token = "" } = useParams();
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    load(token)
      .then((r) => {
        if (!alive) return;
        setLoaded(
          r.ok
            ? { state: "ok", data: r.data }
            : { state: "gone", message: r.message ?? "Este link não está disponível. Peça um novo ao administrador." },
        );
      })
      .catch(() => alive && setLoaded({ state: "gone", message: "Não foi possível abrir o link. Tente de novo em instantes." }));
    return () => {
      alive = false;
    };
  }, [token, load]);
  return { token, loaded };
}

function GoneCard({ message }: { message: string }) {
  return (
    <div className="card">
      <h1>Link indisponível</h1>
      <p role="alert">{message}</p>
      <Link to="/login" className="link">
        Ir para o login
      </Link>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="center">{children}</main>;
}

const inviteLoad = links.invite;
const resetLoad = links.reset;

/** Convidado define nome, e-mail e senha e já entra. */
export function InvitePage() {
  const { token, loaded } = useLink(inviteLoad);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    const r = await links.acceptInvite(token, {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setSubmitting(false);
    // Recarrega por inteiro: a sessão acabou de nascer e o cliente de auth precisa lê-la do zero.
    if (r.ok) return window.location.assign("/");
    if (r.status === 409) setError("Já existe uma conta com esse e-mail.");
    else if (r.status === 410) setError(r.message ?? "Este link não vale mais.");
    else setError("Confira os dados: nome, e-mail e senha com pelo menos 8 caracteres.");
  }

  if (loaded.state === "loading")
    return (
      <Shell>
        <p className="muted">Carregando…</p>
      </Shell>
    );
  if (loaded.state === "gone")
    return (
      <Shell>
        <GoneCard message={loaded.message} />
      </Shell>
    );
  return (
    <Shell>
      <form className="card" onSubmit={onSubmit}>
        <h1>Criar acesso</h1>
        <p className="muted">
          Você foi convidado como {loaded.data.role === "admin" ? "administrador" : "atendente"}.
        </p>
        <label>
          Nome
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha (mínimo 8 caracteres)
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? "Criando…" : "Criar acesso e entrar"}
        </button>
      </form>
    </Shell>
  );
}

/** Membro define a nova senha pelo link gerado pelo admin. */
export function ResetPasswordPage() {
  const { token, loaded } = useLink(resetLoad);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    const r = await links.resetPassword(token, String(form.get("password") ?? ""));
    setSubmitting(false);
    if (r.ok) return setDone(true);
    setError(r.status === 410 ? (r.message ?? "Este link não vale mais.") : "A senha precisa ter pelo menos 8 caracteres.");
  }

  if (loaded.state === "loading")
    return (
      <Shell>
        <p className="muted">Carregando…</p>
      </Shell>
    );
  if (loaded.state === "gone")
    return (
      <Shell>
        <GoneCard message={loaded.message} />
      </Shell>
    );
  if (done)
    return (
      <Shell>
        <div className="card">
          <h1>Senha alterada</h1>
          <p>Agora você já pode entrar com a nova senha.</p>
          <Link to="/login" className="link">
            Ir para o login
          </Link>
        </div>
      </Shell>
    );
  return (
    <Shell>
      <form className="card" onSubmit={onSubmit}>
        <h1>Nova senha</h1>
        <p className="muted">Defina a nova senha de {loaded.data.name}.</p>
        <label>
          Nova senha (mínimo 8 caracteres)
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </Shell>
  );
}
