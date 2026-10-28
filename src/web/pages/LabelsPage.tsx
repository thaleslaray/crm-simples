import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, api, type Label } from "../api";
import { LabelChip, useLabels } from "../labels";
import { authClient } from "../auth-client";

const DEFAULT_COLOR = "#2563eb";

/** Cadastro das etiquetas da equipe (só admin; o servidor também barra). */
export function LabelsPage() {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const labels = useLabels();
  const [list, setList] = useState<Label[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  // `useLabels` já mantém a lista em dia (inclusive por tempo real); aqui só distinguimos "carregando".
  useEffect(() => setList(labels), [labels]);

  function reset() {
    setEditing(null);
    setName("");
    setColor(DEFAULT_COLOR);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) await api.updateLabel(editing, { name, color });
      else await api.createLabel({ name, color });
      reset();
      setList((await api.labels()).labels);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Já existe uma etiqueta com esse nome."
          : "Não foi possível salvar. Confira o nome (até 40 letras).",
      );
    }
  }

  async function remove(l: Label) {
    if (!confirm(`Apagar a etiqueta "${l.name}"? Ela sai de todos os contatos.`)) return;
    setError(null);
    try {
      await api.deleteLabel(l.id);
      if (editing === l.id) reset();
      setList((await api.labels()).labels);
    } catch {
      setError("Não foi possível apagar.");
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Etiquetas</h1>
        <Link to="/">Voltar</Link>
      </header>
      <main className="profile qr-admin">
        {!isAdmin ? (
          <p role="alert">Só o admin cadastra etiquetas.</p>
        ) : (
          <>
            <form className="qr-form" onSubmit={save}>
              <label>
                Nome da etiqueta
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP" maxLength={40} />
              </label>
              <label>
                Cor
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-input" />
              </label>
              <div className="qr-actions">
                <button type="submit" disabled={!name.trim()}>
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
              <p className="muted">Nenhuma etiqueta ainda.</p>
            ) : (
              <ul className="qr-list" aria-label="Etiquetas cadastradas">
                {list.map((l) => (
                  <li key={l.id}>
                    <div className="qr-item-text">
                      <LabelChip label={l} />
                    </div>
                    <div className="qr-actions">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Editar ${l.name}`}
                        onClick={() => (setEditing(l.id), setName(l.name), setColor(l.color))}
                      >
                        Editar
                      </button>
                      <button type="button" className="secondary" aria-label={`Apagar ${l.name}`} onClick={() => void remove(l)}>
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
