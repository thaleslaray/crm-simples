# 08: Funis em largura total

**What to build:** o kanban ocupa toda a área ao lado da barra de ícones. No topo ficam o título, os chips para trocar de funil e um filtro de cards; abaixo, as colunas por etapa sobre o fundo do chat, com cards no estilo dos balões (foto, nome, hora, prévia, status e etiquetas). Clicar no card abre a conversa. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). História 33.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** done

- [x] Cabeçalho: "Funis", chips dos funis (substituem o seletor atual), filtro de cards
- [x] Colunas de ~280px com nome e contagem; rolagem horizontal; no celular, colunas de ~82% da largura
- [x] Card: foto/iniciais, nome, hora, prévia, `StatusPill` e até 2 `LabelTag`; clique abre a conversa
- [x] Arrastar entre etapas continua como hoje
- [x] E2E: trocar de funil pelos chips; o card abre a conversa; arrastar continua funcionando
- [x] Prints em desktop e celular, nos temas claro e escuro

## Comments

2026-10-28: quadro em largura total em `src/web/pages/FunnelsPage.tsx`: cabeçalho com "Funis", chips dos funis (botões com `aria-pressed`, substituem o seletor), busca "Filtrar cards" (local) e os filtros de etiqueta/responsável mantidos; colunas de 280px (82% no celular); card com foto/iniciais, nome, hora, prévia, `StatusPill` e até 2 `LabelTag` (+N); clicar abre a conversa; "Ficha", mover de etapa e "Tirar do funil" foram para o menu ⋮ do card; arrastar continua pela alça. A API do quadro agora traz `status`, `avatarUrl` e `lastMessage` por card (teste em `test/funis.test.ts`). Novos: `src/web/components/StatusPill.tsx`, `LabelTag.tsx`; token `--shadow`. `e2e/funis.spec.ts` ajustado (chips, card abre conversa, menu). `/funis/gerenciar` intocado.
