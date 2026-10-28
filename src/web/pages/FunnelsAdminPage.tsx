import { useState } from "react";
import { ApiError, api, type Funnel } from "../api";
import { authClient } from "../auth-client";
import { useFunnels } from "../funnels";

/** Cadastro de funis e etapas (só admin; o servidor também barra). */
export function FunnelsAdminPage() {
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  const funnels = useFunnels();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, failure = "Não foi possível salvar. Confira o nome (até 80 letras).") {
    setError(null);
    try {
      await action();
      return true;
    } catch {
      setError(failure);
      return false;
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => api.createFunnel(name))) setName("");
  }

  return (
    <main className="profile qr-admin funnels-admin">
      {!isAdmin ? (
        <p role="alert">Só o admin cadastra funis.</p>
      ) : (
        <>
          <form className="qr-form" onSubmit={(e) => void create(e)}>
            <label>
              Nome do funil
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendas" maxLength={80} />
            </label>
            <div className="qr-actions">
              <button type="submit" disabled={!name.trim()}>
                Criar funil
              </button>
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {funnels === null ? (
            <p className="muted">Carregando…</p>
          ) : funnels.length === 0 ? (
            <p className="muted">Nenhum funil ainda.</p>
          ) : (
            funnels.map((f) => <FunnelEditor key={f.id} funnel={f} run={run} />)
          )}
        </>
      )}
    </main>
  );
}

function FunnelEditor({ funnel, run }: { funnel: Funnel; run: (a: () => Promise<unknown>, failure?: string) => Promise<boolean> }) {
  const [name, setName] = useState(funnel.name);
  const [stageName, setStageName] = useState("");

  async function move(index: number, by: -1 | 1) {
    const ids = funnel.stages.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    await run(() => api.reorderStages(funnel.id, ids));
  }

  return (
    <section className="funnel-editor" aria-label={`Funil ${funnel.name}`}>
      <form
        className="funnel-editor-head"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.renameFunnel(funnel.id, name));
        }}
      >
        <input aria-label={`Nome do funil ${funnel.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button type="submit" className="secondary" disabled={!name.trim() || name.trim() === funnel.name}>
          Renomear
        </button>
        <button
          type="button"
          className="secondary danger"
          aria-label={`Apagar funil ${funnel.name}`}
          onClick={() => confirm(`Apagar o funil "${funnel.name}"? Os cards dele somem (os contatos ficam).`) && void run(() => api.deleteFunnel(funnel.id), "Não foi possível apagar.")}
        >
          Apagar funil
        </button>
      </form>
      <ol className="stage-list" aria-label={`Etapas de ${funnel.name}`}>
        {funnel.stages.map((s, i) => (
          <StageRow key={s.id} funnel={funnel} stage={s} first={i === 0} last={i === funnel.stages.length - 1} onMove={(by) => void move(i, by)} run={run} />
        ))}
      </ol>
      <form
        className="funnel-editor-head"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.addStage(funnel.id, stageName)).then((ok) => ok && setStageName(""));
        }}
      >
        <input aria-label={`Nova etapa em ${funnel.name}`} placeholder="Nova etapa" value={stageName} onChange={(e) => setStageName(e.target.value)} maxLength={80} />
        <button type="submit" disabled={!stageName.trim()} aria-label={`Adicionar etapa em ${funnel.name}`}>
          Adicionar etapa
        </button>
      </form>
    </section>
  );
}

function StageRow(props: {
  funnel: Funnel;
  stage: Funnel["stages"][number];
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  run: (a: () => Promise<unknown>, failure?: string) => Promise<boolean>;
}) {
  const { funnel, stage, run } = props;
  const [name, setName] = useState(stage.name);
  // Preenchido quando o servidor avisa que a etapa tem cards: o admin escolhe para onde levá-los.
  const [needsDestination, setNeedsDestination] = useState(false);
  const others = funnel.stages.filter((s) => s.id !== stage.id);
  const [destination, setDestination] = useState("");

  async function remove(moveTo?: string) {
    try {
      await api.deleteStage(funnel.id, stage.id, moveTo);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return setNeedsDestination(true);
      await run(() => Promise.reject(err), "Não foi possível apagar a etapa.");
    }
  }

  return (
    <li className="stage-row">
      <form
        className="funnel-editor-head"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.renameStage(funnel.id, stage.id, name));
        }}
      >
        <input aria-label={`Nome da etapa ${stage.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button type="submit" className="secondary" disabled={!name.trim() || name.trim() === stage.name} aria-label={`Renomear etapa ${stage.name}`}>
          Renomear
        </button>
        <button type="button" className="secondary" disabled={props.first} aria-label={`Subir etapa ${stage.name}`} onClick={() => props.onMove(-1)}>
          ↑
        </button>
        <button type="button" className="secondary" disabled={props.last} aria-label={`Descer etapa ${stage.name}`} onClick={() => props.onMove(1)}>
          ↓
        </button>
        <button type="button" className="secondary danger" aria-label={`Apagar etapa ${stage.name}`} onClick={() => void remove()}>
          Apagar
        </button>
      </form>
      {needsDestination && (
        <div className="stage-destination" role="group" aria-label={`Destino dos cards de ${stage.name}`}>
          {others.length === 0 ? (
            <p className="muted">Esta etapa tem cards. Crie outra etapa para receber os cards antes de apagá-la.</p>
          ) : (
            <>
              <p className="muted">Esta etapa tem cards. Para onde levá-los?</p>
              <select aria-label={`Mover os cards de ${stage.name} para`} value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="">Escolha a etapa…</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!destination} aria-label={`Confirmar apagar etapa ${stage.name}`} onClick={() => void remove(destination)}>
                Mover e apagar
              </button>
            </>
          )}
          <button type="button" className="secondary" onClick={() => setNeedsDestination(false)}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}
