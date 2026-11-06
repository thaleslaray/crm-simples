# 03: Ganhou e Perdeu

**What to build:** botões Ganhou/Perdeu no cartão (menu) e na ficha. Ganhou confirma o valor (obrigatório); Perdeu exige motivo da lista fixa (Preço, Sem resposta, Comprou de outro, Sem interesse agora, Sem perfil, Outro) com observação opcional. Fechado sai do quadro; filtro Abertos/Ganhos/Perdidos. Admin reabre (volta à etapa). Grava closedAt e closedById. Spec: histórias 9–12.

**Blocked by:** 02

**Status:** done

- [x] Rotas fechar/reabrir com validação e 403 de reabrir para atendente
- [x] Diálogos de Ganhou (valor) e Perdeu (motivo + observação)
- [x] Filtro de situação no quadro
- [x] Testes de borda + E2E

## Comments

### 2026-11-06
Feito, sem migração (a tabela `deal` já tinha tudo).

Decisões para os tickets 04–07:
- Rotas sob `/api/funnels/:id/deals/:dealId`: `POST /close` com `{status:"ganho", valueCents>0}` ou `{status:"perdido", lostReason, lostNote?<=500}` (400 inválido, 404 inexistente, 409 `negocio_ja_fechado` via UPDATE condicionado a `aberto`); `POST /reopen` só admin (403 atendente, 409 se já aberto), volta ao fim da mesma etapa e limpa `lostReason/lostNote/closedAt/closedById`. Ambas publicam `funnel.changed`. O valor do Ganhou **sobrescreve** `valueCents` do negócio (o relatório do ticket 07 soma `valueCents` dos ganhos); `closedAt`/`closedById` gravados em ambos.
- Mover negócio fechado (`PUT`) responde 409 `negocio_fechado`.
- `GET /:id/board?status=aberto|ganho|perdido` (padrão aberto; valor inválido cai em aberto). Fechados vêm do mais recente para o mais antigo (`closedAt desc`). `CardView` ganhou `dealStatus` (o `status` continua sendo o da conversa), `lostReason`, `lostNote`, `closedAt`, `closedById`. Os filtros de etiqueta/responsável/produto valem para fechados também.
- A ficha (`ContactDealView`) não traz o motivo da perda; se o ticket 04 precisar, acrescentar `lostReason`.
- Evento para a faixa da conversa (spec): não criado aqui; `funnel.changed` já faz a ficha recarregar. A faixa (ticket 04) deve escutar `funnel.changed` e recarregar os negócios do contato.
- Front reaproveitável: `src/web/components/CloseDealDialog.tsx` (`kind: "ganho"|"perdido"`, props `funnelId, dealId, subject, initialValueCents, onClose, onDone`; role dialog, foco no primeiro campo, Esc/fundo/Cancelar fecham, Tab preso, foco volta a quem abriu) e `lostReasonLabel`. `api.closeDeal/reopenDeal`. A faixa da conversa só precisa abrir o diálogo.
- Quadro: select "Filtrar por situação" (Abertos/Ganhos/Perdidos); menu ⋮ do cartão tem Ganhou/Perdeu (abertos) ou Reabrir negócio (admin, fechados); fechado não tem alça de arrastar nem seletor de etapa. Ficha: botões Ganhou/Perdeu nos abertos, Reabrir (admin) nos fechados.
- Testes: `test/funis.test.ts` (bloco "Funis: ganhou e perdeu", 9 testes); helper `closeDealDirect` removido (substituído por `closeDeal`/`reopenDeal` em `test/helpers/funis.ts`). E2E: `e2e/funis.spec.ts` (Ganhou e Perdeu).
