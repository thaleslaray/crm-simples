# 15: Funis (kanban)

**What to build:** o admin cria vários funis (por exemplo, "Vendas" e "Suporte"), cada um com etapas que ele cria, renomeia, reordena e apaga. A equipe vê cada funil como kanban, adiciona contatos escolhendo a etapa inicial, arrasta cards entre etapas (no computador e no celular), tira contatos do funil e abre a conversa ou a ficha pelo card. Um contato pode estar em vários funis. A ficha mostra e altera os funis e etapas do contato. Movimentações dos colegas aparecem em tempo real. Spec: `.scratch/crm-whatsapp-v1/spec.md`.

**Blocked by:** 14 (Etiquetas e lista de contatos), 04 (Tempo real)

**Status:** done

- [x] CRUD de funis e etapas só para admin; ordem das etapas editável
- [x] Apagar etapa com cards exige escolher a etapa de destino
- [x] Card = (contato, funil, etapa); no máximo um card por contato em cada funil; contato pode estar em vários funis
- [x] Ordem dos cards dentro da etapa é mantida
- [x] Arrastar funciona com mouse e toque
- [x] Filtros do kanban por etiqueta e por responsável da conversa atual
- [x] Ficha do contato mostra e altera funis e etapas
- [x] Mudanças publicadas no hub; E2E movendo um card
- [x] Toda tela nova funciona bem em viewport de celular e de desktop

## Comments

2026-10-28: implementado test-first. Borda: test/funis.test.ts (20 testes: CRUD só admin, ordem das etapas, apagar etapa com destino, um card por contato por funil, ordem dos cards, filtros por etiqueta e responsável, ficha, eventos funnel.changed). E2E: e2e/funis.spec.ts (desktop com mouse, celular com toque via CDP; colega vê o card mover ao vivo; ficha; apagar etapa com cards). Migração 0014 só cria tabelas (funnel, funnel_stage, funnel_card). Arrastar usa Pointer Events pela alça do card; o card também tem seletor "Mover para" como alternativa. Reordenar etapas é por botões subir/descer. Ficha abre pelo card em /conversas/:id?ficha=1. Fora do escopo: autoscroll vertical dentro da coluna, ordenação de funis.
