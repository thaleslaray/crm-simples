# 07: Relatório por campanha

**What to build:** tela Relatório (só admin). Período: este mês, mês passado, personalizado (por createdAt do negócio para "criados"; closedAt para ganhos/perdidos/faturado). Uma linha por campanha (e por origem fixa: Indicação, Orgânico, Cliente antigo, Outro) com criados, ganhos, perdidos, faturado (soma de valor dos ganhos) e conversão (ganhos ÷ criados); linha "Sem origem"; total; filtro por produto. Spec: história 21.

**Blocked by:** 03, 05

**Status:** done

- [x] Rota `GET /api/reports/campaigns?from&to&product` (403 para atendente)
- [x] Tela com tabela, números com `tabular-nums`, R$ formatado
- [x] Testes de borda com dados montados (períodos e filtro de produto) + E2E

## Comments

### 2026-11-06
Feito, sem migração.

- Rota `GET /api/reports/campaigns?from=<ms>&to=<ms>&product=<id|none>` em `src/worker/reports.ts` (só admin, papel relido no D1; 403 atendente; 400 `periodo_invalido` se faltar, não for inteiro não negativo ou `from > to`). Limites inclusivos. Uma consulta agregada por SQL (`GROUP BY originKind, originCampaignId`, `LEFT JOIN campaign` para o nome, inclusive de arquivada); o JS só rotula e soma poucas linhas.
- Regras: criados = `createdAt` no período; ganhos/perdidos = `closedAt` no período com o status; faturado = soma de `valueCents` dos ganhos no período; conversão = ganhos ÷ criados (`null` sem criados; pode passar de 100% porque criados e ganhos contam por datas diferentes, e a tela avisa disso). Reaberto não conta (status volta a aberto). Linhas zeradas somem. Ordem: campanhas por nome, Indicação, Orgânico, Cliente antigo, Outro, Sem origem; `total` no fim. `product=none` = sem produto; id de produto arquivado funciona.
- Resposta: `{rows: [{key, label, created, won, lost, revenueCents, conversion}], total}`. `key` = `campanha:<id>` | `indicacao` | `organico` | `cliente_antigo` | `outro` | `sem_origem`. Campanha com `originKind="campanha"` mas sem campanha encontrada cai em "Sem origem".
- Tela `src/web/pages/ReportPage.tsx`, rota `/relatorio`, entrada em Configurações ("Relatório de campanhas"): a barra de ícones já tem 4 itens fixos e o relatório é de uso ocasional, então Configurações (que já abriga Produtos e Campanhas) é o lugar mais simples. Períodos Este mês (padrão), Mês passado e Personalizado (duas datas); meses no fuso do navegador (fim do dia 23:59:59.999). Atualiza em `funnel.changed`. Tabela com `tabular-nums`, `formatMoney`, total destacado; no celular rola dentro do próprio bloco.
- Testes: `test/relatorio.test.ts` (9: 403/401, período inválido, números por campanha, origens fixas e ordem, limites inclusivos e fechado fora do período, reaberto, arquivada, filtro de produto, período vazio) com helper `test/helpers/relatorio.ts` (ajusta datas direto no D1). E2E `e2e/relatorio.spec.ts` (admin vê a linha com números certos, claro e escuro; vazio; personalizado; atendente sem entrada e 403). Prints em `.wrangler/prints07/`.
