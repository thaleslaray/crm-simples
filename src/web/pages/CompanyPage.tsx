import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { authClient } from "../auth-client";

/** Nome da empresa (só admin; o servidor também barra). */
export function CompanyPage() {
  const { data } = authClient.useSession();
  const isAdmin =
    (data?.user as { role?: string } | undefined)?.role === "admin";
  // O campo só aparece depois de carregar o nome salvo, para a resposta não apagar o que a pessoa já digitou.
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .workspace()
      .then((r) => setName(r.companyName))
      .catch(() =>
        setMsg({ ok: false, text: "Não foi possível carregar o nome." }),
      );
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.setCompanyName(name ?? "");
      setMsg({ ok: true, text: "Nome salvo." });
    } catch {
      setMsg({
        ok: false,
        text: "Não foi possível salvar. O nome precisa ter de 1 a 60 letras.",
      });
    }
  }

  return (
    <main className="profile qr-admin">
      {!isAdmin ? (
        <p role="alert">Só o admin muda o nome da empresa.</p>
      ) : name === null ? (
        <p className="muted">Carregando…</p>
      ) : (
        <form className="qr-form" onSubmit={save}>
          <label>
            Nome da empresa
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </label>
          <div className="qr-actions">
            <button type="submit" disabled={!name.trim()}>
              Salvar
            </button>
          </div>
          {msg && (
            <p
              className={msg.ok ? "muted" : "error"}
              role={msg.ok ? "status" : "alert"}
            >
              {msg.text}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
