# 08: Funis em largura total

**What to build:** o kanban ocupa toda a área ao lado da barra de ícones. No topo ficam o título, os chips para trocar de funil e um filtro de cards; abaixo, as colunas por etapa sobre o fundo do chat, com cards no estilo dos balões (foto, nome, hora, prévia, status e etiquetas). Clicar no card abre a conversa. Spec: `.scratch/design-whatsapp/spec.md`; referência visual: `prototipos/whatsapp/` (branch `prototipo/design-whatsapp`). História 33.

**Blocked by:** 01 (Tokens, tema e casca de navegação)

**Status:** ready-for-agent

- [ ] Cabeçalho: "Funis", chips dos funis (substituem o seletor atual), filtro de cards
- [ ] Colunas de ~280px com nome e contagem; rolagem horizontal; no celular, colunas de ~82% da largura
- [ ] Card: foto/iniciais, nome, hora, prévia, `StatusPill` e até 2 `LabelTag`; clique abre a conversa
- [ ] Arrastar entre etapas continua como hoje
- [ ] E2E: trocar de funil pelos chips; o card abre a conversa; arrastar continua funcionando
- [ ] Prints em desktop e celular, nos temas claro e escuro

## Comments
