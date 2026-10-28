// Rascunho por conversa: sobrevive à troca de conversa (e ao recarregar a aba) enquanto a aba existir.
// Fica no sessionStorage (some ao fechar a aba) com um Map de reserva se o navegador bloquear o storage.
const KEY = "crm:rascunhos";
const memory = new Map<string, string>();

function load(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return Object.fromEntries(memory);
  }
}

export function getDraft(conversationId: string): string {
  return load()[conversationId] ?? memory.get(conversationId) ?? "";
}

export function setDraft(conversationId: string, text: string): void {
  if (text) memory.set(conversationId, text);
  else memory.delete(conversationId);
  try {
    const all = load();
    if (text) all[conversationId] = text;
    else delete all[conversationId];
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Sem storage: o Map em memória segura o rascunho.
  }
}

/** Ao sair, os rascunhos não ficam para a próxima pessoa que usar o navegador. */
export function clearDrafts(): void {
  memory.clear();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
