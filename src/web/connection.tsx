// Estado da conexão do número, compartilhado por todas as telas: busca ao abrir, acompanha o tempo real
// e se atualiza ao reconectar (pode ter perdido um evento). A faixa vermelha e a tela de conexão leem daqui.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type ConnectionState } from "./api";
import { onRealtime } from "./realtime";

const ConnectionContext = createContext<{ state: ConnectionState | null; set: (s: ConnectionState) => void }>({
  state: null,
  set: () => undefined,
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .connection()
        .then((r) => alive && setState(r.connection))
        .catch(() => undefined);
    load();
    const off = onRealtime((event) => {
      if (event.type === "connection.changed") setState(event.connection);
      else if (event.type === "reconnected") load();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return <ConnectionContext.Provider value={{ state, set: setState }}>{children}</ConnectionContext.Provider>;
}

export const useConnection = () => useContext(ConnectionContext);

/** Faixa vermelha no topo de todas as telas enquanto o número não estiver conectado. Some sozinha ao voltar. */
export function ConnectionBanner() {
  const { state } = useConnection();
  if (!state || state.status === "connected" || state.status === "unknown") return null;
  const text = state.temporaryBan
    ? "O WhatsApp baniu o número temporariamente. Mensagens não estão chegando nem saindo."
    : state.status === "connecting"
      ? "Número conectando ao WhatsApp. Mensagens não estão chegando nem saindo."
      : "Número do WhatsApp desconectado. Mensagens não estão chegando nem saindo.";
  return (
    <div className="conn-banner" role="alert">
      {text}
    </div>
  );
}
