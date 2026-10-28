import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type Member, type TeamMember } from "../api";
import { authClient } from "../auth-client";

const ROLE_LABEL: Record<Member["role"], string> = { admin: "Administrador", atendente: "Atendente" };

/** Equipe (só admin; o servidor também barra): convites, papéis, remoção e links de redefinição de senha. */
export function TeamPage() {
  const { data: session } = authClient.useSession();
  const myId = session?.user.id;
  const [list, setList] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<Member["role"]>("atendente");
  /** Link gerado (convite ou redefinição), mostrado para o admin copiar e enviar por onde quiser. */
  const [generated, setGenerated] = useState<{ label: string; url: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api
      .team()
      .then((r) => setList(r.members))
      .catch(() => setError("Não foi possível carregar a equipe."));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<void>, failure: string) {
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
    }
  }

  const show = (label: string, r: { path: string; expiresAt: number }) => {
    setCopied(false);
    setGenerated({ label, url: `${window.location.origin}${r.path}`, expiresAt: r.expiresAt });
  };

  const invite = () =>
    run(async () => show(`Convite de ${ROLE_LABEL[inviteRole].toLowerCase()}`, await api.createInvite(inviteRole)), "Não foi possível gerar o convite.");

  const resetLink = (m: TeamMember) =>
    run(async () => show(`Redefinição de senha de ${m.name}`, await api.createResetLink(m.id)), "Não foi possível gerar o link.");

  const changeRole = (m: TeamMember, role: Member["role"]) =>
    run(async () => {
      await api.changeRole(m.id, role);
      load();
    }, "Não foi possível mudar o papel.");

  const remove = (m: TeamMember) => {
    if (!confirm(`Remover ${m.name}? Ele perde o acesso agora e as conversas dele voltam para a caixa de entrada.`)) return;
    return run(async () => {
      await api.removeMember(m.id);
      load();
    }, "Não foi possível remover.");
  };

  async function copy() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Equipe</h1>
        <Link to="/" className="link">
          Caixa de entrada
        </Link>
      </header>
      <main className="team-page">
        <section className="card team-card" aria-label="Convidar">
          <h2>Convidar alguém</h2>
          <div className="team-invite">
            <select aria-label="Papel do convidado" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Member["role"])}>
              <option value="atendente">Atendente</option>
              <option value="admin">Administrador</option>
            </select>
            <button type="button" onClick={invite}>
              Gerar link de convite
            </button>
          </div>
          {generated && (
            <div className="team-link" role="status">
              <strong>{generated.label}</strong>
              <input readOnly aria-label="Link gerado" value={generated.url} onFocus={(e) => e.currentTarget.select()} />
              <p className="muted">Uso único. Vale até {new Date(generated.expiresAt).toLocaleString("pt-BR")}.</p>
              <button type="button" className="secondary" onClick={copy}>
                {copied ? "Copiado" : "Copiar link"}
              </button>
            </div>
          )}
        </section>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <ul className="team-list" aria-label="Membros">
          {(list ?? []).map((m) => {
            const me = m.id === myId;
            return (
              <li key={m.id} data-testid="team-member">
                <div className="team-who">
                  <strong>{m.name}</strong>
                  <span className="muted">{m.email}</span>
                </div>
                <div className="team-actions">
                  <select
                    aria-label={`Papel de ${m.name}`}
                    value={m.role}
                    disabled={me}
                    onChange={(e) => changeRole(m, e.target.value as Member["role"])}
                  >
                    <option value="atendente">Atendente</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button type="button" className="secondary" onClick={() => resetLink(m)}>
                    Link de nova senha
                  </button>
                  {!me && (
                    <button type="button" className="secondary danger" onClick={() => remove(m)}>
                      Remover
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
