// Nome da empresa: um valor global, buscado uma vez e mantido em dia pelo evento `workspace.changed`.
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";
import { DEFAULT_COMPANY_NAME } from "../shared/workspace";

// Último nome conhecido neste navegador: a aba já abre com ele, sem piscar o padrão até a resposta chegar.
// O index.html lê a mesma chave antes do React subir.
export const COMPANY_NAME_KEY = "crm.company-name";

function remembered(): string {
  try {
    return localStorage.getItem(COMPANY_NAME_KEY)?.trim() || DEFAULT_COMPANY_NAME;
  } catch {
    return DEFAULT_COMPANY_NAME;
  }
}

let name = remembered();
let inFlight = false;
// Cada troca (evento) invalida a busca que saiu antes dela: a resposta velha não desfaz o nome novo.
let version = 0;
const subscribers = new Set<() => void>();

function set(next: string) {
  if (next === name) return;
  name = next;
  try {
    localStorage.setItem(COMPANY_NAME_KEY, next);
  } catch {
    // sem armazenamento (janela privada): só perde o cache
  }
  subscribers.forEach((s) => s());
}

function load() {
  if (inFlight) return;
  inFlight = true;
  const mine = version;
  api
    .workspace()
    .then((r) => mine === version && set(r.companyName))
    .catch(() => undefined)
    .finally(() => {
      inFlight = false;
    });
}

onRealtime((event) => {
  if (event.type === "workspace.changed") {
    version++;
    set(event.companyName);
  }
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
