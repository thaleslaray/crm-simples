# 02: Negócio vira o cartão do funil

**What to build:** tabela `deal` substitui `funnel_card` (apagada: começar do zero). O quadro lista negócios abertos; o cartão mostra cliente, produto e valor; "+ Negócio" (escolhe contato, produto e origem, ambos opcionais) no lugar de "Adicionar contato"; filtro por produto; arrastar e mover continuam. Ficha do contato troca o bloco "Funis" por "Negócios" (abertos e fechados). Spec: histórias 3–8 e 14.

**Blocked by:** 01

**Status:** done

- [x] Migração: cria `deal` (campos da spec), apaga `funnel_card`
- [x] API do quadro devolve negócios (com produto, valor, origem, dados do contato e da conversa como hoje); criar, mover, editar produto/valor/origem, remover
- [x] Valor pré-preenchido com o preço do produto, editável
- [x] Origem manual: campanhas ativas + Indicação, Orgânico, Cliente antigo, Outro, ou vazia
- [x] Filtro por produto no quadro; responsável = assignee da conversa
- [x] Ficha: bloco "Negócios"
- [x] Testes de borda + E2E (dois negócios para o mesmo contato; arrastar)

## Comments

### 2026-11-06
Feito. Migração `0021_negocios`: cria `deal` com todos os campos da spec e apaga `funnel_card`. `originCampaignId` é text nullable **sem FK**: o ticket 05 decide se adiciona (SQLite exige recriar a tabela para acrescentar FK; se for só índice/validação na rota, não precisa migração). `sourceMessageId` tem índice único (vários null).

Decisões para os tickets 03–07:
- Rotas em `src/worker/funnels.ts`, sob `/api/funnels/:id`: `POST /deals {contactId, stageId, productId?, valueCents?, originKind?}` (201 `{deal:{id}}`), `PATCH /deals/:dealId` (produto, valor, origem; ao menos um campo), `PUT /deals/:dealId {stageId, index?}` (mover), `DELETE /deals/:dealId`. Todas publicam `funnel.changed`.
- Criar: produto precisa existir e estar ativo (404 senão); sem `valueCents` e com produto, o servidor usa `priceCents`; `valueCents: null` explícito fica sem valor. Editar o produto NÃO mexe no valor (o front pré-preenche ao escolher produto). Valor: inteiro >= 0.
- `originKind` aceito pela rota manual: `indicacao|organico|cliente_antigo|outro|null`. `campanha` é recusado (400): só a criação automática (ticket 05) grava `campanha` + `originCampaignId` direto no banco; o ticket 05 deve acrescentar as campanhas ativas à lista manual (ex.: `originCampaignId` no corpo, com `originKind` virando `campanha`) e o front em `DealFields.tsx` (`MANUAL_ORIGINS`).
- Quadro `GET /:id/board`: só negócios `aberto`; filtros `label`, `assignee`, `product=none|<id>`. Cada cartão traz `dealId, productId, productName, valueCents, originKind` além dos dados do contato/conversa de antes. O ticket 03 acrescenta o filtro de situação (hoje fixo em `aberto`) e as rotas de fechar/reabrir (`status`, `lostReason`, `lostNote`, `closedAt`, `closedById` já existem na tabela). Fechado continua na etapa onde estava (`stageId` mantido), então reabrir pode voltar sem coluna extra.
- Posição (`position`) é compartilhada por todos os negócios da etapa, inclusive fechados; mover/apagar etapa move todos (fechados também) para o destino, nunca os apaga.
- Ficha: `GET /api/contacts/:id` devolve `deals` (no lugar de `funnels`): `{id, funnelId, funnelName, stageId, stageName, productId, productName, valueCents, status, originKind}`, do mais antigo ao mais novo; produto arquivado continua com o nome.
- Responsável = assignee da conversa do contato (nada novo no negócio).
- Front: `src/web/components/DealFields.tsx` (produto, valor com máscara, origem; `useActiveProducts`) é reaproveitável pela faixa da conversa (ticket 04); `api.addDeal/moveDeal/editDeal/removeDeal` em `src/web/api.ts`. Quadro: botão "+ Negócio" (busca contato, etapa, produto, valor, origem), filtro por produto, cartão mostra produto e valor, menu "Remover negócio". Ficha: bloco "Negócios do contato" (todos, com situação), troca de etapa nos abertos e "+ Negócio" (escolhe funil, etapa, produto, valor, origem).
- Testes: `test/funis.test.ts` (28), helpers `addDeal/newDeal/editDeal/moveDeal/removeDeal/closeDealDirect` em `test/helpers/funis.ts` (`closeDealDirect` fecha direto no banco até o ticket 03 existir). E2E: `e2e/funis.spec.ts` (produto, valor pré-preenchido, dois negócios do mesmo cliente, filtro por produto, arrastar, ao vivo).
