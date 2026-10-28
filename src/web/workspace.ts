// Nome da empresa: um valor global, buscado uma vez e mantido em dia pelo evento `workspace.changed`.
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";

export const DEFAULT_COMPANY_NAME = "Atendimento";

let name = DEFAULT_COMPANY_NAME;
let inFlight = false;
const subscribers = new Set<() => void>();

function set(next: string) {
  if (next === name) return;
  name = next;
  subscribers.forEach((s) => s());
}

function load() {
  if (inFlight) return;
  inFlight = true;
  api
    .workspace()
    .then((r) => set(r.companyName))
    .catch(() => undefined)
    .finally(() => {
      inFlight = false;
    });
}

onRealtime((event) => {
  if (event.type === "workspace.changed") set(event.companyName);
  else if (event.type === "reconnected") load();
});

/** Nome atual da empresa (o padrão até a resposta chegar). */
export const getCompanyName = () => name;

/** Assina mudanças do nome; devolve o cancelamento. */
export function onCompanyName(listener: () => void): () => void {
  subscribers.add(listener);
  return () => void subscribers.delete(listener);
}

/** Nome da empresa para qualquer tela (login inclusive). Troca sozinho quando o admin salva. */
export function useCompanyName(): string {
  useEffect(() => {
    // A cada montagem: a área logada pode ser remontada e perder um evento no meio.
    load();
  }, []);
  return useSyncExternalStore(onCompanyName, getCompanyName);
}
