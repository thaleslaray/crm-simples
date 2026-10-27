# 15: Funis (kanban)

**What to build:** o admin cria vários funis (por exemplo, "Vendas" e "Suporte"), cada um com etapas que ele cria, renomeia, reordena e apaga. A equipe vê cada funil como kanban, adiciona contatos escolhendo a etapa inicial, arrasta cards entre etapas (no computador e no celular), tira contatos do funil e abre a conversa ou a ficha pelo card. Um contato pode estar em vários funis. A ficha mostra e altera os funis e etapas do contato. Movimentações dos colegas aparecem em tempo real. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 14 (Etiquetas e lista de contatos), 04 (Tempo real)

**Status:** ready-for-agent

- [ ] CRUD de funis e etapas só para admin; ordem das etapas editável
- [ ] Apagar etapa com cards exige escolher a etapa de destino
- [ ] Card = (contato, funil, etapa); no máximo um card por contato em cada funil; contato pode estar em vários funis
- [ ] Ordem dos cards dentro da etapa é mantida
- [ ] Arrastar funciona com mouse e toque
- [ ] Filtros do kanban por etiqueta e por responsável da conversa atual
- [ ] Ficha do contato mostra e altera funis e etapas
- [ ] Mudanças publicadas no hub; E2E movendo um card
- [ ] Toda tela nova funciona bem em viewport de celular e de desktop
