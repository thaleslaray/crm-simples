import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, api, type QuickReply } from "../api";

/** Cadastro das respostas rápidas da equipe (só admin; o servidor também barra). */
export function QuickRepliesPage() {
  const [list, setList] = useState<QuickReply[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [text, setText] = useState("");

  const load = useCallback(() => {
    api.me().then((m) => (m.user.role === "admin" ? api.quickReplies().then((r) => setList(r.quickReplies)) : setForbidden(true)))
      .catch(() => setError("Não foi possível carregar."));
  }, []);
  useEffect(load, [load]);

  function reset() {
    setEditing(null);
    setShortcut("");
    setText("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) await api.updateQuickReply(editing, { shortcut, text });
      else await api.createQuickReply({ shortcut, text });
      reset();
      load();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Já existe uma resposta com esse atalho."
          : "Não foi possível salvar. Confira o atalho (sem espaços) e o texto.",
      );
    }
  }

  async function remove(r: QuickReply) {
    if (!confirm(`Apagar a resposta /${r.shortcut}?`)) return;
    setError(null);
    try {
      await api.deleteQuickReply(r.id);
      if (editing === r.id) reset();
      load();
    } catch {
      setError("Não foi possível apagar.");
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Respostas rápidas</h1>
        <Link to="/">Voltar</Link>
      </header>
      <main className="profile qr-admin">
        {forbidden ? (
          <p role="alert">Só o admin cadastra respostas rápidas.</p>
        ) : (
          <>
            <form className="qr-form" onSubmit={save}>
              <label>
                Atalho (sem espaços)
                <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="ola" maxLength={40} />
              </label>
              <label>
                Texto
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Olá {nome}, tudo bem?" />
              </label>
              <p className="muted">Use {"{nome}"} para inserir o nome do contato.</p>
              <div className="qr-actions">
                <button type="submit" disabled={!shortcut.trim() || !text.trim()}>
                  {editing ? "Salvar alterações" : "Adicionar"}
                </button>
                {editing && (
                  <button type="button" className="secondary" onClick={reset}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {list === null ? (
              <p className="muted">Carregando…</p>
            ) : list.length === 0 ? (
              <p className="muted">Nenhuma resposta rápida ainda.</p>
            ) : (
              <ul className="qr-list" aria-label="Respostas cadastradas">
                {list.map((r) => (
                  <li key={r.id}>
                    <div className="qr-item-text">
                      <strong>/{r.shortcut}</strong>
                      <span>{r.text}</span>
                    </div>
                    <div className="qr-actions">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Editar /${r.shortcut}`}
                        onClick={() => (setEditing(r.id), setShortcut(r.shortcut), setText(r.text))}
                      >
                        Editar
                      </button>
                      <button type="button" className="secondary" aria-label={`Apagar /${r.shortcut}`} onClick={() => void remove(r)}>
                        Apagar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
