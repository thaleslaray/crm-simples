import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { useConnection } from "../connection";

const QR_POLL_MS = 3000;

/** Conexão do número (só admin): status e QR code, que se atualiza sozinho enquanto estiver conectando. */
export function ConnectionPage() {
  const { state, set } = useConnection();
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state?.status ?? "unknown";

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
    <div className="shell">
      <header className="topbar">
        <h1>Conexão do número</h1>
        <Link to="/" className="link">
          Caixa de entrada
        </Link>
      </header>
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
          {status !== "connected" && (
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
    </div>
  );
}

function statusLabel(status: string, temporaryBan: boolean): string {
  if (temporaryBan) return "Banido temporariamente";
  if (status === "connected") return "Conectado";
  if (status === "connecting") return "Conectando";
  if (status === "disconnected") return "Desconectado";
  return "Status ainda desconhecido";
}
