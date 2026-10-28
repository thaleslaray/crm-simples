// Estado da conexão do número, compartilhado por todas as telas: busca ao abrir, acompanha o tempo real
// e se atualiza ao reconectar (pode ter perdido um evento). A faixa vermelha e a tela de conexão leem daqui.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, type ConnectionState } from "./api";
import { authClient } from "./auth-client";
import { onRealtime } from "./realtime";

const ConnectionContext = createContext<{ state: ConnectionState | null; set: (s: ConnectionState) => void }>({
  state: null,
  set: () => undefined,
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState | null>(null);
  // Cada busca e cada evento tomam um número; só vale a resposta da busca que ainda é a mais nova (a velha não desfaz o evento).
  const version = useRef(0);
  const set = useCallback((s: ConnectionState) => {
    version.current++;
    setState(s);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const mine = ++version.current;
      api
        .connection()
        .then((r) => alive && mine === version.current && setState(r.connection))
        .catch(() => undefined);
    };
    load();
    const off = onRealtime((event) => {
      if (event.type === "connection.changed") set(event.connection);
      else if (event.type === "reconnected") load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [set]);

  return <ConnectionContext.Provider value={{ state, set }}>{children}</ConnectionContext.Provider>;
}

export const useConnection = () => useContext(ConnectionContext);

/** Faixa vermelha no topo de todas as telas enquanto o número não estiver conectado. Some sozinha ao voltar. */
export function ConnectionBanner() {
  const { state } = useConnection();
  const { data } = authClient.useSession();
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";
  if (!state || state.status === "connected" || state.status === "unknown") return null;
  const text = state.temporaryBan
    ? "WhatsApp baniu o número temporariamente: as mensagens não estão chegando."
    : state.status === "connecting"
      ? "WhatsApp conectando: as mensagens não estão chegando."
      : "WhatsApp desconectado: as mensagens não estão chegando.";
  return (
    <div className="conn-banner" role="alert">
      <span>{text}</span>
      {isAdmin && (
        <Link to="/conexao" className="conn-banner-action">
          Reconectar
        </Link>
      )}
    </div>
  );
}
