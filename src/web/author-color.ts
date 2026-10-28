// Cor estável do atendente no topo do balão verde: a mesma pessoa tem sempre a mesma cor,
// derivada do id (as 8 cores de `--author-N` em styles.css são legíveis nos dois temas).
const PALETTE = 8;

export function authorColorVar(key: string | null | undefined): string {
  let h = 0;
  for (const ch of key ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(--author-${h % PALETTE})`;
}
