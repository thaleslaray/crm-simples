import { type FormEvent, useEffect, useState } from "react";
import { api, type UazapiConfigSummary } from "../api";
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
  const [token, setToken] = useState("");
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);

  useEffect(() => {
    api
      .uazapiConfig()
      .then(setCfg)
      .catch(() => setCfgMsg("Não foi possível carregar os dados da Uazapi."));
  }, []);

  async function saveCfg(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCfgMsg(null);
    try {
      const saved = await api.saveUazapiConfig(baseUrl, token);
      setCfg(saved);
      setEditing(false);
      setToken("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      setCfgMsg(
        code === "endereco_invalido"
          ? "Endereço inválido. Use o endereço completo, começando com https://."
          : code === "token_obrigatorio"
            ? "Informe o token da instância."
            : "A Uazapi não aceitou esses dados. Confira o endereço e o token e tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setBaseUrl(cfg?.baseUrl ?? "");
    setToken("");
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
        {cfg && (cfg.configured && !editing ? (
          <p className="muted uazapi-line" data-testid="uazapi-resumo">
            Servidor: {cfg.baseUrl} · Token {cfg.tokenHint}{" "}
            <button type="button" className="secondary" onClick={startEditing}>
              Alterar
            </button>
          </p>
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
              Token da instância
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={cfg.configured ? "Deixe vazio para manter o atual" : ""}
                autoComplete="off"
              />
            </label>
            <div className="qr-actions">
              <button type="submit" disabled={busy || !baseUrl.trim() || (!cfg.configured && !token.trim())}>
                Salvar
              </button>
              {cfg.configured && (
                <button type="button" className="secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ))}
        {cfg && !cfg.configured && !editing && <p className="muted">Informe os dados da Uazapi para conectar o número.</p>}
        {cfgMsg && (
          <p className="error" role="alert">
            {cfgMsg}
          </p>
        )}
        {cfg?.configured && status !== "connected" && (
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
