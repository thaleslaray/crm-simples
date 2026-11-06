# 04: Negócio na conversa

**What to build:** faixa discreta abaixo do `ChatHeader` com o negócio aberto do contato ("Curso · R$ 997 · Qualificação") e botões Ganhou/Perdeu; com mais de um aberto, mostra o mais recente e "+1"; sem nenhum, "+ Negócio". Atualiza em tempo real. Desktop e celular. Spec: história 13.

**Blocked by:** 03

**Status:** done

- [x] Faixa com os três estados (nenhum, um, vários)
- [x] "+ Negócio" reaproveita o diálogo do ticket 02 com o contato já escolhido
- [x] Evento em tempo real atualiza a faixa
- [x] E2E desktop e celular; prints claro/escuro

## Comments

### 2026-11-06

Feito. `DealStrip` (`src/web/components/DealStrip.tsx`) entra logo abaixo do `ChatHeader` em `ConversationPage`.
- Sem rota nova: lê `api.ficha(contatoId).deals`, filtra os abertos e mostra o último (mais recente, pois a API ordena do mais antigo ao mais novo) como "Produto · R$ valor · Etapa", com `+N` quando há mais abertos (abre a ficha e rola até o bloco Negócios, via prop `scrollToDeals` do `ContactPanel`).
- Ganhou/Perdeu reaproveitam `CloseDealDialog`. "+ Negócio" abre o diálogo "Novo negócio" (funil, etapa, `DealFields`) com o contato da conversa já definido.
- Tempo real: recarrega em `funnel.changed` e `reconnected` (criar/fechar/mover já publicam `funnel.changed`).
- Celular: a faixa some quando a ficha ocupa a tela, como o cabeçalho. Nome do produto trunca com reticências, sem overflow horizontal.
- E2E `e2e/faixa-do-negocio.spec.ts`: nenhum/um/vários, Ganhou e Perdeu pela faixa, "+ Negócio" cria, `+1` abre a ficha, atualização em tempo real por outra sessão; desktop e celular, claro e escuro. Prints em `.wrangler/prints04/faixa-*`.
