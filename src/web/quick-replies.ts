import type { QuickReply } from "./api";

/** Consulta de `/` no começo do campo (sem espaços): `/ol` devolve "ol"; qualquer outro texto devolve null. */
export function slashQuery(draft: string): string | null {
  const m = /^\/(\S*)$/.exec(draft);
  return m ? m[1]!.toLowerCase() : null;
}

/** Filtra por atalho ou texto, atalhos que começam pela consulta primeiro. */
export function filterQuickReplies(list: QuickReply[], query: string): QuickReply[] {
  const q = query.toLowerCase();
  const hits = list.filter((r) => r.shortcut.includes(q) || r.text.toLowerCase().includes(q));
  return [...hits.filter((r) => r.shortcut.startsWith(q)), ...hits.filter((r) => !r.shortcut.startsWith(q))];
}

/** Troca `{nome}` pelo nome do contato. */
export function fillName(text: string, name: string | null): string {
  return text.replaceAll("{nome}", name?.trim() ?? "");
}
