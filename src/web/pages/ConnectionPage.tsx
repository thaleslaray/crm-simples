import { type FormEvent, useEffect, useState } from "react";
import { api, type UazapiConfigSummary, type UazapiInstanceItem } from "../api";
import { useConnection } from "../connection";

const QR_POLL_MS = 3000;

/** Conexão do número (só admin): status e QR code, que se atualiza sozinho enquanto estiver conectando. */
export function ConnectionPage() {
  const { state, set } = useConnection();
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state?.status ?? "unknown";
  const [cfg, setCfg] = useState<UazapiConfigSummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [instances, setInstances] = useState<UazapiInstanceItem[] | null>(null);
  const [newName, setNewName] = useState("");
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);
  const adminConfigured = Boolean(cfg?.adminTokenHint);
  const instanceId = cfg?.instance?.id ?? null;

  useEffect(() => {
    api
      .uazapiConfig()
      .then(setCfg)
      .catch(() => setCfgMsg("Não foi possível carregar os dados da Uazapi."));
  }, []);

  // Com admin token guardado, lista as instâncias do servidor (e refaz a lista ao trocar a escolhida).
  useEffect(() => {
    if (!adminConfigured || editing) return;
    let alive = true;
    api
      .uazapiInstances()
      .then((r) => alive && setInstances(r.instances))
      .catch(() => alive && setCfgMsg("Não foi possível listar as instâncias. Confira se o servidor da Uazapi está no ar."));
    return () => {
      alive = false;
    };
  }, [adminConfigured, editing, instanceId]);

  // O estado do número muda quando a instância muda: pergunta de novo à Uazapi.
  const refreshStatus = () =>
    api
      .connectionStatus()
      .then((r) => set(r.connection))
      .catch(() => undefined);

  const failure = (code?: string) =>
    code === "endereco_invalido"
      ? "Endereço inválido. Use o endereço completo, começando com https://."
      : code === "token_obrigatorio"
        ? "Informe o admin token."
        : code === "nome_obrigatorio"
          ? "Dê um nome para a instância."
          : code === "uazapi_recusou"
            ? "A Uazapi não aceitou esses dados. Confira o endereço e o admin token e tente de novo."
            : "A Uazapi não respondeu como esperado. Tente de novo em instantes.";

  async function run(action: () => Promise<UazapiConfigSummary>, after?: () => void) {
    setBusy(true);
    setCfgMsg(null);
    try {
      setCfg(await action());
      after?.();
      void refreshStatus();
    } catch (err) {
      setCfgMsg(failure((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  const saveCfg = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => api.saveUazapiConfig(baseUrl, adminToken),
      () => {
        setEditing(false);
        setAdminToken("");
      },
    );
  };

  const createInstance = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api.createUazapiInstance(newName), () => setNewName(""));
  };

  function startEditing() {
    setBaseUrl(cfg?.baseUrl ?? "");
    setAdminToken("");
    setCfgMsg(null);
    setEditing(true);
  }

  // Enquanto conectando, consulta a Uazapi de tempos em tempos: o QR code expira e o pareamento termina fora daqui.
  useEffect(() => {
    if (status !== "connecting") {
      setQrcode(null);
      return;
    }
    let alive = true;
    const tick = () =>
      api
        .connectionStatus()
        .then((r) => {
          if (!alive) return;
          set(r.connection);
          setQrcode(r.qrcode ?? null);
        })
        .catch(() => undefined);
    tick();
    const timer = setInterval(tick, QR_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [status, set]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.connect();
      set(r.connection);
      setQrcode(r.qrcode ?? null);
    } catch {
      setError("Não foi possível iniciar a conexão. Tente de novo em instantes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="conn-page">
      <section className="card conn-card" aria-label="Status do número">
        <p className={`conn-status conn-status--${status}`} data-testid="connection-status">
          {statusLabel(status, state?.temporaryBan ?? false)}
        </p>
        {state?.lastDisconnectReason && status !== "connected" && <p className="muted">Motivo: {state.lastDisconnectReason}</p>}
        {status === "connecting" && (
          <div className="qr">
            {qrcode ? (
              <img src={qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`} alt="QR code para conectar o WhatsApp" />
            ) : (
              <p className="muted">Gerando o QR code…</p>
            )}
            <p className="muted">No celular: WhatsApp, Aparelhos conectados, Conectar um aparelho. O código se atualiza sozinho.</p>
          </div>
        )}
        {cfg && (adminConfigured && !editing ? (
          <>
            <p className="muted uazapi-line" data-testid="uazapi-resumo">
              Servidor: {cfg.baseUrl} · Admin token {cfg.adminTokenHint}{" "}
              <button type="button" className="secondary" onClick={startEditing}>
                Alterar
              </button>
            </p>
            <section className="inst" aria-label="Instâncias">
              <h2 className="inst-title">Instâncias</h2>
              {instances === null ? (
                <p className="muted">Carregando as instâncias…</p>
              ) : instances.length === 0 ? (
                <p className="muted">Este servidor ainda não tem instâncias. Crie a primeira abaixo.</p>
              ) : (
                <ul className="inst-list">
                  {instances.map((i) => (
                    <li key={i.id} className={`inst-item${i.id === instanceId ? " is-current" : ""}`}>
                      <div className="inst-info">
                        <span className="inst-name">{i.name}</span>
                        <span className={`inst-pill inst-pill--${i.status}`}>{instanceStatusLabel(i.status)}</span>
                        {i.profileName && (
                          <span className="inst-profile muted">
                            {i.profilePicUrl && <img src={i.profilePicUrl} alt="" className="inst-pic" referrerPolicy="no-referrer" />}
                            {i.profileName}
                          </span>
                        )}
                      </div>
                      {i.id === instanceId ? (
                        <span className="inst-current">Em uso</span>
                      ) : (
                        <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => api.chooseUazapiInstance(i.id))}>
                          Usar esta
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form className="qr-form" onSubmit={createInstance} aria-label="Criar instância">
                <label>
                  Nova instância
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome, por exemplo Atendimento" autoComplete="off" />
                </label>
                <div className="qr-actions">
                  <button type="submit" disabled={busy || !newName.trim()}>
                    Criar
                  </button>
                </div>
              </form>
            </section>
          </>
        ) : (
          <form className="qr-form" onSubmit={saveCfg} aria-label="Dados da Uazapi">
            <label>
              Endereço do servidor
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://seu-subdominio.uazapi.com"
                inputMode="url"
                autoComplete="off"
              />
            </label>
            <label>
              Admin token
              <input
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder={adminConfigured ? "Deixe vazio para manter o atual" : ""}
                autoComplete="off"
              />
            </label>
            <div className="qr-actions">
              <button type="submit" disabled={busy || !baseUrl.trim() || (!adminConfigured && !adminToken.trim())}>
                Salvar
              </button>
              {adminConfigured && (
                <button type="button" className="secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ))}
        {cfg && !adminConfigured && !editing && !cfg.configured && <p className="muted">Informe os dados da Uazapi para escolher a instância e conectar o número.</p>}
        {cfg && adminConfigured && !editing && !cfg.instance && <p className="muted">Escolha a instância que o CRM vai usar.</p>}
        {cfgMsg && (
          <p className="error" role="alert">
            {cfgMsg}
          </p>
        )}
        {cfg?.configured && (cfg.instance || !adminConfigured) && status !== "connected" && (
          <button type="button" onClick={connect} disabled={busy}>
            {status === "connecting" ? "Gerar novo QR code" : "Conectar número"}
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function statusLabel(status: string, temporaryBan: boolean): string {
  if (temporaryBan) return "Banido temporariamente";
  if (status === "connected") return "Conectado";
  if (status === "connecting") return "Conectando";
  if (status === "disconnected") return "Desconectado";
  return "Status ainda desconhecido";
}

function instanceStatusLabel(status: string): string {
  if (status === "connected") return "Conectada";
  if (status === "connecting") return "Conectando";
  if (status === "hibernated") return "Hibernada";
  return "Desconectada";
}
