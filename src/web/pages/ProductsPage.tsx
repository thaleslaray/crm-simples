import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Product } from "../api";
import { authClient } from "../auth-client";
import { centsFromInput, formatMoney } from "../format";
import { onRealtime } from "../realtime";

/** Cadastro dos produtos (só admin; o servidor também barra). Arquivar tira da lista de escolha e mantém os negócios antigos. */
export function ProductsPage() {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const [list, setList] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cents, setCents] = useState(0);

  const load = useCallback(() => {
    api.products().then((r) => setList(r.products)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    return onRealtime((e) => {
      if (e.type === "products.changed" || e.type === "reconnected") load();
    });
  }, [load]);

  function reset() {
    setEditing(null);
    setName("");
    setCents(0);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) await api.updateProduct(editing, { name, priceCents: cents });
      else await api.createProduct({ name, priceCents: cents });
      reset();
      load();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Já existe um produto com esse nome."
          : "Não foi possível salvar. Confira o nome (até 80 letras).",
      );
    }
  }

  async function archive(p: Product) {
    if (!confirm(`Arquivar o produto "${p.name}"? Ele sai da lista de escolha e continua nos negócios antigos.`)) return;
    setError(null);
    try {
      await api.updateProduct(p.id, { archived: true });
      if (editing === p.id) reset();
      load();
    } catch {
      setError("Não foi possível arquivar.");
    }
  }

  return (
    <main className="profile qr-admin">
      {!isAdmin ? (
        <p role="alert">Só o admin cadastra produtos.</p>
      ) : (
        <>
          <form className="qr-form" onSubmit={save}>
            <label>
              Nome do produto
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Curso" maxLength={80} />
            </label>
            <label>
              Preço
              <input inputMode="numeric" value={formatMoney(cents)} onChange={(e) => setCents(centsFromInput(e.target.value))} />
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
            <p className="muted">Nenhum produto ainda.</p>
          ) : (
            <ul className="qr-list" aria-label="Produtos cadastrados">
              {list.map((p) => (
                <li key={p.id}>
                  <div className="qr-item-text">
                    <strong>{p.name}</strong>
                    <span className="muted">{formatMoney(p.priceCents)}</span>
                  </div>
                  <div className="qr-actions">
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`Editar ${p.name}`}
                      onClick={() => (setEditing(p.id), setName(p.name), setCents(p.priceCents))}
                    >
                      Editar
                    </button>
                    <button type="button" className="secondary" aria-label={`Arquivar ${p.name}`} onClick={() => void archive(p)}>
                      Arquivar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
