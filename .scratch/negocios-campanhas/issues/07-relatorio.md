# 07: Relatório por campanha

**What to build:** tela Relatório (só admin). Período: este mês, mês passado, personalizado (por createdAt do negócio para "criados"; closedAt para ganhos/perdidos/faturado). Uma linha por campanha (e por origem fixa: Indicação, Orgânico, Cliente antigo, Outro) com criados, ganhos, perdidos, faturado (soma de valor dos ganhos) e conversão (ganhos ÷ criados); linha "Sem origem"; total; filtro por produto. Spec: história 21.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Rota `GET /api/reports/campaigns?from&to&product` (403 para atendente)
- [ ] Tela com tabela, números com `tabular-nums`, R$ formatado
- [ ] Testes de borda com dados montados (períodos e filtro de produto) + E2E

## Comments
