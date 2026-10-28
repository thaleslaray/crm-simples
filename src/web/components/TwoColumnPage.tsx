import type { ReactNode } from "react";

interface TwoColumnPageProps {
  /** Coluna da esquerda (lista). */
  list: ReactNode;
  /** Coluna da direita (detalhe). */
  detail: ReactNode;
  /** Com detalhe aberto, o celular mostra só ele; sem, mostra só a lista. No computador as duas colunas ficam sempre. */
  hasDetail: boolean;
}

/** Molde das Configurações do WhatsApp Web: lista à esquerda, detalhe à direita; no celular, uma tela por vez. */
export function TwoColumnPage({ list, detail, hasDetail }: TwoColumnPageProps) {
  return (
    <div className={`two-col${hasDetail ? " two-col--detail" : ""}`}>
      <div className="two-col-list">{list}</div>
      <div className="two-col-detail">{detail}</div>
    </div>
  );
}
