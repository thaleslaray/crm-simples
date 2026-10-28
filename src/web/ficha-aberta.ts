const KEY = "crm.fichaAberta";

/** Computador (≥768px): a ficha é uma coluna e a escolha vale para este aparelho. No celular ela é tela cheia e não se lembra. */
function isDesktop(): boolean {
  return window.matchMedia("(min-width: 768px)").matches;
}

/** Lê se a ficha ficou aberta (localStorage, com try/catch). Começa fechada. */
export function readFichaAberta(): boolean {
  if (!isDesktop()) return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Lembra a escolha neste aparelho (só no computador). */
export function saveFichaAberta(open: boolean): void {
  if (!isDesktop()) return;
  try {
    localStorage.setItem(KEY, open ? "1" : "0");
  } catch {
    // Sem armazenamento (janela privada, bloqueado): só não lembra.
  }
}
